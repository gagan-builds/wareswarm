/**
 * Purpose: Real-time simulation metrics dashboard and performance telemetry panel.
 * Role in the project: Displays live KPI cards, throughput charts, and swarm efficiency statistics.
 * Key contents: MetricsPanel component, KeyCard highlighted metrics, SmallKpi stats, Recharts line chart.
 * Talks to: frontend/lib/types.ts (GlobalMetrics), rendered inside frontend/app/simulator/page.tsx.
 */
'use client';

import type { GlobalMetrics } from '../lib/types';
import { XAxis, YAxis, Tooltip, ResponsiveContainer, LineChart, Line } from 'recharts';
import { useRef } from 'react';

interface Props {
  metrics: GlobalMetrics | null;
}

interface KeyCardProps {
  label: string;
  value: string | number;
  subValue?: string;
  color: string;
  icon: string;
}

/**
 * Highlighted primary KPI card showing high-priority metrics with custom accent colors.
 */
function KeyCard({ label, value, subValue, color, icon }: KeyCardProps) {
  return (
    <div className="bg-surface-2/90 border border-surface-2 rounded-xl p-3 flex flex-col justify-between transition-all hover:border-gray-600">
      <div className="flex items-center justify-between text-xs text-gray-400 mb-1">
        <span className="font-medium tracking-wide uppercase">{label}</span>
        <span className="text-base">{icon}</span>
      </div>
      <div>
        <p className="text-xl font-extrabold tracking-tight" style={{ color }}>
          {value}
        </p>
        {subValue && (
          <p className="text-[11px] text-gray-400 mt-0.5 font-medium">
            {subValue}
          </p>
        )}
      </div>
    </div>
  );
}

/**
 * Compact secondary KPI widget for operational counters and utilization rates.
 */
function SmallKpi({ label, value, color = '#9ca3af' }: { label: string; value: string | number; color?: string }) {
  return (
    <div className="bg-surface-2/60 rounded-lg p-2.5">
      <p className="text-[11px] text-gray-400 mb-0.5">{label}</p>
      <p className="text-sm font-bold" style={{ color }}>{value}</p>
    </div>
  );
}

const DEFAULT_METRICS: GlobalMetrics = {
  tick: 0,
  tasks_completed: 0,
  tasks_pending: 0,
  tasks_in_flight: 0,
  throughput: 0,
  avg_completion_time: 0,
  collision_count: 0,
  collisions_prevented: 0,
  deadlocks_detected: 0,
  deadlocks_resolved: 0,
  replan_count: 0,
  avg_nodes_expanded: 0,
  avg_planning_time_ms: 0,
  utilisation_moving: 0,
  utilisation_waiting: 0,
  utilisation_idle: 100,
  total_distance: 0,
  total_wait_ticks: 0,
  total_move_ticks: 0,
};

/**
 * Main simulation metrics dashboard panel.
 * Computes and renders Key Metrics (Throughput, Collisions Prevented, Deadlocks Resolved, Avg Completion Time)
 * alongside secondary fleet counters and a live throughput history graph.
 * @param {Props} props Component props containing current GlobalMetrics.
 */
export default function MetricsPanel({ metrics }: Props) {
  const m = metrics || DEFAULT_METRICS;
  const histRef = useRef<Array<{ tick: number; throughput: number; wait: number }>>([]);

  if (m.tick > 0) {
    // Only append new distinct ticks
    const last = histRef.current[histRef.current.length - 1];
    if (!last || last.tick !== m.tick) {
      histRef.current.push({ tick: m.tick, throughput: m.throughput, wait: m.total_wait_ticks });
      if (histRef.current.length > 50) histRef.current = histRef.current.slice(-50);
    }
  }

  return (
    <div className="space-y-4">
      {/* 1. KEY METRICS HEADER (Tasks Completed, Collisions, Deadlocks, Total Distance) */}
      <div>
        <div className="flex items-center justify-between mb-2.5">
          <h2 className="text-white font-bold text-sm tracking-wide">Key Metrics</h2>
          <span className="text-[11px] font-mono text-accent bg-accent/10 px-2 py-0.5 rounded">
            Tick {m.tick}
          </span>
        </div>

        <div className="grid grid-cols-2 gap-2">
          {/* Key Metric 1: Tasks Completed */}
          <KeyCard
            label="Tasks Completed"
            value={m.tasks_completed}
            subValue={`${m.tasks_pending} pending / ${m.tasks_in_flight} in flight`}
            color="#10b981"
            icon="✅"
          />

          {/* Key Metric 2: Collisions */}
          <KeyCard
            label="Collisions"
            value={m.collision_count}
            subValue={`${m.collisions_prevented} prevented`}
            color={m.collision_count > 0 ? "#ef4444" : "#10b981"}
            icon="💥"
          />

          {/* Key Metric 3: Deadlocks */}
          <KeyCard
            label="Deadlocks"
            value={m.deadlocks_detected}
            subValue={`${m.deadlocks_resolved} resolved`}
            color={m.deadlocks_detected > 0 ? "#f59e0b" : "#3b82f6"}
            icon="🔓"
          />

          {/* Key Metric 4: Total Distance */}
          <KeyCard
            label="Total Distance"
            value={`${Math.round(m.total_distance)}`}
            subValue="grid cells travelled"
            color="#3b82f6"
            icon="📏"
          />
        </div>
      </div>

      {/* 2. SECONDARY OPERATIONS METRICS */}
      <div>
        <h3 className="text-gray-400 text-xs font-semibold mb-2 uppercase tracking-wider">
          Operations & Performance
        </h3>
        <div className="grid grid-cols-2 gap-2">
          <SmallKpi label="Throughput" value={`${m.throughput}/100t`} color="#3b82f6" />
          <SmallKpi label="Re-plans" value={m.replan_count} color="#8b5cf6" />
          <SmallKpi label="Avg Plan Time" value={`${m.avg_planning_time_ms.toFixed(2)} ms`} />
          <SmallKpi label="Avg Delivery Time" value={`${m.avg_completion_time.toFixed(1)} t`} />
        </div>
      </div>

      {/* 3. FLEET UTILISATION */}
      <div className="bg-surface-2/60 border border-surface-2 rounded-xl p-3">
        <p className="text-xs text-gray-400 mb-2 font-medium">Fleet Utilisation</p>
        <div className="flex rounded-md overflow-hidden h-3.5 text-xs bg-gray-800">
          <div
            className="bg-success transition-all duration-300"
            style={{ width: `${m.utilisation_moving}%` }}
            title={`Moving: ${m.utilisation_moving}%`}
          />
          <div
            className="bg-warning transition-all duration-300"
            style={{ width: `${m.utilisation_waiting}%` }}
            title={`Waiting: ${m.utilisation_waiting}%`}
          />
          <div
            className="bg-gray-600 transition-all duration-300"
            style={{ width: `${m.utilisation_idle}%` }}
            title={`Idle: ${m.utilisation_idle}%`}
          />
        </div>
        <div className="flex justify-between mt-2 text-[11px] text-gray-400">
          <span className="flex items-center"><span className="w-2 h-2 rounded-full bg-success mr-1" />Moving {m.utilisation_moving}%</span>
          <span className="flex items-center"><span className="w-2 h-2 rounded-full bg-warning mr-1" />Waiting {m.utilisation_waiting}%</span>
          <span className="flex items-center"><span className="w-2 h-2 rounded-full bg-gray-600 mr-1" />Idle {m.utilisation_idle}%</span>
        </div>
      </div>

      {/* 4. THROUGHPUT TREND CHART */}
      {histRef.current.length > 2 && (
        <div className="bg-surface-2/60 border border-surface-2 rounded-xl p-3">
          <p className="text-xs text-gray-400 mb-2 font-medium">Throughput History (tasks / 100t)</p>
          <ResponsiveContainer width="100%" height={75}>
            <LineChart data={histRef.current}>
              <XAxis dataKey="tick" tick={false} stroke="#374151" />
              <YAxis tick={{ fontSize: 9, fill: '#9ca3af' }} width={24} stroke="#374151" />
              <Tooltip
                contentStyle={{ background: '#111827', border: '1px solid #374151', borderRadius: '6px', fontSize: 11 }}
              />
              <Line type="monotone" dataKey="throughput" stroke="#3b82f6" dot={false} strokeWidth={2} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}
