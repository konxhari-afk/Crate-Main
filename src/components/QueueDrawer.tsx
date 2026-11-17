import React from 'react';
import { ListMusic, Play, Sparkles, Trash2, X } from 'lucide-react';
import { usePlayer } from '../context/PlayerContext';
import { formatDuration } from '../lib/audioMath';
import { TrackActionsMenu } from './TrackActionsMenu';

interface QueueDrawerProps {
  open: boolean;
  onClose: () => void;
}

export const QueueDrawer: React.FC<QueueDrawerProps> = ({ open, onClose }) => {
  const {
    queue,
    currentTrack,
    currentTrackIndex,
    aiQueueLoading,
    setQueueAndPlay,
    removeFromQueue,
    requestAiSuggestionForQueue,
  } = usePlayer();

  if (!open) return null;

  const upNext = queue
    .map((track, idx) => ({ track, idx }))
    .filter(({ idx }) => idx > currentTrackIndex);

  return (
    <aside
      aria-label="Playback Queue"
      className="fixed inset-x-0 top-14 bottom-[124px] lg:static lg:inset-auto lg:h-full z-30 w-full lg:w-[320px] shrink-0 lg:rounded-lg spotify-panel p-4 overflow-y-auto shadow-2xl lg:shadow-none"
    >
      <div className="flex items-center justify-between pb-3 border-b border-[#2A2A32]">
        <div className="flex items-center gap-2">
          <ListMusic className="w-4 h-4 text-[#E8A849]" aria-hidden="true" />
          <h2 className="text-sm font-bold text-[#F4F4F5]">Queue</h2>
          <span className="text-xs font-mono text-[#71717A] tabular-nums">
            {queue.length}
          </span>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close Queue"
          className="p-1.5 rounded-full text-[#A1A1AA] hover:text-[#F4F4F5] hover:bg-[#24242B] cursor-pointer"
        >
          <X className="w-4 h-4" aria-hidden="true" />
        </button>
      </div>

      {/* Personal AI Watcher Banner */}
      <div className="mt-3 rounded-lg border border-[#E8A849]/25 bg-[#18181D] p-2.5 flex items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="text-xs font-semibold text-[#F4F4F5] flex items-center gap-1.5">
            <Sparkles className="w-3.5 h-3.5 text-[#E8A849] shrink-0" aria-hidden="true" />
            <span className="truncate">AI Queue Watcher</span>
          </p>
          <p className="text-[11px] text-[#A1A1AA] mt-0.5">
            AI watches what you play &amp; suggests songs to your queue.
          </p>
        </div>
        {currentTrack && (
          <button
            type="button"
            onClick={requestAiSuggestionForQueue}
            disabled={aiQueueLoading}
            className="shrink-0 rounded-lg border border-[#E8A849]/45 bg-[#24242B] px-2.5 py-1.5 text-[11px] font-semibold text-[#E8A849] hover:bg-[#E8A849] hover:text-[#09090B] disabled:opacity-50 transition-colors cursor-pointer"
          >
            {aiQueueLoading ? 'Thinking...' : '+ AI Suggest'}
          </button>
        )}
      </div>

      {queue.length === 0 ? (
        <div className="py-12 text-center text-sm text-[#A1A1AA]">
          Your queue is empty. Play any song or use the ••• menu on any track to Play Next or Add to Queue.
        </div>
      ) : (
        <div className="mt-4 space-y-5">
          {currentTrack && (
            <div>
              <h3 className="text-xs font-semibold text-[#A1A1AA] mb-2">Now Playing</h3>
              <div className="flex items-center gap-3 rounded-md bg-[#24242B] p-2">
                <img
                  src={currentTrack.artworkUrl}
                  alt={currentTrack.title}
                  referrerPolicy="no-referrer"
                  className="w-11 h-11 rounded object-cover shrink-0 border border-[#2A2A32]"
                />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-[#E8A849] truncate">
                    {currentTrack.title}
                  </p>
                  <p className="text-xs text-[#A1A1AA] truncate">{currentTrack.artist}</p>
                </div>
                <TrackActionsMenu track={currentTrack} />
              </div>
            </div>
          )}

          <div>
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-xs font-semibold text-[#A1A1AA]">
                {upNext.length > 0 ? `Next in Queue (${upNext.length})` : 'All Queued Songs'}
              </h3>
            </div>
            <ul className="space-y-1">
              {(upNext.length > 0 ? upNext : queue.map((track, idx) => ({ track, idx }))).map(
                ({ track, idx }) => {
                  const isCurrent = idx === currentTrackIndex;
                  const isAiPick = track.source === 'silent-queue';
                  return (
                    <li
                      key={`${track.id}-${idx}`}
                      className={`flex items-center gap-2 rounded-md p-2 transition-colors group ${
                        isCurrent ? 'bg-[#24242B]' : 'hover:bg-[#1C1C21]'
                      }`}
                    >
                      <button
                        type="button"
                        onClick={() => setQueueAndPlay(queue, idx)}
                        className="flex items-center gap-2.5 min-w-0 flex-1 text-left cursor-pointer"
                      >
                        <div className="relative w-10 h-10 rounded overflow-hidden shrink-0 border border-[#2A2A32]">
                          <img
                            src={track.artworkUrl}
                            alt={track.title}
                            referrerPolicy="no-referrer"
                            className="w-full h-full object-cover"
                          />
                          <div className="absolute inset-0 bg-[#09090B]/60 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                            <Play className="w-3.5 h-3.5 text-[#E8A849] fill-current" aria-hidden="true" />
                          </div>
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-1.5 min-w-0">
                            <p
                              className={`text-sm font-medium truncate ${
                                isCurrent ? 'text-[#E8A849]' : 'text-[#F4F4F5]'
                              }`}
                            >
                              {track.title}
                            </p>
                            {isAiPick && (
                              <span className="shrink-0 text-[10px] font-semibold text-[#E8A849]">
                                AI
                              </span>
                            )}
                          </div>
                          <p className="text-xs text-[#A1A1AA] truncate">
                            {track.artist}
                          </p>
                          {isAiPick && track.aiReason && (
                            <p className="text-[10px] text-[#71717A] truncate mt-0.5">
                              {track.aiReason}
                            </p>
                          )}
                        </div>
                      </button>

                      <div className="flex items-center gap-1 shrink-0">
                        <span className="text-xs font-mono text-[#71717A] tabular-nums">
                          {formatDuration(track.duration)}
                        </span>
                        {!isCurrent && (
                          <button
                            type="button"
                            onClick={() => removeFromQueue(idx)}
                            aria-label={`Remove ${track.title} from queue`}
                            title="Remove from queue"
                            className="w-6 h-6 rounded-full inline-flex items-center justify-center text-[#71717A] hover:text-[#FCA5A5] hover:bg-[#24242B] transition-colors cursor-pointer"
                          >
                            <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
                          </button>
                        )}
                      </div>
                    </li>
                  );
                }
              )}
            </ul>

            {aiQueueLoading && (
              <div className="mt-2 flex items-center gap-2.5 rounded-md border border-[#E8A849]/25 bg-[#18181D] px-3 py-2">
                <div className="w-3.5 h-3.5 rounded-full border-2 border-[#E8A849] border-t-transparent animate-spin shrink-0" />
                <span className="text-xs text-[#A1A1AA]">
                  AI watching your plays &amp; suggesting next song...
                </span>
              </div>
            )}
          </div>
        </div>
      )}
    </aside>
  );
};
