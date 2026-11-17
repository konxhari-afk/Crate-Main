import test from 'node:test';
import assert from 'node:assert/strict';
import { blendPlaylists } from './blend';
import { evaluateRouteAccess, isProtectedOwnerProfile } from './accessControl';
import {
  aggregateTopTracksByWindow,
  appendTrackToQueue,
  buildArtistCatalog,
  buildDownloadsPlaylist,
  buildDynamicTopTrackPlaylists,
  buildInternalSandboxPath,
  buildInternalSandboxUri,
  buildPersonalTasteSummary,
  clampProgress,
  deletePlaylistFromList,
  DOWNLOADS_PLAYLIST_ID,
  FACTORY_STUDIO_EQ_BANDS,
  formatDuration,
  insertPlayNextInQueue,
  mergeUniqueTracks,
  parseSilentQueueStrings,
  parseSingleNextTrackSuggestion,
  pickRandomCoverImages,
  pruneExpiredPlayHistory,
  recordUserPlayHistory,
  removeDownloadedTrackRecord,
  removeTrackFromPlaylist,
  removeTrackFromPlaylistInCatalog,
  resolveSmartPlaybackSource,
  sanitizeUserPreferences,
  searchArtists,
  searchPlaylists,
  selectBestAudioFormat,
  sliceVisibleTracks,
  upsertDownloadedTrackRecord,
} from './audioMath';
import { buildOtpAuthUri, generateTotpCode, verifyTotpCode } from './totp';
import {
  extractSpotifyPlaylistId,
  parseManualTrackLines,
  parseSpotifyEmbedHtml,
} from './spotifyImport';
import type {
  DownloadedTrackRecord,
  PlayHistoryRecord,
  Playlist,
  Track,
  UserProfile,
} from '../types/crate';

const makeTrack = (id: string, title = `Track ${id}`): Track => ({
  id,
  videoId: id,
  title,
  artist: 'Crate Artist',
  album: 'Vault',
  duration: 24,
  artworkUrl: '/src/assets/images/crate_cover_midnight_1794839824638.jpg',
});

const baseProfile: UserProfile = {
  id: 'u1',
  email: 'listener@crate.fm',
  mobile_number: '+91 98765 43210',
  full_name: 'Aarav Mehta',
  avatar_url: '',
  is_admin: false,
  is_approved: true,
  created_at: '2026-11-16T00:00:00Z',
};

test('blendPlaylists interleaves two playlists, deduplicates, and shuffles with Fisher-Yates', () => {
  const a = [makeTrack('a1'), makeTrack('a2'), makeTrack('shared')];
  const b = [makeTrack('b1'), makeTrack('shared'), makeTrack('b2'), makeTrack('b3')];

  const unshuffled = blendPlaylists(a, b, () => 0.9999);
  assert.deepEqual(
    unshuffled.map((t) => t.id),
    ['a1', 'b1', 'a2', 'shared', 'b2', 'b3']
  );

  const rotated = blendPlaylists(a, b, () => 0);
  assert.equal(rotated.length, 6);
  assert.deepEqual(
    new Set(rotated.map((t) => t.id)),
    new Set(['a1', 'a2', 'shared', 'b1', 'b2', 'b3'])
  );
  assert.notDeepEqual(
    rotated.map((t) => t.id),
    unshuffled.map((t) => t.id)
  );
});

test('evaluateRouteAccess enforces login, onboarding, approval gatekeeper, and independent /owner gate', () => {
  assert.equal(evaluateRouteAccess('/', null).redirectTo, '/login');
  assert.equal(evaluateRouteAccess('/login', null).allowed, true);
  assert.equal(evaluateRouteAccess('/owner', null).allowed, true);

  const needsOnboarding: UserProfile = { ...baseProfile, full_name: '   ', is_approved: false };
  assert.equal(evaluateRouteAccess('/', needsOnboarding).redirectTo, '/onboarding');
  assert.equal(evaluateRouteAccess('/onboarding', needsOnboarding).allowed, true);
  assert.equal(evaluateRouteAccess('/owner', needsOnboarding).allowed, true);

  const unapproved: UserProfile = { ...baseProfile, is_approved: false };
  assert.equal(evaluateRouteAccess('/', unapproved).redirectTo, '/access-denied');
  assert.equal(evaluateRouteAccess('/owner', unapproved).allowed, true);
  assert.equal(evaluateRouteAccess('/access-denied', unapproved).allowed, true);

  assert.equal(evaluateRouteAccess('/', baseProfile).allowed, true);
  assert.equal(evaluateRouteAccess('/access-denied', baseProfile).redirectTo, '/');
  assert.equal(evaluateRouteAccess('/owner', baseProfile).allowed, true);

  // Only primary owner is protected; pending members remain approvable regardless of active browser listener
  assert.equal(
    isProtectedOwnerProfile({ id: 'owner-harvix', email: 'hari@harvix.space' }),
    true
  );
  assert.equal(
    isProtectedOwnerProfile({ id: 'member-123', email: 'konhxri@outlook.com' }),
    false
  );
});

test('formatDuration and clampProgress compute clean player timestamps', () => {
  assert.equal(formatDuration(0), '0:00');
  assert.equal(formatDuration(65), '1:05');
  assert.equal(formatDuration(243.8), '4:03');
  assert.equal(formatDuration(-5), '0:00');

  assert.equal(clampProgress(50, 200), 25);
  assert.equal(clampProgress(250, 200), 100);
  assert.equal(clampProgress(10, 0), 0);
});

test('parseSilentQueueStrings extracts up to 5 Title - Artist strings', () => {
  const raw =
    '```json\n["Kesariya - Arijit Singh", "52 Gaj Ka Daman - Renuka Panwar", "Starboy - The Weeknd", "Channa Mereya - Arijit Singh", "Blinding Lights - The Weeknd", "Extra - Skip"]\n```';
  const parsed = parseSilentQueueStrings(raw);
  assert.equal(parsed.length, 5);
  assert.equal(parsed[0], 'Kesariya - Arijit Singh');
  assert.equal(parsed[4], 'Blinding Lights - The Weeknd');
  assert.deepEqual(parseSilentQueueStrings('not json'), []);
});

test('selectBestAudioFormat filters out video & encrypted streams and picks highest bitrate audio', () => {
  const best = selectBestAudioFormat([
    { mimeType: 'video/mp4; codecs="avc1"', width: 1280, height: 720, bitrate: 999999, url: 'https://v.mp4' },
    { mimeType: 'audio/webm; codecs="opus"', bitrate: 160000, url: 'https://high.webm' },
    { mimeType: 'audio/mp4; codecs="mp4a.40.2"', bitrate: 128000, url: 'https://med.m4a' },
    { mimeType: 'audio/webm; codecs="opus"', bitrate: 320000, signatureCipher: 's=abc' },
  ]);
  assert.deepEqual(best, {
    url: 'https://high.webm',
    mimeType: 'audio/webm; codecs="opus"',
    bitrate: 160000,
  });

  assert.equal(
    selectBestAudioFormat([{ mimeType: 'video/webm', width: 640, height: 360, url: 'https://v.webm' }]),
    null
  );
});

test('recordUserPlayHistory deduplicates and buildPersonalTasteSummary incorporates onboarding preferences', () => {
  let history = recordUserPlayHistory([], { videoId: 'v1', title: 'Kesariya', artist: 'Arijit Singh' });
  history = recordUserPlayHistory(history, { videoId: 'v2', title: 'Starboy', artist: 'The Weeknd' });
  history = recordUserPlayHistory(history, { videoId: 'v1', title: 'Kesariya', artist: 'Arijit Singh' });

  assert.equal(history.length, 2);
  assert.equal(history[0].videoId, 'v1');

  const prefs = sanitizeUserPreferences({
    languages: ['Hindi', 'Haryanvi', 'Hindi'],
    genres: ['Romantic', 'Heavy Bass'],
    artists: ['Arijit Singh', 'Renuka Panwar'],
  });
  assert.deepEqual(prefs.languages, ['Hindi', 'Haryanvi']);

  const summary = buildPersonalTasteSummary(history, prefs);
  assert.match(summary, /Preferred languages: Hindi, Haryanvi/);
  assert.match(summary, /Preferred vibes\/genres: Romantic, Heavy Bass/);
  assert.match(summary, /Chosen favorite artists: Arijit Singh, Renuka Panwar/);
  assert.match(summary, /Starboy - The Weeknd/);

  assert.equal(FACTORY_STUDIO_EQ_BANDS.length, 5);
  assert.ok(FACTORY_STUDIO_EQ_BANDS[0].gain > 0);
});

test('searchPlaylists matches playlist names, tags, categories, and contained tracks', () => {
  const playlists: Playlist[] = [
    {
      id: 'pl-1',
      name: 'Daily Mix 01',
      description: 'Warm Hindi acoustic cuts',
      coverUrl: '',
      category: 'Made For You',
      tags: ['Hindi', 'Acoustic'],
      tracks: [makeTrack('t1', 'Kesariya')],
    },
    {
      id: 'pl-2',
      name: 'Night Drive Workout',
      description: 'High-energy bass',
      coverUrl: '',
      category: 'Workout & Drive',
      tags: ['Workout', 'Synthwave'],
      tracks: [makeTrack('t2', 'Nightcall')],
    },
  ];

  assert.equal(searchPlaylists(playlists, '').length, 2);
  assert.deepEqual(
    searchPlaylists(playlists, 'workout').map((p) => p.id),
    ['pl-2']
  );
  assert.deepEqual(
    searchPlaylists(playlists, 'kesariya').map((p) => p.id),
    ['pl-1']
  );
  assert.deepEqual(
    searchPlaylists(playlists, 'daily mix').map((p) => p.id),
    ['pl-1']
  );
});

test('parseSingleNextTrackSuggestion parses structured JSON and fallback string cleanly', () => {
  const jsonPick = parseSingleNextTrackSuggestion(
    '```json\n{"title":"Apna Bana Le","artist":"Arijit Singh","reason":"Matches warm Hindi vocal tone"}\n```'
  );
  assert.deepEqual(jsonPick, {
    title: 'Apna Bana Le',
    artist: 'Arijit Singh',
    query: 'Apna Bana Le - Arijit Singh',
    reason: 'Matches warm Hindi vocal tone',
  });

  const arrayFallback = parseSingleNextTrackSuggestion('["Blinding Lights - The Weeknd"]');
  assert.equal(arrayFallback?.title, 'Blinding Lights');
  assert.equal(arrayFallback?.artist, 'The Weeknd');
});

test('RFC 6238 TOTP generates and verifies Microsoft Authenticator 6-digit codes', () => {
  // Official RFC 6238 SHA1 test vector secret for "12345678901234567890"
  const secret = 'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ';
  const codeAt59s = generateTotpCode(secret, 59_000, 30, 6);
  assert.equal(codeAt59s, '287082');

  assert.equal(verifyTotpCode(secret, '287082', 59_000, 1), true);
  assert.equal(verifyTotpCode(secret, '287082', 89_000, 1), true); // +1 step tolerance
  assert.equal(verifyTotpCode(secret, '000000', 59_000, 1), false);

  const uri = buildOtpAuthUri({
    issuer: 'Crate',
    accountName: 'hari@harvix.space',
    secret,
  });
  assert.match(uri, /^otpauth:\/\/totp\/Crate:hari%40harvix\.space\?/);
  assert.match(uri, /secret=GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ/);
});

test('Spotify playlist importer extracts IDs, parses embed HTML tracks, and parses manual lines', () => {
  assert.equal(
    extractSpotifyPlaylistId('https://open.spotify.com/playlist/37i9dQZF1DXcBWIGoYBM5M?si=abc123'),
    '37i9dQZF1DXcBWIGoYBM5M'
  );
  assert.equal(
    extractSpotifyPlaylistId('spotify:playlist:37i9dQZF1DXcBWIGoYBM5M'),
    '37i9dQZF1DXcBWIGoYBM5M'
  );
  assert.equal(extractSpotifyPlaylistId('https://example.com/not-spotify'), null);

  const mockPayload = {
    props: {
      pageProps: {
        state: {
          settings: { session: { accessToken: 'tok-123' } },
          data: {
            entity: {
              name: 'Late Night Crate',
              subtitle: 'Hari',
              coverArt: { sources: [{ url: 'https://i.scdn.co/image/cover.jpg' }] },
              trackList: [
                { title: 'Kesariya', subtitle: 'Arijit Singh,\u00a0Pritam', duration: 268000 },
                { title: 'Starboy', subtitle: 'The Weeknd', duration: 230000 },
              ],
            },
          },
        },
      },
    },
  };
  const html = `<script id="__NEXT_DATA__" type="application/json">${JSON.stringify(mockPayload)}</script>`;
  const parsed = parseSpotifyEmbedHtml(html, '37i9dQZF1DXcBWIGoYBM5M');
  assert.ok(parsed);
  assert.equal(parsed.name, 'Late Night Crate');
  assert.equal(parsed.accessToken, 'tok-123');
  assert.equal(parsed.tracks.length, 2);
  assert.equal(parsed.tracks[0].artist, 'Arijit Singh, Pritam');
  assert.equal(parsed.tracks[0].durationSec, 268);

  const manual = parseManualTrackLines('1. Kun Faya Kun - A.R. Rahman\nBlinding Lights - The Weeknd');
  assert.equal(manual.length, 2);
  assert.deepEqual(manual[0], { title: 'Kun Faya Kun', artist: 'A.R. Rahman', durationSec: 210 });
});

test('pickRandomCoverImages selects 4 distinct song pics and pads cleanly when fewer exist', () => {
  const pool = [
    { artworkUrl: '/a.jpg' },
    { artworkUrl: '/b.jpg' },
    { artworkUrl: '/a.jpg' },
    { artworkUrl: '/c.jpg' },
    { artworkUrl: '/d.jpg' },
    { artworkUrl: '/e.jpg' },
  ];
  const four = pickRandomCoverImages(pool, 4, () => 0.42);
  assert.equal(four.length, 4);
  assert.equal(new Set(four).size, 4);

  const twoUnique = pickRandomCoverImages([{ artworkUrl: '/x.jpg' }, { artworkUrl: '/y.jpg' }], 4, () => 0.5);
  assert.equal(twoUnique.length, 4);
  assert.ok(twoUnique.includes('/x.jpg') && twoUnique.includes('/y.jpg'));

  assert.deepEqual(pickRandomCoverImages([], 4), []);
});

test('insertPlayNextInQueue and appendTrackToQueue extend queue cleanly via 3-dots options', () => {
  const t1 = makeTrack('t1');
  const t2 = makeTrack('t2');
  const t3 = makeTrack('t3');
  const t4 = makeTrack('t4');

  // Empty queue handling
  assert.deepEqual(insertPlayNextInQueue([], 0, t1).map((t) => t.id), ['t1']);
  assert.deepEqual(appendTrackToQueue([], t1).map((t) => t.id), ['t1']);

  // Insert Play Next right after currentTrackIndex = 0
  const afterPlayNext = insertPlayNextInQueue([t1, t2, t3], 0, t4);
  assert.deepEqual(
    afterPlayNext.map((t) => t.id),
    ['t1', 't4', 't2', 't3']
  );

  // Promoting an existing upcoming song to Play Next deduplicates its later copy
  const promoted = insertPlayNextInQueue([t1, t2, t3], 0, t3);
  assert.deepEqual(
    promoted.map((t) => t.id),
    ['t1', 't3', 't2']
  );

  // Append to end of queue & avoid consecutive tail duplicates
  const appended = appendTrackToQueue([t1, t2], t3);
  assert.deepEqual(
    appended.map((t) => t.id),
    ['t1', 't2', 't3']
  );
  assert.deepEqual(
    appendTrackToQueue(appended, t3).map((t) => t.id),
    ['t1', 't2', 't3']
  );

  // mergeUniqueTracks deduplicates by id and title+artist for "Show more" continuation
  const merged = mergeUniqueTracks(
    [makeTrack('t1', 'Kesariya'), makeTrack('t2', 'Starboy')],
    [makeTrack('t2', 'Starboy'), makeTrack('t99', 'Kesariya'), makeTrack('t3', 'Gerua')]
  );
  assert.deepEqual(
    merged.map((t) => t.id),
    ['t1', 't2', 't3']
  );

  const sliced = sliceVisibleTracks(merged, 2);
  assert.equal(sliced.visible.length, 2);
  assert.equal(sliced.hiddenCount, 1);
  assert.equal(sliced.hasMore, true);
});

test('buildArtistCatalog and searchArtists extract and rank Spotify-style artist profiles', () => {
  const t1: Track = { ...makeTrack('v1', 'Kesariya'), artist: 'Arijit Singh, Pritam', language: 'Hindi' };
  const t2: Track = { ...makeTrack('v2', 'Starboy'), artist: 'The Weeknd, Daft Punk', language: 'Global' };
  const t3: Track = { ...makeTrack('v3', 'Channa Mereya'), artist: 'Arijit Singh', language: 'Hindi' };

  const catalog = buildArtistCatalog([], [t1, t2, t3]);
  assert.ok(catalog.length >= 4);
  const arijit = catalog.find((a) => a.name === 'Arijit Singh');
  assert.ok(arijit);
  assert.equal(arijit.topTracks.length, 2);
  assert.equal(arijit.verified, true);

  const byName = searchArtists(catalog, 'arijit');
  assert.equal(byName[0]?.name, 'Arijit Singh');

  const bySong = searchArtists(catalog, 'starboy');
  assert.ok(bySong.some((a) => a.name === 'The Weeknd'));
});

test('aggregateTopTracksByWindow, buildDynamicTopTrackPlaylists, and pruneExpiredPlayHistory rank 7d/30d plays and purge >30d entries', () => {
  const nowMs = Date.parse('2026-11-16T12:00:00Z');
  const dayMs = 24 * 60 * 60 * 1000;

  const history: PlayHistoryRecord[] = [
    // Played 2 days ago (in both 7d and 30d): v1 played 3x, v2 played 1x
    {
      id: 'h1',
      user_id: 'u1',
      video_id: 'v1',
      title: 'Kesariya',
      artist: 'Arijit Singh',
      album_art: '/k.jpg',
      played_at: new Date(nowMs - 1 * dayMs).toISOString(),
    },
    {
      id: 'h2',
      user_id: 'u1',
      video_id: 'v1',
      title: 'Kesariya',
      artist: 'Arijit Singh',
      album_art: '/k.jpg',
      played_at: new Date(nowMs - 2 * dayMs).toISOString(),
    },
    {
      id: 'h3',
      user_id: 'u1',
      video_id: 'v1',
      title: 'Kesariya',
      artist: 'Arijit Singh',
      album_art: '/k.jpg',
      played_at: new Date(nowMs - 3 * dayMs).toISOString(),
    },
    {
      id: 'h4',
      user_id: 'u1',
      video_id: 'v2',
      title: 'Starboy',
      artist: 'The Weeknd',
      album_art: '/s.jpg',
      played_at: new Date(nowMs - 2 * dayMs).toISOString(),
    },
    // Played 15 days ago (only in 30d, NOT 7d): v2 played 3 more times (total 4 in 30d!)
    {
      id: 'h5',
      user_id: 'u1',
      video_id: 'v2',
      title: 'Starboy',
      artist: 'The Weeknd',
      album_art: '/s.jpg',
      played_at: new Date(nowMs - 14 * dayMs).toISOString(),
    },
    {
      id: 'h6',
      user_id: 'u1',
      video_id: 'v2',
      title: 'Starboy',
      artist: 'The Weeknd',
      album_art: '/s.jpg',
      played_at: new Date(nowMs - 15 * dayMs).toISOString(),
    },
    {
      id: 'h7',
      user_id: 'u1',
      video_id: 'v2',
      title: 'Starboy',
      artist: 'The Weeknd',
      album_art: '/s.jpg',
      played_at: new Date(nowMs - 16 * dayMs).toISOString(),
    },
    // Played 35 days ago (expired > 30 days)
    {
      id: 'h8',
      user_id: 'u1',
      video_id: 'v99',
      title: 'Old Song',
      artist: 'Retro',
      album_art: '/o.jpg',
      played_at: new Date(nowMs - 35 * dayMs).toISOString(),
    },
  ];

  const pruned = pruneExpiredPlayHistory(history, nowMs, 30);
  assert.equal(pruned.removedCount, 1);
  assert.equal(pruned.active.length, 7);

  const weekly = aggregateTopTracksByWindow(pruned.active, 'u1', 7, nowMs);
  assert.equal(weekly.length, 2);
  assert.equal(weekly[0].videoId, 'v1'); // 3 plays in last 7d
  assert.equal(weekly[0].playCount, 3);
  assert.equal(weekly[1].videoId, 'v2'); // 1 play in last 7d
  assert.equal(weekly[1].playCount, 1);

  const monthly = aggregateTopTracksByWindow(pruned.active, 'u1', 30, nowMs);
  assert.equal(monthly.length, 2);
  assert.equal(monthly[0].videoId, 'v2'); // 4 plays in last 30d!
  assert.equal(monthly[0].playCount, 4);
  assert.equal(monthly[1].videoId, 'v1'); // 3 plays in last 30d
  assert.equal(monthly[1].playCount, 3);

  const playlists = buildDynamicTopTrackPlaylists(pruned.active, 'u1', nowMs, true);
  assert.equal(playlists.length, 2);
  assert.equal(playlists[0].name, 'Weekly Top Tracks');
  assert.equal(playlists[1].name, 'Monthly Top Tracks');
});

test('offline sandbox paths, downloaded_tracks table, Smart Audio Interceptor, and Downloads playlist work strictly inside Directory.Data', () => {
  assert.equal(buildInternalSandboxPath('BddP6PYo2gs'), 'tracks/BddP6PYo2gs.mp3');
  assert.equal(buildInternalSandboxUri('BddP6PYo2gs'), 'Directory.Data/tracks/BddP6PYo2gs.mp3');
  // Sanitizes path traversal characters so files never escape internal tracks/ sandbox
  assert.equal(buildInternalSandboxPath('../ext/song'), 'tracks/___ext_song.mp3');

  const rec1: DownloadedTrackRecord = {
    videoId: 'BddP6PYo2gs',
    title: 'Kesariya',
    artist: 'Arijit Singh, Pritam',
    albumArt: '/k.jpg',
    localFileUri: 'Directory.Data/tracks/BddP6PYo2gs.mp3',
    sandboxPath: 'tracks/BddP6PYo2gs.mp3',
    album: 'Brahmastra',
    duration: 24,
    sizeBytes: 512000,
    downloadedAt: '2026-11-16T18:00:00Z',
  };
  const rec2: DownloadedTrackRecord = {
    videoId: '4NRXx6U8ABQ',
    title: 'Blinding Lights',
    artist: 'The Weeknd',
    albumArt: '/b.jpg',
    localFileUri: 'Directory.Data/tracks/4NRXx6U8ABQ.mp3',
    sandboxPath: 'tracks/4NRXx6U8ABQ.mp3',
    album: 'After Hours',
    duration: 24,
    sizeBytes: 640000,
    downloadedAt: '2026-11-16T18:05:00Z',
  };

  let table = upsertDownloadedTrackRecord([], rec1);
  table = upsertDownloadedTrackRecord(table, rec2);
  assert.equal(table.length, 2);
  assert.equal(table[0].videoId, '4NRXx6U8ABQ');

  // Smart Audio Interceptor checks downloaded_tracks first
  const hit = resolveSmartPlaybackSource('BddP6PYo2gs', table);
  assert.equal(hit.mode, 'offline-sandbox');
  assert.equal(hit.localFileUri, 'Directory.Data/tracks/BddP6PYo2gs.mp3');
  assert.equal(hit.sandboxPath, 'tracks/BddP6PYo2gs.mp3');

  const miss = resolveSmartPlaybackSource('unknown-vid', table);
  assert.equal(miss.mode, 'network-stream');
  assert.equal(miss.localFileUri, null);
  assert.equal(miss.streamEndpoint, '/api/stream?videoId=unknown-vid');

  // Dedicated 'Downloads' playlist pulls exclusively from downloaded_tracks
  const downloadsPl = buildDownloadsPlaylist(table);
  assert.equal(downloadsPl.name, 'Downloads');
  assert.equal(downloadsPl.isDownloadsPlaylist, true);
  assert.equal(downloadsPl.tracks.length, 2);
  assert.equal(downloadsPl.tracks[0].isOfflineDownloaded, true);
  assert.equal(downloadsPl.tracks[0].localFileUri, 'Directory.Data/tracks/4NRXx6U8ABQ.mp3');

  const afterRemove = removeDownloadedTrackRecord(table, 'BddP6PYo2gs');
  assert.equal(afterRemove.length, 1);
  assert.equal(afterRemove[0].videoId, '4NRXx6U8ABQ');
});

test('deletePlaylistFromList and removeTrackFromPlaylist allow deleting playlists and removing songs from playlists', () => {
  const pl1: Playlist = {
    id: 'pl-custom-1',
    name: 'Late Night Vault',
    description: 'Custom mix',
    coverUrl: '',
    tracks: [makeTrack('t1'), makeTrack('t2'), makeTrack('t3')],
  };
  const pl2: Playlist = {
    id: 'pl-daily-mix-1',
    name: 'Daily Mix 01',
    description: 'Curated mix',
    coverUrl: '',
    tracks: [makeTrack('t4'), makeTrack('t5')],
  };
  const downloadsPl = buildDownloadsPlaylist([]);

  // Removing a single song from a playlist
  const updatedPl1 = removeTrackFromPlaylist(pl1, 't2');
  assert.deepEqual(
    updatedPl1.tracks.map((t) => t.id),
    ['t1', 't3']
  );

  // Removing a song from a playlist inside a catalog
  const catalogAfterSongRemoved = removeTrackFromPlaylistInCatalog(
    [downloadsPl, pl1, pl2],
    'pl-daily-mix-1',
    't4'
  );
  assert.deepEqual(
    catalogAfterSongRemoved.find((p) => p.id === 'pl-daily-mix-1')?.tracks.map((t) => t.id),
    ['t5']
  );

  // Deleting a playlist removes it while preserving the Downloads sandbox container
  const afterDelete = deletePlaylistFromList([downloadsPl, pl1, pl2], 'pl-custom-1');
  assert.deepEqual(
    afterDelete.map((p) => p.id),
    [DOWNLOADS_PLAYLIST_ID, 'pl-daily-mix-1']
  );
  const preserveDownloads = deletePlaylistFromList(afterDelete, DOWNLOADS_PLAYLIST_ID);
  assert.equal(preserveDownloads.length, 2);
});

