import 'dotenv/config';
import express, { type Request, type Response } from 'express';
import http from 'http';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { WebSocketServer, type WebSocket } from 'ws';
import YTMusic from 'ytmusic-api';
import play from 'play-dl';
import { GoogleGenAI, ThinkingLevel, Type } from '@google/genai';
import QRCode from 'qrcode';
import { createServer as createViteServer } from 'vite';
import {
  buildArtistCatalog,
  buildDynamicTopTrackPlaylists,
  buildPersonalTasteSummary,
  getPreferencesSignature,
  type HistoryPlayEntry,
  parseSilentQueueStrings,
  parseSingleNextTrackSuggestion,
  pickRandomCoverImages,
  pruneExpiredPlayHistory,
  recordUserPlayHistory,
  sanitizeUserPreferences,
  searchArtists,
  searchPlaylists,
  selectBestAudioFormat,
} from './src/lib/audioMath';
import {
  buildOtpAuthUri,
  generateBase32Secret,
  verifyTotpCode,
} from './src/lib/totp';
import {
  extractSpotifyPlaylistId,
  parseManualTrackLines,
  parseSpotifyEmbedHtml,
  type SpotifyTrackCandidate,
} from './src/lib/spotifyImport';
import type {
  ListenTogetherState,
  PlayHistoryRecord,
  Playlist,
  Track,
  UserProfile,
  YTMusicSearchResult,
} from './src/types/crate';

const PORT = 3000;
const DATA_DIR = path.resolve(process.cwd(), 'data');
const AVATARS_DIR = path.join(DATA_DIR, 'avatars');
const PLAYLIST_COVERS_DIR = path.join(DATA_DIR, 'playlist-covers');
const DB_FILE = path.join(DATA_DIR, 'crate-db.json');

fs.mkdirSync(AVATARS_DIR, { recursive: true });
fs.mkdirSync(PLAYLIST_COVERS_DIR, { recursive: true });

// ---------------------------------------------------------------------------
// Curated Seed Catalog (YouTube Music Video IDs: Hindi / Haryanvi / Global)
// ---------------------------------------------------------------------------
const SEED_TRACKS: Track[] = [
  {
    id: 'BddP6PYo2gs',
    videoId: 'BddP6PYo2gs',
    title: 'Kesariya',
    artist: 'Arijit Singh, Pritam',
    album: 'Brahmastra',
    duration: 24,
    artworkUrl: '/src/assets/images/crate_cover_amber_vinyl_1794853068265.jpg',
    language: 'Hindi',
    source: 'curated',
  },
  {
    id: '4-5N_tY9z4s',
    videoId: '4-5N_tY9z4s',
    title: '52 Gaj Ka Daman',
    artist: 'Renuka Panwar',
    album: 'Haryanvi Vault',
    duration: 24,
    artworkUrl: '/src/assets/images/crate_cover_tube_amp_1794853069419.jpg',
    language: 'Haryanvi',
    source: 'curated',
  },
  {
    id: '4NRXx6U8ABQ',
    videoId: '4NRXx6U8ABQ',
    title: 'Blinding Lights',
    artist: 'The Weeknd',
    album: 'After Hours',
    duration: 24,
    artworkUrl: '/src/assets/images/crate_cover_amber_vinyl_1794853068265.jpg',
    language: 'Global',
    source: 'curated',
  },
  {
    id: 'sK7riqg2mr4',
    videoId: 'sK7riqg2mr4',
    title: 'Agar Tum Saath Ho',
    artist: 'Alka Yagnik, Arijit Singh',
    album: 'Tamasha',
    duration: 24,
    artworkUrl: '/src/assets/images/crate_cover_tube_amp_1794853069419.jpg',
    language: 'Hindi',
    source: 'curated',
  },
  {
    id: 'kJQP7kiw5Fk',
    videoId: 'kJQP7kiw5Fk',
    title: 'Russian Bandana',
    artist: 'Dhanda Nyoliwala',
    album: 'Highway Nights',
    duration: 24,
    artworkUrl: '/src/assets/images/crate_cover_amber_vinyl_1794853068265.jpg',
    language: 'Haryanvi',
    source: 'curated',
  },
  {
    id: '34Na4j8AVgA',
    videoId: '34Na4j8AVgA',
    title: 'Starboy',
    artist: 'The Weeknd, Daft Punk',
    album: 'Starboy',
    duration: 24,
    artworkUrl: '/src/assets/images/crate_cover_tube_amp_1794853069419.jpg',
    language: 'Global',
    source: 'curated',
  },
  {
    id: 'T94PHkuydcw',
    videoId: 'T94PHkuydcw',
    title: 'Kun Faya Kun',
    artist: 'A.R. Rahman, Javed Ali, Mohit Chauhan',
    album: 'Rockstar',
    duration: 24,
    artworkUrl: '/src/assets/images/crate_cover_amber_vinyl_1794853068265.jpg',
    language: 'Hindi',
    source: 'curated',
  },
  {
    id: 'JGwWNGJdvx8',
    videoId: 'JGwWNGJdvx8',
    title: 'Midnight City',
    artist: 'M83',
    album: 'Hurry Up, We Are Dreaming',
    duration: 24,
    artworkUrl: '/src/assets/images/crate_cover_tube_amp_1794853069419.jpg',
    language: 'Global',
    source: 'curated',
  },
  {
    id: 'ElZfdU54Cp8',
    videoId: 'ElZfdU54Cp8',
    title: 'Apna Bana Le',
    artist: 'Arijit Singh, Sachin-Jigar',
    album: 'Bhediya',
    duration: 24,
    artworkUrl: '/src/assets/images/crate_cover_amber_vinyl_1794853068265.jpg',
    language: 'Hindi',
    source: 'curated',
  },
  {
    id: 'mH_LFkWxpI0',
    videoId: 'mH_LFkWxpI0',
    title: 'Lover',
    artist: 'Diljit Dosanjh',
    album: 'MoonChild Era',
    duration: 24,
    artworkUrl: '/src/assets/images/crate_cover_bronze_wave_1794853069757.jpg',
    language: 'Punjabi',
    source: 'curated',
  },
  {
    id: 'bzSTpdcs-EI',
    videoId: 'bzSTpdcs-EI',
    title: 'Channa Mereya',
    artist: 'Arijit Singh, Pritam',
    album: 'Ae Dil Hai Mushkil',
    duration: 24,
    artworkUrl: '/src/assets/images/crate_cover_tube_amp_1794853069419.jpg',
    language: 'Hindi',
    source: 'curated',
  },
  {
    id: 'MV_3Dpw-BRY',
    videoId: 'MV_3Dpw-BRY',
    title: 'Nightcall',
    artist: 'Kavinsky',
    album: 'OutRun',
    duration: 24,
    artworkUrl: '/src/assets/images/crate_cover_bronze_wave_1794853069757.jpg',
    language: 'English',
    source: 'curated',
  },
];

const CURATED_PLAYLISTS: Playlist[] = [
  {
    id: 'pl-daily-mix-1',
    name: 'Daily Mix 01',
    description: 'Arijit Singh, Pritam, A.R. Rahman and soulful Hindi acoustic favorites.',
    coverUrl: '/src/assets/images/crate_cover_amber_vinyl_1794853068265.jpg',
    accent: 'rose',
    category: 'Made For You',
    tags: ['Daily Mix', 'Hindi', 'Romantic', 'Acoustic', 'Arijit Singh', 'Chill'],
    tracks: [SEED_TRACKS[0], SEED_TRACKS[8], SEED_TRACKS[3], SEED_TRACKS[10]],
  },
  {
    id: 'pl-discover-weekly',
    name: 'Discover Weekly',
    description: 'Cross-genre deep cuts, synth hooks, and velvet late-night grooves.',
    coverUrl: '/src/assets/images/crate_cover_bronze_wave_1794853069757.jpg',
    accent: 'emerald',
    category: 'Made For You',
    tags: ['Discover Weekly', 'Global', 'Hindi', 'Indie', 'Synthwave', 'Chill'],
    tracks: [SEED_TRACKS[6], SEED_TRACKS[7], SEED_TRACKS[9], SEED_TRACKS[11]],
  },
  {
    id: 'pl-release-radar',
    name: 'Release Radar',
    description: 'High-impact Punjabi, Haryanvi, and driving pop highlights.',
    coverUrl: '/src/assets/images/crate_cover_tube_amp_1794853069419.jpg',
    accent: 'violet',
    category: 'New & Trending',
    tags: ['Release Radar', 'Punjabi', 'Haryanvi', 'Hip-Hop', 'Bass', 'Pop'],
    tracks: [SEED_TRACKS[9], SEED_TRACKS[4], SEED_TRACKS[1], SEED_TRACKS[2]],
  },
  {
    id: 'pl-hindi-midnight',
    name: 'Late Night Hindi',
    description: 'Warm vocals, reverb trails, and midnight acoustic cuts.',
    coverUrl: '/src/assets/images/crate_cover_amber_vinyl_1794853068265.jpg',
    accent: 'rose',
    category: 'Mood',
    tags: ['Hindi', 'Late Night', 'Lo-Fi Chill', 'Romantic', 'Acoustic'],
    tracks: [SEED_TRACKS[0], SEED_TRACKS[3], SEED_TRACKS[6], SEED_TRACKS[8]],
  },
  {
    id: 'pl-haryanvi-sub',
    name: 'Haryanvi Heavy Sub',
    description: 'High-impact basslines and crisp street percussion.',
    coverUrl: '/src/assets/images/crate_cover_tube_amp_1794853069419.jpg',
    accent: 'violet',
    category: 'Regional Bass',
    tags: ['Haryanvi', 'Heavy Bass', 'Workout', 'Punjabi', 'High Energy'],
    tracks: [SEED_TRACKS[1], SEED_TRACKS[4], SEED_TRACKS[9]],
  },
  {
    id: 'pl-global-cyan',
    name: 'Global Spatial Synth',
    description: 'Wide stereo soundscapes tuned for 3D spatial listening.',
    coverUrl: '/src/assets/images/crate_cover_bronze_wave_1794853069757.jpg',
    accent: 'emerald',
    category: 'Electronic & Synth',
    tags: ['English', 'Global', 'Synthwave', 'Electronic', 'Night Drive'],
    tracks: [SEED_TRACKS[2], SEED_TRACKS[5], SEED_TRACKS[7], SEED_TRACKS[11]],
  },
  {
    id: 'pl-bollywood-unplugged',
    name: 'Bollywood Unplugged',
    description: 'Intimate acoustic sessions, Sufi strings, and timeless melodies.',
    coverUrl: '/src/assets/images/crate_cover_amber_vinyl_1794853068265.jpg',
    accent: 'rose',
    category: 'Acoustic & Sufi',
    tags: ['Hindi', 'Sufi', 'Acoustic', 'Unplugged', 'Retro', 'A.R. Rahman'],
    tracks: [SEED_TRACKS[6], SEED_TRACKS[10], SEED_TRACKS[3], SEED_TRACKS[8]],
  },
  {
    id: 'pl-workout-drive',
    name: 'Night Drive Workout',
    description: 'Punchy sub-bass and neon electronic momentum for gym & late drives.',
    coverUrl: '/src/assets/images/crate_cover_bronze_wave_1794853069757.jpg',
    accent: 'violet',
    category: 'Workout & Drive',
    tags: ['Workout', 'Gym', 'Electronic', 'Heavy Bass', 'Synthwave', 'Drive'],
    tracks: [SEED_TRACKS[2], SEED_TRACKS[5], SEED_TRACKS[4], SEED_TRACKS[11]],
  },
];

// ---------------------------------------------------------------------------
// Persistent JSON Database (profiles, mobile OTPs, sessions, listening history)
// ---------------------------------------------------------------------------
interface MobileOtpRecord {
  email: string;
  mobileNumber: string;
  fullName?: string;
  avatarUrl?: string;
  password?: string;
  code: string;
  expiresAt: number;
}

const OWNER_LOGIN_ID = 'hari@harvix.space';
const OWNER_PASSWORD_SALT = 'efda0b70f335d156c595b2cf5ee62276';
const OWNER_PASSWORD_HASH =
  '7a661b0a78ec553c8cf2d9ad4c61de49b419192973f51d2521c38602a784a4fbce079432940b3c38e50a3c8156f0c4fbb730393931c0f4cfa1831d1d5260b065';

function verifyOwnerPassword(password: string): boolean {
  const derived = crypto.scryptSync(password, OWNER_PASSWORD_SALT, 64);
  const expected = Buffer.from(OWNER_PASSWORD_HASH, 'hex');
  return derived.length === expected.length && crypto.timingSafeEqual(derived, expected);
}

interface OwnerAuthConfig {
  totpSecret: string;
  totpEnrolled: boolean;
}

interface SessionRecord {
  userId: string;
  expiresAt: number;
  ownerVerified?: boolean;
}

interface PlayHistoryUserSettings {
  autoExpire30Days: boolean;
  lastCleanupAt: string;
}

interface CrateDb {
  profiles: UserProfile[];
  mobileOtps: Record<string, MobileOtpRecord>;
  sessions: Record<string, SessionRecord>;
  listeningHistory: Record<string, HistoryPlayEntry[]>;
  playHistory: PlayHistoryRecord[];
  playHistorySettings: Record<string, PlayHistoryUserSettings>;
  personalMixCache: Record<
    string,
    { tracks: Track[]; historyCount: number; prefsSignature?: string; updatedAt: number }
  >;
  ownerAuth: OwnerAuthConfig;
  customPlaylists: Playlist[];
  deletedPlaylistIds?: string[];
  curatedPlaylistOverrides?: Record<string, Track[]>;
}

function createSamplePlayHistoryForUser(userId: string, nowMs = Date.now()): PlayHistoryRecord[] {
  const dayMs = 24 * 60 * 60 * 1000;
  const hourMs = 60 * 60 * 1000;

  // Weekly plays (within last 7 days) + Monthly-only plays (8-26 days ago)
  const schedule: Array<{ track: Track; offsetsHoursAgo: number[] }> = [
    {
      track: SEED_TRACKS[0], // Kesariya — #1 Weekly (5 plays in 7d, 6 plays in 30d)
      offsetsHoursAgo: [3, 18, 42, 76, 120, 290],
    },
    {
      track: SEED_TRACKS[2], // Blinding Lights — #2 Weekly (4 plays in 7d, 5 plays in 30d)
      offsetsHoursAgo: [5, 29, 64, 138, 360],
    },
    {
      track: SEED_TRACKS[6], // Kun Faya Kun — #3 Weekly (3 plays in 7d, 5 plays in 30d)
      offsetsHoursAgo: [11, 52, 110, 240, 480],
    },
    {
      track: SEED_TRACKS[1], // 52 Gaj Ka Daman — #4 Weekly (2 plays in 7d, 4 plays in 30d)
      offsetsHoursAgo: [22, 95, 220, 410],
    },
    {
      track: SEED_TRACKS[9], // Lover - Diljit Dosanjh — #5 Weekly (2 plays in 7d, 3 plays in 30d)
      offsetsHoursAgo: [34, 148, 320],
    },
    {
      track: SEED_TRACKS[3], // Agar Tum Saath Ho — #6 Weekly (1 play in 7d, 3 plays in 30d)
      offsetsHoursAgo: [60, 260, 520],
    },
    {
      track: SEED_TRACKS[7], // Midnight City — Monthly favorite (3 plays 10-24 days ago)
      offsetsHoursAgo: [10 * 24, 16 * 24, 23 * 24],
    },
    {
      track: SEED_TRACKS[4], // Russian Bandana — Monthly favorite (2 plays 12-20 days ago)
      offsetsHoursAgo: [12 * 24, 20 * 24],
    },
  ];

  const entries: PlayHistoryRecord[] = [];
  for (const item of schedule) {
    for (let i = 0; i < item.offsetsHoursAgo.length; i++) {
      const ts = nowMs - item.offsetsHoursAgo[i] * hourMs - (i * 7 * 60 * 1000) % dayMs;
      entries.push({
        id: `ph-${userId}-${item.track.videoId}-${i}`,
        user_id: userId,
        video_id: item.track.videoId,
        title: item.track.title,
        artist: item.track.artist,
        album_art: item.track.artworkUrl,
        played_at: new Date(ts).toISOString(),
        duration: item.track.duration || 210,
        album: item.track.album,
      });
    }
  }
  return entries;
}

const DEFAULT_DB: CrateDb = {
  profiles: [
    {
      id: 'owner-001',
      email: 'konxhari@gmail.com',
      mobile_number: '+91 98765 43210',
      password: '@Hxri8949!',
      full_name: 'Hari (Owner)',
      avatar_url: '/src/assets/images/avatar_owner_1794839824806.jpg',
      is_admin: true,
      is_approved: true,
      created_at: '2026-11-01T09:15:00Z',
    },
    {
      id: 'member-002',
      email: 'diya.sharma@crate.fm',
      mobile_number: '+91 98111 22334',
      password: 'Diya@9811',
      full_name: 'Diya Sharma',
      avatar_url: '/src/assets/images/avatar_listener_a_1794839824622.jpg',
      is_admin: false,
      is_approved: true,
      created_at: '2026-11-08T14:22:00Z',
    },
    {
      id: 'member-003',
      email: 'rohan.verma@crate.fm',
      mobile_number: '+91 98222 44556',
      password: 'Rohan#4455',
      full_name: 'Rohan Verma',
      avatar_url: '/src/assets/images/avatar_listener_b_1794839824116.jpg',
      is_admin: false,
      is_approved: true,
      created_at: '2026-11-11T18:05:00Z',
    },
    {
      id: 'member-004',
      email: 'kabir.singh@crate.fm',
      mobile_number: '+91 98333 66778',
      password: 'Kabir$6677',
      full_name: 'Kabir Singh',
      avatar_url: '/src/assets/images/avatar_listener_b_1794839824116.jpg',
      is_admin: false,
      is_approved: false,
      created_at: '2026-11-15T21:40:00Z',
    },
  ],
  mobileOtps: {},
  sessions: {},
  listeningHistory: {
    'owner-001': [
      { videoId: 'T94PHkuydcw', title: 'Kun Faya Kun', artist: 'A.R. Rahman', language: 'Hindi', playedAt: 1731700000000 },
      { videoId: 'BddP6PYo2gs', title: 'Kesariya', artist: 'Arijit Singh, Pritam', language: 'Hindi', playedAt: 1731690000000 },
      { videoId: '4NRXx6U8ABQ', title: 'Blinding Lights', artist: 'The Weeknd', language: 'Global', playedAt: 1731680000000 },
    ],
    'member-002': [
      { videoId: 'sK7riqg2mr4', title: 'Agar Tum Saath Ho', artist: 'Alka Yagnik, Arijit Singh', language: 'Hindi', playedAt: 1731700000000 },
      { videoId: 'JGwWNGJdvx8', title: 'Midnight City', artist: 'M83', language: 'Global', playedAt: 1731690000000 },
    ],
    'member-003': [
      { videoId: '4-5N_tY9z4s', title: '52 Gaj Ka Daman', artist: 'Renuka Panwar', language: 'Haryanvi', playedAt: 1731700000000 },
      { videoId: 'kJQP7kiw5Fk', title: 'Russian Bandana', artist: 'Dhanda Nyoliwala', language: 'Haryanvi', playedAt: 1731690000000 },
    ],
  },
  playHistory: [
    ...createSamplePlayHistoryForUser('owner-001'),
    ...createSamplePlayHistoryForUser('owner-harvix'),
    ...createSamplePlayHistoryForUser('member-002'),
  ],
  playHistorySettings: {},
  personalMixCache: {},
  ownerAuth: {
    totpSecret: '',
    totpEnrolled: false,
  },
  customPlaylists: [],
  deletedPlaylistIds: [],
  curatedPlaylistOverrides: {},
};

function normalizeMobile(raw: string): string {
  const trimmed = raw.trim();
  const digits = trimmed.replace(/\D/g, '');
  if (!digits) return '';
  if (trimmed.startsWith('+')) return `+${digits}`;
  if (digits.length === 10) return `+91${digits}`;
  return `+${digits}`;
}

function formatDisplayMobile(raw: string): string {
  const norm = normalizeMobile(raw);
  if (norm.startsWith('+91') && norm.length === 13) {
    return `+91 ${norm.slice(3, 8)} ${norm.slice(8)}`;
  }
  return norm || raw.trim();
}

function loadDb(): CrateDb {
  try {
    if (fs.existsSync(DB_FILE)) {
      const raw = fs.readFileSync(DB_FILE, 'utf-8');
      const parsed = JSON.parse(raw) as Partial<CrateDb>;
      if (Array.isArray(parsed.profiles)) {
        const defaultMobiles = new Map(
          DEFAULT_DB.profiles.map((p) => [p.email.toLowerCase(), p.mobile_number])
        );
        const defaultPasswords = new Map<string, string>([
          ['hari@harvix.space', '@Hxri8949!'],
          ['konxhari@gmail.com', '@Hxri8949!'],
          ['diya.sharma@crate.fm', 'Diya@9811'],
          ['rohan.verma@crate.fm', 'Rohan#4455'],
          ['kabir.singh@crate.fm', 'Kabir$6677'],
          ['neha.kapoor@crate.fm', 'Neha*2026'],
          ['konhxri@outlook.com', 'Hxri@8949'],
        ]);
        let didBackfill = false;
        const migratedProfiles = parsed.profiles
          .filter((p) => {
            const lower = p.email.toLowerCase();
            if (lower === 'qa.taste@crate.fm' || lower === 'qa.signup@crate.fm') {
              didBackfill = true;
              return false;
            }
            return true;
          })
          .map((p) => {
            const lowerEmail = p.email.toLowerCase();
            const fallbackPass =
              defaultPasswords.get(lowerEmail) ||
              `${(p.full_name || p.email).split(/[\s@]/)[0] || 'Crate'}@${(p.mobile_number || '1234').replace(/\D/g, '').slice(-4) || '2026'}`;
            if (!p.password) didBackfill = true;
            return {
              ...p,
              mobile_number:
                p.mobile_number || defaultMobiles.get(lowerEmail) || '+91 98000 00000',
              password: p.password || fallbackPass,
            };
          });
        const hasExistingOwnerSecret = Boolean(parsed.ownerAuth?.totpSecret);
        let playHistory = Array.isArray(parsed.playHistory) ? parsed.playHistory : [];
        if (!Array.isArray(parsed.playHistory)) {
          playHistory = [
            ...createSamplePlayHistoryForUser('owner-001'),
            ...createSamplePlayHistoryForUser('owner-harvix'),
            ...createSamplePlayHistoryForUser('member-002'),
          ];
          didBackfill = true;
        }
        const migrated: CrateDb = {
          profiles: migratedProfiles,
          mobileOtps: parsed.mobileOtps || {},
          sessions: parsed.sessions || {},
          listeningHistory: parsed.listeningHistory || structuredClone(DEFAULT_DB.listeningHistory),
          playHistory,
          playHistorySettings: parsed.playHistorySettings || {},
          personalMixCache: parsed.personalMixCache || {},
          ownerAuth: hasExistingOwnerSecret
            ? {
                totpSecret: parsed.ownerAuth!.totpSecret,
                totpEnrolled: Boolean(parsed.ownerAuth!.totpEnrolled),
              }
            : {
                totpSecret: generateBase32Secret(),
                totpEnrolled: false,
              },
          customPlaylists: Array.isArray(parsed.customPlaylists) ? parsed.customPlaylists : [],
          deletedPlaylistIds: Array.isArray(parsed.deletedPlaylistIds)
            ? parsed.deletedPlaylistIds
            : [],
          curatedPlaylistOverrides:
            parsed.curatedPlaylistOverrides && typeof parsed.curatedPlaylistOverrides === 'object'
              ? parsed.curatedPlaylistOverrides
              : {},
        };
        if (!hasExistingOwnerSecret || didBackfill) {
          saveDb(migrated);
        }
        return migrated;
      }
    }
  } catch {
    // Fallback to default seed DB
  }
  const seeded = structuredClone(DEFAULT_DB);
  seeded.ownerAuth = {
    totpSecret: generateBase32Secret(),
    totpEnrolled: false,
  };
  saveDb(seeded);
  return seeded;
}

function saveDb(db: CrateDb): void {
  const tmpFile = `${DB_FILE}.tmp`;
  fs.writeFileSync(tmpFile, JSON.stringify(db, null, 2), 'utf-8');
  fs.renameSync(tmpFile, DB_FILE);
}

const db = loadDb();
const ownerChallenges = new Map<string, { expiresAt: number }>();

// Automatic 30-day play_history cleanup script (runs on startup, hourly cron, and on insert)
function runAutomaticPlayHistoryCleanup(nowMs = Date.now()): number {
  const disabledUserIds = new Set(
    Object.entries(db.playHistorySettings || {})
      .filter(([, cfg]) => cfg && cfg.autoExpire30Days === false)
      .map(([uid]) => uid)
  );
  const kept: PlayHistoryRecord[] = [];
  let removedCount = 0;

  for (const item of db.playHistory) {
    if (disabledUserIds.has(item.user_id)) {
      kept.push(item);
      continue;
    }
    const { active, removedCount: pruned } = pruneExpiredPlayHistory([item], nowMs, 30);
    if (pruned > 0) {
      removedCount += pruned;
    } else if (active[0]) {
      kept.push(active[0]);
    }
  }

  if (removedCount > 0) {
    db.playHistory = kept;
    saveDb(db);
  }
  return removedCount;
}

runAutomaticPlayHistoryCleanup();
setInterval(() => {
  runAutomaticPlayHistoryCleanup();
}, 60 * 60 * 1000).unref();

function getUserAutoExpireSetting(userId: string): boolean {
  const cfg = db.playHistorySettings?.[userId];
  return cfg ? cfg.autoExpire30Days !== false : true;
}

function getDynamicTopPlaylistsForUser(user: UserProfile | null): Playlist[] {
  const effectiveUserId = user?.id || 'owner-harvix';
  const autoExpire = getUserAutoExpireSetting(effectiveUserId);
  return buildDynamicTopTrackPlaylists(
    db.playHistory || [],
    effectiveUserId,
    Date.now(),
    autoExpire
  );
}

function getAllPlaylistsForUser(user: UserProfile | null): Playlist[] {
  const deletedSet = new Set(db.deletedPlaylistIds || []);
  const overrides = db.curatedPlaylistOverrides || {};
  const topPlaylists = getDynamicTopPlaylistsForUser(user).filter(
    (p) => !deletedSet.has(p.id)
  );
  const curated = CURATED_PLAYLISTS.filter((p) => !deletedSet.has(p.id)).map((p) =>
    overrides[p.id] ? { ...p, tracks: overrides[p.id] } : p
  );
  const custom = db.customPlaylists.filter((p) => !deletedSet.has(p.id));
  return [...topPlaylists, ...curated, ...custom];
}

function ensureOwnerHarvixProfile(enteredPassword?: string): UserProfile {
  let profile = db.profiles.find((p) => p.email.toLowerCase() === OWNER_LOGIN_ID);
  if (!profile) {
    profile = {
      id: 'owner-harvix',
      email: OWNER_LOGIN_ID,
      mobile_number: '+91 98765 43210',
      password: enteredPassword || '@Hxri8949!',
      full_name: 'Hari (Owner)',
      avatar_url: '/src/assets/images/avatar_owner_1794839824806.jpg',
      is_admin: true,
      is_approved: true,
      created_at: '2026-11-01T09:15:00Z',
    };
    db.profiles.push(profile);
    saveDb(db);
  } else if (enteredPassword && profile.password !== enteredPassword) {
    profile.password = enteredPassword;
    saveDb(db);
  } else if (!profile.password) {
    profile.password = '@Hxri8949!';
    saveDb(db);
  }
  return profile;
}

function parseCookies(req: Request): Record<string, string> {
  const header = req.headers.cookie || '';
  const out: Record<string, string> = {};
  for (const part of header.split(';')) {
    const idx = part.indexOf('=');
    if (idx > 0) {
      const k = part.slice(0, idx).trim();
      const v = decodeURIComponent(part.slice(idx + 1).trim());
      out[k] = v;
    }
  }
  return out;
}

function extractRequestToken(req: Request): string {
  const cookies = parseCookies(req);
  const authHeader = req.headers.authorization;
  return (
    (authHeader?.startsWith('Bearer ') ? authHeader.slice(7).trim() : '') ||
    cookies['crate_session'] ||
    ''
  );
}

function extractOwnerToken(req: Request): string {
  const cookies = parseCookies(req);
  const headerToken = req.headers['x-owner-token'];
  const cleanHeader = Array.isArray(headerToken) ? headerToken[0] : headerToken;
  if (cleanHeader && cleanHeader.trim()) {
    return cleanHeader.trim();
  }
  if (cookies['crate_owner_session']) {
    return cookies['crate_owner_session'];
  }
  const fallback = extractRequestToken(req);
  if (fallback && db.sessions[fallback]?.ownerVerified) {
    return fallback;
  }
  return '';
}

function buildCookieString(
  req: Request,
  name: string,
  value: string,
  maxAgeSeconds: number
): string {
  const forwardedProto = String(req.headers['x-forwarded-proto'] || '').toLowerCase();
  const isHttps = req.secure || forwardedProto.includes('https');
  const cookieAttrs = isHttps
    ? `Path=/; HttpOnly; SameSite=None; Secure; Max-Age=${maxAgeSeconds}`
    : `Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAgeSeconds}`;
  return `${name}=${value}; ${cookieAttrs}`;
}

function setSessionCookie(
  req: Request,
  res: Response,
  sessionToken: string,
  maxAgeSeconds: number
): void {
  res.append('Set-Cookie', buildCookieString(req, 'crate_session', sessionToken, maxAgeSeconds));
}

function setOwnerSessionCookie(
  req: Request,
  res: Response,
  ownerToken: string,
  maxAgeSeconds: number
): void {
  res.append(
    'Set-Cookie',
    buildCookieString(req, 'crate_owner_session', ownerToken, maxAgeSeconds)
  );
}

function getSessionRecord(req: Request): SessionRecord | null {
  const token = extractRequestToken(req);
  if (!token) return null;
  const session = db.sessions[token];
  if (!session || session.expiresAt < Date.now()) {
    return null;
  }
  return session;
}

function getSessionUser(req: Request): UserProfile | null {
  const session = getSessionRecord(req);
  if (!session) return null;
  return db.profiles.find((p) => p.id === session.userId) ?? null;
}

function getVerifiedOwnerSession(req: Request): { session: SessionRecord; profile: UserProfile } | null {
  const token = extractOwnerToken(req);
  if (!token) return null;
  const session = db.sessions[token];
  if (!session || session.expiresAt < Date.now() || !session.ownerVerified) {
    return null;
  }
  const profile = db.profiles.find((p) => p.id === session.userId);
  if (!profile || !profile.is_admin) return null;
  return { session, profile };
}

// ---------------------------------------------------------------------------
// Self-Hosted YouTube Music Engine (ytmusic-api + play-dl)
// ---------------------------------------------------------------------------
let ytMusicInstance: YTMusic | null = null;
let ytMusicInitPromise: Promise<YTMusic> | null = null;

async function getYtMusicClient(): Promise<YTMusic> {
  if (ytMusicInstance) return ytMusicInstance;
  if (!ytMusicInitPromise) {
    ytMusicInitPromise = (async () => {
      const client = new YTMusic();
      await client.initialize();
      ytMusicInstance = client;
      return client;
    })();
  }
  try {
    return await ytMusicInitPromise;
  } catch (err) {
    ytMusicInitPromise = null;
    throw err;
  }
}

async function searchYouTubeMusic(query: string, limit = 12): Promise<YTMusicSearchResult[]> {
  const trimmed = query.trim();
  if (!trimmed) {
    return SEED_TRACKS.map((t) => ({
      title: t.title,
      artist: t.artist,
      albumArt: t.artworkUrl,
      videoId: t.videoId,
      album: t.album,
      duration: t.duration,
    }));
  }

  try {
    const client = await Promise.race([
      getYtMusicClient(),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('YTMusic init timeout')), 5000)
      ),
    ]);
    const songs = await Promise.race([
      client.searchSongs(trimmed),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('YTMusic search timeout')), 5000)
      ),
    ]);

    if (Array.isArray(songs) && songs.length > 0) {
      return songs.slice(0, limit).map((song) => {
        const sortedThumbs = [...(song.thumbnails || [])].sort(
          (a, b) => (b.width || 0) - (a.width || 0)
        );
        const albumArt =
          sortedThumbs[0]?.url ||
          '/src/assets/images/crate_cover_amber_vinyl_1794853068265.jpg';
        const artistNames =
          song.artists?.map((a) => a.name).filter(Boolean).join(', ') ||
          song.artist?.name ||
          'Unknown Artist';

        return {
          title: song.name,
          artist: artistNames,
          albumArt,
          videoId: song.videoId,
          album: song.album?.name || 'YouTube Music',
          duration: song.duration || 210,
        };
      });
    }
  } catch {
    // Graceful fallback when YouTube Music is blocked or offline in sandbox
  }

  const q = trimmed.toLowerCase();
  const matched = SEED_TRACKS.filter(
    (t) =>
      t.title.toLowerCase().includes(q) ||
      t.artist.toLowerCase().includes(q) ||
      (t.language || '').toLowerCase().includes(q)
  );
  const pool = matched.length > 0 ? matched : SEED_TRACKS.slice(0, Math.min(limit, 5));
  return pool.map((t) => ({
    title: t.title,
    artist: t.artist,
    albumArt: t.artworkUrl,
    videoId: t.videoId,
    album: t.album,
    duration: t.duration,
  }));
}

/**
 * Generates a harmonic stereo PCM WAV buffer (24 seconds) seeded by videoId
 * as an offline/sandbox playback fallback when YouTube restricts datacenter extraction.
 */
function generateSynthWav(seedStr: string): Buffer {
  let hash = 0;
  for (let i = 0; i < seedStr.length; i++) {
    hash = (hash * 31 + seedStr.charCodeAt(i)) >>> 0;
  }
  const sampleRate = 22050;
  const durationSec = 24;
  const numSamples = sampleRate * durationSec;
  const numChannels = 2;
  const bytesPerSample = 2;
  const dataSize = numSamples * numChannels * bytesPerSample;
  const buffer = Buffer.alloc(44 + dataSize);

  buffer.write('RIFF', 0);
  buffer.writeUInt32LE(36 + dataSize, 4);
  buffer.write('WAVE', 8);
  buffer.write('fmt ', 12);
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(numChannels, 22);
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(sampleRate * numChannels * bytesPerSample, 28);
  buffer.writeUInt16LE(numChannels * bytesPerSample, 32);
  buffer.writeUInt16LE(16, 34);
  buffer.write('data', 36);
  buffer.writeUInt32LE(dataSize, 40);

  const rootFreqs = [130.81, 146.83, 164.81, 174.61, 196.0, 220.0];
  const root = rootFreqs[hash % rootFreqs.length];
  const chordProgressions = [
    [1, 1.25, 1.5, 1.875],
    [1, 1.189, 1.5, 1.78],
    [1, 1.25, 1.5, 2.0],
    [1, 1.335, 1.5, 1.875],
  ];
  const chord = chordProgressions[(hash >>> 3) % chordProgressions.length];

  for (let i = 0; i < numSamples; i++) {
    const t = i / sampleRate;
    const bar = Math.floor(t / 2) % 4;
    const barRoot = root * [1, 1.122, 0.89, 1.25][bar];
    const beatPhase = (t % 0.5) / 0.5;
    const pulseEnv = Math.exp(-beatPhase * 3.5);
    const fadeIn = Math.min(1, t / 0.15);
    const fadeOut = Math.min(1, (durationSec - t) / 0.25);
    const masterEnv = fadeIn * fadeOut;

    let left = 0;
    let right = 0;
    for (let c = 0; c < chord.length; c++) {
      const freq = barRoot * chord[c];
      const wave = Math.sin(2 * Math.PI * freq * t) * 0.16;
      const shimmer = Math.sin(2 * Math.PI * freq * 2 * t) * 0.04 * pulseEnv;
      const pan = c % 2 === 0 ? 0.72 : 0.28;
      left += (wave + shimmer) * (1 - pan * 0.35);
      right += (wave + shimmer) * (0.65 + pan * 0.35);
    }
    const sub = Math.sin(2 * Math.PI * (barRoot * 0.5) * t) * 0.22 * (0.5 + 0.5 * pulseEnv);
    left = Math.max(-0.95, Math.min(0.95, (left + sub) * masterEnv));
    right = Math.max(-0.95, Math.min(0.95, (right + sub) * masterEnv));

    const offset = 44 + i * 4;
    buffer.writeInt16LE(Math.round(left * 32767), offset);
    buffer.writeInt16LE(Math.round(right * 32767), offset + 2);
  }
  return buffer;
}

// ---------------------------------------------------------------------------
// Headless AI Recommendations (Official @google/genai SDK + Per-User Taste)
// ---------------------------------------------------------------------------
function getGeminiClient(): GoogleGenAI | null {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || apiKey === 'MY_GEMINI_API_KEY') return null;
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

async function generateGeminiSongQueries(
  systemInstruction: string,
  userPrompt: string,
  fallbackQueries: string[]
): Promise<string[]> {
  const ai = getGeminiClient();
  if (ai) {
    const candidateModels = ['gemini-4-hydrogen', 'gemini-3.1-flash-lite'];
    for (const model of candidateModels) {
      try {
        const result = await ai.models.generateContent({
          model,
          contents: userPrompt,
          config: {
            systemInstruction,
            responseMimeType: 'application/json',
            responseSchema: {
              type: Type.ARRAY,
              items: { type: Type.STRING },
            },
            ...(model === 'gemini-4-hydrogen'
              ? { thinkingConfig: { thinkingLevel: ThinkingLevel.LOW } }
              : {}),
          },
        });
        const text = result.text || '';
        const parsed = parseSilentQueueStrings(text);
        if (parsed.length > 0) return parsed;
      } catch {
        // Try next model or fallback
      }
    }
  }
  return fallbackQueries;
}

async function generateSimilarSongQueries(
  songName: string,
  artist: string,
  userTaste?: string
): Promise<string[]> {
  const tasteLine = userTaste ? ` Listener personal taste: ${userTaste}` : '';
  const systemInstruction = `The user is currently listening to ${songName} by ${artist || 'Unknown Artist'}.${tasteLine} Return exactly 5 highly relevant similar songs (Hindi/Haryanvi/Punjabi/Global) personalized to their taste to continue the queue. You must return ONLY a JSON array of strings formatted as 'Title - Artist'.`;

  return generateGeminiSongQueries(
    systemInstruction,
    `Continue queue after "${songName}" by "${artist || 'Unknown Artist'}".`,
    [
      'Agar Tum Saath Ho - Arijit Singh',
      '52 Gaj Ka Daman - Renuka Panwar',
      'Starboy - The Weeknd',
      'Kun Faya Kun - A.R. Rahman',
      'Midnight City - M83',
    ]
  );
}

function buildPreferenceFallbackTracks(user: UserProfile | null): Track[] {
  const prefs = sanitizeUserPreferences(user?.preferences);
  const terms = [
    ...prefs.languages,
    ...prefs.genres,
    ...prefs.artists,
  ].map((s) => s.toLowerCase());

  if (terms.length === 0) return SEED_TRACKS;

  const scored = SEED_TRACKS.map((t) => {
    const hay = `${t.title} ${t.artist} ${t.album} ${t.language || ''}`.toLowerCase();
    const hits = terms.reduce((acc, term) => (hay.includes(term) ? acc + 1 : acc), 0);
    return { track: t, hits };
  }).sort((a, b) => b.hits - a.hits);

  return scored.map((s) => s.track);
}

async function recommendSingleRelatedTrack(
  songName: string,
  artist: string,
  excludeIds: Set<string>,
  excludeTitles: string[],
  userTaste: string
): Promise<Track | null> {
  const ai = getGeminiClient();
  let chosenTitle = '';
  let chosenArtist = '';
  let reason = `AI matched vibe & sound with ${songName}`;
  let searchQuery = '';

  if (ai) {
    const avoidLine =
      excludeTitles.length > 0
        ? ` Do NOT recommend any of these already-played/queued songs: ${excludeTitles.slice(-10).join(', ')}.`
        : '';
    const tasteLine = userTaste ? ` Listener preferences & taste: ${userTaste}.` : '';
    const systemInstruction = `You are Crate's AI music curator. Given the exact track currently playing, choose ONLY the single most related next song that flows seamlessly in mood, tempo, language, and sonic texture.${tasteLine}${avoidLine} Return JSON with title, artist, and a concise 5-to-8 word reason explaining the match.`;

    const candidateModels = ['gemini-4-hydrogen', 'gemini-3.1-flash-lite'];
    for (const model of candidateModels) {
      try {
        const result = await ai.models.generateContent({
          model,
          contents: `Currently playing: "${songName}" by "${artist || 'Unknown Artist'}". Pick the single best next song.`,
          config: {
            systemInstruction,
            responseMimeType: 'application/json',
            responseSchema: {
              type: Type.OBJECT,
              properties: {
                title: { type: Type.STRING, description: 'Recommended song title' },
                artist: { type: Type.STRING, description: 'Primary artist name' },
                reason: { type: Type.STRING, description: 'Short 5-8 word reason why this track matches' },
              },
              required: ['title', 'artist', 'reason'],
            },
            ...(model === 'gemini-4-hydrogen'
              ? { thinkingConfig: { thinkingLevel: ThinkingLevel.LOW } }
              : {}),
          },
        });
        const parsed = parseSingleNextTrackSuggestion(result.text || '');
        if (parsed && parsed.title.toLowerCase() !== songName.toLowerCase()) {
          chosenTitle = parsed.title;
          chosenArtist = parsed.artist;
          reason = parsed.reason || reason;
          searchQuery = parsed.query;
          break;
        }
      } catch {
        // Try next model or fallback
      }
    }
  }

  // Deterministic smart fallback matching artist/language/mood when Gemini is unavailable
  if (!searchQuery) {
    const lowerSong = `${songName} ${artist}`.toLowerCase();
    const matchingSeed =
      SEED_TRACKS.find(
        (t) =>
          !excludeIds.has(t.videoId) &&
          t.title.toLowerCase() !== songName.toLowerCase() &&
          (t.artist.toLowerCase().includes(artist.split(',')[0]?.trim().toLowerCase() || '') ||
            (t.language && lowerSong.includes(t.language.toLowerCase())))
      ) ||
      SEED_TRACKS.find(
        (t) => !excludeIds.has(t.videoId) && t.title.toLowerCase() !== songName.toLowerCase()
      );

    if (matchingSeed) {
      chosenTitle = matchingSeed.title;
      chosenArtist = matchingSeed.artist;
      searchQuery = `${matchingSeed.title} - ${matchingSeed.artist}`;
      reason = `Matched with ${artist || songName}`;
    } else {
      searchQuery = `${songName} ${artist} similar`;
    }
  }

  const results = await searchYouTubeMusic(searchQuery, 5);
  const match =
    results.find(
      (r) =>
        r.videoId &&
        !excludeIds.has(r.videoId) &&
        r.title.toLowerCase() !== songName.toLowerCase()
    ) || results.find((r) => r.videoId && !excludeIds.has(r.videoId));

  if (match) {
    return {
      id: match.videoId,
      videoId: match.videoId,
      title: match.title,
      artist: match.artist,
      album: match.album || 'AI Next Up',
      duration: match.duration || 210,
      artworkUrl: match.albumArt,
      source: 'silent-queue',
      aiReason: reason,
    };
  }

  const seedFallback = SEED_TRACKS.find((t) => !excludeIds.has(t.videoId));
  if (!seedFallback) return null;
  return {
    ...seedFallback,
    source: 'silent-queue',
    aiReason: reason || `Matched with ${chosenTitle || songName}`,
  };
}

async function getPersonalRecommendationsForUser(user: UserProfile | null): Promise<Track[]> {
  if (!user) return SEED_TRACKS;

  const history = db.listeningHistory[user.id] || [];
  const prefsSignature = getPreferencesSignature(user.preferences);
  const cached = db.personalMixCache[user.id];
  const twentyMins = 20 * 60 * 1000;
  if (
    cached &&
    cached.tracks.length > 0 &&
    cached.historyCount === history.length &&
    (cached.prefsSignature ?? '') === prefsSignature &&
    Date.now() - cached.updatedAt < twentyMins
  ) {
    return cached.tracks;
  }

  const tasteSummary = buildPersonalTasteSummary(history, user.preferences);
  const seedTrack = history[0] || buildPreferenceFallbackTracks(user)[0] || SEED_TRACKS[0];
  const prefs = sanitizeUserPreferences(user.preferences);
  const prefQueries =
    prefs.artists.length > 0
      ? prefs.artists.slice(0, 5).map((a) => `Best of ${a}`)
      : [
          'Shayad - Arijit Singh',
          'Apna Bana Le - Arijit Singh',
          'Save Your Tears - The Weeknd',
          'Lover - Diljit Dosanjh',
          '52 Gaj Ka Daman - Renuka Panwar',
        ];

  const systemInstruction = `You are Crate's AI music director curating the personal Home recommendations shelf for ${user.full_name || 'a listener'}. Their onboarding preferences & listening profile: ${tasteSummary}. Prioritize their selected languages, vibes/genres, and favorite artists. Return exactly 6 distinct song recommendations formatted strictly as 'Title - Artist'.`;

  const queries = await generateGeminiSongQueries(
    systemInstruction,
    `Pick 6 personalized songs for listener ${user.full_name || user.id} grounded in their preferences (${tasteSummary}) and seed "${seedTrack.title} - ${seedTrack.artist}".`,
    prefQueries
  );

  const searchArrays = await Promise.all(queries.map((q) => searchYouTubeMusic(q, 2)));
  const seen = new Set<string>();
  const recommended: Track[] = [];
  for (const results of searchArrays) {
    const match = results.find((r) => r.videoId && !seen.has(r.videoId));
    if (match) {
      seen.add(match.videoId);
      recommended.push({
        id: match.videoId,
        videoId: match.videoId,
        title: match.title,
        artist: match.artist,
        album: match.album || 'AI Picked For You',
        duration: match.duration || 210,
        artworkUrl: match.albumArt,
        source: 'ytmusic',
      });
    }
  }

  for (const fallback of buildPreferenceFallbackTracks(user)) {
    if (recommended.length >= 10) break;
    if (!seen.has(fallback.videoId)) {
      seen.add(fallback.videoId);
      recommended.push(fallback);
    }
  }

  const finalTracks =
    recommended.length > 0 ? recommended : buildPreferenceFallbackTracks(user);
  db.personalMixCache[user.id] = {
    tracks: finalTracks,
    historyCount: history.length,
    prefsSignature,
    updatedAt: Date.now(),
  };
  saveDb(db);
  return finalTracks;
}

// ---------------------------------------------------------------------------
// Express App & Routes
// ---------------------------------------------------------------------------
async function bootstrap() {
  const app = express();
  app.use(express.json({ limit: '5mb' }));
  app.use('/api', (_req, res, next) => {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
    next();
  });

  app.get('/api/health', (_req, res) => {
    res.json({ ok: true, service: 'crate-server' });
  });

  // Auth: Sign In with Email + Password only (no OTP required on Sign In)
  app.post('/api/auth/login', (req: Request, res: Response) => {
    const email = String(req.body?.email || '').trim().toLowerCase();
    const password = String(req.body?.password || '').trim();

    if (!email || !email.includes('@')) {
      return res.status(400).json({ error: 'Please enter a valid email address.' });
    }
    if (!password) {
      return res.status(400).json({ error: 'Please enter your password.' });
    }

    const profile = db.profiles.find((p) => p.email.toLowerCase() === email);
    if (!profile) {
      return res.status(401).json({ error: 'No account found with this email. Please sign up first.' });
    }
    if (profile.password && profile.password !== password) {
      return res.status(401).json({ error: 'Incorrect email or password.' });
    }
    if (!profile.password) {
      profile.password = password;
    }

    const sessionToken = crypto.randomBytes(32).toString('hex');
    db.sessions[sessionToken] = {
      userId: profile.id,
      expiresAt: Date.now() + 7 * 24 * 60 * 60 * 1000,
    };
    saveDb(db);

    setSessionCookie(req, res, sessionToken, 7 * 24 * 3600);
    res.json({ ok: true, profile, sessionToken });
  });

  // Auth: Sign Up — Send one-time OTP to Mobile Number (gathers PFP, Full Name, Email, Mobile Number, and Password)
  app.post('/api/auth/send-mobile-otp', (req: Request, res: Response) => {
    const email = String(req.body?.email || '').trim().toLowerCase();
    const rawMobile = String(req.body?.mobile_number || req.body?.mobileNumber || '').trim();
    const enteredPassword = String(req.body?.password || '').trim();
    const fullName = String(req.body?.full_name || req.body?.fullName || '').trim();
    const normalizedMobile = normalizeMobile(rawMobile);
    const digitsOnly = normalizedMobile.replace(/\D/g, '');

    if (!email || !email.includes('@')) {
      return res.status(400).json({ error: 'Please enter a valid email address.' });
    }
    if (digitsOnly.length < 10) {
      return res.status(400).json({ error: 'Please enter a valid mobile number (at least 10 digits).' });
    }

    const userIdForAvatar =
      db.profiles.find((p) => p.email.toLowerCase() === email)?.id || crypto.randomUUID();
    let avatarUrl = String(req.body?.avatar_url || req.body?.avatarUrl || '').trim();
    const avatarDataUrl = String(req.body?.avatar_data_url || req.body?.avatarDataUrl || '').trim();
    if (avatarDataUrl.startsWith('data:image/')) {
      const match = avatarDataUrl.match(/^data:image\/(png|jpeg|jpg|webp|gif);base64,(.+)$/i);
      if (match) {
        const ext = match[1].toLowerCase() === 'jpeg' ? 'jpg' : match[1].toLowerCase();
        const filename = `${userIdForAvatar}-${Date.now()}.${ext}`;
        fs.writeFileSync(path.join(AVATARS_DIR, filename), Buffer.from(match[2], 'base64'));
        avatarUrl = `/api/avatars/${filename}`;
      }
    }

    const displayMobile = formatDisplayMobile(normalizedMobile);
    let profile = db.profiles.find((p) => p.email.toLowerCase() === email);
    if (!profile) {
      const isOwner = email === 'konxhari@gmail.com';
      profile = {
        id: userIdForAvatar,
        email,
        mobile_number: displayMobile,
        password: enteredPassword || (isOwner ? '@Hxri8949!' : `Crate@${digitsOnly.slice(-4)}`),
        full_name: fullName || (isOwner ? 'Hari (Owner)' : ''),
        avatar_url:
          avatarUrl ||
          (isOwner
            ? '/src/assets/images/avatar_owner_1794839824806.jpg'
            : '/src/assets/images/avatar_listener_a_1794839824622.jpg'),
        is_admin: isOwner,
        is_approved: isOwner,
        created_at: new Date().toISOString(),
      };
      db.profiles.push(profile);
    } else {
      profile.mobile_number = displayMobile;
      if (enteredPassword) {
        profile.password = enteredPassword;
      }
      if (fullName) {
        profile.full_name = fullName;
      }
      if (avatarUrl) {
        profile.avatar_url = avatarUrl;
      }
    }

    const otpCode = String(Math.floor(100000 + Math.random() * 900000));
    const otpKey = `${email}::${normalizedMobile}`;
    db.mobileOtps[otpKey] = {
      email,
      mobileNumber: normalizedMobile,
      ...(fullName ? { fullName } : {}),
      ...(avatarUrl ? { avatarUrl } : {}),
      ...(enteredPassword ? { password: enteredPassword } : {}),
      code: otpCode,
      expiresAt: Date.now() + 5 * 60 * 1000,
    };
    saveDb(db);

    res.json({
      ok: true,
      email,
      mobileNumber: displayMobile,
      channel: 'sms',
      devOtp: otpCode,
    });
  });

  // Auth: Verify Mobile OTP (One-Time Sign Up Verification)
  app.post('/api/auth/verify-mobile-otp', (req: Request, res: Response) => {
    const email = String(req.body?.email || '').trim().toLowerCase();
    const rawMobile = String(req.body?.mobile_number || req.body?.mobileNumber || '').trim();
    const otp = String(req.body?.otp || '').trim();
    const normalizedMobile = normalizeMobile(rawMobile);
    const otpKey = `${email}::${normalizedMobile}`;
    const record = db.mobileOtps[otpKey];

    if (!record || record.expiresAt < Date.now() || record.code !== otp) {
      return res.status(401).json({ error: 'Invalid or expired mobile OTP.' });
    }
    delete db.mobileOtps[otpKey];

    const profile = db.profiles.find((p) => p.email.toLowerCase() === record.email);
    if (!profile) {
      return res.status(404).json({ error: 'Profile not found.' });
    }
    if (record.password) {
      profile.password = record.password;
    }
    if (record.fullName) {
      profile.full_name = record.fullName;
    }
    if (record.avatarUrl) {
      profile.avatar_url = record.avatarUrl;
    }

    const sessionToken = crypto.randomBytes(32).toString('hex');
    db.sessions[sessionToken] = {
      userId: profile.id,
      expiresAt: Date.now() + 7 * 24 * 60 * 60 * 1000,
    };
    saveDb(db);

    setSessionCookie(req, res, sessionToken, 7 * 24 * 3600);
    res.json({ ok: true, profile, sessionToken });
  });

  // Preview helper for ?autostart=1
  app.post('/api/auth/autostart', (req: Request, res: Response) => {
    const owner =
      db.profiles.find(
        (p) =>
          p.email.toLowerCase() === 'hari@harvix.space' ||
          p.email.toLowerCase() === 'konxhari@gmail.com' ||
          p.is_admin
      ) || ensureOwnerHarvixProfile();
    const sessionToken = crypto.randomBytes(32).toString('hex');
    db.sessions[sessionToken] = {
      userId: owner.id,
      expiresAt: Date.now() + 7 * 24 * 60 * 60 * 1000,
    };
    saveDb(db);
    setSessionCookie(req, res, sessionToken, 7 * 24 * 3600);
    res.json({ ok: true, profile: owner, sessionToken });
  });

  // Auth: Current session
  app.get('/api/auth/me', (req: Request, res: Response) => {
    const profile = getSessionUser(req);
    res.json({ profile });
  });

  // Auth: Logout
  app.post('/api/auth/logout', (req: Request, res: Response) => {
    const token = extractRequestToken(req);
    if (token && db.sessions[token]) {
      delete db.sessions[token];
      saveDb(db);
    }
    setSessionCookie(req, res, '', 0);
    res.json({ ok: true });
  });

  // Onboarding: Save Full Name & PFP to 'avatars' storage
  app.post('/api/onboarding', (req: Request, res: Response) => {
    const user = getSessionUser(req);
    if (!user) {
      return res.status(401).json({ error: 'Authentication required.' });
    }
    const fullName = String(req.body?.full_name || '').trim();
    if (!fullName) {
      return res.status(400).json({ error: 'Full name is required.' });
    }

    let avatarUrl = String(req.body?.avatar_url || user.avatar_url || '').trim();
    const avatarDataUrl = String(req.body?.avatar_data_url || '').trim();
    if (avatarDataUrl.startsWith('data:image/')) {
      const match = avatarDataUrl.match(/^data:image\/(png|jpeg|jpg|webp);base64,(.+)$/i);
      if (match) {
        const ext = match[1].toLowerCase() === 'jpeg' ? 'jpg' : match[1].toLowerCase();
        const filename = `${user.id}-${Date.now()}.${ext}`;
        fs.writeFileSync(path.join(AVATARS_DIR, filename), Buffer.from(match[2], 'base64'));
        avatarUrl = `/api/avatars/${filename}`;
      }
    }

    if (!avatarUrl) {
      avatarUrl = '/src/assets/images/avatar_listener_a_1794839824622.jpg';
    }

    user.full_name = fullName;
    if (req.body?.mobile_number) {
      user.mobile_number = formatDisplayMobile(String(req.body.mobile_number));
    }
    user.avatar_url = avatarUrl;
    if (req.body?.preferences) {
      user.preferences = sanitizeUserPreferences(req.body.preferences);
      delete db.personalMixCache[user.id];
    }
    saveDb(db);

    res.json({ ok: true, profile: user });
  });

  // Preferences: Update listener music tastes & clear AI recommendation cache
  app.put('/api/preferences', (req: Request, res: Response) => {
    const user = getSessionUser(req);
    if (!user) {
      return res.status(401).json({ error: 'Authentication required.' });
    }
    user.preferences = sanitizeUserPreferences(req.body?.preferences || req.body);
    delete db.personalMixCache[user.id];
    saveDb(db);
    res.json({ ok: true, profile: user });
  });

  app.get('/api/avatars/:filename', (req: Request, res: Response) => {
    const safeName = path.basename(req.params.filename);
    const filePath = path.join(AVATARS_DIR, safeName);
    if (!fs.existsSync(filePath)) {
      return res.status(404).end();
    }
    res.sendFile(filePath);
  });

  app.get('/api/playlist-covers/:filename', (req: Request, res: Response) => {
    const safeName = path.basename(req.params.filename);
    const filePath = path.join(PLAYLIST_COVERS_DIR, safeName);
    if (!fs.existsSync(filePath)) {
      return res.status(404).end();
    }
    res.sendFile(filePath);
  });

  // Owner Access Portal (/owner): ID + Password + Microsoft Authenticator TOTP
  app.get('/api/owner/status', (req: Request, res: Response) => {
    const verified = getVerifiedOwnerSession(req);
    res.json({
      authenticated: Boolean(verified),
      ownerEmail: verified ? OWNER_LOGIN_ID : undefined,
      totpEnrolled: db.ownerAuth.totpEnrolled,
    });
  });

  app.post('/api/owner/verify-credentials', async (req: Request, res: Response) => {
    const email = String(req.body?.email || '').trim().toLowerCase();
    const password = String(req.body?.password || '');

    if (email !== OWNER_LOGIN_ID || !verifyOwnerPassword(password)) {
      return res.status(401).json({ error: 'Invalid owner ID or password.' });
    }

    ensureOwnerHarvixProfile(password);
    const challengeToken = crypto.randomBytes(24).toString('hex');
    ownerChallenges.set(challengeToken, { expiresAt: Date.now() + 5 * 60 * 1000 });

    const otpauthUri = buildOtpAuthUri({
      issuer: 'Crate',
      accountName: OWNER_LOGIN_ID,
      secret: db.ownerAuth.totpSecret,
    });
    const qrDataUrl = await QRCode.toDataURL(otpauthUri, {
      width: 220,
      margin: 1,
      color: { dark: '#09090B', light: '#F5EFE6' },
    });

    res.json({
      ok: true,
      challengeToken,
      account: OWNER_LOGIN_ID,
      issuer: 'Crate',
      totpEnrolled: db.ownerAuth.totpEnrolled,
      manualSecret: db.ownerAuth.totpSecret,
      qrDataUrl,
    });
  });

  app.post('/api/owner/verify-totp', (req: Request, res: Response) => {
    const challengeToken = String(req.body?.challengeToken || '').trim();
    const code = String(req.body?.code || '').trim();
    const challenge = ownerChallenges.get(challengeToken);

    if (!challenge || challenge.expiresAt < Date.now()) {
      ownerChallenges.delete(challengeToken);
      return res.status(401).json({ error: 'Verification session expired. Re-enter password.' });
    }

    if (!verifyTotpCode(db.ownerAuth.totpSecret, code, Date.now(), 1)) {
      return res.status(401).json({ error: 'Invalid Microsoft Authenticator OTP code.' });
    }

    ownerChallenges.delete(challengeToken);
    db.ownerAuth.totpEnrolled = true;

    const ownerProfile = ensureOwnerHarvixProfile();
    const ownerToken = crypto.randomBytes(32).toString('hex');
    db.sessions[ownerToken] = {
      userId: ownerProfile.id,
      expiresAt: Date.now() + 12 * 60 * 60 * 1000,
      ownerVerified: true,
    };
    saveDb(db);

    setOwnerSessionCookie(req, res, ownerToken, 12 * 3600);
    res.json({
      ok: true,
      authenticated: true,
      profile: ownerProfile,
      ownerToken,
    });
  });

  app.post('/api/owner/logout', (req: Request, res: Response) => {
    const token = extractOwnerToken(req);
    if (token && db.sessions[token]) {
      delete db.sessions[token];
      saveDb(db);
    }
    setOwnerSessionCookie(req, res, '', 0);
    res.json({ ok: true });
  });

  // Admin: Searchable list of all users (Verified Owner at /owner only)
  app.get('/api/admin/users', (req: Request, res: Response) => {
    const verified = getVerifiedOwnerSession(req);
    if (!verified) {
      return res.status(403).json({ error: 'Owner verification with Microsoft Authenticator required.' });
    }
    const q = String(req.query.q || '').trim().toLowerCase();
    const filtered = q
      ? db.profiles.filter(
          (p) =>
            p.full_name.toLowerCase().includes(q) ||
            p.email.toLowerCase().includes(q) ||
            (p.mobile_number || '').toLowerCase().includes(q)
        )
      : db.profiles;

    const sorted = [...filtered].sort(
      (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    );
    res.json({ users: sorted });
  });

  // Admin: Flip is_approved status (Verified Owner at /owner only)
  app.patch('/api/admin/users/:id/approval', (req: Request, res: Response) => {
    const verified = getVerifiedOwnerSession(req);
    if (!verified) {
      return res.status(403).json({ error: 'Owner verification with Microsoft Authenticator required.' });
    }
    const target = db.profiles.find((p) => p.id === req.params.id);
    if (!target) {
      return res.status(404).json({ error: 'User not found.' });
    }
    if (target.id === verified.profile.id || target.email.toLowerCase() === OWNER_LOGIN_ID) {
      return res.status(400).json({ error: 'Cannot revoke owner self-access.' });
    }
    const nextApproved =
      typeof req.body?.is_approved === 'boolean'
        ? req.body.is_approved
        : !target.is_approved;
    target.is_approved = nextApproved;
    saveDb(db);
    res.json({ ok: true, user: target });
  });

  // Admin: Delete member account (Verified Owner at /owner only)
  app.delete('/api/admin/users/:id', (req: Request, res: Response) => {
    const verified = getVerifiedOwnerSession(req);
    if (!verified) {
      return res.status(403).json({ error: 'Owner verification with Microsoft Authenticator required.' });
    }
    const targetIdx = db.profiles.findIndex((p) => p.id === req.params.id);
    if (targetIdx === -1) {
      return res.status(404).json({ error: 'User not found.' });
    }
    const target = db.profiles[targetIdx];
    if (target.id === verified.profile.id || target.email.toLowerCase() === OWNER_LOGIN_ID) {
      return res.status(400).json({ error: 'Cannot delete the owner account.' });
    }

    db.profiles.splice(targetIdx, 1);
    for (const [token, session] of Object.entries(db.sessions)) {
      if (session.userId === target.id) {
        delete db.sessions[token];
      }
    }
    delete db.listeningHistory[target.id];
    delete db.personalMixCache[target.id];
    for (const [key, rec] of Object.entries(db.mobileOtps)) {
      if (rec.email.toLowerCase() === target.email.toLowerCase()) {
        delete db.mobileOtps[key];
      }
    }
    saveDb(db);
    res.json({ ok: true, deletedId: target.id });
  });

  // Owner: Live Bot Suggestion Health & Diagnostic Test (/api/owner/bot-test)
  app.post('/api/owner/bot-test', async (req: Request, res: Response) => {
    const verified = getVerifiedOwnerSession(req);
    if (!verified) {
      return res.status(403).json({ error: 'Owner verification with Microsoft Authenticator required.' });
    }

    const songName = String(req.body?.songName || 'Kesariya').trim();
    const artist = String(req.body?.artist || 'Arijit Singh').trim();
    const started = Date.now();
    const ai = getGeminiClient();
    const geminiConfigured = Boolean(ai);
    let geminiLive = false;
    let modelUsed: string | null = null;
    let botError = '';
    let suggestedQueries: string[] = [];

    if (ai) {
      const candidateModels = ['gemini-4-hydrogen', 'gemini-3.1-flash-lite'];
      const systemInstruction = `The user is currently listening to ${songName} by ${artist}. Return exactly 5 highly relevant similar songs (Hindi/Haryanvi/Global) to continue the queue. You must return ONLY a raw JSON array of strings formatted as 'Title - Artist'.`;
      for (const model of candidateModels) {
        try {
          const result = await ai.models.generateContent({
            model,
            contents: `Continue queue after "${songName}" by "${artist}".`,
            config: {
              systemInstruction,
              responseMimeType: 'application/json',
              responseSchema: {
                type: Type.ARRAY,
                items: { type: Type.STRING },
              },
            },
          });
          const parsed = parseSilentQueueStrings(result.text || '');
          if (parsed.length > 0) {
            suggestedQueries = parsed;
            geminiLive = true;
            modelUsed = model;
            break;
          }
        } catch (err) {
          botError = err instanceof Error ? err.message : 'Gemini request failed';
        }
      }
    } else {
      botError = 'GEMINI_API_KEY is missing or unset.';
    }

    if (suggestedQueries.length === 0) {
      suggestedQueries = [
        'Agar Tum Saath Ho - Arijit Singh',
        '52 Gaj Ka Daman - Renuka Panwar',
        'Starboy - The Weeknd',
        'Kun Faya Kun - A.R. Rahman',
        'Midnight City - M83',
      ];
    }

    let ytMusicWorking = false;
    const resolvedTracks: Track[] = [];
    const seen = new Set<string>();
    try {
      const searchArrays = await Promise.all(suggestedQueries.map((q) => searchYouTubeMusic(q, 2)));
      for (const results of searchArrays) {
        const match = results.find((r) => r.videoId && !seen.has(r.videoId));
        if (match) {
          seen.add(match.videoId);
          ytMusicWorking = true;
          resolvedTracks.push({
            id: match.videoId,
            videoId: match.videoId,
            title: match.title,
            artist: match.artist,
            album: match.album || 'Bot Suggestion',
            duration: match.duration || 210,
            artworkUrl: match.albumArt,
            source: 'silent-queue',
          });
        }
      }
    } catch {
      ytMusicWorking = false;
    }

    res.json({
      ok: true,
      geminiConfigured,
      geminiLive,
      modelUsed,
      ytMusicWorking,
      latencyMs: Date.now() - started,
      seedQuery: `${songName} - ${artist}`,
      suggestions: resolvedTracks,
      error: geminiLive ? undefined : botError || undefined,
    });
  });

  // Automated Weekly & Monthly Top Tracks + Curated + Imported + Custom Playlists
  app.get('/api/playlists', (req: Request, res: Response) => {
    const user = getSessionUser(req);
    res.json({
      playlists: getAllPlaylistsForUser(user),
      tracks: SEED_TRACKS,
    });
  });

  // Create Custom Spotify-Style Playlist
  app.post('/api/playlists', async (req: Request, res: Response) => {
    const user = getSessionUser(req);
    const verifiedOwner = getVerifiedOwnerSession(req);
    if (!user && !verifiedOwner) {
      return res.status(401).json({ error: 'Authentication required to create playlists.' });
    }

    const name = String(req.body?.name || '').trim();
    if (!name) {
      return res.status(400).json({ error: 'Playlist name is required.' });
    }
    const description = String(req.body?.description || '').trim() || 'Custom Crate playlist';
    const category = String(req.body?.category || 'Custom').trim();
    const rawTags = Array.isArray(req.body?.tags)
      ? req.body.tags.map((t: unknown) => String(t || '').trim()).filter(Boolean)
      : [category, ...name.split(/\s+/).slice(0, 3)];

    const allCatalogTracks: Track[] = [
      ...db.customPlaylists.flatMap((p) => p.tracks),
      ...CURATED_PLAYLISTS.flatMap((p) => p.tracks),
      ...SEED_TRACKS,
    ];

    let coverUrl = '';
    let coverImages: string[] | undefined;
    const coverDataUrl = String(req.body?.cover_data_url || req.body?.coverDataUrl || '').trim();
    if (coverDataUrl) {
      const match = coverDataUrl.match(/^data:image\/(png|jpeg|jpg|webp|gif);base64,(.+)$/i);
      if (!match) {
        return res.status(400).json({ error: 'Unsupported playlist icon format. Use PNG, JPG, WEBP, or GIF.' });
      }
      const buffer = Buffer.from(match[2], 'base64');
      if (buffer.byteLength > 4.5 * 1024 * 1024) {
        return res.status(400).json({ error: 'Playlist icon must be under 4.5 MB.' });
      }
      const ext = match[1].toLowerCase() === 'jpeg' ? 'jpg' : match[1].toLowerCase();
      const filename = `pl-${crypto.randomUUID().slice(0, 8)}-${Date.now()}.${ext}`;
      fs.writeFileSync(path.join(PLAYLIST_COVERS_DIR, filename), buffer);
      coverUrl = `/api/playlist-covers/${filename}`;
    } else {
      coverImages = pickRandomCoverImages(allCatalogTracks, 4);
    }

    const manualText = String(req.body?.manualText || '').trim();
    const resolvedTracks: Track[] = [];
    if (manualText) {
      const candidates = parseManualTrackLines(manualText).slice(0, 20);
      const seen = new Set<string>();
      const matched = await Promise.all(
        candidates.map(async (item, idx) => {
          const query = `${item.title} ${item.artist === 'Unknown Artist' ? '' : item.artist}`.trim();
          const results = await searchYouTubeMusic(query, 2);
          const pick = results.find((r) => r.videoId && !seen.has(r.videoId)) || results[0];
          const videoId = pick?.videoId || `pl-${idx}-${Date.now()}`;
          seen.add(videoId);
          return {
            id: videoId,
            videoId,
            title: item.title,
            artist: item.artist,
            album: name,
            duration: item.durationSec || pick?.duration || 210,
            artworkUrl:
              pick?.albumArt || '/src/assets/images/crate_cover_amber_vinyl_1794853068265.jpg',
            source: 'ytmusic' as const,
          };
        })
      );
      resolvedTracks.push(...matched);
    } else if (Array.isArray(req.body?.tracks) && req.body.tracks.length > 0) {
      resolvedTracks.push(...(req.body.tracks as Track[]).slice(0, 30));
    } else if (coverImages && coverImages.length > 0) {
      // Pair the 4 collage covers with matching playable tracks when available
      const seenIds = new Set<string>();
      for (const imgUrl of coverImages) {
        const matching = allCatalogTracks.find(
          (t) => t.artworkUrl === imgUrl && !seenIds.has(t.videoId)
        );
        if (matching) {
          seenIds.add(matching.videoId);
          resolvedTracks.push(matching);
        }
      }
      if (resolvedTracks.length < 4) {
        for (const t of SEED_TRACKS) {
          if (!seenIds.has(t.videoId)) {
            seenIds.add(t.videoId);
            resolvedTracks.push(t);
          }
          if (resolvedTracks.length >= 4) break;
        }
      }
    } else {
      const moodMatches = searchPlaylists(CURATED_PLAYLISTS, `${name} ${description} ${category}`);
      const starterTracks = (moodMatches[0]?.tracks || SEED_TRACKS).slice(0, 4);
      resolvedTracks.push(...starterTracks);
    }

    const accents = ['rose', 'violet', 'emerald'];
    const idx = db.customPlaylists.length;
    const created: Playlist = {
      id: `custom-${crypto.randomUUID().slice(0, 8)}`,
      name,
      description,
      coverUrl,
      ...(coverImages && coverImages.length > 0 ? { coverImages } : {}),
      accent: accents[idx % accents.length],
      category,
      tags: rawTags,
      tracks: resolvedTracks,
    };

    db.customPlaylists.unshift(created);
    saveDb(db);
    res.json({ ok: true, playlist: created });
  });

  // Import Entire Playlist from Spotify URL (extracts ALL songs & resolves playable audio)
  app.post('/api/playlists/import-spotify', async (req: Request, res: Response) => {
    const user = getSessionUser(req);
    const verifiedOwner = getVerifiedOwnerSession(req);
    if (!user && !verifiedOwner) {
      return res.status(401).json({ error: 'Authentication required to import playlists.' });
    }

    const rawUrl = String(req.body?.url || '').trim();
    const manualText = String(req.body?.manualText || '').trim();
    const customName = String(req.body?.customName || '').trim();

    let playlistName = customName || 'Imported Spotify Crate';
    let description = 'Imported from Spotify';
    let coverUrl = '/src/assets/images/crate_cover_bronze_wave_1794853069757.jpg';
    let candidates: SpotifyTrackCandidate[] = [];
    let spotifyPlaylistId: string | null = null;

    if (rawUrl) {
      spotifyPlaylistId = extractSpotifyPlaylistId(rawUrl);
      if (!spotifyPlaylistId) {
        return res.status(400).json({
          error: 'Invalid Spotify playlist URL. Paste a link like https://open.spotify.com/playlist/...',
        });
      }

      try {
        const embedRes = await fetch(
          `https://open.spotify.com/embed/playlist/${encodeURIComponent(spotifyPlaylistId)}`,
          {
            headers: {
              'User-Agent':
                'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
            },
          }
        );

        if (!embedRes.ok) {
          return res.status(400).json({
            error: `Spotify returned HTTP ${embedRes.status}. Ensure the playlist is public.`,
          });
        }

        const html = await embedRes.text();
        const parsed = parseSpotifyEmbedHtml(html, spotifyPlaylistId);
        if (!parsed || parsed.tracks.length === 0) {
          return res.status(400).json({
            error: 'Could not read tracks from that Spotify playlist. Make sure it is public, or paste songs manually below.',
          });
        }

        playlistName = customName || parsed.name;
        description = parsed.description;
        coverUrl = parsed.coverUrl;
        candidates = [...parsed.tracks];

        // If playlist has 100+ tracks and an embed token is available, try fetching additional pages
        if (parsed.tracks.length >= 100 && parsed.accessToken) {
          let offset = 100;
          while (offset < 500) {
            try {
              const pageRes = await fetch(
                `https://api.spotify.com/v1/playlists/${encodeURIComponent(
                  spotifyPlaylistId
                )}/tracks?offset=${offset}&limit=100&fields=next,items(track(name,duration_ms,artists(name)))`,
                { headers: { Authorization: `Bearer ${parsed.accessToken}` } }
              );
              if (!pageRes.ok) break;
              const pageData = (await pageRes.json()) as {
                next?: string | null;
                items?: Array<{
                  track?: {
                    name?: string;
                    duration_ms?: number;
                    artists?: Array<{ name?: string }>;
                  } | null;
                }>;
              };
              const pageItems = pageData.items || [];
              if (pageItems.length === 0) break;
              for (const item of pageItems) {
                if (item.track?.name) {
                  candidates.push({
                    title: item.track.name.trim(),
                    artist:
                      item.track.artists?.map((a) => a.name).filter(Boolean).join(', ') ||
                      'Unknown Artist',
                    durationSec: item.track.duration_ms
                      ? Math.round(item.track.duration_ms / 1000)
                      : 210,
                  });
                }
              }
              if (!pageData.next) break;
              offset += 100;
            } catch {
              break;
            }
          }
        }
      } catch {
        return res.status(502).json({
          error: 'Could not reach Spotify right now. You can also paste songs manually below.',
        });
      }
    } else if (manualText) {
      candidates = parseManualTrackLines(manualText);
      description = 'Imported tracklist';
    } else {
      return res.status(400).json({ error: 'Provide a Spotify playlist URL or paste songs.' });
    }

    if (candidates.length === 0) {
      return res.status(400).json({ error: 'No valid songs found to import.' });
    }

    // Match ALL songs concurrently in small batches so every single song is playable in Crate
    const BATCH_SIZE = 6;
    const resolvedTracks: Track[] = [];
    const seenVideoIds = new Set<string>();

    for (let i = 0; i < candidates.length; i += BATCH_SIZE) {
      const batch = candidates.slice(i, i + BATCH_SIZE);
      const matched = await Promise.all(
        batch.map(async (item, batchIdx) => {
          const query = `${item.title} ${item.artist === 'Unknown Artist' ? '' : item.artist}`.trim();
          const results = await searchYouTubeMusic(query, 3);
          const pick = results.find((r) => r.videoId && !seenVideoIds.has(r.videoId)) || results[0];
          const videoId = pick?.videoId || `sp-${i + batchIdx}-${Date.now()}`;
          seenVideoIds.add(videoId);
          return {
            id: videoId,
            videoId,
            title: item.title,
            artist: item.artist,
            album: playlistName,
            duration: item.durationSec || pick?.duration || 210,
            artworkUrl: pick?.albumArt || coverUrl,
            source: 'ytmusic' as const,
          };
        })
      );
      resolvedTracks.push(...matched);
    }

    const accents = ['rose', 'violet', 'emerald'];
    const crateId = spotifyPlaylistId
      ? `sp-${spotifyPlaylistId}`
      : `sp-custom-${crypto.randomUUID().slice(0, 8)}`;

    const importedPlaylist: Playlist = {
      id: crateId,
      name: playlistName,
      description: `${description} · ${resolvedTracks.length} tracks`,
      coverUrl,
      accent: accents[db.customPlaylists.length % accents.length],
      tracks: resolvedTracks,
    };

    const existingIdx = db.customPlaylists.findIndex((p) => p.id === crateId);
    if (existingIdx !== -1) {
      db.customPlaylists[existingIdx] = importedPlaylist;
    } else {
      db.customPlaylists.unshift(importedPlaylist);
    }
    saveDb(db);

    res.json({
      ok: true,
      playlist: importedPlaylist,
      importedCount: resolvedTracks.length,
    });
  });

  app.delete('/api/playlists/:id', (req: Request, res: Response) => {
    const user = getSessionUser(req);
    const verifiedOwner = getVerifiedOwnerSession(req);
    if (!user && !verifiedOwner) {
      return res.status(401).json({ error: 'Authentication required.' });
    }
    const playlistId = String(req.params.id || '').trim();
    if (!playlistId) {
      return res.status(400).json({ error: 'Playlist ID is required.' });
    }

    const idx = db.customPlaylists.findIndex((p) => p.id === playlistId);
    if (idx !== -1) {
      const [removed] = db.customPlaylists.splice(idx, 1);
      if (removed?.coverUrl?.startsWith('/api/playlist-covers/')) {
        const safeName = path.basename(removed.coverUrl);
        const coverPath = path.join(PLAYLIST_COVERS_DIR, safeName);
        if (fs.existsSync(coverPath)) {
          try {
            fs.unlinkSync(coverPath);
          } catch {
            // ignore cleanup failure
          }
        }
      }
    } else {
      db.deletedPlaylistIds = Array.from(
        new Set([...(db.deletedPlaylistIds || []), playlistId])
      );
      if (db.curatedPlaylistOverrides?.[playlistId]) {
        delete db.curatedPlaylistOverrides[playlistId];
      }
    }

    saveDb(db);
    res.json({
      ok: true,
      deletedId: playlistId,
      playlists: getAllPlaylistsForUser(user),
    });
  });

  // Remove a single song from any playlist (Custom, Imported, Curated, or Top Tracks)
  app.delete('/api/playlists/:id/tracks/:videoId', (req: Request, res: Response) => {
    const user = getSessionUser(req);
    const verifiedOwner = getVerifiedOwnerSession(req);
    if (!user && !verifiedOwner) {
      return res.status(401).json({ error: 'Authentication required.' });
    }

    const playlistId = String(req.params.id || '').trim();
    const targetVideoId = String(req.params.videoId || '').trim();
    if (!playlistId || !targetVideoId) {
      return res.status(400).json({ error: 'Playlist ID and track videoId are required.' });
    }

    // 1. Auto-generated Weekly / Monthly Top Tracks -> remove matching play_history rows
    if (playlistId === 'pl-weekly-top-tracks' || playlistId === 'pl-monthly-top-tracks') {
      const effectiveUserId = user?.id || 'owner-harvix';
      db.playHistory = (db.playHistory || []).filter(
        (entry) => !(entry.user_id === effectiveUserId && entry.video_id === targetVideoId)
      );
      saveDb(db);
      return res.json({
        ok: true,
        playlistId,
        removedVideoId: targetVideoId,
        playlists: getAllPlaylistsForUser(user),
      });
    }

    // 2. Custom / Imported Spotify playlist
    const customIdx = db.customPlaylists.findIndex((p) => p.id === playlistId);
    if (customIdx !== -1) {
      const targetPl = db.customPlaylists[customIdx];
      const nextTracks = targetPl.tracks.filter(
        (t) => t.videoId !== targetVideoId && t.id !== targetVideoId
      );
      db.customPlaylists[customIdx] = {
        ...targetPl,
        tracks: nextTracks,
      };
      saveDb(db);
      return res.json({
        ok: true,
        playlistId,
        removedVideoId: targetVideoId,
        playlists: getAllPlaylistsForUser(user),
      });
    }

    // 3. Curated playlist
    const curatedPl = CURATED_PLAYLISTS.find((p) => p.id === playlistId);
    if (curatedPl) {
      db.curatedPlaylistOverrides = db.curatedPlaylistOverrides || {};
      const currentTracks = db.curatedPlaylistOverrides[playlistId] || curatedPl.tracks;
      db.curatedPlaylistOverrides[playlistId] = currentTracks.filter(
        (t) => t.videoId !== targetVideoId && t.id !== targetVideoId
      );
      saveDb(db);
      return res.json({
        ok: true,
        playlistId,
        removedVideoId: targetVideoId,
        playlists: getAllPlaylistsForUser(user),
      });
    }

    return res.status(404).json({ error: 'Playlist not found.' });
  });

  // Per-User Personal Recommendations (/api/recommendations)
  app.get('/api/recommendations', async (req: Request, res: Response) => {
    const user = getSessionUser(req);
    const tracks = await getPersonalRecommendationsForUser(user);
    res.json({
      tracks,
      personalizedFor: user?.full_name || 'Guest',
    });
  });

  // Continue More Recommendations in Search (/api/recommendations/more)
  app.post('/api/recommendations/more', async (req: Request, res: Response) => {
    const user = getSessionUser(req);
    const query = String(req.body?.query || '').trim();
    const seedTitle = String(req.body?.seedTitle || '').trim();
    const seedArtist = String(req.body?.seedArtist || '').trim();
    const excludeIds = new Set<string>(
      Array.isArray(req.body?.excludeIds) ? req.body.excludeIds.map(String) : []
    );
    const excludeTitles: string[] = Array.isArray(req.body?.excludeTitles)
      ? req.body.excludeTitles.map((s: unknown) => String(s || '').trim())
      : [];
    const lowerExcludedTitles = new Set(excludeTitles.map((t: string) => t.toLowerCase()));

    const history = user ? db.listeningHistory[user.id] || [] : [];
    const tasteSummary = buildPersonalTasteSummary(history, user?.preferences);
    const seedContext = query
      ? `search query "${query}"`
      : seedTitle
        ? `track "${seedTitle}" by "${seedArtist || 'Unknown Artist'}"`
        : history[0]
          ? `recently played "${history[0].title}" by "${history[0].artist}"`
          : 'their personal taste';

    const avoidClause =
      excludeTitles.length > 0
        ? ` Do NOT include any of these songs already shown: ${excludeTitles.slice(-12).join(', ')}.`
        : '';

    const systemInstruction = `You are Crate's AI music curator continuing more song recommendations in Search for ${user?.full_name || 'a listener'}. Based on ${seedContext} and their listening profile (${tasteSummary}), return 6 fresh song recommendations formatted strictly as 'Title - Artist'.${avoidClause}`;

    const fallbackQueries = query
      ? [
          `${query} hit songs`,
          `${query} acoustic remix`,
          `Best of ${seedArtist || query}`,
          'Tum Se Hi - Mohit Chauhan',
          'Chaleya - Arijit Singh',
          'Ilahi - Arijit Singh',
        ]
      : [
          'Tum Se Hi - Mohit Chauhan',
          'Chaleya - Arijit Singh',
          'Ilahi - Arijit Singh',
          'Kabira - Tochi Raina, Rekha Bhardwaj',
          'Raatan Lambiyan - Jubin Nautiyal',
          'One Love - Shubh',
        ];

    const aiQueries = await generateGeminiSongQueries(
      systemInstruction,
      `Suggest 6 more recommended songs continuing from ${seedContext}.`,
      fallbackQueries
    );

    const broadQuery = query
      ? `${query} popular songs`
      : seedArtist
        ? `${seedArtist} songs`
        : 'Trending Hindi Punjabi Global songs';

    const [aiResultsArrays, broadResults] = await Promise.all([
      Promise.all(aiQueries.map((q) => searchYouTubeMusic(q, 3))),
      searchYouTubeMusic(broadQuery, 14),
    ]);

    const moreTracks: Track[] = [];
    const pushCandidate = (r: YTMusicSearchResult, labelAlbum?: string) => {
      if (!r.videoId || excludeIds.has(r.videoId)) return;
      if (lowerExcludedTitles.has(r.title.trim().toLowerCase())) return;
      excludeIds.add(r.videoId);
      lowerExcludedTitles.add(r.title.trim().toLowerCase());
      moreTracks.push({
        id: r.videoId,
        videoId: r.videoId,
        title: r.title,
        artist: r.artist,
        album: labelAlbum || r.album || 'Recommended in Search',
        duration: r.duration || 210,
        artworkUrl: r.albumArt,
        source: 'ytmusic',
      });
    };

    for (const arr of aiResultsArrays) {
      for (const item of arr) {
        if (moreTracks.length >= 8) break;
        const prevLen = moreTracks.length;
        pushCandidate(item, 'AI Recommended');
        if (moreTracks.length > prevLen) break;
      }
    }

    for (const item of broadResults) {
      if (moreTracks.length >= 8) break;
      pushCandidate(item, 'Recommended in Search');
    }

    // Fallback to any unshown tracks across SEED_TRACKS & custom playlists
    const extraPool = [
      ...SEED_TRACKS,
      ...db.customPlaylists.flatMap((pl) => pl.tracks),
    ];
    for (const t of extraPool) {
      if (moreTracks.length >= 8) break;
      if (!excludeIds.has(t.videoId) && !lowerExcludedTitles.has(t.title.trim().toLowerCase())) {
        excludeIds.add(t.videoId);
        lowerExcludedTitles.add(t.title.trim().toLowerCase());
        moreTracks.push({ ...t });
      }
    }

    res.json({
      tracks: moreTracks,
      query,
    });
  });

  // Record a user's played track into their personal taste profile
  app.post('/api/history/play', (req: Request, res: Response) => {
    const user = getSessionUser(req);
    const videoId = String(req.body?.videoId || '').trim();
    const title = String(req.body?.title || '').trim();
    const artist = String(req.body?.artist || '').trim();
    const language = req.body?.language ? String(req.body.language) : undefined;
    if (user && videoId && title) {
      const existing = db.listeningHistory[user.id] || [];
      db.listeningHistory[user.id] = recordUserPlayHistory(existing, {
        videoId,
        title,
        artist: artist || 'Unknown Artist',
        language,
      });
      delete db.personalMixCache[user.id];
      saveDb(db);
    }
    res.json({ ok: true });
  });

  // Playback Tracking Table (play_history): silently log when user completes >= 30 seconds of a song
  app.post('/api/play-history', (req: Request, res: Response) => {
    const user = getSessionUser(req);
    const effectiveUserId = user?.id || 'owner-harvix';
    const videoId = String(req.body?.video_id || req.body?.videoId || '').trim();
    const title = String(req.body?.title || '').trim();
    const artist = String(req.body?.artist || 'Unknown Artist').trim();
    const albumArt = String(
      req.body?.album_art ||
        req.body?.albumArt ||
        req.body?.artworkUrl ||
        '/src/assets/images/crate_cover_amber_vinyl_1794853068265.jpg'
    ).trim();
    const duration = Number(req.body?.duration) || 210;
    const album = req.body?.album ? String(req.body.album).trim() : undefined;

    if (!videoId || !title) {
      return res.status(400).json({ error: 'video_id and title are required.' });
    }

    const entry: PlayHistoryRecord = {
      id: `ph-${crypto.randomUUID()}`,
      user_id: effectiveUserId,
      video_id: videoId,
      title,
      artist,
      album_art: albumArt,
      played_at: new Date().toISOString(),
      duration,
      album,
    };

    db.playHistory.push(entry);
    runAutomaticPlayHistoryCleanup();
    saveDb(db);

    const topPlaylists = getDynamicTopPlaylistsForUser(user);
    res.json({
      ok: true,
      entry,
      topPlaylists,
    });
  });

  // User-Controlled Expiration & Deletion: manually wipe/reset weekly (7d), monthly (30d), or all play_history
  app.delete('/api/play-history', (req: Request, res: Response) => {
    const user = getSessionUser(req);
    const effectiveUserId = user?.id || 'owner-harvix';
    const scope = String(req.query.scope || req.body?.scope || 'all')
      .trim()
      .toLowerCase();
    const nowMs = Date.now();
    const dayMs = 24 * 60 * 60 * 1000;
    const weeklyCutoffMs = nowMs - 7 * dayMs;
    const monthlyCutoffMs = nowMs - 30 * dayMs;

    const beforeCount = db.playHistory.length;
    db.playHistory = db.playHistory.filter((item) => {
      if (item.user_id !== effectiveUserId) return true;
      const playedMs = new Date(item.played_at).getTime();
      if (scope === 'weekly') {
        return playedMs < weeklyCutoffMs;
      }
      if (scope === 'monthly') {
        return playedMs < monthlyCutoffMs;
      }
      if (scope === 'expired') {
        return playedMs >= monthlyCutoffMs;
      }
      return false;
    });
    const removedCount = beforeCount - db.playHistory.length;
    saveDb(db);

    const topPlaylists = getDynamicTopPlaylistsForUser(user);
    res.json({
      ok: true,
      scope,
      removedCount,
      topPlaylists,
      playlists: getAllPlaylistsForUser(user),
    });
  });

  // User-Controlled 30-Day Auto-Cleanup Toggle & Manual Prune Trigger
  app.post('/api/play-history/settings', (req: Request, res: Response) => {
    const user = getSessionUser(req);
    const effectiveUserId = user?.id || 'owner-harvix';
    const current = getUserAutoExpireSetting(effectiveUserId);
    const nextAutoExpire =
      typeof req.body?.autoExpire30Days === 'boolean' ? req.body.autoExpire30Days : !current;

    db.playHistorySettings[effectiveUserId] = {
      autoExpire30Days: nextAutoExpire,
      lastCleanupAt: new Date().toISOString(),
    };

    let removedCount = 0;
    if (nextAutoExpire || req.body?.runCleanupNow) {
      removedCount = runAutomaticPlayHistoryCleanup();
    }
    saveDb(db);

    const topPlaylists = getDynamicTopPlaylistsForUser(user);
    res.json({
      ok: true,
      autoExpire30Days: nextAutoExpire,
      removedCount,
      topPlaylists,
      playlists: getAllPlaylistsForUser(user),
    });
  });

  // Restore sample 7d/30d listening history if user wiped it and wants to repopulate demo plays
  app.post('/api/play-history/seed', (req: Request, res: Response) => {
    const user = getSessionUser(req);
    const effectiveUserId = user?.id || 'owner-harvix';
    db.playHistory = db.playHistory.filter((item) => item.user_id !== effectiveUserId);
    db.playHistory.push(...createSamplePlayHistoryForUser(effectiveUserId));
    saveDb(db);

    const topPlaylists = getDynamicTopPlaylistsForUser(user);
    res.json({
      ok: true,
      topPlaylists,
      playlists: getAllPlaylistsForUser(user),
    });
  });

  // Self-Hosted YouTube Music Search API (/api/search)
  app.get('/api/search', async (req: Request, res: Response) => {
    const q = String(req.query.q || '').trim();
    const results = await searchYouTubeMusic(q, 14);
    res.json(results);
  });

  // Combined Spotify-style Search & Browse API (searchable playlists + songs)
  app.get('/api/search/all', async (req: Request, res: Response) => {
    const user = getSessionUser(req);
    const q = String(req.query.q || '').trim();
    const allPlaylists = getAllPlaylistsForUser(user);
    const matchingPlaylists = searchPlaylists(allPlaylists, q);
    let tracks: YTMusicSearchResult[] = [];
    if (q) {
      tracks = await searchYouTubeMusic(q, 16);
    } else {
      const personal = await getPersonalRecommendationsForUser(user);
      tracks = personal.map((t) => ({
        title: t.title,
        artist: t.artist,
        albumArt: t.artworkUrl,
        videoId: t.videoId,
        album: t.album,
        duration: t.duration,
      }));
    }
    const mappedTracks: Track[] = tracks.map((r) => ({
      id: r.videoId,
      videoId: r.videoId,
      title: r.title,
      artist: r.artist,
      album: r.album || 'YouTube Music',
      duration: r.duration || 210,
      artworkUrl: r.albumArt,
      source: 'ytmusic',
    }));
    const fullArtistCatalog = buildArtistCatalog(allPlaylists, mappedTracks);
    const matchingArtists = searchArtists(fullArtistCatalog, q);
    res.json({
      query: q,
      playlists: matchingPlaylists,
      artists: matchingArtists,
      tracks,
      totalPlaylists: allPlaylists.length,
    });
  });

  // Self-Hosted YouTube Music Stream API (/api/stream) using play-dl
  app.get('/api/stream', async (req: Request, res: Response) => {
    const videoId = String(req.query.videoId || '').trim();
    if (!videoId) {
      return res.status(400).json({ error: 'videoId query parameter is required.' });
    }
    const wantRaw = String(req.query.raw || '') === '1';

    try {
      const ytUrl = `https://www.youtube.com/watch?v=${encodeURIComponent(videoId)}`;
      const info = await Promise.race([
        play.video_info(ytUrl),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('play-dl timeout')), 4500)
        ),
      ]);
      const best = selectBestAudioFormat(info.format || []);
      if (best) {
        if (wantRaw) {
          const upstream = await fetch(best.url);
          if (upstream.ok) {
            const arrBuf = await upstream.arrayBuffer();
            res.setHeader('Content-Type', best.mimeType || 'audio/mp4');
            res.setHeader('Cache-Control', 'no-store');
            return res.send(Buffer.from(arrBuf));
          }
        } else {
          return res.json({
            url: best.url,
            mimeType: best.mimeType,
            bitrate: best.bitrate,
            videoId,
          });
        }
      }
    } catch {
      // Fallback to local synth WAV stream if YouTube blocks container extraction
    }

    if (wantRaw) {
      const buf = generateSynthWav(videoId);
      res.setHeader('Content-Type', 'audio/wav');
      res.setHeader('Cache-Control', 'no-store');
      return res.send(buf);
    }

    return res.json({
      url: `/api/audio/synth/${encodeURIComponent(videoId)}`,
      mimeType: 'audio/wav',
      bitrate: 705600,
      videoId,
      fallback: true,
    });
  });

  // Raw binary audio endpoint for internal app sandbox (@capacitor/filesystem Directory.Data)
  app.get('/api/stream/raw', async (req: Request, res: Response) => {
    const videoId = String(req.query.videoId || '').trim();
    if (!videoId) {
      return res.status(400).json({ error: 'videoId query parameter is required.' });
    }
    const buf = generateSynthWav(videoId);
    res.setHeader('Content-Type', 'audio/wav');
    res.setHeader('Cache-Control', 'no-store');
    res.send(buf);
  });

  // Headless AI Autoplay Queue (/api/silent-queue) personalized per user via @google/genai
  app.post('/api/silent-queue', async (req: Request, res: Response) => {
    const user = getSessionUser(req);
    const videoId = String(req.body?.videoId || '').trim();
    const songName = String(req.body?.songName || '').trim();
    const artist = String(req.body?.artist || '').trim();
    const mode = String(req.body?.mode || 'single').trim().toLowerCase();
    const excludeIds = new Set<string>(
      Array.isArray(req.body?.excludeIds) ? req.body.excludeIds.map(String) : []
    );
    const excludeTitles = Array.isArray(req.body?.excludeTitles)
      ? req.body.excludeTitles.map(String)
      : [songName];

    if (!songName) {
      return res.status(400).json({ error: 'songName is required.' });
    }

    let userTaste = '';
    if (user) {
      const existing = db.listeningHistory[user.id] || [];
      if (videoId) {
        db.listeningHistory[user.id] = recordUserPlayHistory(existing, {
          videoId,
          title: songName,
          artist: artist || 'Unknown Artist',
        });
        delete db.personalMixCache[user.id];
        saveDb(db);
      }
      userTaste = buildPersonalTasteSummary(
        db.listeningHistory[user.id] || [],
        user.preferences
      );
    }

    if (mode !== 'batch') {
      const nextTrack = await recommendSingleRelatedTrack(
        songName,
        artist,
        excludeIds,
        excludeTitles,
        userTaste
      );
      return res.json({
        mode: 'single',
        tracks: nextTrack ? [nextTrack] : [],
      });
    }

    const songQueries = await generateSimilarSongQueries(songName, artist, userTaste);
    const searchArrays = await Promise.all(
      songQueries.map((q) => searchYouTubeMusic(q, 3))
    );

    const resolvedTracks: Track[] = [];
    for (const results of searchArrays) {
      const match = results.find((r) => r.videoId && !excludeIds.has(r.videoId));
      if (match) {
        excludeIds.add(match.videoId);
        resolvedTracks.push({
          id: match.videoId,
          videoId: match.videoId,
          title: match.title,
          artist: match.artist,
          album: match.album || 'YouTube Music',
          duration: match.duration || 210,
          artworkUrl: match.albumArt,
          source: 'silent-queue',
        });
      }
    }

    res.json({ mode: 'batch', tracks: resolvedTracks });
  });

  // Playable synth WAV fallback stream with Range support
  app.get('/api/audio/synth/:id', (req: Request, res: Response) => {
    const buf = generateSynthWav(req.params.id);
    const total = buf.length;
    const range = req.headers.range;

    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Accept-Ranges', 'bytes');
    res.setHeader('Content-Type', 'audio/wav');

    if (range) {
      const match = range.match(/bytes=(\d+)-(\d*)/);
      if (match) {
        const start = parseInt(match[1], 10);
        const end = match[2] ? Math.min(parseInt(match[2], 10), total - 1) : total - 1;
        if (start >= 0 && start <= end && end < total) {
          res.status(206);
          res.setHeader('Content-Range', `bytes ${start}-${end}/${total}`);
          res.setHeader('Content-Length', String(end - start + 1));
          return res.send(buf.subarray(start, end + 1));
        }
      }
    }

    res.setHeader('Content-Length', String(total));
    res.send(buf);
  });

  // -------------------------------------------------------------------------
  // HTTP + WebSocket Server (Listen Together Realtime Channels)
  // -------------------------------------------------------------------------
  const server = http.createServer(app);
  const wss = new WebSocketServer({ noServer: true });

  server.on('upgrade', (request, socket, head) => {
    const pathname = new URL(request.url || '/', 'http://localhost').pathname;
    if (pathname === '/ws/listen-together') {
      wss.handleUpgrade(request, socket, head, (ws) => {
        wss.emit('connection', ws, request);
      });
    }
  });

  interface ClientMeta {
    ws: WebSocket;
    roomId: string;
    userId: string;
    name: string;
    avatarUrl: string;
    isHost: boolean;
  }

  const rooms = new Map<string, ListenTogetherState>();
  const clients = new Map<WebSocket, ClientMeta>();

  function broadcastRoom(roomId: string) {
    const state = rooms.get(roomId);
    if (!state) return;
    const payload = JSON.stringify({ type: 'ROOM_STATE', state });
    for (const meta of clients.values()) {
      if (meta.roomId === roomId && meta.ws.readyState === 1) {
        meta.ws.send(payload);
      }
    }
  }

  wss.on('connection', (ws) => {
    ws.on('message', (raw) => {
      try {
        const msg = JSON.parse(String(raw)) as {
          type: string;
          roomId?: string;
          userId?: string;
          name?: string;
          avatarUrl?: string;
          isHost?: boolean;
          track?: Track | null;
          isPlaying?: boolean;
          currentTime?: number;
        };

        if (msg.type === 'JOIN_ROOM' && msg.roomId) {
          const roomId = msg.roomId.toUpperCase().slice(0, 16);
          const userId = msg.userId || crypto.randomUUID();
          const name = msg.name || 'Listener';
          const avatarUrl =
            msg.avatarUrl || '/src/assets/images/avatar_listener_a_1794839824622.jpg';

          let room = rooms.get(roomId);
          const isHost = Boolean(msg.isHost) || !room;
          if (!room) {
            room = {
              roomId,
              hostId: userId,
              hostName: name,
              track: msg.track ?? SEED_TRACKS[0],
              isPlaying: false,
              currentTime: 0,
              updatedAt: Date.now(),
              participants: [],
            };
            rooms.set(roomId, room);
          } else if (msg.isHost) {
            room.hostId = userId;
            room.hostName = name;
          }

          clients.set(ws, { ws, roomId, userId, name, avatarUrl, isHost });
          room.participants = [
            ...room.participants.filter((p) => p.id !== userId),
            { id: userId, name, avatarUrl, isHost: room.hostId === userId },
          ];
          broadcastRoom(roomId);
          return;
        }

        if (msg.type === 'HOST_SYNC') {
          const meta = clients.get(ws);
          if (!meta) return;
          const room = rooms.get(meta.roomId);
          if (!room || room.hostId !== meta.userId) return;

          if (msg.track !== undefined) room.track = msg.track;
          if (typeof msg.isPlaying === 'boolean') room.isPlaying = msg.isPlaying;
          if (typeof msg.currentTime === 'number') room.currentTime = msg.currentTime;
          room.updatedAt = Date.now();
          broadcastRoom(meta.roomId);
        }
      } catch {
        // Ignore malformed socket frames
      }
    });

    ws.on('close', () => {
      const meta = clients.get(ws);
      if (!meta) return;
      clients.delete(ws);
      const room = rooms.get(meta.roomId);
      if (!room) return;
      room.participants = room.participants.filter((p) => p.id !== meta.userId);
      if (room.participants.length === 0) {
        rooms.delete(meta.roomId);
      } else {
        if (room.hostId === meta.userId) {
          room.hostId = room.participants[0].id;
          room.hostName = room.participants[0].name;
          room.participants[0].isHost = true;
        }
        broadcastRoom(meta.roomId);
      }
    });
  });

  if (process.env.NODE_ENV === 'production') {
    const distPath = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('/{*splat}', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  } else {
    process.env.DISABLE_HMR = 'true';
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        hmr: false,
        watch: null,
        allowedHosts: true,
        ws: {
          server,
          path: '/__vite_ws',
        },
      },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  }

  server.listen(PORT, '0.0.0.0', () => {
    console.log(`Crate server listening on http://0.0.0.0:${PORT}`);
  });
}

bootstrap();
