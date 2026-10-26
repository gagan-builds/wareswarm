/**
 * Purpose: High-performance 2D HTML5 Canvas renderer for warehouse visualization and fleet animation.
 * Role in the project: Visual presentation layer that transforms discrete backend grid coordinates into a smooth 60 FPS animation.
 * Key contents: WarehouseCanvas component, coordinate transformation math, sub-tick continuous LERP position interpolation, layered canvas drawing pipeline, interactive click hit-testing.
 * Talks to: frontend/lib/types.ts (SimState), parent page frontend/app/simulator/page.tsx.
 *
 * Canvas Coordinate Conversion & Layer Architecture:
 * 1. Grid-to-Pixel Coordinate Conversion:
 *    - CELL = Math.floor(Math.min(canvas.width / grid.width, canvas.height / grid.height)) computes the square cell pixel size.
 *    - offsetX = (canvas.width - CELL * grid.width) / 2 and offsetY = (canvas.height - CELL * grid.height) / 2 center the grid.
 *    - A grid cell at (row, col) maps to top-left pixel (offsetX + col * CELL, offsetY + row * CELL) and center (offsetX + col * CELL + CELL / 2, offsetY + row * CELL + CELL / 2).
 *    - Mouse clicks at (clientX, clientY) convert back to grid coordinates via col = Math.floor((px - offsetX) / CELL) and row = Math.floor((py - offsetY) / CELL).
 *
 * 2. Drawing Order of Layers (Back to Front):
 *    - Layer 1: Floor canvas clear (#0a0e1a dark background).
 *    - Layer 2: Warehouse grid floor cells and borders (Free, Obstacle shelves, Storage pickup, Dropoff workstations, Charging pads).
 *    - Layer 3: Cell zone typography labels ('P', 'D', 'C').
 *    - Layer 4: Robot trajectory paths (translucent dashed route lines) and goal target diamonds.
 *    - Layer 5: Ambient ground drop-shadows beneath each robot.
 *    - Layer 6: Status halos (emerald glow when carrying cargo, amber dashed ring when waiting, purple ring when replanning, red ring when blocked).
 *    - Layer 7: Robot AGV circular chassis with directional heading indicators.
 *    - Layer 8: Cargo container boxes mounted on top of carrying robots.
 *    - Layer 9: Upright robot numerical ID badges.
 */
'use client';

import { useRef, useEffect, useCallback } from 'react';
import type { SimState } from '../lib/types';

const CELL_COLORS: Record<number, string> = {
  0: '#0d1117', // FREE
  1: '#374151', // OBSTACLE (steel shelf walls)
  2: '#b45309', // STORAGE / PICKUP (vibrant warm amber)
  3: '#047857', // DROPOFF (emerald dock)
  4: '#3730a3', // CHARGING (indigo pad)
};

const CELL_BORDER: Record<number, string> = {
  0: '#161b26',
  1: '#4b5563',
  2: '#f59e0b', // Glowing bright amber border for Pickup
  3: '#10b981', // Emerald border for Dropoff
  4: '#6366f1', // Indigo border for Charging
};

interface RobotRenderState {
  x: number; // floating point col
  y: number; // floating point row
  angle: number; // heading radians
}

interface Props {
  state: SimState | null;
  onCellClick: (row: number, col: number) => void;
  clickMode: string;
}

/**
 * Interactive warehouse floor canvas component.
 * Executes a continuous requestAnimationFrame loop at 60 FPS with exponential position interpolation (LERP)
 * so robots glide fluidly between grid cells rather than jumping discretely.
 * @param {Props} props SimState snapshot, onCellClick callback, and current clickMode tool.
 */
export default function WarehouseCanvas({ state, onCellClick, clickMode }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rafRef = useRef<number | null>(null);
  const renderPosRef = useRef<Map<number, RobotRenderState>>(new Map());
  const stateRef = useRef<SimState | null>(state);

  // Keep stateRef fresh for the continuous animation loop
  stateRef.current = state;

  const renderFrame = useCallback(() => {
    const canvas = canvasRef.current;
    const currentState = stateRef.current;
    if (!canvas || !currentState) {
      rafRef.current = requestAnimationFrame(renderFrame);
      return;
    }

    const ctx = canvas.getContext('2d', { alpha: false });
    if (!ctx) {
      rafRef.current = requestAnimationFrame(renderFrame);
      return;
    }

    const grid = currentState.grid;
    const CELL = Math.floor(Math.min(
      canvas.width / grid.width,
      canvas.height / grid.height,
    ));

    if (CELL < 1) {
      rafRef.current = requestAnimationFrame(renderFrame);
      return;
    }

    const offsetX = Math.floor((canvas.width - CELL * grid.width) / 2);
    const offsetY = Math.floor((canvas.height - CELL * grid.height) / 2);

    // 1. Clear background
    ctx.fillStyle = '#0a0e1a';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // 2. Draw warehouse grid cells
    for (let r = 0; r < grid.height; r++) {
      for (let c = 0; c < grid.width; c++) {
        const ct = grid.cells[r][c];
        const x = offsetX + c * CELL;
        const y = offsetY + r * CELL;

        ctx.fillStyle = CELL_COLORS[ct] ?? CELL_COLORS[0];
        ctx.fillRect(x, y, CELL, CELL);

        ctx.strokeStyle = CELL_BORDER[ct] ?? '#161b26';
        ctx.lineWidth = 0.5;
        ctx.strokeRect(x + 0.5, y + 0.5, CELL - 1, CELL - 1);

        // Labels for functional zones
        // Functional zone markers (Pickup 'P', Dropoff 'D', Charging 'C')
        if (ct > 1) {
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';

          if (ct === 2) {
            // Prominent, highly visible Pickup (P) marker
            if (CELL >= 6) {
              ctx.fillStyle = '#ffffff';
              ctx.font = `bold ${Math.max(7, Math.floor(CELL * 0.48))}px sans-serif`;
              ctx.fillText('P', x + CELL / 2, y + CELL / 2);
            } else {
              ctx.fillStyle = '#fef08a';
              ctx.fillRect(x + CELL * 0.2, y + CELL * 0.2, CELL * 0.6, CELL * 0.6);
            }
          } else if (ct === 3) {
            // Dropoff (D)
            if (CELL >= 6) {
              ctx.fillStyle = '#ffffff';
              ctx.font = `bold ${Math.max(7, Math.floor(CELL * 0.48))}px sans-serif`;
              ctx.fillText('D', x + CELL / 2, y + CELL / 2);
            }
          } else if (ct === 4) {
            // Charging (C)
            if (CELL >= 6) {
              ctx.fillStyle = '#ffffff';
              ctx.font = `bold ${Math.max(7, Math.floor(CELL * 0.48))}px sans-serif`;
              ctx.fillText('C', x + CELL / 2, y + CELL / 2);
            }
          }
        }
      }
    }

    // 3. Draw planned paths (sleek antialiased dashed route lines)
    for (const robot of currentState.robots) {
      if (!robot.path || robot.path.length < 1) continue;

      const pos = renderPosRef.current.get(robot.id) || { x: robot.col, y: robot.row, angle: 0 };

      ctx.beginPath();
      ctx.strokeStyle = robot.color + '44'; // Translucent path
      ctx.lineWidth = Math.max(1.5, CELL * 0.14);
      ctx.setLineDash([CELL * 0.25, CELL * 0.2]);

      // Start line at robot's current smooth interpolated center
      ctx.moveTo(
        offsetX + pos.x * CELL + CELL / 2,
        offsetY + pos.y * CELL + CELL / 2,
      );

      for (const [pr, pc] of robot.path) {
        ctx.lineTo(offsetX + pc * CELL + CELL / 2, offsetY + pr * CELL + CELL / 2);
      }
      ctx.stroke();
      ctx.setLineDash([]);

      // Goal target diamond
      if (robot.goal && CELL >= 10) {
        const [gr, gc] = robot.goal;
        const gx = offsetX + gc * CELL + CELL / 2;
        const gy = offsetY + gr * CELL + CELL / 2;
        const d = Math.max(3.5, CELL * 0.16);

        ctx.beginPath();
        ctx.moveTo(gx, gy - d);
        ctx.lineTo(gx + d, gy);
        ctx.lineTo(gx, gy + d);
        ctx.lineTo(gx - d, gy);
        ctx.closePath();
        ctx.fillStyle = robot.color + 'bb';
        ctx.fill();
        ctx.strokeStyle = '#ffffff88';
        ctx.lineWidth = 1;
        ctx.stroke();
      }
    }

    // 4. Interpolate and draw robots
    const r_radius = Math.max(4, CELL * 0.38);
    const LERP_FACTOR = 0.26; // High responsiveness with smooth continuous gliding

    for (const robot of currentState.robots) {
      let rState = renderPosRef.current.get(robot.id);

      if (!rState) {
        rState = { x: robot.col, y: robot.row, angle: 0 };
        renderPosRef.current.set(robot.id, rState);
      }

      const targetX = robot.col;
      const targetY = robot.row;
      const dx = targetX - rState.x;
      const dy = targetY - rState.y;
      const dist = Math.hypot(dx, dy);

      if (dist > 3) {
        // Teleport or initial spawn
        rState.x = targetX;
        rState.y = targetY;
      } else {
        // Smooth exponential interpolation
        rState.x += dx * LERP_FACTOR;
        rState.y += dy * LERP_FACTOR;

        if (dist > 0.02) {
          // Update heading angle towards target
          const targetAngle = Math.atan2(dy, dx);
          // Angle smoothing
          const angleDiff = Math.atan2(Math.sin(targetAngle - rState.angle), Math.cos(targetAngle - rState.angle));
          rState.angle += angleDiff * 0.35;
        }
      }

      const cx = offsetX + rState.x * CELL + CELL / 2;
      const cy = offsetY + rState.y * CELL + CELL / 2;

      // Soft ground ambient shadow
      ctx.beginPath();
      ctx.arc(cx, cy + 1.5, r_radius + 1, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(0, 0, 0, 0.45)';
      ctx.fill();

      // State rings (carrying / waiting / blocked / replanning)
      if (robot.carrying) {
        // Glowing halo for payload AGV
        ctx.beginPath();
        ctx.arc(cx, cy, r_radius + 3.5, 0, Math.PI * 2);
        ctx.strokeStyle = '#10b981';
        ctx.lineWidth = 2;
        ctx.stroke();
      }

      if (robot.state === 'waiting') {
        ctx.setLineDash([3, 2.5]);
        ctx.beginPath();
        ctx.arc(cx, cy, r_radius + 3, 0, Math.PI * 2);
        ctx.strokeStyle = '#f59e0b';
        ctx.lineWidth = 1.5;
        ctx.stroke();
        ctx.setLineDash([]);
      } else if (robot.state === 'replanning') {
        ctx.setLineDash([2, 2]);
        ctx.beginPath();
        ctx.arc(cx, cy, r_radius + 3, 0, Math.PI * 2);
        ctx.strokeStyle = '#8b5cf6';
        ctx.lineWidth = 1.5;
        ctx.stroke();
        ctx.setLineDash([]);
      } else if (robot.state === 'blocked') {
        ctx.beginPath();
        ctx.arc(cx, cy, r_radius + 4, 0, Math.PI * 2);
        ctx.strokeStyle = '#ef4444';
        ctx.lineWidth = 2;
        ctx.stroke();
      }

      // Main robot body (AGV chassis)
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(rState.angle);

      // Chassis circle
      ctx.beginPath();
      ctx.arc(0, 0, r_radius, 0, Math.PI * 2);
      ctx.fillStyle = robot.color;
      ctx.fill();
      ctx.strokeStyle = '#ffffff44';
      ctx.lineWidth = 1;
      ctx.stroke();

      // Forward direction nose indicator (subtle triangular pointer)
      ctx.beginPath();
      ctx.moveTo(r_radius - 1, 0);
      ctx.lineTo(r_radius * 0.4, -r_radius * 0.45);
      ctx.lineTo(r_radius * 0.4, r_radius * 0.45);
      ctx.closePath();
      ctx.fillStyle = '#ffffffbb';
      ctx.fill();

      // Cargo pallet box on top when carrying
      if (robot.carrying) {
        const boxSize = r_radius * 0.75;
        ctx.fillStyle = '#065f46';
        ctx.fillRect(-boxSize / 2, -boxSize / 2, boxSize, boxSize);
        ctx.strokeStyle = '#34d399';
        ctx.lineWidth = 1;
        ctx.strokeRect(-boxSize / 2, -boxSize / 2, boxSize, boxSize);
      }

      ctx.restore();

      // ID label (rendered upright without rotation)
      if (CELL >= 13) {
        ctx.fillStyle = '#ffffff';
        ctx.font = `bold ${Math.max(7, CELL * 0.28)}px sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(String(robot.id), cx, cy);
      }
    }

    // Keep loop active
    rafRef.current = requestAnimationFrame(renderFrame);
  }, []);

  // Start continuous 60fps animation loop
  useEffect(() => {
    rafRef.current = requestAnimationFrame(renderFrame);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [renderFrame]);

  // Handle canvas resize
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const obs = new ResizeObserver(() => {
      canvas.width = canvas.offsetWidth;
      canvas.height = canvas.offsetHeight;
    });
    obs.observe(canvas);
    canvas.width = canvas.offsetWidth;
    canvas.height = canvas.offsetHeight;
    return () => obs.disconnect();
  }, []);

  const handleClick = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    const currentState = stateRef.current;
    if (!canvas || !currentState || clickMode === 'none') return;
    const rect = canvas.getBoundingClientRect();
    const px = e.clientX - rect.left;
    const py = e.clientY - rect.top;

    const grid = currentState.grid;
    const CELL = Math.floor(Math.min(canvas.width / grid.width, canvas.height / grid.height));
    const offsetX = Math.floor((canvas.width - CELL * grid.width) / 2);
    const offsetY = Math.floor((canvas.height - CELL * grid.height) / 2);

    const col = Math.floor((px - offsetX) / CELL);
    const row = Math.floor((py - offsetY) / CELL);

    if (row >= 0 && row < grid.height && col >= 0 && col < grid.width) {
      onCellClick(row, col);
    }
  }, [clickMode, onCellClick]);

  const cursorStyle =
    clickMode === 'none' ? 'default' :
    clickMode === 'obstacle' ? 'crosshair' : 'pointer';

  return (
    <canvas
      ref={canvasRef}
      className="w-full h-full rounded-lg"
      style={{ cursor: cursorStyle, background: '#0a0e1a' }}
      onClick={handleClick}
    />
  );
}
