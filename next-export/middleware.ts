import { NextResponse, type NextRequest } from 'next/server';
import { createServerClient } from '@supabase/ssr';

/**
 * Next.js App Router Gatekeeper Middleware (Reference Export)
 * - Unauthenticated users -> /login
 * - Users missing full_name -> /onboarding
 * - Users with is_approved = false -> /access-denied ("Waiting for Owner Approval.")
 * - Only users with is_admin = true may access /admin
 */
export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const publicPaths = ['/login', '/auth/callback', '/manifest.webmanifest', '/manifest.json'];
  if (publicPaths.some((p) => pathname.startsWith(p))) {
    return NextResponse.next();
  }

  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.redirect(new URL('/login', request.url));
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('full_name, is_admin, is_approved')
    .eq('id', user.id)
    .single();

  if (!profile?.full_name?.trim() && pathname !== '/onboarding') {
    return NextResponse.redirect(new URL('/onboarding', request.url));
  }

  if (!profile?.is_approved && pathname !== '/access-denied' && pathname !== '/onboarding') {
    return NextResponse.redirect(new URL('/access-denied', request.url));
  }

  if (pathname.startsWith('/admin') && !profile?.is_admin) {
    return NextResponse.redirect(new URL('/', request.url));
  }

  if (profile?.is_approved && pathname === '/access-denied') {
    return NextResponse.redirect(new URL('/', request.url));
  }

  return response;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)'],
};
