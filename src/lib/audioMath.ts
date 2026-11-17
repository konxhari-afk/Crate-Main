import type {
  ArtistProfile,
  DownloadedTrackRecord,
  EqualizerBand,
  PlayHistoryRecord,
  Playlist,
  Track,
  UserPreferences,
} from '../types/crate';

export const FACTORY_STUDIO_EQ_BANDS: EqualizerBand[] = [
  { frequency: 60, label: '60 Hz', type: 'lowshelf', gain: 2.8 },
  { frequency: 230, label: '230 Hz', type: 'peaking', gain: 1.2 },
  { frequency: 910, label: '910 Hz', type: 'peaking', gain: -0.6 },
  { frequency: 3600, label: '3.6 kHz', type: 'peaking', gain: 2.0 },
  { frequency: 14000, label: '14 kHz', type: 'highshelf', gain: 3.0 },
];

export const DEFAULT_EQ_BANDS = FACTORY_STUDIO_EQ_BANDS;

export interface HistoryPlayEntry {
  videoId: string;
  title: string;
  artist: string;
  language?: string;
  playedAt: number;
}

export function recordUserPlayHistory(
  existing: HistoryPlayEntry[],
  entry: Omit<HistoryPlayEntry, 'playedAt'>,
  maxItems = 25
): HistoryPlayEntry[] {
  const deduped = existing.filter((item) => item.videoId !== entry.videoId);
  return [{ ...entry, playedAt: Date.now() }, ...deduped].slice(0, maxItems);
}

export const WEEKLY_TOP_PLAYLIST_ID = 'pl-weekly-top-tracks';
export const MONTHLY_TOP_PLAYLIST_ID = 'pl-monthly-top-tracks';
export const DOWNLOADS_PLAYLIST_ID = 'pl-internal-downloads';

/**
 * Builds the strict app-private sandbox file path inside @capacitor/filesystem Directory.Data.
 * Never targets external OS directories or public Music folders.
 */
export function buildInternalSandboxPath(videoId: string): string {
  const safeId = String(videoId || 'track')
    .trim()
    .replace(/[^a-zA-Z0-9_-]/g, '_');
  return `tracks/${safeId || 'track'}.mp3`;
}

export function buildInternalSandboxUri(videoId: string): string {
  return `Directory.Data/${buildInternalSandboxPath(videoId)}`;
}

export function upsertDownloadedTrackRecord(
  existing: DownloadedTrackRecord[],
  record: DownloadedTrackRecord
): DownloadedTrackRecord[] {
  const filtered = existing.filter((item) => item.videoId !== record.videoId);
  return [record, ...filtered];
}

export function removeDownloadedTrackRecord(
  existing: DownloadedTrackRecord[],
  videoId: string
): DownloadedTrackRecord[] {
  return existing.filter((item) => item.videoId !== videoId);
}

export function findDownloadedTrackRecord(
  records: DownloadedTrackRecord[],
  videoId: string
): DownloadedTrackRecord | null {
  const clean = String(videoId || '').trim();
  if (!clean) return null;
  return records.find((item) => item.videoId === clean) || null;
}

/**
 * Smart Audio Interceptor pure resolver: checks downloaded_tracks first.
 * If found, returns mode 'offline-sandbox' with the internal localFileUri;
 * otherwise falls back to 'network-stream' via /api/stream.
 */
export function resolveSmartPlaybackSource(
  videoId: string,
  downloadedTracks: DownloadedTrackRecord[]
): {
  mode: 'offline-sandbox' | 'network-stream';
  localFileUri: string | null;
  sandboxPath: string | null;
  streamEndpoint: string;
} {
  const match = findDownloadedTrackRecord(downloadedTracks, videoId);
  const cleanId = String(videoId || '').trim();
  if (match) {
    return {
      mode: 'offline-sandbox',
      localFileUri: match.localFileUri,
      sandboxPath: match.sandboxPath || buildInternalSandboxPath(cleanId),
      streamEndpoint: `/api/stream?videoId=${encodeURIComponent(cleanId)}`,
    };
  }
  return {
    mode: 'network-stream',
    localFileUri: null,
    sandboxPath: null,
    streamEndpoint: `/api/stream?videoId=${encodeURIComponent(cleanId)}`,
  };
}

/**
 * Builds the dedicated 'Downloads' playlist pulling exclusively from the internal
 * `downloaded_tracks` table so only offline-ready sandboxed tracks appear.
 */
export function buildDownloadsPlaylist(records: DownloadedTrackRecord[]): Playlist {
  const tracks: Track[] = records.map((rec) => ({
    id: rec.videoId,
    videoId: rec.videoId,
    title: rec.title,
    artist: rec.artist,
    album: rec.album || 'Internal App Sandbox',
    duration: rec.duration || 210,
    artworkUrl:
      rec.albumArt || '/src/assets/images/crate_cover_amber_vinyl_1794853068265.jpg',
    source: 'offline-sandbox',
    localFileUri: rec.localFileUri,
    isOfflineDownloaded: true,
  }));

  const totalBytes = records.reduce((acc, r) => acc + (r.sizeBytes || 0), 0);
  const sizeMb = (totalBytes / (1024 * 1024)).toFixed(1);

  return {
    id: DOWNLOADS_PLAYLIST_ID,
    name: 'Downloads',
    description:
      tracks.length > 0
        ? `${tracks.length} offline ${tracks.length === 1 ? 'track' : 'tracks'} stored in app-private sandbox (Directory.Data · ${sizeMb} MB).`
        : 'Songs you download are encrypted & sandboxed inside Directory.Data/tracks/[videoId].mp3 for instant offline playback.',
    coverUrl: '',
    coverImages: tracks.slice(0, 4).map((t) => t.artworkUrl),
    accent: 'downloads-gradient',
    category: 'Offline App Sandbox · Directory.Data',
    tags: ['Downloads', 'Offline', 'Sandbox', 'Directory.Data'],
    tracks,
    isDownloadsPlaylist: true,
  };
}

/**
 * Automatically deletes/prunes `play_history` entries older than `maxAgeDays` (default 30 days)
 * so storage remains lightweight and Monthly/Weekly Top Tracks refresh cleanly on schedule.
 */
export function pruneExpiredPlayHistory(
  entries: PlayHistoryRecord[],
  nowMs = Date.now(),
  maxAgeDays = 30
): { active: PlayHistoryRecord[]; removedCount: number } {
  const cutoffMs = nowMs - maxAgeDays * 24 * 60 * 60 * 1000;
  const active: PlayHistoryRecord[] = [];
  let removedCount = 0;

  for (const item of entries) {
    const ts = Date.parse(item.played_at);
    if (!Number.isFinite(ts) || ts < cutoffMs) {
      removedCount += 1;
    } else {
      active.push(item);
    }
  }

  return { active, removedCount };
}

/**
 * Queries `play_history` for a specific user over the last `windowDays` (7 for Weekly, 30 for Monthly),
 * grouping and counting by `video_id` to find and rank the most played songs.
 */
export function aggregateTopTracksByWindow(
  entries: PlayHistoryRecord[],
  userId: string,
  windowDays: 7 | 30,
  nowMs = Date.now(),
  limit = 25
): Track[] {
  const cutoffMs = nowMs - windowDays * 24 * 60 * 60 * 1000;
  const grouped = new Map<
    string,
    {
      videoId: string;
      title: string;
      artist: string;
      albumArt: string;
      duration: number;
      album: string;
      count: number;
      latestPlayedAtMs: number;
    }
  >();

  for (const entry of entries) {
    if (entry.user_id !== userId) continue;
    const playedMs = Date.parse(entry.played_at);
    if (!Number.isFinite(playedMs) || playedMs < cutoffMs || playedMs > nowMs + 60_000) {
      continue;
    }
    const vid = String(entry.video_id || '').trim();
    if (!vid) continue;

    const existing = grouped.get(vid);
    if (!existing) {
      grouped.set(vid, {
        videoId: vid,
        title: entry.title,
        artist: entry.artist,
        albumArt:
          entry.album_art || '/src/assets/images/crate_cover_amber_vinyl_1794853068265.jpg',
        duration: entry.duration || 210,
        album:
          entry.album || (windowDays === 7 ? 'Weekly Top Tracks' : 'Monthly Top Tracks'),
        count: 1,
        latestPlayedAtMs: playedMs,
      });
    } else {
      existing.count += 1;
      if (playedMs >= existing.latestPlayedAtMs) {
        existing.latestPlayedAtMs = playedMs;
        existing.title = entry.title || existing.title;
        existing.artist = entry.artist || existing.artist;
        if (entry.album_art) existing.albumArt = entry.album_art;
      }
    }
  }

  return [...grouped.values()]
    .sort((a, b) => {
      if (b.count !== a.count) return b.count - a.count;
      return b.latestPlayedAtMs - a.latestPlayedAtMs;
    })
    .slice(0, limit)
    .map((item) => ({
      id: item.videoId,
      videoId: item.videoId,
      title: item.title,
      artist: item.artist,
      album: item.album,
      duration: item.duration,
      artworkUrl: item.albumArt,
      source: 'curated' as const,
      playCount: item.count,
    }));
}

/**
 * Generates the two dynamic auto-updating Spotify-style Top Tracks playlists
 * (Weekly Top Tracks - last 7 days, Monthly Top Tracks - last 30 days) with custom gradient covers.
 */
export function buildDynamicTopTrackPlaylists(
  entries: PlayHistoryRecord[],
  userId: string,
  nowMs = Date.now(),
  autoExpireEnabled = true
): Playlist[] {
  const weeklyTracks = aggregateTopTracksByWindow(entries, userId, 7, nowMs);
  const monthlyTracks = aggregateTopTracksByWindow(entries, userId, 30, nowMs);

  const weeklyTotalPlays = weeklyTracks.reduce((acc, t) => acc + (t.playCount || 1), 0);
  const monthlyTotalPlays = monthlyTracks.reduce((acc, t) => acc + (t.playCount || 1), 0);

  return [
    {
      id: WEEKLY_TOP_PLAYLIST_ID,
      name: 'Weekly Top Tracks',
      description:
        weeklyTracks.length > 0
          ? `Your most played songs in the last 7 days (${weeklyTotalPlays} plays logged after 30s+).`
          : 'Listen to any song for at least 30 seconds to build your Weekly Top Tracks.',
      coverUrl: '',
      coverImages: weeklyTracks.slice(0, 4).map((t) => t.artworkUrl),
      accent: 'weekly-gradient',
      category: 'Auto-Generated · Last 7 Days',
      tags: ['Top Tracks', 'Weekly', 'On Repeat', 'History'],
      tracks: weeklyTracks,
      isAutoTopTracks: true,
      topTracksPeriod: 'weekly',
      autoExpireEnabled,
    },
    {
      id: MONTHLY_TOP_PLAYLIST_ID,
      name: 'Monthly Top Tracks',
      description:
        monthlyTracks.length > 0
          ? `Your most played songs in the last 30 days (${monthlyTotalPlays} plays · Auto-cleaned after 30d).`
          : 'Listen to any song for at least 30 seconds to build your Monthly Top Tracks.',
      coverUrl: '',
      coverImages: monthlyTracks.slice(0, 4).map((t) => t.artworkUrl),
      accent: 'monthly-gradient',
      category: 'Auto-Generated · Last 30 Days',
      tags: ['Top Tracks', 'Monthly', 'Time Capsule', 'History'],
      tracks: monthlyTracks,
      isAutoTopTracks: true,
      topTracksPeriod: 'monthly',
      autoExpireEnabled,
    },
  ];
}

export function sanitizeUserPreferences(input?: Partial<UserPreferences> | null): UserPreferences {
  const cleanList = (arr?: unknown) =>
    Array.isArray(arr)
      ? Array.from(
          new Set(
            arr
              .map((item) => String(item || '').trim())
              .filter((s) => s.length > 0)
          )
        ).slice(0, 12)
      : [];

  return {
    languages: cleanList(input?.languages),
    genres: cleanList(input?.genres),
    artists: cleanList(input?.artists),
  };
}

export function getPreferencesSignature(preferences?: UserPreferences | null): string {
  const clean = sanitizeUserPreferences(preferences);
  return `${clean.languages.join(',')}|${clean.genres.join(',')}|${clean.artists.join(',')}`;
}

export function buildPersonalTasteSummary(
  history: HistoryPlayEntry[],
  preferences?: UserPreferences | null
): string {
  const prefs = sanitizeUserPreferences(preferences);
  const parts: string[] = [];

  if (prefs.languages.length > 0) {
    parts.push(`Preferred languages: ${prefs.languages.join(', ')}`);
  }
  if (prefs.genres.length > 0) {
    parts.push(`Preferred vibes/genres: ${prefs.genres.join(', ')}`);
  }
  if (prefs.artists.length > 0) {
    parts.push(`Chosen favorite artists: ${prefs.artists.join(', ')}`);
  }

  if (history && history.length > 0) {
    const artistCounts = new Map<string, number>();
    for (const item of history) {
      const primaryArtist = item.artist.split(',')[0]?.trim();
      if (primaryArtist) {
        artistCounts.set(primaryArtist, (artistCounts.get(primaryArtist) || 0) + 1);
      }
    }
    const topArtists = [...artistCounts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 4)
      .map(([name]) => name);

    const recentTracks = history
      .slice(0, 5)
      .map((h) => `${h.title} - ${h.artist}`)
      .join('; ');

    parts.push(`Recent top artists: ${topArtists.join(', ') || 'Varied'}`);
    parts.push(`Recent plays: ${recentTracks}`);
  }

  if (parts.length === 0) {
    return 'Balanced mix of Hindi, Haryanvi, and Global pop/synth.';
  }

  return `${parts.join('. ')}.`;
}

export function searchPlaylists(playlists: Playlist[], query: string): Playlist[] {
  const cleaned = query.trim().toLowerCase();
  if (!cleaned) return playlists;
  const tokens = cleaned.split(/\s+/).filter(Boolean);

  const scored: Array<{ playlist: Playlist; score: number }> = [];
  for (const pl of playlists) {
    const name = pl.name.toLowerCase();
    const desc = (pl.description || '').toLowerCase();
    const category = (pl.category || '').toLowerCase();
    const tags = (pl.tags || []).map((t) => t.toLowerCase());
    const trackText = pl.tracks
      .map((t) => `${t.title} ${t.artist} ${t.language || ''}`.toLowerCase())
      .join(' ');

    const allMatches = tokens.every(
      (tok) =>
        name.includes(tok) ||
        desc.includes(tok) ||
        category.includes(tok) ||
        tags.some((t) => t.includes(tok)) ||
        trackText.includes(tok)
    );

    if (!allMatches) continue;

    let score = 1;
    if (name.includes(cleaned)) score += 10;
    if (tokens.some((tok) => name.includes(tok))) score += 5;
    if (tags.some((t) => t.includes(cleaned)) || category.includes(cleaned)) score += 4;
    if (desc.includes(cleaned)) score += 2;
    scored.push({ playlist: pl, score });
  }

  return scored.sort((a, b) => b.score - a.score).map((s) => s.playlist);
}

const KNOWN_ARTIST_META: Record<
  string,
  { genre: string; monthlyListeners: string; fallbackAvatar: string }
> = {
  'arijit singh': {
    genre: 'Hindi · Romantic & Playback',
    monthlyListeners: '42.4M monthly listeners',
    fallbackAvatar: '/src/assets/images/crate_cover_bollywood_1794839824511.jpg',
  },
  pritam: {
    genre: 'Hindi · Composer & Pop',
    monthlyListeners: '38.1M monthly listeners',
    fallbackAvatar: '/src/assets/images/crate_cover_amber_vinyl_1794853068265.jpg',
  },
  'the weeknd': {
    genre: 'Global · Synthwave & R&B',
    monthlyListeners: '114.2M monthly listeners',
    fallbackAvatar: '/src/assets/images/crate_cover_midnight_1794839824638.jpg',
  },
  'renuka panwar': {
    genre: 'Haryanvi · Folk & Bass',
    monthlyListeners: '8.9M monthly listeners',
    fallbackAvatar: '/src/assets/images/crate_cover_haryanvi_1794839824382.jpg',
  },
  'dhanda nyoliwala': {
    genre: 'Haryanvi · Hip-Hop & Sub',
    monthlyListeners: '6.7M monthly listeners',
    fallbackAvatar: '/src/assets/images/crate_cover_tube_amp_1794853070263.jpg',
  },
  'a.r. rahman': {
    genre: 'Hindi & Sufi · Orchestral',
    monthlyListeners: '36.8M monthly listeners',
    fallbackAvatar: '/src/assets/images/crate_cover_amber_vinyl_1794853068265.jpg',
  },
  'diljit dosanjh': {
    genre: 'Punjabi · Global Pop',
    monthlyListeners: '24.5M monthly listeners',
    fallbackAvatar: '/src/assets/images/crate_cover_bronze_wave_1794853069757.jpg',
  },
  m83: {
    genre: 'Global · Electronic & Dream Pop',
    monthlyListeners: '15.2M monthly listeners',
    fallbackAvatar: '/src/assets/images/crate_cover_midnight_1794839824638.jpg',
  },
  'daft punk': {
    genre: 'Global · French House & Synth',
    monthlyListeners: '29.4M monthly listeners',
    fallbackAvatar: '/src/assets/images/crate_cover_bronze_wave_1794853069757.jpg',
  },
  'alka yagnik': {
    genre: 'Hindi · Classic Melodies',
    monthlyListeners: '31.0M monthly listeners',
    fallbackAvatar: '/src/assets/images/crate_cover_bollywood_1794839824511.jpg',
  },
};

function slugifyArtistId(name: string): string {
  return (
    'artist-' +
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
  );
}

/**
 * Builds a deduplicated Spotify-style Artist catalog from playlists and tracks.
 */
export function buildArtistCatalog(
  playlists: Playlist[],
  extraTracks: Track[] = []
): ArtistProfile[] {
  const allTracks = [...extraTracks, ...playlists.flatMap((pl) => pl.tracks)];
  const artistMap = new Map<
    string,
    {
      displayName: string;
      tracks: Track[];
      seenTrackIds: Set<string>;
      artworkUrl: string;
      language?: string;
    }
  >();

  for (const track of allTracks) {
    if (!track || !track.artist) continue;
    const rawNames = track.artist
      .split(/,|&|\bfeat\.?\b|\bft\.?\b/i)
      .map((s) => s.trim())
      .filter((s) => s.length > 1 && s.toLowerCase() !== 'unknown artist');

    for (const name of rawNames) {
      const key = name.toLowerCase();
      let entry = artistMap.get(key);
      if (!entry) {
        entry = {
          displayName: name,
          tracks: [],
          seenTrackIds: new Set<string>(),
          artworkUrl: track.artworkUrl,
          language: track.language,
        };
        artistMap.set(key, entry);
      }
      const tid = track.videoId || track.id;
      if (tid && !entry.seenTrackIds.has(tid)) {
        entry.seenTrackIds.add(tid);
        entry.tracks.push(track);
      }
      if (!entry.artworkUrl && track.artworkUrl) {
        entry.artworkUrl = track.artworkUrl;
      }
    }
  }

  const profiles: ArtistProfile[] = [];
  for (const [key, entry] of artistMap.entries()) {
    const known = KNOWN_ARTIST_META[key];
    const hash = Array.from(key).reduce((acc, ch) => acc + ch.charCodeAt(0), 0);
    const listenersM = ((hash % 35) + 3.2).toFixed(1);
    profiles.push({
      id: slugifyArtistId(entry.displayName),
      name: entry.displayName,
      avatarUrl:
        entry.artworkUrl ||
        known?.fallbackAvatar ||
        '/src/assets/images/crate_cover_amber_vinyl_1794853068265.jpg',
      genre: known?.genre || (entry.language ? `${entry.language} · Artist` : 'Featured Artist'),
      monthlyListeners: known?.monthlyListeners || `${listenersM}M monthly listeners`,
      verified: true,
      topTracks: entry.tracks,
    });
  }

  return profiles.sort((a, b) => {
    const aKnown = KNOWN_ARTIST_META[a.name.toLowerCase()] ? 1 : 0;
    const bKnown = KNOWN_ARTIST_META[b.name.toLowerCase()] ? 1 : 0;
    if (bKnown !== aKnown) return bKnown - aKnown;
    return b.topTracks.length - a.topTracks.length;
  });
}

/**
 * Filters and ranks Spotify-style Artist profiles by search query.
 */
export function searchArtists(artists: ArtistProfile[], query: string): ArtistProfile[] {
  const cleaned = query.trim().toLowerCase();
  if (!cleaned) return artists;
  const tokens = cleaned.split(/\s+/).filter(Boolean);

  const scored: Array<{ artist: ArtistProfile; score: number }> = [];
  for (const artist of artists) {
    const name = artist.name.toLowerCase();
    const genre = artist.genre.toLowerCase();
    const trackText = artist.topTracks
      .map((t) => `${t.title} ${t.album || ''} ${t.language || ''}`.toLowerCase())
      .join(' ');

    const matches = tokens.every(
      (tok) => name.includes(tok) || genre.includes(tok) || trackText.includes(tok)
    );
    if (!matches) continue;

    let score = 1;
    if (name === cleaned) score += 25;
    if (name.startsWith(cleaned)) score += 15;
    if (name.includes(cleaned)) score += 10;
    if (genre.includes(cleaned)) score += 5;
    scored.push({ artist, score });
  }

  return scored.sort((a, b) => b.score - a.score).map((s) => s.artist);
}

/**
 * Picks up to `count` random song artwork URLs (preferring distinct covers)
 * for Spotify-style 2x2 playlist cover collages when no custom icon is uploaded.
 */
export function pickRandomCoverImages(
  tracks: Array<Pick<Track, 'artworkUrl'>>,
  count = 4,
  rng: () => number = Math.random
): string[] {
  const validUrls = tracks
    .map((t) => String(t.artworkUrl || '').trim())
    .filter((url) => url.length > 0);

  if (validUrls.length === 0 || count <= 0) return [];

  const unique = Array.from(new Set(validUrls));
  for (let i = unique.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [unique[i], unique[j]] = [unique[j], unique[i]];
  }

  if (unique.length >= count) {
    return unique.slice(0, count);
  }

  // Pad with random picks from the shuffled pool so 2x2 grid always gets 4 tiles
  const result = [...unique];
  let idx = 0;
  while (result.length < count) {
    result.push(unique[idx % unique.length]);
    idx += 1;
  }
  return result;
}

export function formatDuration(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return '0:00';
  const total = Math.floor(seconds);
  const mins = Math.floor(total / 60);
  const secs = total % 60;
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

export function clampProgress(current: number, duration: number): number {
  if (!Number.isFinite(duration) || duration <= 0) return 0;
  return Math.min(100, Math.max(0, (current / duration) * 100));
}

/**
 * Inserts a track immediately after `currentIndex` ("Play Next" from the 3-dots menu).
 * If the track already exists later in the upcoming queue (index > currentIndex),
 * removes the later duplicate so it moves cleanly to the Play Next slot.
 */
export function insertPlayNextInQueue(
  queue: Track[],
  currentIndex: number,
  track: Track
): Track[] {
  if (queue.length === 0) {
    return [track];
  }
  const clampedCurrent = Math.max(0, Math.min(currentIndex, queue.length - 1));
  const targetKey = track.videoId || track.id;
  const beforeOrAtCurrent = queue.slice(0, clampedCurrent + 1);
  const afterCurrent = queue
    .slice(clampedCurrent + 1)
    .filter((item) => (item.videoId || item.id) !== targetKey);
  return [...beforeOrAtCurrent, track, ...afterCurrent];
}

/**
 * Appends a track to the end of the user's queue ("Add to Queue" from the 3-dots menu).
 * If the exact same track is already the very last item in the queue, returns the queue unchanged.
 */
export function appendTrackToQueue(queue: Track[], track: Track): Track[] {
  if (queue.length === 0) {
    return [track];
  }
  const last = queue[queue.length - 1];
  const targetKey = track.videoId || track.id;
  if (last && (last.videoId || last.id) === targetKey) {
    return queue;
  }
  return [...queue, track];
}

/**
 * Merges incoming recommended/search tracks onto an existing track list while
 * deduplicating by videoId/id and normalized title+artist.
 */
export function mergeUniqueTracks(existing: Track[], incoming: Track[]): Track[] {
  const seenIds = new Set<string>();
  const seenKeys = new Set<string>();
  const result: Track[] = [];

  for (const track of [...existing, ...incoming]) {
    const idKey = (track.videoId || track.id || '').trim();
    const textKey = `${track.title.trim().toLowerCase()}::${track.artist.trim().toLowerCase()}`;
    if ((idKey && seenIds.has(idKey)) || seenKeys.has(textKey)) {
      continue;
    }
    if (idKey) seenIds.add(idKey);
    seenKeys.add(textKey);
    result.push(track);
  }

  return result;
}

/**
 * Computes the visible slice of tracks and whether a "Show more" button should appear.
 */
export function sliceVisibleTracks(
  tracks: Track[],
  limit: number
): { visible: Track[]; hiddenCount: number; hasMore: boolean } {
  const safeLimit = Math.max(1, Math.floor(limit));
  const visible = tracks.slice(0, safeLimit);
  const hiddenCount = Math.max(0, tracks.length - visible.length);
  return {
    visible,
    hiddenCount,
    hasMore: hiddenCount > 0,
  };
}

export interface SingleNextTrackSuggestion {
  title: string;
  artist: string;
  query: string;
  reason: string;
}

/**
 * Parses Gemini's structured JSON (or fallback "Title - Artist") choosing
 * the single most related track to play next.
 */
export function parseSingleNextTrackSuggestion(rawText: string): SingleNextTrackSuggestion | null {
  const cleaned = rawText
    .trim()
    .replace(/^```json\s*/i, '')
    .replace(/^```\s*/i, '')
    .replace(/```\s*$/i, '')
    .trim();

  if (!cleaned) return null;

  try {
    const objStart = cleaned.indexOf('{');
    const objEnd = cleaned.lastIndexOf('}');
    if (objStart !== -1 && objEnd > objStart) {
      const parsed = JSON.parse(cleaned.slice(objStart, objEnd + 1)) as Record<string, unknown>;
      const title = String(parsed.title ?? parsed.song ?? '').trim();
      const artist = String(parsed.artist ?? '').trim();
      const reason = String(parsed.reason ?? 'AI matched mood & sound').trim();
      if (title) {
        return {
          title,
          artist: artist || 'Unknown Artist',
          query: artist ? `${title} - ${artist}` : title,
          reason,
        };
      }
    }
  } catch {
    // Fall back to array/line parsing below
  }

  const arr = parseSilentQueueStrings(cleaned);
  if (arr.length > 0) {
    const first = arr[0];
    const parts = first.split(/\s+-\s+/);
    const title = (parts[0] || first).trim();
    const artist = (parts.slice(1).join(' - ') || 'Unknown Artist').trim();
    return {
      title,
      artist,
      query: first,
      reason: 'AI matched mood & sound',
    };
  }

  return null;
}

/**
 * Parses a raw JSON array of "Title - Artist" strings returned by Gemini.
 * Strips accidental markdown fences if present and returns up to 5 clean query strings.
 */
export function parseSilentQueueStrings(rawText: string): string[] {
  const cleaned = rawText
    .trim()
    .replace(/^```json\s*/i, '')
    .replace(/^```\s*/i, '')
    .replace(/```\s*$/i, '')
    .trim();

  const startIdx = cleaned.indexOf('[');
  const endIdx = cleaned.lastIndexOf(']');
  const slice =
    startIdx !== -1 && endIdx > startIdx ? cleaned.slice(startIdx, endIdx + 1) : cleaned;

  try {
    const parsed = JSON.parse(slice);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((item) => {
        if (typeof item === 'string') return item.trim();
        if (item && typeof item === 'object') {
          const rec = item as Record<string, unknown>;
          const title = String(rec.title ?? rec.Title ?? '').trim();
          const artist = String(rec.artist ?? rec.Artist ?? '').trim();
          return title ? (artist ? `${title} - ${artist}` : title) : '';
        }
        return '';
      })
      .filter((s) => s.length > 0)
      .slice(0, 5);
  } catch {
    return [];
  }
}

export interface RawStreamFormat {
  mimeType?: string;
  bitrate?: number;
  averageBitrate?: number;
  width?: number;
  height?: number;
  url?: string;
  signatureCipher?: string;
  cipher?: string;
}

/**
 * Filters out all video formats and encrypted/ciphered streams, selecting the
 * highest-bitrate direct audio-only .webm or .m4a (audio/mp4) stream URL.
 */
export function selectBestAudioFormat(formats: RawStreamFormat[]): {
  url: string;
  mimeType: string;
  bitrate: number;
} | null {
  const audioOnly = formats.filter((f) => {
    if (!f.url || f.signatureCipher || f.cipher) return false;
    if (f.width || f.height) return false;
    const mime = (f.mimeType || '').toLowerCase();
    return (
      mime.startsWith('audio/webm') ||
      mime.startsWith('audio/mp4') ||
      mime.startsWith('audio/m4a') ||
      mime.startsWith('audio/')
    );
  });

  if (audioOnly.length === 0) return null;

  const sorted = [...audioOnly].sort((a, b) => {
    const aRate = a.bitrate || a.averageBitrate || 0;
    const bRate = b.bitrate || b.averageBitrate || 0;
    return bRate - aRate;
  });

  const best = sorted[0];
  return {
    url: best.url!,
    mimeType: best.mimeType || 'audio/mp4',
    bitrate: best.bitrate || best.averageBitrate || 0,
  };
}

/**
 * Removes a playlist by ID from a list of playlists (preserving the internal Downloads sandbox entry).
 */
export function deletePlaylistFromList(
  playlists: Playlist[],
  playlistId: string
): Playlist[] {
  const targetId = String(playlistId || '').trim();
  if (!targetId || targetId === DOWNLOADS_PLAYLIST_ID) return [...playlists];
  return playlists.filter((pl) => pl.id !== targetId);
}

/**
 * Removes a track (matched by videoId or id) from a single playlist and returns the updated playlist.
 */
export function removeTrackFromPlaylist(
  playlist: Playlist,
  trackVideoId: string
): Playlist {
  const targetVid = String(trackVideoId || '').trim();
  if (!targetVid) return playlist;
  const nextTracks = playlist.tracks.filter(
    (t) => t.videoId !== targetVid && t.id !== targetVid
  );
  return {
    ...playlist,
    tracks: nextTracks,
  };
}

/**
 * Removes a track from a specific playlist inside a catalog of playlists.
 */
export function removeTrackFromPlaylistInCatalog(
  playlists: Playlist[],
  playlistId: string,
  trackVideoId: string
): Playlist[] {
  const targetPlId = String(playlistId || '').trim();
  const targetVid = String(trackVideoId || '').trim();
  if (!targetPlId || !targetVid) return [...playlists];
  return playlists.map((pl) =>
    pl.id === targetPlId ? removeTrackFromPlaylist(pl, targetVid) : pl
  );
}

