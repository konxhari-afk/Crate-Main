import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { evaluateRouteAccess } from '../lib/accessControl';
import { apiFetch, clearSessionToken, setSessionToken } from '../lib/apiClient';
import { isSupabaseConfigured, supabase } from '../lib/supabase';
import type { AppRoute, UserPreferences, UserProfile } from '../types/crate';

interface AuthContextValue {
  profile: UserProfile | null;
  loading: boolean;
  currentRoute: AppRoute;
  navigate: (to: AppRoute) => void;
  signInWithEmailPassword: (
    email: string,
    password: string
  ) => Promise<{ ok: boolean; profile?: UserProfile; error?: string }>;
  sendMobileOtp: (
    email: string,
    mobileNumber: string,
    password?: string,
    fullName?: string,
    avatarFile?: File | null
  ) => Promise<{ ok: boolean; mobileNumber?: string; devOtp?: string; error?: string }>;
  verifyMobileOtp: (
    email: string,
    mobileNumber: string,
    otp: string
  ) => Promise<{ ok: boolean; profile?: UserProfile; error?: string }>;
  completeOnboarding: (payload: {
    fullName: string;
    mobileNumber?: string;
    avatarFile?: File | null;
    avatarUrl?: string;
    preferences?: UserPreferences;
  }) => Promise<{ ok: boolean; error?: string }>;
  updatePreferences: (preferences: UserPreferences) => Promise<{ ok: boolean; error?: string }>;
  refreshProfile: () => Promise<UserProfile | null>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

function normalizeRoute(pathname: string): AppRoute {
  switch (pathname) {
    case '/login':
    case '/onboarding':
    case '/access-denied':
    case '/owner':
    case '/admin':
      return pathname === '/admin' ? '/owner' : pathname;
    case '/blend':
    case '/listen-together':
      return pathname;
    default:
      return '/';
  }
}

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [currentRoute, setCurrentRoute] = useState<AppRoute>(() =>
    normalizeRoute(window.location.pathname)
  );

  const navigate = useCallback((to: AppRoute) => {
    if (window.location.pathname !== to) {
      window.history.pushState({}, '', to);
    }
    setCurrentRoute(to);
  }, []);

  const refreshProfile = useCallback(async (): Promise<UserProfile | null> => {
    if (isSupabaseConfigured && supabase) {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        setProfile(null);
        return null;
      }
      const { data } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', user.id)
        .single();
      const next = (data as UserProfile) ?? null;
      setProfile(next);
      return next;
    }

    const res = await apiFetch('/api/auth/me');
    if (res.ok) {
      const data = (await res.json()) as { profile: UserProfile | null };
      if (!data.profile) {
        clearSessionToken();
      }
      const next = data.profile ?? null;
      setProfile(next);
      return next;
    } else {
      clearSessionToken();
      setProfile(null);
      return null;
    }
  }, []);

  useEffect(() => {
    if (window.location.pathname === '/admin') {
      window.history.replaceState({}, '', '/owner');
    }
    const onPopState = () => {
      if (window.location.pathname === '/admin') {
        window.history.replaceState({}, '', '/owner');
      }
      setCurrentRoute(normalizeRoute(window.location.pathname));
    };
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);

  // Bootstrap auth session or ?autostart=1
  useEffect(() => {
    let active = true;
    async function init() {
      try {
        const params = new URLSearchParams(window.location.search);
        const autostart = params.get('autostart') === '1';

        await refreshProfile();

        if (autostart) {
          const meRes = await apiFetch('/api/auth/me');
          const meData = (await meRes.json()) as { profile: UserProfile | null };
          if (!meData.profile) {
            const autoRes = await apiFetch('/api/auth/autostart', {
              method: 'POST',
            });
            if (autoRes.ok && active) {
              const autoData = (await autoRes.json()) as {
                profile?: UserProfile;
                sessionToken?: string;
              };
              if (autoData.sessionToken) {
                setSessionToken(autoData.sessionToken);
              }
              if (autoData.profile) setProfile(autoData.profile);
            }
          }
        }
      } finally {
        if (active) setLoading(false);
      }
    }
    init();
    return () => {
      active = false;
    };
  }, [refreshProfile]);

  // Client-side gatekeeper enforcing Next.js middleware parity
  useEffect(() => {
    if (loading) return;
    const decision = evaluateRouteAccess(currentRoute, profile);
    if (!decision.allowed && decision.redirectTo && decision.redirectTo !== currentRoute) {
      navigate(decision.redirectTo);
    }
  }, [loading, currentRoute, profile, navigate]);

  const signInWithEmailPassword = useCallback(async (email: string, password: string) => {
    const cleanEmail = email.trim().toLowerCase();
    const cleanPassword = password.trim();

    if (isSupabaseConfigured && supabase) {
      const { data, error } = await supabase.auth.signInWithPassword({
        email: cleanEmail,
        password: cleanPassword,
      });
      if (error) return { ok: false, error: error.message };
      if (data.user) {
        const next = await refreshProfile();
        return { ok: true, profile: next ?? undefined };
      }
      return { ok: false, error: 'Unable to sign in.' };
    }

    const res = await apiFetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: cleanEmail, password: cleanPassword }),
    });
    const data = (await res.json()) as {
      ok?: boolean;
      profile?: UserProfile;
      sessionToken?: string;
      error?: string;
    };
    if (!res.ok || !data.profile) {
      return { ok: false, error: data.error || 'Incorrect email or password.' };
    }
    if (data.sessionToken) {
      setSessionToken(data.sessionToken);
    }
    setProfile(data.profile);
    return { ok: true, profile: data.profile };
  }, [refreshProfile]);

  // Sign Up: Gathers PFP, Full Name, Email, Mobile Number, and Password; dispatches 1-time OTP to mobile number
  const sendMobileOtp = useCallback(
    async (
      email: string,
      mobileNumber: string,
      password?: string,
      fullName?: string,
      avatarFile?: File | null
    ) => {
      const cleanEmail = email.trim().toLowerCase();
      const cleanMobile = mobileNumber.trim();
      const cleanPassword = (password || '').trim();
      const cleanFullName = (fullName || '').trim();

      let avatarDataUrl = '';
      if (avatarFile) {
        avatarDataUrl = await new Promise<string>((resolve) => {
          const reader = new FileReader();
          reader.onload = () => resolve(String(reader.result || ''));
          reader.onerror = () => resolve('');
          reader.readAsDataURL(avatarFile);
        });
      }

      if (isSupabaseConfigured && supabase) {
        const normalizedPhone = cleanMobile.startsWith('+')
          ? `+${cleanMobile.replace(/\D/g, '')}`
          : `+91${cleanMobile.replace(/\D/g, '')}`;
        const { error } = await supabase.auth.signInWithOtp({
          phone: normalizedPhone,
          options: {
            data: {
              email: cleanEmail,
              mobile_number: cleanMobile,
              ...(cleanFullName ? { full_name: cleanFullName } : {}),
              ...(cleanPassword ? { password: cleanPassword } : {}),
            },
          },
        });
        if (error) return { ok: false, error: error.message };
        return { ok: true, mobileNumber: cleanMobile };
      }

      const res = await fetch('/api/auth/send-mobile-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: cleanEmail,
          mobile_number: cleanMobile,
          password: cleanPassword || undefined,
          full_name: cleanFullName || undefined,
          avatar_data_url: avatarDataUrl || undefined,
        }),
      });
      const data = (await res.json()) as {
        ok?: boolean;
        mobileNumber?: string;
        devOtp?: string;
        error?: string;
      };
      if (!res.ok) {
        return { ok: false, error: data.error || 'Unable to send OTP to mobile number.' };
      }
      return { ok: true, mobileNumber: data.mobileNumber, devOtp: data.devOtp };
    },
    []
  );

  const verifyMobileOtp = useCallback(
    async (email: string, mobileNumber: string, otp: string) => {
      const cleanEmail = email.trim().toLowerCase();
      const cleanMobile = mobileNumber.trim();

      if (isSupabaseConfigured && supabase) {
        const normalizedPhone = cleanMobile.startsWith('+')
          ? `+${cleanMobile.replace(/\D/g, '')}`
          : `+91${cleanMobile.replace(/\D/g, '')}`;
        const { data, error } = await supabase.auth.verifyOtp({
          phone: normalizedPhone,
          token: otp.trim(),
          type: 'sms',
        });
        if (error) return { ok: false, error: error.message };
        if (data.user) {
          await supabase
            .from('profiles')
            .update({ email: cleanEmail, mobile_number: cleanMobile })
            .eq('id', data.user.id);
        }
        const next = await refreshProfile();
        return { ok: true, profile: next ?? undefined };
      }

      const res = await apiFetch('/api/auth/verify-mobile-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: cleanEmail,
          mobile_number: cleanMobile,
          otp: otp.trim(),
        }),
      });
      const data = (await res.json()) as {
        profile?: UserProfile;
        sessionToken?: string;
        error?: string;
      };
      if (!res.ok || !data.profile) {
        return { ok: false, error: data.error || 'Invalid OTP code.' };
      }
      if (data.sessionToken) {
        setSessionToken(data.sessionToken);
      }
      setProfile(data.profile);
      return { ok: true, profile: data.profile };
    },
    [refreshProfile]
  );

  const completeOnboarding = useCallback(
    async ({
      fullName,
      mobileNumber,
      avatarFile,
      avatarUrl,
      preferences,
    }: {
      fullName: string;
      mobileNumber?: string;
      avatarFile?: File | null;
      avatarUrl?: string;
      preferences?: UserPreferences;
    }) => {
      if (isSupabaseConfigured && supabase && profile) {
        let finalAvatarUrl = avatarUrl || profile.avatar_url;
        if (avatarFile) {
          const filePath = `${profile.id}/${Date.now()}-${avatarFile.name}`;
          const { error: uploadErr } = await supabase.storage
            .from('avatars')
            .upload(filePath, avatarFile, { upsert: true });
          if (uploadErr) {
            return { ok: false, error: uploadErr.message };
          }
          const { data: urlData } = supabase.storage.from('avatars').getPublicUrl(filePath);
          finalAvatarUrl = urlData.publicUrl;
        }
        const { data, error } = await supabase
          .from('profiles')
          .update({
            full_name: fullName,
            mobile_number: mobileNumber || profile.mobile_number,
            avatar_url: finalAvatarUrl,
            preferences: preferences ?? profile.preferences,
          })
          .eq('id', profile.id)
          .select()
          .single();
        if (error) return { ok: false, error: error.message };
        setProfile(data as UserProfile);
        return { ok: true };
      }

      let avatarDataUrl = '';
      if (avatarFile) {
        avatarDataUrl = await new Promise<string>((resolve) => {
          const reader = new FileReader();
          reader.onload = () => resolve(String(reader.result || ''));
          reader.onerror = () => resolve('');
          reader.readAsDataURL(avatarFile);
        });
      }

      const res = await apiFetch('/api/onboarding', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          full_name: fullName,
          mobile_number: mobileNumber || undefined,
          avatar_data_url: avatarDataUrl || undefined,
          avatar_url: avatarUrl || undefined,
          preferences,
        }),
      });
      const data = (await res.json()) as { profile?: UserProfile; error?: string };
      if (res.status === 401) {
        clearSessionToken();
        setProfile(null);
        navigate('/login');
        return { ok: false, error: 'Your session expired. Please verify your mobile OTP again.' };
      }
      if (!res.ok || !data.profile) {
        return { ok: false, error: data.error || 'Failed to save profile.' };
      }
      setProfile(data.profile);
      return { ok: true };
    },
    [navigate, profile]
  );

  const updatePreferences = useCallback(
    async (preferences: UserPreferences) => {
      const res = await apiFetch('/api/preferences', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ preferences }),
      });
      const data = (await res.json()) as { profile?: UserProfile; error?: string };
      if (!res.ok || !data.profile) {
        return { ok: false, error: data.error || 'Could not update preferences.' };
      }
      setProfile(data.profile);
      return { ok: true };
    },
    []
  );

  const logout = useCallback(async () => {
    if (isSupabaseConfigured && supabase) {
      await supabase.auth.signOut();
    } else {
      await apiFetch('/api/auth/logout', { method: 'POST' });
    }
    clearSessionToken();
    setProfile(null);
    navigate('/login');
  }, [navigate]);

  return (
    <AuthContext.Provider
      value={{
        profile,
        loading,
        currentRoute,
        navigate,
        signInWithEmailPassword,
        sendMobileOtp,
        verifyMobileOtp,
        completeOnboarding,
        updatePreferences,
        refreshProfile,
        logout,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
