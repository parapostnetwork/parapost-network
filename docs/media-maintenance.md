# Phase E/F: offline media preparation and conservative cleanup inventory

This is operator tooling, not application runtime code. It has **no Supabase
connection, credentials, HTTP client, production CLI, or delete operation**.
Nothing runs on deployment. No migration is needed. Production backfill and
cleanup require separate approval; this implementation performs neither.

## Inventory evidence and reference coverage

Checked-in schema: `supabase/migrations/20260730023227_remote_schema.sql`.

| Media | Known reference paths | E policy |
| --- | --- | --- |
| post-images | `posts.image_url`; `post_images.image_url` AND `storage_path`; some `profiles.avatar_url` | Post master 2048 long edge, thumbnail 1024; avatar-only use gets avatar policy |
| avatars | `profiles.avatar_url`; derived notification/author cards | Master 512, thumbnail 192 long edge |
| profile-covers | `profiles.cover_url` | 1920 width, maximum height 8192, no added thumbnail |
| reel-posters | `reels.poster_url` | 1280 long edge, no added thumbnail |
| parachat-images | `direct_messages.image_path`, copied forwarded messages, signed URLs | Report only: private access and message metadata need a separate design |
| achievement-icons | achievement metadata and code-resolved icons | Report only |
| reels / reels-videos | `reels.video_url`, historical paths and possible shared URLs | Report only; no video decoding/transcoding |

Also inspect `profile_showcases.media_url`, `live_streams.thumbnail_url`, all
exported nested JSON/text fields, comments, notifications, and any additional
live tables/views/auth metadata holding media. The scanner conservatively scans
all supplied row values. Unknown/signed/embedded references block rewriting.
Paired post URL/storage-path changes are grouped into one conditional row update.
An active Phase D master also marks its deterministic thumbnail active.

An export must include the named reference tables even if empty, with string row
IDs. This is a **structural check, not proof of export completeness**. RLS-filtered
exports, pagination omissions, external consumers, caches, auth metadata and
concurrent changes can invalidate non-reference conclusions. Missing/malformed
coverage blocks preparation. No production inventory was collected in this task.
Largest actual buckets/hot objects cannot be ranked without production size and
request data. Prioritize post images and avatars for frequent delivery, then large
covers and historical Reel posters; validate this ordering against real metrics.

## Local input

Use Node 22+ and the checkout's already installed `sharp` (currently 0.34.5,
provided by Next). No package/configuration change was introduced. Encoder
version changes may change bytes; existing outputs must match checksums or stop.

JSON snapshot shape (all `referenceTables` exported by maintenance.mjs required):

```json
{
  "projectUrl": "https://YOUR-PROJECT.supabase.co",
  "objects": [{"bucket":"post-images","path":"USER/old.png","sourceFile":"old.png","sha256":"OPTIONAL_SHA256"}],
  "tables": {
    "posts":[{"id":"POST_ID","image_url":"EXACT_PUBLIC_URL"}],
    "post_images":[], "profiles":[], "reels":[], "direct_messages":[],
    "profile_showcases":[], "live_streams":[], "achievements":[],
    "notifications":[], "comments":[]
  }
}
```

Do not invent IDs/rows, assume absent tables are empty, or export secrets. Keep
snapshots/reports/source files outside the Git checkout in a private directory.
The input snapshot is capped at 20 MiB. Preserve complete reference coverage when
splitting object inventory batches; never split away reference tables silently.

Default inventory only (no output writes, no image reads):

```sh
node tools/media/cli.mjs --snapshot /ABSOLUTE/snapshot.json --limit 10 --offset 0
```

Prepare **local copies only**, using already downloaded source files:

```sh
node tools/media/cli.mjs --snapshot /ABSOLUTE/snapshot.json --mode prepare \
  --sources /ABSOLUTE/source-files --output /ABSOLUTE/prepared-output \
  --limit 10 --offset 0
```

Maximum 100 objects/batch; sorted bucket/path order, `nextOffset` for the next
batch of the same immutable snapshot. Every object gets a status/reason. Missing
source, malformed row, transformation or output failure does not stop reporting
other objects. Outputs use create-only writes; reruns verify identical files.
Sources must resolve inside the approved source directory. Reports and artifacts
are content-addressed; no old outputs are overwritten. Reports contain reference
locations/URLs and should be treated as private operational data.

JPEG/PNG/still WebP only; 25 MiB, 50 MP, 16384-side input limits. Server-native
Sharp auto-orients, preserves alpha, never upscales, and uses WebP quality 82.
Final byte ceilings are 2,000,000 for avatars and 9,000,000 for other supported
images (the poster ceiling is a conservative tooling limit, not a bucket claim).
Originals that are already smaller and in policy may be retained as master bytes.
Animated/unsupported media fails safely. No FFmpeg/WASM. Both generated images
are fully decoded to verify dimensions before any manifest can be published.
New master never exceeds source bytes; a thumbnail must be smaller than master.
No-benefit objects are skipped. Small sources and portrait/square/landscape cases
are supported. Existing Phase D and E marked paths are skipped on later scans.

Deterministic E names include policy, source identity and SHA256; D-compatible
master suffixes describe the successful thumbnail. Unchanged source reruns map to
the same outputs. The source path is never overwritten. Partial prepared files
are harmless and reusable on rerun. A failed object receives no switch plan.

## Measurement

Each prepared record reports original/master/thumbnail bytes, master delivery
reduction, additional storage bytes, artifacts/checksums, conditional reference
patches and inverse rollback patches. Summary counts distinguish prepared,
candidate, skipped, failed and already-optimized. Classification distinguishes
active, possible orphan and unknown. Add thumbnail bytes to storage: **originals
are retained**, so preparation/copying initially increases storage. These are
file-size measurements, not measured cached-egress savings. Actual delivery
savings depend on traffic, browser selection and cache behavior. The supplied
19.723 GB cached / 1.017 GB regular checkpoint is user-reported, not remeasured.

## Later production procedure — separate approval required

1. Obtain complete, read-only, paginated storage/reference exports using an
   approved existing privileged environment. Review unknown/malformed rows and
   confirm policy/bucket access. Download only an approved small pilot's sources.
2. Run dry-run, then local preparation. Review artifacts visually (orientation,
   transparency, detail), measured savings and every conditional patch. Save
   original/source hashes and the immutable report in durable private storage.
3. Implement/review a production adapter separately before use. This task does
   **not** supply one, and CLI cannot publish. `publishPrepared` defines and tests
   the transport-independent protocol with mock storage only. Its default is
   dry-run; execution requires mode `publish-approved` plus the exact approval
   sentinel `COPY_VERIFY_CAS_KEEP_ORIGINAL` supplied by the operator.
4. Adapter contract: durable write-ahead `journal`; `readObject`; local
   `readArtifact`; create-only `putIfAbsent` (existing objects must subsequently
   match); `readRow`; and **atomic per-row compareAndSet** checking ALL expected
   fields. Transport requests need deadlines, explicit failure propagation,
   existing authorization and bounded retries. Never use overwrite/upsert.
5. Revalidate source hash, upload copies, read back and hash EVERY copy, journal
   verification, then CAS references. Read each row back and journal success.
   Preserve `post_images.image_url/storage_path` together. A changed row is a
   conflict, not permission to overwrite a user's newer upload. Partial row-set
   switching is possible; both old/new media remain available.
6. Stop the object on uncertain CAS/upload; inspect durable journal and current
   rows. Reruns recognize already-switched rows and identical objects. Never infer
   failure means no write happened. Reconcile before resuming another batch.
7. Test pilot on mobile/desktop and full viewers; measure subsequent egress, then
   seek approval for larger bounded batches. No automated production backfill.

## F cleanup and rollback

**No current category can be deterministically classified SAFE TO DELETE.**
Classification is `ACTIVE/REFERENCED`, `POSSIBLY ORPHANED — DO NOT DELETE`, or
`UNKNOWN — DO NOT DELETE`. Unreferenced historical videos, old avatars/covers,
partial uploads, generated duplicates and abandoned posters remain untouched.
The tool has no delete adapter and rejects destructive CLI flags even when
explicitly requested. Snapshot age or a grace period alone is not proof.

Any future deletion implementation needs separately reviewed comprehensive
reference proof including implicit thumbnail dependencies, rollback manifests,
client/public URL retention and concurrency exclusion. Until then, cleanup means
reporting candidates only. Do not delete originals after successful replacement.

Rollback: use each manifest's inverse patches, checking the current field still
matches the replacement. Group paired fields atomically. Verify original bytes
are still available, apply approved conditional reversals, reread rows, and record
results. Never overwrite a newer user change. Keep BOTH generations after
rollback; no removal is part of rollback. No production rollback command is
shipped because no production adapter or production writes exist here.
