import type { Metadata, Viewport } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'EchoStand — World Cup ’26 Crowd Intelligence',
  description: 'Real-time ground-truth for FIFA World Cup 2026 venues.',
};

export const viewport: Viewport = {
  themeColor: '#060b16',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        {/* Loaded via <link> (not next/font) so builds never depend on network access;
            display=swap keeps text visible if the fonts are slow or unreachable. */}
        <link
          href="https://fonts.googleapis.com/css2?family=Bebas+Neue&family=Source+Sans+3:wght@300;400;500;600;700&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
