import React, { useEffect, useRef, useState } from 'react';
import {
  CheckCircle2,
  CornerDownRight,
  HardDriveDownload,
  ListPlus,
  MoreHorizontal,
  Play,
  Sparkles,
  Trash2,
} from 'lucide-react';
import { usePlayer } from '../context/PlayerContext';
import type { Track } from '../types/crate';

interface TrackActionsMenuProps {
  track: Track;
  onQuickSearch?: (query: string) => void;
  onRemoveFromPlaylist?: () => void;
  playlistName?: string;
}

export const TrackActionsMenu: React.FC<TrackActionsMenuProps> = ({
  track,
  onQuickSearch,
  onRemoveFromPlaylist,
  playlistName,
}) => {
  const {
    playNextInQueue,
    addToQueue,
    playTrack,
    isTrackDownloaded,
    downloadingIds,
    downloadTrackOffline,
    removeDownloadedTrack,
  } = usePlayer();
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const vid = track.videoId || track.id;
  const downloaded = isTrackDownloaded(vid);
  const downloading = Boolean(downloadingIds[vid]);

  useEffect(() => {
    if (!open) return;

    const handlePointerDown = (event: MouseEvent) => {
      if (
        containerRef.current &&
        !containerRef.current.contains(event.target as Node)
      ) {
        setOpen(false);
      }
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpen(false);
      }
    };

    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [open]);

  return (
    <div ref={containerRef} className="relative inline-flex items-center">
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          setOpen((prev) => !prev);
        }}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`More options for ${track.title}`}
        title={`More options for ${track.title}`}
        className={`w-7 h-7 rounded-full inline-flex items-center justify-center transition-colors cursor-pointer ${
          open
            ? 'bg-[#E8A849] text-[#09090B]'
            : 'text-[#A1A1AA] hover:text-[#F4F4F5] hover:bg-[#24242B]'
        }`}
      >
        <MoreHorizontal className="w-4 h-4" aria-hidden="true" />
      </button>

      {open && (
        <div
          role="menu"
          aria-label={`Options for ${track.title}`}
          onClick={(e) => e.stopPropagation()}
          className="absolute right-0 top-8 z-50 w-56 rounded-xl border border-[#2A2A32] bg-[#141418] p-1.5 shadow-[0_16px_44px_rgba(0,0,0,0.88)]"
        >
          <div className="px-2.5 py-1.5 border-b border-[#2A2A32]/80 mb-1">
            <p className="text-xs font-semibold text-[#F4F4F5] truncate">{track.title}</p>
            <p className="text-[11px] text-[#A1A1AA] truncate">{track.artist}</p>
          </div>

          <button
            type="button"
            role="menuitem"
            onClick={() => {
              playNextInQueue(track);
              setOpen(false);
            }}
            className="w-full flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-xs font-medium text-[#F4F4F5] hover:bg-[#24242B] hover:text-[#E8A849] transition-colors cursor-pointer text-left"
          >
            <CornerDownRight className="w-3.5 h-3.5 text-[#E8A849] shrink-0" aria-hidden="true" />
            <span>Play Next</span>
          </button>

          <button
            type="button"
            role="menuitem"
            onClick={() => {
              addToQueue(track);
              setOpen(false);
            }}
            className="w-full flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-xs font-medium text-[#F4F4F5] hover:bg-[#24242B] hover:text-[#E8A849] transition-colors cursor-pointer text-left"
          >
            <ListPlus className="w-3.5 h-3.5 text-[#E8A849] shrink-0" aria-hidden="true" />
            <span>Add to Queue</span>
          </button>

          <button
            type="button"
            role="menuitem"
            onClick={() => {
              playTrack(track);
              setOpen(false);
            }}
            className="w-full flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-xs font-medium text-[#F4F4F5] hover:bg-[#24242B] hover:text-[#E8A849] transition-colors cursor-pointer text-left"
          >
            <Play className="w-3.5 h-3.5 text-[#E8A849] shrink-0" aria-hidden="true" />
            <span>Play Now (AI Auto-Queue)</span>
          </button>

          {downloaded ? (
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                void removeDownloadedTrack(vid);
                setOpen(false);
              }}
              className="w-full flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-xs font-medium text-emerald-300 hover:bg-red-500/15 hover:text-red-200 transition-colors cursor-pointer text-left"
            >
              <Trash2 className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
              <span>Remove from Offline Sandbox</span>
            </button>
          ) : (
            <button
              type="button"
              role="menuitem"
              disabled={downloading}
              onClick={() => {
                void downloadTrackOffline(track);
                setOpen(false);
              }}
              className="w-full flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-xs font-medium text-[#F4F4F5] hover:bg-[#24242B] hover:text-[#E8A849] transition-colors cursor-pointer text-left disabled:opacity-50"
            >
              {downloading ? (
                <CheckCircle2 className="w-3.5 h-3.5 text-[#E8A849] animate-pulse shrink-0" aria-hidden="true" />
              ) : (
                <HardDriveDownload className="w-3.5 h-3.5 text-[#E8A849] shrink-0" aria-hidden="true" />
              )}
              <span>{downloading ? 'Saving to Sandbox...' : 'Download (Offline Sandbox)'}</span>
            </button>
          )}

          {onRemoveFromPlaylist && (
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                onRemoveFromPlaylist();
                setOpen(false);
              }}
              className="w-full flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-xs font-medium text-red-300 hover:bg-red-500/15 hover:text-red-200 transition-colors cursor-pointer text-left"
            >
              <Trash2 className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
              <span className="truncate">
                {playlistName ? `Remove from ${playlistName}` : 'Remove from Playlist'}
              </span>
            </button>
          )}

          {onQuickSearch && (
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                onQuickSearch(track.artist);
                setOpen(false);
              }}
              className="w-full flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-xs font-medium text-[#A1A1AA] hover:bg-[#24242B] hover:text-[#F4F4F5] transition-colors cursor-pointer text-left"
            >
              <Sparkles className="w-3.5 h-3.5 text-[#E8A849] shrink-0" aria-hidden="true" />
              <span className="truncate">More by {track.artist}</span>
            </button>
          )}
        </div>
      )}
    </div>
  );
};
