import React, { useRef } from 'react';
import {
  Home,
  ListPlus,
  LogOut,
  Search,
  Shield,
  X,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { CrateLogo } from './CrateLogo';

interface TopBarProps {
  searchQuery: string;
  searchActive: boolean;
  onSearchChange: (q: string) => void;
  onSubmitSearch: (q: string) => void;
  onOpenSearch: () => void;
  onGoHome: () => void;
  onOpenSpotifyImport: () => void;
}

export const TopBar: React.FC<TopBarProps> = ({
  searchQuery,
  searchActive,
  onSearchChange,
  onSubmitSearch,
  onOpenSearch,
  onGoHome,
  onOpenSpotifyImport,
}) => {
  const { profile, currentRoute, navigate, logout } = useAuth();
  const inputRef = useRef<HTMLInputElement | null>(null);

  const handleFormSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmitSearch(searchQuery);
  };

  const handleSearchIconClick = () => {
    onOpenSearch();
    setTimeout(() => inputRef.current?.focus(), 0);
  };

  return (
    <header className="h-14 shrink-0 px-3 md:px-4 flex items-center justify-between gap-2.5 md:gap-6 bg-[#09090B] select-none">
      {/* Left: Brand Logo */}
      <div className="flex items-center gap-2.5 shrink-0">
        <button
          type="button"
          onClick={onGoHome}
          aria-label="Crate Home"
          className="flex items-center gap-2.5 cursor-pointer group"
        >
          <CrateLogo size="md" shape="circle" className="group-hover:scale-105 transition-transform" />
          <span className="hidden sm:inline text-base font-bold tracking-tight text-[#F4F4F5] whitespace-nowrap">
            Crate
          </span>
        </button>
      </div>

      {/* Center: Home Button + Search Icon Button + Spotify Pill Search */}
      <div className="flex items-center gap-2 flex-1 max-w-xl min-w-0">
        <button
          type="button"
          onClick={onGoHome}
          aria-label="Home"
          title="Home"
          className={`hidden md:flex w-10 h-10 rounded-full items-center justify-center shrink-0 transition-colors cursor-pointer ${
            currentRoute === '/' && !searchActive && !searchQuery.trim()
              ? 'bg-[#24242B] text-[#E8A849] border border-[#E8A849]/50'
              : 'bg-[#141418] text-[#A1A1AA] hover:text-[#F4F4F5] hover:bg-[#1E1E24] border border-[#2A2A32]'
          }`}
        >
          <Home className="w-5 h-5" aria-hidden="true" />
        </button>

        <button
          type="button"
          onClick={handleSearchIconClick}
          aria-label="Search playlists and songs"
          title="Browse & Search Playlists"
          className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 transition-colors cursor-pointer ${
            currentRoute === '/' && searchActive
              ? 'bg-[#24242B] text-[#E8A849] border border-[#E8A849]/50'
              : 'bg-[#141418] text-[#A1A1AA] hover:text-[#F4F4F5] hover:bg-[#1E1E24] border border-[#2A2A32]'
          }`}
        >
          <Search className="w-4 h-4" aria-hidden="true" />
        </button>

        <form role="search" onSubmit={handleFormSubmit} className="relative flex-1 min-w-0">
          <label htmlFor="ytmusic-search" className="sr-only">
            Search playlists, songs, or artists
          </label>
          <button
            type="button"
            onClick={handleSearchIconClick}
            aria-label="Browse all playlists"
            className="absolute left-3 top-1/2 -translate-y-1/2 text-[#A1A1AA] hover:text-[#E8A849] transition-colors cursor-pointer"
          >
            <Search className="w-4 h-4" aria-hidden="true" />
          </button>
          <input
            ref={inputRef}
            id="ytmusic-search"
            type="text"
            value={searchQuery}
            onFocus={() => {
              if (!searchActive) onOpenSearch();
            }}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="Search playlists, songs, or artists..."
            className="w-full h-10 rounded-full border border-[#2A2A32] bg-[#141418] pl-9 sm:pl-10 pr-12 sm:pr-24 text-xs sm:text-sm text-[#F4F4F5] placeholder:text-[#71717A] hover:bg-[#1C1C21] hover:border-[#3F3F46] focus:outline-none focus:bg-[#1C1C21] focus:border-[#E8A849] transition-colors"
          />
          {searchQuery.trim() && (
            <button
              type="button"
              onClick={() => {
                onSearchChange('');
                onSubmitSearch('');
              }}
              aria-label="Clear search"
              className="absolute right-10 sm:right-[72px] top-1/2 -translate-y-1/2 p-1 rounded-full text-[#A1A1AA] hover:text-[#F4F4F5] cursor-pointer"
            >
              <X className="w-3.5 h-3.5" aria-hidden="true" />
            </button>
          )}
          <button
            type="submit"
            aria-label="Search"
            className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded-full bg-[#24242B] hover:bg-[#E8A849] px-2.5 sm:px-3 py-1 text-xs font-semibold text-[#F4F4F5] hover:text-[#09090B] transition-colors cursor-pointer whitespace-nowrap"
          >
            <span className="hidden sm:inline">Search</span>
            <Search className="w-3.5 h-3.5 sm:hidden" aria-hidden="true" />
          </button>
        </form>
      </div>

      {/* Right: Create / Import Playlist + Owner Admin + Profile Avatar */}
      <div className="flex items-center gap-2 shrink-0">
        <button
          type="button"
          onClick={onOpenSpotifyImport}
          className="inline-flex items-center gap-1.5 rounded-full bg-[#141418] border border-[#2A2A32] px-3 md:px-3.5 py-2 text-xs font-semibold text-[#F4F4F5] hover:border-[#E8A849] hover:text-[#E8A849] hover:bg-[#1C1C21] transition-colors cursor-pointer whitespace-nowrap"
        >
          <ListPlus className="w-3.5 h-3.5 text-[#E8A849]" aria-hidden="true" />
          <span className="hidden sm:inline">Playlists +</span>
          <span className="sm:hidden">Add</span>
        </button>

        {profile?.is_admin && (
          <button
            type="button"
            onClick={() => navigate('/owner')}
            className="hidden sm:inline-flex items-center gap-1.5 rounded-full bg-[#141418] border border-[#2A2A32] px-3 py-2 text-xs font-semibold text-[#E8A849] hover:border-[#E8A849] hover:bg-[#1C1C21] transition-colors cursor-pointer whitespace-nowrap"
          >
            <Shield className="w-3.5 h-3.5" aria-hidden="true" />
            <span>Admin</span>
          </button>
        )}

        {profile && (
          <div className="hidden md:flex items-center gap-1.5 pl-1">
            <img
              src={profile.avatar_url || '/src/assets/images/avatar_owner_1794839824806.jpg'}
              alt={profile.full_name || profile.email}
              title={`${profile.full_name} (${profile.email})`}
              referrerPolicy="no-referrer"
              className="w-8 h-8 rounded-full object-cover border-2 border-[#2A2A32] hover:border-[#E8A849] transition-colors"
            />
            <button
              type="button"
              onClick={logout}
              aria-label="Sign out"
              title="Sign out"
              className="p-2 rounded-full text-[#A1A1AA] hover:text-[#E8A849] hover:bg-[#18181D] transition-colors cursor-pointer"
            >
              <LogOut className="w-4 h-4" aria-hidden="true" />
            </button>
          </div>
        )}
      </div>
    </header>
  );
};
