import React, { useEffect, useMemo, useState } from 'react';
import {
  ArrowLeft,
  BadgeCheck,
  CheckCircle2,
  ChevronDown,
  Clock,
  Disc3,
  HardDriveDownload,
  Heart,
  Loader2,
  Pause,
  Play,
  RotateCcw,
  Search,
  Shuffle,
  Sparkles,
  Trash2,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { usePlayer } from '../context/PlayerContext';
import { apiFetch } from '../lib/apiClient';
import {
  buildArtistCatalog,
  formatDuration,
  mergeUniqueTracks,
  searchArtists,
  searchPlaylists,
  sliceVisibleTracks,
} from '../lib/audioMath';
import type { ArtistProfile, Playlist, Track, YTMusicSearchResult } from '../types/crate';
import { PlaylistArtwork, getPlaylistIconMeta } from './PlaylistArtwork';
import { TrackActionsMenu } from './TrackActionsMenu';

interface DiscoverViewProps {
  playlists: Playlist[];
  initialTracks: Track[];
  selectedPlaylist: Playlist | null;
  onSelectPlaylist: (pl: Playlist | null) => void;
  onPlaylistsUpdated?: (nextPlaylists: Playlist[]) => void;
  onDeletePlaylist?: (playlistId: string) => void;
  onRemoveTrackFromPlaylist?: (playlistId: string, trackVideoId: string) => void;
  searchQuery: string;
  searchActive: boolean;
  searchTrigger: number;
  onQuickSearch: (q: string) => void;
  onClearSearch: () => void;
}

type HomeFilter = 'all' | 'music' | 'crates';
type SearchSectionFilter = 'all' | 'artists' | 'playlists' | 'songs';

const BROWSE_CATEGORIES = [
  { label: 'All', query: '' },
  { label: 'Daily Mix', query: 'Daily Mix' },
  { label: 'Hindi', query: 'Hindi' },
  { label: 'Haryanvi', query: 'Haryanvi' },
  { label: 'Punjabi', query: 'Punjabi' },
  { label: 'Workout', query: 'Workout' },
  { label: 'Synthwave', query: 'Synth' },
  { label: 'Acoustic', query: 'Acoustic' },
];

export const DiscoverView: React.FC<DiscoverViewProps> = ({
  playlists,
  initialTracks,
  selectedPlaylist,
  onSelectPlaylist,
  onPlaylistsUpdated,
  onDeletePlaylist,
  onRemoveTrackFromPlaylist,
  searchQuery,
  searchActive,
  searchTrigger,
  onQuickSearch,
  onClearSearch,
}) => {
  const { profile, navigate } = useAuth();
  const {
    currentTrack,
    isPlaying,
    playTrack,
    togglePlayPause,
    setQueueAndPlay,
    isTrackDownloaded,
    downloadingIds,
    downloadTrackOffline,
    removeDownloadedTrack,
    clearAllDownloads,
  } = usePlayer();
  const [tracks, setTracks] = useState<Track[]>(initialTracks);
  const [searchedPlaylists, setSearchedPlaylists] = useState<Playlist[]>(playlists);
  const [searchedArtists, setSearchedArtists] = useState<ArtistProfile[]>([]);
  const [selectedArtist, setSelectedArtist] = useState<ArtistProfile | null>(null);
  const [searchFilter, setSearchFilter] = useState<SearchSectionFilter>('all');
  const [searching, setSearching] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [visibleSearchLimit, setVisibleSearchLimit] = useState(8);
  const [activeSearchLabel, setActiveSearchLabel] = useState('');
  const [homeFilter, setHomeFilter] = useState<HomeFilter>('all');
  const [historyActionBusy, setHistoryActionBusy] = useState(false);
  const [historyFeedback, setHistoryFeedback] = useState<string | null>(null);
  const [downloadingAllPlaylist, setDownloadingAllPlaylist] = useState(false);

  useEffect(() => {
    if (selectedPlaylist) {
      setSelectedArtist(null);
      setTracks(selectedPlaylist.tracks);
      setActiveSearchLabel('');
      return;
    }
    if (!searchActive && !searchQuery.trim() && !selectedArtist) {
      setTracks(initialTracks);
      setActiveSearchLabel('');
    }
  }, [initialTracks, searchActive, searchQuery, selectedArtist, selectedPlaylist]);

  // Live local playlist & artist filtering as the user types in the search box
  const instantPlaylists = useMemo(
    () => searchPlaylists(playlists, searchQuery),
    [playlists, searchQuery]
  );

  const localArtistCatalog = useMemo(
    () => buildArtistCatalog(playlists, mergeUniqueTracks(initialTracks, tracks)),
    [initialTracks, playlists, tracks]
  );

  const instantArtists = useMemo(
    () => searchArtists(localArtistCatalog, searchQuery),
    [localArtistCatalog, searchQuery]
  );

  // Fetch and append more AI-recommended songs in Search
  const loadMoreRecommendationsInSearch = async (
    currentList: Track[],
    queryOverride?: string
  ) => {
    if (loadingMore) return;
    setLoadingMore(true);
    const seed = currentList[currentList.length - 1] || currentList[0] || initialTracks[0];
    try {
      const res = await apiFetch('/api/recommendations/more', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query: (queryOverride ?? searchQuery).trim(),
          seedTitle: seed?.title || '',
          seedArtist: seed?.artist || '',
          excludeIds: currentList.map((t) => t.videoId || t.id),
          excludeTitles: currentList.map((t) => t.title),
        }),
      });
      if (res.ok) {
        const data = (await res.json()) as { tracks?: Track[] };
        if (Array.isArray(data.tracks) && data.tracks.length > 0) {
          setTracks((prev) => mergeUniqueTracks(prev, data.tracks!));
        }
      }
    } catch {
      // Ignore network error; existing buffered tracks still expand
    } finally {
      setLoadingMore(false);
    }
  };

  useEffect(() => {
    if (!searchActive) return;
    const q = searchQuery.trim();
    if (!q) {
      setSearchedPlaylists(playlists);
      setSearchedArtists(localArtistCatalog);
      setActiveSearchLabel('');
      setSearching(false);
      setTracks((prev) => mergeUniqueTracks(initialTracks, prev));
      return;
    }

    let cancelled = false;
    setSearching(true);
    setVisibleSearchLimit(8);
    setActiveSearchLabel(q);
    fetch(`/api/search/all?q=${encodeURIComponent(q)}`)
      .then((res) => (res.ok ? res.json() : { playlists: [], artists: [], tracks: [] }))
      .then(
        (data: {
          playlists?: Playlist[];
          artists?: ArtistProfile[];
          tracks?: YTMusicSearchResult[];
        }) => {
          if (cancelled) return;
          const apiPlaylists = Array.isArray(data.playlists) ? data.playlists : instantPlaylists;
          setSearchedPlaylists(apiPlaylists);
          if (Array.isArray(data.artists) && data.artists.length > 0) {
            setSearchedArtists(data.artists);
          } else {
            setSearchedArtists(instantArtists);
          }
          const mapped: Track[] = (Array.isArray(data.tracks) ? data.tracks : []).map((r) => ({
            id: r.videoId,
            videoId: r.videoId,
            title: r.title,
            artist: r.artist,
            album: r.album || 'YouTube Music',
            duration: r.duration || 210,
            artworkUrl: r.albumArt,
            source: 'ytmusic',
          }));
          setTracks(mapped);
        }
      )
      .catch(() => {
        if (!cancelled) {
          setSearchedPlaylists(instantPlaylists);
          setSearchedArtists(instantArtists);
          setTracks([]);
        }
      })
      .finally(() => {
        if (!cancelled) setSearching(false);
      });

    return () => {
      cancelled = true;
    };
  }, [searchTrigger, searchActive]);

  // Handler when user clicks "Show more" on Home bottom: transitions to Search & continues recommendations
  const handleContinueRecommendationsInSearch = () => {
    const merged = mergeUniqueTracks(initialTracks, tracks);
    setSelectedArtist(null);
    setTracks(merged);
    setVisibleSearchLimit(Math.max(10, merged.length + 6));
    onQuickSearch('');
    void loadMoreRecommendationsInSearch(merged, '');
  };

  // Handler when user clicks "Show more" at the bottom of Search songs
  const handleShowMoreInSearch = () => {
    setVisibleSearchLimit((prev) => prev + 8);
    void loadMoreRecommendationsInSearch(
      tracks,
      selectedArtist ? selectedArtist.name : searchQuery
    );
  };

  const handleSelectArtist = (artist: ArtistProfile) => {
    onSelectPlaylist(null);
    setSelectedArtist(artist);
    setTracks(artist.topTracks);
    setVisibleSearchLimit(Math.max(10, artist.topTracks.length + 4));
    // Also fetch additional songs by this artist in background so their artist page is rich
    void loadMoreRecommendationsInSearch(artist.topTracks, artist.name);
  };

  const firstName = profile?.full_name?.split(' ')[0] || 'You';
  const displayedSearchPlaylists = searchQuery.trim()
    ? instantPlaylists.length > 0
      ? instantPlaylists
      : searchedPlaylists
    : playlists;

  const displayedSearchArtists = searchQuery.trim()
    ? instantArtists.length > 0
      ? instantArtists
      : searchedArtists
    : localArtistCatalog;

  const totalPlaylistMinutes = useMemo(() => {
    if (!selectedPlaylist) return 0;
    const totalSec = selectedPlaylist.tracks.reduce((acc, t) => acc + (t.duration || 0), 0);
    return Math.max(1, Math.round(totalSec / 60));
  }, [selectedPlaylist]);

  const isPlaylistCurrentlyPlaying =
    Boolean(selectedPlaylist) &&
    isPlaying &&
    selectedPlaylist!.tracks.some((t) => t.videoId === currentTrack?.videoId);

  const handlePlayAllPlaylist = (plTracks: Track[]) => {
    if (plTracks.length === 0) return;
    if (
      selectedPlaylist &&
      plTracks.some((t) => t.videoId === currentTrack?.videoId)
    ) {
      togglePlayPause();
    } else {
      setQueueAndPlay(plTracks, 0);
    }
  };

  const handleShufflePlay = (plTracks: Track[]) => {
    if (plTracks.length === 0) return;
    const copy = [...plTracks];
    for (let i = copy.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [copy[i], copy[j]] = [copy[j], copy[i]];
    }
    setQueueAndPlay(copy, 0);
  };

  // User-Controlled Expiration & Deletion handlers for Weekly & Monthly Top Tracks
  const handleResetTopTracksHistory = async (scope: 'weekly' | 'monthly') => {
    if (historyActionBusy) return;
    setHistoryActionBusy(true);
    setHistoryFeedback(null);
    try {
      const res = await apiFetch(`/api/play-history?scope=${encodeURIComponent(scope)}`, {
        method: 'DELETE',
      });
      if (res.ok) {
        const data = (await res.json()) as {
          removedCount?: number;
          playlists?: Playlist[];
        };
        if (Array.isArray(data.playlists)) {
          onPlaylistsUpdated?.(data.playlists);
          if (selectedPlaylist) {
            const updated = data.playlists.find((p) => p.id === selectedPlaylist.id);
            if (updated) {
              setTracks(updated.tracks);
            }
          }
        }
        setHistoryFeedback(
          `Reset ${scope === 'weekly' ? '7-day weekly' : '30-day monthly'} play history (${
            data.removedCount ?? 0
          } entries cleared).`
        );
      }
    } catch {
      setHistoryFeedback('Could not reset play history right now.');
    } finally {
      setHistoryActionBusy(false);
    }
  };

  const handleToggleAutoExpire30Days = async (currentEnabled: boolean) => {
    if (historyActionBusy) return;
    setHistoryActionBusy(true);
    setHistoryFeedback(null);
    try {
      const res = await apiFetch('/api/play-history/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          autoExpire30Days: !currentEnabled,
          runCleanupNow: !currentEnabled,
        }),
      });
      if (res.ok) {
        const data = (await res.json()) as {
          autoExpire30Days?: boolean;
          removedCount?: number;
          playlists?: Playlist[];
        };
        if (Array.isArray(data.playlists)) {
          onPlaylistsUpdated?.(data.playlists);
        }
        setHistoryFeedback(
          data.autoExpire30Days
            ? `30-day automatic cleanup enabled (${data.removedCount ?? 0} expired entries pruned).`
            : '30-day automatic cleanup paused.'
        );
      }
    } catch {
      setHistoryFeedback('Could not update expiration setting.');
    } finally {
      setHistoryActionBusy(false);
    }
  };

  const handleRestoreSamplePlayHistory = async () => {
    if (historyActionBusy) return;
    setHistoryActionBusy(true);
    setHistoryFeedback(null);
    try {
      const res = await apiFetch('/api/play-history/seed', {
        method: 'POST',
      });
      if (res.ok) {
        const data = (await res.json()) as { playlists?: Playlist[] };
        if (Array.isArray(data.playlists)) {
          onPlaylistsUpdated?.(data.playlists);
          if (selectedPlaylist) {
            const updated = data.playlists.find((p) => p.id === selectedPlaylist.id);
            if (updated) {
              setTracks(updated.tracks);
            }
          }
        }
        setHistoryFeedback('Restored sample 7-day & 30-day listening history.');
      }
    } catch {
      setHistoryFeedback('Could not restore sample play history.');
    } finally {
      setHistoryActionBusy(false);
    }
  };

  const renderPlaylistGrid = (items: Playlist[], heading: string, countLabel?: string) => (
    <section className="px-4 md:px-6 mb-8">
      <div className="flex items-center justify-between gap-4 mb-3">
        <h2 className="text-xl font-bold tracking-tight text-[#F4F4F5]">{heading}</h2>
        <span className="text-xs text-[#A1A1AA] tabular-nums">
          {countLabel || `${items.length} ${items.length === 1 ? 'playlist' : 'playlists'}`}
        </span>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3.5">
        {items.map((pl) => {
          const meta = getPlaylistIconMeta(pl);
          const isDownloadsContainer =
            pl.id === 'pl-internal-downloads' || Boolean(pl.isDownloadsPlaylist);
          return (
            <div
              key={`card-${pl.id}`}
              className="group relative rounded-lg bg-[#16161B] hover:bg-[#202027] border border-[#2A2A32]/75 p-3 transition-colors"
            >
              <button
                type="button"
                onClick={() => onSelectPlaylist(pl)}
                className="w-full text-left cursor-pointer"
              >
                <div className="relative">
                  <PlaylistArtwork playlist={pl} size="lg" showBadge />
                </div>
                <p className="mt-3 text-sm font-bold text-[#F4F4F5] truncate">{pl.name}</p>
                <p className="mt-0.5 text-xs text-[#A1A1AA] truncate tabular-nums">
                  {pl.category || meta.label} · {pl.tracks.length} songs
                </p>
              </button>

              {onDeletePlaylist && !isDownloadsContainer && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onDeletePlaylist(pl.id);
                  }}
                  aria-label={`Delete playlist ${pl.name}`}
                  title={`Delete playlist ${pl.name}`}
                  className="absolute right-5 top-5 z-10 w-8 h-8 rounded-full bg-[#09090B]/85 border border-red-500/40 text-red-300 flex items-center justify-center opacity-0 group-hover:opacity-100 focus-visible:opacity-100 hover:bg-red-500/25 transition-all cursor-pointer"
                >
                  <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
                </button>
              )}

              {pl.tracks.length > 0 && (
                <button
                  type="button"
                  onClick={() => {
                    onSelectPlaylist(pl);
                    setQueueAndPlay(pl.tracks, 0);
                  }}
                  aria-label={`Play ${pl.name}`}
                  className="absolute right-5 top-[calc(100%-6.25rem)] w-11 h-11 rounded-full crate-cta flex items-center justify-center shadow-[0_8px_24px_rgba(9,9,11,0.75)] opacity-0 translate-y-2 group-hover:opacity-100 group-hover:translate-y-0 focus-visible:opacity-100 focus-visible:translate-y-0 hover:scale-105 transition-all duration-200 cursor-pointer"
                >
                  <Play className="w-5 h-5 fill-current ml-0.5" aria-hidden="true" />
                </button>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );

  // Spotify Circular Artist Cards Shelf
  const renderArtistsGrid = (items: ArtistProfile[], heading: string) => (
    <section className="px-4 md:px-6 mb-8" aria-label={heading}>
      <div className="flex items-center justify-between gap-4 mb-3">
        <h2 className="text-xl font-bold tracking-tight text-[#F4F4F5]">{heading}</h2>
        <span className="text-xs text-[#A1A1AA] tabular-nums">
          {items.length} {items.length === 1 ? 'artist' : 'artists'}
        </span>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3.5">
        {items.slice(0, 10).map((artist) => (
          <div
            key={artist.id}
            className="group relative rounded-lg bg-[#16161B] hover:bg-[#202027] border border-[#2A2A32]/75 p-3.5 transition-colors"
          >
            <button
              type="button"
              onClick={() => handleSelectArtist(artist)}
              className="w-full text-left cursor-pointer"
            >
              <div className="relative w-full aspect-square rounded-full overflow-hidden border-2 border-[#2A2A32] group-hover:border-[#E8A849]/60 shadow-[0_12px_30px_rgba(0,0,0,0.7)] transition-colors bg-[#09090B]">
                <img
                  src={artist.avatarUrl}
                  alt={artist.name}
                  referrerPolicy="no-referrer"
                  className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                />
              </div>
              <div className="mt-3 flex items-center gap-1 min-w-0">
                <p className="text-sm font-bold text-[#F4F4F5] truncate">{artist.name}</p>
                {artist.verified && (
                  <BadgeCheck
                    className="w-3.5 h-3.5 text-[#E8A849] shrink-0"
                    aria-label="Verified Artist"
                  />
                )}
              </div>
              <p className="mt-0.5 text-xs text-[#A1A1AA] truncate">
                Artist · {artist.topTracks.length}{' '}
                {artist.topTracks.length === 1 ? 'song' : 'songs'}
              </p>
            </button>

            {artist.topTracks.length > 0 && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setQueueAndPlay(artist.topTracks, 0);
                }}
                aria-label={`Play ${artist.name}`}
                className="absolute right-4 bottom-16 w-11 h-11 rounded-full crate-cta flex items-center justify-center shadow-[0_8px_24px_rgba(9,9,11,0.85)] opacity-0 translate-y-2 group-hover:opacity-100 group-hover:translate-y-0 focus-visible:opacity-100 focus-visible:translate-y-0 hover:scale-105 transition-all duration-200 cursor-pointer"
              >
                <Play className="w-5 h-5 fill-current ml-0.5" aria-hidden="true" />
              </button>
            )}
          </div>
        ))}
      </div>
    </section>
  );

  const renderTrackTable = (
    list: Track[],
    heading?: string,
    subtitle?: string,
    showMoreConfig?: {
      onShowMore: () => void;
      label?: string;
      sublabel?: string;
      loading?: boolean;
      fullPlayList?: Track[];
    },
    playlistContext?: {
      playlistId: string;
      playlistName: string;
    }
  ) => (
    <section className="px-4 md:px-6 pb-8">
      {heading && (
        <div className="flex items-center justify-between gap-4 mb-3">
          <div>
            <h2 className="text-xl font-bold tracking-tight text-[#F4F4F5]">{heading}</h2>
            {subtitle && <p className="text-xs text-[#A1A1AA] mt-0.5">{subtitle}</p>}
          </div>
          {list.length > 0 && (
            <button
              type="button"
              onClick={() => setQueueAndPlay(showMoreConfig?.fullPlayList || list, 0)}
              className="text-xs font-semibold text-[#A1A1AA] hover:text-[#E8A849] transition-colors cursor-pointer whitespace-nowrap shrink-0"
            >
              Play All ({(showMoreConfig?.fullPlayList || list).length})
            </button>
          )}
        </div>
      )}

      {/* Spotify-style Column Header */}
      <div className="grid grid-cols-[28px_minmax(0,1fr)_148px] md:grid-cols-[36px_minmax(0,1.5fr)_minmax(0,1fr)_168px] items-center gap-3 px-3 py-2 border-b border-[#2A2A32] text-xs font-medium text-[#71717A]">
        <span className="text-center">#</span>
        <span>Title</span>
        <span className="hidden md:block">Album</span>
        <span className="flex items-center justify-end pr-16">
          <Clock className="w-3.5 h-3.5" aria-hidden="true" />
        </span>
      </div>

      <div className="mt-1 space-y-0.5">
        {list.map((track, idx) => {
          const active = currentTrack?.videoId === track.videoId;
          const trackVid = track.videoId || track.id;
          return (
            <div
              key={`${trackVid}-${idx}`}
              className={`group grid grid-cols-[28px_minmax(0,1fr)_148px] md:grid-cols-[36px_minmax(0,1.5fr)_minmax(0,1fr)_168px] items-center gap-3 px-3 py-2 rounded-md transition-colors ${
                active ? 'bg-[#24242B]' : 'hover:bg-[#1C1C21]'
              }`}
            >
              {/* Index / Hover Play (single song -> AI picks next most related song) */}
              <div className="flex items-center justify-center">
                <span
                  className={`text-xs font-mono tabular-nums group-hover:hidden ${
                    active ? 'text-[#E8A849] font-bold' : 'text-[#71717A]'
                  }`}
                >
                  {idx + 1}
                </span>
                <button
                  type="button"
                  onClick={() => playTrack(track)}
                  aria-label={`Play ${track.title} by ${track.artist}`}
                  className="hidden group-hover:flex items-center justify-center text-[#F4F4F5] hover:text-[#E8A849] cursor-pointer"
                >
                  <Play className="w-3.5 h-3.5 fill-current" aria-hidden="true" />
                </button>
              </div>

              {/* Cover + Title & Artist */}
              <div className="flex items-center gap-3 min-w-0">
                <img
                  src={track.artworkUrl}
                  alt={track.title}
                  referrerPolicy="no-referrer"
                  className="w-10 h-10 rounded object-cover border border-[#2A2A32] shrink-0"
                />
                <div className="min-w-0 flex-1">
                  <p
                    className={`text-sm font-medium truncate ${
                      active ? 'text-[#E8A849]' : 'text-[#F4F4F5]'
                    }`}
                  >
                    {track.title}
                  </p>
                  <p className="text-xs text-[#A1A1AA] truncate">{track.artist}</p>
                </div>
              </div>

              {/* Album + Optional Play Count / Internal Sandbox URI Badge */}
              <div className="hidden md:flex items-center gap-2 min-w-0">
                <p className="text-xs text-[#A1A1AA] truncate">
                  {track.localFileUri || track.album || 'YouTube Music'}
                </p>
                {(Boolean(track.localFileUri) || isTrackDownloaded(trackVid)) && (
                  <span
                    title={
                      track.localFileUri ||
                      `Directory.Data/tracks/${trackVid}.mp3`
                    }
                    className="inline-flex items-center gap-1 rounded bg-emerald-500/15 border border-emerald-500/35 px-1.5 py-0.5 text-[10px] font-mono font-semibold text-emerald-300 shrink-0"
                  >
                    <CheckCircle2 className="w-2.5 h-2.5" aria-hidden="true" />
                    <span>Sandbox</span>
                  </span>
                )}
                {typeof track.playCount === 'number' && track.playCount > 0 && (
                  <span className="inline-flex items-center rounded bg-[#E8A849]/15 border border-[#E8A849]/35 px-1.5 py-0.5 text-[10px] font-mono font-semibold text-[#E8A849] shrink-0">
                    {track.playCount} {track.playCount === 1 ? 'play' : 'plays'}
                  </span>
                )}
              </div>

              {/* Duration + Offline Sandbox Download + Remove from Playlist + Play + 3-Dots Queue Menu */}
              <div className="flex items-center justify-end gap-1.5">
                <span className="text-xs font-mono text-[#71717A] tabular-nums mr-1">
                  {formatDuration(track.duration)}
                </span>
                <button
                  type="button"
                  disabled={Boolean(downloadingIds[trackVid])}
                  onClick={() => {
                    if (isTrackDownloaded(trackVid)) {
                      void removeDownloadedTrack(trackVid);
                    } else {
                      void downloadTrackOffline(track);
                    }
                  }}
                  aria-label={
                    isTrackDownloaded(trackVid)
                      ? `Remove ${track.title} from Offline Sandbox`
                      : `Download ${track.title} to Offline Sandbox`
                  }
                  title={
                    isTrackDownloaded(trackVid)
                      ? 'Saved in App Sandbox (Directory.Data) · Click to remove'
                      : 'Download to Internal App Sandbox (Directory.Data)'
                  }
                  className={`w-7 h-7 rounded-full inline-flex items-center justify-center transition-all cursor-pointer disabled:opacity-50 ${
                    isTrackDownloaded(trackVid)
                      ? 'bg-emerald-500/15 border border-emerald-500/40 text-emerald-300 hover:bg-red-500/20 hover:text-red-300'
                      : 'bg-[#24242B] text-[#A1A1AA] hover:text-[#E8A849] hover:bg-[#2A2A32]'
                  }`}
                >
                  {downloadingIds[trackVid] ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin text-[#E8A849]" aria-hidden="true" />
                  ) : isTrackDownloaded(trackVid) ? (
                    <CheckCircle2 className="w-3.5 h-3.5" aria-hidden="true" />
                  ) : (
                    <HardDriveDownload className="w-3.5 h-3.5" aria-hidden="true" />
                  )}
                </button>
                {playlistContext && onRemoveTrackFromPlaylist && (
                  <button
                    type="button"
                    onClick={() =>
                      onRemoveTrackFromPlaylist(playlistContext.playlistId, trackVid)
                    }
                    aria-label={`Remove ${track.title} from ${playlistContext.playlistName}`}
                    title={`Remove ${track.title} from ${playlistContext.playlistName}`}
                    className="w-7 h-7 rounded-full inline-flex items-center justify-center bg-[#24242B] text-[#A1A1AA] hover:bg-red-500/20 hover:text-red-300 transition-all cursor-pointer"
                  >
                    <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => playTrack(track)}
                  aria-label={`Play ${track.title} by ${track.artist}`}
                  className={`w-7 h-7 rounded-full inline-flex items-center justify-center transition-all cursor-pointer ${
                    active && isPlaying
                      ? 'crate-cta'
                      : 'bg-[#24242B] text-[#E4E4E7] md:opacity-0 md:group-hover:opacity-100 focus-visible:opacity-100 hover:bg-[#E8A849] hover:text-[#09090B]'
                  }`}
                >
                  <Play className="w-3 h-3 fill-current ml-0.5" aria-hidden="true" />
                </button>
                <TrackActionsMenu
                  track={track}
                  onQuickSearch={onQuickSearch}
                  playlistName={playlistContext?.playlistName}
                  onRemoveFromPlaylist={
                    playlistContext && onRemoveTrackFromPlaylist
                      ? () =>
                          onRemoveTrackFromPlaylist(playlistContext.playlistId, trackVid)
                      : undefined
                  }
                />
              </div>
            </div>
          );
        })}
      </div>

      {showMoreConfig && (
        <div className="mt-5 flex flex-col items-center justify-center">
          <button
            type="button"
            onClick={showMoreConfig.onShowMore}
            disabled={showMoreConfig.loading}
            className="inline-flex items-center gap-2 rounded-full border border-[#E8A849]/45 bg-[#18181D] hover:bg-[#24242B] hover:border-[#E8A849] px-5 py-2.5 text-xs font-semibold text-[#F4F4F5] transition-all cursor-pointer shadow-[0_6px_20px_rgba(0,0,0,0.45)] disabled:opacity-60"
          >
            <Sparkles className="w-3.5 h-3.5 text-[#E8A849]" aria-hidden="true" />
            <span>{showMoreConfig.loading ? 'Loading more recommendations...' : showMoreConfig.label || 'Show more'}</span>
            <ChevronDown className="w-3.5 h-3.5 text-[#E8A849]" aria-hidden="true" />
          </button>
          {showMoreConfig.sublabel && (
            <p className="mt-1.5 text-[11px] text-[#71717A]">{showMoreConfig.sublabel}</p>
          )}
        </div>
      )}
    </section>
  );

  return (
    <div className="flex-1 overflow-y-auto md:rounded-lg spotify-panel crate-canvas pb-36 md:pb-8">
      {/* 0. SPOTIFY ARTIST PROFILE VIEW (When user clicks an Artist card in Search or Home) */}
      {selectedArtist ? (
        <div>
          <div className="bg-gradient-to-b from-[#66411E]/55 via-[#241A12]/60 to-transparent px-4 md:px-7 pt-6 pb-6">
            <button
              type="button"
              onClick={() => setSelectedArtist(null)}
              className="inline-flex items-center gap-1.5 rounded-full bg-[#09090B]/70 border border-[#2A2A32] px-3 py-1.5 text-xs font-semibold text-[#F4F4F5] hover:border-[#E8A849] hover:text-[#E8A849] transition-colors mb-5 cursor-pointer"
            >
              <ArrowLeft className="w-3.5 h-3.5" aria-hidden="true" />
              {searchActive ? 'Back to Search' : 'Back Home'}
            </button>

            <div className="flex flex-col sm:flex-row sm:items-end gap-5 md:gap-7">
              <div className="w-32 h-32 sm:w-44 sm:h-44 rounded-full overflow-hidden border-2 border-[#E8A849]/50 shadow-[0_20px_50px_rgba(9,9,11,0.85)] shrink-0 bg-[#09090B]">
                <img
                  src={selectedArtist.avatarUrl}
                  alt={selectedArtist.name}
                  referrerPolicy="no-referrer"
                  className="w-full h-full object-cover"
                />
              </div>

              <div className="min-w-0 flex-1">
                <p className="text-xs font-semibold text-[#E8A849] flex items-center gap-1.5">
                  <BadgeCheck className="w-4 h-4 text-[#E8A849]" aria-hidden="true" />
                  <span>Verified Artist</span>
                </p>
                <h1 className="mt-1.5 text-3xl sm:text-5xl font-extrabold tracking-tight text-[#F4F4F5] text-balance">
                  {selectedArtist.name}
                </h1>
                <p className="mt-2 text-sm text-[#A1A1AA]">
                  {selectedArtist.genre} · {selectedArtist.monthlyListeners}
                </p>
              </div>
            </div>
          </div>

          <div className="px-4 md:px-7 py-4 flex items-center gap-4">
            <button
              type="button"
              onClick={() => handlePlayAllPlaylist(tracks)}
              disabled={tracks.length === 0}
              aria-label={`Play ${selectedArtist.name}`}
              className="w-14 h-14 rounded-full crate-cta flex items-center justify-center shadow-[0_8px_28px_rgba(232,168,73,0.32)] hover:scale-105 disabled:opacity-40 transition-transform cursor-pointer"
            >
              <Play className="w-6 h-6 fill-current ml-0.5" aria-hidden="true" />
            </button>

            <button
              type="button"
              onClick={() => handleShufflePlay(tracks)}
              disabled={tracks.length === 0}
              className="inline-flex items-center gap-2 rounded-full border border-[#2A2A32] bg-[#18181D] px-4 py-2 text-xs font-semibold text-[#F4F4F5] hover:border-[#E8A849] hover:text-[#E8A849] transition-colors cursor-pointer"
            >
              <Shuffle className="w-3.5 h-3.5 text-[#E8A849]" aria-hidden="true" />
              <span>Shuffle</span>
            </button>

            <span className="hidden sm:inline text-xs font-medium text-[#A1A1AA] tabular-nums">
              Popular · {tracks.length} songs
            </span>
          </div>

          {renderTrackTable(
            sliceVisibleTracks(tracks, visibleSearchLimit).visible,
            `Popular by ${selectedArtist.name}`,
            'Use ••• to Play Next or Add to Queue · Click Show more to load more tracks by this artist',
            {
              onShowMore: handleShowMoreInSearch,
              label: 'Show more',
              sublabel: `Load more songs by ${selectedArtist.name}`,
              loading: loadingMore,
              fullPlayList: tracks,
            }
          )}
        </div>
      ) : searchActive || activeSearchLabel ? (
        /* 1. SEARCH & BROWSE VIEW (Opens on Search Icon click & shows Artists + Playlists + Songs like Spotify) */
        <div className="pt-5">
          <div className="px-4 md:px-6 flex items-center justify-between gap-4 mb-4">
            <div>
              <h1 className="text-2xl font-bold tracking-tight text-[#F4F4F5] flex items-center gap-2">
                <Search className="w-5 h-5 text-[#E8A849]" aria-hidden="true" />
                <span>
                  {searchQuery.trim()
                    ? `Search results for "${searchQuery.trim()}"`
                    : 'Browse & Search'}
                </span>
              </h1>
              <p className="text-xs text-[#A1A1AA] mt-0.5">
                Explore Artists, Spotify-style Playlists, and Songs — click any artist or track to listen.
              </p>
            </div>
            <button
              type="button"
              onClick={() => {
                setSelectedArtist(null);
                onClearSearch();
              }}
              className="inline-flex items-center gap-1.5 rounded-full border border-[#2A2A32] bg-[#18181D] px-3.5 py-1.5 text-xs font-semibold text-[#F4F4F5] hover:border-[#E8A849] hover:text-[#E8A849] transition-colors cursor-pointer whitespace-nowrap"
            >
              <ArrowLeft className="w-3.5 h-3.5" aria-hidden="true" />
              Back Home
            </button>
          </div>

          {/* Spotify Search Category Tabs (All | Artists | Playlists | Songs) + Quick Mood Chips */}
          <div className="px-4 md:px-6 flex flex-wrap items-center gap-2 mb-5">
            {(
              [
                { id: 'all', label: 'All' },
                { id: 'artists', label: 'Artists' },
                { id: 'playlists', label: 'Playlists' },
                { id: 'songs', label: 'Songs' },
              ] as Array<{ id: SearchSectionFilter; label: string }>
            ).map((tab) => {
              const active = searchFilter === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setSearchFilter(tab.id)}
                  className={`rounded-full px-3.5 py-1.5 text-xs font-bold transition-colors cursor-pointer ${
                    active
                      ? 'bg-[#E8A849] text-[#09090B]'
                      : 'bg-[#24242B] text-[#F4F4F5] hover:bg-[#2E2E38]'
                  }`}
                >
                  {tab.label}
                </button>
              );
            })}

            <span className="h-4 w-px bg-[#2A2A32] mx-1 hidden sm:inline-block" aria-hidden="true" />

            {BROWSE_CATEGORIES.filter((c) => c.query).map((cat) => {
              const active = searchQuery.trim().toLowerCase() === cat.query.toLowerCase();
              return (
                <button
                  key={cat.label}
                  type="button"
                  onClick={() => onQuickSearch(cat.query)}
                  className={`rounded-full px-3 py-1.5 text-xs font-medium transition-colors cursor-pointer ${
                    active
                      ? 'bg-[#E8A849]/25 text-[#E8A849] border border-[#E8A849]/50'
                      : 'bg-[#18181D] text-[#A1A1AA] hover:text-[#F4F4F5] border border-[#2A2A32]'
                  }`}
                >
                  {cat.label}
                </button>
              );
            })}
          </div>

          {/* Spotify Circular Artists Shelf */}
          {(searchFilter === 'all' || searchFilter === 'artists') &&
            displayedSearchArtists.length > 0 &&
            renderArtistsGrid(
              displayedSearchArtists,
              searchQuery.trim() ? 'Artists' : 'Popular Artists'
            )}

          {/* Searchable Playlists Section */}
          {(searchFilter === 'all' || searchFilter === 'playlists') &&
            displayedSearchPlaylists.length > 0 &&
            renderPlaylistGrid(
              displayedSearchPlaylists,
              searchQuery.trim() ? 'Matching Playlists' : 'Browse All Playlists'
            )}

          {searching ? (
            <div className="px-4 md:px-6 space-y-2">
              {Array.from({ length: 5 }).map((_, i) => (
                <div
                  key={i}
                  className="h-14 rounded-md bg-[#1C1C21] animate-pulse"
                />
              ))}
            </div>
          ) : searchQuery.trim() &&
            tracks.length === 0 &&
            displayedSearchPlaylists.length === 0 &&
            displayedSearchArtists.length === 0 ? (
            <div className="mx-4 md:mx-6 rounded-xl border border-[#2A2A32] bg-[#141418] p-10 text-center">
              <Disc3 className="w-8 h-8 text-[#E8A849] mx-auto" aria-hidden="true" />
              <p className="mt-3 text-sm font-semibold text-[#F4F4F5]">
                No artists, playlists, or songs found
              </p>
              <p className="mt-1 text-xs text-[#A1A1AA]">
                Try another artist name, playlist mood, or song title.
              </p>
            </div>
          ) : (
            (searchFilter === 'all' || searchFilter === 'songs') &&
            tracks.length > 0 && (
              <>
                <div className="px-4 md:px-6 grid grid-cols-1 lg:grid-cols-12 gap-5 mb-6">
                  {/* Top Result Card */}
                  <div className="lg:col-span-5 group relative rounded-xl bg-[#18181D] hover:bg-[#222229] border border-[#2A2A32] p-5 transition-colors flex flex-col justify-between">
                    <div>
                      <div className="flex items-center justify-between mb-3">
                        <p className="text-xs font-semibold text-[#A1A1AA]">Top result</p>
                        <TrackActionsMenu track={tracks[0]} onQuickSearch={onQuickSearch} />
                      </div>
                      <img
                        src={tracks[0].artworkUrl}
                        alt={tracks[0].title}
                        referrerPolicy="no-referrer"
                        className="w-24 h-24 rounded-lg object-cover shadow-lg border border-[#2A2A32]"
                      />
                      <h2 className="mt-4 text-2xl font-bold text-[#F4F4F5] truncate">
                        {tracks[0].title}
                      </h2>
                      <p className="mt-1 text-sm text-[#A1A1AA] truncate">
                        Song ·{' '}
                        <span className="text-[#F4F4F5] font-medium">{tracks[0].artist}</span>
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => playTrack(tracks[0])}
                      aria-label={`Play ${tracks[0].title}`}
                      className="absolute bottom-5 right-5 w-12 h-12 rounded-full crate-cta flex items-center justify-center shadow-[0_8px_24px_rgba(9,9,11,0.75)] hover:scale-105 transition-transform cursor-pointer"
                    >
                      <Play className="w-5 h-5 fill-current ml-0.5" aria-hidden="true" />
                    </button>
                  </div>

                  {/* Quick Songs List */}
                  <div className="lg:col-span-7">
                    <h2 className="text-base font-bold text-[#F4F4F5] mb-2">Songs</h2>
                    <div className="space-y-1">
                      {tracks.slice(0, 4).map((t, idx) => {
                        const active = currentTrack?.videoId === t.videoId;
                        return (
                          <div
                            key={`${t.videoId}-top-${idx}`}
                            className={`group flex items-center justify-between gap-3 rounded-md p-2 transition-colors ${
                              active ? 'bg-[#24242B]' : 'hover:bg-[#1C1C21]'
                            }`}
                          >
                            <div className="flex items-center gap-3 min-w-0 flex-1">
                              <img
                                src={t.artworkUrl}
                                alt={t.title}
                                referrerPolicy="no-referrer"
                                className="w-10 h-10 rounded object-cover shrink-0 border border-[#2A2A32]"
                              />
                              <div className="min-w-0 flex-1">
                                <p
                                  className={`text-sm font-medium truncate ${
                                    active ? 'text-[#E8A849]' : 'text-[#F4F4F5]'
                                  }`}
                                >
                                  {t.title}
                                </p>
                                <p className="text-xs text-[#A1A1AA] truncate">{t.artist}</p>
                              </div>
                            </div>
                            <div className="flex items-center gap-2 shrink-0">
                              <span className="text-xs font-mono text-[#71717A] tabular-nums">
                                {formatDuration(t.duration)}
                              </span>
                              <button
                                type="button"
                                onClick={() => playTrack(t)}
                                aria-label={`Play ${t.title} by ${t.artist}`}
                                className="w-8 h-8 rounded-full bg-[#24242B] text-[#E8A849] hover:bg-[#E8A849] hover:text-[#09090B] flex items-center justify-center transition-colors cursor-pointer"
                              >
                                <Play className="w-3.5 h-3.5 fill-current ml-0.5" aria-hidden="true" />
                              </button>
                              <TrackActionsMenu track={t} onQuickSearch={onQuickSearch} />
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>

                {tracks.length > 0 &&
                  renderTrackTable(
                    sliceVisibleTracks(tracks, visibleSearchLimit).visible,
                    searchQuery.trim()
                      ? 'All Matching & Recommended Songs'
                      : `Recommended Songs for ${firstName}`,
                    'Click Show more below to continue discovering AI-recommended songs in Search',
                    {
                      onShowMore: handleShowMoreInSearch,
                      label: 'Show more',
                      sublabel:
                        tracks.length > visibleSearchLimit
                          ? `${tracks.length - visibleSearchLimit} more songs ready · Plus continuous AI recommendations`
                          : 'Continues fetching more AI recommendations in Search',
                      loading: loadingMore,
                      fullPlayList: tracks,
                    }
                  )}
              </>
            )
          )}
        </div>
      ) : selectedPlaylist ? (
        /* 2. SPOTIFY PLAYLIST DETAIL VIEW */
        <div>
          {/* Rich Playlist Hero Banner */}
          <div className="bg-gradient-to-b from-[#5C3A1B]/45 via-[#241A12]/55 to-transparent px-4 md:px-7 pt-6 pb-6">
            <button
              type="button"
              onClick={() => onSelectPlaylist(null)}
              className="inline-flex items-center gap-1.5 rounded-full bg-[#09090B]/70 border border-[#2A2A32] px-3 py-1.5 text-xs font-semibold text-[#F4F4F5] hover:border-[#E8A849] hover:text-[#E8A849] transition-colors mb-5 cursor-pointer"
            >
              <ArrowLeft className="w-3.5 h-3.5" aria-hidden="true" />
              Home
            </button>

            <div className="flex flex-col sm:flex-row sm:items-end gap-5 md:gap-7">
              <PlaylistArtwork
                playlist={selectedPlaylist}
                size="xl"
                showBadge
                className="shadow-[0_20px_50px_rgba(9,9,11,0.8)]"
              />

              <div className="min-w-0 flex-1">
                <p className="text-xs font-semibold text-[#E4E4E7] flex items-center gap-1.5">
                  {getPlaylistIconMeta(selectedPlaylist).renderIcon('w-3.5 h-3.5 text-[#E8A849]')}
                  <span>{selectedPlaylist.category || getPlaylistIconMeta(selectedPlaylist).label}</span>
                </p>
                <h1 className="mt-1.5 text-3xl sm:text-5xl font-extrabold tracking-tight text-[#F4F4F5] text-balance">
                  {selectedPlaylist.name}
                </h1>
                <p className="mt-2 text-sm text-[#A1A1AA] max-w-2xl">
                  {selectedPlaylist.description}
                </p>
                <p className="mt-2 text-xs font-medium text-[#E4E4E7] tabular-nums">
                  Crate · {selectedPlaylist.tracks.length}{' '}
                  {selectedPlaylist.tracks.length === 1 ? 'song' : 'songs'} · about {totalPlaylistMinutes}{' '}
                  min
                </p>
              </div>
            </div>
          </div>

          {/* Spotify Playlist Action Strip */}
          <div className="px-4 md:px-7 py-4 flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-4">
              <button
                type="button"
                onClick={() => handlePlayAllPlaylist(tracks)}
                disabled={tracks.length === 0}
                aria-label={`Play All (${tracks.length})`}
                className="w-14 h-14 rounded-full crate-cta flex items-center justify-center shadow-[0_8px_28px_rgba(232,168,73,0.32)] hover:scale-105 disabled:opacity-40 transition-transform cursor-pointer"
              >
                {isPlaylistCurrentlyPlaying ? (
                  <Pause className="w-6 h-6 fill-current" aria-hidden="true" />
                ) : (
                  <Play className="w-6 h-6 fill-current ml-0.5" aria-hidden="true" />
                )}
              </button>

              <button
                type="button"
                onClick={() => handleShufflePlay(tracks)}
                disabled={tracks.length === 0}
                className="inline-flex items-center gap-2 rounded-full border border-[#2A2A32] bg-[#18181D] px-4 py-2 text-xs font-semibold text-[#F4F4F5] hover:border-[#E8A849] hover:text-[#E8A849] transition-colors cursor-pointer"
              >
                <Shuffle className="w-3.5 h-3.5 text-[#E8A849]" aria-hidden="true" />
                <span>Shuffle</span>
              </button>

              <span className="hidden sm:inline text-xs font-medium text-[#A1A1AA] tabular-nums">
                Play All ({tracks.length})
              </span>
            </div>

            {/* User-Controlled Expiration & Deletion Controls for Auto-Generated Top Tracks */}
            {(selectedPlaylist.isAutoTopTracks ||
              selectedPlaylist.id === 'pl-weekly-top-tracks' ||
              selectedPlaylist.id === 'pl-monthly-top-tracks') && (
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  role="switch"
                  aria-checked={selectedPlaylist.autoExpireEnabled !== false}
                  disabled={historyActionBusy}
                  onClick={() =>
                    void handleToggleAutoExpire30Days(
                      selectedPlaylist.autoExpireEnabled !== false
                    )
                  }
                  className={`inline-flex items-center gap-2 rounded-full border px-3.5 py-1.5 text-xs font-semibold transition-colors cursor-pointer disabled:opacity-50 ${
                    selectedPlaylist.autoExpireEnabled !== false
                      ? 'border-[#E8A849]/50 bg-[#E8A849]/15 text-[#E8A849]'
                      : 'border-[#2A2A32] bg-[#18181D] text-[#A1A1AA] hover:text-[#F4F4F5]'
                  }`}
                >
                  <Clock className="w-3.5 h-3.5" aria-hidden="true" />
                  <span>
                    Auto-Delete &gt;30d:{' '}
                    {selectedPlaylist.autoExpireEnabled !== false ? 'ON' : 'OFF'}
                  </span>
                </button>

                <button
                  type="button"
                  disabled={historyActionBusy}
                  onClick={() =>
                    void handleResetTopTracksHistory(
                      selectedPlaylist.topTracksPeriod === 'weekly' ||
                        selectedPlaylist.id === 'pl-weekly-top-tracks'
                        ? 'weekly'
                        : 'monthly'
                    )
                  }
                  className="inline-flex items-center gap-1.5 rounded-full border border-red-500/40 bg-red-500/10 hover:bg-red-500/20 px-3.5 py-1.5 text-xs font-semibold text-red-200 transition-colors cursor-pointer disabled:opacity-50"
                >
                  <Trash2 className="w-3.5 h-3.5 text-red-300" aria-hidden="true" />
                  <span>
                    {selectedPlaylist.topTracksPeriod === 'weekly' ||
                    selectedPlaylist.id === 'pl-weekly-top-tracks'
                      ? 'Reset Weekly History'
                      : 'Reset Monthly History'}
                  </span>
                </button>

                {tracks.length === 0 && (
                  <button
                    type="button"
                    disabled={historyActionBusy}
                    onClick={() => void handleRestoreSamplePlayHistory()}
                    className="inline-flex items-center gap-1.5 rounded-full border border-[#E8A849]/45 bg-[#18181D] hover:border-[#E8A849] px-3.5 py-1.5 text-xs font-semibold text-[#E8A849] transition-colors cursor-pointer disabled:opacity-50"
                  >
                    <RotateCcw className="w-3.5 h-3.5" aria-hidden="true" />
                    <span>Restore Sample History</span>
                  </button>
                )}
              </div>
            )}

            {/* Dedicated Offline Sandbox Controls for 'Downloads' Playlist */}
            {(selectedPlaylist.isDownloadsPlaylist ||
              selectedPlaylist.id === 'pl-internal-downloads') && (
              <div className="flex flex-wrap items-center gap-2">
                <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-500/40 bg-emerald-500/10 px-3.5 py-1.5 text-xs font-semibold text-emerald-300">
                  <HardDriveDownload className="w-3.5 h-3.5 text-emerald-400" aria-hidden="true" />
                  <span>App Sandbox · Directory.Data/tracks/*.mp3</span>
                </span>

                {tracks.length > 0 && (
                  <button
                    type="button"
                    onClick={() => void clearAllDownloads()}
                    className="inline-flex items-center gap-1.5 rounded-full border border-red-500/40 bg-red-500/10 hover:bg-red-500/20 px-3.5 py-1.5 text-xs font-semibold text-red-200 transition-colors cursor-pointer"
                  >
                    <Trash2 className="w-3.5 h-3.5 text-red-300" aria-hidden="true" />
                    <span>Wipe Offline Sandbox</span>
                  </button>
                )}
              </div>
            )}

            {/* Download All to Internal Sandbox + Delete Playlist controls for playlists */}
            {!selectedPlaylist.isDownloadsPlaylist &&
              selectedPlaylist.id !== 'pl-internal-downloads' && (
                <div className="flex flex-wrap items-center gap-2">
                  {tracks.length > 0 && (
                    <button
                      type="button"
                      disabled={downloadingAllPlaylist}
                      onClick={async () => {
                        setDownloadingAllPlaylist(true);
                        try {
                          for (const t of tracks) {
                            const vid = t.videoId || t.id;
                            if (!isTrackDownloaded(vid)) {
                              await downloadTrackOffline(t);
                            }
                          }
                        } finally {
                          setDownloadingAllPlaylist(false);
                        }
                      }}
                      className="inline-flex items-center gap-1.5 rounded-full border border-emerald-500/40 bg-emerald-500/10 hover:bg-emerald-500/20 px-3.5 py-1.5 text-xs font-semibold text-emerald-300 transition-colors cursor-pointer disabled:opacity-50"
                    >
                      {downloadingAllPlaylist ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin text-emerald-300" aria-hidden="true" />
                      ) : (
                        <HardDriveDownload className="w-3.5 h-3.5 text-emerald-400" aria-hidden="true" />
                      )}
                      <span>
                        {downloadingAllPlaylist
                          ? 'Saving to Sandbox...'
                          : 'Download All to Sandbox'}
                      </span>
                    </button>
                  )}

                  {onDeletePlaylist && (
                    <button
                      type="button"
                      onClick={() => onDeletePlaylist(selectedPlaylist.id)}
                      aria-label={`Delete playlist ${selectedPlaylist.name}`}
                      className="inline-flex items-center gap-1.5 rounded-full border border-red-500/40 bg-red-500/10 hover:bg-red-500/20 px-3.5 py-1.5 text-xs font-semibold text-red-200 transition-colors cursor-pointer"
                    >
                      <Trash2 className="w-3.5 h-3.5 text-red-300" aria-hidden="true" />
                      <span>Delete Playlist</span>
                    </button>
                  )}
                </div>
              )}
          </div>

          {historyFeedback &&
            (selectedPlaylist.isAutoTopTracks ||
              selectedPlaylist.id === 'pl-weekly-top-tracks' ||
              selectedPlaylist.id === 'pl-monthly-top-tracks') && (
              <div className="mx-4 md:mx-7 mb-4 rounded-lg border border-[#E8A849]/35 bg-[#18181D] px-3.5 py-2 text-xs text-[#E4E4E7] flex items-center justify-between gap-3">
                <span>{historyFeedback}</span>
                <button
                  type="button"
                  onClick={() => setHistoryFeedback(null)}
                  className="text-[11px] font-semibold text-[#A1A1AA] hover:text-[#F4F4F5] cursor-pointer"
                >
                  Dismiss
                </button>
              </div>
            )}

          {tracks.length === 0 &&
          (selectedPlaylist.isDownloadsPlaylist ||
            selectedPlaylist.id === 'pl-internal-downloads') ? (
            <div className="mx-4 md:mx-7 mb-8 rounded-xl border border-emerald-500/30 bg-[#141418] p-8 text-center">
              <HardDriveDownload className="w-8 h-8 text-emerald-400 mx-auto" aria-hidden="true" />
              <p className="mt-3 text-sm font-semibold text-[#F4F4F5]">
                Your internal offline sandbox is currently empty
              </p>
              <p className="mt-1 text-xs text-[#A1A1AA] max-w-lg mx-auto">
                Downloaded tracks are fetched from <code className="text-emerald-300">/api/stream</code> and written strictly inside <code className="text-emerald-300">@capacitor/filesystem</code> (<code className="text-emerald-300">Directory.Data/tracks/[videoId].mp3</code>) and indexed in <code className="text-emerald-300">downloaded_tracks</code>—never exposed to external OS folders.
              </p>
              {initialTracks.length > 0 && (
                <button
                  type="button"
                  disabled={Boolean(
                    downloadingIds[initialTracks[0].videoId || initialTracks[0].id]
                  )}
                  onClick={() => void downloadTrackOffline(initialTracks[0])}
                  className="mt-4 inline-flex items-center gap-2 rounded-full crate-cta px-4 py-2 text-xs font-bold cursor-pointer disabled:opacity-50"
                >
                  <HardDriveDownload className="w-3.5 h-3.5" aria-hidden="true" />
                  <span>
                    Download &ldquo;{initialTracks[0].title}&rdquo; to Sandbox
                  </span>
                </button>
              )}
            </div>
          ) : tracks.length === 0 &&
          (selectedPlaylist.isAutoTopTracks ||
            selectedPlaylist.id === 'pl-weekly-top-tracks' ||
            selectedPlaylist.id === 'pl-monthly-top-tracks') ? (
            <div className="mx-4 md:mx-7 mb-8 rounded-xl border border-[#2A2A32] bg-[#141418] p-8 text-center">
              <Disc3 className="w-8 h-8 text-[#E8A849] mx-auto" aria-hidden="true" />
              <p className="mt-3 text-sm font-semibold text-[#F4F4F5]">
                No 30s+ completed plays in this window yet
              </p>
              <p className="mt-1 text-xs text-[#A1A1AA] max-w-md mx-auto">
                Listen to any song for at least 30 seconds and Crate will automatically rank it here, or restore sample history below.
              </p>
              <button
                type="button"
                disabled={historyActionBusy}
                onClick={() => void handleRestoreSamplePlayHistory()}
                className="mt-4 inline-flex items-center gap-2 rounded-full crate-cta px-4 py-2 text-xs font-bold cursor-pointer"
              >
                <RotateCcw className="w-3.5 h-3.5" aria-hidden="true" />
                <span>Restore Sample History</span>
              </button>
            </div>
          ) : tracks.length === 0 ? (
            <div className="mx-4 md:mx-7 mb-8 rounded-xl border border-[#2A2A32] bg-[#141418] p-8 text-center">
              <Disc3 className="w-8 h-8 text-[#E8A849] mx-auto" aria-hidden="true" />
              <p className="mt-3 text-sm font-semibold text-[#F4F4F5]">
                All songs have been removed from {selectedPlaylist.name}
              </p>
              <p className="mt-1 text-xs text-[#A1A1AA] max-w-md mx-auto">
                You can delete this playlist or return to Home to browse other playlists.
              </p>
              {onDeletePlaylist && (
                <button
                  type="button"
                  onClick={() => onDeletePlaylist(selectedPlaylist.id)}
                  className="mt-4 inline-flex items-center gap-2 rounded-full border border-red-500/40 bg-red-500/15 hover:bg-red-500/25 px-4 py-2 text-xs font-bold text-red-200 cursor-pointer"
                >
                  <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
                  <span>Delete Playlist</span>
                </button>
              )}
            </div>
          ) : (
            renderTrackTable(tracks, undefined, undefined, undefined, {
              playlistId: selectedPlaylist.id,
              playlistName: selectedPlaylist.name,
            })
          )}
        </div>
      ) : (
        /* 3. SPOTIFY HOME SCREEN */
        <div className="pt-5">
          {/* Interactive Spotify Filter Chips */}
          <div className="px-4 md:px-6 flex items-center justify-between gap-4 mb-5">
            <div className="flex items-center gap-2" role="tablist" aria-label="Home filters">
              {(
                [
                  { id: 'all', label: 'All' },
                  { id: 'music', label: 'Music' },
                  { id: 'crates', label: 'Playlists' },
                ] as Array<{ id: HomeFilter; label: string }>
              ).map((tab) => {
                const active = homeFilter === tab.id;
                return (
                  <button
                    key={tab.id}
                    type="button"
                    role="tab"
                    aria-selected={active}
                    onClick={() => setHomeFilter(tab.id)}
                    className={`rounded-full px-3.5 py-1.5 text-xs font-semibold transition-colors cursor-pointer ${
                      active
                        ? 'bg-[#E8A849] text-[#09090B]'
                        : 'bg-[#1C1C21] text-[#E4E4E7] hover:bg-[#27272F]'
                    }`}
                  >
                    {tab.label}
                  </button>
                );
              })}
            </div>

            {initialTracks.length > 0 && (
              <button
                type="button"
                onClick={() => setQueueAndPlay(initialTracks, 0)}
                className="inline-flex items-center gap-1.5 rounded-full crate-cta px-4 py-1.5 text-xs font-bold shadow-[0_4px_18px_rgba(232,168,73,0.24)] hover:scale-[1.02] transition-transform cursor-pointer whitespace-nowrap"
              >
                <Play className="w-3.5 h-3.5 fill-current" aria-hidden="true" />
                <span>Play All ({initialTracks.length})</span>
              </button>
            )}
          </div>

          {/* Quick Picks 2-Row Compact Horizontal Grid (Spotify Top Shelf) */}
          {homeFilter !== 'music' && (
            <section className="px-4 md:px-6 mb-7">
              <div className="grid grid-cols-2 lg:grid-cols-3 gap-2.5">
                {/* Picked For You Shortcut Tile */}
                <div className="group relative flex items-center rounded-md bg-[#18181D] hover:bg-[#24242B] border border-white/[0.04] overflow-hidden transition-colors">
                  <button
                    type="button"
                    onClick={() => setHomeFilter('music')}
                    className="flex-1 min-w-0 flex items-center gap-2.5 sm:gap-3 text-left pr-2.5 md:pr-12 cursor-pointer"
                  >
                    <div className="w-14 h-14 bg-gradient-to-br from-[#8A501E] via-[#C87D32] to-[#E8A849] flex items-center justify-center shrink-0">
                      <Heart className="w-6 h-6 text-[#09090B] fill-current" aria-hidden="true" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-bold text-[#F4F4F5] truncate">
                        Picked for {firstName}
                      </p>
                      <p className="text-[11px] text-[#A1A1AA] truncate">
                        AI Mix · {initialTracks.length} songs
                      </p>
                    </div>
                  </button>
                  {initialTracks.length > 0 && (
                    <button
                      type="button"
                      onClick={() => setQueueAndPlay(initialTracks, 0)}
                      aria-label={`Play Picked for ${firstName}`}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 w-9 h-9 rounded-full crate-cta flex items-center justify-center shadow-lg opacity-0 group-hover:opacity-100 focus-visible:opacity-100 transition-opacity cursor-pointer"
                    >
                      <Play className="w-4 h-4 fill-current ml-0.5" aria-hidden="true" />
                    </button>
                  )}
                </div>

                {/* Top 4 Playlists as Spotify Quick Tiles with Playlist Icons */}
                {playlists.slice(0, 4).map((pl) => (
                  <div
                    key={`quick-${pl.id}`}
                    className="group relative flex items-center rounded-md bg-[#18181D] hover:bg-[#24242B] border border-white/[0.04] overflow-hidden transition-colors"
                  >
                    <button
                      type="button"
                      onClick={() => onSelectPlaylist(pl)}
                      className="flex-1 min-w-0 flex items-center gap-2.5 sm:gap-3 text-left pr-2.5 md:pr-12 cursor-pointer"
                    >
                      <PlaylistArtwork playlist={pl} size="md" showBadge />
                      <div className="min-w-0">
                        <p className="text-sm font-bold text-[#F4F4F5] truncate">
                          {pl.name}
                        </p>
                        <p className="text-[11px] text-[#A1A1AA] truncate tabular-nums">
                          {pl.tracks.length} {pl.tracks.length === 1 ? 'song' : 'songs'}
                        </p>
                      </div>
                    </button>
                    {pl.tracks.length > 0 && (
                      <button
                        type="button"
                        onClick={() => setQueueAndPlay(pl.tracks, 0)}
                        aria-label={`Play ${pl.name}`}
                        className="absolute right-2.5 top-1/2 -translate-y-1/2 w-9 h-9 rounded-full crate-cta flex items-center justify-center shadow-lg opacity-0 group-hover:opacity-100 focus-visible:opacity-100 transition-opacity cursor-pointer"
                      >
                        <Play className="w-4 h-4 fill-current ml-0.5" aria-hidden="true" />
                      </button>
                    )}
                  </div>
                ))}

                {/* 6th Balanced Tile: Crate Blend Mixer */}
                <div className="group relative flex items-center rounded-md bg-[#18181D] hover:bg-[#24242B] border border-white/[0.04] overflow-hidden transition-colors">
                  <button
                    type="button"
                    onClick={() => navigate('/blend')}
                    className="flex-1 min-w-0 flex items-center gap-3 text-left pr-3 cursor-pointer"
                  >
                    <div className="relative w-14 h-14 bg-gradient-to-br from-[#27272E] via-[#4A3520] to-[#C87D32] flex items-center justify-center shrink-0">
                      <Shuffle className="w-6 h-6 text-[#F4F4F5]" aria-hidden="true" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-bold text-[#F4F4F5] truncate">
                        Crate Blend
                      </p>
                      <p className="text-[11px] text-[#A1A1AA] truncate">
                        Mix two playlists
                      </p>
                    </div>
                  </button>
                </div>
              </div>
            </section>
          )}

          {/* Spotify Card Shelf: Made For You & Curated Playlists */}
          {homeFilter !== 'music' &&
            playlists.length > 0 &&
            renderPlaylistGrid(playlists, 'Made For You & Playlists')}

          {/* Spotify Track Table: AI Personal Watch & Queue Suggestions */}
          {homeFilter !== 'crates' &&
            renderTrackTable(
              sliceVisibleTracks(initialTracks, 5).visible,
              `Picked for ${firstName}`,
              'AI watches what songs you personally play & suggests matching songs to your queue · Use ••• to Play Next or Add to Queue',
              initialTracks.length > 0
                ? {
                    onShowMore: handleContinueRecommendationsInSearch,
                    label: 'Show more',
                    sublabel:
                      initialTracks.length > 5
                        ? `${initialTracks.length - 5}+ more songs available · Continues more recommendations in Search`
                        : 'Continues more recommendations in Search',
                    loading: loadingMore,
                    fullPlayList: initialTracks,
                  }
                : undefined
            )}
        </div>
      )}
    </div>
  );
};
