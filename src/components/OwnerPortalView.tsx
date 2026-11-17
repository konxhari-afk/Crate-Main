import React, { useCallback, useEffect, useState } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  Check,
  Copy,
  Eye,
  EyeOff,
  KeyRound,
  Lock,
  Mail,
  QrCode,
  Shield,
  Smartphone,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { clearOwnerToken, ownerApiFetch, setOwnerToken } from '../lib/apiClient';
import { AdminView } from './AdminView';
import { CrateLogo } from './CrateLogo';

interface CredentialChallenge {
  challengeToken: string;
  account: string;
  issuer: string;
  totpEnrolled: boolean;
  manualSecret: string;
  qrDataUrl: string;
}

export const OwnerPortalView: React.FC = () => {
  const { navigate } = useAuth();
  const [checking, setChecking] = useState(true);
  const [ownerVerified, setOwnerVerified] = useState(false);

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [challenge, setChallenge] = useState<CredentialChallenge | null>(null);
  const [totpCode, setTotpCode] = useState('');
  const [showSetup, setShowSetup] = useState(false);
  const [copiedSecret, setCopiedSecret] = useState(false);

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const checkStatus = useCallback(async () => {
    setChecking(true);
    try {
      const res = await ownerApiFetch('/api/owner/status');
      if (res.ok) {
        const data = (await res.json()) as { authenticated?: boolean };
        const ok = Boolean(data.authenticated);
        if (!ok) {
          clearOwnerToken();
        }
        setOwnerVerified(ok);
      } else {
        clearOwnerToken();
        setOwnerVerified(false);
      }
    } catch {
      setOwnerVerified(false);
    } finally {
      setChecking(false);
    }
  }, []);

  useEffect(() => {
    void checkStatus();
  }, [checkStatus]);

  const handleVerifyCredentials = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanedEmail = email.trim();
    if (!cleanedEmail || !password) {
      setError('Enter both your owner ID and password.');
      return;
    }

    setError('');
    setSubmitting(true);
    try {
      const res = await ownerApiFetch('/api/owner/verify-credentials', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: cleanedEmail, password }),
      });
      const data = (await res.json()) as Partial<CredentialChallenge> & {
        ok?: boolean;
        error?: string;
      };
      if (!res.ok || !data.challengeToken || !data.qrDataUrl || !data.manualSecret) {
        setError(data.error || 'Invalid owner ID or password.');
        return;
      }
      setChallenge({
        challengeToken: data.challengeToken,
        account: data.account || cleanedEmail,
        issuer: data.issuer || 'Crate',
        totpEnrolled: Boolean(data.totpEnrolled),
        manualSecret: data.manualSecret,
        qrDataUrl: data.qrDataUrl,
      });
      setShowSetup(!data.totpEnrolled);
      setTotpCode('');
    } catch {
      setError('Unable to reach server. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleVerifyTotp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!challenge) return;
    const cleanedCode = totpCode.replace(/\s+/g, '');
    if (cleanedCode.length !== 6) {
      setError('Enter the 6-digit code from Microsoft Authenticator.');
      return;
    }

    setError('');
    setSubmitting(true);
    try {
      const res = await ownerApiFetch('/api/owner/verify-totp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          challengeToken: challenge.challengeToken,
          code: cleanedCode,
        }),
      });
      const data = (await res.json()) as {
        ok?: boolean;
        authenticated?: boolean;
        ownerToken?: string;
        sessionToken?: string;
        error?: string;
      };
      if (!res.ok || !data.authenticated) {
        setError(data.error || 'Invalid Microsoft Authenticator OTP code.');
        return;
      }
      const nextOwnerToken = data.ownerToken || data.sessionToken;
      if (nextOwnerToken) {
        setOwnerToken(nextOwnerToken);
      }
      setOwnerVerified(true);
      setChallenge(null);
      setPassword('');
      setTotpCode('');
    } catch {
      setError('Verification failed. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleOwnerLogout = async () => {
    await ownerApiFetch('/api/owner/logout', { method: 'POST' }).catch(() => {});
    clearOwnerToken();
    setOwnerVerified(false);
    setChallenge(null);
    setPassword('');
    setTotpCode('');
  };

  const handleOwnerSessionExpired = useCallback(() => {
    clearOwnerToken();
    setOwnerVerified(false);
    setChallenge(null);
    setError('Owner session expired. Verify with Microsoft Authenticator to continue.');
  }, []);

  const handleCopySecret = async () => {
    if (!challenge?.manualSecret) return;
    try {
      await navigator.clipboard.writeText(challenge.manualSecret);
      setCopiedSecret(true);
      setTimeout(() => setCopiedSecret(false), 2000);
    } catch {
      // Clipboard blocked
    }
  };

  if (checking) {
    return (
      <div className="min-h-screen crate-canvas flex items-center justify-center">
        <div className="flex items-center gap-3 text-sm text-[#E8A849]">
          <div className="w-5 h-5 rounded-full border-2 border-[#E8A849] border-t-[#2A2A32] animate-spin" />
          <span>Checking Owner Session...</span>
        </div>
      </div>
    );
  }

  if (ownerVerified) {
    return (
      <AdminView
        onOwnerLogout={handleOwnerLogout}
        onSessionExpired={handleOwnerSessionExpired}
      />
    );
  }

  return (
    <div className="min-h-screen crate-canvas flex items-center justify-center p-6">
      <div className="w-full max-w-md rounded-2xl border border-[#2A2A32] crate-surface backdrop-blur-xl p-8 shadow-[0_24px_70px_rgba(0,0,0,0.85)]">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <CrateLogo size="lg" shape="rounded" />
            <div>
              <h1 className="text-lg font-bold tracking-tight bg-gradient-to-r from-[#F4F4F5] via-[#F3BC65] to-[#C87D32] bg-clip-text text-transparent">
                Crate Owner Portal
              </h1>
              <p className="text-xs text-[#A1A1AA]">Microsoft Authenticator Protected</p>
            </div>
          </div>

          <button
            type="button"
            onClick={() => navigate('/')}
            className="inline-flex items-center gap-1.5 text-xs font-medium text-[#A1A1AA] hover:text-[#E8A849] transition-colors cursor-pointer"
          >
            <ArrowLeft className="w-3.5 h-3.5" aria-hidden="true" />
            Crate
          </button>
        </div>

        <div className="mt-7">
          <h2 className="text-2xl font-semibold text-[#F4F4F5] tracking-tight">
            {challenge ? 'Microsoft Authenticator' : 'Verify Owner Identity'}
          </h2>
          <p className="mt-1.5 text-sm text-[#A1A1AA] leading-relaxed">
            {challenge
              ? `Enter the 6-digit code from Microsoft Authenticator for ${challenge.account}.`
              : 'Enter your owner ID and password to unlock the management panel.'}
          </p>
        </div>

        {!challenge ? (
          <form onSubmit={handleVerifyCredentials} className="mt-6 space-y-4" noValidate>
            <div>
              <label htmlFor="owner-id-input" className="block text-xs font-medium text-[#E4E4E7] mb-1.5">
                Owner ID
              </label>
              <div className="relative">
                <Mail
                  className="w-4 h-4 text-[#E8A849] absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none"
                  aria-hidden="true"
                />
                <input
                  id="owner-id-input"
                  type="email"
                  autoComplete="username"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="hari@harvix.space"
                  className="w-full rounded-xl border border-[#2A2A32] bg-[#09090B] pl-10 pr-4 py-3 text-sm text-[#F4F4F5] placeholder:text-[#71717A] focus:outline-none focus:border-[#E8A849] transition-colors"
                />
              </div>
            </div>

            <div>
              <label htmlFor="owner-password-input" className="block text-xs font-medium text-[#E4E4E7] mb-1.5">
                Password
              </label>
              <div className="relative">
                <Lock
                  className="w-4 h-4 text-[#C87D32] absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none"
                  aria-hidden="true"
                />
                <input
                  id="owner-password-input"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="current-password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Enter owner password"
                  className="w-full rounded-xl border border-[#2A2A32] bg-[#09090B] pl-10 pr-11 py-3 text-sm text-[#F4F4F5] placeholder:text-[#71717A] focus:outline-none focus:border-[#E8A849] transition-colors"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-[#A1A1AA] hover:text-[#E8A849] transition-colors cursor-pointer"
                >
                  {showPassword ? (
                    <EyeOff className="w-4 h-4" aria-hidden="true" />
                  ) : (
                    <Eye className="w-4 h-4" aria-hidden="true" />
                  )}
                </button>
              </div>
            </div>

            {error && (
              <p role="alert" className="text-xs text-[#FCA5A5]">
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={submitting}
              className="w-full flex items-center justify-center gap-2 rounded-xl crate-cta px-4 py-3 text-sm font-semibold shadow-[0_0_24px_rgba(232,168,73,0.24)] disabled:opacity-60 transition-all cursor-pointer"
            >
              <span>{submitting ? 'Checking credentials...' : 'Continue to Authenticator'}</span>
              <ArrowRight className="w-4 h-4" aria-hidden="true" />
            </button>
          </form>
        ) : (
          <form onSubmit={handleVerifyTotp} className="mt-6 space-y-4" noValidate>
            <div className="rounded-xl border border-[#E8A849]/35 bg-[#18181D] p-3.5 space-y-2.5">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2.5 min-w-0">
                  <Smartphone className="w-4 h-4 text-[#E8A849] shrink-0" aria-hidden="true" />
                  <span className="text-xs text-[#E4E4E7] font-mono truncate">
                    {challenge.account}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => setShowSetup((v) => !v)}
                  className="inline-flex items-center gap-1.5 text-xs font-medium text-[#E8A849] hover:text-[#F3BC65] transition-colors shrink-0 cursor-pointer"
                >
                  <QrCode className="w-3.5 h-3.5" aria-hidden="true" />
                  {showSetup ? 'Hide QR' : 'Pair App'}
                </button>
              </div>

              <div className="flex items-center justify-between gap-2 pt-2 border-t border-[#2A2A32]">
                <div className="flex items-center gap-2 min-w-0">
                  <Lock className="w-3.5 h-3.5 text-[#C87D32] shrink-0" aria-hidden="true" />
                  <span className="text-[11px] text-[#A1A1AA]">Entered Password:</span>
                  <span className="font-mono text-xs text-[#F4F4F5] truncate">
                    {showPassword ? password : '••••••••••'}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  aria-label={showPassword ? 'Hide entered password' : 'Show entered password'}
                  title={showPassword ? 'Hide entered password' : 'Show entered password'}
                  className="p-1 rounded-md border border-[#2A2A32] bg-[#09090B] text-[#A1A1AA] hover:text-[#E8A849] hover:border-[#E8A849]/50 transition-colors cursor-pointer shrink-0"
                >
                  {showPassword ? (
                    <EyeOff className="w-3.5 h-3.5" aria-hidden="true" />
                  ) : (
                    <Eye className="w-3.5 h-3.5" aria-hidden="true" />
                  )}
                </button>
              </div>
            </div>

            {showSetup && (
              <div className="rounded-xl border border-[#2A2A32] bg-[#09090B] p-4 space-y-3">
                <p className="text-xs text-[#A1A1AA] leading-relaxed">
                  Open <span className="text-[#F4F4F5] font-medium">Microsoft Authenticator</span> →{' '}
                  <span className="text-[#F4F4F5]">+</span> →{' '}
                  <span className="text-[#F4F4F5]">Other account</span> → Scan QR or enter the key below.
                </p>
                <div className="flex flex-col sm:flex-row items-center gap-4">
                  <img
                    src={challenge.qrDataUrl}
                    alt="Microsoft Authenticator QR Code"
                    className="w-28 h-28 rounded-lg border border-[#E8A849]/40 bg-[#F5EFE6] p-1 shrink-0"
                  />
                  <div className="min-w-0 flex-1 w-full space-y-2">
                    <div>
                      <p className="text-[11px] text-[#71717A]">Account</p>
                      <p className="text-xs font-mono text-[#F4F4F5] truncate">{challenge.account}</p>
                    </div>
                    <div>
                      <p className="text-[11px] text-[#71717A]">Setup Key (Time-based)</p>
                      <div className="flex items-center gap-2 mt-0.5">
                        <code className="text-[11px] font-mono text-[#E8A849] bg-[#141418] border border-[#2A2A32] rounded px-2 py-1 break-all flex-1">
                          {challenge.manualSecret}
                        </code>
                        <button
                          type="button"
                          onClick={handleCopySecret}
                          aria-label="Copy setup key"
                          className="p-1.5 rounded-lg border border-[#2A2A32] bg-[#141418] text-[#E8A849] hover:border-[#E8A849] transition-colors cursor-pointer shrink-0"
                        >
                          {copiedSecret ? (
                            <Check className="w-3.5 h-3.5" aria-hidden="true" />
                          ) : (
                            <Copy className="w-3.5 h-3.5" aria-hidden="true" />
                          )}
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}

            <div>
              <label htmlFor="owner-totp-input" className="block text-xs font-medium text-[#E4E4E7] mb-1.5">
                6-digit Microsoft Authenticator OTP
              </label>
              <div className="relative">
                <KeyRound
                  className="w-4 h-4 text-[#E8A849] absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none"
                  aria-hidden="true"
                />
                <input
                  id="owner-totp-input"
                  type="text"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  maxLength={6}
                  required
                  value={totpCode}
                  onChange={(e) => setTotpCode(e.target.value.replace(/\D/g, ''))}
                  placeholder="000000"
                  className="w-full rounded-xl border border-[#2A2A32] bg-[#09090B] pl-10 pr-4 py-3 font-mono text-base tracking-[0.28em] text-[#F4F4F5] placeholder:text-[#71717A] focus:outline-none focus:border-[#E8A849] transition-colors"
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
              disabled={submitting}
              className="w-full flex items-center justify-center gap-2 rounded-xl crate-cta px-4 py-3 text-sm font-semibold shadow-[0_0_24px_rgba(232,168,73,0.24)] disabled:opacity-60 transition-all cursor-pointer"
            >
              <span>{submitting ? 'Verifying OTP...' : 'Verify & Open Panel'}</span>
              <ArrowRight className="w-4 h-4" aria-hidden="true" />
            </button>

            <button
              type="button"
              onClick={() => {
                setChallenge(null);
                setTotpCode('');
                setError('');
              }}
              className="w-full text-xs text-[#A1A1AA] hover:text-[#E8A849] transition-colors py-1 cursor-pointer"
            >
              Use different credentials
            </button>
          </form>
        )}
      </div>
    </div>
  );
};
