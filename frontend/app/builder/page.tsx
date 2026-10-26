/**
 * Purpose: Visual interactive map designer and layout customizer.
 * Role in the project: Allows users to paint warehouse obstacles, robot starting bays, storage pickup racks, and delivery dropoffs, test them, and deploy them directly into the live simulator.
 * Key contents: MapBuilderPage component, canvas drawing tools (obstacle, robot, pickup, dropoff, erase), template selector, save and apply API triggers.
 * Talks to: frontend/lib/api.ts (calls /api/map/custom and /api/map/custom/apply), Next.js routing (useRouter).
 */

'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '../../lib/api';
import { useAuth } from '../../lib/useAuth';
import clsx from 'clsx';

// Cell types matching backend CellType enum
const CELL_FREE = 0;
const CELL_OBSTACLE = 1;
const CELL_STORAGE = 2; // Pickup / Goods start
const CELL_DROPOFF = 3; // Destination / Goal
const CELL_CHARGING = 4; // Robot Start Bay

type Tool = 'obstacle' | 'robot' | 'pickup' | 'dropoff' | 'erase';

interface SavedMapMeta {
  id: number;
  name: string;
  created_at: string;
  width: number;
  height: number;
  robot_count: number;
  description?: string;
}

/**
 * Interactive map builder interface.
 * Renders a clickable/draggable grid canvas allowing custom warehouse floor layout design,
 * template loading, custom map saving, and instant 1-click simulation launching.
 */
export default function MapBuilderPage() {
  const router = useRouter();
  const { isAuthenticated } = useAuth();

  // Grid dimensions
  const [width, setWidth] = useState(30);
  const [height, setHeight] = useState(20);

  // 2D Array of cells [row][col]
  const [grid, setGrid] = useState<number[][]>(() =>
    Array.from({ length: 20 }, () => Array(30).fill(CELL_FREE))
  );

  // Active painting tool
  const [activeTool, setActiveTool] = useState<Tool>('obstacle');

  // Mouse drag tracking
  const isMouseDownRef = useRef(false);
  const isRightClickRef = useRef(false);

  // Hovered coordinates
  const [hovered, setHovered] = useState<{ r: number; c: number } | null>(null);

  // Save map modal / state
  const [mapName, setMapName] = useState('My Custom Layout');
  const [saveStatus, setSaveStatus] = useState<string | null>(null);
  const [savedMaps, setSavedMaps] = useState<SavedMapMeta[]>([]);
  const [selectedSavedId, setSelectedSavedId] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  // Load saved maps list
  const loadSavedList = useCallback(async () => {
    try {
      const list = await api.getCustomMaps();
      setSavedMaps(list);
    } catch {
      // Ignore if offline
    }
  }, []);

  useEffect(() => {
    loadSavedList();
  }, [loadSavedList]);

  // Load preset template
  const loadPresetTemplate = async (name: string) => {
    setLoading(true);
    try {
      if (name === 'blank') {
        setGrid(Array.from({ length: height }, () => Array(width).fill(CELL_FREE)));
      } else {
        const data = (await api.getPreset(name, width, height)) as {
          width: number;
          height: number;
          cells: number[][];
        };
        setWidth(data.width);
        setHeight(data.height);
        setGrid(data.cells);
      }
      setSaveStatus(`Loaded "${name}" template.`);
      setTimeout(() => setSaveStatus(null), 3000);
    } catch (err: unknown) {
      setSaveStatus(err instanceof Error ? err.message : 'Failed to load preset');
    } finally {
      setLoading(false);
    }
  };

  // Load an existing saved map
  const handleLoadSavedMap = async (id: number) => {
    if (!id) return;
    setLoading(true);
    try {
      const m = await api.getCustomMap(id);
      setWidth(m.width);
      setHeight(m.height);
      setGrid(m.cells);
      setMapName(m.name);
      setSelectedSavedId(id);
      setSaveStatus(`Loaded custom map "${m.name}".`);
      setTimeout(() => setSaveStatus(null), 3000);
    } catch (err: unknown) {
      setSaveStatus(err instanceof Error ? err.message : 'Failed to load map');
    } finally {
      setLoading(false);
    }
  };

  // Delete saved map
  const handleDeleteSavedMap = async (id: number) => {
    if (!confirm('Are you sure you want to delete this custom map?')) return;
    try {
      await api.deleteCustomMap(id);
      if (selectedSavedId === id) setSelectedSavedId(null);
      await loadSavedList();
      setSaveStatus('Map deleted.');
      setTimeout(() => setSaveStatus(null), 3000);
    } catch (err: unknown) {
      setSaveStatus(err instanceof Error ? err.message : 'Failed to delete');
    }
  };

  // Apply cell edit at (r, c)
  const applyToolAt = useCallback(
    (r: number, c: number, tool: Tool, erase = false) => {
      if (r < 0 || r >= height || c < 0 || c >= width) return;

      let newType = CELL_FREE;
      if (!erase) {
        switch (tool) {
          case 'obstacle':
            newType = CELL_OBSTACLE;
            break;
          case 'robot':
            newType = CELL_CHARGING;
            break;
          case 'pickup':
            newType = CELL_STORAGE;
            break;
          case 'dropoff':
            newType = CELL_DROPOFF;
            break;
          case 'erase':
            newType = CELL_FREE;
            break;
        }
      }

      setGrid(prev => {
        if (prev[r]?.[c] === newType) return prev;
        const next = prev.map(row => [...row]);
        next[r][c] = newType;
        return next;
      });
    },
    [height, width]
  );

  // Compute stats
  const stats = {
    obstacles: 0,
    robots: 0,
    pickups: 0,
    dropoffs: 0,
    free: 0,
  };

  for (let r = 0; r < height; r++) {
    for (let c = 0; c < width; c++) {
      const v = grid[r]?.[c] ?? CELL_FREE;
      if (v === CELL_OBSTACLE) stats.obstacles++;
      else if (v === CELL_CHARGING) stats.robots++;
      else if (v === CELL_STORAGE) stats.pickups++;
      else if (v === CELL_DROPOFF) stats.dropoffs++;
      else stats.free++;
    }
  }

  // Canvas render loop
  const renderCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const cw = canvas.width;
    const ch = canvas.height;
    ctx.clearRect(0, 0, cw, ch);

    const CELL = Math.floor(Math.min(cw / width, ch / height));
    const offsetX = Math.floor((cw - CELL * width) / 2);
    const offsetY = Math.floor((ch - CELL * height) / 2);

    // Background
    ctx.fillStyle = '#0a0e1a';
    ctx.fillRect(0, 0, cw, ch);

    // Grid board background
    ctx.fillStyle = '#0f172a';
    ctx.fillRect(offsetX, offsetY, width * CELL, height * CELL);

    // Draw cells
    for (let r = 0; r < height; r++) {
      for (let c = 0; c < width; c++) {
        const x = offsetX + c * CELL;
        const y = offsetY + r * CELL;
        const ct = grid[r]?.[c] ?? CELL_FREE;

        if (ct === CELL_OBSTACLE) {
          // Obstacle / Shelf
          ctx.fillStyle = '#1e293b';
          ctx.fillRect(x + 1, y + 1, CELL - 1, CELL - 1);
          ctx.strokeStyle = '#f59e0b88';
          ctx.lineWidth = 1;
          ctx.strokeRect(x + 1.5, y + 1.5, CELL - 2, CELL - 2);

          // Diagonal hatch lines for shelves
          ctx.strokeStyle = '#334155';
          ctx.beginPath();
          ctx.moveTo(x + 3, y + CELL - 3);
          ctx.lineTo(x + CELL - 3, y + 3);
          ctx.stroke();
        } else if (ct === CELL_CHARGING) {
          // Robot start / Charging pad
          ctx.fillStyle = '#064e3b';
          ctx.fillRect(x + 1, y + 1, CELL - 1, CELL - 1);
          ctx.strokeStyle = '#10b981';
          ctx.lineWidth = 1.5;
          ctx.strokeRect(x + 1.5, y + 1.5, CELL - 2, CELL - 2);

          // Marker 'C' / Robot symbol
          ctx.fillStyle = '#34d399';
          ctx.font = `bold ${Math.max(9, CELL * 0.42)}px sans-serif`;
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText('C', x + CELL / 2, y + CELL / 2);
        } else if (ct === CELL_STORAGE) {
          // Pickup station (Storage P)
          ctx.fillStyle = '#451a03';
          ctx.fillRect(x + 1, y + 1, CELL - 1, CELL - 1);
          ctx.strokeStyle = '#f97316';
          ctx.lineWidth = 1.5;
          ctx.strokeRect(x + 1.5, y + 1.5, CELL - 2, CELL - 2);

          ctx.fillStyle = '#fb923c';
          ctx.font = `bold ${Math.max(9, CELL * 0.42)}px sans-serif`;
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText('P', x + CELL / 2, y + CELL / 2);
        } else if (ct === CELL_DROPOFF) {
          // Destination (Dropoff D)
          ctx.fillStyle = '#1e1b4b';
          ctx.fillRect(x + 1, y + 1, CELL - 1, CELL - 1);
          ctx.strokeStyle = '#818cf8';
          ctx.lineWidth = 1.5;
          ctx.strokeRect(x + 1.5, y + 1.5, CELL - 2, CELL - 2);

          ctx.fillStyle = '#a5b4fc';
          ctx.font = `bold ${Math.max(9, CELL * 0.42)}px sans-serif`;
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText('D', x + CELL / 2, y + CELL / 2);
        } else {
          // Walkable aisle
          ctx.fillStyle = '#0f172a';
          ctx.fillRect(x + 1, y + 1, CELL - 1, CELL - 1);
          ctx.strokeStyle = '#1e293b';
          ctx.lineWidth = 0.5;
          ctx.strokeRect(x + 0.5, y + 0.5, CELL, CELL);

          // Subtle center dot
          if (CELL >= 14) {
            ctx.fillStyle = '#334155';
            ctx.fillRect(x + CELL / 2 - 0.5, y + CELL / 2 - 0.5, 1, 1);
          }
        }
      }
    }

    // Draw hover preview highlight
    if (hovered && hovered.r >= 0 && hovered.r < height && hovered.c >= 0 && hovered.c < width) {
      const hx = offsetX + hovered.c * CELL;
      const hy = offsetY + hovered.r * CELL;
      ctx.strokeStyle = '#60a5fa';
      ctx.lineWidth = 2;
      ctx.strokeRect(hx + 0.5, hy + 0.5, CELL - 1, CELL - 1);
    }
  }, [width, height, grid, hovered]);

  useEffect(() => {
    renderCanvas();
  }, [renderCanvas]);

  // Handle canvas resize
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const obs = new ResizeObserver(() => {
      canvas.width = canvas.offsetWidth;
      canvas.height = canvas.offsetHeight;
      renderCanvas();
    });
    obs.observe(canvas);
    canvas.width = canvas.offsetWidth;
    canvas.height = canvas.offsetHeight;
    renderCanvas();
    return () => obs.disconnect();
  }, [renderCanvas]);

  // Coordinate resolution helper
  const getCellFromMouse = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    const px = e.clientX - rect.left;
    const py = e.clientY - rect.top;

    const CELL = Math.floor(Math.min(canvas.width / width, canvas.height / height));
    const offsetX = Math.floor((canvas.width - CELL * width) / 2);
    const offsetY = Math.floor((canvas.height - CELL * height) / 2);

    const c = Math.floor((px - offsetX) / CELL);
    const r = Math.floor((py - offsetY) / CELL);

    if (r >= 0 && r < height && c >= 0 && c < width) {
      return { r, c };
    }
    return null;
  };

  // Mouse event handlers for continuous dragging
  const handleMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    isMouseDownRef.current = true;
    isRightClickRef.current = e.button === 2;

    const cell = getCellFromMouse(e);
    if (cell) {
      applyToolAt(cell.r, cell.c, activeTool, isRightClickRef.current);
    }
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const cell = getCellFromMouse(e);
    setHovered(cell);

    if (isMouseDownRef.current && cell) {
      applyToolAt(cell.r, cell.c, activeTool, isRightClickRef.current);
    }
  };

  const handleMouseUp = () => {
    isMouseDownRef.current = false;
    isRightClickRef.current = false;
  };

  // Save map to Library
  const handleSaveMap = async () => {
    if (!mapName.trim()) {
      alert('Please enter a map name');
      return;
    }
    setLoading(true);
    try {
      await api.saveCustomMap({
        name: mapName.trim(),
        cells: grid,
        width,
        height,
        robot_count: stats.robots || 5,
        description: `Custom layout: ${stats.robots} robots, ${stats.pickups} pickups, ${stats.dropoffs} dropoffs`,
      });
      setSaveStatus(`Map "${mapName}" saved successfully!`);
      await loadSavedList();
      setTimeout(() => setSaveStatus(null), 3000);
    } catch (err: unknown) {
      setSaveStatus(err instanceof Error ? err.message : 'Save failed');
    } finally {
      setLoading(false);
    }
  };

  // 1-Click: Launch Directly into Simulator
  const handleLaunchSimulator = async () => {
    if (!isAuthenticated) {
      router.push('/signup');
      return;
    }
    setLoading(true);
    try {
      await api.applyCustomMap({
        cells: grid,
        width,
        height,
        name: mapName || 'Custom Warehouse',
        robot_count: stats.robots || 5,
      });
      router.push('/simulator');
    } catch (err: unknown) {
      setSaveStatus(err instanceof Error ? err.message : 'Launch failed');
      setLoading(false);
    }
  };

  return (
    <div className="min-h-[calc(100vh-4rem)] p-4 md:p-6 max-w-7xl mx-auto flex flex-col gap-5">
      {/* Top Header & Launch Action */}
      <div className="flex flex-wrap items-center justify-between gap-4 bg-surface border border-surface-2 rounded-2xl p-5 shadow-lg">
        <div>
          <div className="flex items-center gap-2.5">
            <span className="text-2xl">🛠️</span>
            <h1 className="text-xl font-extrabold text-white tracking-wide">
              Warehouse Map Builder & Customizer
            </h1>
          </div>
          <p className="text-xs text-gray-400 mt-1">
            Draw custom obstacles, robot staging pads, goods pickup bays, and dropoff destinations.
            Paint by clicking and dragging.
          </p>
        </div>

        {/* Action Buttons */}
        <div className="flex flex-wrap items-center gap-2.5">
          <button
            onClick={handleLaunchSimulator}
            disabled={loading}
            className="flex items-center gap-2 px-5 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs rounded-xl shadow-md transition-all transform hover:scale-[1.02] active:scale-[0.98]"
          >
            <span>🚀</span>
            <span>Simulate This Map</span>
          </button>

          <button
            onClick={handleSaveMap}
            disabled={loading}
            className="flex items-center gap-1.5 px-4 py-2.5 bg-surface-2 hover:bg-gray-700 text-gray-200 border border-gray-600 font-semibold text-xs rounded-xl shadow transition-colors"
          >
            <span>💾</span>
            <span>Save to Library</span>
          </button>
        </div>
      </div>

      {saveStatus && (
        <div className="bg-blue-950/70 border border-blue-600 text-blue-200 text-xs px-4 py-2.5 rounded-xl flex items-center justify-between">
          <span>{saveStatus}</span>
          <button onClick={() => setSaveStatus(null)} className="text-blue-400 hover:text-white">✕</button>
        </div>
      )}

      {/* Main Builder Grid Workspace */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-5">
        {/* Left Sidebar: Tools & Library */}
        <div className="lg:col-span-1 space-y-4">
          {/* Painting Tools Palette */}
          <div className="bg-surface border border-surface-2 rounded-2xl p-4 shadow">
            <h3 className="text-xs font-bold text-gray-300 uppercase tracking-wider mb-3">
              🎨 Painting Tools
            </h3>
            <div className="grid grid-cols-1 gap-2">
              {[
                {
                  id: 'obstacle' as Tool,
                  label: '🧱 Obstacle / Shelf',
                  desc: 'Solid shelving barrier',
                  color: 'hover:border-amber-500/80',
                  activeBg: 'bg-amber-950/50 border-amber-500 text-amber-200',
                },
                {
                  id: 'robot' as Tool,
                  label: '🤖 Robot Start Bay (C)',
                  desc: 'Charging pad & robot spawn point',
                  color: 'hover:border-emerald-500/80',
                  activeBg: 'bg-emerald-950/50 border-emerald-500 text-emerald-200',
                },
                {
                  id: 'pickup' as Tool,
                  label: '📦 Pickup Station (P)',
                  desc: 'Inventory pickup shelf',
                  color: 'hover:border-orange-500/80',
                  activeBg: 'bg-orange-950/50 border-orange-500 text-orange-200',
                },
                {
                  id: 'dropoff' as Tool,
                  label: '🏁 Dropoff Station (D)',
                  desc: 'Delivery goal dock',
                  color: 'hover:border-indigo-500/80',
                  activeBg: 'bg-indigo-950/50 border-indigo-500 text-indigo-200',
                },
                {
                  id: 'erase' as Tool,
                  label: '🧹 Free / Erase',
                  desc: 'Clear back to open floor',
                  color: 'hover:border-gray-500',
                  activeBg: 'bg-gray-800 border-gray-400 text-white',
                },
              ].map(t => (
                <button
                  key={t.id}
                  onClick={() => setActiveTool(t.id)}
                  className={clsx(
                    'w-full text-left p-2.5 rounded-xl border transition-all text-xs flex flex-col gap-0.5',
                    activeTool === t.id
                      ? `${t.activeBg} font-bold shadow-sm`
                      : 'bg-surface-2/60 border-gray-700/60 text-gray-300 hover:bg-surface-2'
                  )}
                >
                  <span className="font-semibold">{t.label}</span>
                  <span className="text-[10px] text-gray-400">{t.desc}</span>
                </button>
              ))}
            </div>

            <p className="text-[10px] text-gray-500 mt-3 italic">
              Tip: Click & drag to paint cells. Right-click & drag instantly erases.
            </p>
          </div>

          {/* Preset Starters & Templates */}
          <div className="bg-surface border border-surface-2 rounded-2xl p-4 shadow">
            <h3 className="text-xs font-bold text-gray-300 uppercase tracking-wider mb-2.5">
              📐 Template Starters
            </h3>
            <div className="grid grid-cols-2 gap-1.5 text-xs">
              <button
                onClick={() => loadPresetTemplate('warehouse')}
                className="px-2.5 py-1.5 bg-surface-2 hover:bg-gray-700 border border-gray-700 rounded-lg text-gray-300 text-center"
              >
                Warehouse Aisles
              </button>
              <button
                onClick={() => loadPresetTemplate('congested')}
                className="px-2.5 py-1.5 bg-surface-2 hover:bg-gray-700 border border-gray-700 rounded-lg text-gray-300 text-center"
              >
                Congested Chokes
              </button>
              <button
                onClick={() => loadPresetTemplate('open_floor')}
                className="px-2.5 py-1.5 bg-surface-2 hover:bg-gray-700 border border-gray-700 rounded-lg text-gray-300 text-center"
              >
                Open Floor
              </button>
              <button
                onClick={() => loadPresetTemplate('random')}
                className="px-2.5 py-1.5 bg-surface-2 hover:bg-gray-700 border border-gray-700 rounded-lg text-gray-300 text-center"
              >
                Random Obstacles
              </button>
              <button
                onClick={() => loadPresetTemplate('blank')}
                className="col-span-2 px-2.5 py-1.5 bg-rose-950/40 hover:bg-rose-900/60 border border-rose-800/80 rounded-lg text-rose-300 text-center font-semibold"
              >
                🧹 Clear Grid (Blank Canvas)
              </button>
            </div>
          </div>

          {/* Saved Maps Library */}
          <div className="bg-surface border border-surface-2 rounded-2xl p-4 shadow">
            <h3 className="text-xs font-bold text-gray-300 uppercase tracking-wider mb-2.5">
              📂 Saved Custom Maps
            </h3>
            <div className="space-y-2">
              <div>
                <label className="text-[11px] text-gray-400 block mb-1">Map Name</label>
                <input
                  type="text"
                  value={mapName}
                  onChange={e => setMapName(e.target.value)}
                  className="w-full bg-surface-2 text-white text-xs px-2.5 py-1.5 rounded-lg border border-gray-700 focus:outline-none focus:border-accent"
                />
              </div>

              {savedMaps.length > 0 && (
                <div>
                  <label className="text-[11px] text-gray-400 block mb-1">Load Saved Layout</label>
                  <div className="flex gap-1.5">
                    <select
                      value={selectedSavedId || ''}
                      onChange={e => handleLoadSavedMap(Number(e.target.value))}
                      className="flex-1 bg-surface-2 text-white text-xs px-2 py-1.5 rounded-lg border border-gray-700 focus:outline-none"
                    >
                      <option value="">-- Choose saved map --</option>
                      {savedMaps.map(m => (
                        <option key={m.id} value={m.id}>
                          {m.name} ({m.robot_count} robots)
                        </option>
                      ))}
                    </select>

                    {selectedSavedId && (
                      <button
                        onClick={() => handleDeleteSavedMap(selectedSavedId)}
                        className="px-2.5 py-1 bg-rose-950 hover:bg-rose-900 border border-rose-800 text-rose-300 rounded text-xs"
                        title="Delete this custom map"
                      >
                        🗑️
                      </button>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Right Canvas: Interactive Map Editor */}
        <div className="lg:col-span-3 flex flex-col gap-3">
          {/* Real-time Map Stats Bar */}
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-2.5 bg-surface border border-surface-2 rounded-xl p-3 text-xs">
            <div className="bg-surface-2/60 px-3 py-2 rounded-lg border border-gray-700/60">
              <span className="text-[10px] text-gray-400 block">🤖 Robots (C)</span>
              <span className="font-mono font-bold text-emerald-400 text-sm">
                {stats.robots} bays
              </span>
            </div>

            <div className="bg-surface-2/60 px-3 py-2 rounded-lg border border-gray-700/60">
              <span className="text-[10px] text-gray-400 block">📦 Pickups (P)</span>
              <span className="font-mono font-bold text-orange-400 text-sm">
                {stats.pickups} stations
              </span>
            </div>

            <div className="bg-surface-2/60 px-3 py-2 rounded-lg border border-gray-700/60">
              <span className="text-[10px] text-gray-400 block">🏁 Destinations (D)</span>
              <span className="font-mono font-bold text-indigo-400 text-sm">
                {stats.dropoffs} stations
              </span>
            </div>

            <div className="bg-surface-2/60 px-3 py-2 rounded-lg border border-gray-700/60">
              <span className="text-[10px] text-gray-400 block">🧱 Obstacles</span>
              <span className="font-mono font-bold text-amber-400 text-sm">
                {stats.obstacles} cells
              </span>
            </div>

            <div className="bg-surface-2/60 px-3 py-2 rounded-lg border border-gray-700/60">
              <span className="text-[10px] text-gray-400 block">Hovered Cell</span>
              <span className="font-mono text-gray-300 text-sm">
                {hovered ? `(${hovered.r}, ${hovered.c})` : '—'}
              </span>
            </div>
          </div>

          {/* Canvas Viewport */}
          <div className="flex-1 min-h-[500px] bg-surface border border-surface-2 rounded-2xl overflow-hidden p-3 flex flex-col shadow-inner">
            <div className="flex items-center justify-between text-xs text-gray-400 mb-2 px-1">
              <span>
                Grid: <b>{width} × {height}</b> cells
              </span>
              <span className="text-emerald-400 font-semibold">
                {stats.robots > 0 && stats.pickups > 0 && stats.dropoffs > 0
                  ? '✨ Ready for Simulation! Click "Simulate This Map" above.'
                  : 'ℹ️ Add at least 1 Robot Start (C), 1 Pickup (P), and 1 Dropoff (D).'}
              </span>
            </div>

            <div className="flex-1 relative w-full h-full min-h-[460px] rounded-xl overflow-hidden border border-gray-800 bg-[#0a0e1a]">
              <canvas
                ref={canvasRef}
                className="w-full h-full cursor-crosshair"
                onMouseDown={handleMouseDown}
                onMouseMove={handleMouseMove}
                onMouseUp={handleMouseUp}
                onMouseLeave={handleMouseUp}
                onContextMenu={e => e.preventDefault()}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
