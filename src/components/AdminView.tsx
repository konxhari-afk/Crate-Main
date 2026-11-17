import React, { useCallback, useEffect, useState } from 'react';
import {
  Activity,
  ArrowLeft,
  Bot,
  CheckCircle2,
  Eye,
  EyeOff,
  Loader2,
  Lock,
  RefreshCw,
  Search,
  Shield,
  Trash2,
  UserCheck,
  UserX,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { isProtectedOwnerProfile } from '../lib/accessControl';
import { ownerApiFetch } from '../lib/apiClient';
import { isSupabaseConfigured, supabase } from '../lib/supabase';
import type { Track, UserProfile } from '../types/crate';
import { CrateLogo } from './CrateLogo';

interface AdminViewProps {
  onOwnerLogout?: () => void;
  onSessionExpired?: () => void;
}

interface BotTestResult {
  geminiConfigured: boolean;
  geminiLive: boolean;
  modelUsed: string | null;
  ytMusicWorking: boolean;
  latencyMs: number;
  seedQuery: string;
  suggestions: Track[];
  error?: string;
}

export const AdminView: React.FC<AdminViewProps> = ({
  onOwnerLogout,
  onSessionExpired,
}) => {
  const { navigate } = useAuth();
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [revealedPasswords, setRevealedPasswords] = useState<Record<string, boolean>>({});
  const [error, setError] = useState('');
  const [statusMessage, setStatusMessage] = useState('');

  const togglePasswordReveal = (userId: string) => {
    setRevealedPasswords((prev) => ({
      ...prev,
      [userId]: !prev[userId],
    }));
  };

  // Bot Suggestion Diagnostic State
  const [botSeed, setBotSeed] = useState('Kesariya - Arijit Singh');
  const [testingBot, setTestingBot] = useState(false);
  const [botResult, setBotResult] = useState<BotTestResult | null>(null);

  const isPrimaryOwnerRow = (user: UserProfile) => isProtectedOwnerProfile(user);

  const fetchUsers = useCallback(
    async (searchText: string) => {
      setLoading(true);
      setError('');
      try {
        if (isSupabaseConfigured && supabase) {
          let builder = supabase
            .from('profiles')
            .select('*')
            .order('created_at', { ascending: false });
          if (searchText.trim()) {
            const term = `%${searchText.trim()}%`;
            builder = builder.or(
              `full_name.ilike.${term},email.ilike.${term},mobile_number.ilike.${term}`
            );
          }
          const { data, error: err } = await builder;
          if (err) throw new Error(err.message);
          setUsers((data as UserProfile[]) || []);
        } else {
          const res = await ownerApiFetch(
            `/api/admin/users?q=${encodeURIComponent(searchText.trim())}`
          );
          if (res.status === 401 || res.status === 403) {
            onSessionExpired?.();
            return;
          }
          const data = (await res.json()) as { users?: UserProfile[]; error?: string };
          if (!res.ok) throw new Error(data.error || 'Failed to load users.');
          setUsers(data.users || []);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Unable to load users.');
      } finally {
        setLoading(false);
      }
    },
    [onSessionExpired]
  );

  useEffect(() => {
    const timer = setTimeout(() => {
      void fetchUsers(query);
    }, 150);
    return () => clearTimeout(timer);
  }, [fetchUsers, query]);

  useEffect(() => {
    const onFocusOrVisible = () => {
      if (document.visibilityState === 'visible') {
        void fetchUsers(query);
      }
    };
    window.addEventListener('focus', onFocusOrVisible);
    document.addEventListener('visibilitychange', onFocusOrVisible);
    return () => {
      window.removeEventListener('focus', onFocusOrVisible);
      document.removeEventListener('visibilitychange', onFocusOrVisible);
    };
  }, [fetchUsers, query]);

  const handleToggleApproval = async (user: UserProfile) => {
    if (isPrimaryOwnerRow(user)) return;
    setTogglingId(user.id);
    setError('');
    setStatusMessage('');
    const nextValue = !user.is_approved;
    try {
      let updatedUser: UserProfile = { ...user, is_approved: nextValue };
      if (isSupabaseConfigured && supabase) {
        const { error: err } = await supabase
          .from('profiles')
          .update({ is_approved: nextValue })
          .eq('id', user.id);
        if (err) throw new Error(err.message);
      } else {
        const res = await ownerApiFetch(`/api/admin/users/${user.id}/approval`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ is_approved: nextValue }),
        });
        if (res.status === 401 || res.status === 403) {
          onSessionExpired?.();
          return;
        }
        const data = (await res.json()) as { user?: UserProfile; error?: string };
        if (!res.ok) {
          throw new Error(data.error || 'Failed to update approval.');
        }
        if (data.user) {
          updatedUser = data.user;
        }
      }
      setUsers((prev) =>
        prev.map((u) => (u.id === user.id ? updatedUser : u))
      );
      const label = updatedUser.full_name || updatedUser.email;
      setStatusMessage(
        updatedUser.is_approved
          ? `Approved ${label} (${updatedUser.email}). Account access is now unlocked.`
          : `Revoked access for ${label} (${updatedUser.email}).`
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Update failed.');
    } finally {
      setTogglingId(null);
    }
  };

  const handleDeleteUser = async (user: UserProfile) => {
    if (isPrimaryOwnerRow(user)) return;
    setDeletingId(user.id);
    setError('');
    setStatusMessage('');
    try {
      if (isSupabaseConfigured && supabase) {
        const { error: err } = await supabase.from('profiles').delete().eq('id', user.id);
        if (err) throw new Error(err.message);
      } else {
        const res = await ownerApiFetch(`/api/admin/users/${user.id}`, {
          method: 'DELETE',
        });
        if (res.status === 401 || res.status === 403) {
          onSessionExpired?.();
          return;
        }
        const data = (await res.json()) as { error?: string };
        if (!res.ok) {
          throw new Error(data.error || 'Failed to delete user.');
        }
      }
      setUsers((prev) => prev.filter((u) => u.id !== user.id));
      setConfirmDeleteId(null);
      setStatusMessage(`Deleted account ${user.full_name || user.email}.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Delete failed.');
    } finally {
      setDeletingId(null);
    }
  };

  const handleRunBotTest = async (e?: React.FormEvent) => {
    e?.preventDefault();
    setTestingBot(true);
    setError('');
    const parts = botSeed.split(/\s+-\s+/);
    const songName = (parts[0] || 'Kesariya').trim();
    const artist = (parts.slice(1).join(' - ') || 'Arijit Singh').trim();
    try {
      const res = await ownerApiFetch('/api/owner/bot-test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ songName, artist }),
      });
      if (res.status === 401 || res.status === 403) {
        onSessionExpired?.();
        return;
      }
      const data = (await res.json()) as BotTestResult & { error?: string };
      if (!res.ok) {
        throw new Error(data.error || 'Bot suggestion check failed.');
      }
      setBotResult(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Bot diagnostic failed.');
    } finally {
      setTestingBot(false);
    }
  };

  const approvedCount = users.filter((u) => u.is_approved).length;
  const pendingCount = users.length - approvedCount;

  return (
    <div className="min-h-screen crate-canvas text-[#F4F4F5] p-6 md:p-10 pb-28">
      <div className="max-w-6xl mx-auto space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-[#2A2A32] pb-6">
          <div>
            <div className="flex items-center gap-4 mb-3">
              <button
                type="button"
                onClick={() => navigate('/')}
                className="inline-flex items-center gap-2 text-xs font-medium text-[#E8A849] hover:text-[#F4F4F5] transition-colors cursor-pointer"
              >
                <ArrowLeft className="w-3.5 h-3.5" aria-hidden="true" />
                Back to Player
              </button>
              {onOwnerLogout && (
                <button
                  type="button"
                  onClick={onOwnerLogout}
                  className="inline-flex items-center gap-1.5 text-xs font-medium text-[#A1A1AA] hover:text-[#E8A849] transition-colors cursor-pointer"
                >
                  <Lock className="w-3.5 h-3.5" aria-hidden="true" />
                  Lock Panel
                </button>
              )}
            </div>
            <div className="flex items-center gap-3">
              <CrateLogo size="md" shape="circle" />
              <h1 className="text-2xl md:text-3xl font-bold tracking-tight bg-gradient-to-r from-[#F4F4F5] via-[#F3BC65] to-[#C87D32] bg-clip-text text-transparent">
                Owner Management Panel
              </h1>
            </div>
            <p className="mt-1.5 text-sm text-[#A1A1AA]">
              {users.length} members · <span className="text-[#34D399]">{approvedCount} approved</span> ·{' '}
              <span className="text-[#E8A849]">{pendingCount} pending</span>
            </p>
          </div>

          <div className="flex items-center gap-2.5 w-full sm:w-auto">
            <div className="relative flex-1 sm:w-80">
              <label htmlFor="admin-user-search" className="sr-only">
                Search users by name, email, or mobile number
              </label>
              <Search
                className="w-4 h-4 text-[#E8A849] absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none"
                aria-hidden="true"
              />
              <input
                id="admin-user-search"
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search name, email, or mobile..."
                className="w-full rounded-xl border border-[#2A2A32] bg-[#141418] pl-10 pr-4 py-2.5 text-sm text-[#F4F4F5] placeholder:text-[#71717A] focus:outline-none focus:border-[#E8A849] transition-colors"
              />
            </div>
            <button
              type="button"
              onClick={() => void fetchUsers(query)}
              disabled={loading}
              aria-label="Refresh member list"
              title="Refresh member list"
              className="inline-flex items-center gap-1.5 rounded-xl border border-[#2A2A32] bg-[#141418] px-3 py-2.5 text-xs font-medium text-[#E4E4E7] hover:border-[#E8A849] hover:text-[#E8A849] transition-colors cursor-pointer shrink-0"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} aria-hidden="true" />
              <span className="hidden sm:inline">Refresh</span>
            </button>
          </div>
        </div>

        {/* Suggestion Bot Live Check */}
        <section className="rounded-2xl border border-[#2A2A32] crate-surface p-5">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-[#F3BC65]/20 to-[#18181D] border border-[#E8A849]/40 flex items-center justify-center shrink-0">
                <Bot className="w-4 h-4 text-[#E8A849]" aria-hidden="true" />
              </div>
              <div>
                <h2 className="text-sm font-semibold text-[#F4F4F5]">
                  Bot Suggestion Health Check
                </h2>
                <p className="text-xs text-[#A1A1AA]">
                  Verify live Gemini autoplay recommendations & YouTube Music track matching.
                </p>
              </div>
            </div>

            <form onSubmit={handleRunBotTest} className="flex flex-wrap items-center gap-2.5">
              <label htmlFor="bot-seed-input" className="sr-only">
                Seed song for bot suggestion test
              </label>
              <input
                id="bot-seed-input"
                type="text"
                value={botSeed}
                onChange={(e) => setBotSeed(e.target.value)}
                placeholder="Song - Artist"
                className="w-56 rounded-xl border border-[#2A2A32] bg-[#09090B] px-3 py-2 text-xs text-[#F4F4F5] placeholder:text-[#71717A] focus:outline-none focus:border-[#E8A849]"
              />
              <button
                type="submit"
                disabled={testingBot}
                className="inline-flex items-center gap-2 rounded-xl crate-cta px-4 py-2 text-xs font-semibold shadow-[0_0_18px_rgba(232,168,73,0.22)] disabled:opacity-60 cursor-pointer whitespace-nowrap"
              >
                {testingBot ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden="true" />
                    <span>Testing Bot...</span>
                  </>
                ) : (
                  <>
                    <Activity className="w-3.5 h-3.5" aria-hidden="true" />
                    <span>Test Bot Suggestions</span>
                  </>
                )}
              </button>
            </form>
          </div>

          {botResult && (
            <div className="mt-4 pt-4 border-t border-[#2A2A32] space-y-3">
              <div className="flex flex-wrap items-center gap-3 text-xs">
                <span className="inline-flex items-center gap-1.5 rounded-lg border border-[#E8A849]/40 bg-[#18181D] px-2.5 py-1 font-medium text-[#E8A849]">
                  {botResult.geminiLive
                    ? `Gemini Bot Working (${botResult.modelUsed})`
                    : 'Gemini Unavailable · Using Fallback Queue'}
                </span>
                <span className="inline-flex items-center gap-1.5 rounded-lg border border-[#2A2A32] bg-[#18181D] px-2.5 py-1 text-[#E4E4E7]">
                  YouTube Music Match: {botResult.ytMusicWorking ? 'Working' : 'Fallback'}
                </span>
                <span className="text-[#A1A1AA] font-mono tabular-nums">
                  {botResult.latencyMs} ms
                </span>
              </div>

              {botResult.error && (
                <p className="text-xs text-[#E8A849]">Note: {botResult.error}</p>
              )}

              {botResult.suggestions.length > 0 && (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-2.5">
                  {botResult.suggestions.map((track) => (
                    <div
                      key={track.videoId}
                      className="flex items-center gap-2.5 rounded-xl border border-[#2A2A32] bg-[#09090B] p-2.5 min-w-0"
                    >
                      <img
                        src={track.artworkUrl}
                        alt={track.title}
                        referrerPolicy="no-referrer"
                        className="w-9 h-9 rounded-md object-cover border border-[#2A2A32] shrink-0"
                      />
                      <div className="min-w-0">
                        <p className="text-xs font-medium text-[#F4F4F5] truncate">{track.title}</p>
                        <p className="text-[11px] text-[#A1A1AA] truncate">{track.artist}</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </section>

        {statusMessage && (
          <div role="status" className="rounded-xl border border-[#34D399]/40 bg-[#11221B]/80 px-4 py-3 text-sm text-[#34D399] flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 shrink-0" aria-hidden="true" />
            <span>{statusMessage}</span>
          </div>
        )}

        {error && (
          <div role="alert" className="rounded-xl border border-[#F87171]/40 bg-[#2A1515]/80 px-4 py-3 text-sm text-[#FCA5A5]">
            {error}
          </div>
        )}

        <div className="overflow-x-auto rounded-2xl border border-[#2A2A32] crate-surface backdrop-blur-md shadow-[0_20px_55px_rgba(0,0,0,0.65)]">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-[#2A2A32] bg-[#18181D] text-xs font-medium text-[#A1A1AA]">
                <th className="py-3.5 px-5">Member</th>
                <th className="py-3.5 px-4">Email</th>
                <th className="py-3.5 px-4">Mobile Number</th>
                <th className="py-3.5 px-4">Password</th>
                <th className="py-3.5 px-4">Signup Date</th>
                <th className="py-3.5 px-4">Status</th>
                <th className="py-3.5 px-5 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#2A2A32]/80 text-sm">
              {loading ? (
                Array.from({ length: 4 }).map((_, i) => (
                  <tr key={i} className="animate-pulse">
                    <td className="py-4 px-5">
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-full bg-[#24242B]" />
                        <div className="h-4 w-28 rounded bg-[#24242B]" />
                      </div>
                    </td>
                    <td className="py-4 px-4"><div className="h-4 w-40 rounded bg-[#24242B]" /></td>
                    <td className="py-4 px-4"><div className="h-4 w-28 rounded bg-[#24242B]" /></td>
                    <td className="py-4 px-4"><div className="h-4 w-28 rounded bg-[#24242B]" /></td>
                    <td className="py-4 px-4"><div className="h-4 w-24 rounded bg-[#24242B]" /></td>
                    <td className="py-4 px-4"><div className="h-4 w-20 rounded bg-[#24242B]" /></td>
                    <td className="py-4 px-5 text-right"><div className="h-8 w-24 rounded bg-[#24242B] ml-auto" /></td>
                  </tr>
                ))
              ) : users.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-12 px-5 text-center text-[#A1A1AA]">
                    No members match "{query}".
                  </td>
                </tr>
              ) : (
                users.map((user) => {
                  const isOwnerAccount = isPrimaryOwnerRow(user);
                  const isPasswordRevealed = Boolean(revealedPasswords[user.id]);
                  const enteredPassword = user.password || 'Not set';
                  const formattedDate = new Date(user.created_at).toLocaleDateString('en-US', {
                    year: 'numeric',
                    month: 'short',
                    day: 'numeric',
                  });
                  return (
                    <tr
                      key={user.id}
                      className="hover:bg-[#1C1C21] transition-colors"
                    >
                      <td className="py-3.5 px-5">
                        <div className="flex items-center gap-3">
                          <img
                            src={
                              user.avatar_url ||
                              '/src/assets/images/avatar_listener_a_1794839824622.jpg'
                            }
                            alt={user.full_name || user.email}
                            referrerPolicy="no-referrer"
                            className="w-9 h-9 rounded-full object-cover border border-[#2A2A32] shrink-0"
                          />
                          <div className="min-w-0">
                            <p className="font-medium text-[#F4F4F5] truncate">
                              {user.full_name || 'Pending Onboarding'}
                            </p>
                            {user.is_admin && (
                              <span className="text-xs text-[#E8A849]">Owner</span>
                            )}
                          </div>
                        </div>
                      </td>
                      <td className="py-3.5 px-4 text-[#E4E4E7] font-mono text-xs">
                        {user.email}
                      </td>
                      <td className="py-3.5 px-4 text-[#E8A849] font-mono text-xs whitespace-nowrap">
                        {user.mobile_number || 'Not provided'}
                      </td>
                      <td className="py-3.5 px-4 whitespace-nowrap">
                        <div className="inline-flex items-center gap-2 rounded-lg border border-[#2A2A32] bg-[#09090B] px-2.5 py-1.5">
                          <span
                            className={`font-mono text-xs select-all ${
                              isPasswordRevealed
                                ? 'text-[#F4F4F5]'
                                : 'text-[#71717A] tracking-widest'
                            }`}
                          >
                            {isPasswordRevealed ? enteredPassword : '••••••••••'}
                          </span>
                          <button
                            type="button"
                            onClick={() => togglePasswordReveal(user.id)}
                            aria-label={`${
                              isPasswordRevealed ? 'Hide' : 'Show'
                            } password for ${user.full_name || user.email}`}
                            title={isPasswordRevealed ? 'Hide password' : 'Show password'}
                            className="p-1 rounded-md text-[#A1A1AA] hover:text-[#E8A849] hover:bg-[#18181D] transition-colors cursor-pointer"
                          >
                            {isPasswordRevealed ? (
                              <EyeOff className="w-3.5 h-3.5" aria-hidden="true" />
                            ) : (
                              <Eye className="w-3.5 h-3.5" aria-hidden="true" />
                            )}
                          </button>
                        </div>
                      </td>
                      <td className="py-3.5 px-4 text-[#A1A1AA] font-mono text-xs tabular-nums whitespace-nowrap">
                        {formattedDate}
                      </td>
                      <td className="py-3.5 px-4 whitespace-nowrap">
                        {user.is_approved ? (
                          <span className="inline-flex items-center gap-1.5 text-xs font-medium text-[#34D399]">
                            <CheckCircle2 className="w-3.5 h-3.5" aria-hidden="true" />
                            Approved
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1.5 text-xs font-medium text-[#E8A849]">
                            Pending
                          </span>
                        )}
                      </td>
                      <td className="py-3.5 px-5 text-right whitespace-nowrap">
                        {isOwnerAccount ? (
                          <span className="text-xs text-[#71717A]">Owner account</span>
                        ) : (
                          <div className="inline-flex items-center justify-end gap-2">
                            <button
                              type="button"
                              disabled={togglingId === user.id}
                              onClick={() => handleToggleApproval(user)}
                              aria-label={`${user.is_approved ? 'Revoke' : 'Approve'} access for ${user.full_name || user.email}`}
                              className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-all cursor-pointer whitespace-nowrap ${
                                user.is_approved
                                  ? 'border border-[#2A2A32] bg-[#18181D] text-[#A1A1AA] hover:border-[#E8A849] hover:text-[#E8A849]'
                                  : 'crate-cta shadow-[0_0_16px_rgba(232,168,73,0.22)]'
                              }`}
                            >
                              {user.is_approved ? (
                                <>
                                  <UserX className="w-3.5 h-3.5" aria-hidden="true" />
                                  Revoke
                                </>
                              ) : (
                                <>
                                  <UserCheck className="w-3.5 h-3.5" aria-hidden="true" />
                                  Approve
                                </>
                              )}
                            </button>

                            {confirmDeleteId === user.id ? (
                              <div className="inline-flex items-center gap-1">
                                <button
                                  type="button"
                                  disabled={deletingId === user.id}
                                  onClick={() => handleDeleteUser(user)}
                                  className="rounded-lg border border-[#F87171] bg-[#2A1515] px-2.5 py-1.5 text-xs font-semibold text-[#FCA5A5] hover:bg-[#F87171] hover:text-[#09090B] transition-colors cursor-pointer"
                                >
                                  {deletingId === user.id ? 'Deleting...' : 'Confirm'}
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setConfirmDeleteId(null)}
                                  className="rounded-lg border border-[#2A2A32] px-2 py-1.5 text-xs text-[#A1A1AA] hover:text-[#F4F4F5] cursor-pointer"
                                >
                                  Cancel
                                </button>
                              </div>
                            ) : (
                              <button
                                type="button"
                                onClick={() => setConfirmDeleteId(user.id)}
                                aria-label={`Delete account ${user.full_name || user.email}`}
                                title="Delete account"
                                className="inline-flex items-center gap-1 rounded-lg border border-[#2A2A32] bg-[#09090B] px-2.5 py-1.5 text-xs font-medium text-[#A1A1AA] hover:border-[#F87171]/60 hover:text-[#FCA5A5] transition-colors cursor-pointer"
                              >
                                <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
                                Delete
                              </button>
                            )}
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
