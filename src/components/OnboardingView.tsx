import React, { useState } from 'react';
import { Camera, Check, LogOut } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { CrateLogo } from './CrateLogo';

export const OnboardingView: React.FC = () => {
  const { profile, completeOnboarding, logout } = useAuth();
  const [fullName, setFullName] = useState(profile?.full_name || '');
  const [mobileNumber, setMobileNumber] = useState(profile?.mobile_number || '');
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState(
    profile?.avatar_url || '/src/assets/images/avatar_listener_a_1794839824622.jpg'
  );

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setAvatarFile(file);
    setPreviewUrl(URL.createObjectURL(file));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleaned = fullName.trim();
    if (!cleaned) {
      setError('Please enter your Full Name to continue.');
      return;
    }

    setError('');
    setSaving(true);
    const res = await completeOnboarding({
      fullName: cleaned,
      mobileNumber: mobileNumber.trim() || undefined,
      avatarFile,
      avatarUrl: previewUrl,
    });
    setSaving(false);
    if (!res.ok) {
      setError(res.error || 'Could not save your profile.');
    }
  };

  return (
    <div className="min-h-screen crate-canvas flex items-center justify-center p-4 sm:p-6 overflow-y-auto">
      <div className="w-full max-w-md rounded-2xl border border-[#2A2A32] crate-surface backdrop-blur-xl p-6 sm:p-8 shadow-[0_24px_70px_rgba(0,0,0,0.85)] my-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <CrateLogo size="sm" shape="circle" />
            <span className="text-base font-bold text-[#F4F4F5]">Crate Profile</span>
          </div>
          <button
            type="button"
            onClick={logout}
            className="inline-flex items-center gap-1.5 text-xs text-[#A1A1AA] hover:text-[#E8A849] transition-colors cursor-pointer"
          >
            <LogOut className="w-3.5 h-3.5" aria-hidden="true" />
            Sign out
          </button>
        </div>

        <h1 className="mt-5 text-2xl font-bold text-[#F4F4F5] tracking-tight">
          Complete your Crate profile
        </h1>
        <p className="mt-1 text-sm text-[#A1A1AA]">
          No questions asked — AI watches what songs you play and automatically builds your personal queue.
        </p>

        <form onSubmit={handleSubmit} className="mt-6 space-y-5" noValidate>
          <div className="space-y-4 rounded-xl border border-[#2A2A32] bg-[#0F0F13] p-4">
            <div className="flex items-center gap-4">
              <div className="relative w-16 h-16 rounded-full overflow-hidden border border-[#E8A849]/45 bg-[#09090B] shrink-0">
                <img
                  src={previewUrl}
                  alt="Profile preview"
                  referrerPolicy="no-referrer"
                  className="w-full h-full object-cover"
                />
              </div>
              <div>
                <label
                  htmlFor="pfp-upload"
                  className="inline-flex items-center gap-1.5 rounded-lg border border-[#2A2A32] bg-[#18181D] px-3 py-1.5 text-xs font-medium text-[#F4F4F5] hover:border-[#E8A849] hover:text-[#E8A849] transition-colors cursor-pointer"
                >
                  <Camera className="w-3.5 h-3.5 text-[#E8A849]" aria-hidden="true" />
                  Upload PFP
                </label>
                <input
                  id="pfp-upload"
                  type="file"
                  accept="image/*"
                  onChange={handleFileChange}
                  className="sr-only"
                />
              </div>
            </div>

            <div>
              <label htmlFor="full-name-input" className="block text-xs font-medium text-[#E4E4E7] mb-1">
                Full Name
              </label>
              <input
                id="full-name-input"
                type="text"
                required
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                placeholder="Aarav Mehta"
                className="w-full rounded-xl border border-[#2A2A32] bg-[#09090B] px-3.5 py-2.5 text-sm text-[#F4F4F5] placeholder:text-[#71717A] focus:outline-none focus:border-[#E8A849] transition-colors"
              />
            </div>

            <div>
              <label
                htmlFor="onboarding-mobile-input"
                className="block text-xs font-medium text-[#E4E4E7] mb-1"
              >
                Mobile Number
              </label>
              <input
                id="onboarding-mobile-input"
                type="tel"
                value={mobileNumber}
                onChange={(e) => setMobileNumber(e.target.value)}
                placeholder="+91 98765 43210"
                className="w-full rounded-xl border border-[#2A2A32] bg-[#09090B] px-3.5 py-2.5 text-sm text-[#F4F4F5] placeholder:text-[#71717A] focus:outline-none focus:border-[#E8A849] transition-colors"
              />
            </div>
          </div>

          {error && (
            <p role="alert" className="text-xs text-[#FCA5A5]">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={saving}
            className="w-full flex items-center justify-center gap-2 rounded-xl crate-cta px-4 py-3 text-sm font-semibold shadow-[0_0_24px_rgba(232,168,73,0.24)] disabled:opacity-60 transition-all cursor-pointer"
          >
            <Check className="w-4 h-4" aria-hidden="true" />
            <span>{saving ? 'Saving profile...' : 'Continue to Crate'}</span>
          </button>
        </form>
      </div>
    </div>
  );
};
