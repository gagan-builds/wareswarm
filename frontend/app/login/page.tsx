/**
 * Purpose: Unified authentication portal supporting Sign In, Sign Up, and 1-Click Demo Guest access.
 * Role in the project: Manages user login and registration forms, authenticating credentials against the backend auth endpoints.
 * Key contents: AuthPage component, sign-in form state, sign-up form state, demo login button.
 * Talks to: frontend/lib/useAuth.ts (invokes login, signup, demoLogin), Next.js routing (useRouter).
 */

'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '../../lib/useAuth';
import clsx from 'clsx';

/**
 * Unified authentication modal/page component.
 * Allows toggling between sign-in and sign-up modes, validates form fields, and offers instant 1-click demo guest login.
 * @param {{ defaultMode?: 'signin' | 'signup' }} props Initial active tab mode.
 */
export default function AuthPage({ defaultMode = 'signin' }: any) {
  const router = useRouter();
  const { login, signup, demoLogin, isAuthenticated, user, logout } = useAuth();

  const [mode, setMode] = useState<'signin' | 'signup'>(defaultMode);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Sign In Form
  const [signInData, setSignInData] = useState({
    username_or_email: '',
    password: '',
  });

  // Sign Up Form
  const [signUpData, setSignUpData] = useState({
    full_name: '',
    username: '',
    email: '',
    password: '',
    role: 'Robotics Engineer',
  });

  const [showPassword, setShowPassword] = useState(false);

  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await login(signInData.username_or_email, signInData.password);
      setSuccess('Signed in successfully! Redirecting...');
      setTimeout(() => router.push('/simulator'), 800);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Sign in failed');
    } finally {
      setLoading(false);
    }
  };

  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await signup(signUpData);
      setSuccess('Account created successfully! Welcome to WareSwarm.');
      setTimeout(() => router.push('/simulator'), 800);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Registration failed');
    } finally {
      setLoading(false);
    }
  };

  const handleDemo = async () => {
    setError(null);
    setLoading(true);
    try {
      await demoLogin();
      setSuccess('Logged in as Demo Engineer! Redirecting...');
      setTimeout(() => router.push('/simulator'), 600);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Demo login failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-[calc(100vh-4rem)] flex items-center justify-center p-4 bg-gradient-to-b from-[#0a0e1a] via-[#0d1324] to-[#0a0e1a]">
      <div className="w-full max-w-md bg-surface border border-surface-2 rounded-3xl p-6 sm:p-8 shadow-2xl relative overflow-hidden">
        {/* Top ambient glow */}
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-48 h-2 bg-gradient-to-r from-blue-500 via-indigo-500 to-emerald-400 blur-sm rounded-full" />

        {/* Brand Header */}
        <div className="text-center mb-6">
          <Link href="/" className="inline-flex items-center gap-2 mb-2">
            <span className="text-2xl">⬡</span>
            <span className="text-2xl font-black text-white tracking-wide">WareSwarm</span>
          </Link>
          <p className="text-xs text-gray-400">
            Autonomous Warehouse Fleet Management & Path Planning Portal
          </p>
        </div>

        {/* If already logged in */}
        {isAuthenticated && user ? (
          <div className="text-center py-6 space-y-4">
            <div className="h-16 w-16 bg-gradient-to-tr from-accent to-emerald-500 rounded-full mx-auto flex items-center justify-center text-white text-2xl font-bold">
              {user.username.slice(0, 2).toUpperCase()}
            </div>
            <div>
              <p className="text-sm font-semibold text-white">{user.full_name || user.username}</p>
              <p className="text-xs text-gray-400">{user.email}</p>
              <span className="inline-block mt-2 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-blue-900/40 text-blue-300 border border-blue-700/60">
                {user.role || 'Fleet Operator'}
              </span>
            </div>
            <div className="pt-2 flex flex-col gap-2">
              <button
                onClick={() => router.push('/simulator')}
                className="w-full py-2.5 bg-accent hover:bg-blue-500 text-white font-bold text-xs rounded-xl shadow transition-colors"
              >
                Go to Simulator →
              </button>
              <button
                onClick={logout}
                className="w-full py-2 bg-surface-2 hover:bg-gray-700 text-gray-300 text-xs rounded-xl border border-gray-700 transition-colors"
              >
                Sign Out
              </button>
            </div>
          </div>
        ) : (
          <>
            {/* Tabs: Sign In vs Create Account */}
            <div className="grid grid-cols-2 p-1 bg-surface-2/80 rounded-2xl mb-6 border border-gray-700/60">
              <button
                type="button"
                onClick={() => {
                  setMode('signin');
                  setError(null);
                }}
                className={clsx(
                  'py-2 text-xs font-bold rounded-xl transition-all',
                  mode === 'signin'
                    ? 'bg-accent text-white shadow-md'
                    : 'text-gray-400 hover:text-white'
                )}
              >
                Sign In
              </button>

              <button
                type="button"
                onClick={() => {
                  setMode('signup');
                  setError(null);
                }}
                className={clsx(
                  'py-2 text-xs font-bold rounded-xl transition-all',
                  mode === 'signup'
                    ? 'bg-accent text-white shadow-md'
                    : 'text-gray-400 hover:text-white'
                )}
              >
                Create Account
              </button>
            </div>

            {/* Error or Success notification */}
            {error && (
              <div className="mb-4 p-3 rounded-xl bg-rose-950/60 border border-rose-600 text-rose-300 text-xs">
                ⚠️ {error}
              </div>
            )}
            {success && (
              <div className="mb-4 p-3 rounded-xl bg-emerald-950/60 border border-emerald-600 text-emerald-300 text-xs">
                ✓ {success}
              </div>
            )}

            {/* 1-Click Instant Demo Button */}
            <button
              type="button"
              onClick={handleDemo}
              disabled={loading}
              className="w-full mb-5 py-2.5 px-4 bg-emerald-950/40 hover:bg-emerald-900/60 border border-emerald-700/80 rounded-xl text-emerald-300 font-semibold text-xs flex items-center justify-center gap-2 shadow-sm transition-all"
            >
              <span>⚡</span>
              <span>1-Click Instant Demo Login (Lead Architect)</span>
            </button>

            <div className="relative flex py-1 items-center mb-5">
              <div className="flex-grow border-t border-gray-800"></div>
              <span className="flex-shrink mx-3 text-gray-500 text-[11px] uppercase tracking-wider">
                or continue with credentials
              </span>
              <div className="flex-grow border-t border-gray-800"></div>
            </div>

            {/* SIGN IN FORM */}
            {mode === 'signin' ? (
              <form onSubmit={handleSignIn} className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-gray-300 mb-1">
                    Username or Email
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. engineer or user@example.com"
                    value={signInData.username_or_email}
                    onChange={e =>
                      setSignInData(p => ({ ...p, username_or_email: e.target.value }))
                    }
                    className="w-full px-3.5 py-2.5 bg-surface-2 text-white text-xs rounded-xl border border-gray-700 focus:outline-none focus:border-accent"
                  />
                </div>

                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="block text-xs font-semibold text-gray-300">Password</label>
                    <button
                      type="button"
                      onClick={() => setShowPassword(p => !p)}
                      className="text-[11px] text-gray-400 hover:text-gray-200"
                    >
                      {showPassword ? 'Hide' : 'Show'}
                    </button>
                  </div>
                  <input
                    type={showPassword ? 'text' : 'password'}
                    required
                    placeholder="••••••••"
                    value={signInData.password}
                    onChange={e => setSignInData(p => ({ ...p, password: e.target.value }))}
                    className="w-full px-3.5 py-2.5 bg-surface-2 text-white text-xs rounded-xl border border-gray-700 focus:outline-none focus:border-accent"
                  />
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full py-3 bg-accent hover:bg-blue-500 text-white text-xs font-bold rounded-xl shadow-lg shadow-blue-500/20 transition-all disabled:opacity-50"
                >
                  {loading ? 'Authenticating...' : 'Sign In to Dashboard'}
                </button>
              </form>
            ) : (
              /* SIGN UP / CREATE ACCOUNT FORM */
              <form onSubmit={handleSignUp} className="space-y-3.5">
                <div>
                  <label className="block text-xs font-semibold text-gray-300 mb-1">
                    Full Name
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. Jordan Lee"
                    value={signUpData.full_name}
                    onChange={e => setSignUpData(p => ({ ...p, full_name: e.target.value }))}
                    className="w-full px-3.5 py-2 bg-surface-2 text-white text-xs rounded-xl border border-gray-700 focus:outline-none focus:border-accent"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-gray-300 mb-1">
                    Username *
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="Choose a username"
                    value={signUpData.username}
                    onChange={e => setSignUpData(p => ({ ...p, username: e.target.value }))}
                    className="w-full px-3.5 py-2 bg-surface-2 text-white text-xs rounded-xl border border-gray-700 focus:outline-none focus:border-accent"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-gray-300 mb-1">
                    Work or Student Email *
                  </label>
                  <input
                    type="email"
                    required
                    placeholder="you@domain.com"
                    value={signUpData.email}
                    onChange={e => setSignUpData(p => ({ ...p, email: e.target.value }))}
                    className="w-full px-3.5 py-2 bg-surface-2 text-white text-xs rounded-xl border border-gray-700 focus:outline-none focus:border-accent"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-gray-300 mb-1">
                    Password (min 6 characters) *
                  </label>
                  <input
                    type="password"
                    required
                    placeholder="••••••••"
                    value={signUpData.password}
                    onChange={e => setSignUpData(p => ({ ...p, password: e.target.value }))}
                    className="w-full px-3.5 py-2 bg-surface-2 text-white text-xs rounded-xl border border-gray-700 focus:outline-none focus:border-accent"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-gray-300 mb-1">Role</label>
                  <select
                    value={signUpData.role}
                    onChange={e => setSignUpData(p => ({ ...p, role: e.target.value }))}
                    className="w-full px-3.5 py-2 bg-surface-2 text-white text-xs rounded-xl border border-gray-700 focus:outline-none focus:border-accent"
                  >
                    <option value="Robotics Engineer">Robotics Engineer</option>
                    <option value="Fleet Operator">Fleet Operator</option>
                    <option value="Warehouse Operations Manager">
                      Warehouse Operations Manager
                    </option>
                    <option value="AI / Robotics Researcher">AI / Robotics Researcher</option>
                  </select>
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full mt-2 py-3 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold rounded-xl shadow-lg shadow-emerald-500/20 transition-all disabled:opacity-50"
                >
                  {loading ? 'Creating Account...' : 'Create Account & Launch'}
                </button>
              </form>
            )}
          </>
        )}
      </div>
    </div>
  );
}
