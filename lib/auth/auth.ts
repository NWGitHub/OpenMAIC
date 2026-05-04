import NextAuth from 'next-auth';
import { PrismaAdapter } from '@auth/prisma-adapter';
import CredentialsProvider from 'next-auth/providers/credentials';
import GoogleProvider from 'next-auth/providers/google';
import GitHubProvider from 'next-auth/providers/github';
import bcrypt from 'bcryptjs';
import { prisma } from '@/lib/auth/prisma';
import { getSystemSettings } from '@/lib/server/system-settings';
import type { Role } from '@prisma/client';

// Cache user fields (role/isActive/consentGiven) for 30 s to avoid a DB hit
// on every single auth() call while still reflecting admin changes promptly.
const USER_FIELDS_CACHE = new Map<string, { role: Role; isActive: boolean; consentGiven: boolean; expiresAt: number }>();
const USER_FIELDS_TTL = 30_000;

function getCachedUserFields(id: string) {
  const entry = USER_FIELDS_CACHE.get(id);
  if (entry && entry.expiresAt > Date.now()) return entry;
  return null;
}

function setCachedUserFields(id: string, fields: { role: Role; isActive: boolean; consentGiven: boolean }) {
  USER_FIELDS_CACHE.set(id, { ...fields, expiresAt: Date.now() + USER_FIELDS_TTL });
}

export function invalidateUserFieldsCache(id: string) {
  USER_FIELDS_CACHE.delete(id);
}

export const { handlers, signIn, signOut, auth } = NextAuth({
  adapter: PrismaAdapter(prisma),
  session: { strategy: 'jwt' },
  pages: {
    signIn: '/auth/signin',
    error: '/auth/signin',
  },
  providers: [
    CredentialsProvider({
      name: 'credentials',
      credentials: {
        email: { label: 'Email', type: 'email' },
        password: { label: 'Password', type: 'password' },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) return null;

        const email = String(credentials.email).toLowerCase().trim();
        const user = await prisma.user.findUnique({ where: { email } });
        if (!user || !user.hashedPassword || !user.isActive) return null;

        // Enforce account lockout from system settings
        const settings = await getSystemSettings();
        const now = new Date();
        if (user.lockedUntil && user.lockedUntil > now) {
          // Account locked — return null without leaking the reason
          return null;
        }

        const valid = await bcrypt.compare(String(credentials.password), user.hashedPassword);
        if (!valid) {
          const newAttempts = user.failedLoginAttempts + 1;
          const shouldLock = newAttempts >= settings.maxFailedLoginAttempts;
          await prisma.user.update({
            where: { id: user.id },
            data: {
              failedLoginAttempts: newAttempts,
              lockedUntil: shouldLock
                ? new Date(now.getTime() + settings.accountLockoutMinutes * 60_000)
                : null,
            },
          });
          return null;
        }

        // Successful login — reset lockout counters
        await prisma.user.update({
          where: { id: user.id },
          data: {
            failedLoginAttempts: 0,
            lockedUntil: null,
            lastLoginAt: now,
          },
        });

        return { id: user.id, email: user.email, name: user.name, role: user.role };
      },
    }),
    ...(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET
      ? [
          GoogleProvider({
            clientId: process.env.GOOGLE_CLIENT_ID,
            clientSecret: process.env.GOOGLE_CLIENT_SECRET,
          }),
        ]
      : []),
    ...(process.env.GITHUB_CLIENT_ID && process.env.GITHUB_CLIENT_SECRET
      ? [
          GitHubProvider({
            clientId: process.env.GITHUB_CLIENT_ID,
            clientSecret: process.env.GITHUB_CLIENT_SECRET,
          }),
        ]
      : []),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id;
        token.role = (user as { role?: Role }).role ?? 'STUDENT';
        // Set session expiry from system settings
        try {
          const settings = await getSystemSettings();
          token.exp = Math.floor(Date.now() / 1000) + settings.sessionTimeoutMinutes * 60;
        } catch {
          // Keep NextAuth default expiry if settings unavailable
        }
      }
      // Refresh role/isActive/consent from DB, cached for 30 s per user
      if (token.id) {
        const userId = token.id as string;
        const cached = getCachedUserFields(userId);
        if (cached) {
          token.role = cached.role;
          token.isActive = cached.isActive;
          token.consentGiven = cached.consentGiven;
        } else {
          try {
            const dbUser = await prisma.user.findUnique({
              where: { id: userId },
              select: { role: true, isActive: true, consentGiven: true },
            });
            if (dbUser) {
              token.role = dbUser.role;
              token.isActive = dbUser.isActive;
              token.consentGiven = dbUser.consentGiven;
              setCachedUserFields(userId, dbUser);
            }
          } catch (error) {
            console.error('[auth][jwt] Failed to refresh token fields from DB:', error);
          }
        }
      }
      return token;
    },
    async session({ session, token }) {
      if (token && session.user) {
        session.user.id = (token.id as string) || session.user.id;
        session.user.role = (token.role as Role) || 'STUDENT';
        session.user.isActive = (token.isActive as boolean) ?? true;
        session.user.consentGiven = (token.consentGiven as boolean) ?? false;
      }
      return session;
    },
    async signIn({ account }) {
      // Enforce credentials-only block when enforceOAuthforNewUsers is enabled
      if (account?.provider === 'credentials') {
        try {
          const settings = await getSystemSettings();
          if (settings.enforceOAuthforNewUsers) return false;
        } catch {
          // Settings unavailable — allow credentials as safe fallback
        }
      }
      return true;
    },
    async redirect({ url, baseUrl }) {
      // Allow relative URLs and same-origin absolute URLs; reject off-origin redirects.
      if (url.startsWith('/')) return url;
      if (url.startsWith(baseUrl)) return url;
      return baseUrl;
    },
  },
  events: {
    async createUser({ user }) {
      await prisma.user.update({
        where: { id: user.id },
        data: { lastLoginAt: new Date() },
      });
    },
  },
  trustHost: true,
});
