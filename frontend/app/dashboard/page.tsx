/**
 * Purpose: Executive summary and KPI dashboard for WareSwarm.
 * Role in the project: High-level overview page displaying live fleet health, system architecture summary, and quick links.
 * Key contents: DashboardPage component, KpiCard subcomponent, STATUS_COLORS indicator map.
 * Talks to: frontend/lib/useSimWebSocket.ts (subscribes to live metrics), Next.js routing (Link).
 */

'use client';

import Link from 'next/link';
import { useSimWebSocket } from '../../lib/useSimWebSocket';
import clsx from 'clsx';

/**
 * Summary KPI card widget displaying metric name, integer or float value, and units.
 */
function KpiCard({ label, value, unit = '', color = 'text-accent' }: {
  label: string; value: number | string; unit?: string; color?: string;
}) {
  return (
    <div className="kpi-card">
      <p className="text-xs text-gray-400 uppercase tracking-wider mb-1">{label}</p>
      <p className={clsx('text-2xl font-bold', color)}>{value}<span className="text-sm text-gray-400 ml-1">{unit}</span></p>
    </div>
  );
}

const STATUS_COLORS: Record<string, string> = {
  connected: 'bg-success',
  connecting: 'bg-warning animate-pulse',
  disconnected: 'bg-danger',
  error: 'bg-danger',
};

/**
 * Top-level dashboard page component.
 * Displays high-level system architecture, real-time KPI cards, and navigation shortcuts.
 */
export default function DashboardPage() {
  const { state, status } = useSimWebSocket();
  const m = state?.metrics;

  return (
    <div className="max-w-6xl mx-auto px-6 py-10">
      {/* Header */}
      <div className="mb-10 flex items-start justify-between">
        <div>
          <h1 className="text-4xl font-extrabold text-white mb-2">
            ⬡ WareSwarm
          </h1>
          <p className="text-gray-400 max-w-2xl">
            A warehouse robot fleet simulator with <span className="text-accent">A* path planning</span>,{' '}
            <span className="text-accent-2">swarm coordination</span>, collision avoidance, deadlock detection,
            and dynamic re-planning. All AI logic runs on the Python backend.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className={clsx('h-2.5 w-2.5 rounded-full', STATUS_COLORS[status] || 'bg-gray-500')} />
          <span className="text-sm text-gray-400 capitalize">{status}</span>
        </div>
      </div>

      {/* Quick-start button */}
      <div className="mb-10 flex gap-4">
        <Link
          href="/simulator"
          className="px-6 py-3 bg-accent rounded-lg text-white font-semibold hover:bg-blue-500 transition-colors"
        >
          🚀 Open Simulator
        </Link>
        <Link
          href="/compare"
          className="px-6 py-3 bg-surface-2 border border-surface-2 rounded-lg text-gray-300 font-semibold hover:border-accent transition-colors"
        >
          📊 Compare Planners
        </Link>
      </div>

      {/* Live KPIs */}
      <h2 className="text-lg font-semibold text-gray-300 mb-4">Key Metrics</h2>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <KpiCard label="Tasks Completed" value={m?.tasks_completed ?? 0} color="text-success" />
        <KpiCard label="Collisions" value={m?.collision_count ?? 0} color={(m?.collision_count ?? 0) > 0 ? "text-danger" : "text-success"} />
        <KpiCard label="Deadlocks" value={m?.deadlocks_detected ?? 0} color="text-warning" />
        <KpiCard label="Total Distance" value={Math.round(m?.total_distance ?? 0)} unit="cells" color="text-accent" />
      </div>

      <h2 className="text-sm font-semibold text-gray-400 mb-3 uppercase tracking-wider">Operational Stats</h2>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-10">
        <KpiCard label="Tick" value={m?.tick ?? 0} />
        <KpiCard label="Throughput" value={m?.throughput ?? 0} unit="/ 100t" />
        <KpiCard label="Re-plans" value={m?.replan_count ?? 0} color="text-accent-2" />
        <KpiCard label="Fleet Moving" value={m ? `${m.utilisation_moving}%` : '0%'} />
      </div>

      {/* Architecture summary */}
      <div className="bg-surface border border-surface-2 rounded-xl p-6 text-sm text-gray-300 leading-7">
        <h2 className="text-white font-semibold text-base mb-3">System Architecture</h2>
        <ul className="list-disc list-inside space-y-1">
          <li><span className="text-accent">Python backend</span> – FastAPI + Uvicorn, all AI/planning logic</li>
          <li><span className="text-accent">A* planner</span> – binary heap, 3 heuristics, 4/8-connected</li>
          <li><span className="text-accent">Dijkstra baseline</span> – same interface, no heuristic</li>
          <li><span className="text-accent">Space-time A*</span> – plans in (x,y,t) for conflict-free routing</li>
          <li><span className="text-accent">Swarm coordinator</span> – priority, reservation table, deadlock resolution</li>
          <li><span className="text-accent">Next.js frontend</span> – canvas renderer, no planning logic</li>
          <li><span className="text-accent">SQLite / PostgreSQL</span> – run history persistence</li>
        </ul>
      </div>
    </div>
  );
}
