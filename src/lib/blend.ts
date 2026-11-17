import type { Track } from '../types/crate';

/**
 * Interleaves two playlists (1 from A, 1 from B, ...), deduplicates by track id
 * while preserving the interleaved pool, and applies an unbiased Fisher-Yates shuffle.
 */
export function blendPlaylists(
  playlistA: Track[],
  playlistB: Track[],
  rng: () => number = Math.random
): Track[] {
  const interleaved: Track[] = [];
  const seen = new Set<string>();
  const maxLen = Math.max(playlistA.length, playlistB.length);

  for (let i = 0; i < maxLen; i++) {
    const trackA = playlistA[i];
    if (trackA && !seen.has(trackA.id)) {
      seen.add(trackA.id);
      interleaved.push(trackA);
    }
    const trackB = playlistB[i];
    if (trackB && !seen.has(trackB.id)) {
      seen.add(trackB.id);
      interleaved.push(trackB);
    }
  }

  return fisherYatesShuffle(interleaved, rng);
}

/**
 * In-place-safe Fisher-Yates shuffle returning a new array.
 */
export function fisherYatesShuffle<T>(
  items: readonly T[],
  rng: () => number = Math.random
): T[] {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    const temp = result[i];
    result[i] = result[j];
    result[j] = temp;
  }
  return result;
}
