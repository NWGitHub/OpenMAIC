import { auth } from '@/lib/auth/auth';
import { NextResponse } from 'next/server';

/**
 * Route-level authentication guard.
 *
 * All /api/* routes require a valid session EXCEPT:
 *   /api/auth/**  — NextAuth sign-in / callback handlers
 *   /api/health   — liveness probe (no secrets, no data)
 *   /api/setup    — first-run admin bootstrap (guards itself internally)
 */
const PUBLIC_API_PREFIXES = ['/api/auth', '/api/health', '/api/setup'];

export default auth((req) => {
  const { pathname } = req.nextUrl;

  if (PUBLIC_API_PREFIXES.some((prefix) => pathname.startsWith(prefix))) {
    return NextResponse.next();
  }

  if (!req.auth) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  return NextResponse.next();
});

export const config = {
  matcher: ['/api/:path*'],
};
