import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'KZR Video Studio',
  description: 'Generate narrated explainers and debate videos from a topic.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    // suppressHydrationWarning: browser extensions (e.g. Dark Reader) add attributes to
    // <html> before React hydrates; without this that shows up as a hydration mismatch.
    <html lang="en" suppressHydrationWarning>
      <body>{children}</body>
    </html>
  );
}
