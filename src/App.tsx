import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { AuthProvider, useAuth } from './context/AuthContext';
import { PlayerProvider, usePlayer } from './context/PlayerContext';
import { LoginView } from './components/LoginView';
import { OnboardingView } from './components/OnboardingView';
import { AccessDeniedView } from './components/AccessDeniedView';
import { OwnerPortalView } from './components/OwnerPortalView';
import { TopBar } from './components/TopBar';
import { Sidebar } from './components/Sidebar';
import { DiscoverView } from './components/DiscoverView';
import { BlendView } from './components/BlendView';
import { ListenTogetherView } from './components/ListenTogetherView';
import { BottomPlayer } from './components/BottomPlayer';
import { QueueDrawer } from './components/QueueDrawer';
import { MobileNav } from './components/MobileNav';
import { SpotifyImportModal } from './components/SpotifyImportModal';
import { apiFetch } from './lib/apiClient';
import {
  buildDownloadsPlaylist,
  deletePlaylistFromList,
  DOWNLOADS_PLAYLIST_ID,
  getPreferencesSignature,
  removeTrackFromPlaylist,
  removeTrackFromPlaylistInCatalog,
} from './lib/audioMath';
import type { Playlist, Track } from './types/crate';

const CrateWorkspace: React.FC = () => {
  const { profile, loading, currentRoute, navigate } = useAuth();
  const {
    playHistoryVersion,
    downloadedTracks,
    removeDownloadedTrack,
    clearAllDownloads,
  } = usePlayer();
  const [playlists, setPlaylists] = useState<Playlist[]>([]);
  const [initialTracks, setInitialTracks] = useState<Track[]>([]);
  const [selectedPlaylist, setSelectedPlaylist] = useState<Playlist | null>(null);
  const [queueOpen, setQueueOpen] = useState(false);
  const [spotifyModalOpen, setSpotifyModalOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchActive, setSearchActive] = useState(false);
  const [searchTrigger, setSearchTrigger] = useState(0);

  const prefsSig = getPreferencesSignature(profile?.preferences);

  const downloadsPlaylist = useMemo(
    () => buildDownloadsPlaylist(downloadedTracks),
    [downloadedTracks]
  );

  const combinedPlaylists = useMemo(() => {
    const rest = playlists.filter((p) => p.id !== DOWNLOADS_PLAYLIST_ID && !p.isDownloadsPlaylist);
    return [downloadsPlaylist, ...rest];
  }, [downloadsPlaylist, playlists]);

  // Keep selectedPlaylist in sync if the user is viewing Downloads and downloads/removes a song
  useEffect(() => {
    setSelectedPlaylist((prev) => {
      if (!prev) return null;
      if (prev.id === DOWNLOADS_PLAYLIST_ID || prev.isDownloadsPlaylist) {
        return downloadsPlaylist;
      }
      return prev;
    });
  }, [downloadsPlaylist]);

  const handlePlaylistsUpdated = useCallback((nextPlaylists: Playlist[]) => {
    setPlaylists(nextPlaylists);
    setSelectedPlaylist((prev) => {
      if (!prev || prev.id === DOWNLOADS_PLAYLIST_ID || prev.isDownloadsPlaylist) return prev;
      return nextPlaylists.find((p) => p.id === prev.id) || null;
    });
  }, []);

  const handleDeletePlaylist = useCallback(
    async (playlistId: string) => {
      const targetId = String(playlistId || '').trim();
      if (!targetId) return;
      if (targetId === DOWNLOADS_PLAYLIST_ID) {
        await clearAllDownloads();
        return;
      }
      setPlaylists((prev) => deletePlaylistFromList(prev, targetId));
      setSelectedPlaylist((prev) => (prev?.id === targetId ? null : prev));
      try {
        const res = await apiFetch(`/api/playlists/${encodeURIComponent(targetId)}`, {
          method: 'DELETE',
        });
        if (res.ok) {
          const data = (await res.json()) as { playlists?: Playlist[] };
          if (Array.isArray(data.playlists)) {
            handlePlaylistsUpdated(data.playlists);
          }
        }
      } catch {
        // Optimistic update already applied
      }
    },
    [clearAllDownloads, handlePlaylistsUpdated]
  );

  const handleRemoveTrackFromPlaylist = useCallback(
    async (playlistId: string, trackVideoId: string) => {
      const targetPlId = String(playlistId || '').trim();
      const targetVid = String(trackVideoId || '').trim();
      if (!targetPlId || !targetVid) return;

      if (targetPlId === DOWNLOADS_PLAYLIST_ID) {
        await removeDownloadedTrack(targetVid);
        return;
      }

      setPlaylists((prev) => removeTrackFromPlaylistInCatalog(prev, targetPlId, targetVid));
      setSelectedPlaylist((prev) =>
        prev && prev.id === targetPlId ? removeTrackFromPlaylist(prev, targetVid) : prev
      );

      try {
        const res = await apiFetch(
          `/api/playlists/${encodeURIComponent(targetPlId)}/tracks/${encodeURIComponent(targetVid)}`,
          { method: 'DELETE' }
        );
        if (res.ok) {
          const data = (await res.json()) as { playlists?: Playlist[] };
          if (Array.isArray(data.playlists)) {
            handlePlaylistsUpdated(data.playlists);
          }
        }
      } catch {
        // Optimistic update already applied
      }
    },
    [handlePlaylistsUpdated, removeDownloadedTrack]
  );

  useEffect(() => {
    if (!profile?.is_approved) return;
    let active = true;
    Promise.all([
      apiFetch('/api/playlists').then((res) => res.json()),
      apiFetch('/api/recommendations').then((res) => res.json()),
    ])
      .then(
        ([plData, recData]: [
          { playlists?: Playlist[]; tracks?: Track[] },
          { tracks?: Track[] },
        ]) => {
          if (!active) return;
          const nextPlaylists = plData.playlists || [];
          handlePlaylistsUpdated(nextPlaylists);
          if (Array.isArray(recData.tracks) && recData.tracks.length > 0) {
            setInitialTracks(recData.tracks);
          } else if (Array.isArray(plData.tracks) && plData.tracks.length > 0) {
            setInitialTracks(plData.tracks);
          }
        }
      )
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [handlePlaylistsUpdated, profile?.id, profile?.is_approved, prefsSig]);

  // Refresh dynamic Weekly & Monthly Top Tracks whenever a 30s song play is logged
  useEffect(() => {
    if (!profile?.is_approved || playHistoryVersion === 0) return;
    let active = true;
    apiFetch('/api/playlists')
      .then((res) => (res.ok ? res.json() : null))
      .then((plData: { playlists?: Playlist[] } | null) => {
        if (!active || !plData?.playlists) return;
        handlePlaylistsUpdated(plData.playlists);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [handlePlaylistsUpdated, playHistoryVersion, profile?.is_approved]);

  useEffect(() => {
    if (window.innerWidth < 1024) {
      setQueueOpen(false);
    }
  }, [currentRoute]);

  if (loading) {
    return (
      <div className="min-h-screen crate-canvas flex items-center justify-center">
        <div className="flex items-center gap-3 text-sm text-[#E8A849]">
          <div className="w-5 h-5 rounded-full border-2 border-[#E8A849] border-t-[#2A2A32] animate-spin" />
          <span>Loading Crate...</span>
        </div>
      </div>
    );
  }

  // Independent Owner Management Portal at /owner (ID + Password + Microsoft Authenticator TOTP)
  if (currentRoute === '/owner') {
    return <OwnerPortalView />;
  }

  // Gatekeeper Views
  if (currentRoute === '/login' || !profile) {
    return <LoginView />;
  }
  if (currentRoute === '/onboarding' || !profile.full_name.trim()) {
    return <OnboardingView />;
  }
  if (currentRoute === '/access-denied' || !profile.is_approved) {
    return <AccessDeniedView />;
  }

  const handlePlaylistImported = (imported: Playlist) => {
    setPlaylists((prev) => {
      const rest = prev.filter((p) => p.id !== imported.id);
      return [imported, ...rest];
    });
    setSearchQuery('');
    setSearchActive(false);
    setSearchTrigger(0);
    setSelectedPlaylist(imported);
    if (currentRoute !== '/') {
      navigate('/');
    }
  };

  const handleOpenSearch = () => {
    setSelectedPlaylist(null);
    setSearchActive(true);
    if (currentRoute !== '/') {
      navigate('/');
    }
    setSearchTrigger((n) => n + 1);
  };

  const handleSearchChange = (q: string) => {
    setSearchQuery(q);
    if (q.trim()) {
      setSearchActive(true);
      setSelectedPlaylist(null);
    }
  };

  const handleSubmitSearch = (q: string) => {
    setSearchQuery(q);
    setSearchActive(true);
    setSelectedPlaylist(null);
    if (currentRoute !== '/') {
      navigate('/');
    }
    setSearchTrigger((n) => n + 1);
  };

  const handleClearSearch = () => {
    setSearchQuery('');
    setSearchActive(false);
    setSearchTrigger(0);
  };

  const handleGoHome = () => {
    setSearchQuery('');
    setSearchActive(false);
    setSearchTrigger(0);
    setSelectedPlaylist(null);
    if (currentRoute !== '/') {
      navigate('/');
    }
  };

  return (
    <div className="h-screen w-screen overflow-hidden flex flex-col bg-[#09090B] text-[#F4F4F5]">
      {/* Spotify Global Top Bar */}
      <TopBar
        searchQuery={searchQuery}
        searchActive={searchActive}
        onSearchChange={handleSearchChange}
        onSubmitSearch={handleSubmitSearch}
        onOpenSearch={handleOpenSearch}
        onGoHome={handleGoHome}
        onOpenSpotifyImport={() => setSpotifyModalOpen(true)}
      />

      {/* Spotify 3-Column Bento Workspace */}
      <div className="flex-1 min-h-0 flex gap-2 px-0 md:px-2 overflow-hidden">
        <Sidebar
          playlists={combinedPlaylists}
          selectedPlaylistId={selectedPlaylist?.id || null}
          onSelectPlaylist={(pl) => {
            setSearchActive(false);
            setSelectedPlaylist(pl);
          }}
          onDeletePlaylist={handleDeletePlaylist}
          onClearSearch={handleClearSearch}
          onOpenSpotifyImport={() => setSpotifyModalOpen(true)}
        />

        <main className="flex-1 flex flex-col min-w-0 h-full overflow-hidden">
          {currentRoute === '/blend' ? (
            <BlendView playlists={combinedPlaylists} />
          ) : currentRoute === '/listen-together' ? (
            <ListenTogetherView />
          ) : (
            <DiscoverView
              playlists={combinedPlaylists}
              initialTracks={initialTracks}
              selectedPlaylist={selectedPlaylist}
              onSelectPlaylist={(pl) => {
                if (pl) setSearchActive(false);
                setSelectedPlaylist(pl);
              }}
              onPlaylistsUpdated={handlePlaylistsUpdated}
              onDeletePlaylist={handleDeletePlaylist}
              onRemoveTrackFromPlaylist={handleRemoveTrackFromPlaylist}
              searchQuery={searchQuery}
              searchActive={searchActive}
              searchTrigger={searchTrigger}
              onQuickSearch={handleSubmitSearch}
              onClearSearch={handleClearSearch}
            />
          )}
        </main>

        <QueueDrawer open={queueOpen} onClose={() => setQueueOpen(false)} />
      </div>

      <BottomPlayer
        queueOpen={queueOpen}
        onToggleQueue={() => setQueueOpen((v) => !v)}
      />
      <MobileNav
        searchActive={searchActive}
        onOpenSearch={handleOpenSearch}
        onGoHome={handleGoHome}
      />

      <SpotifyImportModal
        open={spotifyModalOpen}
        onClose={() => setSpotifyModalOpen(false)}
        onImported={handlePlaylistImported}
      />
    </div>
  );
};

export default function App() {
  return (
    <AuthProvider>
      <PlayerProvider>
        <CrateWorkspace />
      </PlayerProvider>
    </AuthProvider>
  );
}
