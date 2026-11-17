import React, { useState } from 'react';
import {
  HardDriveDownload,
  Home,
  Library,
  Play,
  Plus,
  Radio,
  Shield,
  Shuffle,
  Trash2,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { usePlayer } from '../context/PlayerContext';
import { DOWNLOADS_PLAYLIST_ID } from '../lib/audioMath';
import type { AppRoute, Playlist } from '../types/crate';
import { PlaylistArtwork, getPlaylistIconMeta } from './PlaylistArtwork';
import { PWAInstallButton } from './PWAInstallButton';

interface SidebarProps {
  playlists: Playlist[];
  selectedPlaylistId?: string | null;
  onSelectPlaylist: (playlist: Playlist | null) => void;
  onDeletePlaylist?: (playlistId: string) => void;
  onClearSearch: () => void;
  onOpenSpotifyImport: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({
  playlists,
  selectedPlaylistId,
  onSelectPlaylist,
  onDeletePlaylist,
  onClearSearch,
  onOpenSpotifyImport,
}) => {
  const { profile, currentRoute, navigate } = useAuth();
  const { roomConnected, roomState, setQueueAndPlay, downloadedTracks } = usePlayer();
  const [libraryFilter, setLibraryFilter] = useState<'all' | 'downloads'>('all');

  const downloadsPlaylist = playlists.find(
    (p) => p.id === DOWNLOADS_PLAYLIST_ID || p.isDownloadsPlaylist
  );
  const visiblePlaylists =
    libraryFilter === 'downloads'
      ? playlists.filter((p) => p.id === DOWNLOADS_PLAYLIST_ID || p.isDownloadsPlaylist)
      : playlists;

  const navItems: Array<{
    route: AppRoute;
    label: string;
    icon: React.ReactNode;
  }> = [
    {
      route: '/',
      label: 'Discover',
      icon: <Home className="w-5 h-5" aria-hidden="true" />,
    },
    {
      route: '/blend',
      label: 'Blend',
      icon: <Shuffle className="w-5 h-5" aria-hidden="true" />,
    },
    {
      route: '/listen-together',
      label: 'Listen Together',
      icon: <Radio className="w-5 h-5" aria-hidden="true" />,
    },
  ];

  return (
    <aside className="hidden md:flex md:flex-col w-[272px] shrink-0 gap-2 h-full select-none">
      {/* Spotify-style Navigation Bento */}
      <nav
        aria-label="Primary navigation"
        className="rounded-lg spotify-panel px-2.5 py-2.5 space-y-0.5"
      >
        {navItems.map((item) => {
          const active = currentRoute === item.route && !selectedPlaylistId;
          return (
            <button
              key={item.route}
              type="button"
              onClick={() => {
                if (item.route === '/') {
                  onClearSearch();
                  onSelectPlaylist(null);
                  setLibraryFilter('all');
                }
                navigate(item.route);
              }}
              className={`w-full flex items-center justify-between rounded-md px-3 py-2.5 text-sm font-semibold transition-colors whitespace-nowrap cursor-pointer ${
                active
                  ? 'bg-[#24242B] text-[#F4F4F5]'
                  : 'text-[#A1A1AA] hover:text-[#F4F4F5] hover:bg-[#1C1C21]'
              }`}
            >
              <span className="flex items-center gap-3.5">
                <span className={active ? 'text-[#E8A849]' : 'text-[#A1A1AA]'}>
                  {item.icon}
                </span>
                <span>{item.label}</span>
              </span>
              {item.route === '/listen-together' && roomConnected && roomState && (
                <span className="text-[11px] font-mono text-[#E8A849] tabular-nums">
                  {roomState.participants.length}
                </span>
              )}
            </button>
          );
        })}

        {profile?.is_admin && (
          <button
            type="button"
            onClick={() => navigate('/owner')}
            className={`w-full flex items-center gap-3.5 rounded-md px-3 py-2.5 text-sm font-semibold transition-colors whitespace-nowrap cursor-pointer ${
              currentRoute === '/owner'
                ? 'bg-[#24242B] text-[#F4F4F5]'
                : 'text-[#A1A1AA] hover:text-[#F4F4F5] hover:bg-[#1C1C21]'
            }`}
          >
            <Shield className="w-5 h-5 text-[#E8A849]" aria-hidden="true" />
            <span>Owner Admin</span>
          </button>
        )}
      </nav>

      {/* Spotify "Your Library" Bento Panel */}
      <div className="flex-1 min-h-0 flex flex-col rounded-lg spotify-panel overflow-hidden">
        <div className="px-4 pt-3.5 pb-2 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2.5 text-[#A1A1AA]">
            <Library className="w-5 h-5 text-[#E8A849]" aria-hidden="true" />
            <h2 className="text-sm font-bold text-[#F4F4F5] tracking-tight">
              Your Library
            </h2>
          </div>

          <button
            type="button"
            onClick={onOpenSpotifyImport}
            aria-label="Create or import playlist"
            title="Create or import playlist"
            className="w-8 h-8 rounded-full flex items-center justify-center text-[#A1A1AA] hover:text-[#E8A849] hover:bg-[#24242B] transition-colors cursor-pointer"
          >
            <Plus className="w-4 h-4" aria-hidden="true" />
          </button>
        </div>

        {/* Dedicated Library Filter: All | Downloads */}
        <div className="px-3 pb-2.5 flex items-center gap-1.5" role="group" aria-label="Library filters">
          <button
            type="button"
            onClick={() => setLibraryFilter('all')}
            className={`rounded-full px-3 py-1 text-xs font-semibold transition-colors cursor-pointer ${
              libraryFilter === 'all' && selectedPlaylistId !== DOWNLOADS_PLAYLIST_ID
                ? 'bg-[#E8A849] text-[#09090B]'
                : 'bg-[#1C1C21] text-[#A1A1AA] hover:text-[#F4F4F5]'
            }`}
          >
            All
          </button>
          <button
            type="button"
            onClick={() => {
              setLibraryFilter('downloads');
              onClearSearch();
              navigate('/');
              if (downloadsPlaylist) {
                onSelectPlaylist(downloadsPlaylist);
              }
            }}
            className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold transition-colors cursor-pointer ${
              libraryFilter === 'downloads' || selectedPlaylistId === DOWNLOADS_PLAYLIST_ID
                ? 'bg-[#E8A849] text-[#09090B]'
                : 'bg-[#1C1C21] text-[#A1A1AA] hover:text-[#F4F4F5]'
            }`}
          >
            <HardDriveDownload className="w-3.5 h-3.5" aria-hidden="true" />
            <span>Downloads ({downloadedTracks.length})</span>
          </button>
        </div>

        {/* Scrollable Playlist List with Playlist Icons */}
        <div className="flex-1 overflow-y-auto px-2 pb-2 space-y-0.5">
          {visiblePlaylists.map((pl) => {
            const isSelected = currentRoute === '/' && selectedPlaylistId === pl.id;
            const iconMeta = getPlaylistIconMeta(pl);
            const isDownloadsContainer =
              pl.id === DOWNLOADS_PLAYLIST_ID || Boolean(pl.isDownloadsPlaylist);
            return (
              <div
                key={pl.id}
                className={`group relative flex items-center gap-2 rounded-md p-1.5 transition-colors ${
                  isSelected
                    ? 'bg-[#24242B]'
                    : 'hover:bg-[#1C1C21]'
                }`}
              >
                <button
                  type="button"
                  onClick={() => {
                    onClearSearch();
                    navigate('/');
                    onSelectPlaylist(pl);
                  }}
                  className="flex-1 min-w-0 flex items-center gap-3 text-left cursor-pointer"
                >
                  <PlaylistArtwork
                    playlist={pl}
                    size="sm"
                    showBadge
                  />
                  <div className="min-w-0 flex-1 pr-7">
                    <p
                      className={`text-sm font-medium truncate transition-colors ${
                        isSelected
                          ? 'text-[#E8A849] font-semibold'
                          : 'text-[#F4F4F5] group-hover:text-white'
                      }`}
                    >
                      {pl.name}
                    </p>
                    <p className="text-xs text-[#71717A] truncate tabular-nums">
                      {iconMeta.label} · {pl.tracks.length} {pl.tracks.length === 1 ? 'song' : 'songs'}
                    </p>
                  </div>
                </button>

                {pl.tracks.length > 0 && (
                  <button
                    type="button"
                    onClick={() => {
                      onClearSearch();
                      navigate('/');
                      onSelectPlaylist(pl);
                      setQueueAndPlay(pl.tracks, 0);
                    }}
                    aria-label={`Play ${pl.name}`}
                    className="absolute left-3.5 top-1/2 -translate-y-1/2 w-8 h-8 rounded-full bg-[#09090B]/85 text-[#E8A849] border border-[#E8A849]/70 flex items-center justify-center opacity-0 group-hover:opacity-100 focus-visible:opacity-100 transition-opacity cursor-pointer"
                  >
                    <Play className="w-3.5 h-3.5 fill-current ml-0.5" aria-hidden="true" />
                  </button>
                )}

                {onDeletePlaylist && !isDownloadsContainer && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onDeletePlaylist(pl.id);
                    }}
                    aria-label={`Delete playlist ${pl.name}`}
                    title={`Delete playlist ${pl.name}`}
                    className="w-7 h-7 rounded-full flex items-center justify-center text-[#71717A] opacity-0 group-hover:opacity-100 focus-visible:opacity-100 hover:bg-red-500/20 hover:text-red-300 transition-all shrink-0 cursor-pointer"
                  >
                    <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
                  </button>
                )}
              </div>
            );
          })}
        </div>

        {/* Bottom PWA Install Strip */}
        <div className="p-2.5 border-t border-[#2A2A32] bg-[#0F0F12]">
          <PWAInstallButton />
        </div>
      </div>
    </aside>
  );
};
