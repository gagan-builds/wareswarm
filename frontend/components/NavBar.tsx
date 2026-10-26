/**
 * Purpose: Top navigation header with site routing, brand logo, and authentication management.
 * Role in the project: Persistent navigation bar mounted across all pages in the Next.js application layout.
 * Key contents: NavBar component, navigation links list, session badge, settings dropdown, and auth triggers.
 * Talks to: frontend/lib/useAuth.ts (user session state), Next.js routing (usePathname, Link).
 */
'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useAuth } from '../lib/useAuth';
import clsx from 'clsx';

const links = [
  { href: '/', label: 'Home' },
  { href: '/simulator', label: 'Simulator' },
  { href: '/builder', label: 'Map Builder' },
  { href: '/compare', label: 'Compare' },
  { href: '/history', label: 'History' },
  { href: '/dashboard', label: 'Dashboard' },
  { href: '/pricing', label: 'Pricing' },
];

/**
 * Global application navigation header bar.
 * Renders logo branding, top-level page routes, and user authentication state.
 */
export default function NavBar() {
  const pathname = usePathname();
  const { user, isAuthenticated, logout } = useAuth();
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <nav className="fixed top-0 left-0 right-0 z-50 h-16 bg-surface/95 backdrop-blur border-b border-surface-2 flex items-center justify-between px-6">
      {/* Left: Brand & Navigation links */}
      <div className="flex items-center gap-6">
        <Link href="/" className="flex items-center gap-2 text-accent font-bold text-xl tracking-wide mr-2">
          <span>⬡</span>
          <span className="text-white font-extrabold">WareSwarm</span>
        </Link>

        <div className="hidden md:flex items-center gap-5">
          {links.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              className={clsx(
                'text-xs font-semibold tracking-wide transition-colors',
                pathname === l.href ? 'text-accent' : 'text-gray-400 hover:text-white'
              )}
            >
              {l.label}
            </Link>
          ))}
        </div>
      </div>

      {/* Right: User Authentication controls */}
      <div className="flex items-center gap-3">
        {isAuthenticated && user ? (
          <div className="relative flex items-center gap-3">
            {/* Direct Settings Links for Fast Access */}
            <div className="hidden sm:flex items-center gap-2">
              <Link
                href="/settings/billing"
                className={clsx(
                  'text-xs px-2.5 py-1 rounded-lg transition-colors font-medium',
                  pathname === '/settings/billing'
                    ? 'bg-accent/20 text-accent'
                    : 'text-gray-400 hover:text-white'
                )}
              >
                Billing
              </Link>
              <Link
                href="/settings/team"
                className={clsx(
                  'text-xs px-2.5 py-1 rounded-lg transition-colors font-medium',
                  pathname === '/settings/team'
                    ? 'bg-accent/20 text-accent'
                    : 'text-gray-400 hover:text-white'
                )}
              >
                Team
              </Link>
              <Link
                href="/settings/api"
                className={clsx(
                  'text-xs px-2.5 py-1 rounded-lg transition-colors font-medium',
                  pathname === '/settings/api'
                    ? 'bg-accent/20 text-accent'
                    : 'text-gray-400 hover:text-white'
                )}
              >
                API
              </Link>
              {user.is_platform_admin && (
                <Link
                  href="/admin"
                  className={clsx(
                    'text-xs px-2.5 py-1 rounded-lg transition-colors font-bold text-rose-400 bg-rose-500/10 border border-rose-500/30'
                  )}
                >
                  Admin
                </Link>
              )}
            </div>

            <div
              onClick={() => setMenuOpen(!menuOpen)}
              className="flex items-center gap-2 bg-surface-2/80 px-3 py-1.5 rounded-full border border-gray-700/60 cursor-pointer hover:border-gray-600 transition-all"
            >
              <div className="w-6 h-6 rounded-full bg-gradient-to-tr from-accent to-emerald-400 flex items-center justify-center text-[10px] font-bold text-white uppercase">
                {user.username.slice(0, 2)}
              </div>
              <span className="text-xs font-medium text-gray-200">
                {user.full_name || user.username}
              </span>
              <span className="text-[10px] text-gray-400">▾</span>
            </div>

            {/* Dropdown Menu */}
            {menuOpen && (
              <div
                className="absolute right-0 top-11 w-52 bg-surface border border-surface-2 rounded-2xl shadow-2xl py-2 z-50 animate-in fade-in"
                onMouseLeave={() => setMenuOpen(false)}
              >
                <div className="px-4 py-2 border-b border-surface-2 text-xs">
                  <div className="font-bold text-white truncate">{user.full_name || user.username}</div>
                  <div className="text-[11px] text-gray-400 truncate">{user.email}</div>
                </div>

                <Link
                  href="/settings/billing"
                  onClick={() => setMenuOpen(false)}
                  className="block px-4 py-2 text-xs text-gray-300 hover:bg-surface-2 hover:text-white"
                >
                  Billing & Quotas
                </Link>

                <Link
                  href="/settings/team"
                  onClick={() => setMenuOpen(false)}
                  className="block px-4 py-2 text-xs text-gray-300 hover:bg-surface-2 hover:text-white"
                >
                  Team Members
                </Link>

                <Link
                  href="/settings/api"
                  onClick={() => setMenuOpen(false)}
                  className="block px-4 py-2 text-xs text-gray-300 hover:bg-surface-2 hover:text-white"
                >
                  API Keys & Headless
                </Link>

                {user.is_platform_admin && (
                  <Link
                    href="/admin"
                    onClick={() => setMenuOpen(false)}
                    className="block px-4 py-2 text-xs text-rose-400 font-bold hover:bg-surface-2"
                  >
                    Admin Console (MRR)
                  </Link>
                )}

                <Link
                  href="/pricing"
                  onClick={() => setMenuOpen(false)}
                  className="block px-4 py-2 text-xs text-accent font-semibold hover:bg-surface-2"
                >
                  Subscription Plans
                </Link>

                <div className="border-t border-surface-2 my-1" />

                <button
                  onClick={() => {
                    setMenuOpen(false);
                    logout();
                  }}
                  className="w-full text-left px-4 py-2 text-xs text-rose-400 hover:bg-surface-2 transition-colors font-medium"
                >
                  Log Out
                </button>
              </div>
            )}
          </div>
        ) : (
          <div className="flex items-center gap-2">
            <Link
              href="/login"
              className="text-xs font-semibold text-gray-300 hover:text-white px-3 py-1.5 transition-colors"
            >
              Sign In
            </Link>

            <Link
              href="/signup"
              className="px-3.5 py-1.5 rounded-xl bg-accent hover:bg-blue-500 text-white font-bold text-xs shadow-md transition-all"
            >
              Create Account
            </Link>
          </div>
        )}
      </div>
    </nav>
  );
}
