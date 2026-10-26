/**
 * Purpose: Real-time WebSocket connection manager and auto-reconnecting subscriber for simulation states.
 * Role in the project: Connects the browser UI to the backend /ws/sim stream to receive live 60Hz/tick updates.
 * Key contents: getWsUrl, useSimWebSocket hook, exponential back-off reconnection loop, HTTP bootstrap fetch.
 * Talks to: backend/app/api/ws.py (via ws://host:8000/ws/sim), frontend/lib/api.ts, frontend/app/simulator/page.tsx.
 */

'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import type { SimState } from './types';
import { api } from './api';

/**
 * Resolves the WebSocket endpoint URL using environment variables or window location.
 * Uses wss:// if current connection is HTTPS, otherwise ws://.
 */
function getWsUrl(): string {
  if (process.env.NEXT_PUBLIC_WS_URL) {
    return process.env.NEXT_PUBLIC_WS_URL;
  }
  if (typeof window !== 'undefined') {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const hostname = window.location.hostname || 'localhost';
    return `${protocol}//${hostname}:8000`;
  }
  return 'ws://localhost:8000';
}

/** Possible states for the simulation WebSocket connection. */
export type WsStatus = 'connecting' | 'connected' | 'disconnected' | 'error';

/**
 * Custom React hook that maintains an active WebSocket connection to the simulation backend.
 *
 * Connection lifecycle:
 * 1. Initial HTTP Bootstrap: Calls api.getState() immediately on mount so grid and robots render before WS handshake completes.
 * 2. Connect: Opens WebSocket to /ws/sim.
 * 3. Message Handling: Discards keepalive ping packets, parses JSON into SimState, and updates React state.
 * 4. Auto-Reconnect: On disconnect or error, schedules a reconnection attempt with exponential back-off (1s up to 10s).
 */
export function useSimWebSocket() {
  const [state, setState] = useState<SimState | null>(null);
  const [status, setStatus] = useState<WsStatus>('disconnected');
  const wsRef = useRef<WebSocket | null>(null);
  const retryRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const retryDelay = useRef(1000);

  // Initial HTTP fetch so warehouse map and robots appear immediately on page load
  useEffect(() => {
    api.getState()
      .then((data) => {
        setState((prev) => prev ?? (data as SimState));
      })
      .catch(() => {});
  }, []);

  // Establishes WebSocket connection and configures event listeners
  const connect = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) return;
    setStatus('connecting');
    const wsUrl = getWsUrl();
    const ws = new WebSocket(`${wsUrl}/ws/sim`);
    wsRef.current = ws;

    // Successful connection: reset back-off timer to 1000ms
    ws.onopen = () => {
      setStatus('connected');
      retryDelay.current = 1000;
    };

    // Receive incoming state broadcast from backend Simulator._broadcast()
    ws.onmessage = (e) => {
      try {
        const data = JSON.parse(e.data as string);
        if (data.type === 'ping') return; // ignore heartbeat ping
        setState(data as SimState);
      } catch {
        // ignore malformed message parse errors
      }
    };

    ws.onerror = () => setStatus('error');

    // On disconnect, trigger exponential back-off reconnection loop
    ws.onclose = () => {
      setStatus('disconnected');
      wsRef.current = null;
      retryRef.current = setTimeout(() => {
        retryDelay.current = Math.min(retryDelay.current * 1.5, 10_000);
        connect();
      }, retryDelay.current);
    };
  }, []);

  // Initialize connection on component mount and clean up on unmount
  useEffect(() => {
    connect();
    return () => {
      if (retryRef.current) clearTimeout(retryRef.current);
      wsRef.current?.close();
    };
  }, [connect]);

  // Manual fallback refresh to re-fetch state via REST
  const refresh = useCallback(async () => {
    try {
      const s = await api.getState() as SimState;
      setState(s);
    } catch {
      // ignore fetch errors
    }
  }, []);

  return { state, status, setState, refresh };
}
