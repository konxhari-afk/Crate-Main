import React, { useState } from 'react';
import { Crown, Headphones, LogOut, Radio, Users } from 'lucide-react';
import { usePlayer } from '../context/PlayerContext';
import { formatDuration } from '../lib/audioMath';

export const ListenTogetherView: React.FC = () => {
  const {
    roomState,
    isRoomHost,
    roomConnected,
    currentTrack,
    isPlaying,
    currentTime,
    joinListenRoom,
    leaveListenRoom,
  } = usePlayer();
  const [roomCode, setRoomCode] = useState('CRATE-01');
  const [role, setRole] = useState<'host' | 'listener'>('host');

  const handleJoin = (e: React.FormEvent) => {
    e.preventDefault();
    if (!roomCode.trim()) return;
    joinListenRoom(roomCode.trim(), role === 'host');
  };

  return (
    <div className="flex-1 overflow-y-auto md:rounded-lg spotify-panel crate-canvas p-5 md:p-7 pb-36 md:pb-8">
      <div className="max-w-4xl">
        <div className="pb-6 border-b border-[#2A2A32]">
          <div className="flex items-center gap-2 text-[#E8A849] text-xs font-semibold">
            <Radio className="w-4 h-4" aria-hidden="true" />
            <span>Jam Session</span>
          </div>
          <h1 className="mt-1.5 text-3xl sm:text-4xl font-extrabold tracking-tight text-[#F4F4F5]">
            Listen Together
          </h1>
          <p className="mt-1.5 text-sm text-[#A1A1AA] max-w-xl">
            Host a synchronized room or join as a listener to lock playback in real time.
          </p>
        </div>

        {!roomConnected || !roomState ? (
          <form
            onSubmit={handleJoin}
            className="mt-7 max-w-lg rounded-xl border border-[#2A2A32] bg-[#141418] p-6 space-y-5"
          >
            <div>
              <label htmlFor="room-code-input" className="block text-xs font-semibold text-[#E4E4E7] mb-1.5">
                Room Channel Code
              </label>
              <input
                id="room-code-input"
                type="text"
                required
                value={roomCode}
                onChange={(e) => setRoomCode(e.target.value.toUpperCase())}
                placeholder="CRATE-01"
                className="w-full rounded-lg border border-[#2A2A32] bg-[#09090B] px-4 py-2.5 font-mono text-sm text-[#F4F4F5] focus:outline-none focus:border-[#E8A849]"
              />
            </div>

            <div>
              <span className="block text-xs font-semibold text-[#E4E4E7] mb-2">Session Role</span>
              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => setRole('host')}
                  className={`flex items-center justify-center gap-2 rounded-lg border px-4 py-2.5 text-sm font-medium transition-all cursor-pointer ${
                    role === 'host'
                      ? 'border-[#E8A849] bg-[#24242B] text-[#E8A849]'
                      : 'border-[#2A2A32] bg-[#18181D] text-[#A1A1AA] hover:text-[#F4F4F5]'
                  }`}
                >
                  <Crown className="w-4 h-4" aria-hidden="true" />
                  Host Room
                </button>
                <button
                  type="button"
                  onClick={() => setRole('listener')}
                  className={`flex items-center justify-center gap-2 rounded-lg border px-4 py-2.5 text-sm font-medium transition-all cursor-pointer ${
                    role === 'listener'
                      ? 'border-[#E8A849] bg-[#24242B] text-[#E8A849]'
                      : 'border-[#2A2A32] bg-[#18181D] text-[#A1A1AA] hover:text-[#F4F4F5]'
                  }`}
                >
                  <Headphones className="w-4 h-4" aria-hidden="true" />
                  Join as Listener
                </button>
              </div>
            </div>

            <button
              type="submit"
              className="w-full rounded-full crate-cta px-4 py-3 text-sm font-bold shadow-[0_8px_24px_rgba(232,168,73,0.24)] transition-all cursor-pointer"
            >
              {role === 'host' ? 'Start Broadcast Room' : 'Connect & Sync'}
            </button>
          </form>
        ) : (
          <div className="mt-7 space-y-6">
            <div className="rounded-xl border border-[#E8A849]/35 bg-gradient-to-br from-[#241A12] via-[#18181D] to-[#141418] p-6 flex flex-wrap items-center justify-between gap-4">
              <div>
                <p className="text-xs font-mono text-[#E8A849]">
                  CHANNEL {roomState.roomId} · {isRoomHost ? 'HOSTING' : 'SYNCED LISTENER'}
                </p>
                <h2 className="mt-1 text-xl font-bold text-[#F4F4F5]">
                  {roomState.track?.title || currentTrack?.title || 'Waiting for track'}
                </h2>
                <p className="text-sm text-[#A1A1AA] mt-0.5">
                  {roomState.track?.artist || currentTrack?.artist || 'Select a song from Discover'} ·{' '}
                  <span className="font-mono tabular-nums text-[#E8A849]">
                    {formatDuration(isRoomHost ? currentTime : roomState.currentTime)}
                  </span>{' '}
                  · {isPlaying || roomState.isPlaying ? 'Playing' : 'Paused'}
                </p>
              </div>

              <button
                type="button"
                onClick={leaveListenRoom}
                className="inline-flex items-center gap-2 rounded-full border border-[#2A2A32] bg-[#18181D] px-4 py-2 text-xs font-semibold text-[#F4F4F5] hover:border-[#E8A849] hover:text-[#E8A849] transition-colors cursor-pointer"
              >
                <LogOut className="w-3.5 h-3.5" aria-hidden="true" />
                Leave Room
              </button>
            </div>

            <div className="rounded-xl border border-[#2A2A32] bg-[#141418] p-5">
              <div className="flex items-center gap-2 text-sm font-bold text-[#F4F4F5] mb-4">
                <Users className="w-4 h-4 text-[#E8A849]" aria-hidden="true" />
                <span>Connected Listeners ({roomState.participants.length})</span>
              </div>
              <ul className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {roomState.participants.map((p) => (
                  <li
                    key={p.id}
                    className="flex items-center gap-3 rounded-lg border border-[#2A2A32] bg-[#18181D] p-3"
                  >
                    <img
                      src={p.avatarUrl}
                      alt={p.name}
                      referrerPolicy="no-referrer"
                      className="w-9 h-9 rounded-full object-cover border border-[#E8A849]/50"
                    />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-[#F4F4F5] truncate">{p.name}</p>
                      <p className="text-xs text-[#A1A1AA]">
                        {p.isHost ? 'Host Broadcaster' : 'Synced Listener'}
                      </p>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
