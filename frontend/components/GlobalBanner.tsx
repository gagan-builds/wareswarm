'use client';

import React from 'react';

/**
 * Global status banner informing users that all features are free and unlocked.
 */
export default function GlobalBanner() {
  return (
    <div className="bg-surface-2/80 border-b border-surface-2 text-xs py-1.5 px-4 flex items-center justify-between flex-wrap gap-2">
      <div className="flex items-center gap-2">
        <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
          FREE & UNLOCKED
        </span>
        <span className="text-gray-300">
          WareSwarm is 100% Free — All path planners, swarm coordination algorithms, and benchmarks are fully unlocked.
        </span>
      </div>
      <div className="flex items-center gap-2 text-emerald-400 font-semibold text-[11px] ml-auto">
        <span>⚡ All Features Active</span>
      </div>
    </div>
  );
}
