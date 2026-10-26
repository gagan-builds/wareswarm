/**
 * Purpose: REST API client library for the WareSwarm frontend.
 * Role in the project: Provides typed asynchronous methods to communicate with the FastAPI backend endpoints.
 * Key contents: getApiUrl, generic request helper, simulation control methods, map presets, custom map CRUD, planner comparison, mode comparison, runs management, and authentication methods.
 * Talks to: Calls backend REST endpoints defined in backend/app/api/*. Used by all frontend React components and pages.
 */


/**
 * Resolves the backend API base URL from environment variables or browser window location.
 * @returns {string} The base URL for REST API calls (e.g. 'http://localhost:8000').
 */
export function getApiUrl(): string {
  if (typeof window !== 'undefined') {
    const customUrl = localStorage.getItem('wareswarm_api_url');
    if (customUrl) return customUrl.trim().replace(/\/+$/, '');
  }
  if (process.env.NEXT_PUBLIC_API_URL) {
    return process.env.NEXT_PUBLIC_API_URL.trim().replace(/\/+$/, '');
  }
  if (typeof window !== 'undefined') {
    const protocol = window.location.protocol;
    const hostname = window.location.hostname || 'localhost';
    return `${protocol}//${hostname}:8000`;
  }
  return 'http://localhost:8000';
}

import type {
  PlansResponse,
  SubscriptionInfo,
  UsageSummary,
  InvoiceItem,
  TeamOverview,
  PlanLimitErrorDetail,
} from './types';

/**
 * Generic JSON HTTP request wrapper handling serialization, headers, and error parsing.
 * Automatically injects stored Bearer token and intercepts PLAN_LIMIT events.
 * @template T Return type expected from the backend endpoint.
 * @param {string} path URL endpoint path (e.g. '/api/sim/start').
 * @param {RequestInit} [options] Fetch configuration (HTTP method, headers, request body).
 * @returns {Promise<T>} Parsed JSON response from the server.
 * @throws {Error} Throws if HTTP status is not 2xx.
 */
async function request<T>(
  path: string,
  options?: RequestInit
): Promise<T> {
  const apiUrl = getApiUrl();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };

  // Automatically attach session bearer token from localStorage if available
  if (typeof window !== 'undefined') {
    try {
      const token = localStorage.getItem('wareswarm_auth_token');
      if (token && !headers['Authorization']) {
        headers['Authorization'] = `Bearer ${token}`;
      }
    } catch {
      // Ignore storage access errors in private/iframe browsing
    }
  }

  // Merge any caller-provided custom headers
  if (options?.headers) {
    Object.assign(headers, options.headers);
  }

  const res = await fetch(`${apiUrl}${path}`, {
    ...options,
    headers,
  });

  if (!res.ok) {
    const rawText = await res.text();
    let errDetail: any = null;
    try {
      const parsed = JSON.parse(rawText);
      errDetail = parsed.detail || parsed;
    } catch {
      // not JSON
    }

    // Intercept subscription plan and feature limits
    if (
      errDetail &&
      typeof errDetail === 'object' &&
      (errDetail.code === 'PLAN_LIMIT' || errDetail.code === 'FEATURE_LOCKED')
    ) {
      if (typeof window !== 'undefined') {
        window.dispatchEvent(
          new CustomEvent('wareswarm:plan_limit', {
            detail: errDetail as PlanLimitErrorDetail,
          })
        );
      }
    }

    const message =
      (errDetail && errDetail.message) ||
      (errDetail && typeof errDetail === 'string' ? errDetail : rawText);
    const err = new Error(`API ${path} failed (${res.status}): ${message}`);
    (err as any).status = res.status;
    (err as any).detail = errDetail;
    throw err;
  }

  return res.json() as Promise<T>;
}

// ---- Simulation control ----

export const api = {
  /**
   * HTTP POST /api/sim/start
   * Starts the background simulation tick loop.
   */
  start: () => request('/api/sim/start', { method: 'POST' }),

  /**
   * HTTP POST /api/sim/pause
   * Pauses the running simulation tick loop while preserving all state.
   */
  pause: () => request('/api/sim/pause', { method: 'POST' }),

  /**
   * HTTP POST /api/sim/resume
   * Resumes simulation execution after being paused.
   */
  resume: () => request('/api/sim/resume', { method: 'POST' }),

  /**
   * HTTP POST /api/sim/step
   * Advances the warehouse simulation forward by exactly one discrete tick.
   */
  step: () => request('/api/sim/step', { method: 'POST' }),

  /**
   * HTTP POST /api/sim/reset
   * Resets simulation clock to tick 0, clears tasks and reservations, and respawns fleet.
   */
  reset: () => request('/api/sim/reset', { method: 'POST' }),

  /**
   * HTTP GET /api/sim/state
   * Fetches the full current simulation snapshot (robots, tasks, grid, metrics).
   */
  getState: () => request('/api/sim/state'),

  /**
   * HTTP GET /api/sim/config
   * Fetches the current active simulation configuration parameters.
   */
  getConfig: () => request('/api/sim/config'),

  /**
   * HTTP GET /api/sim/metrics/live
   * Fetches the current real-time aggregate performance metrics.
   */
  getLiveMetrics: () => request('/api/sim/metrics/live'),

  /**
   * HTTP PUT /api/sim/config
   * Updates simulator parameters (fleet size, speed, planner, seed, coordination mode).
   * @param {Record<string, unknown>} cfg Partial or full configuration dictionary.
   */
  configure: (cfg: Record<string, unknown>) =>
    request('/api/sim/config', {
      method: 'PUT',
      body: JSON.stringify(cfg),
    }),

  /**
   * HTTP POST /api/sim/tasks
   * Injects a dynamic delivery task with specified pickup and dropoff coordinates.
   */
  addTask: (pickup_row: number, pickup_col: number, dropoff_row: number, dropoff_col: number) =>
    request('/api/sim/tasks', {
      method: 'POST',
      body: JSON.stringify({ pickup_row, pickup_col, dropoff_row, dropoff_col }),
    }),

  /**
   * HTTP POST /api/sim/robots
   * Spawns an additional robot at the designated floor coordinate.
   */
  addRobot: (row: number, col: number) =>
    request('/api/sim/robots', {
      method: 'POST',
      body: JSON.stringify({ row, col }),
    }),

  /**
   * HTTP POST /api/sim/obstacle
   * Injects a dynamic obstacle cell during simulation execution.
   */
  addObstacle: (row: number, col: number) =>
    request('/api/sim/obstacle', {
      method: 'POST',
      body: JSON.stringify({ row, col }),
    }),

  /**
   * HTTP POST /api/sim/cell
   * Toggles cell type at a specific grid position (e.g., storage, free, dropoff).
   */
  toggleCell: (row: number, col: number, cell_type: number) =>
    request('/api/sim/cell', {
      method: 'POST',
      body: JSON.stringify({ row, col, cell_type }),
    }),

  // ---- Map ----

  /**
   * HTTP GET /api/map
   * Retrieves the current active grid floor layout and cell matrices.
   */
  getMap: () => request('/api/map'),

  /**
   * HTTP GET /api/map/presets
   * Retrieves the list of available built-in warehouse map preset names.
   */
  getPresets: () => request<{ presets: string[] }>('/api/map/presets'),

  /**
   * HTTP GET /api/map/presets/:name
   * Generates and returns a map layout for a specific preset name and dimensions.
   */
  getPreset: (name: string, width = 30, height = 20) =>
    request(`/api/map/presets/${name}?width=${width}&height=${height}`),

  /**
   * HTTP POST /api/map/preset/:name/apply
   * Loads a built-in map preset directly into the active simulation.
   */
  applyPreset: (name: string) =>
    request(`/api/map/preset/${name}/apply`, { method: 'POST' }),

  // ---- Custom Maps ----

  /**
   * HTTP GET /api/map/custom
   * Fetches metadata for all saved user-created custom warehouse maps.
   */
  getCustomMaps: () =>
    request<Array<{
      id: number;
      name: string;
      created_at: string;
      width: number;
      height: number;
      robot_count: number;
      description?: string;
    }>>('/api/map/custom'),

  /**
   * HTTP GET /api/map/custom/:id
   * Fetches the complete cell matrix and configuration of a saved custom map.
   */
  getCustomMap: (id: number) =>
    request<{
      id: number;
      name: string;
      created_at: string;
      width: number;
      height: number;
      cells: number[][];
      robot_count: number;
      description?: string;
    }>(`/api/map/custom/${id}`),

  /**
   * HTTP POST /api/map/custom
   * Saves a newly created or edited custom map into the SQLite database.
   */
  saveCustomMap: (data: {
    name: string;
    cells: number[][];
    width: number;
    height: number;
    robot_count?: number;
    description?: string;
  }) =>
    request('/api/map/custom', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  /**
   * HTTP DELETE /api/map/custom/:id
   * Deletes a custom map record from the database.
   */
  deleteCustomMap: (id: number) =>
    request(`/api/map/custom/${id}`, { method: 'DELETE' }),

  /**
   * HTTP POST /api/map/custom/apply
   * Applies custom map cells directly into the live simulator and resets fleet positions.
   */
  applyCustomMap: (data: {
    cells: number[][];
    width: number;
    height: number;
    name?: string;
    robot_count?: number;
  }) =>
    request('/api/map/custom/apply', {
      method: 'POST',
      body: JSON.stringify(data),
    }),


  // ---- Planner comparison ----

  /**
   * HTTP POST /api/planner/compare
   * Runs single-agent A* and Dijkstra side-by-side on identical map coordinates.
   */
  comparePlanners: (params: {
    start_row: number;
    start_col: number;
    goal_row: number;
    goal_col: number;
    heuristic?: string;
    connectivity?: number;
    map_preset?: string;
    cells?: number[][];
  }) =>
    request('/api/planner/compare', {
      method: 'POST',
      body: JSON.stringify(params),
    }),

  // ---- One-click NAIVE vs SWARM comparison ----

  /**
   * HTTP POST /api/compare/modes
   * Runs two headless simulations with the same seed: once NAIVE, once SWARM.
   */
  compareModes: (params: {
    map_preset?: string;
    num_robots?: number;
    planner?: string;
    heuristic?: string;
    connectivity?: number;
    allocation?: string;
    task_rate?: number;
    seed?: number | null;
    max_ticks?: number;
    cells?: number[][];
  }) =>
    request('/api/compare/modes', {
      method: 'POST',
      body: JSON.stringify(params),
    }),

  // ---- Runs ----

  /**
   * HTTP GET /api/runs
   * Retrieves all historically saved simulation runs from the database.
   */
  getRuns: () => request('/api/runs'),

  /**
   * HTTP GET /api/runs/:id
   * Retrieves detailed metrics for a specific historical simulation run.
   */
  getRun: (id: number) => request(`/api/runs/${id}`),

  /**
   * HTTP POST /api/runs/save
   * Persists current active simulation state and metrics to the database.
   */
  saveRun: (notes?: string) =>
    request('/api/runs/save', {
      method: 'POST',
      body: JSON.stringify({ notes }),
    }),

  /**
   * HTTP POST /api/runs/compare
   * Compares two or more saved runs by their database IDs.
   */
  compareRuns: (ids: number[]) =>
    request('/api/runs/compare', {
      method: 'POST',
      body: JSON.stringify(ids),
    }),

  /**
   * HTTP DELETE /api/runs/:id
   * Deletes a saved run from history.
   */
  deleteRun: (id: number) =>
    request(`/api/runs/${id}`, { method: 'DELETE' }),

  // ---- Authentication ----

  /**
   * HTTP POST /api/auth/signup
   * Registers a new user account with hashed password credentials.
   */
  signUp: (data: { username: string; email: string; password: string; full_name?: string; role?: string }) =>
    request<{ status: string; message: string; token: string; user: UserProfile }>('/api/auth/signup', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  /**
   * HTTP POST /api/auth/signin
   * Authenticates existing user by username/email and password.
   */
  signIn: (data: { username_or_email: string; password: string }) =>
    request<{ status: string; message: string; token: string; user: UserProfile }>('/api/auth/signin', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  /**
   * HTTP GET /api/auth/me
   * Validates bearer token and returns current authenticated user profile.
   */
  getMe: (token?: string) => {
    const headers: Record<string, string> = token ? { Authorization: `Bearer ${token}` } : {};
    return request<UserProfile>('/api/auth/me', { headers });
  },

  /**
   * HTTP POST /api/auth/demo
   * Creates or logs into an instant demo guest account for immediate simulator access.
   */
  demoLogin: () =>
    request<{ status: string; message: string; token: string; user: UserProfile }>('/api/auth/demo', {
      method: 'POST',
    }),

  // ---- SaaS Billing & Subscriptions ----

  /**
   * HTTP GET /api/billing/plans
   * Fetches public pricing plans with limits and features.
   */
  getPlans: () => request<PlansResponse>('/api/billing/plans'),

  /**
   * HTTP GET /api/billing/subscription
   * Returns current subscription status, trial countdown, and effective plan limits.
   */
  getSubscription: () => request<SubscriptionInfo>('/api/billing/subscription'),

  /**
   * HTTP GET /api/billing/usage
   * Returns current monthly usage meters (simulation runs, robots, saved maps, api calls).
   */
  getUsage: () => request<UsageSummary>('/api/billing/usage'),

  /**
   * HTTP GET /api/billing/invoices
   * Returns invoice payment history and receipts.
   */
  getInvoices: () => request<{ invoices: InvoiceItem[] }>('/api/billing/invoices'),

  /**
   * HTTP POST /api/billing/checkout
   * Initiates Stripe or Mock test checkout session.
   */
  createCheckout: (plan: string, billing_interval: 'month' | 'year' = 'month', coupon_code?: string) =>
    request<{ checkout_url: string; session_id: string; provider: string }>('/api/billing/checkout', {
      method: 'POST',
      body: JSON.stringify({ plan, billing_interval, coupon_code }),
    }),

  /**
   * HTTP POST /api/billing/change-plan
   * Upgrades (immediate prorated) or schedules downgrade at period end.
   */
  changePlan: (new_plan: string, billing_interval: 'month' | 'year' = 'month') =>
    request<{ status: string; message: string; warnings?: string[] }>('/api/billing/change-plan', {
      method: 'POST',
      body: JSON.stringify({ new_plan, billing_interval }),
    }),

  /**
   * HTTP POST /api/billing/cancel
   * Schedules subscription cancellation at end of current period.
   */
  cancelSubscription: () =>
    request<{ status: string; message: string; cancel_at_period_end: boolean }>('/api/billing/cancel', {
      method: 'POST',
    }),

  /**
   * HTTP POST /api/billing/resume
   * Resumes a canceled subscription before period end.
   */
  resumeSubscription: () =>
    request<{ status: string; message: string; cancel_at_period_end: boolean }>('/api/billing/resume', {
      method: 'POST',
    }),

  /**
   * HTTP POST /api/billing/portal
   * Returns customer billing portal URL.
   */
  getPortalUrl: () =>
    request<{ portal_url: string }>('/api/billing/portal', {
      method: 'POST',
    }),

  /**
   * HTTP POST /api/billing/mock/action
   * Test action runner for QA / viva presentations (simulate payment, failure, renewal, expire trial).
   */
  triggerMockAction: (action: string) =>
    request<{ status: string; action: string }>('/api/billing/mock/action', {
      method: 'POST',
      body: JSON.stringify({ action }),
    }),

  // ---- Workspace Team Collaboration ----

  /**
   * HTTP GET /api/team/members
   * Returns workspace members, pending invites, and seat limits.
   */
  getTeamMembers: () => request<TeamOverview>('/api/team/members'),

  /**
   * HTTP POST /api/team/invite
   * Invites colleague by email (logs invite URL in dev mode).
   */
  inviteTeamMember: (email: string, role: 'admin' | 'member' = 'member') =>
    request<{ status: string; message: string; invite_url: string; token: string }>('/api/team/invite', {
      method: 'POST',
      body: JSON.stringify({ email, role }),
    }),

  /**
   * HTTP POST /api/team/accept-invite
   * Accepts invite token and joins workspace.
   */
  acceptTeamInvite: (token: string) =>
    request<{ status: string; message: string; org_name: string; role: string }>('/api/team/accept-invite', {
      method: 'POST',
      body: JSON.stringify({ token }),
    }),

  /**
   * HTTP DELETE /api/team/members/:id
   * Removes team member from workspace.
   */
  removeTeamMember: (userId: number) =>
    request<{ status: string; message: string }>(`/api/team/members/${userId}`, {
      method: 'DELETE',
    }),

  /**
   * HTTP PATCH /api/team/members/:id/role
   * Updates team member role.
   */
  updateMemberRole: (userId: number, role: 'admin' | 'member') =>
    request<{ status: string; message: string }>(`/api/team/members/${userId}/role`, {
      method: 'PATCH',
      body: JSON.stringify({ role }),
    }),

  /**
   * HTTP POST /api/team/transfer-ownership
   * Transfers workspace ownership to another member.
   */
  transferOwnership: (newOwnerId: number) =>
    request<{ status: string; message: string }>('/api/team/transfer-ownership', {
      method: 'POST',
      body: JSON.stringify({ new_owner_id: newOwnerId }),
    }),

  // ---- Headless API Keys ----

  /**
   * HTTP GET /api/keys
   * Returns all API keys for the workspace.
   */
  listApiKeys: () =>
    request<{
      api_keys: Array<{
        id: number;
        prefix: string;
        name: string;
        scopes: string[];
        created_at: string;
        last_used_at: string | null;
        revoked: boolean;
      }>;
    }>('/api/keys'),

  /**
   * HTTP POST /api/keys
   * Creates a new hashed API key and returns plaintext key once.
   */
  createApiKey: (name: string, scopes: string[] = ['read']) =>
    request<{
      status: string;
      api_key: string;
      prefix: string;
      name: string;
      scopes: string[];
      created_at: string;
      warning: string;
    }>('/api/keys', {
      method: 'POST',
      body: JSON.stringify({ name, scopes }),
    }),

  /**
   * HTTP DELETE /api/keys/:id
   * Revokes an API key.
   */
  revokeApiKey: (keyId: number) =>
    request<{ status: string; message: string }>(`/api/keys/${keyId}`, {
      method: 'DELETE',
    }),

  // ---- Platform Admin & Telemetry ----

  /**
   * HTTP GET /api/admin/metrics
   * Retrieves SaaS metrics: MRR, active trials, churn, plan breakdown.
   */
  getAdminMetrics: () =>
    request<{
      mrr: number;
      total_organizations: number;
      total_users: number;
      total_sim_runs: number;
      runs_this_month: number;
      active_trials: number;
      churned_subscriptions: number;
      plan_distribution: Record<string, number>;
      test_mode: boolean;
    }>('/api/admin/metrics'),

  /**
   * HTTP GET /api/admin/organizations
   * Lists organizations with active subscription statuses.
   */
  getAdminOrganizations: (search?: string) => {
    const query = search ? `?search=${encodeURIComponent(search)}` : '';
    return request<{
      organizations: Array<{
        id: number;
        name: string;
        slug: string;
        created_at: string;
        user_count: number;
        run_count: number;
        subscription: {
          plan: string;
          status: string;
          billing_interval: string;
          trial_end: string | null;
        } | null;
      }>;
    }>(`/api/admin/organizations${query}`);
  },

  /**
   * HTTP POST /api/admin/organizations/:id/override-plan
   * Grants comp plan override to workspace.
   */
  overrideOrgPlan: (orgId: number, plan: string, duration_days = 30, reason = 'Admin comp') =>
    request<{
      status: string;
      message: string;
      organization_id: number;
      new_plan: string;
      period_end: string;
    }>(`/api/admin/organizations/${orgId}/override-plan`, {
      method: 'POST',
      body: JSON.stringify({ plan, duration_days, reason }),
    }),

  /**
   * HTTP GET /api/admin/audit-logs
   * Retrieves security and administrative audit trail.
   */
  getAdminAuditLogs: (limit = 50) =>
    request<{
      audit_logs: Array<{
        id: number;
        org_id: number | null;
        user_id: number | null;
        action: string;
        target_type: string;
        target_id: string | null;
        details: any;
        ip_address: string | null;
        created_at: string;
      }>;
    }>(`/api/admin/audit-logs?limit=${limit}`),
};

/** Authenticated user profile information returned by auth endpoints. */
export interface UserProfile {
  id: number;            // Unique user ID in database
  username: string;      // User handle
  email: string;         // User email address
  full_name?: string;    // Display name
  role?: string;         // Role (e.g. 'engineer', 'operator', 'student')
  is_platform_admin?: boolean;
  created_at?: string;   // Account creation ISO timestamp
}
