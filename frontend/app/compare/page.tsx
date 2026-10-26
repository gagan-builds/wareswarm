/**
 * Purpose: Algorithmic benchmarking suite for path planning and multi-agent swarm coordination.
 * Role in the project: Provides visual side-by-side comparison between A* and Dijkstra, and automated headless benchmarking between NAIVE and SWARM coordination.
 * Key contents: ComparePage component, SinglePlannerCanvas visual grid renderer, comparison metrics tables, Recharts grouped bar charts, advanced run comparator.
 * Talks to: frontend/lib/api.ts (calls /api/planner/compare and /api/compare/modes), frontend/lib/types.ts.
 */

'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import { api } from '../../lib/api';
import type { PlannerCompareResult, CompareModesResult, GlobalMetrics, GridData } from '../../lib/types';
import { BarChart, Bar, XAxis, YAxis, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import clsx from 'clsx';

// ---------------------------------------------------------------------------
// Single planner grid canvas (shows obstacles, explored tint, and bright path)
// ---------------------------------------------------------------------------

/**
 * Mini canvas rendering a planner's search space, obstacles, start/goal markers, explored cells tint, and final path.
 */
function SinglePlannerCanvas({
  title,
  gridData,
  path,
  explored,
  start,
  goal,
  pathColor,
  exploredColor,
  onClickCell,
}: {
  title: string;
  gridData: GridData | null;
  path: [number, number][];
  explored: [number, number][];
  start: [number, number];
  goal: [number, number];
  pathColor: string;
  exploredColor: string;
  onClickCell?: (r: number, c: number) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !gridData) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const width = gridData.width;
    const height = gridData.height;
    const CELL = Math.floor(Math.min(canvas.width / width, canvas.height / height));
    if (CELL < 1) return;

    const offsetX = Math.floor((canvas.width - CELL * width) / 2);
    const offsetY = Math.floor((canvas.height - CELL * height) / 2);

    ctx.fillStyle = '#0a0e1a';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // 1. Base grid
    const CELL_COLORS = ['#0d1117', '#374151', '#854d0e', '#047857', '#3730a3'];
    for (let r = 0; r < height; r++) {
      for (let c = 0; c < width; c++) {
        const ct = gridData.cells[r]?.[c] ?? 0;
        ctx.fillStyle = CELL_COLORS[ct] ?? CELL_COLORS[0];
        ctx.fillRect(offsetX + c * CELL, offsetY + r * CELL, CELL, CELL);
        ctx.strokeStyle = '#1e293b';
        ctx.lineWidth = 0.5;
        ctx.strokeRect(offsetX + c * CELL + 0.5, offsetY + r * CELL + 0.5, CELL - 1, CELL - 1);
      }
    }

    // 2. Explored cells tint
    ctx.fillStyle = exploredColor;
    for (const [er, ec] of explored) {
      if ((er === start[0] && ec === start[1]) || (er === goal[0] && ec === goal[1])) continue;
      ctx.fillRect(offsetX + ec * CELL + 1, offsetY + er * CELL + 1, CELL - 2, CELL - 2);
    }

    // 3. Final path line
    if (path && path.length > 0) {
      ctx.beginPath();
      ctx.strokeStyle = pathColor;
      ctx.lineWidth = Math.max(2, CELL * 0.28);
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';

      ctx.moveTo(offsetX + start[1] * CELL + CELL / 2, offsetY + start[0] * CELL + CELL / 2);
      for (const [pr, pc] of path) {
        ctx.lineTo(offsetX + pc * CELL + CELL / 2, offsetY + pr * CELL + CELL / 2);
      }
      ctx.stroke();
    }

    // 4. Start (green) & Goal (red) markers
    const drawMarker = (r: number, c: number, color: string, label: string) => {
      const cx = offsetX + c * CELL + CELL / 2;
      const cy = offsetY + r * CELL + CELL / 2;
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(cx, cy, Math.max(3.5, CELL * 0.38), 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 1;
      ctx.stroke();

      if (CELL >= 14) {
        ctx.fillStyle = '#ffffff';
        ctx.font = `bold ${Math.max(8, CELL * 0.35)}px sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(label, cx, cy);
      }
    };

    drawMarker(start[0], start[1], '#10b981', 'S');
    drawMarker(goal[0], goal[1], '#ef4444', 'G');
  }, [gridData, path, explored, start, goal, pathColor, exploredColor]);

  const handleCanvasClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!onClickCell || !gridData) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const CELL = Math.floor(Math.min(canvas.width / gridData.width, canvas.height / gridData.height));
    if (CELL < 1) return;
    const offsetX = Math.floor((canvas.width - CELL * gridData.width) / 2);
    const offsetY = Math.floor((canvas.height - CELL * gridData.height) / 2);

    const c = Math.floor((x - offsetX) / CELL);
    const r = Math.floor((y - offsetY) / CELL);
    if (r >= 0 && r < gridData.height && c >= 0 && c < gridData.width) {
      onClickCell(r, c);
    }
  };

  return (
    <div className="flex flex-col bg-surface border border-surface-2 rounded-xl p-3">
      <div className="flex justify-between items-center mb-2 px-1">
        <span className="text-white font-bold text-sm">{title}</span>
        <div className="flex items-center gap-3 text-[11px] text-gray-400">
          <span className="flex items-center gap-1">
            <span className="inline-block w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: exploredColor }} />
            Explored ({explored.length})
          </span>
          <span className="flex items-center gap-1">
            <span className="inline-block w-3 h-1 rounded" style={{ backgroundColor: pathColor }} />
            Path ({path.length})
          </span>
        </div>
      </div>
      <div className="relative w-full aspect-[3/2] min-h-[220px]">
        <canvas
          ref={canvasRef}
          width={600}
          height={400}
          onClick={handleCanvasClick}
          className="w-full h-full rounded-lg bg-surface-2 cursor-crosshair"
        />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main Compare Page
// ---------------------------------------------------------------------------

/**
 * Comprehensive algorithmic comparison page.
 * Features:
 * 1. A* vs Dijkstra Visual Comparison: Interactive side-by-side grids showing node expansion and search runtime.
 * 2. NAIVE vs SWARM Headless Benchmark: Automated identical-seed simulation comparing collisions, deadlocks, and throughput.
 */
export default function ComparePage() {
  // ---- Planner Compare State ----
  const [plannerPreset, setPlannerPreset] = useState('warehouse');
  const [gridData, setGridData] = useState<GridData | null>(null);
  const [planResult, setPlanResult] = useState<PlannerCompareResult | null>(null);
  const [form, setForm] = useState({ sr: 1, sc: 1, gr: 18, gc: 28, heuristic: 'manhattan', connectivity: 4 });
  const [clickTarget, setClickTarget] = useState<'start' | 'goal'>('start');
  const [comparingPlan, setComparingPlan] = useState(false);
  const [planError, setPlanError] = useState('');

  // ---- One-Click NAIVE vs SWARM State ----
  const [modePreset, setModePreset] = useState('congested');
  const [modeRobots, setModeRobots] = useState(10);
  const [modeSeed, setModeSeed] = useState('42');
  const [modeMaxTicks, setModeMaxTicks] = useState(200);
  const [comparingModes, setComparingModes] = useState(false);
  const [modesResult, setModesResult] = useState<CompareModesResult | null>(null);
  const [modeError, setModeError] = useState('');

  // ---- Advanced / Old Run Compare State ----
  const [runIds, setRunIds] = useState('');
  const [runCompare, setRunCompare] = useState<any[] | null>(null);
  const [comparingRuns, setComparingRuns] = useState(false);
  const [runCompareError, setRunCompareError] = useState<string | null>(null);
  const [availableRuns, setAvailableRuns] = useState<any[]>([]);
  const [customMaps, setCustomMaps] = useState<Array<{ id: number; name: string; width: number; height: number; robot_count: number }>>([]);

  // Load available saved runs and custom maps from database for quick selection
  useEffect(() => {
    api.getRuns()
      .then((data) => {
        if (Array.isArray(data)) {
          setAvailableRuns(data as any[]);
        }
      })
      .catch(() => {});

    api.getCustomMaps()
      .then((maps) => {
        if (Array.isArray(maps)) {
          setCustomMaps(maps as any[]);
        }
      })
      .catch(() => {});
  }, []);

  // Load preset or custom map for planner visual comparison
  const loadPlannerMap = useCallback(async (preset: string) => {
    try {
      if (preset === 'current_simulator') {
        const m = await api.getMap() as GridData;
        setGridData(m);
        setForm(p => ({
          ...p,
          sr: Math.min(p.sr, m.height - 1),
          sc: Math.min(p.sc, m.width - 1),
          gr: Math.min(p.gr, m.height - 1),
          gc: Math.min(p.gc, m.width - 1),
        }));
      } else if (preset.startsWith('custom_')) {
        const id = Number(preset.replace('custom_', ''));
        const m = await api.getCustomMap(id);
        if (m && m.cells) {
          setGridData({ width: m.width, height: m.height, cells: m.cells });
          setForm(p => ({
            ...p,
            sr: Math.min(p.sr, m.height - 1),
            sc: Math.min(p.sc, m.width - 1),
            gr: Math.min(p.gr, m.height - 1),
            gc: Math.min(p.gc, m.width - 1),
          }));
        }
      } else {
        const m = await api.getPreset(preset) as GridData;
        setGridData(m);
      }
    } catch {
      try {
        const m = await api.getMap() as GridData;
        setGridData(m);
      } catch { /* ignore */ }
    }
  }, []);

  useEffect(() => {
    loadPlannerMap(plannerPreset);
  }, [plannerPreset, loadPlannerMap]);

  // Click grid to set start or goal
  const handleGridCellClick = (r: number, c: number) => {
    if (!gridData) return;
    const ct = gridData.cells[r]?.[c] ?? 0;
    if (ct === 1) {
      setPlanError(`Cell (${r}, ${c}) is an obstacle. Please pick a traversable cell.`);
      return;
    }
    setPlanError('');
    if (clickTarget === 'start') {
      setForm(p => ({ ...p, sr: r, sc: c }));
      setClickTarget('goal');
    } else {
      setForm(p => ({ ...p, gr: r, gc: c }));
      setClickTarget('start');
    }
  };

  // Run A* vs Dijkstra Comparison
  const handleComparePlanners = async () => {
    setComparingPlan(true);
    setPlanError('');
    try {
      const res = await api.comparePlanners({
        start_row: form.sr,
        start_col: form.sc,
        goal_row: form.gr,
        goal_col: form.gc,
        heuristic: form.heuristic,
        connectivity: form.connectivity,
        map_preset: plannerPreset,
        cells: gridData?.cells,
      }) as PlannerCompareResult;
      setPlanResult(res);
      if (res.grid) setGridData(res.grid);
      if (!res.astar.success && !res.dijkstra.success) {
        setPlanError('No path found between the selected start and goal on this map.');
      }
    } catch (e: unknown) {
      setPlanError(e instanceof Error ? e.message : 'Planner comparison failed');
    } finally {
      setComparingPlan(false);
    }
  };

  // Run One-Click NAIVE vs SWARM Comparison
  const handleRunModesCompare = async () => {
    setComparingModes(true);
    setModeError('');
    try {
      const res = await api.compareModes({
        map_preset: modePreset,
        num_robots: Number(modeRobots),
        seed: modeSeed.trim() === '' ? null : Number(modeSeed),
        max_ticks: Number(modeMaxTicks),
      }) as CompareModesResult;
      setModesResult(res);
      if (modeSeed.trim() === '' && res.seed) {
        setModeSeed(String(res.seed));
      }
    } catch (e: unknown) {
      setModeError(e instanceof Error ? e.message : 'Mode comparison failed');
    } finally {
      setComparingModes(false);
    }
  };

  // Legacy Run Compare by IDs
  const handleLegacyRunCompare = async () => {
    let raw = runIds.trim();
    if (!raw && availableRuns.length >= 2) {
      raw = `${availableRuns[0].id}, ${availableRuns[1].id}`;
      setRunIds(raw);
    } else if (!raw && availableRuns.length === 1) {
      raw = `${availableRuns[0].id}`;
      setRunIds(raw);
    }
    const ids = raw.split(',').map(s => Number(s.trim())).filter(n => !isNaN(n) && n > 0);
    if (ids.length === 0) {
      setRunCompareError('Please enter run IDs (e.g. 8, 9) or click one of the available runs below.');
      return;
    }
    setComparingRuns(true);
    setRunCompareError(null);
    try {
      const res = await api.compareRuns(ids) as any[];
      setRunCompare(res);
      if (!res || res.length === 0) {
        setRunCompareError('No runs found matching the provided IDs.');
      }
    } catch (e: unknown) {
      setRunCompareError(e instanceof Error ? e.message : 'Error comparing runs');
    } finally {
      setComparingRuns(false);
    }
  };

  const inputCls = 'bg-surface-2 text-white text-xs rounded px-2.5 py-1.5 border border-gray-700 w-full focus:outline-none focus:border-accent';

  // Grouped bar chart data for NAIVE vs SWARM
  const chartData = modesResult ? [
    { metric: 'Collisions', NAIVE: modesResult.naive.metrics.collision_count, SWARM: modesResult.swarm.metrics.collision_count },
    { metric: 'Deadlocks', NAIVE: modesResult.naive.metrics.deadlocks_detected, SWARM: modesResult.swarm.metrics.deadlocks_detected },
    { metric: 'Tasks Done', NAIVE: modesResult.naive.metrics.tasks_completed, SWARM: modesResult.swarm.metrics.tasks_completed },
    { metric: 'Throughput', NAIVE: Number(modesResult.naive.metrics.throughput.toFixed(1)), SWARM: Number(modesResult.swarm.metrics.throughput.toFixed(1)) },
  ] : [];

  return (
    <div className="max-w-7xl mx-auto px-6 py-8">
      <h1 className="text-3xl font-extrabold text-white mb-2">Compare</h1>
      <p className="text-gray-400 mb-8 text-sm">
        A* vs Dijkstra algorithm benchmark · Headless NAIVE vs SWARM coordination comparison
      </p>

      {/* =================================================================== */}
      {/* SECTION 1: A* vs Dijkstra Visual Comparison                         */}
      {/* =================================================================== */}
      <div className="bg-surface border border-surface-2 rounded-xl p-6 mb-10">
        <div className="flex flex-wrap items-center justify-between gap-4 mb-4">
          <div>
            <h2 className="text-lg font-bold text-white">A* vs Dijkstra – Visual Planner Benchmark</h2>
            <p className="text-xs text-gray-400 mt-0.5">
              Compare search exploration patterns, node expansion counts, and path optimality side-by-side.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-xs text-gray-400">Map Layout:</span>
            <select
              value={plannerPreset}
              onChange={e => setPlannerPreset(e.target.value)}
              className="bg-surface-2 text-white text-xs rounded px-2.5 py-1.5 border border-gray-700 focus:outline-none"
            >
              <optgroup label="Standard Presets">
                <option value="warehouse">Warehouse (Aisles & Crossways)</option>
                <option value="congested">Congested (Narrow Corridors)</option>
                <option value="open_floor">Open Floor</option>
                <option value="random">Random Obstacles</option>
              </optgroup>
              <optgroup label="Active Simulation Map">
                <option value="current_simulator">⭐ Current Active Map (from Simulator)</option>
              </optgroup>
              {customMaps.length > 0 && (
                <optgroup label="Custom Maps Library">
                  {customMaps.map(cm => (
                    <option key={cm.id} value={`custom_${cm.id}`}>
                      🗺️ {cm.name} ({cm.width}x{cm.height})
                    </option>
                  ))}
                </optgroup>
              )}
            </select>
          </div>
        </div>

        {planError && (
          <div className="bg-rose-950/40 border border-rose-500/80 text-rose-300 text-xs rounded-lg p-3 mb-4">
            {planError}
          </div>
        )}

        {/* Coordinate inputs & Click to set helper */}
        <div className="bg-surface-2/60 border border-gray-700/60 rounded-xl p-4 mb-5">
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-3 mb-3">
            <div>
              <label className="text-[11px] text-gray-400 block mb-1">Start Row</label>
              <input type="number" className={inputCls} value={form.sr} onChange={e => setForm(p => ({ ...p, sr: Number(e.target.value) }))} />
            </div>
            <div>
              <label className="text-[11px] text-gray-400 block mb-1">Start Col</label>
              <input type="number" className={inputCls} value={form.sc} onChange={e => setForm(p => ({ ...p, sc: Number(e.target.value) }))} />
            </div>
            <div>
              <label className="text-[11px] text-gray-400 block mb-1">Goal Row</label>
              <input type="number" className={inputCls} value={form.gr} onChange={e => setForm(p => ({ ...p, gr: Number(e.target.value) }))} />
            </div>
            <div>
              <label className="text-[11px] text-gray-400 block mb-1">Goal Col</label>
              <input type="number" className={inputCls} value={form.gc} onChange={e => setForm(p => ({ ...p, gc: Number(e.target.value) }))} />
            </div>
            <div>
              <label className="text-[11px] text-gray-400 block mb-1">Heuristic</label>
              <select className={inputCls} value={form.heuristic} onChange={e => setForm(p => ({ ...p, heuristic: e.target.value }))}>
                <option value="manhattan">Manhattan</option>
                <option value="euclidean">Euclidean</option>
                <option value="octile">Octile</option>
              </select>
            </div>
            <div>
              <label className="text-[11px] text-gray-400 block mb-1">Connectivity</label>
              <select className={inputCls} value={form.connectivity} onChange={e => setForm(p => ({ ...p, connectivity: Number(e.target.value) }))}>
                <option value={4}>4-connected</option>
                <option value={8}>8-connected</option>
              </select>
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
            <div className="flex items-center gap-2">
              <span className="text-xs text-gray-400">Click Grid Mode:</span>
              <button
                type="button"
                onClick={() => setClickTarget('start')}
                className={clsx('px-2.5 py-1 rounded text-xs font-semibold transition-colors', clickTarget === 'start' ? 'bg-emerald-600 text-white' : 'bg-surface-2 text-gray-400')}
              >
                📍 Setting Start ({form.sr}, {form.sc})
              </button>
              <button
                type="button"
                onClick={() => setClickTarget('goal')}
                className={clsx('px-2.5 py-1 rounded text-xs font-semibold transition-colors', clickTarget === 'goal' ? 'bg-rose-600 text-white' : 'bg-surface-2 text-gray-400')}
              >
                🏁 Setting Goal ({form.gr}, {form.gc})
              </button>
            </div>

            <button
              onClick={handleComparePlanners}
              disabled={comparingPlan}
              className="px-5 py-2 bg-accent text-white text-xs font-semibold rounded-lg hover:bg-blue-500 disabled:opacity-50 transition-colors"
            >
              {comparingPlan ? 'Computing Paths...' : '⚡ Compare Planners'}
            </button>
          </div>
        </div>

        {/* Visual Grids Side-by-Side */}
        <div className="grid md:grid-cols-2 gap-6 mb-4">
          <SinglePlannerCanvas
            title="A* (Informed Heuristic Search)"
            gridData={gridData}
            path={planResult?.astar.path ?? []}
            explored={planResult?.astar.explored_cells ?? []}
            start={[form.sr, form.sc]}
            goal={[form.gr, form.gc]}
            pathColor="#38bdf8"
            exploredColor="rgba(56, 189, 248, 0.22)"
            onClickCell={handleGridCellClick}
          />

          <SinglePlannerCanvas
            title="Dijkstra (Uniform Cost Baseline)"
            gridData={gridData}
            path={planResult?.dijkstra.path ?? []}
            explored={planResult?.dijkstra.explored_cells ?? []}
            start={[form.sr, form.sc]}
            goal={[form.gr, form.gc]}
            pathColor="#fbbf24"
            exploredColor="rgba(251, 191, 36, 0.22)"
            onClickCell={handleGridCellClick}
          />
        </div>

        {/* Stats & One-line summary */}
        {planResult && (
          <div className="bg-surface-2/60 border border-gray-700/60 rounded-xl p-4">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-3">
              <div className="bg-surface rounded-lg p-3">
                <span className="text-[11px] text-gray-400 block mb-1">Path Cost (Optimality)</span>
                <div className="flex gap-4 font-mono text-sm">
                  <span className="text-sky-400">A*: <b>{planResult.astar.cost >= 0 ? planResult.astar.cost.toFixed(2) : '—'}</b></span>
                  <span className="text-amber-400">Dijkstra: <b>{planResult.dijkstra.cost >= 0 ? planResult.dijkstra.cost.toFixed(2) : '—'}</b></span>
                </div>
              </div>

              <div className="bg-surface rounded-lg p-3">
                <span className="text-[11px] text-gray-400 block mb-1">Nodes Expanded</span>
                <div className="flex gap-4 font-mono text-sm">
                  <span className="text-sky-400">A*: <b>{planResult.astar.expanded_nodes}</b></span>
                  <span className="text-amber-400">Dijkstra: <b>{planResult.dijkstra.expanded_nodes}</b></span>
                </div>
              </div>

              <div className="bg-surface rounded-lg p-3">
                <span className="text-[11px] text-gray-400 block mb-1">Runtime (ms)</span>
                <div className="flex gap-4 font-mono text-sm">
                  <span className="text-sky-400">A*: <b>{planResult.astar.runtime_ms.toFixed(2)}ms</b></span>
                  <span className="text-amber-400">Dijkstra: <b>{planResult.dijkstra.runtime_ms.toFixed(2)}ms</b></span>
                </div>
              </div>

              <div className="bg-surface rounded-lg p-3">
                <span className="text-[11px] text-gray-400 block mb-1">Path Length (Steps)</span>
                <div className="flex gap-4 font-mono text-sm">
                  <span className="text-sky-400">A*: <b>{planResult.astar.path_length}</b></span>
                  <span className="text-amber-400">Dijkstra: <b>{planResult.dijkstra.path_length}</b></span>
                </div>
              </div>
            </div>

            {/* One-line takeaway summary */}
            {planResult.astar.success && planResult.dijkstra.success && planResult.dijkstra.expanded_nodes > 0 && (
              <div className="text-xs text-emerald-400 font-semibold bg-emerald-950/40 border border-emerald-800/80 rounded-lg px-3 py-2">
                ✨ A* expanded {Math.max(0, Math.round(((planResult.dijkstra.expanded_nodes - planResult.astar.expanded_nodes) / planResult.dijkstra.expanded_nodes) * 100))}% fewer nodes ({planResult.astar.expanded_nodes} vs {planResult.dijkstra.expanded_nodes}) while achieving identical optimal path cost ({planResult.astar.cost.toFixed(2)}).
              </div>
            )}
          </div>
        )}
      </div>

      {/* =================================================================== */}
      {/* SECTION 2: One-Click NAIVE vs SWARM Comparison                      */}
      {/* =================================================================== */}
      <div className="bg-surface border border-surface-2 rounded-xl p-6 mb-8">
        <div className="flex flex-wrap items-center justify-between gap-4 mb-4">
          <div>
            <h2 className="text-lg font-bold text-white">One-Click NAIVE vs SWARM Comparison</h2>
            <p className="text-xs text-gray-400 mt-0.5">
              Executes two full headless simulations on the exact same seed without real-time delay to scientifically prove coordination value.
            </p>
          </div>
        </div>

        {modeError && (
          <div className="bg-rose-950/40 border border-rose-500/80 text-rose-300 text-xs rounded-lg p-3 mb-4">
            {modeError}
          </div>
        )}

        {/* Comparison Parameters Form */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 bg-surface-2/60 border border-gray-700/60 rounded-xl p-4 mb-5">
          <div>
            <label className="text-[11px] text-gray-400 block mb-1">Map Layout</label>
            <select
              value={modePreset}
              onChange={e => {
                const val = e.target.value;
                setModePreset(val);
                if (val.startsWith('custom_')) {
                  const cm = customMaps.find(m => `custom_${m.id}` === val);
                  if (cm && cm.robot_count) {
                    setModeRobots(Math.min(cm.robot_count, 30));
                  }
                }
              }}
              className={inputCls}
            >
              <optgroup label="Standard Presets">
                <option value="congested">Congested (High Conflict)</option>
                <option value="warehouse">Warehouse (Parallel Aisles)</option>
                <option value="open_floor">Open Floor</option>
                <option value="random">Random Map</option>
              </optgroup>
              <optgroup label="Active Simulation Map">
                <option value="current_simulator">⭐ Current Active Map (from Simulator)</option>
              </optgroup>
              {customMaps.length > 0 && (
                <optgroup label="Custom Maps Library">
                  {customMaps.map(cm => (
                    <option key={cm.id} value={`custom_${cm.id}`}>
                      🗺️ {cm.name} ({cm.width}x{cm.height})
                    </option>
                  ))}
                </optgroup>
              )}
            </select>
          </div>

          <div>
            <label className="text-[11px] text-gray-400 block mb-1">Robots (1-30)</label>
            <input
              type="number"
              min={1}
              max={30}
              value={modeRobots}
              onChange={e => setModeRobots(Number(e.target.value))}
              className={inputCls}
            />
          </div>

          <div>
            <label className="text-[11px] text-gray-400 block mb-1">Seed (Deterministic)</label>
            <div className="flex gap-1.5">
              <input
                type="text"
                placeholder="Auto-generate"
                value={modeSeed}
                onChange={e => setModeSeed(e.target.value)}
                className={inputCls}
              />
              <button
                type="button"
                onClick={() => setModeSeed(String(Math.floor(Math.random() * 900000) + 100000))}
                className="px-2 py-1 bg-surface-2 hover:bg-gray-700 text-xs rounded border border-gray-700 text-gray-300"
                title="Randomize seed"
              >
                🎲
              </button>
            </div>
          </div>

          <div>
            <label className="text-[11px] text-gray-400 block mb-1">Max Ticks</label>
            <input
              type="number"
              min={20}
              max={1000}
              step={50}
              value={modeMaxTicks}
              onChange={e => setModeMaxTicks(Number(e.target.value))}
              className={inputCls}
            />
          </div>

          <div className="col-span-2 sm:col-span-4 flex justify-end pt-1">
            <button
              onClick={handleRunModesCompare}
              disabled={comparingModes}
              className="px-6 py-2.5 bg-accent hover:bg-blue-500 text-white text-xs font-bold rounded-lg shadow disabled:opacity-50 transition-colors"
            >
              {comparingModes ? '⚡ Running Headless Comparison (NAIVE & SWARM)...' : '🚀 Run NAIVE vs SWARM'}
            </button>
          </div>
        </div>

        {/* Results: Side-by-side Table & Recharts Bar Chart */}
        {modesResult && (
          <div className="space-y-6">
            <div className="flex items-center justify-between text-xs text-gray-400 bg-surface-2 px-3 py-2 rounded-lg border border-gray-700/60">
              <span><b>Seed Used:</b> <code className="text-amber-400">{modesResult.seed}</code></span>
              <span><b>Map:</b> {modesResult.map_preset} | <b>Robots:</b> {modesResult.num_robots} | <b>Ticks:</b> {modesResult.max_ticks}</span>
              <div className="flex gap-3">
                <a href={`/history`} className="text-accent underline">Saved Run #{modesResult.naive.run_id} (NAIVE)</a>
                <a href={`/history`} className="text-accent underline">Saved Run #{modesResult.swarm.run_id} (SWARM)</a>
              </div>
            </div>

            {/* Metrics Comparison Table with Best Highlight */}
            <div className="overflow-x-auto rounded-xl border border-surface-2">
              <table className="w-full text-xs">
                <thead>
                  <tr className="bg-surface-2 text-gray-400 text-left border-b border-surface-2">
                    <th className="py-2.5 px-4">Performance Metric</th>
                    <th className="py-2.5 px-4 text-rose-400 font-bold">NAIVE Mode (Uncoordinated)</th>
                    <th className="py-2.5 px-4 text-emerald-400 font-bold">SWARM Mode (Coordinated)</th>
                    <th className="py-2.5 px-4 text-gray-400">Advantage</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-surface-2 text-gray-300">
                  {[
                    { label: 'Collisions', naive: modesResult.naive.metrics.collision_count, swarm: modesResult.swarm.metrics.collision_count, lowerBetter: true },
                    { label: 'Collisions Prevented', naive: modesResult.naive.metrics.collisions_prevented, swarm: modesResult.swarm.metrics.collisions_prevented, lowerBetter: false },
                    { label: 'Deadlocks Detected', naive: modesResult.naive.metrics.deadlocks_detected, swarm: modesResult.swarm.metrics.deadlocks_detected, lowerBetter: true },
                    { label: 'Deadlocks Resolved', naive: modesResult.naive.metrics.deadlocks_resolved, swarm: modesResult.swarm.metrics.deadlocks_resolved, lowerBetter: false },
                    { label: 'Total Waiting Time (ticks)', naive: modesResult.naive.metrics.total_wait_ticks, swarm: modesResult.swarm.metrics.total_wait_ticks, lowerBetter: true },
                    { label: 'Total Distance Traveled', naive: modesResult.naive.metrics.total_distance.toFixed(1), swarm: modesResult.swarm.metrics.total_distance.toFixed(1), lowerBetter: false },
                    { label: 'Dynamic Re-plans', naive: modesResult.naive.metrics.replan_count, swarm: modesResult.swarm.metrics.replan_count, lowerBetter: true },
                    { label: 'Tasks Completed', naive: modesResult.naive.metrics.tasks_completed, swarm: modesResult.swarm.metrics.tasks_completed, lowerBetter: false },
                    { label: 'Fleet Throughput (/100t)', naive: modesResult.naive.metrics.throughput.toFixed(2), swarm: modesResult.swarm.metrics.throughput.toFixed(2), lowerBetter: false },
                  ].map((row, i) => {
                    const nVal = Number(row.naive);
                    const sVal = Number(row.swarm);
                    const swarmWon = row.lowerBetter ? sVal < nVal : sVal > nVal;
                    const naiveWon = row.lowerBetter ? nVal < sVal : nVal > sVal;
                    return (
                      <tr key={i} className="hover:bg-surface-2/40">
                        <td className="py-2 px-4 font-medium text-gray-300">{row.label}</td>
                        <td className={clsx('py-2 px-4 font-mono font-bold', naiveWon ? 'text-emerald-400 bg-emerald-950/20' : 'text-gray-300')}>
                          {row.naive}
                        </td>
                        <td className={clsx('py-2 px-4 font-mono font-bold', swarmWon ? 'text-emerald-400 bg-emerald-950/20' : 'text-gray-300')}>
                          {row.swarm} {swarmWon && '🏆'}
                        </td>
                        <td className="py-2 px-4 text-xs font-semibold">
                          {swarmWon ? (
                            <span className="text-emerald-400">SWARM Superior</span>
                          ) : naiveWon ? (
                            <span className="text-rose-400">NAIVE Higher</span>
                          ) : (
                            <span className="text-gray-500">Parity</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Recharts Grouped Bar Chart */}
            <div className="bg-surface-2/40 border border-gray-700/60 rounded-xl p-4">
              <h3 className="text-xs font-bold text-gray-300 mb-4">Core Metrics Comparison (NAIVE vs SWARM)</h3>
              <ResponsiveContainer width="100%" height={260}>
                <BarChart data={chartData} margin={{ top: 10, right: 20, left: 0, bottom: 5 }}>
                  <XAxis dataKey="metric" tick={{ fill: '#9ca3af', fontSize: 11 }} />
                  <YAxis tick={{ fill: '#9ca3af', fontSize: 11 }} />
                  <Tooltip contentStyle={{ background: '#111827', border: '1px solid #374151', borderRadius: 8, fontSize: 12 }} />
                  <Legend wrapperStyle={{ fontSize: 12, color: '#d1d5db' }} />
                  <Bar dataKey="NAIVE" fill="#ef4444" name="NAIVE" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="SWARM" fill="#10b981" name="SWARM" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}

        {/* Collapsible Advanced Section for manual run IDs */}
        <details className="mt-8 border border-surface-2 rounded-lg p-4 group" open>
          <summary className="cursor-pointer text-gray-300 text-xs font-semibold select-none hover:text-white flex items-center justify-between">
            <span>▸ Advanced: Compare Saved Runs by ID</span>
            {availableRuns.length > 0 && (
              <span className="text-[11px] font-mono text-gray-400">{availableRuns.length} runs in database</span>
            )}
          </summary>
          <div className="pt-4">
            <p className="text-gray-400 text-xs mb-3">
              Enter database run IDs separated by commas to compare metrics side-by-side.
            </p>

            {/* Quick chips for available database runs */}
            {availableRuns.length > 0 && (
              <div className="flex flex-wrap items-center gap-1.5 mb-3 text-xs">
                <span className="text-gray-400 text-[11px]">Available runs:</span>
                {availableRuns.slice(0, 8).map(r => (
                  <button
                    key={r.id}
                    type="button"
                    onClick={() => {
                      setRunIds(prev => {
                        const list = prev ? prev.split(',').map(s => s.trim()).filter(Boolean) : [];
                        if (!list.includes(String(r.id))) list.push(String(r.id));
                        return list.join(', ');
                      });
                    }}
                    className="px-2 py-0.5 rounded bg-surface-2 hover:bg-gray-700 border border-gray-700 text-gray-300 hover:text-white font-mono text-[11px] transition-colors"
                    title={`Click to add Run #${r.id}`}
                  >
                    #{r.id} ({r.coordination?.toUpperCase()})
                  </button>
                ))}
              </div>
            )}

            <div className="flex gap-3 mb-4">
              <input
                className={inputCls + ' flex-1'}
                placeholder="e.g. 8, 9"
                value={runIds}
                onChange={e => setRunIds(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') handleLegacyRunCompare(); }}
              />
              <button
                onClick={handleLegacyRunCompare}
                disabled={comparingRuns}
                className="px-4 py-1.5 bg-accent hover:bg-blue-500 disabled:opacity-50 text-white text-xs font-semibold rounded shadow transition-colors shrink-0"
              >
                {comparingRuns ? 'Comparing...' : 'Compare Run IDs'}
              </button>
            </div>

            {/* Error banner */}
            {runCompareError && (
              <div className="p-3 mb-4 bg-red-950/60 border border-red-800 text-red-200 text-xs rounded-lg">
                {runCompareError}
              </div>
            )}

            {/* Comparison results table */}
            {runCompare && runCompare.length > 0 && (
              <div className="mt-4 border border-surface-2 rounded-lg bg-surface overflow-hidden">
                <div className="p-3 bg-surface-2 flex items-center justify-between border-b border-surface-2">
                  <span className="text-xs font-bold text-white">Comparison Results ({runCompare.length} Runs)</span>
                  <button
                    onClick={() => setRunCompare(null)}
                    className="text-[11px] text-gray-400 hover:text-white"
                  >
                    Clear Results
                  </button>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-xs text-left text-gray-300">
                    <thead className="bg-surface-2/60 text-gray-400 uppercase tracking-wider text-[10px] border-b border-surface-2">
                      <tr>
                        <th className="py-2.5 px-3">Metric</th>
                        {runCompare.map((r: any) => (
                          <th key={r.id} className="py-2.5 px-3">
                            Run #{r.id}
                            <span className={clsx(
                              'ml-1.5 px-1.5 py-0.5 rounded text-[10px] uppercase font-bold',
                              r.coordination === 'swarm' ? 'bg-emerald-950 text-emerald-400 border border-emerald-800' : 'bg-amber-950 text-amber-400 border border-amber-800'
                            )}>
                              {r.coordination}
                            </span>
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-surface-2 font-mono">
                      <tr>
                        <td className="py-2 px-3 text-gray-400 font-sans">Fleet Size</td>
                        {runCompare.map((r: any) => (
                          <td key={r.id} className="py-2 px-3 text-white">{r.num_robots} robots</td>
                        ))}
                      </tr>
                      <tr>
                        <td className="py-2 px-3 text-gray-400 font-sans">Seed</td>
                        {runCompare.map((r: any) => (
                          <td key={r.id} className="py-2 px-3 text-white">{r.seed ?? '—'}</td>
                        ))}
                      </tr>
                      <tr>
                        <td className="py-2 px-3 text-gray-400 font-sans">Collisions</td>
                        {runCompare.map((r: any) => (
                          <td key={r.id} className={clsx('py-2 px-3 font-bold', (r.metrics?.collision_count ?? 0) === 0 ? 'text-emerald-400' : 'text-red-400')}>
                            {r.metrics?.collision_count ?? 0}
                          </td>
                        ))}
                      </tr>
                      <tr>
                        <td className="py-2 px-3 text-gray-400 font-sans">Collisions Prevented</td>
                        {runCompare.map((r: any) => (
                          <td key={r.id} className="py-2 px-3 text-emerald-400 font-bold">{r.metrics?.collisions_prevented ?? 0}</td>
                        ))}
                      </tr>
                      <tr>
                        <td className="py-2 px-3 text-gray-400 font-sans">Deadlocks Detected</td>
                        {runCompare.map((r: any) => (
                          <td key={r.id} className="py-2 px-3 text-amber-400">{r.metrics?.deadlocks_detected ?? 0}</td>
                        ))}
                      </tr>
                      <tr>
                        <td className="py-2 px-3 text-gray-400 font-sans">Deadlocks Resolved</td>
                        {runCompare.map((r: any) => (
                          <td key={r.id} className="py-2 px-3 text-emerald-400 font-bold">{r.metrics?.deadlocks_resolved ?? 0}</td>
                        ))}
                      </tr>
                      <tr>
                        <td className="py-2 px-3 text-gray-400 font-sans">Tasks Completed</td>
                        {runCompare.map((r: any) => (
                          <td key={r.id} className="py-2 px-3 text-white">{r.metrics?.tasks_completed ?? 0}</td>
                        ))}
                      </tr>
                      <tr>
                        <td className="py-2 px-3 text-gray-400 font-sans">Throughput (per 100t)</td>
                        {runCompare.map((r: any) => (
                          <td key={r.id} className="py-2 px-3 text-accent font-bold">
                            {Number(r.metrics?.throughput ?? 0).toFixed(1)}
                          </td>
                        ))}
                      </tr>
                      <tr>
                        <td className="py-2 px-3 text-gray-400 font-sans">Avg Completion Time</td>
                        {runCompare.map((r: any) => (
                          <td key={r.id} className="py-2 px-3 text-white">
                            {Number(r.metrics?.avg_completion_time ?? 0).toFixed(1)} ticks
                          </td>
                        ))}
                      </tr>
                      <tr>
                        <td className="py-2 px-3 text-gray-400 font-sans">Total Distance</td>
                        {runCompare.map((r: any) => (
                          <td key={r.id} className="py-2 px-3 text-white">
                            {Math.round(r.metrics?.total_distance ?? 0)} cells
                          </td>
                        ))}
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        </details>
      </div>
    </div>
  );
}
