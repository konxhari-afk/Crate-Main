import React, { useState } from 'react';
import { ArrowRight, Clock, Play, Shuffle } from 'lucide-react';
import { usePlayer } from '../context/PlayerContext';
import { blendPlaylists } from '../lib/blend';
import { formatDuration } from '../lib/audioMath';
import type { Playlist, Track } from '../types/crate';
import { PlaylistArtwork } from './PlaylistArtwork';

interface BlendViewProps {
  playlists: Playlist[];
}

export const BlendView: React.FC<BlendViewProps> = ({ playlists }) => {
  const { currentTrack, isPlaying, setQueueAndPlay } = usePlayer();
  const [playlistAId, setPlaylistAId] = useState(playlists[0]?.id || '');
  const [playlistBId, setPlaylistBId] = useState(playlists[1]?.id || playlists[0]?.id || '');
  const [blendedTracks, setBlendedTracks] = useState<Track[]>([]);

  const playlistA = playlists.find((p) => p.id === playlistAId) || playlists[0];
  const playlistB = playlists.find((p) => p.id === playlistBId) || playlists[1] || playlists[0];

  const handleGenerateBlend = () => {
    if (!playlistA || !playlistB) return;
    const mixed = blendPlaylists(playlistA.tracks, playlistB.tracks);
    setBlendedTracks(mixed);
    setQueueAndPlay(mixed, 0);
  };

  return (
    <div className="flex-1 overflow-y-auto md:rounded-lg spotify-panel crate-canvas pb-36 md:pb-8">
      {/* Spotify-style Blend Hero */}
      <div className="bg-gradient-to-b from-[#5C3A1B]/45 via-[#241A12]/55 to-transparent px-5 md:px-7 pt-7 pb-6">
        <div className="flex flex-col sm:flex-row sm:items-end gap-5 md:gap-7 max-w-5xl">
          <div className="relative w-40 h-40 sm:w-44 sm:h-44 rounded-lg overflow-hidden shrink-0 border border-[#E8A849]/45 shadow-[0_20px_50px_rgba(9,9,11,0.8)]">
            <img
              src="/src/assets/images/crate_cover_bronze_wave_1794853069757.jpg"
              alt="Crate Blend Cover"
              referrerPolicy="no-referrer"
              className="w-full h-full object-cover"
            />
            <span className="absolute top-2.5 left-2.5 w-7 h-7 rounded bg-[#09090B]/85 border border-[#E8A849]/40 flex items-center justify-center text-[#E8A849]">
              <Shuffle className="w-4 h-4" aria-hidden="true" />
            </span>
          </div>

          <div>
            <p className="text-xs font-semibold text-[#E4E4E7]">Playlist Mixer</p>
            <h1 className="mt-1 text-3xl sm:text-5xl font-extrabold tracking-tight text-[#F4F4F5]">
              Crate Blend
            </h1>
            <p className="mt-2 text-sm text-[#A1A1AA] max-w-xl">
              Combine any two playlists into an interleaved queue with Fisher-Yates shuffle.
            </p>
          </div>
        </div>
      </div>

      <div className="px-5 md:px-7 max-w-5xl">
        {/* Playlist Selectors with Playlist Icons */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="rounded-lg bg-[#141418] border border-[#2A2A32] p-4 flex items-center gap-3.5">
            {playlistA && <PlaylistArtwork playlist={playlistA} size="md" showBadge />}
            <div className="min-w-0 flex-1">
              <label htmlFor="blend-playlist-a" className="block text-xs font-semibold text-[#E8A849] mb-1.5">
                Playlist A
              </label>
              <select
                id="blend-playlist-a"
                value={playlistAId}
                onChange={(e) => setPlaylistAId(e.target.value)}
                className="w-full rounded-md border border-[#2A2A32] bg-[#09090B] px-3 py-2 text-sm text-[#F4F4F5] focus:outline-none focus:border-[#E8A849]"
              >
                {playlists.map((pl) => (
                  <option key={pl.id} value={pl.id}>
                    {pl.name} ({pl.tracks.length} songs)
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="rounded-lg bg-[#141418] border border-[#2A2A32] p-4 flex items-center gap-3.5">
            {playlistB && <PlaylistArtwork playlist={playlistB} size="md" showBadge />}
            <div className="min-w-0 flex-1">
              <label htmlFor="blend-playlist-b" className="block text-xs font-semibold text-[#C87D32] mb-1.5">
                Playlist B
              </label>
              <select
                id="blend-playlist-b"
                value={playlistBId}
                onChange={(e) => setPlaylistBId(e.target.value)}
                className="w-full rounded-md border border-[#2A2A32] bg-[#09090B] px-3 py-2 text-sm text-[#F4F4F5] focus:outline-none focus:border-[#C87D32]"
              >
                {playlists.map((pl) => (
                  <option key={pl.id} value={pl.id}>
                    {pl.name} ({pl.tracks.length} songs)
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>

        <div className="mt-5">
          <button
            type="button"
            onClick={handleGenerateBlend}
            className="inline-flex items-center gap-2 rounded-full crate-cta px-6 py-3 text-sm font-bold shadow-[0_8px_24px_rgba(232,168,73,0.24)] hover:scale-[1.02] transition-transform cursor-pointer"
          >
            <Shuffle className="w-4 h-4" aria-hidden="true" />
            <span>Create Blend & Play</span>
            <ArrowRight className="w-4 h-4" aria-hidden="true" />
          </button>
        </div>

        {blendedTracks.length > 0 && (
          <section className="mt-8">
            <h2 className="text-lg font-bold text-[#F4F4F5] mb-3">
              Blended Queue ({blendedTracks.length} songs)
            </h2>
            <div className="grid grid-cols-[28px_minmax(0,1fr)_88px] items-center gap-3 px-3 py-2 border-b border-[#2A2A32] text-xs font-medium text-[#71717A]">
              <span className="text-center">#</span>
              <span>Title</span>
              <span className="flex items-center justify-end pr-2">
                <Clock className="w-3.5 h-3.5" aria-hidden="true" />
              </span>
            </div>
            <div className="mt-1 space-y-0.5">
              {blendedTracks.map((track, idx) => {
                const active = currentTrack?.videoId === track.videoId;
                return (
                  <div
                    key={`${track.id}-${idx}`}
                    className={`group grid grid-cols-[28px_minmax(0,1fr)_88px] items-center gap-3 px-3 py-2 rounded-md transition-colors ${
                      active ? 'bg-[#24242B]' : 'hover:bg-[#1C1C21]'
                    }`}
                  >
                    <span className="text-center text-xs font-mono text-[#71717A] tabular-nums">
                      {idx + 1}
                    </span>
                    <div className="flex items-center gap-3 min-w-0">
                      <img
                        src={track.artworkUrl}
                        alt={track.title}
                        referrerPolicy="no-referrer"
                        className="w-10 h-10 rounded object-cover border border-[#2A2A32] shrink-0"
                      />
                      <div className="min-w-0 flex-1">
                        <p className={`text-sm font-medium truncate ${active ? 'text-[#E8A849]' : 'text-[#F4F4F5]'}`}>
                          {track.title}
                        </p>
                        <p className="text-xs text-[#A1A1AA] truncate">{track.artist}</p>
                      </div>
                    </div>
                    <div className="flex items-center justify-end gap-2.5">
                      <span className="text-xs font-mono text-[#71717A] tabular-nums">
                        {formatDuration(track.duration)}
                      </span>
                      <button
                        type="button"
                        onClick={() => setQueueAndPlay(blendedTracks, idx)}
                        aria-label={`Play ${track.title}`}
                        className="w-8 h-8 rounded-full bg-[#24242B] text-[#E8A849] hover:bg-[#E8A849] hover:text-[#09090B] flex items-center justify-center transition-colors cursor-pointer"
                      >
                        <Play className={`w-3.5 h-3.5 fill-current ml-0.5 ${active && isPlaying ? 'text-[#09090B]' : ''}`} aria-hidden="true" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        )}
      </div>
    </div>
  );
};
