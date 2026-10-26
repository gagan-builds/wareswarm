/**
 * Purpose: 3-step Onboarding Wizard for new WareSwarm users.
 * Role in project: Guides new signups through:
 * 1. Naming their workspace
 * 2. Selecting their fleet use case
 * 3. Choosing between starting their 14-day Pro trial (no card required) or Free tier.
 * Redirects to the live simulator with a pre-configured scenario.
 */
'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '../../lib/api';

export default function OnboardingPage() {
  const router = useRouter();
  const [step, setStep] = useState(1);
  const [workspaceName, setWorkspaceName] = useState('My Warehouse Fleet');
  const [useCase, setUseCase] = useState('ecommerce');
  const [submitting, setSubmitting] = useState(false);

  const useCases = [
    {
      id: 'ecommerce',
      icon: '📦',
      title: 'E-Commerce Fulfillment',
      desc: 'High-density shelving pods with fast picking workstations and dynamic parcel delivery.',
    },
    {
      id: 'crossdock',
      icon: '🚛',
      title: 'Cross-Docking & Distribution',
      desc: 'Rapid pallet transit between inbound dock bays and outbound delivery lanes.',
    },
    {
      id: 'research',
      icon: '🔬',
      title: 'Academic & Swarm Research',
      desc: 'Multi-agent pathfinding (MAPF), deadlock cycle analysis, and benchmark evaluation.',
    },
    {
      id: 'custom',
      icon: '⚙️',
      title: 'Industrial Manufacturing',
      desc: 'Custom assembly workcells with AGV parts supply routes and bottleneck mitigation.',
    },
  ];

  const handleFinish = async (startTrial: boolean) => {
    try {
      setSubmitting(true);
      if (startTrial) {
        // Create Pro checkout in test mode
        try {
          await api.createCheckout('pro', 'month');
        } catch {
          // ignore if already enrolled
        }
      }
      // Configure initial simulation scenario
      try {
        await api.configure({
          num_robots: startTrial ? 8 : 4,
          map_preset: 'default_warehouse',
          planner: 'astar',
          coordination_mode: 'swarm',
        });
      } catch {
        // ignore
      }
      router.push('/simulator');
    } catch (err: any) {
      alert(err.message || 'Onboarding error');
      router.push('/simulator');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center py-12 px-4">
      <div className="w-full max-w-2xl bg-surface border border-surface-2 rounded-3xl p-8 sm:p-10 shadow-2xl relative overflow-hidden">
        {/* Progress Bar Header */}
        <div className="flex items-center justify-between mb-8 pb-4 border-b border-surface-2">
          <div className="flex items-center gap-2">
            <span className="text-xl">⬡</span>
            <span className="font-extrabold text-white text-base">WareSwarm Onboarding</span>
          </div>
          <div className="flex items-center gap-2">
            {[1, 2, 3].map((s) => (
              <div
                key={s}
                className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold transition-all ${
                  step === s
                    ? 'bg-accent text-white shadow-md shadow-accent/30'
                    : step > s
                    ? 'bg-emerald-500 text-white'
                    : 'bg-surface-2 text-gray-400'
                }`}
              >
                {step > s ? '✓' : s}
              </div>
            ))}
          </div>
        </div>

        {/* Step 1: Workspace Name */}
        {step === 1 && (
          <div className="space-y-6 animate-in fade-in">
            <div>
              <div className="text-[11px] font-bold text-accent uppercase tracking-wider mb-1">
                Step 1 of 3
              </div>
              <h1 className="text-2xl font-extrabold text-white">Name your robot workspace</h1>
              <p className="text-xs text-gray-400 mt-1">
                Workspaces house your custom maps, simulation fleet configs, team members, and telemetry.
              </p>
            </div>

            <div>
              <label className="block text-xs font-semibold text-gray-300 mb-2">
                Workspace or Facility Name
              </label>
              <input
                type="text"
                value={workspaceName}
                onChange={(e) => setWorkspaceName(e.target.value)}
                placeholder="e.g. Acme Logistics Fleet"
                className="w-full px-4 py-3 rounded-xl bg-surface-2 border border-gray-700 text-white text-sm focus:outline-none focus:border-accent"
              />
            </div>

            <button
              onClick={() => {
                if (workspaceName.trim()) setStep(2);
              }}
              className="w-full py-3.5 px-4 rounded-xl bg-accent hover:bg-blue-500 font-bold text-sm text-white shadow-lg shadow-accent/25 transition-all"
            >
              Next: Select Use Case →
            </button>
          </div>
        )}

        {/* Step 2: Use Case */}
        {step === 2 && (
          <div className="space-y-6 animate-in fade-in">
            <div>
              <div className="text-[11px] font-bold text-accent uppercase tracking-wider mb-1">
                Step 2 of 3
              </div>
              <h1 className="text-2xl font-extrabold text-white">What is your primary use case?</h1>
              <p className="text-xs text-gray-400 mt-1">
                We'll tailor your default map template and robot swarm density.
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {useCases.map((uc) => (
                <div
                  key={uc.id}
                  onClick={() => setUseCase(uc.id)}
                  className={`p-4 rounded-2xl border cursor-pointer transition-all ${
                    useCase === uc.id
                      ? 'bg-accent/15 border-accent shadow-md shadow-accent/10'
                      : 'bg-surface-2/60 border-gray-800 hover:border-gray-700'
                  }`}
                >
                  <div className="text-2xl mb-2">{uc.icon}</div>
                  <div className="font-bold text-sm text-white mb-1">{uc.title}</div>
                  <div className="text-xs text-gray-400 leading-relaxed">{uc.desc}</div>
                </div>
              ))}
            </div>

            <div className="flex items-center gap-3">
              <button
                onClick={() => setStep(1)}
                className="py-3.5 px-6 rounded-xl bg-surface-2 hover:bg-gray-700 font-bold text-xs text-gray-300 transition-all"
              >
                ← Back
              </button>
              <button
                onClick={() => setStep(3)}
                className="flex-1 py-3.5 px-4 rounded-xl bg-accent hover:bg-blue-500 font-bold text-sm text-white shadow-lg shadow-accent/25 transition-all"
              >
                Next: Select Plan Tier →
              </button>
            </div>
          </div>
        )}

        {/* Step 3: Plan Selection */}
        {step === 3 && (
          <div className="space-y-6 animate-in fade-in">
            <div>
              <div className="text-[11px] font-bold text-accent uppercase tracking-wider mb-1">
                Step 3 of 3
              </div>
              <h1 className="text-2xl font-extrabold text-white">Choose your plan tier</h1>
              <p className="text-xs text-gray-400 mt-1">
                Test mode active — no real card charges. All plans can be upgraded or changed at any time.
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {/* Pro Trial Card */}
              <div
                onClick={() => handleFinish(true)}
                className="p-5 rounded-2xl bg-gradient-to-b from-accent/20 to-surface-2 border-2 border-accent cursor-pointer hover:shadow-xl hover:shadow-accent/20 transition-all relative"
              >
                <div className="absolute -top-3 right-4 px-2.5 py-0.5 rounded-full bg-accent text-[10px] font-extrabold text-white uppercase">
                  Recommended
                </div>
                <div className="text-lg font-black text-white mb-1">Start 14-Day Pro Trial</div>
                <div className="text-xs text-emerald-400 font-semibold mb-3">No Credit Card Required</div>
                <ul className="text-xs text-gray-300 space-y-1.5 mb-4">
                  <li>✓ Up to 20 robots per simulation</li>
                  <li>✓ Space-time A* & Dijkstra path planning</li>
                  <li>✓ NAIVE vs SWARM compare benchmarks</li>
                  <li>✓ Congestion heatmaps & CSV exports</li>
                </ul>
                <button
                  disabled={submitting}
                  className="w-full py-2.5 rounded-xl bg-accent hover:bg-blue-500 font-bold text-xs text-white shadow-md transition-all"
                >
                  {submitting ? 'Setting Up...' : 'Start Free Pro Trial →'}
                </button>
              </div>

              {/* Free Tier Card */}
              <div
                onClick={() => handleFinish(false)}
                className="p-5 rounded-2xl bg-surface-2/60 border border-gray-700 cursor-pointer hover:border-gray-600 transition-all"
              >
                <div className="text-lg font-black text-white mb-1">Continue with Free</div>
                <div className="text-xs text-gray-400 font-semibold mb-3">$0 / month forever</div>
                <ul className="text-xs text-gray-400 space-y-1.5 mb-4">
                  <li>• Up to 5 robots per simulation</li>
                  <li>• Standard A* path planning</li>
                  <li>• 50 simulation runs per month</li>
                  <li>• 1 custom saved map</li>
                </ul>
                <button
                  disabled={submitting}
                  className="w-full py-2.5 rounded-xl bg-surface-2 hover:bg-gray-700 font-bold text-xs text-gray-300 transition-all"
                >
                  {submitting ? 'Setting Up...' : 'Continue on Free Plan'}
                </button>
              </div>
            </div>

            <div className="text-center text-[11px] text-gray-400">
              You will be redirected immediately to the live 2D warehouse simulator with a preloaded scenario.
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
