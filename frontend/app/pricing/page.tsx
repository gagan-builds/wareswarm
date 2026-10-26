/**
 * Purpose: Interactive Pricing & Plans Page for WareSwarm.
 * Role in project: Fetches plan configurations and limits dynamically from GET /api/billing/plans.
 * Allows monthly/annual toggle with savings badge, plan selection, feature comparison, and FAQ.
 */
'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { api } from '../../lib/api';
import type { PlanTier, PlansResponse, SubscriptionInfo } from '../../lib/types';
import { useAuth } from '../../lib/useAuth';

export default function PricingPage() {
  const router = useRouter();
  const { isAuthenticated } = useAuth();
  const [plans, setPlans] = useState<PlanTier[]>([]);
  const [productName, setProductName] = useState('WareSwarm');
  const [currentSub, setCurrentSub] = useState<SubscriptionInfo | null>(null);
  const [billingInterval, setBillingInterval] = useState<'month' | 'year'>('month');
  const [loading, setLoading] = useState(true);
  const [checkoutLoading, setCheckoutLoading] = useState<string | null>(null);
  const [activeFaq, setActiveFaq] = useState<number | null>(null);

  useEffect(() => {
    Promise.all([
      api.getPlans(),
      isAuthenticated ? api.getSubscription().catch(() => null) : Promise.resolve(null),
    ])
      .then(([plansData, subData]) => {
        if (plansData?.plans) {
          setPlans(plansData.plans);
          if (plansData.product_name) setProductName(plansData.product_name);
        }
        if (subData) setCurrentSub(subData);
      })
      .catch((err) => console.error('Failed to load plans:', err))
      .finally(() => setLoading(false));
  }, [isAuthenticated]);

  const handleSelectPlan = async (plan: PlanTier) => {
    if (plan.id === 'enterprise') {
      window.location.href = 'mailto:enterprise@wareswarm.io?subject=Enterprise%20Fleet%20Inquiry';
      return;
    }

    if (!isAuthenticated) {
      router.push(`/login?redirect=/pricing`);
      return;
    }

    try {
      setCheckoutLoading(plan.id);
      const res = await api.createCheckout(plan.id, billingInterval);
      if (res.checkout_url) {
        if (res.checkout_url.startsWith('http')) {
          window.location.href = res.checkout_url;
        } else {
          router.push(res.checkout_url);
        }
      }
    } catch (err: any) {
      alert(err.message || 'Checkout failed. Please try again.');
    } finally {
      setCheckoutLoading(null);
    }
  };

  const currentPlanId = currentSub?.subscription?.plan || 'free';

  const faqs = [
    {
      q: 'How does the 14-day free trial work?',
      a: 'All new workspaces receive a 14-day free trial of the Pro plan with no credit card required. You get immediate access to up to 20 robots, Space-time A* path planning, NAIVE vs SWARM benchmarking, and heatmaps.',
    },
    {
      q: 'What happens when my trial or subscription ends?',
      a: 'Your workspace seamlessly transitions to the Free plan. None of your simulation runs or custom maps are ever deleted. If you exceed the Free limits (e.g. more than 1 custom map), your existing maps remain accessible as read-only.',
    },
    {
      q: 'Are credit cards charged during this evaluation?',
      a: 'No. All billing is operating in Test Mode. You can experience full checkout, plan switches, and renewals without entering real financial credentials or incurring charges.',
    },
    {
      q: 'Can I invite my engineering team?',
      a: 'Yes! The Team plan includes 10 workspace seats with role permissions (owner, admin, member), while Enterprise supports unlimited members with dedicated access.',
    },
    {
      q: 'Where does the simulation and planning logic run?',
      a: 'All path planning (A*, Dijkstra, Space-time A*), multi-robot swarm reservation tables, and deadlock cycle resolution run in Python on our high-performance backend. The frontend only displays graphics and calls secure APIs.',
    },
  ];

  return (
    <div className="min-h-screen bg-background py-12 px-4 sm:px-6 lg:px-8">
      {/* Test Mode Banner */}
      <div className="max-w-7xl mx-auto mb-8 bg-amber-500/10 border border-amber-500/30 rounded-2xl p-4 flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <span className="text-xl">💳</span>
          <div>
            <div className="text-sm font-bold text-amber-400">Test Mode Active</div>
            <div className="text-xs text-gray-300">
              No real credit card charges will occur. Test checkouts, upgrades, and renewals are simulated safely.
            </div>
          </div>
        </div>
        {isAuthenticated && (
          <Link
            href="/settings/billing"
            className="text-xs font-semibold px-3 py-1.5 rounded-lg bg-surface-2 hover:bg-gray-700 text-gray-200 transition-colors"
          >
            Manage Current Subscription →
          </Link>
        )}
      </div>

      {/* Header */}
      <div className="text-center max-w-3xl mx-auto mb-12">
        <div className="text-xs font-bold text-accent tracking-widest uppercase mb-2">
          Transparent Fleet Pricing
        </div>
        <h1 className="text-4xl font-extrabold text-white tracking-tight sm:text-5xl">
          Scale your autonomous warehouse fleet
        </h1>
        <p className="mt-4 text-base text-gray-400 leading-relaxed">
          From academic evaluation to high-density industrial logistics. Choose the plan that matches your simulation fleet size and coordination requirements.
        </p>

        {/* Billing Interval Toggle */}
        <div className="mt-8 inline-flex items-center gap-3 p-1.5 rounded-2xl bg-surface border border-surface-2">
          <button
            onClick={() => setBillingInterval('month')}
            className={`px-4 py-2 text-xs font-bold rounded-xl transition-all ${
              billingInterval === 'month'
                ? 'bg-accent text-white shadow-md'
                : 'text-gray-400 hover:text-white'
            }`}
          >
            Monthly Billing
          </button>
          <button
            onClick={() => setBillingInterval('year')}
            className={`px-4 py-2 text-xs font-bold rounded-xl flex items-center gap-2 transition-all ${
              billingInterval === 'year'
                ? 'bg-accent text-white shadow-md'
                : 'text-gray-400 hover:text-white'
            }`}
          >
            <span>Annual Billing</span>
            <span className="bg-emerald-500 text-white text-[10px] px-2 py-0.5 rounded-full font-extrabold">
              Save 17%
            </span>
          </button>
        </div>
      </div>

      {/* Pricing Cards */}
      {loading ? (
        <div className="flex items-center justify-center py-20">
          <div className="w-8 h-8 border-2 border-accent border-t-transparent rounded-full animate-spin" />
        </div>
      ) : (
        <div className="max-w-7xl mx-auto grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-20">
          {plans.map((plan) => {
            const isCurrent = currentPlanId === plan.id;
            const price = billingInterval === 'year' ? plan.price_yearly : plan.price_monthly;
            const intervalLabel = billingInterval === 'year' ? '/yr' : '/mo';
            const isHighlighted = plan.highlighted || plan.id === 'pro';

            return (
              <div
                key={plan.id}
                className={`relative rounded-3xl p-6 sm:p-7 flex flex-col justify-between transition-all duration-300 border ${
                  isHighlighted
                    ? 'bg-gradient-to-b from-surface to-surface-2 border-accent shadow-2xl shadow-accent/10 -translate-y-1'
                    : 'bg-surface border-surface-2 hover:border-gray-700'
                }`}
              >
                {/* Popular Pill */}
                {isHighlighted && (
                  <div className="absolute -top-3.5 left-1/2 -translate-x-1/2 px-3 py-1 rounded-full bg-accent text-[11px] font-extrabold text-white uppercase tracking-wider shadow-md">
                    Most Popular
                  </div>
                )}

                <div>
                  <div className="flex items-center justify-between mb-2">
                    <h3 className="text-xl font-bold text-white capitalize">{plan.name}</h3>
                    {isCurrent && (
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                        Current Plan
                      </span>
                    )}
                  </div>

                  <p className="text-xs text-gray-400 mb-6 min-h-[36px]">{plan.description}</p>

                  {/* Price */}
                  <div className="mb-6 pb-6 border-b border-surface-2">
                    {plan.id === 'enterprise' ? (
                      <div className="text-3xl font-extrabold text-white">Custom</div>
                    ) : (
                      <div className="flex items-baseline gap-1">
                        <span className="text-4xl font-extrabold text-white">${price}</span>
                        <span className="text-xs text-gray-400 font-medium">{intervalLabel}</span>
                      </div>
                    )}
                    {billingInterval === 'year' && plan.annual_savings > 0 && (
                      <div className="text-[11px] text-emerald-400 font-semibold mt-1">
                        Includes 2 months free (${plan.annual_savings} savings)
                      </div>
                    )}
                  </div>

                  {/* Key Limits */}
                  <div className="space-y-3 mb-6">
                    <div className="text-xs font-semibold text-gray-300">Fleet & Capacity:</div>
                    <div className="text-xs text-gray-400 flex items-center gap-2">
                      <span className="text-accent font-bold">🤖</span>
                      <span>
                        <strong className="text-white">
                          {plan.limits.robots >= 999 ? 'Unlimited' : `Up to ${plan.limits.robots}`}
                        </strong>{' '}
                        robots per simulation
                      </span>
                    </div>
                    <div className="text-xs text-gray-400 flex items-center gap-2">
                      <span className="text-accent font-bold">📐</span>
                      <span>
                        Grid up to{' '}
                        <strong className="text-white">
                          {plan.limits.map_size[0] >= 999
                            ? 'Unlimited'
                            : `${plan.limits.map_size[0]}×${plan.limits.map_size[1]}`}
                        </strong>
                      </span>
                    </div>
                    <div className="text-xs text-gray-400 flex items-center gap-2">
                      <span className="text-accent font-bold">⏱</span>
                      <span>
                        <strong className="text-white">
                          {plan.limits.simulation_runs >= 99999
                            ? 'Unlimited'
                            : plan.limits.simulation_runs.toLocaleString()}
                        </strong>{' '}
                        runs/month
                      </span>
                    </div>
                    <div className="text-xs text-gray-400 flex items-center gap-2">
                      <span className="text-accent font-bold">👥</span>
                      <span>
                        <strong className="text-white">
                          {plan.limits.team_members >= 999 ? 'Unlimited' : plan.limits.team_members}
                        </strong>{' '}
                        team seat{plan.limits.team_members > 1 ? 's' : ''}
                      </span>
                    </div>
                  </div>

                  {/* Features List */}
                  <div className="space-y-2 mb-8">
                    <div className="text-xs font-semibold text-gray-300">Included Features:</div>
                    {plan.features.slice(0, 6).map((feat, idx) => (
                      <div key={idx} className="flex items-start gap-2 text-xs text-gray-300">
                        <span className="text-emerald-400 font-bold mt-0.5">✓</span>
                        <span>{feat}</span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Call to action */}
                <button
                  onClick={() => handleSelectPlan(plan)}
                  disabled={checkoutLoading !== null || isCurrent}
                  className={`w-full py-3 px-4 rounded-xl font-bold text-xs transition-all shadow-md ${
                    isCurrent
                      ? 'bg-gray-800 text-gray-500 cursor-not-allowed'
                      : isHighlighted
                      ? 'bg-accent hover:bg-blue-500 text-white shadow-accent/25'
                      : 'bg-surface-2 hover:bg-gray-700 text-white'
                  }`}
                >
                  {checkoutLoading === plan.id ? (
                    'Processing...'
                  ) : isCurrent ? (
                    'Active Plan'
                  ) : plan.id === 'free' ? (
                    'Start with Free'
                  ) : plan.id === 'pro' && !currentSub ? (
                    'Start 14-Day Free Trial'
                  ) : plan.id === 'enterprise' ? (
                    'Contact Fleet Sales'
                  ) : (
                    `Upgrade to ${plan.name}`
                  )}
                </button>
              </div>
            );
          })}
        </div>
      )}

      {/* Feature Comparison Table */}
      <div className="max-w-6xl mx-auto mb-20 bg-surface border border-surface-2 rounded-3xl p-6 sm:p-10 overflow-x-auto">
        <h2 className="text-2xl font-extrabold text-white mb-6 text-center">
          Comprehensive Feature Comparison
        </h2>

        <table className="w-full text-left border-collapse text-xs">
          <thead>
            <tr className="border-b border-surface-2 text-gray-400 uppercase text-[11px] tracking-wider">
              <th className="py-4 px-4">Feature / Capability</th>
              <th className="py-4 px-3 text-center">Free</th>
              <th className="py-4 px-3 text-center text-accent">Pro</th>
              <th className="py-4 px-3 text-center">Team</th>
              <th className="py-4 px-3 text-center">Enterprise</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-surface-2 text-gray-300">
            <tr>
              <td className="py-3.5 px-4 font-semibold text-white">Robots per simulation</td>
              <td className="py-3.5 px-3 text-center">Up to 5</td>
              <td className="py-3.5 px-3 text-center font-bold text-accent">Up to 20</td>
              <td className="py-3.5 px-3 text-center font-bold text-white">Up to 30</td>
              <td className="py-3.5 px-3 text-center">100+</td>
            </tr>
            <tr>
              <td className="py-3.5 px-4 font-semibold text-white">Map Grid Size</td>
              <td className="py-3.5 px-3 text-center">30 × 20</td>
              <td className="py-3.5 px-3 text-center">60 × 40</td>
              <td className="py-3.5 px-3 text-center">100 × 60</td>
              <td className="py-3.5 px-3 text-center font-bold text-emerald-400">Unlimited</td>
            </tr>
            <tr>
              <td className="py-3.5 px-4 font-semibold text-white">Path Planners</td>
              <td className="py-3.5 px-3 text-center">A* only</td>
              <td className="py-3.5 px-3 text-center">A*, Dijkstra, Space-time A*</td>
              <td className="py-3.5 px-3 text-center">All Planners</td>
              <td className="py-3.5 px-3 text-center">All + Custom</td>
            </tr>
            <tr>
              <td className="py-3.5 px-4 font-semibold text-white">Coordination & Compare</td>
              <td className="py-3.5 px-3 text-center">Basic Swarm</td>
              <td className="py-3.5 px-3 text-center font-semibold text-accent">NAIVE vs SWARM</td>
              <td className="py-3.5 px-3 text-center">All + Priority Tuning</td>
              <td className="py-3.5 px-3 text-center">Full Custom</td>
            </tr>
            <tr>
              <td className="py-3.5 px-4 font-semibold text-white">Congestion Heatmap & Replay</td>
              <td className="py-3.5 px-3 text-center text-gray-600">—</td>
              <td className="py-3.5 px-3 text-center text-emerald-400 font-bold">✓</td>
              <td className="py-3.5 px-3 text-center text-emerald-400 font-bold">✓</td>
              <td className="py-3.5 px-3 text-center text-emerald-400 font-bold">✓</td>
            </tr>
            <tr>
              <td className="py-3.5 px-4 font-semibold text-white">PDF Branded Reports</td>
              <td className="py-3.5 px-3 text-center text-gray-600">—</td>
              <td className="py-3.5 px-3 text-center text-gray-600">—</td>
              <td className="py-3.5 px-3 text-center text-emerald-400 font-bold">✓</td>
              <td className="py-3.5 px-3 text-center text-emerald-400 font-bold">✓</td>
            </tr>
            <tr>
              <td className="py-3.5 px-4 font-semibold text-white">Monthly Simulation Runs</td>
              <td className="py-3.5 px-3 text-center">50</td>
              <td className="py-3.5 px-3 text-center">1,000</td>
              <td className="py-3.5 px-3 text-center">10,000</td>
              <td className="py-3.5 px-3 text-center font-bold text-emerald-400">Unlimited</td>
            </tr>
            <tr>
              <td className="py-3.5 px-4 font-semibold text-white">Saved Custom Maps</td>
              <td className="py-3.5 px-3 text-center">1</td>
              <td className="py-3.5 px-3 text-center">20</td>
              <td className="py-3.5 px-3 text-center">200</td>
              <td className="py-3.5 px-3 text-center font-bold text-emerald-400">Unlimited</td>
            </tr>
            <tr>
              <td className="py-3.5 px-4 font-semibold text-white">Team Member Seats</td>
              <td className="py-3.5 px-3 text-center">1</td>
              <td className="py-3.5 px-3 text-center">1</td>
              <td className="py-3.5 px-3 text-center font-bold text-white">10 Seats</td>
              <td className="py-3.5 px-3 text-center font-bold text-emerald-400">Unlimited</td>
            </tr>
            <tr>
              <td className="py-3.5 px-4 font-semibold text-white">API Keys & Headless Runs</td>
              <td className="py-3.5 px-3 text-center text-gray-600">—</td>
              <td className="py-3.5 px-3 text-center">Read-Only</td>
              <td className="py-3.5 px-3 text-center font-semibold text-white">Read + Write (10k/mo)</td>
              <td className="py-3.5 px-3 text-center font-bold text-emerald-400">Unlimited</td>
            </tr>
            <tr>
              <td className="py-3.5 px-4 font-semibold text-white">Watermark on Exports</td>
              <td className="py-3.5 px-3 text-center text-amber-400">Yes</td>
              <td className="py-3.5 px-3 text-center text-gray-400">None</td>
              <td className="py-3.5 px-3 text-center text-gray-400">None</td>
              <td className="py-3.5 px-3 text-center text-gray-400">None</td>
            </tr>
          </tbody>
        </table>
      </div>

      {/* FAQ Section */}
      <div className="max-w-3xl mx-auto mb-16">
        <h2 className="text-2xl font-extrabold text-white mb-6 text-center">
          Frequently Asked Questions
        </h2>
        <div className="space-y-4">
          {faqs.map((faq, idx) => {
            const isOpen = activeFaq === idx;
            return (
              <div
                key={idx}
                className="bg-surface border border-surface-2 rounded-2xl overflow-hidden transition-all"
              >
                <button
                  onClick={() => setActiveFaq(isOpen ? null : idx)}
                  className="w-full text-left p-5 flex items-center justify-between gap-4 font-bold text-sm text-gray-200 hover:text-white"
                >
                  <span>{faq.q}</span>
                  <span className="text-accent text-lg">{isOpen ? '−' : '+'}</span>
                </button>
                {isOpen && (
                  <div className="p-5 pt-0 text-xs text-gray-400 leading-relaxed border-t border-surface-2/60">
                    {faq.a}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
