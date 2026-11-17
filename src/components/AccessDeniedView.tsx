import React, { useEffect, useState } from 'react';
import { LogOut, RefreshCw } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { CrateLogo } from './CrateLogo';

export const AccessDeniedView: React.FC = () => {
  const { profile, refreshProfile, logout } = useAuth();
  const [checking, setChecking] = useState(false);
  const [statusNote, setStatusNote] = useState('');

  useEffect(() => {
    let active = true;
    const poll = async () => {
      if (!active) return;
      await refreshProfile().catch(() => null);
    };

    const interval = window.setInterval(() => {
      void poll();
    }, 4000);

    const onFocusOrVisible = () => {
      if (document.visibilityState === 'visible') {
        void poll();
      }
    };
    window.addEventListener('focus', onFocusOrVisible);
    document.addEventListener('visibilitychange', onFocusOrVisible);

    return () => {
      active = false;
      window.clearInterval(interval);
      window.removeEventListener('focus', onFocusOrVisible);
      document.removeEventListener('visibilitychange', onFocusOrVisible);
    };
  }, [refreshProfile]);

  const handleCheck = async () => {
    setChecking(true);
    setStatusNote('');
    const updated = await refreshProfile().catch(() => null);
    setChecking(false);
    if (updated && !updated.is_approved) {
      setStatusNote('Still awaiting owner approval. This screen unlocks automatically once approved.');
    }
  };

  return (
    <div className="min-h-screen crate-canvas flex items-center justify-center p-6">
      <div className="w-full max-w-md rounded-2xl border border-[#2A2A32] crate-surface backdrop-blur-xl p-8 text-center shadow-[0_24px_70px_rgba(0,0,0,0.85)]">
        <div className="mx-auto flex items-center justify-center">
          <CrateLogo size="xl" shape="rounded" />
        </div>

        <h1 className="mt-6 text-2xl font-semibold text-[#F4F4F5] tracking-tight">
          Waiting for Owner Approval.
        </h1>
        <p className="mt-2.5 text-sm text-[#A1A1AA] leading-relaxed">
          Your Crate account is queued for review. Once approved by the owner, access unlocks automatically.
        </p>

        {profile && (
          <div className="mt-6 flex items-center gap-3 rounded-xl border border-[#2A2A32] bg-[#09090B] p-3 text-left">
            <img
              src={profile.avatar_url || '/src/assets/images/avatar_listener_a_1794839824622.jpg'}
              alt={profile.full_name || 'Member avatar'}
              referrerPolicy="no-referrer"
              className="w-10 h-10 rounded-full object-cover border border-[#E8A849]/50"
            />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-[#F4F4F5] truncate">{profile.full_name}</p>
              <p className="text-xs text-[#A1A1AA] truncate">
                {profile.email} {profile.mobile_number ? `· ${profile.mobile_number}` : ''}
              </p>
            </div>
          </div>
        )}

        {statusNote && (
          <p role="status" className="mt-4 text-xs text-[#E8A849]">
            {statusNote}
          </p>
        )}

        <div className="mt-6 flex flex-col gap-2.5">
          <button
            type="button"
            onClick={handleCheck}
            disabled={checking}
            className="w-full inline-flex items-center justify-center gap-2 rounded-xl crate-cta px-4 py-3 text-sm font-semibold shadow-[0_0_24px_rgba(232,168,73,0.24)] disabled:opacity-60 transition-all cursor-pointer"
          >
            <RefreshCw className={`w-4 h-4 ${checking ? 'animate-spin' : ''}`} aria-hidden="true" />
            <span>{checking ? 'Checking access...' : 'Check Approval Status'}</span>
          </button>

          <button
            type="button"
            onClick={logout}
            className="w-full inline-flex items-center justify-center gap-2 rounded-xl border border-[#2A2A32] bg-[#18181D] px-4 py-2.5 text-sm font-medium text-[#E4E4E7] hover:border-[#E8A849] hover:text-[#E8A849] transition-colors cursor-pointer"
          >
            <LogOut className="w-4 h-4" aria-hidden="true" />
            <span>Sign out</span>
          </button>
        </div>
      </div>
    </div>
  );
};
