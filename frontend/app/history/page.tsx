/**
 * Purpose: Simulation run archive browser and metrics inspection console.
 * Role in the project: Fetches historical simulation runs from the database, displays configuration seeds and KPIs, and exports data to JSON/CSV.
 * Key contents: HistoryPage component, JSON/CSV export helpers, run inspection drawer, saved runs table.
 * Talks to: frontend/lib/api.ts (calls /api/runs and /api/runs/:id), frontend/lib/types.ts (SavedRun).
 */

'use client';

import { useEffect, useState } from 'react';
import { api } from '../../lib/api';
import type { SavedRun } from '../../lib/types';

/**
 * Triggers a browser download of raw simulation run metrics as a JSON file.
 */
function downloadJSON(data: unknown, filename: string) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a'); a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}

/**
 * Converts a list of historical simulation runs into CSV format and triggers a browser download.
 */
function downloadCSV(runs: SavedRun[]) {
  const cols = ['id', 'created_at', 'map_preset', 'coordination', 'planner', 'num_robots', 'seed',
    'total_ticks', 'tasks_completed', 'collision_count', 'deadlocks_detected', 'throughput'];
  const rows = runs.map(r => cols.map(c => {
    if (c.startsWith('tasks') || c.startsWith('collision') || c.startsWith('deadlock') || c === 'throughput') {
      return (r.metrics as unknown as Record<string, unknown>)?.[c] ?? '';
    }
    return (r as unknown as Record<string, unknown>)[c] ?? '';
  }).join(','));
  const csv = [cols.join(','), ...rows].join('\n');
  const blob = new Blob([csv], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a'); a.href = url; a.download = 'wareswarm_runs.csv'; a.click();
  URL.revokeObjectURL(url);
}

/**
 * Run history table view component.
 * Displays previous simulation runs, configuration seeds, total ticks, collision counts, and throughput.
 */
export default function HistoryPage() {
  const [runs, setRuns] = useState<SavedRun[]>([]);
  const [selected, setSelected] = useState<SavedRun | null>(null);
  const [filter, setFilter] = useState('');
  const [saving, setSaving] = useState(false);
  const [notes, setNotes] = useState('');

  const load = async () => {
    try { setRuns(await api.getRuns() as SavedRun[]); } catch { /* ignore */ }
  };
  useEffect(() => { load(); }, []);

  const saveRun = async () => {
    setSaving(true);
    try { await api.saveRun(notes); await load(); setNotes(''); }
    finally { setSaving(false); }
  };

  const deleteRun = async (id: number) => {
    await api.deleteRun(id);
    await load();
    if (selected?.id === id) setSelected(null);
  };

  const filtered = runs.filter(r =>
    [r.map_preset, r.coordination, r.planner, String(r.seed)].some(v =>
      v?.toLowerCase().includes(filter.toLowerCase()))
  );

  const tdCls = 'px-3 py-2 text-xs text-gray-300 border-b border-surface-2';
  const thCls = 'px-3 py-2 text-xs text-gray-400 font-semibold text-left border-b border-surface-2';

  return (
    <div className="max-w-7xl mx-auto px-6 py-8">
      <h1 className="text-3xl font-extrabold text-white mb-2">Run History</h1>
      <p className="text-gray-400 text-sm mb-6">Browse saved simulation runs, compare metrics, export data.</p>

      {/* Save current run */}
      <div className="bg-surface border border-surface-2 rounded-xl p-4 mb-6 flex gap-3 items-end">
        <div className="flex-1">
          <label className="text-xs text-gray-400 block mb-1">Notes (optional)</label>
          <input className="w-full bg-surface-2 text-white text-sm rounded px-3 py-2 border border-gray-700"
            value={notes} onChange={e => setNotes(e.target.value)} placeholder="e.g. SWARM congested seed=42" />
        </div>
        <button onClick={saveRun} disabled={saving}
          className="px-5 py-2 bg-accent text-white text-sm font-semibold rounded hover:bg-blue-500 disabled:opacity-50">
          {saving ? 'Saving...' : '💾 Save Current Run'}
        </button>
        <button onClick={() => downloadCSV(runs)}
          className="px-4 py-2 bg-surface-2 text-gray-300 text-sm rounded hover:bg-gray-700">
          ↓ CSV
        </button>
        <button onClick={() => downloadJSON(runs, 'wareswarm_runs.json')}
          className="px-4 py-2 bg-surface-2 text-gray-300 text-sm rounded hover:bg-gray-700">
          ↓ JSON
        </button>
      </div>

      <div className="flex gap-4">
        {/* Table */}
        <div className="flex-1 bg-surface border border-surface-2 rounded-xl overflow-auto">
          <div className="p-3 border-b border-surface-2">
            <input className="bg-surface-2 text-white text-xs rounded px-3 py-1.5 border border-gray-700 w-64"
              placeholder="Filter by preset, mode, planner..." value={filter}
              onChange={e => setFilter(e.target.value)} />
          </div>
          <table className="w-full">
            <thead>
              <tr>
                {['ID', 'Date', 'Map', 'Mode', 'Planner', 'Robots', 'Seed', 'Ticks', 'Tasks', 'Collisions', ''].map(h => (
                  <th key={h} className={thCls}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map(r => (
                <tr key={r.id}
                  className={`cursor-pointer hover:bg-surface-2 ${selected?.id === r.id ? 'bg-surface-2' : ''}`}
                  onClick={() => setSelected(r)}>
                  <td className={tdCls}>{r.id}</td>
                  <td className={tdCls}>{new Date(r.created_at).toLocaleString()}</td>
                  <td className={tdCls}>{r.map_preset}</td>
                  <td className={`${tdCls} ${r.coordination === 'swarm' ? 'text-accent' : 'text-danger'}`}>{r.coordination.toUpperCase()}</td>
                  <td className={tdCls}>{r.planner}</td>
                  <td className={tdCls}>{r.num_robots}</td>
                  <td className={tdCls}>{r.seed ?? '—'}</td>
                  <td className={tdCls}>{r.total_ticks}</td>
                  <td className={tdCls}>{r.metrics?.tasks_completed ?? '—'}</td>
                  <td className={tdCls + (r.metrics?.collision_count ? ' text-danger' : ' text-success')}>
                    {r.metrics?.collision_count ?? '—'}
                  </td>
                  <td className={tdCls}>
                    <button onClick={e => { e.stopPropagation(); deleteRun(r.id); }}
                      className="text-red-400 hover:text-red-300 text-xs">✕</button>
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr><td colSpan={11} className="text-center py-8 text-gray-500 text-sm">No runs saved yet.</td></tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Detail panel */}
        {selected && (
          <div className="w-72 bg-surface border border-surface-2 rounded-xl p-4 text-xs overflow-y-auto">
            <h3 className="text-white font-bold mb-3">Run #{selected.id}</h3>
            {selected.notes && <p className="text-accent mb-3 italic">{selected.notes}</p>}
            <div className="space-y-2 text-gray-300">
              <div><b className="text-gray-400">Map:</b> {selected.map_preset}</div>
              <div><b className="text-gray-400">Mode:</b> <span className={selected.coordination === 'swarm' ? 'text-accent' : 'text-danger'}>{selected.coordination.toUpperCase()}</span></div>
              <div><b className="text-gray-400">Planner:</b> {selected.planner}</div>
              <div><b className="text-gray-400">Robots:</b> {selected.num_robots}</div>
              <div><b className="text-gray-400">Seed:</b> {selected.seed ?? 'random'}</div>
              <div><b className="text-gray-400">Ticks:</b> {selected.total_ticks}</div>
            </div>
            {selected.metrics && (
              <>
                <hr className="border-surface-2 my-3" />
                <h4 className="text-gray-400 font-semibold mb-2">Metrics</h4>
                {Object.entries(selected.metrics as unknown as Record<string, unknown>).map(([k, v]) => (
                  <div key={k} className="flex justify-between text-gray-300 mb-1">
                    <span className="text-gray-500">{k}</span>
                    <span>{String(v)}</span>
                  </div>
                ))}
              </>
            )}
            <button onClick={() => downloadJSON(selected, `run_${selected.id}.json`)}
              className="mt-4 w-full py-1.5 bg-surface-2 text-gray-300 rounded text-xs hover:bg-gray-700">
              ↓ Export JSON
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
