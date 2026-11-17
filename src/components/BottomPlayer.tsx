import React from 'react';
import {
  CheckCircle2,
  HardDriveDownload,
  ListMusic,
  Pause,
  Play,
  SkipBack,
  SkipForward,
  Volume2,
  VolumeX,
} from 'lucide-react';
import { usePlayer } from '../context/PlayerContext';
import { clampProgress, formatDuration } from '../lib/audioMath';
import { CrateLogo } from './CrateLogo';

interface BottomPlayerProps {
  onToggleQueue: () => void;
  queueOpen: boolean;
}

export const BottomPlayer: React.FC<BottomPlayerProps> = ({
  onToggleQueue,
  queueOpen,
}) => {
  const {
    currentTrack,
    isPlaying,
    currentTime,
    duration,
    volume,
    queueNotice,
    isPlayingFromOfflineSandbox,
    activeSandboxUri,
    isTrackDownloaded,
    downloadingIds,
    downloadTrackOffline,
    removeDownloadedTrack,
    togglePlayPause,
    playNext,
    playPrev,
    seekTo,
    setVolume,
  } = usePlayer();

  const progressPct = clampProgress(currentTime, duration);
  const activeVid = currentTrack ? currentTrack.videoId || currentTrack.id : '';
  const activeTrackDownloaded = activeVid ? isTrackDownloaded(activeVid) : false;
  const activeTrackDownloading = activeVid ? Boolean(downloadingIds[activeVid]) : false;

  return (
    <footer
      aria-label="Audio player bar"
      className="fixed bottom-14 left-2 right-2 rounded-lg bg-[#18181D] border border-[#2A2A32] md:static md:rounded-none md:border-0 md:bg-[#09090B] z-40 h-[60px] md:h-[76px] px-3 md:px-4 flex items-center justify-between gap-3 md:gap-4 shrink-0 shadow-lg md:shadow-none"
    >
      {queueNotice && (
        <div
          role="status"
          aria-live="polite"
          className="fixed bottom-28 md:bottom-22 left-1/2 -translate-x-1/2 z-50 rounded-xl border border-[#E8A849]/45 bg-[#141418] px-4 py-2 text-xs font-semibold text-[#F4F4F5] shadow-[0_12px_36px_rgba(0,0,0,0.85)] flex items-center gap-2"
        >
          <span className="w-2 h-2 rounded-full bg-[#E8A849]" aria-hidden="true" />
          <span>{queueNotice}</span>
        </div>
      )}

      {/* Mobile subtle top progress indicator */}
      <div className="md:hidden absolute bottom-0 left-2 right-2 h-[2px] rounded-full bg-[#2A2A32] overflow-hidden">
        <div
          className="h-full bg-[#E8A849]"
          style={{ width: `${progressPct}%` }}
        />
      </div>

      {/* Left: Track Artwork + Title & Artist + Smart Audio Interceptor Offline Sandbox Badge */}
      <div className="flex items-center gap-3 min-w-0 flex-1 md:flex-none md:w-[32%]">
        {currentTrack ? (
          <>
            <img
              src={currentTrack.artworkUrl}
              alt={`${currentTrack.title} album art`}
              referrerPolicy="no-referrer"
              className="w-10 h-10 md:w-14 md:h-14 rounded-md object-cover border border-[#2A2A32] shrink-0"
            />
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 min-w-0">
                <p className="text-sm font-medium text-[#F4F4F5] truncate">
                  {currentTrack.title}
                </p>
                {isPlayingFromOfflineSandbox && (
                  <span
                    title={`Playing from internal sandbox: ${activeSandboxUri || 'Directory.Data'}`}
                    className="hidden sm:inline-flex items-center gap-1 rounded bg-emerald-500/15 border border-emerald-500/40 px-1.5 py-0.5 text-[10px] font-mono font-bold uppercase tracking-wider text-emerald-300 shrink-0"
                  >
                    <CheckCircle2 className="w-2.5 h-2.5" aria-hidden="true" />
                    <span>Offline Sandbox</span>
                  </span>
                )}
              </div>
              <p className="text-xs text-[#A1A1AA] truncate">
                {currentTrack.artist}
              </p>
            </div>
            <button
              type="button"
              disabled={activeTrackDownloading}
              onClick={() => {
                if (activeTrackDownloaded) {
                  void removeDownloadedTrack(activeVid);
                } else {
                  void downloadTrackOffline(currentTrack);
                }
              }}
              aria-label={
                activeTrackDownloaded
                  ? `Remove ${currentTrack.title} from offline sandbox`
                  : `Download ${currentTrack.title} to offline sandbox`
              }
              title={
                activeTrackDownloaded
                  ? 'Stored in internal sandbox (Click to remove)'
                  : 'Download to internal app sandbox (Directory.Data)'
              }
              className={`hidden sm:inline-flex w-8 h-8 rounded-full items-center justify-center transition-colors cursor-pointer shrink-0 ${
                activeTrackDownloaded
                  ? 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/40 hover:bg-red-500/20 hover:text-red-200'
                  : 'text-[#A1A1AA] hover:text-[#E8A849] hover:bg-[#24242B]'
              }`}
            >
              {activeTrackDownloaded ? (
                <CheckCircle2 className="w-4 h-4" aria-hidden="true" />
              ) : (
                <HardDriveDownload
                  className={`w-4 h-4 ${activeTrackDownloading ? 'animate-pulse text-[#E8A849]' : ''}`}
                  aria-hidden="true"
                />
              )}
            </button>
          </>
        ) : (
          <div className="flex items-center gap-3 min-w-0">
            <CrateLogo size="lg" shape="rounded" />
            <div className="min-w-0">
              <p className="text-sm font-medium text-[#E4E4E7] truncate">No track selected</p>
              <p className="text-xs text-[#71717A] truncate">Pick any song to start</p>
            </div>
          </div>
        )}
      </div>

      {/* Center: Spotify Transport + Timeline */}
      <div className="flex flex-col items-center justify-center md:flex-1 max-w-xl">
        <div className="flex items-center gap-2 md:gap-5">
          <button
            type="button"
            onClick={playPrev}
            disabled={!currentTrack}
            aria-label="Previous track"
            className="hidden sm:inline-flex p-1.5 text-[#A1A1AA] hover:text-[#F4F4F5] disabled:opacity-35 transition-colors cursor-pointer"
          >
            <SkipBack className="w-4 h-4 fill-current" aria-hidden="true" />
          </button>

          <button
            type="button"
            onClick={togglePlayPause}
            disabled={!currentTrack}
            aria-label={isPlaying ? 'Pause playback' : 'Play playback'}
            className="w-9 h-9 rounded-full bg-[#F4F4F5] text-[#09090B] hover:bg-[#E8A849] hover:scale-105 flex items-center justify-center disabled:opacity-35 transition-all cursor-pointer shrink-0"
          >
            {isPlaying ? (
              <Pause className="w-4 h-4 fill-current" aria-hidden="true" />
            ) : (
              <Play className="w-4 h-4 fill-current ml-0.5" aria-hidden="true" />
            )}
          </button>

          <button
            type="button"
            onClick={playNext}
            disabled={!currentTrack}
            aria-label="Next track"
            className="p-1.5 text-[#A1A1AA] hover:text-[#F4F4F5] disabled:opacity-35 transition-colors cursor-pointer"
          >
            <SkipForward className="w-4 h-4 fill-current" aria-hidden="true" />
          </button>
        </div>

        {/* Desktop Seek Bar */}
        <div className="hidden md:flex items-center gap-2 w-full mt-1.5 group">
          <span className="text-[11px] font-mono text-[#71717A] tabular-nums w-9 text-right">
            {formatDuration(currentTime)}
          </span>
          <div className="relative flex-1 flex items-center h-4">
            <div className="w-full h-1 rounded-full bg-[#2A2A32] overflow-hidden">
              <div
                className="h-full bg-[#F4F4F5] group-hover:bg-[#E8A849] transition-colors"
                style={{ width: `${progressPct}%` }}
              />
            </div>
            <input
              type="range"
              aria-label="Seek track progress"
              min={0}
              max={duration || 100}
              step={0.5}
              value={Math.min(currentTime, duration || 100)}
              disabled={!currentTrack}
              onChange={(e) => seekTo(Number(e.target.value))}
              className="crate-slider absolute inset-0 w-full opacity-0 hover:opacity-100 focus:opacity-100"
            />
          </div>
          <span className="text-[11px] font-mono text-[#71717A] tabular-nums w-9">
            {formatDuration(duration)}
          </span>
        </div>
      </div>

      {/* Right: Queue & Volume */}
      <div className="hidden sm:flex items-center justify-end gap-2.5 md:w-[30%]">
        <button
          type="button"
          onClick={onToggleQueue}
          aria-expanded={queueOpen}
          aria-label="Toggle playback queue"
          className={`relative p-2 rounded-md transition-colors cursor-pointer ${
            queueOpen
              ? 'text-[#E8A849]'
              : 'text-[#A1A1AA] hover:text-[#F4F4F5]'
          }`}
        >
          <ListMusic className="w-4 h-4" aria-hidden="true" />
        </button>

        <div className="hidden md:flex items-center gap-2 w-28 group">
          <button
            type="button"
            onClick={() => setVolume(volume > 0 ? 0 : 0.88)}
            aria-label={volume === 0 ? 'Unmute audio' : 'Mute audio'}
            className="text-[#A1A1AA] hover:text-[#F4F4F5] transition-colors cursor-pointer"
          >
            {volume === 0 ? (
              <VolumeX className="w-4 h-4" aria-hidden="true" />
            ) : (
              <Volume2 className="w-4 h-4" aria-hidden="true" />
            )}
          </button>
          <div className="relative flex-1 flex items-center h-4">
            <div className="w-full h-1 rounded-full bg-[#2A2A32] overflow-hidden">
              <div
                className="h-full bg-[#F4F4F5] group-hover:bg-[#E8A849] transition-colors"
                style={{ width: `${Math.round(volume * 100)}%` }}
              />
            </div>
            <input
              type="range"
              aria-label="Volume"
              min={0}
              max={1}
              step={0.02}
              value={volume}
              onChange={(e) => setVolume(Number(e.target.value))}
              className="crate-slider absolute inset-0 w-full opacity-0 hover:opacity-100 focus:opacity-100"
            />
          </div>
        </div>
      </div>
    </footer>
  );
};
