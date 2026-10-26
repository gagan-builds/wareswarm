/**
 * Purpose: Billing & Subscription Management page for WareSwarm.
 * Role in project: Shows current plan, trial countdown, usage meters with 80%/100% threshold color shifts,
 * invoice history, coupon redemption, and test mode simulation actions.
 */
'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { api } from '../../../lib/api';
import type { SubscriptionInfo, UsageSummary, InvoiceItem } from '../../../lib/types';
import { useAuth } from '../../../lib/useAuth';

export default function BillingSettingsPage() {
  const router = useRouter();
  const { isAuthenticated, loading: authLoading } = useAuth();
  const [subInfo, setSubInfo] = useState<SubscriptionInfo | null>(null);
  const [usage, setUsage] = useState<UsageSummary | null>(null);
  const [invoices, setInvoices] = useState<InvoiceItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [couponCode, setCouponCode] = useState('');
  const [couponStatus, setCouponStatus] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  const loadBillingData = async () => {
    try {
      setLoading(true);
      const [subData, usageData, invData] = await Promise.all([
        api.getSubscription().catch(() => null),
        api.getUsage().catch(() => null),
        api.getInvoices().catch(() => ({ invoices: [] })),
      ]);
      if (subData) setSubInfo(subData);
      if (usageData) setUsage(usageData);
      const list = Array.isArray(invData) ? invData : (invData?.invoices || []);
      setInvoices(list);
    } catch (err: any) {
      console.error('Failed to load billing data:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!authLoading && !isAuthenticated) {
      router.push('/login?redirect=/settings/billing');
      return;
    }
    if (isAuthenticated) {
      loadBillingData();
    }
  }, [isAuthenticated, authLoading]);

  const handleCancel = async () => {
    if (!confirm('Are you sure you want to cancel your subscription at the end of the current billing period? Your data will remain safe.')) {
      return;
    }
    try {
      setActionLoading('cancel');
      await api.cancelSubscription();
      await loadBillingData();
      alert('Subscription canceled at period end. You retain full access until then.');
    } catch (err: any) {
      alert(err.message || 'Failed to cancel subscription.');
    } finally {
      setActionLoading(null);
    }
  };

  const handleResume = async () => {
    try {
      setActionLoading('resume');
      await api.resumeSubscription();
      await loadBillingData();
      alert('Subscription resumed successfully.');
    } catch (err: any) {
      alert(err.message || 'Failed to resume subscription.');
    } finally {
      setActionLoading(null);
    }
  };

  const handleApplyCoupon = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!couponCode.trim()) return;
    try {
      setCouponStatus('Validating coupon...');
      // Start a checkout with the coupon
      const res = await api.createCheckout(subInfo?.subscription.plan || 'pro', 'month', couponCode.trim());
      setCouponStatus('Coupon applied successfully! Proceeding to test checkout...');
      if (res.checkout_url) {
        if (res.checkout_url.startsWith('http')) {
          window.location.href = res.checkout_url;
        } else {
          router.push(res.checkout_url);
        }
      }
    } catch (err: any) {
      setCouponStatus(`Error: ${err.message || 'Invalid coupon code'}`);
    }
  };

  const handleMockAction = async (action: string) => {
    try {
      setActionLoading(action);
      await api.triggerMockAction(action);
      await loadBillingData();
      alert(`Simulation action '${action}' completed.`);
    } catch (err: any) {
      alert(`Action failed: ${err.message}`);
    } finally {
      setActionLoading(null);
    }
  };

  const getMeterColor = (pct: number) => {
    if (pct >= 100) return 'bg-rose-500 shadow-rose-500/50';
    if (pct >= 80) return 'bg-amber-500 shadow-amber-500/50';
    return 'bg-accent shadow-accent/50';
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-accent border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  const sub = subInfo?.subscription;
  const plan = sub?.plan || 'free';
  const isTrial = sub?.status === 'trialing';
  const isPastDue = sub?.status === 'past_due';

  return (
    <div className="min-h-screen bg-background py-10 px-4 sm:px-6 lg:px-8">
      <div className="max-w-6xl mx-auto space-y-8">
        {/* Test Mode Banner */}
        <div className="bg-amber-500/10 border border-amber-500/30 rounded-2xl p-4 flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-3">
            <span className="text-2xl">💳</span>
            <div>
              <div className="text-sm font-bold text-amber-400">
                Test Mode — No Real Charges
              </div>
              <div className="text-xs text-gray-300">
                All subscriptions, mock invoices, and trial states run in test mode. Never enter real credit cards.
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs px-2.5 py-1 rounded-full bg-surface-2 text-gray-300 font-mono">
              Provider: {subInfo?.provider || 'mock'}
            </span>
          </div>
        </div>

        {/* Page Title & Navigation */}
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div>
            <h1 className="text-3xl font-extrabold text-white">Billing & Subscription</h1>
            <p className="text-xs text-gray-400 mt-1">
              Workspace: <strong className="text-white">{subInfo?.organization?.name}</strong>
            </p>
          </div>
          <div className="flex items-center gap-3">
            <Link
              href="/settings/team"
              className="text-xs font-semibold px-4 py-2 rounded-xl bg-surface-2 hover:bg-gray-700 text-gray-300 transition-colors"
            >
              Team Settings →
            </Link>
            <Link
              href="/pricing"
              className="text-xs font-bold px-4 py-2 rounded-xl bg-accent hover:bg-blue-500 text-white shadow-md shadow-accent/20 transition-all"
            >
              Compare All Plans
            </Link>
          </div>
        </div>

        {/* Plan Overview Card */}
        <div className="bg-surface border border-surface-2 rounded-3xl p-6 sm:p-8">
          <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-6 pb-6 border-b border-surface-2">
            <div>
              <div className="flex items-center gap-3 mb-2">
                <span className="text-2xl font-black text-white uppercase tracking-wider">
                  {plan} Tier
                </span>
                <span
                  className={`px-3 py-0.5 rounded-full text-[11px] font-bold uppercase tracking-wider border ${
                    isTrial
                      ? 'bg-accent/20 text-accent border-accent/40'
                      : isPastDue
                      ? 'bg-rose-500/20 text-rose-400 border-rose-500/40'
                      : sub?.status === 'active'
                      ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/40'
                      : 'bg-gray-800 text-gray-400 border-gray-700'
                  }`}
                >
                  {sub?.status || 'active'}
                </span>
                {sub?.cancel_at_period_end && (
                  <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/20 text-amber-400 border border-amber-500/40">
                    Cancels at period end
                  </span>
                )}
              </div>

              {isTrial && (
                <div className="text-sm font-semibold text-accent flex items-center gap-2">
                  <span>⚡</span>
                  <span>
                    14-Day Free Pro Trial: <strong>{subInfo?.trial_days_remaining ?? 14} days remaining</strong>
                  </span>
                </div>
              )}

              {isPastDue && (
                <div className="text-sm font-semibold text-rose-400 flex items-center gap-2">
                  <span>⚠️</span>
                  <span>
                    Payment past due. <strong>{subInfo?.grace_days_remaining ?? 7} days remaining</strong> before fallback to Free.
                  </span>
                </div>
              )}

              <div className="text-xs text-gray-400 mt-2">
                Billing Interval:{' '}
                <strong className="text-gray-200 capitalize">{sub?.billing_interval || 'monthly'}</strong>
                {sub?.current_period_end && (
                  <>
                    {' '}• Next renewal date:{' '}
                    <strong className="text-gray-200">
                      {new Date(sub.current_period_end).toLocaleDateString()}
                    </strong>
                  </>
                )}
              </div>
            </div>

            {/* Plan Action Buttons */}
            <div className="flex items-center gap-3 flex-wrap">
              {plan === 'free' ? (
                <Link
                  href="/pricing"
                  className="px-5 py-2.5 rounded-xl bg-accent hover:bg-blue-500 text-white font-bold text-xs shadow-md transition-all"
                >
                  Upgrade to Pro
                </Link>
              ) : sub?.cancel_at_period_end ? (
                <button
                  onClick={handleResume}
                  disabled={actionLoading !== null}
                  className="px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs shadow-md transition-all"
                >
                  {actionLoading === 'resume' ? 'Resuming...' : 'Resume Subscription'}
                </button>
              ) : (
                <>
                  <Link
                    href="/pricing"
                    className="px-4 py-2.5 rounded-xl bg-surface-2 hover:bg-gray-700 text-gray-200 font-semibold text-xs transition-colors"
                  >
                    Change Plan
                  </Link>
                  <button
                    onClick={handleCancel}
                    disabled={actionLoading !== null}
                    className="px-4 py-2.5 rounded-xl border border-rose-500/40 text-rose-400 hover:bg-rose-500/10 font-semibold text-xs transition-colors"
                  >
                    {actionLoading === 'cancel' ? 'Canceling...' : 'Cancel at Period End'}
                  </button>
                </>
              )}
            </div>
          </div>

          {/* Usage Meters */}
          {(() => {
            const rawMeters = (usage as any)?.meters || {};
            const simRuns = rawMeters.simulation_runs || {};
            const robots = rawMeters.robots_per_sim || rawMeters.robots || {};
            const maps = rawMeters.saved_maps || {};
            const apiCalls = rawMeters.api_calls || {};

            const simPct = Number(simRuns.percentage ?? simRuns.pct ?? 0);
            const simUsed = Number(simRuns.used ?? 0);
            const simMax = simRuns.unlimited || simRuns.max === -1 ? 'Unlimited' : (simRuns.max ?? simRuns.limit ?? 50);

            const robPct = Number(robots.percentage ?? robots.pct ?? 100);
            const robUsed = Number(robots.used ?? 5);
            const robMax = robots.unlimited || robots.max === -1 ? 'Unlimited' : (robots.max ?? robots.limit ?? 5);

            const mapPct = Number(maps.percentage ?? maps.pct ?? 0);
            const mapUsed = Number(maps.used ?? 0);
            const mapMax = maps.unlimited || maps.max === -1 ? 'Unlimited' : (maps.max ?? maps.limit ?? 1);

            const apiPct = Number(apiCalls.percentage ?? apiCalls.pct ?? 0);
            const apiUsed = Number(apiCalls.used ?? 0);
            const apiMax = apiCalls.unlimited || apiCalls.max === -1 ? 'Unlimited' : (apiCalls.max ?? apiCalls.limit ?? 'Locked');

            return (
              <div className="mt-8">
                <h3 className="text-sm font-bold text-gray-200 uppercase tracking-wider mb-6">
                  Monthly Usage & Plan Limits
                </h3>

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
                  {/* Simulation Runs */}
                  <div className="bg-surface-2/60 rounded-2xl p-5 border border-gray-800">
                    <div className="flex items-center justify-between text-xs mb-2">
                      <span className="font-semibold text-gray-300">Sim Runs this Month</span>
                      <span className="text-[11px] font-bold text-gray-400">
                        {simPct}%
                      </span>
                    </div>
                    <div className="text-2xl font-black text-white mb-2">
                      {simUsed}
                      <span className="text-xs text-gray-400 font-normal ml-1">
                        / {simMax}
                      </span>
                    </div>
                    <div className="w-full h-2 rounded-full bg-gray-800 overflow-hidden">
                      <div
                        className={`h-full transition-all duration-500 ${getMeterColor(simPct)}`}
                        style={{ width: `${Math.min(simPct, 100)}%` }}
                      />
                    </div>
                  </div>

                  {/* Robots Fleet Limit */}
                  <div className="bg-surface-2/60 rounded-2xl p-5 border border-gray-800">
                    <div className="flex items-center justify-between text-xs mb-2">
                      <span className="font-semibold text-gray-300">Robots per Simulation</span>
                      <span className="text-[11px] font-bold text-gray-400">
                        {robPct}%
                      </span>
                    </div>
                    <div className="text-2xl font-black text-white mb-2">
                      {robUsed}
                      <span className="text-xs text-gray-400 font-normal ml-1">
                        / {robMax} max
                      </span>
                    </div>
                    <div className="w-full h-2 rounded-full bg-gray-800 overflow-hidden">
                      <div
                        className={`h-full transition-all duration-500 ${getMeterColor(robPct)}`}
                        style={{ width: `${Math.min(robPct, 100)}%` }}
                      />
                    </div>
                  </div>

                  {/* Saved Custom Maps */}
                  <div className="bg-surface-2/60 rounded-2xl p-5 border border-gray-800">
                    <div className="flex items-center justify-between text-xs mb-2">
                      <span className="font-semibold text-gray-300">Saved Custom Maps</span>
                      <span className="text-[11px] font-bold text-gray-400">
                        {mapPct}%
                      </span>
                    </div>
                    <div className="text-2xl font-black text-white mb-2">
                      {mapUsed}
                      <span className="text-xs text-gray-400 font-normal ml-1">
                        / {mapMax}
                      </span>
                    </div>
                    <div className="w-full h-2 rounded-full bg-gray-800 overflow-hidden">
                      <div
                        className={`h-full transition-all duration-500 ${getMeterColor(mapPct)}`}
                        style={{ width: `${Math.min(mapPct, 100)}%` }}
                      />
                    </div>
                  </div>

                  {/* API Calls */}
                  <div className="bg-surface-2/60 rounded-2xl p-5 border border-gray-800">
                    <div className="flex items-center justify-between text-xs mb-2">
                      <span className="font-semibold text-gray-300">API Calls this Month</span>
                      <span className="text-[11px] font-bold text-gray-400">
                        {apiPct}%
                      </span>
                    </div>
                    <div className="text-2xl font-black text-white mb-2">
                      {apiUsed}
                      <span className="text-xs text-gray-400 font-normal ml-1">
                        / {apiMax}
                      </span>
                    </div>
                    <div className="w-full h-2 rounded-full bg-gray-800 overflow-hidden">
                      <div
                        className={`h-full transition-all duration-500 ${getMeterColor(apiPct)}`}
                        style={{ width: `${Math.min(apiPct, 100)}%` }}
                      />
                    </div>
                  </div>
                </div>

                <div className="mt-4 flex items-center justify-between text-[11px] text-gray-400">
                  <div className="flex items-center gap-4">
                    <span className="flex items-center gap-1.5">
                      <span className="w-2 h-2 rounded-full bg-accent" /> Normal (&lt;80%)
                    </span>
                    <span className="flex items-center gap-1.5">
                      <span className="w-2 h-2 rounded-full bg-amber-500" /> Approaching Limit (≥80%)
                    </span>
                    <span className="flex items-center gap-1.5">
                      <span className="w-2 h-2 rounded-full bg-rose-500" /> Limit Reached (100%)
                    </span>
                  </div>
                  <div>Usage counters reset automatically on the 1st of each month.</div>
                </div>
              </div>
            );
          })()}
        </div>

        {/* Promo Coupon Redemption */}
        <div className="bg-surface border border-surface-2 rounded-3xl p-6 sm:p-8">
          <h3 className="text-sm font-bold text-white uppercase tracking-wider mb-2">
            Redeem Promo Coupon
          </h3>
          <p className="text-xs text-gray-400 mb-4">
            Have a discount code? Enter it below to apply savings to your subscription checkout. (Try test coupon <code className="text-accent bg-accent/10 px-1 py-0.5 rounded font-mono">LAUNCH50</code> for 50% off).
          </p>
          <form onSubmit={handleApplyCoupon} className="flex items-center gap-3 max-w-md">
            <input
              type="text"
              value={couponCode}
              onChange={(e) => setCouponCode(e.target.value.toUpperCase())}
              placeholder="e.g. LAUNCH50"
              className="flex-1 px-4 py-2 rounded-xl bg-surface-2 border border-gray-700 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-accent uppercase font-mono"
            />
            <button
              type="submit"
              className="px-4 py-2 rounded-xl bg-accent hover:bg-blue-500 font-bold text-xs text-white shadow-md transition-all"
            >
              Apply Code
            </button>
          </form>
          {couponStatus && (
            <div className="mt-3 text-xs text-gray-300">{couponStatus}</div>
          )}
        </div>

        {/* Invoice History */}
        <div className="bg-surface border border-surface-2 rounded-3xl p-6 sm:p-8 overflow-x-auto">
          <h3 className="text-sm font-bold text-white uppercase tracking-wider mb-4">
            Invoice & Receipt History
          </h3>

          {invoices.length === 0 ? (
            <div className="text-xs text-gray-400 py-6 text-center">
              No invoices generated yet. Test invoices will appear here after subscription checkouts.
            </div>
          ) : (
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-b border-surface-2 text-gray-400 uppercase text-[10px] tracking-wider">
                  <th className="py-3 px-3">Invoice ID</th>
                  <th className="py-3 px-3">Date</th>
                  <th className="py-3 px-3">Period</th>
                  <th className="py-3 px-3">Amount</th>
                  <th className="py-3 px-3">Status</th>
                  <th className="py-3 px-3 text-right">Receipt</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-surface-2 text-gray-200">
                {invoices.map((inv) => (
                  <tr key={inv.id}>
                    <td className="py-3 px-3 font-mono text-gray-400">
                      {inv.provider_invoice_id || `#INV-${inv.id}`}
                    </td>
                    <td className="py-3 px-3">
                      {new Date(inv.created_at).toLocaleDateString()}
                    </td>
                    <td className="py-3 px-3">{inv.period}</td>
                    <td className="py-3 px-3 font-bold">${inv.amount.toFixed(2)} {inv.currency.toUpperCase()}</td>
                    <td className="py-3 px-3">
                      <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 uppercase">
                        {inv.status}
                      </span>
                    </td>
                    <td className="py-3 px-3 text-right">
                      {inv.pdf_url ? (
                        <a
                          href={inv.pdf_url}
                          target="_blank"
                          rel="noreferrer"
                          className="text-accent hover:underline font-semibold"
                        >
                          Download PDF
                        </a>
                      ) : (
                        <span className="text-gray-500">Simulated</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* Viva / QA Simulation Testing Control Box */}
        <div className="bg-surface-2/40 border border-gray-800 rounded-3xl p-6 sm:p-8">
          <div className="flex items-center gap-2 mb-2">
            <span className="text-lg">🛠️</span>
            <h3 className="text-sm font-bold text-white uppercase tracking-wider">
              Test Mode Simulation Controls (Examiner / QA Panel)
            </h3>
          </div>
          <p className="text-xs text-gray-400 mb-6">
            Easily trigger billing lifecycle events without waiting weeks. Test renewal cycles, simulated payment failures with 7-day grace periods, and trial expirations.
          </p>

          <div className="flex flex-wrap gap-3">
            <button
              onClick={() => handleMockAction('simulate_payment_success')}
              disabled={actionLoading !== null}
              className="px-4 py-2 rounded-xl bg-surface hover:bg-gray-700 text-xs text-emerald-400 font-semibold border border-emerald-500/30 transition-all"
            >
              Simulate Payment Success ($29)
            </button>
            <button
              onClick={() => handleMockAction('simulate_payment_failure')}
              disabled={actionLoading !== null}
              className="px-4 py-2 rounded-xl bg-surface hover:bg-gray-700 text-xs text-rose-400 font-semibold border border-rose-500/30 transition-all"
            >
              Simulate Payment Failure (Enter Past Due)
            </button>
            <button
              onClick={() => handleMockAction('simulate_renewal')}
              disabled={actionLoading !== null}
              className="px-4 py-2 rounded-xl bg-surface hover:bg-gray-700 text-xs text-blue-400 font-semibold border border-blue-500/30 transition-all"
            >
              Simulate Monthly Renewal
            </button>
            <button
              onClick={() => handleMockAction('simulate_trial_expired')}
              disabled={actionLoading !== null}
              className="px-4 py-2 rounded-xl bg-surface hover:bg-gray-700 text-xs text-amber-400 font-semibold border border-amber-500/30 transition-all"
            >
              Simulate Trial Expiration
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
