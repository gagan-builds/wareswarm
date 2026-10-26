/**
 * Purpose: Workspace Team Collaboration & Seat Management page for WareSwarm.
 * Role in project: Shows workspace members, roles, seat utilization against plan limits,
 * pending invites, and dev-mode console invitation links.
 */
'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { api } from '../../../lib/api';
import type { TeamOverview, TeamMember, TeamInviteItem } from '../../../lib/types';
import { useAuth } from '../../../lib/useAuth';

export default function TeamSettingsPage() {
  const router = useRouter();
  const { user, isAuthenticated, loading: authLoading } = useAuth();
  const [team, setTeam] = useState<TeamOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState<'admin' | 'member'>('member');
  const [inviting, setInviting] = useState(false);
  const [lastInviteUrl, setLastInviteUrl] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const loadTeam = async () => {
    try {
      setLoading(true);
      const data = await api.getTeamMembers();
      setTeam(data);
    } catch (err: any) {
      console.error('Failed to load team:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!authLoading && !isAuthenticated) {
      router.push('/login?redirect=/settings/team');
      return;
    }
    if (isAuthenticated) {
      loadTeam();
    }
  }, [isAuthenticated, authLoading]);

  const handleInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inviteEmail.trim()) return;

    try {
      setInviting(true);
      setErrorMsg(null);
      const res = await api.inviteTeamMember(inviteEmail.trim(), inviteRole);
      setLastInviteUrl(res.invite_url);
      setInviteEmail('');
      await loadTeam();
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to send invite.');
    } finally {
      setInviting(false);
    }
  };

  const handleRemoveMember = async (targetUser: TeamMember) => {
    if (!confirm(`Are you sure you want to remove ${targetUser.username} (${targetUser.email}) from this workspace?`)) {
      return;
    }
    try {
      await api.removeTeamMember(targetUser.id);
      await loadTeam();
    } catch (err: any) {
      alert(err.message || 'Failed to remove member.');
    }
  };

  const handleUpdateRole = async (targetUser: TeamMember, newRole: 'admin' | 'member') => {
    try {
      await api.updateMemberRole(targetUser.id, newRole);
      await loadTeam();
    } catch (err: any) {
      alert(err.message || 'Failed to update role.');
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-accent border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  const seatsUsed = team?.seats_used ?? 1;
  const seatsLimit = team?.seats_limit ?? 1;
  const seatsFull = seatsUsed >= seatsLimit;
  const isManager = team?.current_user_role === 'owner' || team?.current_user_role === 'admin';

  return (
    <div className="min-h-screen bg-background py-10 px-4 sm:px-6 lg:px-8">
      <div className="max-w-5xl mx-auto space-y-8">
        {/* Header */}
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div>
            <h1 className="text-3xl font-extrabold text-white">Team & Workspace</h1>
            <p className="text-xs text-gray-400 mt-1">
              Organization: <strong className="text-white">{team?.organization?.name}</strong> • Your Role:{' '}
              <span className="capitalize font-bold text-accent">{team?.current_user_role}</span>
            </p>
          </div>
          <div className="flex items-center gap-3">
            <Link
              href="/settings/billing"
              className="text-xs font-semibold px-4 py-2 rounded-xl bg-surface-2 hover:bg-gray-700 text-gray-300 transition-colors"
            >
              ← Billing Settings
            </Link>
          </div>
        </div>

        {/* Seat Usage Overview Banner */}
        <div className="bg-surface border border-surface-2 rounded-3xl p-6 sm:p-7">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <div className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-1">
                Workspace Seat Quota
              </div>
              <div className="text-2xl font-black text-white">
                {seatsUsed} of {seatsLimit >= 999 ? 'Unlimited' : seatsLimit} Seats Used
              </div>
              <div className="text-xs text-gray-400 mt-1">
                {seatsLimit <= 1
                  ? 'The Free and Pro tiers include 1 team seat. Upgrade to Team tier for 10 collaborative seats.'
                  : `Your team plan allows up to ${seatsLimit} active collaborators.`}
              </div>
            </div>

            {seatsFull && seatsLimit < 10 && (
              <Link
                href="/pricing"
                className="px-5 py-2.5 rounded-xl bg-accent hover:bg-blue-500 font-bold text-xs text-white shadow-md shadow-accent/20 transition-all text-center"
              >
                Upgrade to Team (10 Seats) →
              </Link>
            )}
          </div>
        </div>

        {/* Invite New Member Box (Only for Owner or Admin) */}
        {isManager && (
          <div className="bg-surface border border-surface-2 rounded-3xl p-6 sm:p-7">
            <h2 className="text-base font-bold text-white mb-2">Invite a Collaborator</h2>
            <p className="text-xs text-gray-400 mb-6">
              Enter their email to generate a workspace invitation token. (In development mode, the invite link is generated directly below and logged to your terminal console).
            </p>

            <form onSubmit={handleInvite} className="flex flex-col sm:flex-row items-center gap-3">
              <input
                type="email"
                required
                value={inviteEmail}
                onChange={(e) => setInviteEmail(e.target.value)}
                placeholder="colleague@company.com"
                className="w-full sm:flex-1 px-4 py-2.5 rounded-xl bg-surface-2 border border-gray-700 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-accent"
              />

              <select
                value={inviteRole}
                onChange={(e) => setInviteRole(e.target.value as any)}
                className="w-full sm:w-36 px-3 py-2.5 rounded-xl bg-surface-2 border border-gray-700 text-xs font-semibold text-white focus:outline-none focus:border-accent"
              >
                <option value="member">Member</option>
                <option value="admin">Admin</option>
              </select>

              <button
                type="submit"
                disabled={inviting || seatsFull}
                className="w-full sm:w-auto px-6 py-2.5 rounded-xl bg-accent hover:bg-blue-500 font-bold text-xs text-white shadow-md transition-all disabled:opacity-50"
              >
                {inviting ? 'Generating...' : seatsFull ? 'Seat Limit Full' : 'Generate Invite'}
              </button>
            </form>

            {errorMsg && (
              <div className="mt-3 text-xs text-rose-400 font-semibold">{errorMsg}</div>
            )}

            {/* Dev Mode Generated Link Box */}
            {lastInviteUrl && (
              <div className="mt-6 p-4 rounded-2xl bg-emerald-500/10 border border-emerald-500/30">
                <div className="text-xs font-bold text-emerald-400 mb-1 flex items-center gap-2">
                  <span>✓</span> Invite Link Created (Dev Mode Logged to Console)
                </div>
                <div className="flex items-center gap-3 mt-2">
                  <input
                    type="text"
                    readOnly
                    value={lastInviteUrl}
                    className="flex-1 px-3 py-2 rounded-lg bg-surface text-xs font-mono text-gray-300 border border-gray-700 select-all"
                  />
                  <button
                    onClick={() => {
                      navigator.clipboard.writeText(lastInviteUrl);
                      alert('Copied invite link to clipboard!');
                    }}
                    className="px-3 py-2 rounded-lg bg-surface-2 hover:bg-gray-700 text-xs font-semibold text-white transition-colors"
                  >
                    Copy Link
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Members List Table */}
        <div className="bg-surface border border-surface-2 rounded-3xl p-6 sm:p-7 overflow-x-auto">
          <h2 className="text-base font-bold text-white mb-4">Workspace Members</h2>

          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="border-b border-surface-2 text-gray-400 uppercase text-[10px] tracking-wider">
                <th className="py-3 px-3">User</th>
                <th className="py-3 px-3">Email</th>
                <th className="py-3 px-3">Role</th>
                <th className="py-3 px-3">Joined Date</th>
                {isManager && <th className="py-3 px-3 text-right">Actions</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-surface-2 text-gray-200">
              {team?.members.map((m) => {
                const isOwner = m.role === 'owner';
                const isSelf = m.id === user?.id;

                return (
                  <tr key={m.id}>
                    <td className="py-3.5 px-3">
                      <div className="flex items-center gap-2.5">
                        <div className="w-7 h-7 rounded-full bg-gradient-to-tr from-accent to-emerald-400 flex items-center justify-center text-[10px] font-bold text-white uppercase">
                          {m.username.slice(0, 2)}
                        </div>
                        <div>
                          <div className="font-bold text-white flex items-center gap-1.5">
                            {m.full_name || m.username}
                            {isSelf && (
                              <span className="text-[9px] px-1.5 py-0.2 rounded bg-gray-800 text-gray-400 font-normal">
                                You
                              </span>
                            )}
                          </div>
                          <div className="text-[11px] text-gray-400">@{m.username}</div>
                        </div>
                      </div>
                    </td>
                    <td className="py-3.5 px-3 text-gray-300 font-mono text-[11px]">{m.email}</td>
                    <td className="py-3.5 px-3">
                      <span
                        className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider border ${
                          isOwner
                            ? 'bg-amber-500/10 text-amber-400 border-amber-500/30'
                            : m.role === 'admin'
                            ? 'bg-accent/10 text-accent border-accent/30'
                            : 'bg-gray-800 text-gray-300 border-gray-700'
                        }`}
                      >
                        {m.role}
                      </span>
                    </td>
                    <td className="py-3.5 px-3 text-gray-400 text-[11px]">
                      {m.created_at ? new Date(m.created_at).toLocaleDateString() : '—'}
                    </td>
                    {isManager && (
                      <td className="py-3.5 px-3 text-right">
                        {!isOwner && !isSelf && (
                          <div className="inline-flex items-center gap-2">
                            <select
                              value={m.role}
                              onChange={(e) => handleUpdateRole(m, e.target.value as any)}
                              className="px-2 py-1 rounded bg-surface-2 border border-gray-700 text-[11px] text-gray-300 focus:outline-none"
                            >
                              <option value="member">Member</option>
                              <option value="admin">Admin</option>
                            </select>
                            <button
                              onClick={() => handleRemoveMember(m)}
                              className="text-rose-400 hover:text-rose-300 text-xs font-semibold px-2 py-1"
                              title="Remove Member"
                            >
                              Remove
                            </button>
                          </div>
                        )}
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Pending Invites Table */}
        {team?.invites && team.invites.length > 0 && (
          <div className="bg-surface border border-surface-2 rounded-3xl p-6 sm:p-7 overflow-x-auto">
            <h2 className="text-base font-bold text-white mb-4">Pending Invitations</h2>

            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-b border-surface-2 text-gray-400 uppercase text-[10px] tracking-wider">
                  <th className="py-3 px-3">Invited Email</th>
                  <th className="py-3 px-3">Role</th>
                  <th className="py-3 px-3">Expires</th>
                  <th className="py-3 px-3 text-right">Invite Link</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-surface-2 text-gray-200">
                {team.invites.map((inv) => (
                  <tr key={inv.id}>
                    <td className="py-3 px-3 font-mono">{inv.email}</td>
                    <td className="py-3 px-3 capitalize font-semibold">{inv.role}</td>
                    <td className="py-3 px-3 text-gray-400">
                      {inv.expires_at ? new Date(inv.expires_at).toLocaleDateString() : '7 days'}
                    </td>
                    <td className="py-3 px-3 text-right">
                      <button
                        onClick={() => {
                          const fullUrl = `${window.location.origin}${inv.invite_url}`;
                          navigator.clipboard.writeText(fullUrl);
                          alert('Copied invite link to clipboard!');
                        }}
                        className="text-accent hover:underline font-semibold"
                      >
                        Copy Link
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
