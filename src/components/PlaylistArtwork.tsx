import React, { useState } from 'react';
import {
  AudioWaveform,
  Compass,
  Disc3,
  Flame,
  Globe,
  HardDriveDownload,
  Heart,
  ListMusic,
  MoonStar,
  Music2,
  Play,
  Radio,
  Sparkles,
} from 'lucide-react';
import type { Playlist } from '../types/crate';

export interface PlaylistIconMeta {
  label: string;
  gradient: string;
  renderIcon: (className: string) => React.ReactNode;
}

export function getPlaylistIconMeta(playlist: Pick<Playlist, 'id' | 'name' | 'accent'>): PlaylistIconMeta {
  const lower = `${playlist.id} ${playlist.name}`.toLowerCase();

  if (
    playlist.id === 'pl-internal-downloads' ||
    playlist.accent === 'downloads-gradient' ||
    lower === 'pl-internal-downloads downloads'
  ) {
    return {
      label: 'Offline Sandbox',
      gradient: 'from-[#0D211A] via-[#1E4A38] to-[#E8A849]',
      renderIcon: (className) => <HardDriveDownload className={className} aria-hidden="true" />,
    };
  }
  if (
    playlist.id === 'pl-weekly-top-tracks' ||
    playlist.accent === 'weekly-gradient' ||
    lower.includes('weekly top tracks')
  ) {
    return {
      label: 'Weekly Top Tracks',
      gradient: 'from-[#3A140B] via-[#9E4514] to-[#F3BC65]',
      renderIcon: (className) => <Flame className={className} aria-hidden="true" />,
    };
  }
  if (
    playlist.id === 'pl-monthly-top-tracks' ||
    playlist.accent === 'monthly-gradient' ||
    lower.includes('monthly top tracks')
  ) {
    return {
      label: 'Monthly Top Tracks',
      gradient: 'from-[#101C2B] via-[#2B4858] to-[#E8A849]',
      renderIcon: (className) => <AudioWaveform className={className} aria-hidden="true" />,
    };
  }
  if (lower.startsWith('sp-') || lower.includes('spotify')) {
    return {
      label: 'Spotify Playlist',
      gradient: 'from-[#1C1C21] via-[#2B2219] to-[#8A501E]',
      renderIcon: (className) => <ListMusic className={className} aria-hidden="true" />,
    };
  }
  if (lower.includes('daily mix')) {
    return {
      label: 'Daily Mix',
      gradient: 'from-[#2A1D12] via-[#8A501E] to-[#E8A849]',
      renderIcon: (className) => <Sparkles className={className} aria-hidden="true" />,
    };
  }
  if (lower.includes('discover weekly')) {
    return {
      label: 'Discover Weekly',
      gradient: 'from-[#141418] via-[#27272E] to-[#8A501E]',
      renderIcon: (className) => <Compass className={className} aria-hidden="true" />,
    };
  }
  if (lower.includes('release radar')) {
    return {
      label: 'Release Radar',
      gradient: 'from-[#18181D] via-[#3A2816] to-[#C87D32]',
      renderIcon: (className) => <Radio className={className} aria-hidden="true" />,
    };
  }
  if (lower.includes('workout') || lower.includes('drive')) {
    return {
      label: 'Workout & Drive',
      gradient: 'from-[#141418] via-[#4D2912] to-[#E8A849]',
      renderIcon: (className) => <Flame className={className} aria-hidden="true" />,
    };
  }
  if (lower.includes('unplugged') || lower.includes('bollywood')) {
    return {
      label: 'Unplugged Mix',
      gradient: 'from-[#1C1C21] via-[#35261A] to-[#A66A2E]',
      renderIcon: (className) => <Music2 className={className} aria-hidden="true" />,
    };
  }
  if (lower.includes('hindi') || lower.includes('night') || playlist.accent === 'rose') {
    return {
      label: 'Late Night Crate',
      gradient: 'from-[#141418] via-[#241B14] to-[#6B3E17]',
      renderIcon: (className) => <MoonStar className={className} aria-hidden="true" />,
    };
  }
  if (lower.includes('haryanvi') || lower.includes('sub') || lower.includes('bass') || playlist.accent === 'violet') {
    return {
      label: 'Heavy Sub Crate',
      gradient: 'from-[#1C1C21] via-[#3A2816] to-[#C87D32]',
      renderIcon: (className) => <AudioWaveform className={className} aria-hidden="true" />,
    };
  }
  if (lower.includes('global') || lower.includes('synth') || playlist.accent === 'emerald') {
    return {
      label: 'Spatial Global Crate',
      gradient: 'from-[#141418] via-[#27272E] to-[#4A3724]',
      renderIcon: (className) => <Globe className={className} aria-hidden="true" />,
    };
  }
  if (lower.includes('liked') || lower.includes('picked') || lower.includes('for you')) {
    return {
      label: 'Picked For You',
      gradient: 'from-[#8A501E] via-[#C87D32] to-[#E8A849]',
      renderIcon: (className) => <Heart className={className} aria-hidden="true" />,
    };
  }

  return {
    label: 'Playlist',
    gradient: 'from-[#18181D] via-[#26262E] to-[#3A2A1C]',
    renderIcon: (className) => <Disc3 className={className} aria-hidden="true" />,
  };
}

interface PlaylistArtworkProps {
  playlist: Pick<Playlist, 'id' | 'name' | 'coverUrl' | 'coverImages' | 'accent'>;
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl';
  showBadge?: boolean;
  showHoverPlay?: boolean;
  onPlayClick?: (e: React.MouseEvent) => void;
  className?: string;
}

const SIZE_CLASSES: Record<NonNullable<PlaylistArtworkProps['size']>, string> = {
  xs: 'w-10 h-10 rounded',
  sm: 'w-12 h-12 rounded-md',
  md: 'w-14 h-14 rounded-md',
  lg: 'w-full aspect-square rounded-lg',
  xl: 'w-40 h-40 sm:w-48 sm:h-48 md:w-52 md:h-52 rounded-lg',
};

export const PlaylistArtwork: React.FC<PlaylistArtworkProps> = ({
  playlist,
  size = 'sm',
  showBadge = true,
  showHoverPlay = false,
  onPlayClick,
  className = '',
}) => {
  const [imgError, setImgError] = useState(false);
  const [tileErrors, setTileErrors] = useState<Record<number, boolean>>({});
  const meta = getPlaylistIconMeta(playlist);
  const isLarge = size === 'lg' || size === 'xl';

  const isWeeklyGradient =
    playlist.id === 'pl-weekly-top-tracks' || playlist.accent === 'weekly-gradient';
  const isMonthlyGradient =
    playlist.id === 'pl-monthly-top-tracks' || playlist.accent === 'monthly-gradient';
  const isDownloadsGradient =
    playlist.id === 'pl-internal-downloads' || playlist.accent === 'downloads-gradient';
  const isCustomGradientCover = isWeeklyGradient || isMonthlyGradient || isDownloadsGradient;

  const collageUrls =
    !isCustomGradientCover &&
    !playlist.coverUrl &&
    Array.isArray(playlist.coverImages) &&
    playlist.coverImages.length > 0
      ? playlist.coverImages.length === 1
        ? [playlist.coverImages[0]]
        : [0, 1, 2, 3].map((i) => playlist.coverImages![i % playlist.coverImages!.length])
      : null;

  return (
    <div
      className={`relative overflow-hidden shrink-0 bg-gradient-to-br ${meta.gradient} border border-white/10 select-none ${SIZE_CLASSES[size]} ${className}`}
    >
      {isCustomGradientCover ? (
        <div
          aria-label={`${playlist.name} custom gradient cover`}
          className={`relative w-full h-full flex flex-col justify-between overflow-hidden bg-gradient-to-br ${
            isDownloadsGradient
              ? 'from-[#091A14] via-[#1B4B39] to-[#E8A849]'
              : isWeeklyGradient
                ? 'from-[#2A0E07] via-[#9E4514] to-[#F3BC65]'
                : 'from-[#0D1826] via-[#274659] to-[#E8A849]'
          } ${isLarge ? 'p-3.5' : 'p-1.5'}`}
        >
          {/* Ambient radial glow & concentric vinyl rings */}
          <div className="pointer-events-none absolute -right-1/4 -bottom-1/4 w-4/5 h-4/5 rounded-full border border-white/20 bg-white/5" />
          <div className="pointer-events-none absolute -right-1/3 -bottom-1/3 w-full h-full rounded-full border border-white/10" />

          <div className="relative z-10 flex items-center justify-between gap-1">
            <span
              className={`inline-flex items-center gap-1 font-mono font-bold uppercase tracking-widest text-[#F4F4F5]/95 bg-[#09090B]/55 backdrop-blur-xs rounded border border-white/15 ${
                isLarge ? 'text-[10px] px-2 py-1' : 'text-[8px] leading-none px-1 py-0.5'
              }`}
            >
              {isLarge && meta.renderIcon('w-3 h-3 text-[#F3BC65] shrink-0')}
              <span>
                {isDownloadsGradient
                  ? isLarge
                    ? 'OFFLINE VAULT'
                    : 'VAULT'
                  : isWeeklyGradient
                    ? isLarge
                      ? '7D TOP'
                      : '7D'
                    : isLarge
                      ? '30D TOP'
                      : '30D'}
              </span>
            </span>
            {Array.isArray(playlist.coverImages) &&
              playlist.coverImages[0] &&
              !tileErrors[0] &&
              isLarge && (
                <img
                  src={playlist.coverImages[0]}
                  alt=""
                  referrerPolicy="no-referrer"
                  onError={() => setTileErrors({ 0: true })}
                  className="w-9 h-9 rounded-md object-cover border border-white/30 shadow-md"
                />
              )}
          </div>

          <div className="relative z-10 mt-auto">
            {isLarge ? (
              <>
                <p className="text-[10px] font-mono uppercase tracking-wider text-white/80">
                  {isDownloadsGradient
                    ? 'Directory.Data · App Sandbox'
                    : isWeeklyGradient
                      ? 'On Repeat · 7 Days'
                      : 'Vault Replay · 30 Days'}
                </p>
                <p className="text-base sm:text-lg font-extrabold tracking-tight text-white leading-tight drop-shadow-xs">
                  {isDownloadsGradient
                    ? 'Downloads'
                    : isWeeklyGradient
                      ? 'Weekly Top'
                      : 'Monthly Top'}
                </p>
              </>
            ) : (
              <div className="flex items-center justify-end">
                {meta.renderIcon('w-3.5 h-3.5 text-white/95 drop-shadow-xs')}
              </div>
            )}
          </div>
        </div>
      ) : !imgError && playlist.coverUrl ? (
        <img
          src={playlist.coverUrl}
          alt={playlist.name}
          referrerPolicy="no-referrer"
          onError={() => setImgError(true)}
          className="w-full h-full object-cover"
        />
      ) : collageUrls && collageUrls.length >= 4 ? (
        <div
          aria-label={`${playlist.name} 4-song cover collage`}
          className="grid grid-cols-2 grid-rows-2 w-full h-full bg-[#121215]"
        >
          {collageUrls.map((src, idx) =>
            !tileErrors[idx] ? (
              <img
                key={`${playlist.id}-tile-${idx}`}
                src={src}
                alt=""
                referrerPolicy="no-referrer"
                onError={() => setTileErrors((prev) => ({ ...prev, [idx]: true }))}
                className="w-full h-full object-cover"
              />
            ) : (
              <div
                key={`${playlist.id}-tile-fallback-${idx}`}
                className="w-full h-full flex items-center justify-center bg-[#18181D]"
              >
                {meta.renderIcon(isLarge ? 'w-5 h-5 text-[#E8A849]/70' : 'w-2.5 h-2.5 text-[#E8A849]/70')}
              </div>
            )
          )}
        </div>
      ) : collageUrls && collageUrls.length === 1 && !tileErrors[0] ? (
        <img
          src={collageUrls[0]}
          alt={playlist.name}
          referrerPolicy="no-referrer"
          onError={() => setTileErrors({ 0: true })}
          className="w-full h-full object-cover"
        />
      ) : (
        <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-[#1C1C21] via-[#121215] to-[#09090B]">
          {meta.renderIcon(isLarge ? 'w-14 h-14 text-[#E8A849]' : 'w-5 h-5 text-[#E8A849]')}
        </div>
      )}

      {/* Subtle corner Playlist Icon Emblem (skipped on custom gradient covers which have integrated header badges) */}
      {showBadge && !isCustomGradientCover && (
        <span
          title={meta.label}
          className={`absolute flex items-center justify-center rounded bg-[#09090B]/85 backdrop-blur-sm border border-[#E8A849]/35 text-[#E8A849] shadow-md ${
            isLarge
              ? 'top-2.5 left-2.5 w-7 h-7'
              : 'bottom-0.5 right-0.5 w-4 h-4'
          }`}
        >
          {meta.renderIcon(isLarge ? 'w-4 h-4' : 'w-2.5 h-2.5')}
        </span>
      )}

      {/* Optional Spotify-style Hover Play Overlay */}
      {showHoverPlay && onPlayClick && (
        <button
          type="button"
          onClick={onPlayClick}
          aria-label={`Play ${playlist.name}`}
          className={`absolute flex items-center justify-center rounded-full crate-cta shadow-[0_8px_24px_rgba(0,0,0,0.65)] transition-all duration-200 cursor-pointer ${
            isLarge
              ? 'bottom-2.5 right-2.5 w-11 h-11 opacity-0 translate-y-2 group-hover:opacity-100 group-hover:translate-y-0 focus-visible:opacity-100 focus-visible:translate-y-0 hover:scale-105'
              : 'inset-0 m-auto w-8 h-8 opacity-0 group-hover:opacity-100 focus-visible:opacity-100'
          }`}
        >
          <Play className="w-4 h-4 fill-current ml-0.5" aria-hidden="true" />
        </button>
      )}
    </div>
  );
};
