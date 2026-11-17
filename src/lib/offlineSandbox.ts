import { Capacitor } from '@capacitor/core';
import { Directory, Filesystem } from '@capacitor/filesystem';
import type { DownloadedTrackRecord, Track } from '../types/crate';
import {
  buildInternalSandboxPath,
  buildInternalSandboxUri,
  findDownloadedTrackRecord,
  removeDownloadedTrackRecord,
  upsertDownloadedTrackRecord,
} from './audioMath';
import { isSupabaseConfigured, supabase } from './supabase';

const IDB_NAME = 'crate_internal_sandbox_db';
const IDB_VERSION = 1;
const STORE_DOWNLOADED_TRACKS = 'downloaded_tracks';
const LOCAL_MIRROR_KEY = 'crate.downloaded_tracks.v1';

// In-memory cache of blob object URLs resolved from @capacitor/filesystem Directory.Data
const sandboxObjectUrlCache = new Map<string, string>();

function readMirrorRecords(): DownloadedTrackRecord[] {
  try {
    const raw = window.localStorage.getItem(LOCAL_MIRROR_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as DownloadedTrackRecord[]) : [];
  } catch {
    return [];
  }
}

function writeMirrorRecords(records: DownloadedTrackRecord[]): void {
  try {
    window.localStorage.setItem(LOCAL_MIRROR_KEY, JSON.stringify(records));
  } catch {
    // Ignore quota errors on mirror; IndexedDB is primary
  }
}

function openDownloadedTracksDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof window === 'undefined' || !('indexedDB' in window)) {
      reject(new Error('IndexedDB unavailable'));
      return;
    }
    const req = window.indexedDB.open(IDB_NAME, IDB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_DOWNLOADED_TRACKS)) {
        db.createObjectStore(STORE_DOWNLOADED_TRACKS, { keyPath: 'videoId' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error || new Error('Failed to open IndexedDB'));
  });
}

/**
 * Reads all rows from the internal `downloaded_tracks` IndexedDB table
 * (sorted newest-first), falling back to the synchronous mirror if needed.
 */
export async function loadAllDownloadedTracks(): Promise<DownloadedTrackRecord[]> {
  try {
    const db = await openDownloadedTracksDb();
    const rows = await new Promise<DownloadedTrackRecord[]>((resolve, reject) => {
      const tx = db.transaction(STORE_DOWNLOADED_TRACKS, 'readonly');
      const store = tx.objectStore(STORE_DOWNLOADED_TRACKS);
      const req = store.getAll();
      req.onsuccess = () => resolve((req.result as DownloadedTrackRecord[]) || []);
      req.onerror = () => reject(req.error);
    });
    db.close();
    const sorted = rows.sort(
      (a, b) => Date.parse(b.downloadedAt || '') - Date.parse(a.downloadedAt || '')
    );
    if (sorted.length > 0) {
      writeMirrorRecords(sorted);
      return sorted;
    }
    return readMirrorRecords();
  } catch {
    return readMirrorRecords();
  }
}

export function loadInitialDownloadedTracksSync(): DownloadedTrackRecord[] {
  return readMirrorRecords();
}

async function saveRecordToDownloadedTracksTable(
  record: DownloadedTrackRecord
): Promise<DownloadedTrackRecord[]> {
  const next = upsertDownloadedTrackRecord(readMirrorRecords(), record);
  writeMirrorRecords(next);

  try {
    const db = await openDownloadedTracksDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_DOWNLOADED_TRACKS, 'readwrite');
      const store = tx.objectStore(STORE_DOWNLOADED_TRACKS);
      store.put(record);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    db.close();
  } catch {
    // Mirror already updated
  }
  return next;
}

async function deleteRecordFromDownloadedTracksTable(
  videoId: string
): Promise<DownloadedTrackRecord[]> {
  const next = removeDownloadedTrackRecord(readMirrorRecords(), videoId);
  writeMirrorRecords(next);

  try {
    const db = await openDownloadedTracksDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_DOWNLOADED_TRACKS, 'readwrite');
      const store = tx.objectStore(STORE_DOWNLOADED_TRACKS);
      store.delete(videoId);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    db.close();
  } catch {
    // Mirror already updated
  }
  return next;
}

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  const chunkSize = 0x8000;
  let binary = '';
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const chunk = bytes.subarray(i, i + chunkSize);
    binary += String.fromCharCode(...chunk);
  }
  return window.btoa(binary);
}

function base64ToUint8Array(base64: string): Uint8Array {
  const clean = base64.includes(',') ? base64.split(',')[1] : base64;
  const binary = window.atob(clean);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

/**
 * Fetches the raw audio stream via `/api/stream` (and `/api/stream/raw`) and writes it
 * strictly inside the app-private `@capacitor/filesystem` `Directory.Data` sandbox at
 * `tracks/[videoId].mp3`. Never saves to public external directories or OS Music library.
 */
export async function downloadTrackToInternalSandbox(
  track: Track,
  userId?: string
): Promise<{
  record: DownloadedTrackRecord;
  allRecords: DownloadedTrackRecord[];
}> {
  const videoId = String(track.videoId || track.id || '').trim();
  if (!videoId) {
    throw new Error('Track videoId is required for offline sandbox storage.');
  }

  const sandboxPath = buildInternalSandboxPath(videoId); // e.g., 'tracks/BddP6PYo2gs.mp3'

  // 1. Query /api/stream first as specified, then fetch the raw audio binary stream
  let rawAudioBuffer: ArrayBuffer | null = null;
  let resolvedMimeType = 'audio/mpeg';

  try {
    const streamMetaRes = await fetch(`/api/stream?videoId=${encodeURIComponent(videoId)}`);
    if (streamMetaRes.ok) {
      const streamMeta = (await streamMetaRes.json()) as {
        url?: string;
        mimeType?: string;
      };
      if (streamMeta.mimeType) {
        resolvedMimeType = streamMeta.mimeType.split(';')[0].trim() || resolvedMimeType;
      }
      // If the stream URL is same-origin (or proxied), fetch directly
      if (streamMeta.url && streamMeta.url.startsWith('/')) {
        const audioRes = await fetch(streamMeta.url);
        if (audioRes.ok) {
          rawAudioBuffer = await audioRes.arrayBuffer();
        }
      }
    }
  } catch {
    // Fallback to raw stream endpoint below
  }

  if (!rawAudioBuffer) {
    const rawRes = await fetch(`/api/stream/raw?videoId=${encodeURIComponent(videoId)}`);
    if (!rawRes.ok) {
      throw new Error(`Failed to fetch raw audio stream (${rawRes.status})`);
    }
    const contentType = rawRes.headers.get('Content-Type');
    if (contentType) {
      resolvedMimeType = contentType.split(';')[0].trim() || resolvedMimeType;
    }
    rawAudioBuffer = await rawRes.arrayBuffer();
  }

  const base64Audio = arrayBufferToBase64(rawAudioBuffer);

  // 2. Write directly into the secure app-private data folder using @capacitor/filesystem Directory.Data
  await Filesystem.writeFile({
    path: sandboxPath,
    data: base64Audio,
    directory: Directory.Data,
    recursive: true,
  });

  // Resolve internal sandbox URI from @capacitor/filesystem
  let localFileUri = buildInternalSandboxUri(videoId);
  try {
    const uriResult = await Filesystem.getUri({
      path: sandboxPath,
      directory: Directory.Data,
    });
    if (uriResult?.uri) {
      localFileUri = Capacitor.isNativePlatform()
        ? uriResult.uri
        : `Directory.Data/${sandboxPath}`;
    }
  } catch {
    localFileUri = buildInternalSandboxUri(videoId);
  }

  // Prime in-memory playback URL for instant offline playback
  const blob = new Blob([rawAudioBuffer], { type: resolvedMimeType || 'audio/wav' });
  const prevUrl = sandboxObjectUrlCache.get(videoId);
  if (prevUrl) URL.revokeObjectURL(prevUrl);
  sandboxObjectUrlCache.set(videoId, URL.createObjectURL(blob));

  const record: DownloadedTrackRecord = {
    videoId,
    title: track.title,
    artist: track.artist,
    albumArt:
      track.artworkUrl || '/src/assets/images/crate_cover_amber_vinyl_1794853068265.jpg',
    localFileUri,
    sandboxPath,
    album: track.album || 'Offline Sandbox',
    duration: track.duration || 24,
    mimeType: resolvedMimeType || 'audio/wav',
    sizeBytes: rawAudioBuffer.byteLength,
    downloadedAt: new Date().toISOString(),
  };

  // 3. Save metadata into the in-app `downloaded_tracks` table (IndexedDB + mirror + Supabase if configured)
  const allRecords = await saveRecordToDownloadedTracksTable(record);

  if (isSupabaseConfigured && supabase && userId) {
    void supabase
      .from('downloaded_tracks')
      .upsert(
        {
          user_id: userId,
          video_id: record.videoId,
          title: record.title,
          artist: record.artist,
          album_art: record.albumArt,
          local_file_uri: record.localFileUri,
          downloaded_at: record.downloadedAt,
        },
        { onConflict: 'user_id,video_id' }
      )
      .then(() => {});
  }

  return { record, allRecords };
}

/**
 * Smart Audio Interceptor: checks the `downloaded_tracks` table first.
 * If found, reads the audio binary from `@capacitor/filesystem` `Directory.Data` (`tracks/[videoId].mp3`)
 * and returns a playable internal URI for the HTML5 `<audio>` element.
 */
export async function resolveOfflineSandboxAudioSrc(
  videoId: string,
  downloadedTracks: DownloadedTrackRecord[]
): Promise<{ playbackUrl: string; record: DownloadedTrackRecord } | null> {
  const record = findDownloadedTrackRecord(downloadedTracks, videoId);
  if (!record) return null;

  const cachedBlobUrl = sandboxObjectUrlCache.get(record.videoId);
  if (cachedBlobUrl) {
    return { playbackUrl: cachedBlobUrl, record };
  }

  try {
    if (Capacitor.isNativePlatform() && record.localFileUri.startsWith('file://')) {
      return {
        playbackUrl: Capacitor.convertFileSrc(record.localFileUri),
        record,
      };
    }

    const fileResult = await Filesystem.readFile({
      path: record.sandboxPath || buildInternalSandboxPath(record.videoId),
      directory: Directory.Data,
    });

    if (typeof fileResult.data === 'string') {
      const bytes = base64ToUint8Array(fileResult.data);
      const blob = new Blob([bytes as unknown as BlobPart], {
        type: record.mimeType || 'audio/wav',
      });
      const blobUrl = URL.createObjectURL(blob);
      sandboxObjectUrlCache.set(record.videoId, blobUrl);
      return { playbackUrl: blobUrl, record };
    } else if (fileResult.data instanceof Blob) {
      const blobUrl = URL.createObjectURL(fileResult.data);
      sandboxObjectUrlCache.set(record.videoId, blobUrl);
      return { playbackUrl: blobUrl, record };
    }
  } catch {
    // File missing or corrupted in sandbox
  }

  return null;
}

/**
 * Removes a track from `@capacitor/filesystem` `Directory.Data` and deletes its metadata
 * from the `downloaded_tracks` table.
 */
export async function removeTrackFromInternalSandbox(
  videoId: string,
  userId?: string
): Promise<DownloadedTrackRecord[]> {
  const sandboxPath = buildInternalSandboxPath(videoId);
  try {
    await Filesystem.deleteFile({
      path: sandboxPath,
      directory: Directory.Data,
    });
  } catch {
    // Ignore if already deleted from Directory.Data
  }

  const cachedUrl = sandboxObjectUrlCache.get(videoId);
  if (cachedUrl) {
    URL.revokeObjectURL(cachedUrl);
    sandboxObjectUrlCache.delete(videoId);
  }

  const nextRecords = await deleteRecordFromDownloadedTracksTable(videoId);

  if (isSupabaseConfigured && supabase && userId) {
    void supabase
      .from('downloaded_tracks')
      .delete()
      .eq('user_id', userId)
      .eq('video_id', videoId)
      .then(() => {});
  }

  return nextRecords;
}

/**
 * Wipes all tracks from the internal app sandbox (`Directory.Data/tracks`) and clears `downloaded_tracks`.
 */
export async function clearAllInternalSandboxDownloads(userId?: string): Promise<void> {
  const existing = readMirrorRecords();
  for (const item of existing) {
    try {
      await Filesystem.deleteFile({
        path: item.sandboxPath || buildInternalSandboxPath(item.videoId),
        directory: Directory.Data,
      });
    } catch {
      // Ignore individual file errors
    }
    const cachedUrl = sandboxObjectUrlCache.get(item.videoId);
    if (cachedUrl) {
      URL.revokeObjectURL(cachedUrl);
      sandboxObjectUrlCache.delete(item.videoId);
    }
  }

  writeMirrorRecords([]);
  try {
    const db = await openDownloadedTracksDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_DOWNLOADED_TRACKS, 'readwrite');
      tx.objectStore(STORE_DOWNLOADED_TRACKS).clear();
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    db.close();
  } catch {
    // Mirror cleared
  }

  if (isSupabaseConfigured && supabase && userId) {
    void supabase.from('downloaded_tracks').delete().eq('user_id', userId).then(() => {});
  }
}
