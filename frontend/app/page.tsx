/**
 * Purpose: Marketing and technical landing page for WareSwarm.
 * Role in the project: Welcomes visitors, explains core multi-agent coordination features,
 * presents algorithmic architecture, showcases pricing tiers, and provides direct CTA launches.
 * Key contents: LandingPage component, Hero section, Neutral benchmark indicators,
 * Feature showcase, Plans teaser, and Call-to-action banner.
 * Talks to: frontend/lib/useAuth.ts (conditional CTAs based on login state), Next.js routing (Link).
 */

'use client';

import React from 'react';
import Link from 'next/link';
import { useAuth } from '../lib/useAuth';

/**
 * Landing Page component for WareSwarm.
 * Highlights warehouse automation features, Space-Time A* benefits, and subscription tiers.
 */
export default function LandingPage() {
  const { isAuthenticated, user } = useAuth();

  return (
    <div className="min-h-screen bg-[#0a0e1a] text-white selection:bg-blue-600 selection:text-white">
      {/* Hero Background Glows */}
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[800px] h-[400px] bg-gradient-to-tr from-blue-600/15 via-indigo-600/15 to-emerald-500/15 blur-[120px] pointer-events-none rounded-full" />

      {/* =================================================================== */}
      {/* 1. HERO SECTION                                                     */}
      {/* =================================================================== */}
      <section className="relative pt-16 pb-20 px-6 max-w-6xl mx-auto text-center flex flex-col items-center">
        {/* Release / Tech Badge */}
        <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-surface-2/80 border border-gray-700/80 text-xs font-medium text-gray-300 mb-8 backdrop-blur shadow-sm">
          <span className="flex h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
          <span className="text-gray-400 font-mono">v2.0 SaaS</span>
          <span className="text-gray-500">|</span>
          <span className="text-blue-400 font-semibold">Autonomous Swarm Intelligence & STA*</span>
        </div>

        {/* Main Headline */}
        <h1 className="text-4xl sm:text-6xl lg:text-7xl font-extrabold tracking-tight leading-[1.1] mb-6">
          AI based Path Planning and{' '}
          <span className="bg-gradient-to-r from-blue-400 via-indigo-300 to-emerald-400 bg-clip-text text-transparent">
            Swarm Coordination for Warehouse Robots
          </span>
        </h1>

        {/* Subtitle */}
        <p className="max-w-3xl text-base sm:text-lg text-gray-400 leading-relaxed mb-10">
          A high-performance warehouse robotics simulation platform featuring decentralized{' '}
          <strong className="text-white">Space-Time A* pathfinding</strong>, dynamic priority reservations,
          interactive warehouse map creation, and multi-tier subscription capabilities.
        </p>

        {/* Action Buttons: Require account creation first */}
        <div className="flex flex-wrap items-center justify-center gap-4 mb-16">
          {!isAuthenticated ? (
            <>
              <Link
                href="/signup"
                className="flex items-center gap-2.5 px-8 py-4 rounded-2xl bg-gradient-to-r from-blue-600 via-indigo-600 to-emerald-500 hover:from-blue-500 hover:to-emerald-400 text-white font-extrabold text-sm shadow-2xl shadow-blue-500/30 transition-all transform hover:scale-105 active:scale-95"
              >
                <span>⚡</span>
                <span>Create Account to Launch Simulator →</span>
              </Link>

              <Link
                href="/login"
                className="flex items-center gap-2 px-6 py-4 rounded-2xl bg-surface-2 hover:bg-gray-800 text-gray-200 border border-gray-700 font-semibold text-sm shadow transition-colors"
              >
                <span>🔑</span>
                <span>Sign In</span>
              </Link>

              <Link
                href="/pricing"
                className="flex items-center gap-2 px-5 py-4 rounded-2xl bg-surface/80 hover:bg-surface-2 text-gray-300 hover:text-white border border-gray-800 text-xs font-semibold transition-colors"
              >
                <span>💳</span>
                <span>View Plans & Pricing</span>
              </Link>
            </>
          ) : (
            <>
              <Link
                href="/simulator"
                className="flex items-center gap-2.5 px-8 py-4 rounded-2xl bg-accent hover:bg-blue-500 text-white font-bold text-sm shadow-xl shadow-blue-500/25 transition-all transform hover:scale-[1.02] active:scale-[0.98]"
              >
                <span>🚀</span>
                <span>Launch Live Simulator →</span>
              </Link>

              <Link
                href="/pricing"
                className="flex items-center gap-2 px-6 py-4 rounded-2xl bg-surface-2 hover:bg-gray-800 text-gray-200 border border-gray-700 font-semibold text-sm shadow transition-colors"
              >
                <span>💳</span>
                <span>Manage Plan</span>
              </Link>

              <div className="text-xs text-emerald-400 font-medium px-4 py-3 bg-emerald-950/40 border border-emerald-800/80 rounded-2xl">
                ✓ Logged in as <b>{user?.full_name || user?.username}</b>
              </div>
            </>
          )}
        </div>

        {/* Neutral Benchmark Indicators (Replacing Unproven Marketing Superlatives) */}
        <div className="w-full grid grid-cols-2 md:grid-cols-4 gap-3 bg-surface/90 border border-surface-2 p-5 rounded-2xl shadow-xl backdrop-blur">
          <div className="text-left p-3">
            <span className="text-xs text-gray-400 block mb-1">Collision Avoidance</span>
            <span className="text-2xl sm:text-3xl font-extrabold text-emerald-400 font-mono">4D Reservation</span>
            <span className="text-[11px] text-gray-500 block mt-0.5">Vertex & swap conflict verification</span>
          </div>

          <div className="text-left p-3 border-l border-gray-800">
            <span className="text-xs text-gray-400 block mb-1">Deadlock Recovery</span>
            <span className="text-2xl sm:text-3xl font-extrabold text-blue-400 font-mono">Cycle Detection</span>
            <span className="text-[11px] text-gray-500 block mt-0.5">Automated wait-for graph resolution</span>
          </div>

          <div className="text-left p-3 border-l border-gray-800">
            <span className="text-xs text-gray-400 block mb-1">Search Tree Pruning</span>
            <span className="text-2xl sm:text-3xl font-extrabold text-indigo-400 font-mono">Space-Time A*</span>
            <span className="text-[11px] text-gray-500 block mt-0.5">Up to 40% fewer expanded nodes vs Dijkstra</span>
          </div>

          <div className="text-left p-3 border-l border-gray-800">
            <span className="text-xs text-gray-400 block mb-1">Multi-Robot Fleet</span>
            <span className="text-2xl sm:text-3xl font-extrabold text-amber-400 font-mono">1–30+ AGVs</span>
            <span className="text-[11px] text-gray-500 block mt-0.5">Tiered fleet sizing & staging</span>
          </div>
        </div>
      </section>

      {/* =================================================================== */}
      {/* 2. CORE FEATURES SHOWCASE                                           */}
      {/* =================================================================== */}
      <section className="py-20 px-6 max-w-6xl mx-auto border-t border-surface-2">
        <div className="text-center max-w-3xl mx-auto mb-16">
          <h2 className="text-xs font-bold text-accent uppercase tracking-widest mb-3">
            Intelligent Robotics Architecture
          </h2>
          <h3 className="text-3xl sm:text-4xl font-extrabold text-white">
            Engineered for High-Density Autonomous Warehouses
          </h3>
          <p className="text-gray-400 text-sm mt-3">
            Every route and reservation is computed server-side in Python to simulate real industrial fleet controllers.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {/* Card 1: Swarm Coordination */}
          <div className="bg-surface border border-surface-2 rounded-2xl p-6 hover:border-accent transition-all flex flex-col justify-between group shadow-lg">
            <div>
              <div className="h-12 w-12 rounded-xl bg-blue-950/70 border border-blue-700/80 flex items-center justify-center text-2xl mb-4 group-hover:scale-110 transition-transform">
                🤖
              </div>
              <h4 className="text-lg font-bold text-white mb-2">SWARM Coordination</h4>
              <p className="text-xs text-gray-400 leading-relaxed">
                Space-time vertex and edge reservations ensure robots never step onto the same cell or cross paths
                simultaneously, maintaining coordinated navigation in narrow aisles.
              </p>
            </div>
            <div className="mt-5 pt-4 border-t border-surface-2 flex items-center justify-between text-xs text-blue-400 font-semibold">
              <span>Dynamic Priority Scheduling</span>
              <span>→</span>
            </div>
          </div>

          {/* Card 2: Space-Time A* vs Dijkstra */}
          <div className="bg-surface border border-surface-2 rounded-2xl p-6 hover:border-accent transition-all flex flex-col justify-between group shadow-lg">
            <div>
              <div className="h-12 w-12 rounded-xl bg-amber-950/70 border border-amber-700/80 flex items-center justify-center text-2xl mb-4 group-hover:scale-110 transition-transform">
                ⚡
              </div>
              <h4 className="text-lg font-bold text-white mb-2">Space-Time A* Pathfinding</h4>
              <p className="text-xs text-gray-400 leading-relaxed">
                Computes collision-free paths through 4D space-time graphs with Manhattan heuristics,
                outperforming unguided Dijkstra in multi-agent density.
              </p>
            </div>
            <div className="mt-5 pt-4 border-t border-surface-2 flex items-center justify-between text-xs text-amber-400 font-semibold">
              <span>Dual Visual Comparison</span>
              <span>→</span>
            </div>
          </div>

          {/* Card 3: Interactive Map Builder */}
          <div className="bg-surface border border-surface-2 rounded-2xl p-6 hover:border-accent transition-all flex flex-col justify-between group shadow-lg">
            <div>
              <div className="h-12 w-12 rounded-xl bg-emerald-950/70 border border-emerald-700/80 flex items-center justify-center text-2xl mb-4 group-hover:scale-110 transition-transform">
                🛠️
              </div>
              <h4 className="text-lg font-bold text-white mb-2">Custom Map Builder</h4>
              <p className="text-xs text-gray-400 leading-relaxed">
                Paint custom warehouse facilities directly in your browser. Place obstacles, robot starting docks (C),
                inventory pickup shelves (P), and delivery dropoff packing stations (D).
              </p>
            </div>
            <div className="mt-5 pt-4 border-t border-surface-2 flex items-center justify-between text-xs text-emerald-400 font-semibold">
              <span>1-Click Live Simulation</span>
              <span>→</span>
            </div>
          </div>
        </div>
      </section>

      {/* =================================================================== */}
      {/* 3. SUBSCRIPTION PLANS TEASER                                        */}
      {/* =================================================================== */}
      <section className="py-20 px-6 max-w-6xl mx-auto border-t border-surface-2">
        <div className="text-center max-w-3xl mx-auto mb-12">
          <div className="text-xs font-bold text-emerald-400 uppercase tracking-widest mb-2">
            100% Free & Open Fleet Software
          </div>
          <h3 className="text-3xl sm:text-4xl font-extrabold text-white">
            All Features & Planners Unlocked
          </h3>
          <p className="text-gray-400 text-sm mt-3">
            Zero paywalls, zero subscription fees. Run up to 30 robots, custom maps, A*, Dijkstra, Space-Time A*, and full swarm coordination for free.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-10">
          {/* Free */}
          <div className="bg-surface border-2 border-emerald-500/80 rounded-2xl p-6 flex flex-col justify-between shadow-xl shadow-emerald-500/10">
            <div>
              <div className="flex items-center justify-between">
                <h4 className="font-bold text-white text-lg">Community Free</h4>
                <span className="text-[10px] font-bold bg-emerald-500/20 text-emerald-400 px-2 py-0.5 rounded-full">Active</span>
              </div>
              <div className="text-2xl font-black text-white my-3">$0<span className="text-xs text-gray-400 font-normal"> / forever</span></div>
              <ul className="text-xs text-gray-300 space-y-2 mb-6">
                <li>✓ Up to 30 robots</li>
                <li>✓ Custom maps & 60×40 grid</li>
                <li>✓ A*, Dijkstra, Space-Time A*</li>
                <li>✓ NAIVE vs SWARM compare</li>
                <li>✓ Unlimited runs & reports</li>
              </ul>
            </div>
            <Link
              href="/simulator"
              className="w-full py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-center text-xs font-bold text-white transition-colors"
            >
              Launch Simulator
            </Link>
          </div>

          {/* Pro */}
          <div className="bg-gradient-to-b from-surface to-surface-2 border-2 border-accent rounded-2xl p-6 flex flex-col justify-between relative shadow-xl shadow-accent/10">
            <div className="absolute -top-3 right-4 px-2 py-0.5 rounded-full bg-accent text-[9px] font-extrabold uppercase text-white">
              Most Popular
            </div>
            <div>
              <h4 className="font-bold text-white text-lg">Pro</h4>
              <div className="text-2xl font-black text-white my-3">$29<span className="text-xs text-gray-400 font-normal">/mo</span></div>
              <ul className="text-xs text-gray-300 space-y-2 mb-6">
                <li>✓ Up to 20 robots</li>
                <li>✓ Space-time A* & Dijkstra</li>
                <li>✓ NAIVE vs SWARM compare</li>
                <li>✓ Congestion heatmaps</li>
                <li>✓ 1,000 runs / month</li>
              </ul>
            </div>
            <Link
              href="/pricing"
              className="w-full py-2.5 rounded-xl bg-accent hover:bg-blue-500 text-center text-xs font-bold text-white shadow-md transition-all"
            >
              Start 14-Day Trial
            </Link>
          </div>

          {/* Team */}
          <div className="bg-surface border border-surface-2 rounded-2xl p-6 flex flex-col justify-between">
            <div>
              <h4 className="font-bold text-white text-lg">Team</h4>
              <div className="text-2xl font-black text-white my-3">$99<span className="text-xs text-gray-400 font-normal">/mo</span></div>
              <ul className="text-xs text-gray-400 space-y-2 mb-6">
                <li>✓ Up to 30 robots</li>
                <li>✓ 10 collaborative seats</li>
                <li>✓ PDF branded report export</li>
                <li>✓ Read + Write API keys</li>
                <li>✓ 10,000 runs / month</li>
              </ul>
            </div>
            <Link
              href="/pricing"
              className="w-full py-2.5 rounded-xl bg-surface-2 hover:bg-gray-700 text-center text-xs font-bold text-white transition-colors"
            >
              Choose Team
            </Link>
          </div>

          {/* Enterprise */}
          <div className="bg-surface border border-surface-2 rounded-2xl p-6 flex flex-col justify-between">
            <div>
              <h4 className="font-bold text-white text-lg">Enterprise</h4>
              <div className="text-2xl font-black text-white my-3">Custom</div>
              <ul className="text-xs text-gray-400 space-y-2 mb-6">
                <li>✓ 100+ robots & unlimited grid</li>
                <li>✓ Unlimited seats & API calls</li>
                <li>✓ Custom planners & coordination</li>
                <li>✓ Dedicated SLA & onboarding</li>
              </ul>
            </div>
            <Link
              href="/pricing"
              className="w-full py-2.5 rounded-xl bg-surface-2 hover:bg-gray-700 text-center text-xs font-bold text-white transition-colors"
            >
              Contact Sales
            </Link>
          </div>
        </div>

        <div className="text-center">
          <Link
            href="/pricing"
            className="text-xs font-bold text-accent hover:underline inline-flex items-center gap-1"
          >
            <span>View Full Pricing, Feature Comparison Table & FAQ</span>
            <span>→</span>
          </Link>
        </div>
      </section>

      {/* =================================================================== */}
      {/* 4. CALL TO ACTION BANNER                                            */}
      {/* =================================================================== */}
      <section className="py-16 px-6 max-w-5xl mx-auto">
        <div className="bg-gradient-to-r from-blue-900/60 via-indigo-900/60 to-purple-900/60 border border-blue-600/50 rounded-3xl p-8 sm:p-12 text-center shadow-2xl relative overflow-hidden">
          <div className="max-w-2xl mx-auto space-y-4">
            <h3 className="text-2xl sm:text-4xl font-extrabold text-white">
              Ready to Orchestrate Your Warehouse Fleet?
            </h3>
            <p className="text-sm text-blue-200">
              Create an account or start experimenting with real-time swarm coordination immediately.
            </p>
            <div className="pt-4 flex flex-wrap items-center justify-center gap-3">
              <Link
                href="/simulator"
                className="px-7 py-3.5 bg-accent hover:bg-blue-500 text-white font-bold text-xs rounded-xl shadow-lg transition-transform hover:scale-105"
              >
                Launch Simulator Now
              </Link>
              {!isAuthenticated ? (
                <Link
                  href="/login"
                  className="px-7 py-3.5 bg-surface-2 hover:bg-gray-800 text-white border border-gray-600 font-bold text-xs rounded-xl transition-colors"
                >
                  Create Account / Sign In
                </Link>
              ) : (
                <Link
                  href="/settings/billing"
                  className="px-7 py-3.5 bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs rounded-xl transition-colors"
                >
                  Subscription & Billing
                </Link>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* =================================================================== */}
      {/* 5. FOOTER                                                           */}
      {/* =================================================================== */}
      <footer className="border-t border-surface-2 py-10 px-6 text-xs text-gray-500">
        <div className="max-w-6xl mx-auto flex flex-wrap items-center justify-between gap-6">
          <div className="flex items-center gap-2">
            <span className="text-accent text-lg">⬡</span>
            <span className="font-bold text-gray-300">WareSwarm</span>
            <span>— AI Multi-Robot Fleet Software</span>
          </div>

          <div className="flex flex-wrap items-center gap-5 text-gray-400">
            <Link href="/simulator" className="hover:text-white transition-colors">Simulator</Link>
            <Link href="/builder" className="hover:text-white transition-colors">Map Builder</Link>
            <Link href="/compare" className="hover:text-white transition-colors">Compare Modes</Link>
            <Link href="/pricing" className="hover:text-white transition-colors">Pricing</Link>
            <Link href="/history" className="hover:text-white transition-colors">History</Link>
            <Link href="/dashboard" className="hover:text-white transition-colors">Dashboard</Link>
            <a href="http://localhost:8000/docs" target="_blank" rel="noreferrer" className="hover:text-accent transition-colors font-mono">
              API Docs (/docs)
            </a>
          </div>
        </div>
      </footer>
    </div>
  );
}
