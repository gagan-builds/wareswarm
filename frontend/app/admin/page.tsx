/**
 * Purpose: Platform Administration Dashboard for WareSwarm.
 * Role in project: Restricted console for platform admins to audit MRR, track subscriptions,
 * review plan distributions, grant complimentary plan overrides, and inspect security audit logs.
 */
'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { api } from '../../lib/api';
import { useAuth } from '../../lib/useAuth';

export default function AdminDashboardPage() {
  const router = useRouter();
  const { user, isAuthenticated, loading: authLoading } = useAuth();
  const [metrics, setMetrics] = useState<any>(null);
  const [orgs, setOrgs] = useState<any[]>([]);
  const [auditLogs, setAuditLogs] = useState<any[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [overrideModalOrg, setOverrideModalOrg] = useState<any | null>(null);
  const [targetPlan, setTargetPlan] = useState('enterprise');
  const [durationDays, setDurationDays] = useState(90);
  const [overrideReason, setOverrideReason] = useState('VIP Evaluation / Comp Account');
  const [submittingOverride, setSubmittingOverride] = useState(false);

  const loadAdminData = async () => {
    try {
      setLoading(true);
      const [m, o, a] = await Promise.all([
        api.getAdminMetrics(),
        api.getAdminOrganizations(search),
        api.getAdminAuditLogs(25),
      ]);
      setMetrics(m);
      setOrgs(o.organizations || []);
      setAuditLogs(a.audit_logs || []);
    } catch (err: any) {
      console.error('Failed to load admin data:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!authLoading && !isAuthenticated) {
      router.push('/login?redirect=/admin');
      return;
    }
    if (isAuthenticated) {
      loadAdminData();
    }
  }, [isAuthenticated, authLoading]);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    api.getAdminOrganizations(search)
      .then((res) => setOrgs(res.organizations || []))
      .catch((err) => console.error(err));
  };

  const handleApplyOverride = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!overrideModalOrg) return;

    try {
      setSubmittingOverride(true);
      await api.overrideOrgPlan(
        overrideModalOrg.id,
        targetPlan,
        Number(durationDays),
        overrideReason
      );
      alert(`Granted ${targetPlan.toUpperCase()} override to ${overrideModalOrg.name}`);
      setOverrideModalOrg(null);
      await loadAdminData();
    } catch (err: any) {
      alert(err.message || 'Failed to apply plan override');
    } finally {
      setSubmittingOverride(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-accent border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  const planDist = metrics?.plan_distribution || { free: 0, pro: 0, team: 0, enterprise: 0 };

  return (
    <div className="min-h-screen bg-background py-10 px-4 sm:px-6 lg:px-8">
      <div className="max-w-7xl mx-auto space-y-8">
        {/* Header */}
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="px-2.5 py-0.5 rounded-full bg-rose-500/20 text-rose-400 border border-rose-500/30 text-[10px] font-extrabold uppercase">
                Platform Admin
              </span>
              <span className="text-xs text-gray-400">Authenticated as @{user?.username}</span>
            </div>
            <h1 className="text-3xl font-extrabold text-white mt-1">SaaS Operations & MRR Telemetry</h1>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={loadAdminData}
              className="text-xs font-semibold px-4 py-2 rounded-xl bg-surface-2 hover:bg-gray-700 text-gray-200 transition-colors"
            >
              ↻ Refresh Telemetry
            </button>
            <Link
              href="/simulator"
              className="text-xs font-semibold px-4 py-2 rounded-xl bg-accent hover:bg-blue-500 text-white transition-colors"
            >
              Open Simulator →
            </Link>
          </div>
        </div>

        {/* Business KPIs Summary Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
          {/* MRR */}
          <div className="bg-surface border border-surface-2 rounded-3xl p-6">
            <div className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-1">
              Monthly Recurring Revenue
            </div>
            <div className="text-3xl font-black text-emerald-400">
              ${metrics?.mrr?.toFixed(2) || '0.00'}
            </div>
            <div className="text-[11px] text-gray-400 mt-2">
              Simulated from active Pro & Team subscriptions
            </div>
          </div>

          {/* Active Subscriptions */}
          <div className="bg-surface border border-surface-2 rounded-3xl p-6">
            <div className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-1">
              Active Trials
            </div>
            <div className="text-3xl font-black text-accent">
              {metrics?.active_trials || 0}
            </div>
            <div className="text-[11px] text-gray-400 mt-2">
              14-day Pro trial workspaces currently active
            </div>
          </div>

          {/* Organizations & Users */}
          <div className="bg-surface border border-surface-2 rounded-3xl p-6">
            <div className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-1">
              Organizations & Users
            </div>
            <div className="text-3xl font-black text-white">
              {metrics?.total_organizations || 0}
              <span className="text-sm font-normal text-gray-400 ml-2">
                ({metrics?.total_users || 0} users)
              </span>
            </div>
            <div className="text-[11px] text-gray-400 mt-2">
              {metrics?.churned_subscriptions || 0} churned or scheduled cancellations
            </div>
          </div>

          {/* Simulation Runs */}
          <div className="bg-surface border border-surface-2 rounded-3xl p-6">
            <div className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-1">
              Runs this Month
            </div>
            <div className="text-3xl font-black text-purple-400">
              {metrics?.runs_this_month || 0}
            </div>
            <div className="text-[11px] text-gray-400 mt-2">
              Total lifetime runs: {metrics?.total_sim_runs || 0}
            </div>
          </div>
        </div>

        {/* Plan Distribution Cards */}
        <div className="bg-surface border border-surface-2 rounded-3xl p-6 sm:p-7">
          <h2 className="text-sm font-bold text-white uppercase tracking-wider mb-4">
            Subscription Plan Breakdown
          </h2>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <div className="bg-surface-2/60 border border-gray-800 rounded-2xl p-4 text-center">
              <div className="text-xs text-gray-400 font-semibold mb-1">Free Tier</div>
              <div className="text-2xl font-black text-white">{planDist.free || 0}</div>
            </div>
            <div className="bg-surface-2/60 border border-accent/40 rounded-2xl p-4 text-center">
              <div className="text-xs text-accent font-semibold mb-1">Pro ($29/mo)</div>
              <div className="text-2xl font-black text-white">{planDist.pro || 0}</div>
            </div>
            <div className="bg-surface-2/60 border border-purple-500/40 rounded-2xl p-4 text-center">
              <div className="text-xs text-purple-400 font-semibold mb-1">Team ($99/mo)</div>
              <div className="text-2xl font-black text-white">{planDist.team || 0}</div>
            </div>
            <div className="bg-surface-2/60 border border-amber-500/40 rounded-2xl p-4 text-center">
              <div className="text-xs text-amber-400 font-semibold mb-1">Enterprise</div>
              <div className="text-2xl font-black text-white">{planDist.enterprise || 0}</div>
            </div>
          </div>
        </div>

        {/* Searchable Organizations Directory */}
        <div className="bg-surface border border-surface-2 rounded-3xl p-6 sm:p-7 overflow-x-auto">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-6">
            <h2 className="text-base font-bold text-white">Workspaces & Plan Overrides</h2>
            <form onSubmit={handleSearch} className="flex items-center gap-2 w-full sm:w-auto">
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search workspaces..."
                className="px-3 py-1.5 rounded-xl bg-surface-2 border border-gray-700 text-xs text-white placeholder-gray-500 focus:outline-none focus:border-accent"
              />
              <button
                type="submit"
                className="px-3 py-1.5 rounded-xl bg-accent text-xs font-bold text-white shadow-sm"
              >
                Search
              </button>
            </form>
          </div>

          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="border-b border-surface-2 text-gray-400 uppercase text-[10px] tracking-wider">
                <th className="py-3 px-3">Organization</th>
                <th className="py-3 px-3">Plan Tier</th>
                <th className="py-3 px-3">Status</th>
                <th className="py-3 px-3">Members</th>
                <th className="py-3 px-3">Sim Runs</th>
                <th className="py-3 px-3">Created</th>
                <th className="py-3 px-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-surface-2 text-gray-200">
              {orgs.map((org) => {
                const sub = org.subscription;
                const plan = sub?.plan || 'free';
                return (
                  <tr key={org.id}>
                    <td className="py-3 px-3">
                      <div className="font-bold text-white">{org.name}</div>
                      <div className="text-[10px] text-gray-400 font-mono">slug: {org.slug}</div>
                    </td>
                    <td className="py-3 px-3">
                      <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-surface-2 text-gray-200 border border-gray-700">
                        {plan}
                      </span>
                    </td>
                    <td className="py-3 px-3">
                      <span
                        className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                          sub?.status === 'trialing'
                            ? 'text-accent bg-accent/10 border border-accent/30'
                            : sub?.status === 'active'
                            ? 'text-emerald-400 bg-emerald-500/10 border border-emerald-500/30'
                            : 'text-gray-400 bg-gray-800 border border-gray-700'
                        }`}
                      >
                        {sub?.status || 'active'}
                      </span>
                    </td>
                    <td className="py-3 px-3">{org.user_count}</td>
                    <td className="py-3 px-3">{org.run_count}</td>
                    <td className="py-3 px-3 text-gray-400">
                      {org.created_at ? new Date(org.created_at).toLocaleDateString() : '—'}
                    </td>
                    <td className="py-3 px-3 text-right">
                      <button
                        onClick={() => setOverrideModalOrg(org)}
                        className="px-3 py-1 rounded-lg bg-surface-2 hover:bg-gray-700 text-xs font-semibold text-accent transition-colors"
                      >
                        Comp Override
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Security Audit Trail */}
        <div className="bg-surface border border-surface-2 rounded-3xl p-6 sm:p-7 overflow-x-auto">
          <h2 className="text-base font-bold text-white mb-4">Platform Security Audit Log</h2>
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="border-b border-surface-2 text-gray-400 uppercase text-[10px] tracking-wider">
                <th className="py-3 px-3">Timestamp</th>
                <th className="py-3 px-3">Action</th>
                <th className="py-3 px-3">Target</th>
                <th className="py-3 px-3">Details</th>
                <th className="py-3 px-3">IP Address</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-surface-2 text-gray-300">
              {auditLogs.map((log) => (
                <tr key={log.id}>
                  <td className="py-2.5 px-3 text-gray-400 text-[11px]">
                    {new Date(log.created_at).toLocaleString()}
                  </td>
                  <td className="py-2.5 px-3 font-mono font-bold text-accent">{log.action}</td>
                  <td className="py-2.5 px-3 font-mono text-gray-300">
                    {log.target_type}:{log.target_id}
                  </td>
                  <td className="py-2.5 px-3 font-mono text-[11px] text-gray-400 truncate max-w-xs">
                    {JSON.stringify(log.details)}
                  </td>
                  <td className="py-2.5 px-3 text-gray-500 font-mono text-[11px]">
                    {log.ip_address || 'internal'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Plan Override Modal Dialog */}
      {overrideModalOrg && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
          <div className="bg-surface border border-surface-2 rounded-3xl p-7 max-w-md w-full shadow-2xl">
            <h3 className="text-lg font-bold text-white mb-1">
              Grant Plan Override
            </h3>
            <p className="text-xs text-gray-400 mb-6">
              Workspace: <strong className="text-white">{overrideModalOrg.name}</strong>
            </p>

            <form onSubmit={handleApplyOverride} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-gray-300 mb-1.5">
                  Target Plan
                </label>
                <select
                  value={targetPlan}
                  onChange={(e) => setTargetPlan(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-surface-2 border border-gray-700 text-xs font-semibold text-white focus:outline-none focus:border-accent capitalize"
                >
                  <option value="pro">Pro ($29/mo features)</option>
                  <option value="team">Team (10 Seats & PDF reports)</option>
                  <option value="enterprise">Enterprise (Unlimited AGVs & custom)</option>
                  <option value="free">Free (Reset to baseline)</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-300 mb-1.5">
                  Duration (Days)
                </label>
                <input
                  type="number"
                  min="1"
                  max="365"
                  value={durationDays}
                  onChange={(e) => setDurationDays(Number(e.target.value))}
                  className="w-full px-3 py-2 rounded-xl bg-surface-2 border border-gray-700 text-xs text-white focus:outline-none focus:border-accent"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-300 mb-1.5">
                  Reason / Approval Note
                </label>
                <input
                  type="text"
                  required
                  value={overrideReason}
                  onChange={(e) => setOverrideReason(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-surface-2 border border-gray-700 text-xs text-white focus:outline-none focus:border-accent"
                />
              </div>

              <div className="flex items-center gap-3 pt-3">
                <button
                  type="button"
                  onClick={() => setOverrideModalOrg(null)}
                  className="flex-1 py-2.5 rounded-xl bg-surface-2 hover:bg-gray-700 text-xs font-semibold text-gray-300 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submittingOverride}
                  className="flex-1 py-2.5 rounded-xl bg-accent hover:bg-blue-500 font-bold text-xs text-white shadow-md transition-all"
                >
                  {submittingOverride ? 'Applying...' : 'Confirm Override'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
