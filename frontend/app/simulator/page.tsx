/**
 * Purpose: Main live warehouse simulation view and interactive orchestration console.
 * Role in the project: Connects the live WebSocket stream to the canvas renderer, control panel, metrics HUD, and event feed.
 * Key contents: SimulatorPage component, Auth gate unlock handler, keyboard shortcut listeners (Space, N, R), cell click dispatcher.
 * Talks to: frontend/lib/useSimWebSocket.ts, frontend/lib/useAuth.ts, frontend/lib/api.ts, frontend/components/*.
 */

'use client';

import { useState, useCallback, useEffect } from 'react';
import Link from 'next/link';
import { useAuth } from '../../lib/useAuth';
import { useSimWebSocket } from '../../lib/useSimWebSocket';
import { api } from '../../lib/api';
import WarehouseCanvas from '../../components/WarehouseCanvas';
import ControlPanel from '../../components/ControlPanel';
import MetricsPanel from '../../components/MetricsPanel';
import EventFeed from '../../components/EventFeed';
import clsx from 'clsx';
import type { SimState } from '../../lib/types';

const STATUS_DOT: Record<string, string> = {
  connected: 'bg-green-500',
  connecting: 'bg-yellow-500 animate-pulse',
  disconnected: 'bg-red-500',
  error: 'bg-red-500',
};

/**
 * Primary simulation workspace component.
 * Mounts the warehouse canvas, control sidebar, live metrics banner, and event feed.
 * Listens for global keyboard shortcuts (Space=Start/Pause, N=Step, R=Reset) and handles cell click modes.
 */
export default function SimulatorPage() {
  const { user, isAuthenticated, loading: authLoading, demoLogin } = useAuth();
  const [demoLoggingIn, setDemoLoggingIn] = useState(false);
  const { state, status, refresh, setState } = useSimWebSocket();
  const [clickMode, setClickMode] = useState<string>('none');
  const [taskPickup, setTaskPickup] = useState<[number, number] | null>(null);

  const handleDemoUnlock = async () => {
    setDemoLoggingIn(true);
    try {
      await demoLogin();
    } catch (e) {
      console.error(e);
    } finally {
      setDemoLoggingIn(false);
    }
  };

  const handleStart = async () => {
    try {
      await api.start();
      await refresh();
    } catch (err) {
      console.error('Failed to start simulation:', err);
    }
  };

  const handlePause = async () => {
    try {
      await api.pause();
      await refresh();
    } catch (err) {
      console.error('Failed to pause simulation:', err);
    }
  };

  const handleResume = async () => {
    try {
      await api.resume();
      await refresh();
    } catch (err) {
      console.error('Failed to resume simulation:', err);
    }
  };

  const handleStep = async () => {
    try {
      const s = await api.step();
      if (s) setState(s as SimState);
    } catch (err) {
      console.error('Failed to step simulation:', err);
    }
  };

  const handleReset = async (newConfig?: Record<string, unknown>) => {
    try {
      if (newConfig) {
        await api.configure(newConfig);
      } else {
        await api.reset();
      }
      await refresh();
    } catch (err) {
      console.error('Failed to reset simulation:', err);
    }
  };

  // Global Keyboard shortcuts: Space = Start/Pause, N = Step, R = Reset
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (['INPUT', 'SELECT', 'TEXTAREA'].includes(target?.tagName)) return;

      if (e.code === 'Space') {
        e.preventDefault();
        if (!state?.running) {
          handleStart();
        } else if (state.paused) {
          handleResume();
        } else {
          handlePause();
        }
      } else if (e.key === 'n' || e.key === 'N') {
        e.preventDefault();
        handleStep();
      } else if (e.key === 'r' || e.key === 'R') {
        e.preventDefault();
        handleReset();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [state?.running, state?.paused]);

  const handleCellClick = useCallback(async (row: number, col: number) => {
    try {
      if (clickMode === 'obstacle') {
        if (state?.grid?.cells) {
          const newCells = state.grid.cells.map(r => [...r]);
          newCells[row][col] = newCells[row][col] === 1 ? 0 : 1;
          setState({ ...state, grid: { ...state.grid, cells: newCells } });
        }
        await api.toggleCell(row, col, 1);
        await refresh();
      } else if (clickMode === 'robot') {
        await api.addRobot(row, col);
        await refresh();
      } else if (clickMode === 'task_pickup') {
        // Optimistic instant visual update: toggle to 2 (Pickup) or back to 0 if already 2
        if (state?.grid?.cells) {
          const newCells = state.grid.cells.map(r => [...r]);
          newCells[row][col] = newCells[row][col] === 2 ? 0 : 2;
          setState({ ...state, grid: { ...state.grid, cells: newCells } });
        }
        await api.toggleCell(row, col, 2);
        await refresh();
      } else if (clickMode === 'dropoff') {
        if (state?.grid?.cells) {
          const newCells = state.grid.cells.map(r => [...r]);
          newCells[row][col] = newCells[row][col] === 3 ? 0 : 3;
          setState({ ...state, grid: { ...state.grid, cells: newCells } });
        }
        await api.toggleCell(row, col, 3);
        await refresh();
      } else if (clickMode === 'free') {
        if (state?.grid?.cells) {
          const newCells = state.grid.cells.map(r => [...r]);
          newCells[row][col] = 0;
          setState({ ...state, grid: { ...state.grid, cells: newCells } });
        }
        await api.toggleCell(row, col, 0);
        await refresh();
      }
    } catch (err) {
      console.error('Failed to update cell:', err);
      await refresh();
    }
  }, [clickMode, refresh, state, setState]);

  const m = state?.metrics;

  return (
    <div className="h-[calc(100vh-4rem)] flex flex-col">
      {/* Status & Key Metrics Summary Bar */}
      <div className="flex flex-wrap items-center justify-between px-4 py-2 bg-surface border-b border-surface-2 text-xs">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5">
            <span className={clsx('h-2.5 w-2.5 rounded-full', STATUS_DOT[status])} />
            <span className="font-medium text-gray-300 capitalize">{status}</span>
          </div>

          <span className="text-gray-600">|</span>

          <span>
            Tick: <b className="text-white font-mono">{state?.tick ?? 0}</b>
          </span>

          <span className="text-gray-600">|</span>

          <span
            className={clsx(
              'font-semibold uppercase px-2 py-0.5 rounded text-[11px]',
              state?.coordination === 'swarm'
                ? 'bg-blue-900/40 text-blue-400 border border-blue-800'
                : 'bg-red-900/40 text-red-400 border border-red-800'
            )}
          >
            {state?.coordination ?? 'SWARM'}
          </span>

          <span className="text-gray-600">|</span>

          <span className="font-medium text-gray-300">
            {state?.running ? (state.paused ? '⏸ Paused' : '▶ Running') : '⏹ Stopped'}
          </span>

          {clickMode === 'task_dropoff' && (
            <span className="ml-3 text-yellow-400 font-medium animate-pulse">
              📦 Step 2: Click any DROPOFF cell on the map
            </span>
          )}
        </div>

        {/* Highlighted Key Metrics Bar */}
        <div className="flex items-center gap-4 bg-surface-2/80 px-3 py-1 rounded-lg border border-gray-700/60">
          <div className="flex items-center gap-1.5">
            <span className="text-gray-400">Tasks:</span>
            <span className="font-bold text-emerald-400 font-mono">{m?.tasks_completed ?? 0}</span>
          </div>

          <div className="flex items-center gap-1.5">
            <span className="text-gray-400">Collisions:</span>
            <span className={clsx('font-bold font-mono', (m?.collision_count ?? 0) > 0 ? 'text-rose-400' : 'text-emerald-400')}>
              {m?.collision_count ?? 0}
            </span>
          </div>

          <div className="flex items-center gap-1.5">
            <span className="text-gray-400">Deadlocks:</span>
            <span className="font-bold text-amber-400 font-mono">
              {m?.deadlocks_detected ?? 0}
              {m && m.deadlocks_resolved > 0 && <span className="text-[10px] text-gray-400 ml-0.5">({m.deadlocks_resolved}✓)</span>}
            </span>
          </div>

          <div className="flex items-center gap-1.5">
            <span className="text-gray-400">Total Distance:</span>
            <span className="font-bold text-blue-400 font-mono">
              {Math.round(m?.total_distance ?? 0)} <span className="text-[10px] text-gray-400 font-normal">cells</span>
            </span>
          </div>
        </div>
      </div>

      {/* Main layout */}
      <div className="flex flex-1 overflow-hidden gap-2 p-2">
        {/* Left: control panel */}
        <div className="w-64 shrink-0">
          <ControlPanel
            running={state?.running ?? false}
            paused={state?.paused ?? false}
            onStart={handleStart}
            onPause={handlePause}
            onResume={handleResume}
            onStep={handleStep}
            onReset={handleReset}
            clickMode={clickMode}
            setClickMode={setClickMode}
            state={state}
          />
        </div>

        {/* Centre: canvas */}
        <div className="flex-1 bg-surface rounded-xl overflow-hidden border border-surface-2 relative">
          {!state && (
            <div className="absolute inset-0 flex flex-col items-center justify-center p-6 text-center z-10 bg-surface/90">
              <span className="text-3xl mb-3">🔌</span>
              <h3 className="text-lg font-bold text-white mb-2">Connecting to Backend Simulator...</h3>
              <p className="text-sm text-gray-400 max-w-md mb-4">
                Please make sure the Python backend server is running on port 8000.
              </p>
              <div className="bg-surface-2 border border-gray-700 rounded-lg p-3 text-xs font-mono text-accent select-all">
                cd wareswarm/backend && python -m uvicorn app.main:app --port 8000
              </div>
            </div>
          )}
          <WarehouseCanvas
            state={state}
            onCellClick={handleCellClick}
            clickMode={clickMode as 'obstacle' | 'robot' | 'task_pickup' | 'task_dropoff' | 'none'}
          />
        </div>

        {/* Right: metrics + events */}
        <div className="w-64 shrink-0 flex flex-col gap-2">
          <div className="flex-1 bg-surface border border-surface-2 rounded-xl p-3 overflow-y-auto">
            <MetricsPanel metrics={state?.metrics ?? null} />
          </div>
          <div className="h-44">
            <EventFeed events={state?.events ?? []} />
          </div>
        </div>
      </div>
    </div>
  );
}
