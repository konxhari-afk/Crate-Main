export interface SpotifyTrackCandidate {
  title: string;
  artist: string;
  durationSec: number;
}

export interface ParsedSpotifyPlaylist {
  id: string;
  name: string;
  description: string;
  coverUrl: string;
  accessToken?: string;
  tracks: SpotifyTrackCandidate[];
}

export function extractSpotifyPlaylistId(input: string): string | null {
  const trimmed = input.trim();
  if (!trimmed) return null;

  const uriMatch = trimmed.match(/^spotify:playlist:([a-zA-Z0-9]+)$/i);
  if (uriMatch) return uriMatch[1];

  const urlMatch = trimmed.match(
    /open\.spotify\.com\/(?:embed\/|intl-[a-z-]+\/)?playlist\/([a-zA-Z0-9]+)/i
  );
  if (urlMatch) return urlMatch[1];

  if (/^[a-zA-Z0-9]{18,26}$/.test(trimmed)) {
    return trimmed;
  }

  return null;
}

export function parseSpotifyEmbedHtml(
  html: string,
  playlistId = ''
): ParsedSpotifyPlaylist | null {
  const nextDataMatch = html.match(
    /<script id="__NEXT_DATA__" type="application\/json">([\s\S]*?)<\/script>/
  );
  if (!nextDataMatch) return null;

  try {
    const parsed = JSON.parse(nextDataMatch[1]) as {
      props?: {
        pageProps?: {
          state?: {
            data?: {
              entity?: {
                name?: string;
                subtitle?: string;
                coverArt?: { sources?: Array<{ url?: string }> };
                trackList?: Array<{
                  title?: string;
                  subtitle?: string;
                  duration?: number;
                }>;
              };
            };
            settings?: {
              session?: {
                accessToken?: string;
              };
            };
          };
        };
      };
    };

    const entity = parsed.props?.pageProps?.state?.data?.entity;
    if (!entity) return null;

    const rawTracks = Array.isArray(entity.trackList) ? entity.trackList : [];
    const tracks: SpotifyTrackCandidate[] = rawTracks
      .map((item) => ({
        title: String(item.title || '').trim(),
        artist: String(item.subtitle || 'Unknown Artist')
          .replace(/\u00a0/g, ' ')
          .trim(),
        durationSec:
          typeof item.duration === 'number' && item.duration > 0
            ? Math.round(item.duration / 1000)
            : 210,
      }))
      .filter((t) => Boolean(t.title));

    const coverUrl =
      entity.coverArt?.sources?.[0]?.url ||
      '/src/assets/images/crate_cover_blend_1794839825114.jpg';

    return {
      id: playlistId,
      name: String(entity.name || 'Imported Spotify Playlist').trim(),
      description: entity.subtitle
        ? `Imported from Spotify · ${entity.subtitle}`
        : 'Imported from Spotify playlist',
      coverUrl,
      accessToken: parsed.props?.pageProps?.state?.settings?.session?.accessToken,
      tracks,
    };
  } catch {
    return null;
  }
}

export function parseManualTrackLines(rawText: string): SpotifyTrackCandidate[] {
  const lines = rawText
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);

  const out: SpotifyTrackCandidate[] = [];
  for (const line of lines) {
    const cleaned = line.replace(/^\d+[.)]\s*/, '').trim();
    const parts = cleaned.split(/\s+[-–—]\s+/);
    if (parts.length >= 2) {
      const title = parts[0].trim();
      const artist = parts.slice(1).join(' - ').trim();
      if (title) {
        out.push({ title, artist: artist || 'Unknown Artist', durationSec: 210 });
      }
    } else if (cleaned) {
      out.push({ title: cleaned, artist: 'Unknown Artist', durationSec: 210 });
    }
  }
  return out;
}
