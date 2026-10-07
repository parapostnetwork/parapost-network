-- Allow authenticated Reel owners to delete their own
-- current Reel video and poster Storage objects.

DROP POLICY IF EXISTS "Authenticated users can delete own reels"
ON storage.objects;

CREATE POLICY "Authenticated users can delete own reels"
ON storage.objects
FOR DELETE
TO authenticated
USING (
  bucket_id = 'reels'
  AND owner_id = auth.uid()::text
);

DROP POLICY IF EXISTS "Authenticated users can delete own reel posters"
ON storage.objects;

CREATE POLICY "Authenticated users can delete own reel posters"
ON storage.objects
FOR DELETE
TO authenticated
USING (
  bucket_id = 'reel-posters'
  AND owner_id = auth.uid()::text
);
