/**
 * Purpose: Tailwind CSS design system configuration for the WareSwarm frontend.
 * Role in the project: Defines theme colors, custom palette (dark warehouse theme), fonts, and scanned template paths.
 * Key contents: content paths, theme colors (background, surface, accent, status indicators), fontFamily mono.
 * Talks to: frontend/app/globals.css and all React TSX components in frontend/app and frontend/components.
 */

/** @type {import('tailwindcss').Config} */
module.exports = {
  // File paths where Tailwind utility classes are scanned and compiled
  content: [
    './app/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './lib/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      // Dark mode palette for warehouse floor and dashboard visualization
      colors: {
        background: '#0a0e1a', // Deep dark blue-black floor canvas
        surface: '#111827',    // Card and sidebar panel background
        'surface-2': '#1f2937',// Subtle elevated borders and secondary panels
        accent: '#3b82f6',     // Primary brand blue (active buttons, links, paths)
        'accent-2': '#8b5cf6',   // Purple indicator (re-planning, secondary metrics)
        success: '#10b981',    // Emerald green for completed tasks and dropoff stations
        warning: '#f59e0b',    // Amber for storage shelves, waiting states, and warnings
        danger: '#ef4444',     // Red for collisions, blocked robots, and errors
      },
      fontFamily: {
        mono: ['JetBrains Mono', 'Fira Code', 'monospace'],
      },
    },
  },
  plugins: [],
}
