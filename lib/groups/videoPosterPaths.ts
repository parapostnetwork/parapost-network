/**
 * Group poster naming. This does NOT authorize access.
 * The server and storage policy must verify the parent
 * record is a video and the user has Group access.
 */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function groupVideoPosterPath(videoPath: string): string {
  const segments = videoPath.split('/');
  if (
    segments.length !== 5 ||
    !UUID.test(segments[0]) ||
    segments[1] !== 'posts' ||
    !segments.slice(2).every(segment => UUID.test(segment))
  ) {
    throw new Error('Invalid Group video storage path');
  }
  return `${videoPath}.poster.jpg`;
}

export function isPosterForGroupVideo(
  posterPath: string,
  videoPath: string
): boolean {
  try {
    return posterPath === groupVideoPosterPath(videoPath);
  } catch {
    return false;
  }
}
