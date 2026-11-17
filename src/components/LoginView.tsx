import React, { useState } from 'react';
import {
  ArrowRight,
  Camera,
  Eye,
  EyeOff,
  KeyRound,
  Lock,
  Mail,
  Phone,
  ShieldCheck,
  User,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { CrateLogo } from './CrateLogo';

type AuthTab = 'signin' | 'signup';

const DEFAULT_AVATAR = '/src/assets/images/avatar_listener_a_1794839824622.jpg';

export const LoginView: React.FC = () => {
  const { signInWithEmailPassword, sendMobileOtp, verifyMobileOtp } = useAuth();
  const [tab, setTab] = useState<AuthTab>('signin');

  // Shared / Sign-in / Sign-up fields
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  // Sign-up only fields
  const [fullName, setFullName] = useState('');
  const [mobileNumber, setMobileNumber] = useState('');
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [avatarPreview, setAvatarPreview] = useState(DEFAULT_AVATAR);

  // One-time Sign-up Mobile OTP state
  const [otp, setOtp] = useState('');
  const [otpStep, setOtpStep] = useState(false);
  const [dispatchedMobile, setDispatchedMobile] = useState('');
  const [devOtpHint, setDevOtpHint] = useState('');

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const handleAvatarChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setAvatarFile(file);
    setAvatarPreview(URL.createObjectURL(file));
  };

  const handleSignInSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanedEmail = email.trim();
    const cleanedPassword = password.trim();

    if (!cleanedEmail || !cleanedEmail.includes('@')) {
      setError('Enter a valid email address.');
      return;
    }
    if (!cleanedPassword) {
      setError('Enter your password.');
      return;
    }

    setError('');
    setSubmitting(true);
    const res = await signInWithEmailPassword(cleanedEmail, cleanedPassword);
    setSubmitting(false);

    if (!res.ok) {
      setError(res.error || 'Incorrect email or password.');
    }
  };

  const handleSignUpSendOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanedName = fullName.trim();
    const cleanedEmail = email.trim();
    const cleanedMobile = mobileNumber.trim();
    const cleanedPassword = password.trim();
    const digits = cleanedMobile.replace(/\D/g, '');

    if (!cleanedName) {
      setError('Enter your Full Name.');
      return;
    }
    if (!cleanedEmail || !cleanedEmail.includes('@')) {
      setError('Enter a valid email address.');
      return;
    }
    if (digits.length < 10) {
      setError('Enter a valid mobile number (at least 10 digits).');
      return;
    }
    if (!cleanedPassword) {
      setError('Create a password for your account.');
      return;
    }

    setError('');
    setSubmitting(true);
    const res = await sendMobileOtp(
      cleanedEmail,
      cleanedMobile,
      cleanedPassword,
      cleanedName,
      avatarFile
    );
    setSubmitting(false);

    if (!res.ok) {
      setError(res.error || 'Could not send OTP to your mobile number.');
      return;
    }
    setDispatchedMobile(res.mobileNumber || cleanedMobile);
    setDevOtpHint(res.devOtp || '');
    setOtpStep(true);
  };

  const handleVerifySignUpOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (otp.trim().length < 4) {
      setError('Enter the 6-digit OTP sent to your mobile number.');
      return;
    }
    setError('');
    setSubmitting(true);
    const res = await verifyMobileOtp(email.trim(), mobileNumber.trim(), otp.trim());
    setSubmitting(false);
    if (!res.ok) {
      setError(res.error || 'Invalid OTP code.');
      return;
    }
  };

  return (
    <div className="min-h-screen crate-canvas flex items-center justify-center p-6">
      <div className="w-full max-w-md rounded-2xl border border-[#2A2A32] crate-surface backdrop-blur-xl p-8 shadow-[0_24px_70px_rgba(0,0,0,0.85)]">
        <div className="flex items-center gap-3">
          <CrateLogo size="lg" shape="rounded" />
          <div>
            <h1 className="text-xl font-bold tracking-tight text-[#F4F4F5]">Crate</h1>
            <p className="text-xs text-[#A1A1AA]">Private Audio Vault · Invite Only</p>
          </div>
        </div>

        {/* Sign In / Sign Up Switcher (hidden once in one-time Sign Up OTP step) */}
        {!otpStep && (
          <div className="mt-6 grid grid-cols-2 gap-1.5 rounded-xl bg-[#09090B] p-1 border border-[#2A2A32]">
            <button
              type="button"
              onClick={() => {
                setTab('signin');
                setError('');
              }}
              className={`rounded-lg py-2 text-xs font-semibold transition-colors cursor-pointer ${
                tab === 'signin'
                  ? 'bg-[#24242B] text-[#E8A849]'
                  : 'text-[#A1A1AA] hover:text-[#F4F4F5]'
              }`}
            >
              Sign In
            </button>
            <button
              type="button"
              onClick={() => {
                setTab('signup');
                setError('');
              }}
              className={`rounded-lg py-2 text-xs font-semibold transition-colors cursor-pointer ${
                tab === 'signup'
                  ? 'bg-[#24242B] text-[#E8A849]'
                  : 'text-[#A1A1AA] hover:text-[#F4F4F5]'
              }`}
            >
              Sign Up
            </button>
          </div>
        )}

        <div className="mt-6">
          <h2 className="text-2xl font-semibold text-[#F4F4F5] tracking-tight text-balance">
            {otpStep
              ? 'Verify mobile OTP'
              : tab === 'signin'
              ? 'Sign in to Crate'
              : 'Create your Crate account'}
          </h2>
          <p className="mt-1.5 text-sm text-[#A1A1AA] leading-relaxed">
            {otpStep
              ? `Enter the one-time SMS code sent to ${dispatchedMobile} to complete sign up.`
              : tab === 'signin'
              ? 'Enter your email and password to access your account.'
              : 'Add your photo, full name, email, mobile number, and password. A one-time OTP will verify your mobile number.'}
          </p>
        </div>

        {otpStep ? (
          <form key="otp-form" onSubmit={handleVerifySignUpOtp} className="mt-6 space-y-4" noValidate>
            <div className="rounded-xl border border-[#E8A849]/35 bg-[#18181D] p-3.5 flex items-start gap-3">
              <ShieldCheck className="w-5 h-5 text-[#E8A849] shrink-0 mt-0.5" aria-hidden="true" />
              <div className="text-xs text-[#E4E4E7] space-y-1">
                <p>
                  One-time Sign Up OTP sent to{' '}
                  <span className="font-mono text-[#F4F4F5]">{dispatchedMobile}</span>
                </p>
                {devOtpHint && (
                  <p className="text-[#E8A849] font-mono">
                    SMS Preview Code:{' '}
                    <button
                      type="button"
                      onClick={() => setOtp(devOtpHint)}
                      className="underline font-semibold hover:text-[#F4F4F5] cursor-pointer"
                    >
                      {devOtpHint}
                    </button>
                  </p>
                )}
              </div>
            </div>

            <div>
              <label htmlFor="login-otp" className="block text-xs font-medium text-[#E4E4E7] mb-1.5">
                6-digit Mobile OTP
              </label>
              <div className="relative">
                <KeyRound
                  className="w-4 h-4 text-[#E8A849] absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none"
                  aria-hidden="true"
                />
                <input
                  id="login-otp"
                  type="text"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  required
                  value={otp}
                  onChange={(e) => setOtp(e.target.value)}
                  placeholder="123456"
                  className="w-full rounded-xl border border-[#2A2A32] bg-[#09090B] pl-10 pr-4 py-3 font-mono text-sm tracking-widest text-[#F4F4F5] placeholder:text-[#71717A] focus:outline-none focus:border-[#E8A849] transition-colors"
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
              <span>{submitting ? 'Verifying...' : 'Verify & Create Account'}</span>
              <ArrowRight className="w-4 h-4" aria-hidden="true" />
            </button>

            <button
              type="button"
              onClick={() => {
                setOtpStep(false);
                setOtp('');
                setDevOtpHint('');
                setError('');
              }}
              className="w-full text-xs text-[#A1A1AA] hover:text-[#E8A849] transition-colors py-1 cursor-pointer"
            >
              Edit sign up details
            </button>
          </form>
        ) : tab === 'signin' ? (
          <form key="signin-form" onSubmit={handleSignInSubmit} className="mt-6 space-y-4" noValidate>
            <div>
              <label htmlFor="login-email" className="block text-xs font-medium text-[#E4E4E7] mb-1.5">
                Email address
              </label>
              <div className="relative">
                <Mail
                  className="w-4 h-4 text-[#E8A849] absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none"
                  aria-hidden="true"
                />
                <input
                  id="login-email"
                  type="email"
                  autoComplete="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@domain.com"
                  className="w-full rounded-xl border border-[#2A2A32] bg-[#09090B] pl-10 pr-4 py-3 text-sm text-[#F4F4F5] placeholder:text-[#71717A] focus:outline-none focus:border-[#E8A849] transition-colors"
                />
              </div>
            </div>

            <div>
              <label htmlFor="login-password" className="block text-xs font-medium text-[#E4E4E7] mb-1.5">
                Password
              </label>
              <div className="relative">
                <Lock
                  className="w-4 h-4 text-[#C87D32] absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none"
                  aria-hidden="true"
                />
                <input
                  id="login-password"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="current-password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Enter your password"
                  className="w-full rounded-xl border border-[#2A2A32] bg-[#09090B] pl-10 pr-11 py-3 text-sm text-[#F4F4F5] placeholder:text-[#71717A] focus:outline-none focus:border-[#E8A849] transition-colors"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                  title={showPassword ? 'Hide password' : 'Show password'}
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
              <span>{submitting ? 'Signing in...' : 'Sign In'}</span>
              <ArrowRight className="w-4 h-4" aria-hidden="true" />
            </button>
          </form>
        ) : (
          <form key="signup-form" onSubmit={handleSignUpSendOtp} className="mt-6 space-y-4" noValidate>
            {/* 1. Profile Picture (PFP) */}
            <div className="flex items-center gap-4 rounded-xl border border-[#2A2A32] bg-[#09090B] p-3">
              <div className="w-14 h-14 rounded-full overflow-hidden border border-[#E8A849]/45 bg-[#141418] shrink-0">
                <img
                  src={avatarPreview}
                  alt="Profile picture preview"
                  referrerPolicy="no-referrer"
                  className="w-full h-full object-cover"
                />
              </div>
              <div className="min-w-0 flex-1">
                <label
                  htmlFor="signup-pfp"
                  className="inline-flex items-center gap-1.5 rounded-lg border border-[#2A2A32] bg-[#18181D] px-3 py-1.5 text-xs font-medium text-[#F4F4F5] hover:border-[#E8A849] hover:text-[#E8A849] transition-colors cursor-pointer"
                >
                  <Camera className="w-3.5 h-3.5 text-[#E8A849]" aria-hidden="true" />
                  <span>{avatarFile ? 'Change PFP' : 'Upload PFP'}</span>
                </label>
                <input
                  id="signup-pfp"
                  type="file"
                  accept="image/*"
                  onChange={handleAvatarChange}
                  className="sr-only"
                />
                <p className="mt-1 text-[11px] text-[#71717A] truncate">
                  {avatarFile ? avatarFile.name : 'Choose a profile photo for your Crate account'}
                </p>
              </div>
            </div>

            {/* 2. Full Name */}
            <div>
              <label htmlFor="signup-fullname" className="block text-xs font-medium text-[#E4E4E7] mb-1.5">
                Full Name
              </label>
              <div className="relative">
                <User
                  className="w-4 h-4 text-[#E8A849] absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none"
                  aria-hidden="true"
                />
                <input
                  id="signup-fullname"
                  type="text"
                  autoComplete="name"
                  required
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  placeholder="Aarav Mehta"
                  className="w-full rounded-xl border border-[#2A2A32] bg-[#09090B] pl-10 pr-4 py-3 text-sm text-[#F4F4F5] placeholder:text-[#71717A] focus:outline-none focus:border-[#E8A849] transition-colors"
                />
              </div>
            </div>

            {/* 3. Email */}
            <div>
              <label htmlFor="signup-email" className="block text-xs font-medium text-[#E4E4E7] mb-1.5">
                Email address
              </label>
              <div className="relative">
                <Mail
                  className="w-4 h-4 text-[#E8A849] absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none"
                  aria-hidden="true"
                />
                <input
                  id="signup-email"
                  type="email"
                  autoComplete="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@domain.com"
                  className="w-full rounded-xl border border-[#2A2A32] bg-[#09090B] pl-10 pr-4 py-3 text-sm text-[#F4F4F5] placeholder:text-[#71717A] focus:outline-none focus:border-[#E8A849] transition-colors"
                />
              </div>
            </div>

            {/* 4. Mobile Number */}
            <div>
              <label htmlFor="signup-mobile" className="block text-xs font-medium text-[#E4E4E7] mb-1.5">
                Mobile number (receives 1-time SMS OTP)
              </label>
              <div className="relative">
                <Phone
                  className="w-4 h-4 text-[#C87D32] absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none"
                  aria-hidden="true"
                />
                <input
                  id="signup-mobile"
                  type="tel"
                  autoComplete="tel"
                  required
                  value={mobileNumber}
                  onChange={(e) => setMobileNumber(e.target.value)}
                  placeholder="+91 98765 43210"
                  className="w-full rounded-xl border border-[#2A2A32] bg-[#09090B] pl-10 pr-4 py-3 text-sm text-[#F4F4F5] placeholder:text-[#71717A] focus:outline-none focus:border-[#E8A849] transition-colors"
                />
              </div>
            </div>

            {/* 5. Password */}
            <div>
              <label htmlFor="signup-password" className="block text-xs font-medium text-[#E4E4E7] mb-1.5">
                Password
              </label>
              <div className="relative">
                <Lock
                  className="w-4 h-4 text-[#E8A849] absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none"
                  aria-hidden="true"
                />
                <input
                  id="signup-password"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="new-password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Create a password"
                  className="w-full rounded-xl border border-[#2A2A32] bg-[#09090B] pl-10 pr-11 py-3 text-sm text-[#F4F4F5] placeholder:text-[#71717A] focus:outline-none focus:border-[#E8A849] transition-colors"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                  title={showPassword ? 'Hide password' : 'Show password'}
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
              <span>{submitting ? 'Sending SMS OTP...' : 'Send OTP & Sign Up'}</span>
              <ArrowRight className="w-4 h-4" aria-hidden="true" />
            </button>
          </form>
        )}
      </div>
    </div>
  );
};
