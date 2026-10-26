/**
 * Purpose: Shared TypeScript interfaces, types, and data models for the WareSwarm frontend.
 * Role in the project: Defines the contract between backend Python dataclasses/Pydantic schemas and frontend React state.
 * Key contents: RobotState, CellType, RobotData, TaskData, SimEvent, GlobalMetrics, GridData, SimConfigData, SimState, PlannerResult, PlannerCompareResult, CompareModesResult, SavedRun.
 * Talks to: Used by frontend/lib/api.ts, frontend/lib/useSimWebSocket.ts, frontend/components/*, and frontend/app/*.
 */

/** Possible operational states an autonomous robot (AGV) can be in during warehouse execution. */
export type RobotState =
  | 'idle'              // Robot has no current assignment and is waiting for work
  | 'assigned'          // Robot was assigned a task and is planning its route
  | 'moving_to_pickup'  // Robot is navigating toward the task's inventory pickup cell
  | 'carrying'          // Robot has reached pickup and picked up the warehouse item
  | 'moving_to_dropoff' // Robot is navigating toward the delivery drop-off workstation
  | 'waiting'           // Robot is temporarily yielding to let higher-priority robot pass
  | 'replanning'        // Robot detected a conflict or obstacle and is computing a new path
  | 'blocked'           // Robot cannot find an alternate route and is in a deadlock resolution cycle
  | 'done';             // Robot finished all assigned work

/** Numerical cell types matching backend Grid cell values. */
export type CellType = 0 | 1 | 2 | 3 | 4; // 0=FREE, 1=OBSTACLE, 2=STORAGE, 3=DROPOFF, 4=CHARGING

/** Lifetime performance counters for an individual robot. */
export interface RobotMetrics {
  total_distance: number; // Cumulative grid steps traveled
  total_wait: number;     // Total ticks spent in waiting state
  total_moving: number;   // Total ticks spent moving across cells
  tasks_done: number;     // Total warehouse tasks successfully completed
}

/** Complete runtime snapshot of a single robot transmitted over WebSocket or REST. */
export interface RobotData {
  id: number;                          // Unique integer robot identifier (e.g. 0, 1, 2)
  x: number;                           // Column index (horizontal coordinate)
  y: number;                           // Row index (vertical coordinate)
  row: number;                         // Current grid row index [0..height-1]
  col: number;                         // Current grid column index [0..width-1]
  state: RobotState;                   // Current operational state
  path: [number, number][];            // Planned waypoint sequence as [[row, col], ...]
  goal: [number, number] | null;       // Current target cell [row, col] or null if idle
  carrying: boolean;                   // True if currently transporting a pod/package
  task_id: number | null;              // ID of currently assigned warehouse task or null
  color: string;                       // Hex color code assigned for canvas rendering
  waiting_ticks: number;               // Consecutive ticks spent waiting at current position
  replan_count: number;                // Number of times this robot computed a new route
  metrics: RobotMetrics;               // Robot-level cumulative statistics
}

/** Warehouse delivery task lifecycle representation. */
export interface TaskData {
  task_id: number;                                                  // Unique task serial number
  pickup: [number, number];                                         // [row, col] coordinates of inventory storage shelf
  dropoff: [number, number];                                        // [row, col] coordinates of packing/drop-off station
  status: 'pending' | 'assigned' | 'in_flight' | 'done' | 'failed'; // Task lifecycle status
  assigned_robot_id: number | null;                                 // Robot ID handling this task or null
  created_tick: number;                                             // Simulation tick when task was spawned
  assigned_tick: number | null;                                     // Simulation tick when robot claimed task
  completed_tick: number | null;                                    // Simulation tick when package was delivered
  completion_time: number | null;                                   // Duration in ticks from creation to completion
}

/** Discrete simulation event emitted during a tick for the live event feed. */
export interface SimEvent {
  type: string;             // Event identifier (e.g., collision, task_completed, deadlock_resolved)
  tick: number;             // Simulation tick when the event occurred
  robot_id?: number;        // Primary robot involved in the event
  task_id?: number;         // Task ID involved in the event
  collision?: string;       // Human-readable collision description if collision occurred
  cycle?: number[];         // List of robot IDs involved in a detected wait-for graph cycle
  leader?: number;          // Robot ID selected to yield or back off
  [key: string]: unknown;   // Additional dynamic metadata fields
}

/** Aggregate system-wide simulation performance metrics. */
export interface GlobalMetrics {
  tick: number;                 // Current simulation tick count
  tasks_completed: number;      // Total warehouse delivery tasks finished
  tasks_pending: number;        // Tasks waiting in the queue for an available robot
  tasks_in_flight: number;      // Tasks currently being carried by robots
  throughput: number;           // Average tasks completed per 100 simulation ticks
  avg_completion_time: number;  // Mean ticks elapsed per completed task
  collision_count: number;      // Total physical collisions (vertex or swap conflicts)
  collisions_prevented: number; // Collisions avoided via reservation table or yielding
  deadlocks_detected: number;   // Circular wait-for cycles detected in the swarm
  deadlocks_resolved: number;   // Deadlocks successfully broken by priority back-off
  replan_count: number;         // Cumulative path re-computations triggered
  avg_nodes_expanded: number;   // Mean search tree nodes expanded per path search
  avg_planning_time_ms: number; // Mean time in ms spent in path planning
  utilisation_moving: number;   // Percentage of active robot fleet moving (0 to 100)
  utilisation_waiting: number;  // Percentage of active robot fleet waiting (0 to 100)
  utilisation_idle: number;     // Percentage of active robot fleet idle (0 to 100)
  total_distance: number;       // Cumulative distance traveled by all robots
  total_wait_ticks: number;     // Cumulative wait ticks across all robots
  total_move_ticks: number;     // Cumulative moving ticks across all robots
}

/** Warehouse 2D floor grid structure and layout. */
export interface GridData {
  width: number;       // Grid width in cells (columns)
  height: number;      // Grid height in cells (rows)
  cells: number[][];   // 2D grid matrix: cells[row][col] represents CellType enum
}

/** Active simulation configuration settings. */
export interface SimConfigData {
  num_robots: number;                // Number of active robots on the warehouse floor (1 to 30)
  planner: string;                   // Path planning algorithm: 'astar' | 'dijkstra' | 'space_time_astar'
  heuristic: string;                 // Heuristic function: 'manhattan' | 'euclidean'
  connectivity: number;              // Movement connectivity: 4 (orthogonal) or 8 (diagonal)
  coordination: 'swarm' | 'naive';   // Swarm coordination mode (conflict avoidance) vs naive independent agents
  allocation: string;                // Task assignment algorithm: 'nearest' | 'hungarian'
  task_rate: number;                 // Probability (0.0 to 1.0) of spawning a new task per tick
  seed: number | null;               // Seed used for deterministic pseudorandom number generation
  speed: number;                     // Simulation speed multiplier (0.1x to 5.0x)
  map_preset: string;                // Warehouse map layout preset name
  grid_width: number;                // Floor width in cells
  grid_height: number;               // Floor height in cells
}

/** Full state snapshot broadcast by the backend simulator on every tick or HTTP request. */
export interface SimState {
  tick: number;                      // Current simulation tick
  running: boolean;                  // True if the simulator is actively ticking
  paused: boolean;                   // True if simulation is temporarily paused
  coordination: 'swarm' | 'naive';   // Active coordination mode
  config?: SimConfigData;            // Simulator configuration parameters
  robots: RobotData[];               // Array of all robots on the floor
  tasks: TaskData[];                 // Array of active and historical tasks
  obstacles: [number, number][];     // List of obstacle coordinates [[row, col], ...]
  events: SimEvent[];                // Recent event log entries
  metrics: GlobalMetrics;            // Real-time aggregate simulation metrics
  grid: GridData;                    // Grid dimensions and cell layout
}

/** Performance benchmark output for a single path planning algorithm run. */
export interface PlannerResult {
  planner: string;                   // Algorithm name ('astar' or 'dijkstra')
  success: boolean;                  // True if an obstacle-free path was discovered
  cost: number;                      // Total path traversal cost (1 per step)
  expanded_nodes: number;            // Number of search graph states popped from the priority queue
  explored_cells?: [number, number][]; // Ordered list of visited [row, col] cells for visual tinting
  runtime_ms: number;                // Computation time in milliseconds
  path: [number, number][];          // Final optimal sequence of coordinates [[row, col], ...]
  path_length: number;               // Number of waypoints along the final path
}

/** Comparative benchmarking result between A* and Dijkstra algorithms on the same map. */
export interface PlannerCompareResult {
  astar: PlannerResult;              // Benchmark metrics and explored cells for A*
  dijkstra: PlannerResult;           // Benchmark metrics and explored cells for Dijkstra
  start: [number, number];           // Starting coordinates [row, col]
  goal: [number, number];            // Target coordinates [row, col]
  grid?: GridData;                   // Map layout on which the comparison was executed
}

/** Execution metrics for a single headless simulation run. */
export interface ModeRunResult {
  run_id: number;                    // Saved database run identifier
  metrics: GlobalMetrics;            // Final aggregate metrics at run termination
  total_ticks: number;               // Number of ticks simulated
  timed_out: boolean;                // True if max_ticks limit was reached before all tasks finished
}

/** Side-by-side benchmark comparison between NAIVE and SWARM multi-agent coordination. */
export interface CompareModesResult {
  seed: number;                      // Pseudorandom seed applied identically to both runs
  map_preset: string;                // Map layout preset tested
  num_robots: number;                // Robot count used during the test
  max_ticks: number;                 // Maximum tick cutoff
  naive: ModeRunResult;              // Uncoordinated baseline result (independent A*)
  swarm: ModeRunResult;              // Swarm coordinated result (space-time reservation + deadlock resolution)
}

/** Persisted simulation run record stored in the database. */
export interface SavedRun {
  id: number;                        // Primary key in saved_runs database table
  created_at: string;                // ISO timestamp when the run was recorded
  map_preset: string;                // Map preset used
  coordination: string;              // Coordination mode ('swarm' or 'naive')
  planner: string;                   // Path planner used ('astar', 'dijkstra')
  num_robots: number;                // Number of robots in the fleet
  seed: number | null;               // Seed used for reproducible replay
  total_ticks: number;               // Total ticks simulated before saving
  metrics: GlobalMetrics | null;     // Stored performance metrics snapshot
  notes: string | null;              // Optional user annotations
}


/** Error payload emitted when a feature or plan quota is exceeded. */
export interface PlanLimitErrorDetail {
  code: 'PLAN_LIMIT' | 'FEATURE_LOCKED';
  limit?: string;
  current?: number;
  max_allowed?: number;
  feature?: string;
  required_plan: string;
  upgrade_url: string;
  message?: string;
}

/** Definition of a SaaS Subscription Plan from GET /api/billing/plans. */
export interface PlanTier {
  id: string;
  name: string;
  price_monthly: number;
  price_yearly: number;
  annual_savings: number;
  description: string;
  features: string[];
  limits: {
    robots: number;
    map_size: [number, number];
    map_presets: string;
    saved_maps: number;
    saved_runs: number;
    simulation_runs: number;
    planners: string[];
    coordination_modes: string[];
    api_keys: string;
    team_members: number;
    support: string;
    watermark: boolean;
  };
  highlighted?: boolean;
}

export interface PlansResponse {
  plans: PlanTier[];
  product_name: string;
  test_mode: boolean;
  trial_duration_days: number;
  grace_period_days: number;
}

/** Organization subscription status from GET /api/billing/subscription. */
export interface SubscriptionInfo {
  organization: {
    id: number;
    name: string;
    slug: string;
  };
  subscription: {
    plan: string;
    status: 'trialing' | 'active' | 'past_due' | 'canceled';
    billing_interval: 'month' | 'year';
    current_period_start: string | null;
    current_period_end: string | null;
    cancel_at_period_end: boolean;
    trial_start: string | null;
    trial_end: string | null;
    past_due_since: string | null;
    provider: string;
  };
  trial_days_remaining: number;
  in_grace_period: boolean;
  grace_days_remaining: number;
  entitlements: {
    plan: string;
    limits: Record<string, any>;
    features: Record<string, boolean>;
    effective_plan: string;
  };
  product_name: string;
  test_mode: boolean;
  provider: string;
}

/** Organization monthly usage meters from GET /api/billing/usage. */
export interface UsageSummary {
  period: string;
  meters: {
    simulation_runs: { used: number; limit: number; pct: number };
    robots: { used: number; limit: number; pct: number };
    saved_maps: { used: number; limit: number; pct: number };
    api_calls: { used: number; limit: number; pct: number };
  };
  plan: string;
}

/** Billing invoice item. */
export interface InvoiceItem {
  id: number;
  amount: number;
  currency: string;
  status: string;
  period: string;
  created_at: string;
  pdf_url?: string;
  provider_invoice_id?: string;
}

/** Workspace team member. */
export interface TeamMember {
  id: number;
  username: string;
  email: string;
  full_name?: string;
  role: 'owner' | 'admin' | 'member';
  created_at?: string;
}

/** Workspace pending invitation. */
export interface TeamInviteItem {
  id: number;
  email: string;
  role: 'admin' | 'member';
  expires_at?: string;
  invite_url: string;
  token: string;
}

/** Team overview response from GET /api/team/members. */
export interface TeamOverview {
  organization: {
    id: number;
    name: string;
    slug: string;
  };
  seats_limit: number;
  seats_used: number;
  pending_count: number;
  current_user_role: string;
  members: TeamMember[];
  invites: TeamInviteItem[];
}
