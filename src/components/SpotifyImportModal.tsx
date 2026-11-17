import React, { useRef, useState } from 'react';
import {
  Disc3,
  ImagePlus,
  ListPlus,
  Loader2,
  Music2,
  PlusCircle,
  Trash2,
  X,
} from 'lucide-react';
import { apiFetch } from '../lib/apiClient';
import type { Playlist } from '../types/crate';

interface SpotifyImportModalProps {
  open: boolean;
  onClose: () => void;
  onImported: (playlist: Playlist) => void;
}

type ModalMode = 'create' | 'import';

export const SpotifyImportModal: React.FC<SpotifyImportModalProps> = ({
  open,
  onClose,
  onImported,
}) => {
  const [mode, setMode] = useState<ModalMode>('create');
  const [url, setUrl] = useState('');
  const [customName, setCustomName] = useState('');
  const [manualText, setManualText] = useState('');
  const [showManual, setShowManual] = useState(false);
  const [coverDataUrl, setCoverDataUrl] = useState('');
  const [coverFileName, setCoverFileName] = useState('');
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState('');
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  if (!open) return null;

  const resetAndClose = () => {
    setMode('create');
    setUrl('');
    setCustomName('');
    setManualText('');
    setShowManual(false);
    setCoverDataUrl('');
    setCoverFileName('');
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
    setError('');
    onClose();
  };

  const handleCoverFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setError('');
    const file = e.target.files?.[0];
    if (!file) return;

    if (!/^image\/(png|jpeg|jpg|webp|gif)$/i.test(file.type)) {
      setError('Please choose a PNG, JPG, WEBP, or GIF image for the playlist icon.');
      return;
    }
    if (file.size > 4 * 1024 * 1024) {
      setError('Playlist icon must be 4 MB or smaller.');
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      const result = typeof reader.result === 'string' ? reader.result : '';
      if (result) {
        setCoverDataUrl(result);
        setCoverFileName(file.name);
      }
    };
    reader.onerror = () => {
      setError('Could not read the selected image file.');
    };
    reader.readAsDataURL(file);
  };

  const clearCoverFile = () => {
    setCoverDataUrl('');
    setCoverFileName('');
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (mode === 'create') {
      const cleanedName = customName.trim();
      if (!cleanedName) {
        setError('Give your new playlist a name.');
        return;
      }

      setImporting(true);
      try {
        const res = await apiFetch('/api/playlists', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: cleanedName,
            cover_data_url: coverDataUrl || undefined,
          }),
        });
        const data = (await res.json()) as {
          ok?: boolean;
          playlist?: Playlist;
          error?: string;
        };
        if (!res.ok || !data.playlist) {
          setError(data.error || 'Could not create playlist.');
          return;
        }
        onImported(data.playlist);
        resetAndClose();
      } catch {
        setError('Network error while creating playlist.');
      } finally {
        setImporting(false);
      }
      return;
    }

    if (!url.trim() && !manualText.trim()) {
      setError('Paste a public Spotify playlist URL or enter songs manually.');
      return;
    }

    setImporting(true);
    try {
      const res = await apiFetch('/api/playlists/import-spotify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          url: url.trim() || undefined,
          customName: customName.trim() || undefined,
          manualText: !url.trim() && manualText.trim() ? manualText.trim() : undefined,
        }),
      });
      const data = (await res.json()) as {
        ok?: boolean;
        playlist?: Playlist;
        error?: string;
      };
      if (!res.ok || !data.playlist) {
        setError(data.error || 'Could not import Spotify playlist.');
        return;
      }
      onImported(data.playlist);
      resetAndClose();
    } catch {
      setError('Network error while importing playlist.');
    } finally {
      setImporting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-[#09090B]/85 backdrop-blur-md p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="spotify-import-title"
    >
      <div className="w-full max-w-lg rounded-2xl border border-[#2A2A32] crate-surface p-6 md:p-7 shadow-[0_24px_75px_rgba(0,0,0,0.9)]">
        <div className="flex items-center justify-between border-b border-[#2A2A32] pb-4">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-[#E8A849]/25 via-[#C87D32]/20 to-[#18181D] border border-[#E8A849]/45 flex items-center justify-center">
              <Disc3 className="w-5 h-5 text-[#E8A849]" aria-hidden="true" />
            </div>
            <div>
              <h2 id="spotify-import-title" className="text-lg font-semibold text-[#F4F4F5]">
                {mode === 'create' ? 'Create Playlist' : 'Import from Spotify'}
              </h2>
              <p className="text-xs text-[#A1A1AA]">
                {mode === 'create'
                  ? 'Name your playlist and optionally upload a custom cover icon.'
                  : 'Extracts all songs and adds them to your Crate library.'}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={resetAndClose}
            disabled={importing}
            aria-label="Close playlist modal"
            className="p-1.5 rounded-lg text-[#A1A1AA] hover:text-[#F4F4F5] hover:bg-[#24242B] transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" aria-hidden="true" />
          </button>
        </div>

        {/* Mode Switcher: Primary = Create Playlist, Secondary = Import from Spotify */}
        <div className="mt-4 grid grid-cols-2 gap-1.5 rounded-xl bg-[#09090B] p-1 border border-[#2A2A32]">
          <button
            type="button"
            onClick={() => {
              setMode('create');
              setError('');
            }}
            className={`rounded-lg py-2 text-xs font-semibold transition-colors cursor-pointer ${
              mode === 'create'
                ? 'bg-[#24242B] text-[#E8A849]'
                : 'text-[#A1A1AA] hover:text-[#F4F4F5]'
            }`}
          >
            Create Playlist
          </button>
          <button
            type="button"
            onClick={() => {
              setMode('import');
              setError('');
            }}
            className={`rounded-lg py-2 text-xs font-semibold transition-colors cursor-pointer ${
              mode === 'import'
                ? 'bg-[#24242B] text-[#E8A849]'
                : 'text-[#A1A1AA] hover:text-[#F4F4F5]'
            }`}
          >
            Import from Spotify
          </button>
        </div>

        <form onSubmit={handleSubmit} className="mt-5 space-y-4" noValidate>
          {mode === 'create' ? (
            <>
              <div>
                <label
                  htmlFor="create-playlist-name"
                  className="block text-xs font-medium text-[#E4E4E7] mb-1.5"
                >
                  Playlist Name
                </label>
                <input
                  id="create-playlist-name"
                  type="text"
                  autoFocus
                  required
                  value={customName}
                  onChange={(e) => setCustomName(e.target.value)}
                  placeholder="My Midnight Mix"
                  className="w-full rounded-xl border border-[#2A2A32] bg-[#09090B] px-4 py-3 text-sm text-[#F4F4F5] placeholder:text-[#71717A] focus:outline-none focus:border-[#E8A849] transition-colors"
                />
              </div>

              <div>
                <span className="block text-xs font-medium text-[#E4E4E7] mb-2">
                  Playlist Icon <span className="text-[#71717A] font-normal">(optional)</span>
                </span>

                <div className="flex items-center gap-4 rounded-xl border border-[#2A2A32] bg-[#09090B] p-3.5">
                  <div className="w-20 h-20 rounded-lg overflow-hidden shrink-0 border border-[#2A2A32] bg-[#141418]">
                    {coverDataUrl ? (
                      <img
                        src={coverDataUrl}
                        alt="Custom playlist icon preview"
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <div
                        aria-hidden="true"
                        className="grid grid-cols-2 grid-rows-2 w-full h-full gap-0.5 bg-[#09090B] p-0.5"
                      >
                        <div className="bg-gradient-to-br from-[#2A1D12] to-[#8A501E] flex items-center justify-center">
                          <Music2 className="w-3.5 h-3.5 text-[#E8A849]" />
                        </div>
                        <div className="bg-gradient-to-br from-[#1C1C21] to-[#3A2816] flex items-center justify-center">
                          <Disc3 className="w-3.5 h-3.5 text-[#F3BC65]" />
                        </div>
                        <div className="bg-gradient-to-br from-[#18181D] to-[#4A3724] flex items-center justify-center">
                          <Disc3 className="w-3.5 h-3.5 text-[#C87D32]" />
                        </div>
                        <div className="bg-gradient-to-br from-[#241B14] to-[#6B3E17] flex items-center justify-center">
                          <Music2 className="w-3.5 h-3.5 text-[#E8A849]" />
                        </div>
                      </div>
                    )}
                  </div>

                  <div className="min-w-0 flex-1 space-y-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <label
                        htmlFor="create-playlist-logo"
                        className="inline-flex items-center gap-1.5 rounded-lg border border-[#2A2A32] bg-[#18181D] hover:border-[#E8A849] hover:text-[#E8A849] px-3 py-1.5 text-xs font-medium text-[#F4F4F5] transition-colors cursor-pointer"
                      >
                        <ImagePlus className="w-3.5 h-3.5 text-[#E8A849]" aria-hidden="true" />
                        <span>{coverDataUrl ? 'Change Icon' : 'Upload Icon'}</span>
                      </label>
                      <input
                        ref={fileInputRef}
                        id="create-playlist-logo"
                        type="file"
                        accept="image/png,image/jpeg,image/webp,image/gif"
                        onChange={handleCoverFileChange}
                        className="sr-only"
                      />

                      {coverDataUrl && (
                        <button
                          type="button"
                          onClick={clearCoverFile}
                          className="inline-flex items-center gap-1 rounded-lg border border-[#2A2A32] bg-[#141418] hover:border-[#FCA5A5]/50 hover:text-[#FCA5A5] px-2.5 py-1.5 text-xs text-[#A1A1AA] transition-colors cursor-pointer"
                        >
                          <Trash2 className="w-3 h-3" aria-hidden="true" />
                          <span>Remove</span>
                        </button>
                      )}
                    </div>

                    <p className="text-[11px] text-[#71717A] leading-relaxed truncate">
                      {coverFileName
                        ? `Selected: ${coverFileName}`
                        : 'Leave blank to auto-pick 4 random song pics like Spotify.'}
                    </p>
                  </div>
                </div>
              </div>
            </>
          ) : (
            <>
              <div>
                <label
                  htmlFor="spotify-playlist-url"
                  className="block text-xs font-medium text-[#E4E4E7] mb-1.5"
                >
                  Spotify Playlist URL
                </label>
                <input
                  id="spotify-playlist-url"
                  type="url"
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  placeholder="https://open.spotify.com/playlist/37i9dQZF1DXcBWIGoYBM5M"
                  className="w-full rounded-xl border border-[#2A2A32] bg-[#09090B] px-4 py-3 text-sm text-[#F4F4F5] placeholder:text-[#71717A] focus:outline-none focus:border-[#E8A849] transition-colors"
                />
              </div>

              <div>
                <label
                  htmlFor="spotify-crate-name"
                  className="block text-xs font-medium text-[#E4E4E7] mb-1.5"
                >
                  Playlist Name (optional)
                </label>
                <input
                  id="spotify-crate-name"
                  type="text"
                  value={customName}
                  onChange={(e) => setCustomName(e.target.value)}
                  placeholder="Keep Spotify playlist title"
                  className="w-full rounded-xl border border-[#2A2A32] bg-[#09090B] px-4 py-2.5 text-sm text-[#F4F4F5] placeholder:text-[#71717A] focus:outline-none focus:border-[#E8A849] transition-colors"
                />
              </div>

              <div>
                <button
                  type="button"
                  onClick={() => setShowManual((v) => !v)}
                  className="text-xs text-[#E8A849] hover:text-[#F3BC65] transition-colors cursor-pointer"
                >
                  {showManual
                    ? 'Hide manual tracklist input'
                    : 'Or paste tracks manually (Title - Artist)'}
                </button>
                {showManual && (
                  <textarea
                    id="spotify-manual-tracks"
                    rows={4}
                    value={manualText}
                    onChange={(e) => setManualText(e.target.value)}
                    placeholder={'Kesariya - Arijit Singh\nBlinding Lights - The Weeknd'}
                    className="mt-2 w-full rounded-xl border border-[#2A2A32] bg-[#09090B] px-4 py-2.5 text-xs font-mono text-[#F4F4F5] placeholder:text-[#71717A] focus:outline-none focus:border-[#E8A849]"
                  />
                )}
              </div>
            </>
          )}

          {error && (
            <p role="alert" className="text-xs text-[#FCA5A5]">
              {error}
            </p>
          )}

          <div className="flex items-center justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={resetAndClose}
              disabled={importing}
              className="rounded-xl border border-[#2A2A32] bg-[#18181D] px-4 py-2.5 text-xs font-medium text-[#E4E4E7] hover:text-[#F4F4F5] hover:bg-[#24242B] transition-colors cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={importing}
              className="inline-flex items-center gap-2 rounded-xl crate-cta px-5 py-2.5 text-xs font-semibold shadow-[0_0_20px_rgba(232,168,73,0.24)] disabled:opacity-60 transition-all cursor-pointer"
            >
              {importing ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden="true" />
                  <span>{mode === 'create' ? 'Creating...' : 'Importing all songs...'}</span>
                </>
              ) : mode === 'create' ? (
                <>
                  <PlusCircle className="w-3.5 h-3.5" aria-hidden="true" />
                  <span>Create Playlist</span>
                </>
              ) : (
                <>
                  <ListPlus className="w-3.5 h-3.5" aria-hidden="true" />
                  <span>Import Full Playlist</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
