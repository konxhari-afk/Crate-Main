import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from 'react';
import { apiFetch } from '../lib/apiClient';
import {
  appendTrackToQueue,
  FACTORY_STUDIO_EQ_BANDS,
  findDownloadedTrackRecord,
  insertPlayNextInQueue,
  resolveSmartPlaybackSource,
} from '../lib/audioMath';
import {
  clearAllInternalSandboxDownloads,
  downloadTrackToInternalSandbox,
  loadAllDownloadedTracks,
  loadInitialDownloadedTracksSync,
  removeTrackFromInternalSandbox,
  resolveOfflineSandboxAudioSrc,
} from '../lib/offlineSandbox';
import { isSupabaseConfigured, supabase } from '../lib/supabase';
import type { DownloadedTrackRecord, ListenTogetherState, Track } from '../types/crate';
import { useAuth } from './AuthContext';

interface PlayerContextValue {
  queue: Track[];
  currentTrackIndex: number;
  currentTrack: Track | null;
  isPlaying: boolean;
  currentTime: number;
  duration: number;
  volume: number;
  roomState: ListenTogetherState | null;
  isRoomHost: boolean;
  roomConnected: boolean;
  aiQueueLoading: boolean;
  queueNotice: string | null;
  playHistoryVersion: number;
  notifyPlayHistoryChanged: () => void;
  downloadedTracks: DownloadedTrackRecord[];
  downloadingIds: Record<string, boolean>;
  isPlayingFromOfflineSandbox: boolean;
  activeSandboxUri: string | null;
  isTrackDownloaded: (videoId: string) => boolean;
  downloadTrackOffline: (track: Track) => Promise<void>;
  removeDownloadedTrack: (videoId: string) => Promise<void>;
  clearAllDownloads: () => Promise<void>;
  setQueueAndPlay: (tracks: Track[], startIndex?: number) => void;
  playTrack: (track: Track, newQueue?: Track[]) => void;
  playNextInQueue: (track: Track) => void;
  addToQueue: (track: Track) => void;
  removeFromQueue: (index: number) => void;
  requestAiSuggestionForQueue: () => void;
  togglePlayPause: () => void;
  playNext: () => void;
  playPrev: () => void;
  seekTo: (seconds: number) => void;
  setVolume: (vol: number) => void;
  joinListenRoom: (roomId: string, asHost: boolean) => void;
  leaveListenRoom: () => void;
}

const PlayerContext = createContext<PlayerContextValue | null>(null);

export const PlayerProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { profile } = useAuth();
  const audioRef = useRef<HTMLAudioElement | null>(null);

  // Factory-tuned Web Audio API studio mastering chain
  const audioCtxRef = useRef<AudioContext | null>(null);
  const sourceNodeRef = useRef<MediaElementAudioSourceNode | null>(null);

  // Playback State
  const [queue, setQueue] = useState<Track[]>([]);
  const [currentTrackIndex, setCurrentTrackIndex] = useState<number>(0);
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [currentTime, setCurrentTime] = useState<number>(0);
  const [duration, setDuration] = useState<number>(0);
  const [volume, setVolumeState] = useState<number>(0.88);
  const [aiQueueLoading, setAiQueueLoading] = useState<boolean>(false);
  const [queueNotice, setQueueNotice] = useState<string | null>(null);
  const [playHistoryVersion, setPlayHistoryVersion] = useState<number>(0);
  const noticeTimerRef = useRef<number | null>(null);

  const currentTrack = queue[currentTrackIndex] ?? null;

  // Offline App Sandbox State (@capacitor/filesystem Directory.Data + downloaded_tracks table)
  const [downloadedTracks, setDownloadedTracks] = useState<DownloadedTrackRecord[]>(() =>
    loadInitialDownloadedTracksSync()
  );
  const downloadedTracksRef = useRef<DownloadedTrackRecord[]>(downloadedTracks);
  downloadedTracksRef.current = downloadedTracks;
  const [downloadingIds, setDownloadingIds] = useState<Record<string, boolean>>({});
  const [isPlayingFromOfflineSandbox, setIsPlayingFromOfflineSandbox] = useState<boolean>(false);
  const [activeSandboxUri, setActiveSandboxUri] = useState<string | null>(null);

  // Hydrate downloaded_tracks from IndexedDB on mount
  useEffect(() => {
    let active = true;
    loadAllDownloadedTracks()
      .then((records) => {
        if (active) {
          setDownloadedTracks(records);
        }
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, []);

  // 30-second continuous/cumulative playback tracking per song
  const playedSecondsRef = useRef<number>(0);
  const lastAudioTimeRef = useRef<number>(0);
  const logged30sTrackKeyRef = useRef<string | null>(null);

  const notifyPlayHistoryChanged = useCallback(() => {
    setPlayHistoryVersion((v) => v + 1);
  }, []);

  const showQueueNotice = useCallback((message: string) => {
    setQueueNotice(message);
    if (noticeTimerRef.current) {
      window.clearTimeout(noticeTimerRef.current);
    }
    noticeTimerRef.current = window.setTimeout(() => {
      setQueueNotice(null);
      noticeTimerRef.current = null;
    }, 2600);
  }, []);

  const isTrackDownloaded = useCallback(
    (videoId: string): boolean => {
      return Boolean(findDownloadedTrackRecord(downloadedTracks, videoId));
    },
    [downloadedTracks]
  );

  const downloadTrackOffline = useCallback(
    async (track: Track) => {
      const vid = String(track.videoId || track.id || '').trim();
      if (!vid || downloadingIds[vid]) return;
      setDownloadingIds((prev) => ({ ...prev, [vid]: true }));
      try {
        const { record, allRecords } = await downloadTrackToInternalSandbox(track, profile?.id);
        setDownloadedTracks(allRecords);
        showQueueNotice(`Saved to App Sandbox: ${record.title} (${record.localFileUri})`);
      } catch {
        showQueueNotice(`Could not download ${track.title} to sandbox.`);
      } finally {
        setDownloadingIds((prev) => {
          const copy = { ...prev };
          delete copy[vid];
          return copy;
        });
      }
    },
    [downloadingIds, profile?.id, showQueueNotice]
  );

  const removeDownloadedTrack = useCallback(
    async (videoId: string) => {
      const vid = String(videoId || '').trim();
      if (!vid) return;
      const existing = findDownloadedTrackRecord(downloadedTracksRef.current, vid);
      const next = await removeTrackFromInternalSandbox(vid, profile?.id);
      setDownloadedTracks(next);
      if (currentTrack && (currentTrack.videoId === vid || currentTrack.id === vid)) {
        setIsPlayingFromOfflineSandbox(false);
        setActiveSandboxUri(null);
      }
      if (existing) {
        showQueueNotice(`Removed from App Sandbox: ${existing.title}`);
      }
    },
    [currentTrack, profile?.id, showQueueNotice]
  );

  const clearAllDownloads = useCallback(async () => {
    await clearAllInternalSandboxDownloads(profile?.id);
    setDownloadedTracks([]);
    setIsPlayingFromOfflineSandbox(false);
    setActiveSandboxUri(null);
    showQueueNotice('Wiped all offline tracks from internal App Sandbox.');
  }, [profile?.id, showQueueNotice]);

  // Listen Together Realtime State
  const wsRef = useRef<WebSocket | null>(null);
  const isRemoteSyncRef = useRef<boolean>(false);
  const [roomState, setRoomState] = useState<ListenTogetherState | null>(null);
  const [roomConnected, setRoomConnected] = useState<boolean>(false);

  const isRoomHost = Boolean(roomState && profile && roomState.hostId === profile.id);

  // Reset 30-second playback accumulator whenever active track changes
  useEffect(() => {
    playedSecondsRef.current = 0;
    lastAudioTimeRef.current = 0;
    logged30sTrackKeyRef.current = null;
  }, [currentTrack?.videoId, currentTrack?.id, currentTrackIndex]);

  // Silently log completed 30-second play to play_history (Backend + Supabase table)
  const logCompleted30sPlay = useCallback(
    (track: Track) => {
      const trackKey = `${track.videoId || track.id}:${currentTrackIndex}`;
      if (logged30sTrackKeyRef.current === trackKey) return;
      logged30sTrackKeyRef.current = trackKey;

      const videoId = track.videoId || track.id;
      apiFetch('/api/play-history', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          video_id: videoId,
          title: track.title,
          artist: track.artist,
          album_art: track.artworkUrl,
          duration: track.duration || 210,
          album: track.album,
        }),
      })
        .then((res) => {
          if (res.ok) {
            setPlayHistoryVersion((v) => v + 1);
          }
        })
        .catch(() => {});

      if (isSupabaseConfigured && supabase && profile?.id) {
        void supabase
          .from('play_history')
          .insert({
            user_id: profile.id,
            video_id: videoId,
            title: track.title,
            artist: track.artist,
            album_art: track.artworkUrl,
            played_at: new Date().toISOString(),
          })
          .then(() => {});
      }
    },
    [currentTrackIndex, profile?.id]
  );

  // Initialize Factory-Default Studio Audio DSP (5-Band Mastering EQ + Stereo Soundstage + Limiter)
  const ensureAudioGraph = useCallback(() => {
    const audioEl = audioRef.current;
    if (!audioEl) return;

    if (!audioCtxRef.current) {
      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      const ctx = new AudioCtx();
      const source = ctx.createMediaElementSource(audioEl);

      // 1. Studio 5-Band Mastering Curve (warm low end, clean mids, crisp vocal air)
      const filters = FACTORY_STUDIO_EQ_BANDS.map((band) => {
        const filter = ctx.createBiquadFilter();
        filter.type = band.type;
        filter.frequency.value = band.frequency;
        filter.Q.value = 1.05;
        filter.gain.value = band.gain;
        return filter;
      });

      for (let i = 0; i < filters.length - 1; i++) {
        filters[i].connect(filters[i + 1]);
      }
      source.connect(filters[0]);

      const lastFilter = filters[filters.length - 1];

      // 2. Mastering Limiter / Compressor so studio boost never clips
      const compressor = ctx.createDynamicsCompressor();
      compressor.threshold.value = -12;
      compressor.knee.value = 18;
      compressor.ratio.value = 3.5;
      compressor.attack.value = 0.005;
      compressor.release.value = 0.15;

      // 3. Balanced Natural Stereo Soundstage
      const dryGain = ctx.createGain();
      dryGain.gain.value = 0.92;

      const panner = ctx.createStereoPanner();
      panner.pan.value = 0.14;
      const delay = ctx.createDelay(0.5);
      delay.delayTime.value = 0.018;
      const feedback = ctx.createGain();
      feedback.gain.value = 0.16;
      const wetGain = ctx.createGain();
      wetGain.gain.value = 0.18;

      lastFilter.connect(dryGain);
      dryGain.connect(compressor);

      lastFilter.connect(panner);
      panner.connect(delay);
      delay.connect(feedback);
      feedback.connect(delay);
      delay.connect(wetGain);
      wetGain.connect(compressor);

      compressor.connect(ctx.destination);

      audioCtxRef.current = ctx;
      sourceNodeRef.current = source;
    }

    if (audioCtxRef.current.state === 'suspended') {
      void audioCtxRef.current.resume();
    }
  }, []);

  const broadcastHostSync = useCallback(
    (payload: { track?: Track | null; isPlaying?: boolean; currentTime?: number }) => {
      if (
        isRemoteSyncRef.current ||
        !wsRef.current ||
        wsRef.current.readyState !== WebSocket.OPEN ||
        !isRoomHost
      ) {
        return;
      }
      wsRef.current.send(
        JSON.stringify({
          type: 'HOST_SYNC',
          ...payload,
        })
      );
    },
    [isRoomHost]
  );

  // Record played track into the user's personal taste profile
  const recordPlayInHistory = useCallback((track: Track) => {
    apiFetch('/api/history/play', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        videoId: track.videoId || track.id,
        title: track.title,
        artist: track.artist,
        language: track.language,
      }),
    }).catch(() => {});
  }, []);

  const aiQueueInFlightRef = useRef<string | null>(null);

  // Invisible AI Autoplay Queue: picks the SINGLE most related song to the currently playing track
  const triggerSilentQueue = useCallback(async (track: Track, currentQueue: Track[]) => {
    const vid = track.videoId || track.id;
    if (!vid || aiQueueInFlightRef.current === vid) return;
    aiQueueInFlightRef.current = vid;
    setAiQueueLoading(true);

    try {
      const res = await apiFetch('/api/silent-queue', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mode: 'single',
          videoId: vid,
          songName: track.title,
          artist: track.artist,
          excludeIds: currentQueue.map((t) => t.videoId || t.id),
          excludeTitles: currentQueue.map((t) => t.title),
        }),
      });
      if (!res.ok) return;
      const data = (await res.json()) as { tracks?: Track[] };
      if (!Array.isArray(data.tracks) || data.tracks.length === 0) return;

      const aiPick = data.tracks[0];
      if (!aiPick) return;

      setQueue((prev) => {
        const existingIds = new Set(prev.map((t) => t.videoId || t.id));
        if (existingIds.has(aiPick.videoId || aiPick.id)) return prev;
        return [...prev, aiPick];
      });
    } catch {
      // Background autoplay fails silently without disrupting playback
    } finally {
      if (aiQueueInFlightRef.current === vid) {
        aiQueueInFlightRef.current = null;
        setAiQueueLoading(false);
      }
    }
  }, []);

  const setQueueAndPlay = useCallback(
    (tracks: Track[], startIndex = 0) => {
      if (tracks.length === 0) return;
      const safeIndex = Math.max(0, Math.min(startIndex, tracks.length - 1));
      setQueue(tracks);
      setCurrentTrackIndex(safeIndex);
      setIsPlaying(true);
      const selected = tracks[safeIndex];
      recordPlayInHistory(selected);
      if (safeIndex >= tracks.length - 1) {
        void triggerSilentQueue(selected, tracks);
      }
      broadcastHostSync({ track: selected, isPlaying: true, currentTime: 0 });
    },
    [broadcastHostSync, recordPlayInHistory, triggerSilentQueue]
  );

  const playTrack = useCallback(
    (track: Track, newQueue?: Track[]) => {
      if (newQueue && newQueue.length > 0) {
        const idx = Math.max(
          0,
          newQueue.findIndex((t) => t.videoId === track.videoId || t.id === track.id)
        );
        setQueueAndPlay(newQueue, idx);
        return;
      }

      // Playing a single song: start clean with [track] and let AI watch & choose the most related song next
      const singleQueue = [track];
      setQueue(singleQueue);
      setCurrentTrackIndex(0);
      setIsPlaying(true);
      recordPlayInHistory(track);
      void triggerSilentQueue(track, singleQueue);
      broadcastHostSync({ track, isPlaying: true, currentTime: 0 });
    },
    [broadcastHostSync, recordPlayInHistory, setQueueAndPlay, triggerSilentQueue]
  );

  // Manual queue extension ("Play Next" from 3-dots menu)
  const playNextInQueue = useCallback(
    (track: Track) => {
      if (queue.length === 0) {
        playTrack(track);
        showQueueNotice(`Playing now: ${track.title}`);
        return;
      }
      setQueue((prev) => insertPlayNextInQueue(prev, currentTrackIndex, track));
      showQueueNotice(`Playing next: ${track.title}`);
    },
    [currentTrackIndex, playTrack, queue.length, showQueueNotice]
  );

  // Manual queue extension ("Add to Queue" from 3-dots menu)
  const addToQueue = useCallback(
    (track: Track) => {
      if (queue.length === 0) {
        playTrack(track);
        showQueueNotice(`Added & playing: ${track.title}`);
        return;
      }
      setQueue((prev) => appendTrackToQueue(prev, track));
      showQueueNotice(`Added to queue: ${track.title}`);
    },
    [playTrack, queue.length, showQueueNotice]
  );

  // Remove a track from upcoming queue
  const removeFromQueue = useCallback(
    (index: number) => {
      if (index <= currentTrackIndex || index < 0 || index >= queue.length) return;
      const removed = queue[index];
      setQueue((prev) => prev.filter((_, idx) => idx !== index));
      if (removed) {
        showQueueNotice(`Removed from queue: ${removed.title}`);
      }
    },
    [currentTrackIndex, queue, showQueueNotice]
  );

  // Explicitly ask AI to watch current track / history and suggest one more song to queue
  const requestAiSuggestionForQueue = useCallback(() => {
    const seed = queue[queue.length - 1] || currentTrack;
    if (!seed) return;
    aiQueueInFlightRef.current = null;
    void triggerSilentQueue(seed, queue);
    showQueueNotice(`AI suggesting song based on ${seed.title}...`);
  }, [currentTrack, queue, showQueueNotice, triggerSilentQueue]);

  const togglePlayPause = useCallback(() => {
    const audio = audioRef.current;
    if (!audio || !currentTrack) return;
    ensureAudioGraph();
    if (isPlaying) {
      audio.pause();
      setIsPlaying(false);
      broadcastHostSync({ isPlaying: false, currentTime: audio.currentTime });
    } else {
      void audio.play().catch(() => {});
      setIsPlaying(true);
      broadcastHostSync({ isPlaying: true, currentTime: audio.currentTime });
    }
  }, [broadcastHostSync, currentTrack, ensureAudioGraph, isPlaying]);

  const playNext = useCallback(() => {
    if (queue.length === 0) return;
    if (currentTrackIndex + 1 < queue.length) {
      const nextIdx = currentTrackIndex + 1;
      setCurrentTrackIndex(nextIdx);
      setIsPlaying(true);
      const nextTrack = queue[nextIdx];
      if (nextTrack) {
        recordPlayInHistory(nextTrack);
        if (nextIdx >= queue.length - 1) {
          void triggerSilentQueue(nextTrack, queue);
        }
        broadcastHostSync({ track: nextTrack, isPlaying: true, currentTime: 0 });
      }
      return;
    }

    // Reached end of queue: fetch single most related song to currentTrack
    if (currentTrack) {
      void triggerSilentQueue(currentTrack, queue);
    }
  }, [
    broadcastHostSync,
    currentTrack,
    currentTrackIndex,
    queue,
    recordPlayInHistory,
    triggerSilentQueue,
  ]);

  const playPrev = useCallback(() => {
    if (queue.length === 0) return;
    const audio = audioRef.current;
    if (audio && audio.currentTime > 3) {
      audio.currentTime = 0;
      broadcastHostSync({ currentTime: 0 });
      return;
    }
    const prevIdx = currentTrackIndex - 1 >= 0 ? currentTrackIndex - 1 : queue.length - 1;
    setCurrentTrackIndex(prevIdx);
    setIsPlaying(true);
    const prevTrack = queue[prevIdx];
    if (prevTrack) {
      broadcastHostSync({ track: prevTrack, isPlaying: true, currentTime: 0 });
    }
  }, [broadcastHostSync, currentTrackIndex, queue]);

  const seekTo = useCallback(
    (seconds: number) => {
      const audio = audioRef.current;
      if (!audio) return;
      audio.currentTime = seconds;
      setCurrentTime(seconds);
      broadcastHostSync({ currentTime: seconds });
    },
    [broadcastHostSync]
  );

  const setVolume = useCallback((vol: number) => {
    const clamped = Math.max(0, Math.min(1, vol));
    setVolumeState(clamped);
    if (audioRef.current) {
      audioRef.current.volume = clamped;
    }
  }, []);

  // SMART AUDIO INTERCEPTOR: Check `downloaded_tracks` table first!
  // If found, load the internal sandbox URI from @capacitor/filesystem Directory.Data into <audio>
  // for instant offline playback. If not found, fall back to streaming from /api/stream.
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio || !currentTrack) return;

    let cancelled = false;
    async function loadStream() {
      const vid = currentTrack!.videoId || currentTrack!.id;
      let streamUrl = '';

      // 1. Check `downloaded_tracks` table first via Smart Audio Interceptor
      const interceptorDecision = resolveSmartPlaybackSource(vid, downloadedTracksRef.current);
      if (interceptorDecision.mode === 'offline-sandbox') {
        const offlineSource = await resolveOfflineSandboxAudioSrc(
          vid,
          downloadedTracksRef.current
        );
        if (offlineSource && !cancelled) {
          streamUrl = offlineSource.playbackUrl;
          setIsPlayingFromOfflineSandbox(true);
          setActiveSandboxUri(offlineSource.record.localFileUri);
        }
      }

      // 2. If not found in internal sandbox, fall back to streaming from /api/stream
      if (!streamUrl) {
        if (!cancelled) {
          setIsPlayingFromOfflineSandbox(false);
          setActiveSandboxUri(null);
        }
        streamUrl = currentTrack!.audioUrl || '';
        if (!streamUrl) {
          try {
            const res = await fetch(interceptorDecision.streamEndpoint);
            if (res.ok) {
              const data = (await res.json()) as { url?: string };
              if (data.url) streamUrl = data.url;
            }
          } catch {
            // Handled by fallback below
          }
        }
        if (!streamUrl) {
          streamUrl = `/api/audio/synth/${encodeURIComponent(vid)}`;
        }
      }

      if (cancelled || !audioRef.current) return;

      const resolvedHref = streamUrl.startsWith('blob:')
        ? streamUrl
        : new URL(streamUrl, window.location.origin).href;
      if (audioRef.current.src !== resolvedHref) {
        audioRef.current.src = streamUrl;
        audioRef.current.load();
      }
      audioRef.current.volume = volume;
      if (isPlaying) {
        ensureAudioGraph();
        void audioRef.current.play().catch(() => {});
      }
    }

    void loadStream();
    return () => {
      cancelled = true;
    };
  }, [currentTrack?.videoId, currentTrack?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Hardware Sync: navigator.mediaSession (Dynamic Island & Android Lock Screen)
  useEffect(() => {
    if (!('mediaSession' in navigator) || !currentTrack) return;

    const absArtwork = new URL(currentTrack.artworkUrl, window.location.origin).href;
    navigator.mediaSession.metadata = new MediaMetadata({
      title: currentTrack.title,
      artist: currentTrack.artist,
      album: currentTrack.album,
      artwork: [
        { src: absArtwork, sizes: '512x512', type: 'image/jpeg' },
        { src: absArtwork, sizes: '192x192', type: 'image/jpeg' },
      ],
    });
    navigator.mediaSession.playbackState = isPlaying ? 'playing' : 'paused';

    navigator.mediaSession.setActionHandler('play', () => {
      const audio = audioRef.current;
      if (audio) {
        ensureAudioGraph();
        void audio.play().catch(() => {});
        setIsPlaying(true);
      }
    });
    navigator.mediaSession.setActionHandler('pause', () => {
      audioRef.current?.pause();
      setIsPlaying(false);
    });
    navigator.mediaSession.setActionHandler('previoustrack', playPrev);
    navigator.mediaSession.setActionHandler('nexttrack', playNext);

    return () => {
      navigator.mediaSession.setActionHandler('play', null);
      navigator.mediaSession.setActionHandler('pause', null);
      navigator.mediaSession.setActionHandler('previoustrack', null);
      navigator.mediaSession.setActionHandler('nexttrack', null);
    };
  }, [currentTrack, isPlaying, playNext, playPrev, ensureAudioGraph]);

  // Listen Together WebSocket Room Management
  const leaveListenRoom = useCallback(() => {
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
    setRoomState(null);
    setRoomConnected(false);
  }, []);

  const joinListenRoom = useCallback(
    (roomId: string, asHost: boolean) => {
      leaveListenRoom();
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const ws = new WebSocket(`${protocol}//${window.location.host}/ws/listen-together`);
      wsRef.current = ws;

      ws.onopen = () => {
        setRoomConnected(true);
        ws.send(
          JSON.stringify({
            type: 'JOIN_ROOM',
            roomId: roomId.trim().toUpperCase(),
            userId: profile?.id || 'guest',
            name: profile?.full_name || 'Member',
            avatarUrl:
              profile?.avatar_url || '/src/assets/images/avatar_listener_a_1794839824622.jpg',
            isHost: asHost,
            track: currentTrack,
          })
        );
      };

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(String(event.data)) as {
            type: string;
            state?: ListenTogetherState;
          };
          if (data.type !== 'ROOM_STATE' || !data.state) return;
          const nextRoom = data.state;
          setRoomState(nextRoom);

          if (profile && nextRoom.hostId !== profile.id) {
            isRemoteSyncRef.current = true;
            const audio = audioRef.current;

            if (nextRoom.track && (!currentTrack || currentTrack.id !== nextRoom.track.id)) {
              setQueue((prev) => {
                const idx = prev.findIndex((t) => t.id === nextRoom.track!.id);
                if (idx !== -1) {
                  setCurrentTrackIndex(idx);
                  return prev;
                }
                setCurrentTrackIndex(0);
                return [nextRoom.track!, ...prev];
              });
            }

            if (audio) {
              const elapsedDrift = Math.abs(audio.currentTime - nextRoom.currentTime);
              if (elapsedDrift > 1.2) {
                audio.currentTime = nextRoom.currentTime;
                setCurrentTime(nextRoom.currentTime);
              }
              if (nextRoom.isPlaying && audio.paused) {
                void audio.play().catch(() => {});
                setIsPlaying(true);
              } else if (!nextRoom.isPlaying && !audio.paused) {
                audio.pause();
                setIsPlaying(false);
              }
            }
            setTimeout(() => {
              isRemoteSyncRef.current = false;
            }, 150);
          }
        } catch {
          // Ignore malformed message
        }
      };

      ws.onclose = () => {
        setRoomConnected(false);
      };
    },
    [currentTrack, leaveListenRoom, profile]
  );

  useEffect(() => {
    return () => {
      if (wsRef.current) wsRef.current.close();
    };
  }, []);

  return (
    <PlayerContext.Provider
      value={{
        queue,
        currentTrackIndex,
        currentTrack,
        isPlaying,
        currentTime,
        duration,
        volume,
        roomState,
        isRoomHost,
        roomConnected,
        aiQueueLoading,
        queueNotice,
        playHistoryVersion,
        notifyPlayHistoryChanged,
        downloadedTracks,
        downloadingIds,
        isPlayingFromOfflineSandbox,
        activeSandboxUri,
        isTrackDownloaded,
        downloadTrackOffline,
        removeDownloadedTrack,
        clearAllDownloads,
        setQueueAndPlay,
        playTrack,
        playNextInQueue,
        addToQueue,
        removeFromQueue,
        requestAiSuggestionForQueue,
        togglePlayPause,
        playNext,
        playPrev,
        seekTo,
        setVolume,
        joinListenRoom,
        leaveListenRoom,
      }}
    >
      <audio
        ref={audioRef}
        crossOrigin="anonymous"
        preload="metadata"
        onTimeUpdate={(e) => {
          const nowSec = e.currentTarget.currentTime;
          setCurrentTime(nowSec);
          const delta = nowSec - lastAudioTimeRef.current;
          if (delta > 0 && delta < 2.5) {
            playedSecondsRef.current += delta;
          }
          lastAudioTimeRef.current = nowSec;
          if (currentTrack && (playedSecondsRef.current >= 30 || nowSec >= 30)) {
            logCompleted30sPlay(currentTrack);
          }
        }}
        onLoadedMetadata={(e) => setDuration(e.currentTarget.duration || currentTrack?.duration || 0)}
        onEnded={() => {
          if (currentTrack && playedSecondsRef.current >= 20) {
            logCompleted30sPlay(currentTrack);
          }
          playNext();
        }}
        onPlay={() => setIsPlaying(true)}
        onPause={() => setIsPlaying(false)}
        onError={(e) => {
          const el = e.currentTarget;
          const fallbackSrc = `/api/audio/synth/${encodeURIComponent(
            currentTrack?.videoId || 'default'
          )}`;
          if (currentTrack && !el.src.includes('/api/audio/synth/')) {
            el.src = fallbackSrc;
            el.load();
            if (isPlaying) {
              void el.play().catch(() => {});
            }
          }
        }}
      />
      {children}
    </PlayerContext.Provider>
  );
};

export function usePlayer() {
  const ctx = useContext(PlayerContext);
  if (!ctx) throw new Error('usePlayer must be used inside PlayerProvider');
  return ctx;
}
