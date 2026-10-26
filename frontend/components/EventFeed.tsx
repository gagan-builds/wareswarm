/**
 * Purpose: Real-time simulation event feed log component.
 * Role in the project: Visual diagnostic HUD rendering timestamped chronological alerts for collisions, tasks, and deadlocks.
 * Key contents: EventFeed component, EVENT_STYLES color map, EVENT_ICONS emoji dictionary.
 * Talks to: frontend/lib/types.ts (SimEvent interface), rendered by frontend/app/simulator/page.tsx.
 */
'use client';

import type { SimEvent } from '../lib/types';

interface Props {
  events: SimEvent[];
}

const EVENT_STYLES: Record<string, string> = {
  collision: 'text-red-400',
  deadlock_resolved: 'text-yellow-400',
  deadlock_detected: 'text-orange-400',
  task_completed: 'text-green-400',
  replan: 'text-purple-400',
  conflict_resolved: 'text-blue-400',
  task_assigned: 'text-cyan-400',
  pickup: 'text-emerald-400',
  robot_blocked: 'text-red-300',
};

const EVENT_ICONS: Record<string, string> = {
  collision: '💥',
  deadlock_resolved: '🔓',
  deadlock_detected: '🔒',
  task_completed: '✅',
  replan: '🔄',
  conflict_resolved: '⚠️',
  task_assigned: '📋',
  pickup: '📦',
  robot_blocked: '🚫',
};

/**
 * Diagnostic live event stream.
 * Renders a reverse-chronological list of simulation events (collisions, task completion, replanning) with color badges.
 * @param {Props} props Component props containing the list of recent SimEvent objects.
 */
export default function EventFeed({ events }: Props) {
  return (
    <div className="bg-surface border border-surface-2 rounded-xl p-4 h-full overflow-hidden flex flex-col">
      <h2 className="text-white font-bold mb-3 text-sm">Event Feed</h2>
      <div className="overflow-y-auto flex-1 space-y-1.5 text-xs font-mono">
        {events.length === 0 && (
          <p className="text-gray-500">No events yet.</p>
        )}
        {[...events].reverse().map((ev, i) => (
          <div key={i} className={`${EVENT_STYLES[ev.type] ?? 'text-gray-400'} flex gap-2`}>
            <span className="shrink-0">[{ev.tick}]</span>
            <span className="shrink-0">{EVENT_ICONS[ev.type] ?? '•'}</span>
            <span className="truncate">
              {ev.type.replace(/_/g, ' ')}
              {ev.robot_id !== undefined ? ` R${ev.robot_id}` : ''}
              {ev.task_id !== undefined ? ` T${ev.task_id}` : ''}
              {ev.completion_time !== undefined ? ` (${ev.completion_time}t)` : ''}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
