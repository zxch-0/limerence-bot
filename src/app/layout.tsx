import type { Metadata, Viewport } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Limerence — panel admin',
  description:
    'Panel d’administration du bot Discord Limerence : blueprint du serveur, confessions anonymes, annonces, modération.',
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  themeColor: '#08060f',
  width: 'device-width',
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr">
      <body className="min-h-dvh antialiased">{children}</body>
    </html>
  );
}
