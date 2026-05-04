import type { NextConfig } from 'next';

// ---------------------------------------------------------------------------
// Remote image patterns
//
// When S3_PUBLIC_URL is set the app serves generated classroom images from a
// CDN / public S3 bucket.  Next.js Image optimisation requires the hostname to
// be explicitly allow-listed.  We parse S3_PUBLIC_URL at build time and add it
// to the remote-patterns list so `<Image>` components work with cloud storage.
// ---------------------------------------------------------------------------

function buildRemotePatterns(): NextConfig['images'] {
  const patterns: NonNullable<NextConfig['images']>['remotePatterns'] = [];

  const publicUrl = process.env.S3_PUBLIC_URL;
  if (publicUrl) {
    try {
      const { protocol, hostname, port, pathname } = new URL(publicUrl);
      patterns.push({
        protocol: protocol.replace(':', '') as 'https' | 'http',
        hostname,
        port: port || undefined,
        pathname: pathname && pathname !== '/' ? `${pathname.replace(/\/$/, '')}/**` : '/**',
      });
    } catch {
      // Ignore malformed S3_PUBLIC_URL at build time
    }
  }

  // Allow standard AWS S3 hostnames for any region
  patterns.push({ protocol: 'https', hostname: '*.s3.amazonaws.com' });
  patterns.push({ protocol: 'https', hostname: '*.s3.*.amazonaws.com' });
  // Cloudflare R2 public buckets
  patterns.push({ protocol: 'https', hostname: '*.r2.dev' });

  return { remotePatterns: patterns };
}

const nextConfig: NextConfig = {
  output: process.env.VERCEL ? undefined : 'standalone',
  devIndicators: false,
  transpilePackages: ['mathml2omml', 'pptxgenjs'],
  serverExternalPackages: ['@prisma/client', 'bcryptjs', '@aws-sdk/client-s3', '@aws-sdk/s3-request-presigner'],
  experimental: {
    proxyClientMaxBodySize: '200mb',
  },
  images: buildRemotePatterns(),
};

export default nextConfig;
