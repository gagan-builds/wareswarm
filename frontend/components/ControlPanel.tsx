/**

 * Purpose: Comprehensive simulation control sidebar and configuration console.

 * Role in the project: Collects user inputs (playback actions, fleet parameters, planners, seeds) and synchronizes them with backend state.

 * Key contents: ControlPanel component, playback triggers (Start, Pause, Resume, Step, Reset), click mode tools, accordion sections for compact 1366x768 screens, seed randomizer.

 * Talks to: frontend/lib/api.ts, frontend/lib/types.ts, frontend/app/simulator/page.tsx.

 */

'use client';



import { useState, useEffect } from 'react';

import Link from 'next/link';

import { api } from '../lib/api';

import type { SimState } from '../lib/types';

import clsx from 'clsx';



interface Props {
  running: boolean;
  paused: boolean;
  onStart: () => void;
  onPause: () => void;
  onResume: () => void;
  onStep: () => void;
  onReset: (newConfig?: Record<string, unknown>) => void;
  clickMode: string;
  setClickMode: (m: string) => void;
  state?: SimState | null;
  selectedRobotId?: number | null;
  setSelectedRobotId?: (id: number | null) => void;
  onManualAssign?: (params: { robot_id: number; start_row?: number; start_col?: number; dest_row?: number; dest_col?: number; priority?: number }) => Promise<void>;
  onSetPriority?: (robot_id: number, priority: number) => Promise<void>;
}



/**

 * Interactive simulation control panel component.

 * Synchronizes local configuration form state with backend SimConfigData as the single source of truth.

 * Renders collapsible accordion sections for small screens and binds playback controls.

 * @param {Props} props Control callbacks, playback status flags, click tool modes, and simulation state.

 */

export default function ControlPanel({
  running,
  paused,
  onStart,
  onPause,
  onResume,
  onStep,
  onReset,
  clickMode,
  setClickMode,
  state,
  selectedRobotId,
  setSelectedRobotId,
  onManualAssign,
  onSetPriority,
}: Props) {

  // Local form state

  const [cfg, setCfg] = useState({

    num_robots: 5,

    planner: 'astar',

    heuristic: 'manhattan',

    connectivity: 4,

    coordination: 'swarm',

    allocation: 'nearest',

    task_rate: 0.0,

    auto_assign_tasks: false,

    seed: '42',

    speed: 1.0,

    map_preset: 'warehouse',

    grid_width: 30,

    grid_height: 20,

  });



  // Accordion section collapse state for 1366x768 compactness

  const [openSections, setOpenSections] = useState({

    clickMode: true,

    manualAssign: true,

    fleet: true,

    sim: true,

  });



  // Available custom map templates from database

  const [customTemplates, setCustomTemplates] = useState<

    Array<{ id: number; name: string; robot_count: number; width: number; height: number }>

  >([]);

  const [switchingPreset, setSwitchingPreset] = useState(false);
  const [maxRobots, setMaxRobots] = useState(30);
  const [effectivePlan, setEffectivePlan] = useState('enterprise');
  const [appliedNotice, setAppliedNotice] = useState<string | null>(null);



  useEffect(() => {

    api.getCustomMaps()

      .then((maps) => {

        if (Array.isArray(maps)) {

          setCustomTemplates(maps as any[]);

        }

      })

      .catch(() => {});

    api.getSubscription()
      .then((data) => {
        setMaxRobots(30);
        setEffectivePlan('enterprise');
      })
      .catch(() => {});
  }, []);



  const toggleSection = (sec: 'clickMode' | 'manualAssign' | 'fleet' | 'sim') => {

    setOpenSections(p => ({ ...p, [sec]: !p[sec] }));

  };



  // Sync form inputs with backend state as single source of truth

  useEffect(() => {

    if (state?.config) {

      setCfg(prev => ({

        ...prev,

        num_robots: state.config?.num_robots ?? prev.num_robots,

        planner: state.config?.planner ?? prev.planner,

        heuristic: state.config?.heuristic ?? prev.heuristic,

        connectivity: state.config?.connectivity ?? prev.connectivity,

        coordination: state.config?.coordination ?? prev.coordination,

        allocation: state.config?.allocation ?? prev.allocation,

        task_rate: state.config?.task_rate ?? prev.task_rate,

        auto_assign_tasks: state.config?.auto_assign_tasks ?? prev.auto_assign_tasks,

        seed: state.config?.seed !== null && state.config?.seed !== undefined ? String(state.config.seed) : prev.seed,

        speed: state.config?.speed ?? prev.speed,

        map_preset: state.config?.map_preset ?? prev.map_preset,

        grid_width: state.config?.grid_width ?? prev.grid_width,

        grid_height: state.config?.grid_height ?? prev.grid_height,

      }));

    }

  }, [state?.config]);



  const handleToggleAutoAssign = async (enabled: boolean) => {
    try {
      await api.setAutoAssign(enabled);
      setCfg((prev: any) => ({
        ...prev,
        auto_assign_tasks: enabled,
        task_rate: enabled ? (Number(prev.task_rate) > 0 ? prev.task_rate : 0.3) : 0.0,
      }));
      setAppliedNotice(enabled ? '⚡ Auto-Task Assignment Enabled' : '👤 User-Assigned Mode Active (Auto-Assign Disabled)');
      setTimeout(() => setAppliedNotice(null), 3500);
    } catch (e) {
      console.error('Failed to toggle auto-assign:', e);
    }
  };

  const handleApplyOnly = async () => {
    const payload = {
      ...cfg,
      num_robots: Number(cfg.num_robots),
      seed: String(cfg.seed).trim() === '' ? null : Number(cfg.seed),
      connectivity: Number(cfg.connectivity),
      task_rate: Boolean(cfg.auto_assign_tasks) ? Number(cfg.task_rate) : 0.0,
      auto_assign_tasks: Boolean(cfg.auto_assign_tasks),
      speed: Number(cfg.speed),
      grid_width: Number(cfg.grid_width),
      grid_height: Number(cfg.grid_height),
      preserve_grid: true,
      cells: state?.grid?.cells,
    };
    await onReset(payload);
    setAppliedNotice('Map & Pickups applied to fleet!');
    setTimeout(() => setAppliedNotice(null), 3000);
  };

  const handleResetOnly = async () => {
    await onReset();
    setAppliedNotice('Simulation reset to default map.');
    setTimeout(() => setAppliedNotice(null), 3000);
  };

  const handleApplyAndReset = async (overrideCfg?: any) => {
    const base = (overrideCfg && typeof overrideCfg === 'object' && 'num_robots' in overrideCfg) ? overrideCfg : cfg;
    setCfg(base);
    const payload = {
      ...base,
      num_robots: Number(base.num_robots),
      seed: String(base.seed).trim() === '' ? null : Number(base.seed),
      connectivity: Number(base.connectivity),
      task_rate: Boolean(base.auto_assign_tasks) ? Number(base.task_rate) : 0.0,
      auto_assign_tasks: Boolean(base.auto_assign_tasks),
      speed: Number(base.speed),
      grid_width: Number(base.grid_width),
      grid_height: Number(base.grid_height),
    };
    onReset(payload);
  };



  const handlePresetChange = async (val: string) => {

    setSwitchingPreset(true);

    try {

      if (val.startsWith('custom_')) {

        const id = Number(val.replace('custom_', ''));

        const fullMap = await api.getCustomMap(id);

        if (fullMap && fullMap.cells) {

          await api.applyCustomMap({

            cells: fullMap.cells,

            width: fullMap.width,

            height: fullMap.height,

            name: fullMap.name,

            robot_count: fullMap.robot_count,

          });

          setCfg(prev => ({

            ...prev,

            map_preset: val,

            grid_width: fullMap.width,

            grid_height: fullMap.height,

            num_robots: fullMap.robot_count || prev.num_robots,

          }));

          onReset();

        }

      } else {

        await api.applyPreset(val);

        setCfg(prev => ({ ...prev, map_preset: val }));

        onReset();

      }

    } catch (err) {

      console.error('Failed to apply preset/template:', err);

      handleApplyAndReset({ ...cfg, map_preset: val });

    } finally {

      setSwitchingPreset(false);

    }

  };



  const randomizeSeed = () => {

    const rand = Math.floor(Math.random() * 900000) + 100000;

    setCfg(p => ({ ...p, seed: String(rand) }));

  };



  const field = (label: string, children: React.ReactNode) => (

    <div className="mb-2.5">

      <label className="block text-[11px] font-medium text-gray-400 mb-1">{label}</label>

      {children}

    </div>

  );



  const select = (

    key: keyof typeof cfg,

    opts: { label: string; value: string | number }[],

    onExtraChange?: (val: string) => void,

    customValue?: string

  ) => (

    <select

      className="w-full bg-surface-2 text-white text-xs rounded px-2 py-1.5 border border-gray-700 focus:outline-none focus:border-accent"

      value={customValue !== undefined ? customValue : String(cfg[key])}

      onChange={e => {

        const val = e.target.value;

        setCfg(p => ({ ...p, [key]: val }));

        if (onExtraChange) onExtraChange(val);

      }}

    >

      {opts.map(o => (

        <option key={o.value} value={o.value}>

          {o.label}

        </option>

      ))}

    </select>

  );



  const numInput = (key: keyof typeof cfg, min: number, max: number, step = 1) => (

    <input

      type="number"

      min={min}

      max={max}

      step={step}

      className="w-full bg-surface-2 text-white text-xs rounded px-2 py-1.5 border border-gray-700 focus:outline-none focus:border-accent font-mono"

      value={String(cfg[key])}

      onChange={e => setCfg(p => ({ ...p, [key]: e.target.value }))}

    />

  );



  return (

    <div className="flex flex-col h-full bg-surface border border-surface-2 rounded-xl text-sm overflow-hidden select-none">

      {/* Sticky Header with Playback Controls */}

      <div className="p-3.5 border-b border-surface-2 bg-surface/95 backdrop-blur z-10">

        <div className="flex items-center justify-between mb-2.5">

          <h2 className="text-white font-bold text-sm tracking-wide">Fleet Controls</h2>

          <span

            className={clsx(

              'text-[10px] uppercase font-bold px-2 py-0.5 rounded border',

              running

                ? paused

                  ? 'bg-amber-950/60 text-amber-400 border-amber-800'

                  : 'bg-emerald-950/60 text-emerald-400 border-emerald-800 animate-pulse'

                : 'bg-slate-800 text-slate-400 border-slate-700'

            )}

          >

            {running ? (paused ? 'Paused' : 'Running') : 'Stopped'}

          </span>

        </div>



        {/* Playback Buttons */}

        <div className="flex items-center gap-1.5">

          {/* Toggling Start / Pause / Resume Button */}

          {!running ? (

            <button

              onClick={onStart}

              title="Start Simulation [Space]"

              className="flex-1 px-3 py-1.5 rounded-lg text-xs font-bold bg-emerald-600 hover:bg-emerald-500 text-white shadow transition-colors flex items-center justify-center gap-1"

            >

              ▶ Start <span className="text-[10px] opacity-70">[Space]</span>

            </button>

          ) : paused ? (

            <button

              onClick={onResume}

              title="Resume Simulation [Space]"

              className="flex-1 px-3 py-1.5 rounded-lg text-xs font-bold bg-emerald-600 hover:bg-emerald-500 text-white shadow transition-colors flex items-center justify-center gap-1"

            >

              ▶ Resume <span className="text-[10px] opacity-70">[Space]</span>

            </button>

          ) : (

            <button

              onClick={onPause}

              title="Pause Simulation [Space]"

              className="flex-1 px-3 py-1.5 rounded-lg text-xs font-bold bg-amber-600 hover:bg-amber-500 text-white shadow transition-colors flex items-center justify-center gap-1"

            >

              ⏸ Pause <span className="text-[10px] opacity-70">[Space]</span>

            </button>

          )}



          {/* Step Button: Enabled only when stopped or paused */}

          <button

            onClick={onStep}

            disabled={running && !paused}

            title={running && !paused ? 'Pause first to step single ticks' : 'Step 1 Tick [N]'}

            className={clsx(

              'px-2.5 py-1.5 rounded-lg text-xs font-semibold border transition-colors flex items-center gap-1',

              running && !paused

                ? 'bg-surface-2 text-gray-600 border-gray-800 cursor-not-allowed opacity-40'

                : 'bg-surface-2 hover:bg-gray-700 text-gray-200 border-gray-700'

            )}

          >

            ⏭ Step <span className="text-[10px] opacity-60">[N]</span>

          </button>



          {/* Reset Button */}

          <button

            onClick={() => handleApplyAndReset()}

            title="Apply config & Reset to Tick 0 [R]"

            className="px-2.5 py-1.5 rounded-lg text-xs font-semibold bg-rose-950/70 hover:bg-rose-900 border border-rose-800 text-rose-300 transition-colors flex items-center gap-1"

          >

            ↺ Reset <span className="text-[10px] opacity-60">[R]</span>

          </button>

        </div>

      </div>



      {/* Independently Scrollable Body for 1366x768 screens */}

      <div className="flex-1 overflow-y-auto p-3.5 space-y-3.5">

        {/* Accordion 1: Canvas Click Mode */}

        <div className="bg-surface-2/40 border border-gray-700/50 rounded-xl overflow-hidden">

          <button

            type="button"

            onClick={() => toggleSection('clickMode')}

            className="w-full px-3 py-2 text-left flex justify-between items-center text-xs font-semibold text-gray-300 hover:text-white bg-surface-2/60"

          >

            <span>INTERACTIVE CLICK MODE</span>

            <span className="text-gray-500">{openSections.clickMode ? '▴' : '▾'}</span>

          </button>

          {openSections.clickMode && (

            <div className="p-2.5">

              <div className="grid grid-cols-2 gap-1.5">

                {[

                  { mode: 'obstacle', label: '🧱 Obstacle' },

                  { mode: 'robot', label: '🤖 Robot (C)' },

                  { mode: 'task_pickup', label: '📦 Pickup (P)' },

                  { mode: 'dropoff', label: '🏁 Dropoff (D)' },

                  { mode: 'free', label: '🧹 Free / Erase' },

                  { mode: 'assign_robot', label: '🎯 Set Destination' },

                  { mode: 'none', label: '⬜ Normal' },

                ].map(({ mode, label }) => (

                  <button

                    key={mode}

                    type="button"

                    onClick={() => setClickMode(mode)}

                    className={clsx(

                      'px-2 py-1.5 rounded text-xs font-medium text-left transition-colors border',

                      clickMode === mode

                        ? 'bg-accent border-blue-400 text-white font-bold shadow'

                        : 'bg-surface-2 border-gray-700/70 text-gray-300 hover:bg-gray-700'

                    )}

                  >

                    {label}

                  </button>

                ))}
              </div>

              {/* Guidance for active mode */}
              <div className="mt-2 p-1.5 rounded bg-surface border border-gray-700/60 text-[11px] text-gray-300">
                {clickMode === 'task_pickup' && (
                  <span className="text-amber-400 font-medium">
                    📦 <strong>Pickup Mode</strong>: Click on the warehouse grid to place Pickup (P) points, then click <strong>✓ Apply</strong> below.
                  </span>
                )}
                {clickMode === 'dropoff' && (
                  <span className="text-emerald-400 font-medium">
                    🏁 <strong>Dropoff Mode</strong>: Click on the warehouse grid to place Dropoff (D) points, then click <strong>✓ Apply</strong> below.
                  </span>
                )}
                {clickMode === 'obstacle' && (
                  <span className="text-gray-300 font-medium">
                    🧱 <strong>Obstacle Mode</strong>: Click on the warehouse grid to place/remove shelf walls.
                  </span>
                )}
                {clickMode === 'robot' && (
                  <span className="text-blue-400 font-medium">
                    🤖 <strong>Robot Mode</strong>: Click on the warehouse grid to place a charging start pad (C).
                  </span>
                )}
                {clickMode === 'free' && (
                  <span className="text-gray-300 font-medium">
                    🧹 <strong>Free / Erase Mode</strong>: Click on any cell on the grid to erase it to open floor.
                  </span>
                )}
                {clickMode === 'assign_robot' && (
                  <span className="text-sky-400 font-medium">
                    🎯 <strong>Destination Target Mode</strong>: Click any free cell on the grid to set as the destination for the selected robot.
                  </span>
                )}
                {clickMode === 'none' && (
                  <span className="text-gray-400">
                    Select a tool above to draw on the warehouse floor grid.
                  </span>
                )}
              </div>

              {/* Separate Apply and Reset buttons inside Interactive Click Mode */}
              <div className="grid grid-cols-2 gap-2 mt-2.5 pt-2 border-t border-gray-700/60">
                <button
                  type="button"
                  onClick={handleApplyOnly}
                  className="py-1.5 px-2.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold shadow transition-colors flex items-center justify-center gap-1"
                  title="Apply map changes and queue tasks for new Pickup points"
                >
                  <span>✓</span> Apply
                </button>
                <button
                  type="button"
                  onClick={handleResetOnly}
                  className="py-1.5 px-2.5 rounded-lg bg-rose-950/80 hover:bg-rose-900 border border-rose-800 text-rose-200 text-xs font-bold shadow transition-colors flex items-center justify-center gap-1"
                  title="Reset simulation to default layout"
                >
                  <span>↺</span> Reset
                </button>
              </div>

              {appliedNotice && (
                <div className="mt-2 py-1 px-2 rounded bg-emerald-950/80 border border-emerald-600/70 text-emerald-300 text-[11px] font-semibold text-center flex items-center justify-center gap-1 shadow">
                  <span>✓</span> {appliedNotice}
                </div>
              )}

            </div>

          )}

        </div>



        {/* Accordion: User Robot Priority & Destination Assignment */}
        <div className="bg-surface-2/40 border border-sky-500/40 rounded-xl overflow-hidden shadow-lg shadow-sky-950/20">
          <button
            type="button"
            onClick={() => toggleSection('manualAssign')}
            className="w-full px-3 py-2 text-left flex justify-between items-center text-xs font-semibold text-sky-300 hover:text-white bg-sky-950/40 border-b border-sky-500/20"
          >
            <span className="flex items-center gap-1.5">
              <span>🎯</span>
              <span>ROBOT ROUTE & PRIORITY</span>
            </span>
            <span className="text-sky-400">{openSections.manualAssign ? '▴' : '▾'}</span>
          </button>

          {(openSections.manualAssign ?? true) && (
            <div className="p-3 space-y-3">
              {/* Feature Toggle: User Manual Tasking vs Auto-Assign */}
              <div className="bg-surface/90 border border-sky-500/30 rounded-lg p-2.5 space-y-2 shadow-sm">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-bold text-white flex items-center gap-1">
                    <span>⚡</span> Task Assignment Mode:
                  </span>
                  <span className={`text-[10px] font-mono px-2 py-0.5 rounded-full font-bold ${
                    state?.config?.auto_assign_tasks
                      ? 'bg-emerald-950 text-emerald-300 border border-emerald-600/50'
                      : 'bg-indigo-950 text-indigo-300 border border-indigo-600/50'
                  }`}>
                    {state?.config?.auto_assign_tasks ? 'AUTO-ASSIGN' : 'USER-ASSIGNED'}
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-1.5">
                  <button
                    type="button"
                    onClick={() => handleToggleAutoAssign(false)}
                    className={`py-1.5 px-2 rounded text-[11px] font-bold transition-all border flex items-center justify-center gap-1 ${
                      !state?.config?.auto_assign_tasks
                        ? 'bg-indigo-600 text-white border-indigo-300 shadow-md ring-1 ring-indigo-400'
                        : 'bg-surface-2 border-gray-700 text-gray-400 hover:text-white'
                    }`}
                  >
                    <span>👤 User Only</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => handleToggleAutoAssign(true)}
                    className={`py-1.5 px-2 rounded text-[11px] font-bold transition-all border flex items-center justify-center gap-1 ${
                      state?.config?.auto_assign_tasks
                        ? 'bg-emerald-600 text-white border-emerald-300 shadow-md ring-1 ring-emerald-400'
                        : 'bg-surface-2 border-gray-700 text-gray-400 hover:text-white'
                    }`}
                  >
                    <span>🤖 Auto-Assign</span>
                  </button>
                </div>

                <p className="text-[10px] text-gray-400 leading-tight">
                  {!state?.config?.auto_assign_tasks
                    ? '🎯 Active: Robots will only execute paths and destinations assigned by you.'
                    : '⚡ Active: System autonomously generates random warehouse orders and assigns them to idle robots.'}
                </p>
              </div>

              {/* Robot Selector */}
              <div>
                <label className="block text-[11px] font-semibold text-gray-300 mb-1">
                  Select Robot to Assign:
                </label>
                <div className="grid grid-cols-5 gap-1.5 max-h-28 overflow-y-auto p-1 bg-surface-2 rounded-lg border border-gray-700">
                  {(state?.robots || []).map(r => {
                    const isSel = selectedRobotId === r.id;
                    const p = r.priority ?? 2;
                    return (
                      <button
                        key={r.id}
                        type="button"
                        onClick={() => setSelectedRobotId && setSelectedRobotId(r.id)}
                        className={`py-1.5 px-1 rounded flex flex-col items-center justify-center text-xs font-bold transition-all border ${
                          isSel
                            ? 'bg-sky-600 text-white border-sky-300 shadow-md scale-105'
                            : 'bg-surface border-gray-700 text-gray-300 hover:bg-gray-700'
                        }`}
                        style={{ borderLeftColor: r.color, borderLeftWidth: '3px' }}
                      >
                        <span>R{r.id}</span>
                        <span className={`text-[9px] font-mono px-1 rounded ${
                          p === 4 ? 'bg-rose-950 text-rose-300' : p === 3 ? 'bg-amber-950 text-amber-300' : 'text-gray-400'
                        }`}>
                          P{p}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Selected Robot Controls */}
              {(() => {
                const activeR = (state?.robots || []).find(r => r.id === selectedRobotId) || state?.robots?.[0];
                if (!activeR) {
                  return (
                    <div className="text-center text-xs text-gray-500 py-2">
                      Spawn robots first to customize priority and routing.
                    </div>
                  );
                }

                return (
                  <div className="bg-surface/80 rounded-lg p-2.5 border border-gray-700/80 space-y-2.5 text-xs">
                    <div className="flex items-center justify-between pb-1.5 border-b border-gray-700/60">
                      <div className="flex items-center gap-2">
                        <span
                          className="w-3 h-3 rounded-full border border-white/60"
                          style={{ backgroundColor: activeR.color }}
                        />
                        <span className="font-bold text-white">Robot #{activeR.id}</span>
                        <span className="text-[10px] text-gray-400 uppercase font-mono px-1.5 py-0.5 rounded bg-surface-2">
                          {activeR.state}
                        </span>
                      </div>
                      <span className="text-gray-400 font-mono text-[11px]">
                        Pos: ({activeR.row}, {activeR.col})
                      </span>
                    </div>

                    {/* Robot Priority Selector */}
                    <div>
                      <div className="flex justify-between items-center mb-1 text-[11px] font-medium text-gray-300">
                        <span>Swarm Right-of-Way Priority:</span>
                        <span className={`font-bold ${
                          (activeR.priority ?? 2) === 4 ? 'text-rose-400' :
                          (activeR.priority ?? 2) === 3 ? 'text-amber-400' :
                          (activeR.priority ?? 2) === 1 ? 'text-gray-400' : 'text-sky-400'
                        }`}>
                          { (activeR.priority ?? 2) === 4 ? 'Critical (Highest)' :
                            (activeR.priority ?? 2) === 3 ? 'High Priority' :
                            (activeR.priority ?? 2) === 1 ? 'Low Priority' : 'Normal (Med)' }
                        </span>
                      </div>
                      <div className="grid grid-cols-4 gap-1">
                        {[
                          { level: 1, label: 'Low', col: 'hover:border-gray-500' },
                          { level: 2, label: 'Med', col: 'hover:border-sky-500' },
                          { level: 3, label: 'High', col: 'hover:border-amber-500' },
                          { level: 4, label: 'Top', col: 'hover:border-rose-500' },
                        ].map(({ level, label }) => {
                          const isCur = (activeR.priority ?? 2) === level;
                          return (
                            <button
                              key={level}
                              type="button"
                              onClick={() => onSetPriority && onSetPriority(activeR.id, level)}
                              className={`py-1 text-[11px] font-bold rounded border transition-all ${
                                isCur
                                  ? level === 4 ? 'bg-rose-600 text-white border-rose-400 shadow' :
                                    level === 3 ? 'bg-amber-600 text-white border-amber-400 shadow' :
                                    level === 1 ? 'bg-gray-600 text-white border-gray-400 shadow' :
                                    'bg-sky-600 text-white border-sky-400 shadow'
                                  : 'bg-surface-2 border-gray-700 text-gray-400 hover:text-white'
                              }`}
                            >
                              {label}
                            </button>
                          );
                        })}
                      </div>
                      <div className="text-[10px] text-gray-400 mt-1 italic">
                        Higher priority robots never yield in narrow aisles and reserve paths first.
                      </div>
                    </div>

                    {/* Start Position & Destination Controls */}
                    <div className="pt-1.5 border-t border-gray-700/60 space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="font-medium text-gray-300 text-[11px]">Manual Route Assignment:</span>
                        <button
                          type="button"
                          onClick={() => setClickMode('assign_robot')}
                          className={`px-2 py-0.5 rounded text-[10px] font-bold border transition-colors ${
                            clickMode === 'assign_robot'
                              ? 'bg-amber-500 text-black border-amber-300 animate-pulse'
                              : 'bg-surface-2 text-sky-300 border-sky-500/50 hover:bg-sky-950'
                          }`}
                        >
                          {clickMode === 'assign_robot' ? '🎯 Click Grid for Dest' : '🖱️ Pick on Grid'}
                        </button>
                      </div>

                      {/* Manual Coordinates Inputs */}
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <span className="text-[10px] text-gray-400 block mb-0.5">Start (R, C):</span>
                          <div className="flex gap-1">
                            <input
                              type="number"
                              placeholder="Row"
                              id="custom_start_r"
                              defaultValue={activeR.start_pos?.[0] ?? activeR.row}
                              className="w-full bg-surface-2 text-white text-xs rounded px-1.5 py-1 border border-gray-700 font-mono"
                            />
                            <input
                              type="number"
                              placeholder="Col"
                              id="custom_start_c"
                              defaultValue={activeR.start_pos?.[1] ?? activeR.col}
                              className="w-full bg-surface-2 text-white text-xs rounded px-1.5 py-1 border border-gray-700 font-mono"
                            />
                          </div>
                        </div>

                        <div>
                          <span className="text-[10px] text-gray-400 block mb-0.5">Destination (R, C):</span>
                          <div className="flex gap-1">
                            <input
                              type="number"
                              placeholder="Row"
                              id="custom_dest_r"
                              defaultValue={activeR.target_destination?.[0] ?? ''}
                              className="w-full bg-surface-2 text-white text-xs rounded px-1.5 py-1 border border-gray-700 font-mono"
                            />
                            <input
                              type="number"
                              placeholder="Col"
                              id="custom_dest_c"
                              defaultValue={activeR.target_destination?.[1] ?? ''}
                              className="w-full bg-surface-2 text-white text-xs rounded px-1.5 py-1 border border-gray-700 font-mono"
                            />
                          </div>
                        </div>
                      </div>

                      <button
                        type="button"
                        onClick={() => {
                          const sr = (document.getElementById('custom_start_r') as HTMLInputElement)?.value;
                          const sc = (document.getElementById('custom_start_c') as HTMLInputElement)?.value;
                          const dr = (document.getElementById('custom_dest_r') as HTMLInputElement)?.value;
                          const dc = (document.getElementById('custom_dest_c') as HTMLInputElement)?.value;
                          if (onManualAssign) {
                            onManualAssign({
                              robot_id: activeR.id,
                              start_row: sr !== '' ? Number(sr) : undefined,
                              start_col: sc !== '' ? Number(sc) : undefined,
                              dest_row: dr !== '' ? Number(dr) : undefined,
                              dest_col: dc !== '' ? Number(dc) : undefined,
                              priority: activeR.priority ?? 2,
                            });
                          }
                        }}
                        className="w-full py-1.5 px-3 rounded-lg bg-sky-600 hover:bg-sky-500 text-white font-bold text-xs shadow transition-colors flex items-center justify-center gap-1.5"
                      >
                        <span>🚀</span> Dispatch Robot #{activeR.id} to Destination
                      </button>
                    </div>
                  </div>
                );
              })()}
            </div>
          )}
        </div>

        {/* Accordion 2: Fleet & Map Configuration */}

        <div className="bg-surface-2/40 border border-gray-700/50 rounded-xl overflow-hidden">

          <button

            type="button"

            onClick={() => toggleSection('fleet')}

            className="w-full px-3 py-2 text-left flex justify-between items-center text-xs font-semibold text-gray-300 hover:text-white bg-surface-2/60"

          >

            <span>FLEET & MAP CONFIG</span>

            <span className="text-gray-500">{openSections.fleet ? '▴' : '▾'}</span>

          </button>

          {openSections.fleet && (

            <div className="p-3">

              {field(

                'Map Preset',

                <div className="relative">

                  {select(

                    'map_preset',

                    [

                      { label: '🏢 Warehouse (Parallel Aisles)', value: 'warehouse' },

                      { label: '⚠️ Congested (Narrow Chokepoints)', value: 'congested' },

                      { label: '⬜ Open Floor (Free Routing)', value: 'open_floor' },

                      { label: '🎲 Random Obstacles', value: 'random' },

                      ...customTemplates.map(t => ({

                        label: `🎨 Template: ${t.name} (${t.robot_count || 5} AGVs)`,

                        value: `custom_${t.id}`,

                      })),

                      ...(cfg.map_preset === 'custom' && !customTemplates.some(t => `custom_${t.id}` === cfg.map_preset)

                        ? [{ label: `🎨 Custom: ${(state?.config as any)?.custom_map_name || 'Active Map'}`, value: 'custom' }]

                        : []),

                    ],

                    (val) => handlePresetChange(val),

                    (() => {

                      if (cfg.map_preset === 'custom' || cfg.map_preset.startsWith('custom_')) {

                        const activeName = (state?.config as any)?.custom_map_name;

                        if (activeName) {

                          const matched = customTemplates.find(t => t.name === activeName);

                          if (matched) return `custom_${matched.id}`;

                        }

                        return cfg.map_preset;

                      }

                      return cfg.map_preset;

                    })()

                  )}

                  {switchingPreset && (

                    <span className="absolute right-7 top-2 text-[10px] text-accent animate-pulse font-semibold pointer-events-none">

                      Applying...

                    </span>

                  )}

                </div>

              )}



              <div className="mt-1.5 mb-3">

                <Link

                  href="/builder"

                  className="w-full flex items-center justify-center gap-1.5 py-1.5 px-3 bg-blue-950/60 hover:bg-blue-900 border border-blue-700/80 rounded-lg text-xs font-semibold text-blue-300 transition-colors shadow-sm"

                >

                  🛠️ Map Builder (Custom Map)

                </Link>

              </div>



              {field(

                'Coordination Mode',

                select('coordination', [

                  { label: 'SWARM (Decentralized + Priority)', value: 'swarm' },

                  { label: 'NAIVE (Uncoordinated Baseline)', value: 'naive' },

                ])

              )}



              {field(
                `Robots Count (1-${maxRobots})`,
                <div>
                  {numInput('num_robots', 1, maxRobots)}
                  {maxRobots < 20 && (
                    <div className="mt-1 flex items-center justify-between text-[10px] text-gray-400">
                      <span>Plan cap: {maxRobots} robots</span>
                      <Link href="/pricing" className="text-accent hover:underline font-semibold">
                        Upgrade for 20+ →
                      </Link>
                    </div>
                  )}
                </div>
              )}



              {field(
                'Path Planning Algorithm',
                select('planner', [
                  { label: 'A* (Informed Heuristic)', value: 'astar' },
                  { label: 'Dijkstra (Uniform Cost Search)', value: 'dijkstra' },
                  { label: 'Space-Time A* (4D MAPF)', value: 'spacetime_astar' },
                ])
              )}



              {field(

                'A* Heuristic Metric',

                select('heuristic', [

                  { label: 'Manhattan (4-Connected)', value: 'manhattan' },

                  { label: 'Euclidean', value: 'euclidean' },

                  { label: 'Octile (8-Connected)', value: 'octile' },

                ])

              )}



              {field(

                'Grid Connectivity',

                select('connectivity', [

                  { label: '4-Connected (N, S, E, W)', value: 4 },

                  { label: '8-Connected (+ Diagonals)', value: 8 },

                ])

              )}



              {field(

                'Task Allocation Strategy',

                select('allocation', [

                  { label: 'Greedy Nearest Robot', value: 'nearest' },

                  { label: 'Hungarian Global Optimal', value: 'hungarian' },

                ])

              )}

            </div>

          )}

        </div>



        {/* Accordion 3: Simulation Parameters & Speed */}

        <div className="bg-surface-2/40 border border-gray-700/50 rounded-xl overflow-hidden">

          <button

            type="button"

            onClick={() => toggleSection('sim')}

            className="w-full px-3 py-2 text-left flex justify-between items-center text-xs font-semibold text-gray-300 hover:text-white bg-surface-2/60"

          >

            <span>SPEED & DYNAMICS</span>

            <span className="text-gray-500">{openSections.sim ? '▴' : '▾'}</span>

          </button>

          {openSections.sim && (

            <div className="p-3">

              {/* Seed with Randomize Button */}

              {field(

                'Seed (Blank = Auto-generate)',

                <div className="flex gap-1.5">

                  <input

                    type="text"

                    placeholder="e.g. 42"

                    className="flex-1 bg-surface-2 text-white text-xs rounded px-2.5 py-1.5 border border-gray-700 focus:outline-none focus:border-accent font-mono"

                    value={cfg.seed}

                    onChange={e => setCfg(p => ({ ...p, seed: e.target.value }))}

                  />

                  <button

                    type="button"

                    onClick={randomizeSeed}

                    title="Generate new random seed"

                    className="px-2.5 py-1.5 bg-surface-2 hover:bg-gray-700 text-xs rounded border border-gray-700 text-gray-300 font-bold"

                  >

                    🎲

                  </button>

                </div>

              )}



              {/* Speed Slider */}

              <div className="mb-3">

                <div className="flex justify-between text-[11px] font-medium text-gray-400 mb-1">

                  <span>Simulation Speed</span>

                  <span className="text-accent font-mono font-bold">{cfg.speed}x</span>

                </div>

                <input

                  type="range"

                  min="0.25"

                  max="10"

                  step="0.25"

                  value={cfg.speed}

                  onChange={e => setCfg(p => ({ ...p, speed: Number(e.target.value) }))}

                  className="w-full accent-accent cursor-pointer"

                />

                <div className="flex justify-between text-[9px] text-gray-500 font-mono">

                  <span>0.25x</span>

                  <span>1x</span>

                  <span>5x</span>

                  <span>10x</span>

                </div>

              </div>



              {field(

                'Task Generation Rate (prob/tick)',

                numInput('task_rate', 0, 1, 0.05)

              )}



              <div className="grid grid-cols-2 gap-2">

                {field('Grid Width', numInput('grid_width', 5, 60))}

                {field('Grid Height', numInput('grid_height', 5, 40))}

              </div>



              <div className="grid grid-cols-2 gap-2 mt-3 pt-2.5 border-t border-gray-700/60">

                <button

                  type="button"

                  onClick={handleApplyOnly}

                  className="py-2 px-3 rounded-lg bg-accent hover:bg-blue-500 text-white text-xs font-bold shadow transition-colors flex items-center justify-center gap-1.5"

                  title="Apply parameter changes to simulation"

                >

                  <span>✓</span> Apply Config

                </button>

                <button

                  type="button"

                  onClick={handleResetOnly}

                  className="py-2 px-3 rounded-lg bg-rose-950/80 hover:bg-rose-900 border border-rose-800 text-rose-200 text-xs font-bold shadow transition-colors flex items-center justify-center gap-1.5"

                  title="Reset simulation to Tick 0 and respawn fleet"

                >

                  <span>↺</span> Reset

                </button>

              </div>

            </div>

          )}

        </div>

      </div>

    </div>

  );

}

