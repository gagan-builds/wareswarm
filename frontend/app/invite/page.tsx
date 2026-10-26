/**
 * Purpose: Team Invitation Acceptance Landing Page for WareSwarm.
 * Role in project: Resolves invite token and attaches authenticated user to target workspace.
 */
'use client';

import React, { useEffect, useState, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { api } from '../../lib/api';
import { useAuth } from '../../lib/useAuth';

function InviteContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get('token');
  const { isAuthenticated, loading: authLoading } = useAuth();
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successInfo, setSuccessInfo] = useState<{ org_name: string; role: string } | null>(null);

  useEffect(() => {
    if (!token) {
      setErrorMsg('No invitation token was provided in the URL.');
    }
  }, [token]);

  const handleAccept = async () => {
    if (!token) return;
    try {
      setSubmitting(true);
      setErrorMsg(null);
      const res = await api.acceptTeamInvite(token);
      setSuccessInfo({ org_name: res.org_name, role: res.role });
      setTimeout(() => {
        router.push('/simulator');
      }, 2000);
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to accept invitation. The token may be expired or invalid.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="w-full max-w-md bg-surface border border-surface-2 rounded-3xl p-8 shadow-2xl text-center">
        <div className="w-14 h-14 rounded-2xl bg-accent/20 border border-accent/40 flex items-center justify-center text-accent text-3xl font-bold mx-auto mb-4">
          👥
        </div>

        <h1 className="text-2xl font-extrabold text-white mb-2">Team Invitation</h1>
        <p className="text-xs text-gray-400 mb-6 leading-relaxed">
          You have been invited to collaborate on autonomous warehouse robot simulations in a WareSwarm workspace.
        </p>

        {errorMsg && (
          <div className="mb-6 p-4 rounded-xl bg-rose-500/10 border border-rose-500/30 text-xs text-rose-400 font-semibold">
            {errorMsg}
          </div>
        )}

        {successInfo ? (
          <div className="p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-xs text-emerald-400 font-semibold mb-6">
            🎉 Successfully joined <strong>{successInfo.org_name}</strong> as <strong>{successInfo.role}</strong>! Redirecting to simulator...
          </div>
        ) : (
          <div>
            {!isAuthenticated ? (
              <div className="space-y-4">
                <p className="text-xs text-amber-400 bg-amber-500/10 border border-amber-500/30 p-3 rounded-xl">
                  Please sign in or create an account to accept this invitation.
                </p>
                <div className="flex items-center gap-3">
                  <Link
                    href={`/login?redirect=/invite?token=${token || ''}`}
                    className="flex-1 py-3 px-4 rounded-xl bg-accent hover:bg-blue-500 font-bold text-xs text-white shadow-md transition-all"
                  >
                    Sign In
                  </Link>
                  <Link
                    href={`/signup?redirect=/invite?token=${token || ''}`}
                    className="flex-1 py-3 px-4 rounded-xl bg-surface-2 hover:bg-gray-700 font-bold text-xs text-gray-200 transition-all"
                  >
                    Sign Up
                  </Link>
                </div>
              </div>
            ) : (
              <button
                onClick={handleAccept}
                disabled={submitting || !token}
                className="w-full py-3.5 px-4 rounded-xl bg-accent hover:bg-blue-500 font-bold text-sm text-white shadow-lg shadow-accent/25 transition-all disabled:opacity-50"
              >
                {submitting ? 'Accepting Invitation...' : 'Accept & Join Workspace'}
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export default function InvitePage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-background flex items-center justify-center text-gray-400">Loading invite...</div>}>
      <InviteContent />
    </Suspense>
  );
}
