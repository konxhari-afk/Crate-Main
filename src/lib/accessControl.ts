import type { AppRoute, UserProfile } from '../types/crate';

export interface AccessDecision {
  allowed: boolean;
  redirectTo: AppRoute | null;
  reason?: string;
}

/**
 * Pure gatekeeper logic:
 * - /owner is always reachable so the Owner Access Gate (ID + Password + Microsoft Authenticator TOTP) can authenticate independently
 * - Unauthenticated users on other routes are redirected to /login
 * - Authenticated users missing full_name are redirected to /onboarding
 * - Users with is_approved === false are redirected to /access-denied ("Waiting for Owner Approval.")
 */
export function evaluateRouteAccess(
  pathname: AppRoute,
  profile: UserProfile | null
): AccessDecision {
  if (pathname === '/owner') {
    return { allowed: true, redirectTo: null };
  }

  if (!profile) {
    if (pathname === '/login') {
      return { allowed: true, redirectTo: null };
    }
    return { allowed: false, redirectTo: '/login', reason: 'unauthenticated' };
  }

  const hasName = profile.full_name.trim().length > 0;

  if (!hasName) {
    if (pathname === '/onboarding') {
      return { allowed: true, redirectTo: null };
    }
    return { allowed: false, redirectTo: '/onboarding', reason: 'onboarding_required' };
  }

  if (!profile.is_approved) {
    if (pathname === '/access-denied') {
      return { allowed: true, redirectTo: null };
    }
    return { allowed: false, redirectTo: '/access-denied', reason: 'awaiting_approval' };
  }

  // Approved users should not stay stuck on /login, /onboarding, or /access-denied
  if (pathname === '/login' || pathname === '/onboarding' || pathname === '/access-denied') {
    return { allowed: false, redirectTo: '/', reason: 'already_approved' };
  }

  return { allowed: true, redirectTo: null };
}

export function isProtectedOwnerProfile(
  target: Pick<UserProfile, 'id' | 'email'>
): boolean {
  return (
    target.email.trim().toLowerCase() === 'hari@harvix.space' ||
    target.id === 'owner-harvix'
  );
}
