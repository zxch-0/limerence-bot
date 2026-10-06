import path from 'node:path';

/** @type {import('next').NextConfig} */
const nextConfig = {
  // évite le double montage qui perturbe l'instance unique du bot
  reactStrictMode: false,
  // discord.js et pg utilisent des require() dynamiques : on les laisse hors du bundle serveur
  serverExternalPackages: ['discord.js', 'pg', 'zlib-sync', 'bufferutil', 'utf-8-validate'],
  // le panel est servi derrière un proxy (preview / Render) : on autorise les origines
  allowedDevOrigins: ['*'],
  eslint: { ignoreDuringBuilds: true },
  typescript: { ignoreBuildErrors: false },
  outputFileTracingIncludes: {
    '/**': ['./data/**'],
  },
  // alias "@/*" -> "src/*" (TypeScript 7 n'utilise plus baseUrl, on le déclare aussi pour webpack)
  webpack: (config) => {
    config.resolve.alias = {
      ...(config.resolve.alias ?? {}),
      '@': path.resolve(process.cwd(), 'src'),
    };
    return config;
  },
};

export default nextConfig;
