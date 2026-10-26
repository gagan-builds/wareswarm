/**
 * Purpose: Root HTML document layout and global shell for the WareSwarm frontend.
 * Role in the project: Wraps every page with HTML meta tags, global CSS styling, dark-theme classes,
 * persistent top navigation, test mode & trial banner, and global upgrade modal.
 * Talks to: frontend/app/globals.css, frontend/components/NavBar.tsx,
 * frontend/components/GlobalBanner.tsx, frontend/components/UpgradeModal.tsx.
 */

import type { Metadata } from 'next';
import './globals.css';
import NavBar from '../components/NavBar';
import GlobalBanner from '../components/GlobalBanner';
import UpgradeModal from '../components/UpgradeModal';

export const metadata: Metadata = {
  title: 'WareSwarm – Warehouse Robot Fleet Simulator',
  description: 'AI-powered swarm coordination and A* path planning for warehouse robots.',
};

/**
 * Top-level application layout wrapping all Next.js route children.
 * Mounts the dark theme background, global banner, navigation bar, and upgrade prompt modal.
 */
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark">
      <body className="min-h-screen bg-background text-white font-sans antialiased">
        <NavBar />
        <div className="pt-16">
          <GlobalBanner />
          <main>{children}</main>
        </div>
        <UpgradeModal />
      </body>
    </html>
  );
}
