/**
 * Purpose: API Keys & Headless Integration Settings page for WareSwarm.
 * Role in project: Allows developers and robotics engineers to create and revoke hashed API keys
 * for programmatic simulation execution, with copy-once token revelation and curl examples.
 */
'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { api } from '../../../lib/api';
import { useAuth } from '../../../lib/useAuth';

export default function ApiKeysPage() {
  const router = useRouter();
  const { isAuthenticated, loading: authLoading } = useAuth();
  const [keys, setKeys] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [keyName, setKeyName] = useState('');
  const [scopes, setScopes] = useState<string[]>(['read']);
  const [creating, setCreating] = useState(false);
  const [newKeyData, setNewKeyData] = useState<{ key: string; name: string } | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const loadKeys = async () => {
    try {
      setLoading(true);
      const res = await api.listApiKeys();
      setKeys(res.api_keys || []);
    } catch (err: any) {
      console.error('Failed to load API keys:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!authLoading && !isAuthenticated) {
      router.push('/login?redirect=/settings/api');
      return;
    }
    if (isAuthenticated) {
      loadKeys();
    }
  }, [isAuthenticated, authLoading]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!keyName.trim()) return;

    try {
      setCreating(true);
      setErrorMsg(null);
      const res = await api.createApiKey(keyName.trim(), scopes);
      setNewKeyData({ key: res.api_key, name: res.name });
      setKeyName('');
      await loadKeys();
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to create API key.');
    } finally {
      setCreating(false);
    }
  };

  const handleRevoke = async (keyId: number, name: string) => {
    if (!confirm(`Are you sure you want to revoke '${name}'? Any scripts using this key will immediately fail.`)) {
      return;
    }
    try {
      await api.revokeApiKey(keyId);
      await loadKeys();
    } catch (err: any) {
      alert(err.message || 'Failed to revoke key.');
    }
  };

  const toggleScope = (scope: string) => {
    if (scopes.includes(scope)) {
      if (scopes.length > 1) {
        setScopes(scopes.filter((s) => s !== scope));
      }
    } else {
      setScopes([...scopes, scope]);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-accent border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  const sampleKey = newKeyData?.key || 'ws_live_YOUR_SECRET_API_KEY';

  return (
    <div className="min-h-screen bg-background py-10 px-4 sm:px-6 lg:px-8">
      <div className="max-w-5xl mx-auto space-y-8">
        {/* Header */}
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div>
            <h1 className="text-3xl font-extrabold text-white">API Keys & Automation</h1>
            <p className="text-xs text-gray-400 mt-1">
              Authenticate programmatic headless simulation runs and algorithm benchmarks via <code className="text-accent font-mono">/api/v1/</code>
            </p>
          </div>
          <div className="flex items-center gap-3">
            <Link
              href="/settings/billing"
              className="text-xs font-semibold px-4 py-2 rounded-xl bg-surface-2 hover:bg-gray-700 text-gray-300 transition-colors"
            >
              ← Billing & Meters
            </Link>
          </div>
        </div>

        {/* Newly Created Secret Key Banner (Shown ONCE) */}
        {newKeyData && (
          <div className="bg-emerald-500/10 border-2 border-emerald-500/40 rounded-3xl p-6 shadow-xl animate-in fade-in">
            <div className="flex items-center gap-2 text-emerald-400 font-extrabold text-sm mb-2">
              <span>✓</span> API Key Created Successfully
            </div>
            <p className="text-xs text-gray-300 mb-3">
              Copy this secret key now. For security, it is stored hashed on our backend and <strong>will never be shown again</strong>:
            </p>
            <div className="flex items-center gap-3 bg-surface p-3 rounded-2xl border border-emerald-500/30">
              <input
                type="text"
                readOnly
                value={newKeyData.key}
                className="flex-1 bg-transparent text-xs font-mono text-emerald-300 select-all focus:outline-none"
              />
              <button
                onClick={() => {
                  navigator.clipboard.writeText(newKeyData.key);
                  alert('Copied API key to clipboard!');
                }}
                className="px-4 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 font-bold text-xs text-white transition-colors"
              >
                Copy Key
              </button>
            </div>
          </div>
        )}

        {/* Create API Key Form */}
        <div className="bg-surface border border-surface-2 rounded-3xl p-6 sm:p-7">
          <h2 className="text-base font-bold text-white mb-2">Create New API Key</h2>
          <p className="text-xs text-gray-400 mb-6">
            Assign a human-readable identifier and select the permission scopes required for your automation pipeline.
          </p>

          <form onSubmit={handleCreate} className="space-y-4 max-w-xl">
            <div>
              <label className="block text-xs font-semibold text-gray-300 mb-1.5">
                Key Label / Purpose
              </label>
              <input
                type="text"
                required
                value={keyName}
                onChange={(e) => setKeyName(e.target.value)}
                placeholder="e.g. GitHub Actions CI / Python SDK"
                className="w-full px-4 py-2.5 rounded-xl bg-surface-2 border border-gray-700 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-accent"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-gray-300 mb-2">
                Permission Scopes
              </label>
              <div className="flex items-center gap-6">
                <label className="flex items-center gap-2 cursor-pointer text-xs text-gray-300">
                  <input
                    type="checkbox"
                    checked={scopes.includes('read')}
                    onChange={() => toggleScope('read')}
                    className="rounded bg-surface-2 border-gray-700 text-accent focus:ring-0"
                  />
                  <span>
                    <strong>read</strong> (Planner comparison & telemetry queries)
                  </span>
                </label>

                <label className="flex items-center gap-2 cursor-pointer text-xs text-gray-300">
                  <input
                    type="checkbox"
                    checked={scopes.includes('write')}
                    onChange={() => toggleScope('write')}
                    className="rounded bg-surface-2 border-gray-700 text-accent focus:ring-0"
                  />
                  <span>
                    <strong>write</strong> (Execute headless simulation runs - Team+)
                  </span>
                </label>
              </div>
            </div>

            <button
              type="submit"
              disabled={creating}
              className="py-2.5 px-6 rounded-xl bg-accent hover:bg-blue-500 font-bold text-xs text-white shadow-md transition-all disabled:opacity-50"
            >
              {creating ? 'Generating Key...' : 'Generate API Key'}
            </button>
          </form>

          {errorMsg && (
            <div className="mt-4 p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-xs text-rose-400 font-semibold">
              {errorMsg}
            </div>
          )}
        </div>

        {/* Existing Keys Table */}
        <div className="bg-surface border border-surface-2 rounded-3xl p-6 sm:p-7 overflow-x-auto">
          <h2 className="text-base font-bold text-white mb-4">Workspace API Keys</h2>

          {keys.length === 0 ? (
            <div className="text-xs text-gray-400 py-6 text-center">
              No API keys generated yet. Generate a key above to start using the programmatic REST API.
            </div>
          ) : (
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-b border-surface-2 text-gray-400 uppercase text-[10px] tracking-wider">
                  <th className="py-3 px-3">Name</th>
                  <th className="py-3 px-3">Prefix / Hash</th>
                  <th className="py-3 px-3">Scopes</th>
                  <th className="py-3 px-3">Created</th>
                  <th className="py-3 px-3">Last Used</th>
                  <th className="py-3 px-3">Status</th>
                  <th className="py-3 px-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-surface-2 text-gray-200">
                {keys.map((k) => (
                  <tr key={k.id}>
                    <td className="py-3 px-3 font-bold text-white">{k.name}</td>
                    <td className="py-3 px-3 font-mono text-gray-400">{k.prefix}</td>
                    <td className="py-3 px-3">
                      <div className="flex gap-1">
                        {k.scopes.map((s: string) => (
                          <span
                            key={s}
                            className="px-2 py-0.5 rounded text-[10px] font-mono bg-surface-2 text-gray-300"
                          >
                            {s}
                          </span>
                        ))}
                      </div>
                    </td>
                    <td className="py-3 px-3 text-gray-400">
                      {new Date(k.created_at).toLocaleDateString()}
                    </td>
                    <td className="py-3 px-3 text-gray-400">
                      {k.last_used_at ? new Date(k.last_used_at).toLocaleDateString() : 'Never'}
                    </td>
                    <td className="py-3 px-3">
                      <span
                        className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                          k.revoked
                            ? 'bg-rose-500/10 text-rose-400 border border-rose-500/30'
                            : 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30'
                        }`}
                      >
                        {k.revoked ? 'Revoked' : 'Active'}
                      </span>
                    </td>
                    <td className="py-3 px-3 text-right">
                      {!k.revoked && (
                        <button
                          onClick={() => handleRevoke(k.id, k.name)}
                          className="text-rose-400 hover:text-rose-300 font-semibold text-xs"
                        >
                          Revoke
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* cURL Usage Examples */}
        <div className="bg-surface border border-surface-2 rounded-3xl p-6 sm:p-7 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-bold text-white">cURL Integration Quickstart</h2>
            <a
              href="http://localhost:8000/docs"
              target="_blank"
              rel="noreferrer"
              className="text-xs font-semibold text-accent hover:underline font-mono"
            >
              Interactive OpenAPI Docs (/docs) →
            </a>
          </div>

          <div className="space-y-4 text-xs font-mono">
            {/* Example 1: Run Headless Sim */}
            <div className="bg-surface-2/60 rounded-2xl p-4 border border-gray-800">
              <div className="text-[11px] font-bold text-gray-300 mb-2 font-sans">
                1. Execute Headless Simulation Run (Requires 'write' scope):
              </div>
              <pre className="text-emerald-400 overflow-x-auto whitespace-pre-wrap select-all">
{`curl -X POST http://localhost:8000/api/v1/simulations/run \\
  -H "Authorization: Bearer ${sampleKey}" \\
  -H "Content-Type: application/json" \\
  -d '{"map_preset": "warehouse", "num_robots": 5, "max_ticks": 100}'`}
              </pre>
            </div>

            {/* Example 2: Compare Planners */}
            <div className="bg-surface-2/60 rounded-2xl p-4 border border-gray-800">
              <div className="text-[11px] font-bold text-gray-300 mb-2 font-sans">
                2. Benchmark A* vs Dijkstra (Requires 'read' scope):
              </div>
              <pre className="text-blue-400 overflow-x-auto whitespace-pre-wrap select-all">
{`curl -X POST http://localhost:8000/api/v1/planners/compare \\
  -H "Authorization: Bearer ${sampleKey}" \\
  -H "Content-Type: application/json" \\
  -d '{"map_preset": "congested", "start": [1, 1], "goal": [15, 20]}'`}
              </pre>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
