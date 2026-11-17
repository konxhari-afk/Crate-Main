import React from 'react';
import { Home, Radio, Search, Shield, Shuffle } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import type { AppRoute } from '../types/crate';

interface MobileNavProps {
  searchActive?: boolean;
  onOpenSearch?: () => void;
  onGoHome?: () => void;
}

export const MobileNav: React.FC<MobileNavProps> = ({
  searchActive = false,
  onOpenSearch,
  onGoHome,
}) => {
  const { profile, currentRoute, navigate } = useAuth();

  const items: Array<{
    id: string;
    label: string;
    active: boolean;
    onClick: () => void;
    icon: React.ReactNode;
  }> = [
    {
      id: 'home',
      label: 'Home',
      active: currentRoute === '/' && !searchActive,
      onClick: () => {
        if (onGoHome) {
          onGoHome();
        } else {
          navigate('/' as AppRoute);
        }
      },
      icon: <Home className="w-5 h-5" aria-hidden="true" />,
    },
    {
      id: 'search',
      label: 'Search',
      active: currentRoute === '/' && searchActive,
      onClick: () => {
        if (onOpenSearch) {
          onOpenSearch();
        } else {
          navigate('/');
        }
      },
      icon: <Search className="w-5 h-5" aria-hidden="true" />,
    },
    {
      id: 'blend',
      label: 'Blend',
      active: currentRoute === '/blend',
      onClick: () => navigate('/blend'),
      icon: <Shuffle className="w-5 h-5" aria-hidden="true" />,
    },
    {
      id: 'listen',
      label: 'Listen',
      active: currentRoute === '/listen-together',
      onClick: () => navigate('/listen-together'),
      icon: <Radio className="w-5 h-5" aria-hidden="true" />,
    },
  ];

  if (profile?.is_admin) {
    items.push({
      id: 'owner',
      label: 'Owner',
      active: currentRoute === '/owner',
      onClick: () => navigate('/owner'),
      icon: <Shield className="w-5 h-5" aria-hidden="true" />,
    });
  }

  return (
    <nav
      aria-label="Mobile navigation"
      className="md:hidden fixed bottom-0 left-0 right-0 z-40 h-14 border-t border-[#2A2A32] bg-[#09090B]/95 backdrop-blur-xl grid"
      style={{ gridTemplateColumns: `repeat(${items.length}, minmax(0, 1fr))` }}
    >
      {items.map((item) => (
        <button
          key={item.id}
          type="button"
          onClick={item.onClick}
          className={`flex flex-col items-center justify-center gap-0.5 text-[10px] font-medium transition-colors cursor-pointer ${
            item.active ? 'text-[#E8A849]' : 'text-[#A1A1AA]'
          }`}
        >
          {item.icon}
          <span>{item.label}</span>
        </button>
      ))}
    </nav>
  );
};
