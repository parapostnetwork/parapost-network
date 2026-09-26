-- REVIEW ONLY. Apply after deploying the function, configuring its secrets,
-- and approving production writes. Never paste credential values into Git.
-- Create Vault entries live_sync_url (the Edge Function's HTTPS URL) and
-- live_sync_secret (the same random secret as the function's LIVE_SYNC_SECRET).
create extension if not exists pg_cron;
create extension if not exists pg_net with schema extensions;

do $$
begin
  if not exists (select 1 from vault.decrypted_secrets where name = 'live_sync_url')
     or not exists (select 1 from vault.decrypted_secrets where name = 'live_sync_secret') then
    raise exception 'Configure live sync URL and authentication secret in Vault first';
  end if;
end;
$$;

-- Re-running with the same name updates this job, rather than adding duplicates.
select cron.schedule('sync-youtube-live', '* * * * *', $job$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'live_sync_url'),
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-live-sync-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'live_sync_secret')
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 55000
  );
$job$);

-- Rollback scheduler: select cron.unschedule('sync-youtube-live');
