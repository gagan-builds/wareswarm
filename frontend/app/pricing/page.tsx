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
import type { SubscriptionInfo } from '../../lib/types';
import { useAuth } from '../../lib/useAuth';

const FALLBACK_PLANS = [
  {
    id: 'free',
    name: 'Free',
    tagline: 'Basic evaluation for individuals',
    description: 'Core simulation engine with basic A* pathfinding and standard layouts.',
    price_monthly: 0,
    price_yearly: 0,
    highlight: false,
    badge: null,
    limits: {
      robots: 5,
      max_grid_width: 30,
      max_grid_height: 20,
      simulation_runs_per_month: 50,
      team_members: 1,
    },
    features: {
      benchmarks_compare: false,
      heatmap: false,
      replay: false,
      export_csv_json: false,
      export_pdf: false,
      api_access: false,
      priority_tuning: false,
      watermark: true,
    },
  },
  {
    id: 'pro',
    name: 'Pro',
    tagline: 'Advanced swarm analytics for engineers',
    description: 'Comprehensive pathfinding algorithms, congestion replays, and benchmark comparisons.',
    price_monthly: 2900,
    price_yearly: 29000,
    highlight: true,
    badge: 'Most Popular',
    limits: {
      robots: 20,
      max_grid_width: 60,
      max_grid_height: 40,
      simulation_runs_per_month: 1000,
      team_members: 1,
    },
    features: {
      benchmarks_compare: true,
      heatmap: true,
      replay: true,
      export_csv_json: true,
      export_pdf: false,
      api_access: 'read_only',
      priority_tuning: false,
      watermark: false,
    },
  },
  {
    id: 'team',
    name: 'Team',
    tagline: 'Fleet-scale collaboration & automated reporting',
    description: 'Full multi-robot fleet size, team member seats, custom maps, and branded PDF reports.',
    price_monthly: 9900,
    price_yearly: 99000,
    highlight: false,
    badge: null,
    limits: {
      robots: 30,
      max_grid_width: 100,
      max_grid_height: 60,
      simulation_runs_per_month: 10000,
      team_members: 10,
    },
    features: {
      benchmarks_compare: true,
      heatmap: true,
      replay: true,
      export_csv_json: true,
      export_pdf: true,
      api_access: 'read_write',
      priority_tuning: true,
      watermark: false,
    },
  },
  {
    id: 'enterprise',
    name: 'Enterprise',
    tagline: 'Custom fleet capacity & dedicated instances',
    description: 'Custom fleet capacity, dedicated instances, custom coordination planners, and SLA.',
    price_monthly: -1,
    price_yearly: -1,
    highlight: false,
    badge: null,
    limits: {
      robots: 100,
      max_grid_width: -1,
      max_grid_height: -1,
      simulation_runs_per_month: -1,
      team_members: -1,
    },
    features: {
      benchmarks_compare: true,
      heatmap: true,
      replay: true,
      export_csv_json: true,
      export_pdf: true,
      api_access: 'unlimited',
      priority_tuning: true,
      watermark: false,
    },
  },
];

function extractFeatures(features: any): string[] {
  if (Array.isArray(features)) return features;
  if (!features || typeof features !== 'object') return [];
  const list: string[] = [];
  if (features.benchmarks_compare) list.push('Benchmarks & mode comparisons');
  if (features.heatmap) list.push('Congestion heatmap & replay');
  if (features.export_pdf) list.push('Branded PDF simulation reports');
  if (features.export_csv_json) list.push('CSV & JSON export formats');
  if (features.api_access) list.push(`Headless API access (${features.api_access})`);
  if (features.priority_tuning) list.push('Swarm priority tuning');
  if (features.scenario_library) list.push('Prebuilt scenario library');
  if (features.support && features.support !== 'none') list.push(`${String(features.support).toUpperCase()} Support`);
  if (!features.watermark) list.push('No watermark on exports');
  if (list.length === 0) {
    list.push('Core A* Pathfinding', 'Standard Grid Layouts', 'Free Unlocked Access');
  }
  return list;
}

export default function PricingPage() {
  const router = useRouter();
  const { isAuthenticated } = useAuth();
  const [plans, setPlans] = useState<any[]>(FALLBACK_PLANS);
  const [productName, setProductName] = useState('WareSwarm');
  const [currentSub, setCurrentSub] = useState<SubscriptionInfo | null>(null);
  const [billingInterval, setBillingInterval] = useState<'month' | 'year'>('month');
  const [loading, setLoading] = useState(false);
  const [checkoutLoading, setCheckoutLoading] = useState<string | null>(null);
  const [activeFaq, setActiveFaq] = useState<number | null>(null);

  useEffect(() => {
    Promise.all([
      api.getPlans().catch(() => null),
      isAuthenticated ? api.getSubscription().catch(() => null) : Promise.resolve(null),
    ])
      .then(([plansData, subData]) => {
        if (plansData?.plans && Array.isArray(plansData.plans) && plansData.plans.length > 0) {
          setPlans(plansData.plans);
          if (plansData.product_name) setProductName(plansData.product_name);
        }
        if (subData) setCurrentSub(subData);
      })
      .catch((err) => console.error('Failed to load plans:', err));
  }, [isAuthenticated]);

  const handleSelectPlan = async (plan: any) => {
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

  const currentPlanId = (currentSub as any)?.subscription?.plan || (currentSub as any)?.plan || 'free';

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
            <div className="text-sm font-bold text-amber-400">
              Test Mode Simulation — No Real Cards Required
            </div>
            <div className="text-xs text-gray-300">
              Payments run in mock test mode with instant simulated fulfillment. Never enter real credit cards.
            </div>
          </div>
        </div>
        <Link
          href="/simulator"
          className="text-xs font-bold px-3 py-1.5 rounded-lg bg-surface-2 hover:bg-gray-700 text-gray-200 transition-colors"
        >
          Launch Simulator →
        </Link>
      </div>

      {/* Header */}
      <div className="max-w-4xl mx-auto text-center mb-12">
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
      <div className="max-w-7xl mx-auto grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-20">
        {plans.map((plan) => {
          const isCurrent = currentPlanId === plan.id;
          const rawPrice = billingInterval === 'year' ? plan.price_yearly : plan.price_monthly;
          const displayPrice = rawPrice <= 0 ? 0 : rawPrice >= 100 ? Math.round(rawPrice / 100) : rawPrice;
          const intervalLabel = billingInterval === 'year' ? '/yr' : '/mo';
          const isHighlighted = plan.highlight || plan.highlighted || plan.id === 'pro';

          const maxRobots = plan.limits?.robots ?? 5;
          const gw = plan.limits?.max_grid_width ?? (plan.limits?.map_size ? plan.limits.map_size[0] : 30);
          const gh = plan.limits?.max_grid_height ?? (plan.limits?.map_size ? plan.limits.map_size[1] : 20);
          const runs = plan.limits?.simulation_runs_per_month ?? plan.limits?.simulation_runs ?? 50;
          const seats = plan.limits?.team_members ?? 1;
          const featureList = extractFeatures(plan.features);

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
                  {plan.id === 'enterprise' || rawPrice < 0 ? (
                    <div className="text-3xl font-extrabold text-white">Custom</div>
                  ) : (
                    <div className="flex items-baseline gap-1">
                      <span className="text-4xl font-extrabold text-white">${displayPrice}</span>
                      <span className="text-xs text-gray-400 font-medium">{intervalLabel}</span>
                    </div>
                  )}
                  {billingInterval === 'year' && displayPrice > 0 && (
                    <div className="text-[11px] text-emerald-400 font-semibold mt-1">
                      Includes 2 months free (~17% savings)
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
                        {maxRobots === -1 || maxRobots >= 100 ? '100+ (Custom)' : `Up to ${maxRobots}`}
                      </strong>{' '}
                      robots per simulation
                    </span>
                  </div>
                  <div className="text-xs text-gray-400 flex items-center gap-2">
                    <span className="text-accent font-bold">📐</span>
                    <span>
                      Grid up to{' '}
                      <strong className="text-white">
                        {gw === -1 ? 'Unlimited' : `${gw} × ${gh}`}
                      </strong>
                    </span>
                  </div>
                  <div className="text-xs text-gray-400 flex items-center gap-2">
                    <span className="text-accent font-bold">⏱</span>
                    <span>
                      <strong className="text-white">
                        {runs === -1 || runs >= 99999 ? 'Unlimited' : Number(runs).toLocaleString()}
                      </strong>{' '}
                      runs/month
                    </span>
                  </div>
                  <div className="text-xs text-gray-400 flex items-center gap-2">
                    <span className="text-accent font-bold">👥</span>
                    <span>
                      <strong className="text-white">
                        {seats === -1 || seats >= 999 ? 'Unlimited' : seats}
                      </strong>{' '}
                      team seat{seats > 1 ? 's' : ''}
                    </span>
                  </div>
                </div>

                {/* Features List */}
                <div className="space-y-2 mb-8">
                  <div className="text-xs font-semibold text-gray-300">Included Features:</div>
                  {featureList.slice(0, 6).map((feat, idx) => (
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
              <td className="py-3.5 px-3 text-center font-bold text-white">10</td>
              <td className="py-3.5 px-3 text-center font-bold text-emerald-400">Unlimited</td>
            </tr>
            <tr>
              <td className="py-3.5 px-4 font-semibold text-white">Watermark on Exports</td>
              <td className="py-3.5 px-3 text-center text-amber-400">Yes</td>
              <td className="py-3.5 px-3 text-center font-bold text-emerald-400">No</td>
              <td className="py-3.5 px-3 text-center font-bold text-emerald-400">No</td>
              <td className="py-3.5 px-3 text-center font-bold text-emerald-400">No</td>
            </tr>
          </tbody>
        </table>
      </div>

      {/* FAQs */}
      <div className="max-w-4xl mx-auto">
        <h2 className="text-2xl font-extrabold text-white text-center mb-8">
          Frequently Asked Questions
        </h2>
        <div className="space-y-4">
          {faqs.map((faq, idx) => {
            const isOpen = activeFaq === idx;
            return (
              <div
                key={idx}
                className="bg-surface border border-surface-2 rounded-2xl overflow-hidden transition-colors"
              >
                <button
                  onClick={() => setActiveFaq(isOpen ? null : idx)}
                  className="w-full py-4 px-6 text-left flex items-center justify-between text-sm font-bold text-white hover:text-accent transition-colors"
                >
                  <span>{faq.q}</span>
                  <span className="text-lg font-mono text-gray-500">
                    {isOpen ? '−' : '+'}
                  </span>
                </button>
                {isOpen && (
                  <div className="px-6 pb-5 text-xs text-gray-400 leading-relaxed border-t border-surface-2 pt-3">
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
