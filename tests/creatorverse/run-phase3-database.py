"""Disposable local PostgreSQL only. No Supabase CLI, existing DB, TCP, or remote writes.
Run: python3 tests/creatorverse/run-phase3-database.py
Requires installed initdb, pg_ctl and psql. Test-only fixtures model Auth/Storage;
this is PostgreSQL RLS verification, not a hosted Supabase integration test.
"""
from pathlib import Path
import os
import shutil
import subprocess
import tempfile
import sys
from concurrent.futures import ThreadPoolExecutor

root = Path(__file__).resolve().parents[2]
env = {key: value for key, value in os.environ.items() if not key.startswith('PG')}
binaries = {name: shutil.which(name) for name in ('initdb', 'pg_ctl', 'psql')}
if not all(binaries.values()):
    raise SystemExit('Local PostgreSQL tools unavailable; no database tests executed.')
with tempfile.TemporaryDirectory(prefix='cv-phase3-db-') as directory:
    scratch = Path(directory)
    data = scratch / 'data'
    started = False
    def run(command):
        result = subprocess.run(command, cwd=root, env=env, text=True, stdout=subprocess.PIPE, stderr=subprocess.STDOUT)
        if result.returncode:
            print(result.stdout)
            raise RuntimeError(f'Local database check exited {result.returncode}')
        return result.stdout
    try:
        run([binaries['initdb'], '-D', str(data), '-A', 'trust', '--no-locale', '--encoding=UTF8'])
        run([binaries['pg_ctl'], '-D', str(data), '-l', str(scratch/'postgres.log'), '-o', f"-k {scratch} -p 55439 -c listen_addresses=''", 'start'])
        started = True
        command = [binaries['psql'], '-X', '-h', str(scratch), '-p', '55439', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1']
        for file in ['tests/creatorverse/phase3-bootstrap.sql', 'docs/sql-drafts/creatorverse-foundation-schema.sql',
                     'docs/sql-drafts/creatorverse-foundation-rls.sql', 'docs/sql-drafts/creatorverse-phase3-integration-DRAFT.sql',
                     'tests/creatorverse/phase3-local.sql']:
            command.extend(['-f', file])
        if '--phase4' in sys.argv:
            command.extend(['-f', 'docs/sql-drafts/creatorverse-phase4-social-DRAFT.sql', '-f', 'tests/creatorverse/phase4-local.sql'])
        print(run(command))
        base = [binaries['psql'], '-X', '-h', str(scratch), '-p', '55439', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1']
        run(base + ['-f', 'tests/creatorverse/phase3-concurrency.sql'])
        actor = "SET request.jwt.claim.sub='10000000-0000-4000-8000-000000000001'; SET ROLE authenticated;"
        like = "SELECT creatorverse_private.interact('40000000-0000-4000-8000-000000000004','50000000-0000-4000-8000-000000000005','like');"
        share = "SELECT creatorverse_private.interact('40000000-0000-4000-8000-000000000004','50000000-0000-4000-8000-000000000005','share',NULL,'Retry','60000000-0000-4000-8000-000000000006');"
        with ThreadPoolExecutor(max_workers=4) as pool:
            list(pool.map(lambda _: run(base + ['-c', actor + like + share]), range(8)))
        counts = run(base + ['-Atc', "SELECT (SELECT count(*) FROM public.creatorverse_post_likes)||','||(SELECT count(*) FROM public.creatorverse_shares);"]).strip()
        if counts != '1,1':
            raise RuntimeError(f'Concurrent duplicate protection failed: {counts}')
        print('PASS: 8 concurrent authenticated like/share retries produce exactly 1 like and 1 canonical share.')
        if '--phase4' in sys.argv:
            run(base + ['-c', 'GRANT EXECUTE ON FUNCTION creatorverse_private.interact_once(uuid,uuid,text,uuid,text,uuid) TO authenticated;'])
            comment = "SELECT creatorverse_private.interact_once('40000000-0000-4000-8000-000000000004','50000000-0000-4000-8000-000000000005','comment',NULL,'Concurrent retry','60000000-0000-4000-8000-000000000008');"
            with ThreadPoolExecutor(max_workers=4) as pool:
                list(pool.map(lambda _: run(base + ['-c', actor + comment]), range(8)))
            counts = run(base + ['-Atc', 'SELECT count(*) FROM public.creatorverse_comments;']).strip()
            if counts != '1':
                raise RuntimeError(f'Concurrent comment retry failed: {counts}')
            print('PASS: 8 concurrent comment retries produce exactly 1 comment.')
    finally:
        if started:
            subprocess.run([binaries['pg_ctl'], '-D', str(data), '-m', 'fast', 'stop'], env=env, check=True, stdout=subprocess.DEVNULL)
