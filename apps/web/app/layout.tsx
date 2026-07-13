import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'EchoStand',
  description: 'Real-time ground-truth for FIFA World Cup 2026 venues.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
