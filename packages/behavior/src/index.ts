/**
 * @paradigm/behavior — AI behavior systems for GSPL Paradigm.
 *
 * Implements Behavior Trees, Finite State Machines, Utility AI, GOAP planning,
 * A* pathfinding, and perception — all deterministic, zero external dependencies.
 *
 * @packageDocumentation
 */

import type { UniversalSeed } from '@paradigm/types';
import { DeterministicRNG } from '@paradigm/rng';

// ─────────────────────────────────────────────
// Core Types
// ─────────────────────────────────────────────

/** Outcome of a single behavior node tick. */
export type BehaviorStatus = 'success' | 'failure' | 'running';

/**
 * Interface all behavior tree nodes must satisfy.
 * Every node has a stable name used for debugging and serialization.
 */
export interface BehaviorNode {
  /** Stable identifier for this node (used in debug output and logging). */
  readonly name: string;
  /**
   * Execute one tick of this node's logic.
   * @param context - Shared blackboard for reading/writing AI state.
   * @returns The result status after processing this tick.
   */
  tick(context: Blackboard): BehaviorStatus;
}

// ─────────────────────────────────────────────
// Blackboard
// ─────────────────────────────────────────────

/**
 * Shared key-value store for AI state, passed through the behavior tree.
 * All reads are type-parameterised; callers own the type assertion.
 */
export class Blackboard {
  private readonly data: Map<string, unknown> = new Map();

  /**
   * Read a value by key.
   * @returns The stored value cast to T, or undefined if absent.
   */
  get<T>(key: string): T | undefined {
    return this.data.get(key) as T | undefined;
  }

  /** Store a value by key, overwriting any existing entry. */
  set(key: string, value: unknown): void {
    this.data.set(key, value);
  }

  /** Returns true if the key exists in the blackboard. */
  has(key: string): boolean {
    return this.data.has(key);
  }

  /** Remove a key from the blackboard. Returns true if the key existed. */
  delete(key: string): boolean {
    return this.data.delete(key);
  }

  /** Remove all entries from the blackboard. */
  clear(): void {
    this.data.clear();
  }

  /** Return all currently stored keys. */
  keys(): string[] {
    return Array.from(this.data.keys());
  }
}

// ─────────────────────────────────────────────
// Leaf Nodes
// ─────────────────────────────────────────────

/**
 * Leaf node that executes an arbitrary action function.
 * The action receives the shared blackboard and returns a status.
 */
export class Action implements BehaviorNode {
  readonly name: string;
  private readonly action: (ctx: Blackboard) => BehaviorStatus;

  /**
   * @param name   - Stable identifier for this action.
   * @param action - Callback executed each tick; must return a BehaviorStatus.
   */
  constructor(name: string, action: (ctx: Blackboard) => BehaviorStatus) {
    this.name = name;
    this.action = action;
  }

  tick(context: Blackboard): BehaviorStatus {
    return this.action(context);
  }
}

/**
 * Leaf node that evaluates a boolean predicate.
 * Returns 'success' when the predicate is true, 'failure' otherwise.
 */
export class Condition implements BehaviorNode {
  readonly name: string;
  private readonly predicate: (ctx: Blackboard) => boolean;

  /**
   * @param name      - Stable identifier for this condition.
   * @param predicate - Pure boolean check evaluated each tick.
   */
  constructor(name: string, predicate: (ctx: Blackboard) => boolean) {
    this.name = name;
    this.predicate = predicate;
  }

  tick(context: Blackboard): BehaviorStatus {
    return this.predicate(context) ? 'success' : 'failure';
  }
}

// ─────────────────────────────────────────────
// Composite Nodes
// ─────────────────────────────────────────────

/**
 * Composite node that runs children in order.
 * - Returns 'failure' immediately on the first child that fails.
 * - Returns 'running' if any child returns 'running' (after all prior children succeeded).
 * - Returns 'success' only when all children succeed.
 */
export class Sequence implements BehaviorNode {
  readonly name: string;
  private readonly children: BehaviorNode[];

  /**
   * @param name     - Stable identifier.
   * @param children - Ordered list of child nodes to evaluate left to right.
   */
  constructor(name: string, children: BehaviorNode[]) {
    this.name = name;
    this.children = children;
  }

  tick(context: Blackboard): BehaviorStatus {
    for (const child of this.children) {
      const status = child.tick(context);
      if (status === 'failure') return 'failure';
      if (status === 'running') return 'running';
    }
    return 'success';
  }
}

/**
 * Composite node that runs children in order until one succeeds.
 * - Returns 'success' immediately on the first child that succeeds.
 * - Returns 'running' if a child returns 'running' (after all prior children failed).
 * - Returns 'failure' only when all children fail.
 */
export class Selector implements BehaviorNode {
  readonly name: string;
  private readonly children: BehaviorNode[];

  /**
   * @param name     - Stable identifier.
   * @param children - Ordered list of child nodes evaluated left to right.
   */
  constructor(name: string, children: BehaviorNode[]) {
    this.name = name;
    this.children = children;
  }

  tick(context: Blackboard): BehaviorStatus {
    for (const child of this.children) {
      const status = child.tick(context);
      if (status === 'success') return 'success';
      if (status === 'running') return 'running';
    }
    return 'failure';
  }
}

/**
 * Composite node that ticks all children every tick.
 * - Returns 'success' when at least `requiredSuccesses` children succeed.
 * - Returns 'failure' when enough children fail that the success threshold
 *   can no longer be reached.
 * - Returns 'running' otherwise.
 *
 * Defaults to requiring ALL children to succeed when `requiredSuccesses` is omitted.
 */
export class Parallel implements BehaviorNode {
  readonly name: string;
  private readonly children: BehaviorNode[];
  private readonly requiredSuccesses: number;

  /**
   * @param name             - Stable identifier.
   * @param children         - All children are ticked every frame.
   * @param requiredSuccesses - How many must succeed; defaults to children.length.
   */
  constructor(name: string, children: BehaviorNode[], requiredSuccesses?: number) {
    this.name = name;
    this.children = children;
    this.requiredSuccesses = requiredSuccesses ?? children.length;
  }

  tick(context: Blackboard): BehaviorStatus {
    let successes = 0;
    let failures = 0;
    const total = this.children.length;
    const maxAllowedFailures = total - this.requiredSuccesses;

    for (const child of this.children) {
      const status = child.tick(context);
      if (status === 'success') successes++;
      else if (status === 'failure') failures++;
    }

    if (successes >= this.requiredSuccesses) return 'success';
    if (failures > maxAllowedFailures) return 'failure';
    return 'running';
  }
}

// ─────────────────────────────────────────────
// Decorator Nodes
// ─────────────────────────────────────────────

/**
 * Decorator that wraps a single child and transforms its result status.
 * The transform function receives the child's raw status and returns a new one.
 */
export class Decorator implements BehaviorNode {
  readonly name: string;
  protected readonly child: BehaviorNode;
  private readonly transform: (status: BehaviorStatus) => BehaviorStatus;

  /**
   * @param name      - Stable identifier.
   * @param child     - The single wrapped child node.
   * @param transform - Function mapping child status to output status.
   */
  constructor(
    name: string,
    child: BehaviorNode,
    transform: (status: BehaviorStatus) => BehaviorStatus,
  ) {
    this.name = name;
    this.child = child;
    this.transform = transform;
  }

  tick(context: Blackboard): BehaviorStatus {
    return this.transform(this.child.tick(context));
  }
}

/**
 * Decorator that inverts success/failure while passing through 'running'.
 * Commonly used to negate a condition or action result.
 */
export class Inverter implements BehaviorNode {
  readonly name: string;
  private readonly child: BehaviorNode;

  /**
   * @param name  - Stable identifier (defaults to `NOT(child.name)`).
   * @param child - The node whose result will be inverted.
   */
  constructor(name: string, child: BehaviorNode) {
    this.name = name;
    this.child = child;
  }

  tick(context: Blackboard): BehaviorStatus {
    const status = this.child.tick(context);
    if (status === 'success') return 'failure';
    if (status === 'failure') return 'success';
    return 'running';
  }
}

/**
 * Decorator that runs its child a fixed number of times.
 * Returns 'running' while iterations remain, 'success' once complete.
 * Resets when count is exhausted.
 */
export class Repeater implements BehaviorNode {
  readonly name: string;
  private readonly child: BehaviorNode;
  private readonly times: number;
  private remaining: number;

  /**
   * @param name  - Stable identifier.
   * @param child - Node to repeat.
   * @param times - Total number of times to execute the child.
   */
  constructor(name: string, child: BehaviorNode, times: number) {
    this.name = name;
    this.child = child;
    this.times = times;
    this.remaining = times;
  }

  tick(context: Blackboard): BehaviorStatus {
    if (this.remaining <= 0) {
      this.remaining = this.times;
      return 'success';
    }
    this.child.tick(context);
    this.remaining--;
    if (this.remaining <= 0) {
      this.remaining = this.times;
      return 'success';
    }
    return 'running';
  }
}

// ─────────────────────────────────────────────
// BehaviorTree
// ─────────────────────────────────────────────

/**
 * Container for a behavior tree rooted at a single BehaviorNode.
 * Provides a stable tick/reset API and tracks the last execution status.
 */
export class BehaviorTree {
  private readonly root: BehaviorNode;
  private lastStatus: BehaviorStatus = 'failure';

  /** @param root - The root node of the tree. */
  constructor(root: BehaviorNode) {
    this.root = root;
  }

  /**
   * Advance the tree by one tick.
   * @param context - Shared blackboard for the current agent.
   * @returns The root node's status after this tick.
   */
  tick(context: Blackboard): BehaviorStatus {
    this.lastStatus = this.root.tick(context);
    return this.lastStatus;
  }

  /** Return the status from the most recent tick. */
  getLastStatus(): BehaviorStatus {
    return this.lastStatus;
  }

  /**
   * Reset any stateful decorators (e.g. Repeater counters) by clearing
   * the lastStatus. Stateless nodes need no reset.
   */
  reset(): void {
    this.lastStatus = 'failure';
  }
}

// ─────────────────────────────────────────────
// Finite State Machine
// ─────────────────────────────────────────────

/**
 * A single state in a Finite State Machine.
 * Lifecycle callbacks are optional; omit those not needed.
 */
export interface FSMState {
  /** Unique state name used as the FSM's internal key. */
  name: string;
  /** Called once when the FSM enters this state. */
  onEnter?(ctx: Blackboard): void;
  /** Called every update tick while this state is active. */
  onUpdate?(ctx: Blackboard): void;
  /** Called once just before the FSM leaves this state. */
  onExit?(ctx: Blackboard): void;
}

/**
 * A directed edge between two FSM states with a boolean guard condition.
 * Higher-priority transitions (lower number = higher priority) are checked first.
 */
export interface FSMTransition {
  /** Name of the state to transition FROM. */
  from: string;
  /** Name of the state to transition TO. */
  to: string;
  /** Guard predicate: transition fires when this returns true. */
  condition: (ctx: Blackboard) => boolean;
  /**
   * Evaluation priority. Lower values are tested first.
   * Ties are resolved by insertion order.
   * @default 0
   */
  priority?: number;
}

/**
 * Deterministic Finite State Machine with lifecycle callbacks and
 * priority-ordered transitions.
 */
export class FiniteStateMachine {
  private readonly states: Map<string, FSMState> = new Map();
  private readonly transitions: FSMTransition[] = [];
  private currentState: string = '';

  /**
   * Register a state with the FSM.
   * @throws {Error} if a state with the same name already exists.
   */
  addState(state: FSMState): void {
    if (this.states.has(state.name)) {
      throw new Error(`FSMState "${state.name}" is already registered`);
    }
    this.states.set(state.name, state);
  }

  /**
   * Register a transition edge.
   * @throws {Error} if either the from or to state has not been added yet.
   */
  addTransition(transition: FSMTransition): void {
    if (!this.states.has(transition.from)) {
      throw new Error(`FSMTransition: unknown from-state "${transition.from}"`);
    }
    if (!this.states.has(transition.to)) {
      throw new Error(`FSMTransition: unknown to-state "${transition.to}"`);
    }
    this.transitions.push(transition);
  }

  /**
   * Immediately switch to a named state, firing onExit on the current state
   * and onEnter on the new state.
   * @throws {Error} if the target state has not been registered.
   */
  setState(name: string, ctx: Blackboard): void {
    if (!this.states.has(name)) {
      throw new Error(`FSM cannot transition to unknown state "${name}"`);
    }
    const current = this.states.get(this.currentState);
    current?.onExit?.(ctx);
    this.currentState = name;
    const next = this.states.get(name);
    next?.onEnter?.(ctx);
  }

  /**
   * Evaluate all outgoing transitions from the current state (sorted by priority),
   * fire the first whose condition is true, then call onUpdate on the active state.
   */
  update(ctx: Blackboard): void {
    const outgoing = this.transitions
      .filter((t) => t.from === this.currentState)
      .sort((a, b) => (a.priority ?? 0) - (b.priority ?? 0));

    for (const transition of outgoing) {
      if (transition.condition(ctx)) {
        this.setState(transition.to, ctx);
        break;
      }
    }

    const state = this.states.get(this.currentState);
    state?.onUpdate?.(ctx);
  }

  /** Return the name of the currently active state. */
  getCurrentState(): string {
    return this.currentState;
  }
}

// ─────────────────────────────────────────────
// Utility AI
// ─────────────────────────────────────────────

/**
 * A scored, executable action for Utility-based AI decision making.
 * The score function should return values in a consistent range (e.g. 0–1 or 0–100).
 */
export interface UtilityAction {
  /** Stable identifier shown in debug output. */
  name: string;
  /**
   * Evaluate the desirability of this action given the current context.
   * Higher scores win.
   */
  score: (ctx: Blackboard) => number;
  /** Execute the action and return its completion status. */
  execute: (ctx: Blackboard) => BehaviorStatus;
}

/**
 * Utility-based AI system that selects the highest-scoring action each frame.
 * Ties are broken by insertion order (first registered wins).
 */
export class UtilityAI {
  private readonly actions: UtilityAction[];

  /** @param actions - Initial action set; more can be added via addAction. */
  constructor(actions: UtilityAction[]) {
    this.actions = [...actions];
  }

  /** Register an additional action at runtime. */
  addAction(action: UtilityAction): void {
    this.actions.push(action);
  }

  /**
   * Score all actions and return the highest-scoring one.
   * @returns The winning UtilityAction, or undefined if there are no actions.
   */
  evaluate(ctx: Blackboard): UtilityAction | undefined {
    if (this.actions.length === 0) return undefined;

    let best: UtilityAction | undefined;
    let bestScore = -Infinity;

    for (const action of this.actions) {
      const s = action.score(ctx);
      if (s > bestScore) {
        bestScore = s;
        best = action;
      }
    }

    return best;
  }

  /**
   * Evaluate and immediately execute the best action.
   * @returns The status from the winning action, or 'failure' if no actions exist.
   */
  execute(ctx: Blackboard): BehaviorStatus {
    const best = this.evaluate(ctx);
    if (best === undefined) return 'failure';
    return best.execute(ctx);
  }
}

// ─────────────────────────────────────────────
// GOAP (Goal-Oriented Action Planning)
// ─────────────────────────────────────────────

/**
 * A GOAP action: preconditions that must hold before execution,
 * effects that become true after execution, a numeric cost, and an executor.
 */
export interface GOAPAction {
  /** Stable identifier used in plan descriptions. */
  name: string;
  /** Relative cost of this action (lower = preferred). Must be > 0. */
  cost: number;
  /** World-state boolean flags that must be true before this action can run. */
  preconditions: Record<string, boolean>;
  /** World-state boolean flags that become true after this action executes. */
  effects: Record<string, boolean>;
  /** Execute the action and return its runtime status. */
  execute: (ctx: Blackboard) => BehaviorStatus;
}

/** Internal node used by the backward-search GOAP planner. */
interface GOAPNode {
  state: Record<string, boolean>;
  cost: number;
  plan: GOAPAction[];
  /** Remaining unsatisfied goal keys. */
  remaining: string[];
}

/**
 * Backward-chaining GOAP planner.
 * Searches from the goal state back to the current world state,
 * finding the cheapest sequence of actions that bridges the gap.
 */
export class GOAPPlanner {
  private readonly actions: GOAPAction[];

  /** @param actions - Available actions the planner may chain together. */
  constructor(actions: GOAPAction[]) {
    this.actions = [...actions];
  }

  /**
   * Find the lowest-cost action sequence that transforms `currentState`
   * into a state satisfying all keys in `goal`.
   *
   * Uses a greedy best-first search (backward from goal).
   *
   * @param currentState - Boolean world-state flags that are currently true.
   * @param goal         - Boolean world-state flags that must be true when done.
   * @returns Ordered sequence of actions to execute, or an empty array if no plan exists.
   */
  plan(
    currentState: Record<string, boolean>,
    goal: Record<string, boolean>,
  ): GOAPAction[] {
    // Collect all unsatisfied goal keys
    const unsatisfied = Object.keys(goal).filter(
      (key) => currentState[key] !== goal[key],
    );

    if (unsatisfied.length === 0) return [];

    // Priority queue via simple sorted array (adequate for typical GOAP sizes)
    const open: GOAPNode[] = [
      { state: { ...currentState }, cost: 0, plan: [], remaining: unsatisfied },
    ];

    let bestPlan: GOAPAction[] | null = null;
    let bestCost = Infinity;
    const maxIterations = 1024;
    let iterations = 0;

    while (open.length > 0 && iterations < maxIterations) {
      iterations++;

      // Pop node with lowest cost
      open.sort((a, b) => a.cost - b.cost);
      const node = open.shift();
      if (node === undefined) break;

      // Prune if already worse than best known
      if (node.cost >= bestCost) continue;

      // Goal satisfied?
      if (node.remaining.length === 0) {
        bestPlan = node.plan;
        bestCost = node.cost;
        continue;
      }

      // Try each action that satisfies at least one remaining goal key
      for (const action of this.actions) {
        const satisfies = Object.keys(action.effects).some(
          (ek) => node.remaining.includes(ek) && action.effects[ek] === goal[ek],
        );
        if (!satisfies) continue;

        // Check preconditions against current node state
        const precondsMet = Object.keys(action.preconditions).every(
          (pk) => node.state[pk] === action.preconditions[pk],
        );
        if (!precondsMet) continue;

        // Apply effects to derive next state
        const nextState = { ...node.state, ...action.effects };

        // Recompute remaining unsatisfied goal keys
        const nextRemaining = Object.keys(goal).filter(
          (gk) => nextState[gk] !== goal[gk],
        );

        const nextCost = node.cost + action.cost;
        if (nextCost >= bestCost) continue;

        open.push({
          state: nextState,
          cost: nextCost,
          plan: [...node.plan, action],
          remaining: nextRemaining,
        });
      }
    }

    return bestPlan ?? [];
  }
}

// ─────────────────────────────────────────────
// A* Pathfinding
// ─────────────────────────────────────────────

/**
 * A single cell in a 2-D navigation grid.
 * Unwalkable cells are treated as solid obstacles.
 */
export interface GridNode {
  x: number;
  y: number;
  walkable: boolean;
  /** Optional traversal cost for this cell (default 1). */
  cost?: number;
}

/** Internal A* open-set entry. */
interface AStarEntry {
  x: number;
  y: number;
  g: number;
  f: number;
  parent: AStarEntry | null;
}

/**
 * A* pathfinder operating on a 2-D grid of GridNodes.
 * Uses Manhattan distance heuristic with 4-directional movement.
 */
export class AStarPathfinder {
  /**
   * Find the shortest path from `start` to `end` on the provided grid.
   * The grid is indexed as `grid[y][x]`.
   *
   * @param grid  - 2-D array of GridNodes (rows × columns).
   * @param start - Starting position {x, y}.
   * @param end   - Target position {x, y}.
   * @returns Array of {x, y} waypoints from start to end (inclusive), or [] if unreachable.
   */
  findPath(
    grid: GridNode[][],
    start: { x: number; y: number },
    end: { x: number; y: number },
  ): Array<{ x: number; y: number }> {
    const rows = grid.length;
    if (rows === 0) return [];
    const cols = grid[0]?.length ?? 0;
    if (cols === 0) return [];

    const heuristic = (ax: number, ay: number): number =>
      Math.abs(ax - end.x) + Math.abs(ay - end.y);

    const key = (x: number, y: number): string => `${x},${y}`;

    const open: AStarEntry[] = [];
    const closed = new Set<string>();
    const gScore = new Map<string, number>();

    const startEntry: AStarEntry = {
      x: start.x,
      y: start.y,
      g: 0,
      f: heuristic(start.x, start.y),
      parent: null,
    };
    open.push(startEntry);
    gScore.set(key(start.x, start.y), 0);

    const directions: Array<{ dx: number; dy: number }> = [
      { dx: 0, dy: -1 },
      { dx: 0, dy: 1 },
      { dx: -1, dy: 0 },
      { dx: 1, dy: 0 },
    ];

    while (open.length > 0) {
      // Pop entry with lowest f
      open.sort((a, b) => a.f - b.f);
      const current = open.shift();
      if (current === undefined) break;

      const ck = key(current.x, current.y);
      if (closed.has(ck)) continue;
      closed.add(ck);

      if (current.x === end.x && current.y === end.y) {
        // Reconstruct path
        const path: Array<{ x: number; y: number }> = [];
        let node: AStarEntry | null = current;
        while (node !== null) {
          path.unshift({ x: node.x, y: node.y });
          node = node.parent;
        }
        return path;
      }

      for (const dir of directions) {
        const nx = current.x + dir.dx;
        const ny = current.y + dir.dy;

        if (ny < 0 || ny >= rows || nx < 0 || nx >= cols) continue;

        const cell = grid[ny]?.[nx];
        if (cell === undefined || !cell.walkable) continue;

        const nk = key(nx, ny);
        if (closed.has(nk)) continue;

        const cellCost = cell.cost ?? 1;
        const tentativeG = current.g + cellCost;
        const knownG = gScore.get(nk) ?? Infinity;

        if (tentativeG < knownG) {
          gScore.set(nk, tentativeG);
          open.push({
            x: nx,
            y: ny,
            g: tentativeG,
            f: tentativeG + heuristic(nx, ny),
            parent: current,
          });
        }
      }
    }

    return [];
  }
}

// ─────────────────────────────────────────────
// Perception System
// ─────────────────────────────────────────────

/**
 * Simple range-based perception system for 2-D agents.
 * Checks Euclidean distance to determine visibility and proximity.
 */
export class PerceptionSystem {
  private readonly range: number;

  /**
   * @param range - Maximum perception radius in world units.
   */
  constructor(range: number) {
    this.range = range;
  }

  /**
   * Returns true if `target` is within the perception range of `observer`.
   * Uses Euclidean distance (no line-of-sight occlusion).
   */
  canSee(
    observer: { x: number; y: number },
    target: { x: number; y: number },
  ): boolean {
    const dx = target.x - observer.x;
    const dy = target.y - observer.y;
    return Math.sqrt(dx * dx + dy * dy) <= this.range;
  }

  /**
   * Filter an array of entities to those within perception range of `observer`.
   * @param observer - The observing agent position.
   * @param entities - All entities to test.
   * @returns Subset of entities within range.
   */
  getNearby<T extends { x: number; y: number; id: string }>(
    observer: { x: number; y: number },
    entities: T[],
  ): T[] {
    return entities.filter((e) => this.canSee(observer, e));
  }
}

// ─────────────────────────────────────────────
// BehaviorEngine — main entry point
// ─────────────────────────────────────────────

/** Behavioral archetype gene keys read from a UniversalSeed when building a tree. */
const ARCHETYPE_KEY = 'archetype';
const AGGRESSION_KEY = 'aggression';
const CAUTION_KEY = 'caution';
const ENERGY_KEY = 'energy';

/**
 * Top-level factory for all behavior subsystems.
 * Accepts an optional DeterministicRNG for reproducible procedural generation.
 */
export class BehaviorEngine {
  private readonly rng: DeterministicRNG;

  /**
   * @param rng - Optional seeded RNG. Defaults to seed "behavior-engine".
   */
  constructor(rng?: DeterministicRNG) {
    this.rng = rng ?? new DeterministicRNG('behavior-engine');
  }

  /** Wrap an existing root node in a BehaviorTree. */
  createTree(root: BehaviorNode): BehaviorTree {
    return new BehaviorTree(root);
  }

  /** Create a new empty FiniteStateMachine. */
  createFSM(): FiniteStateMachine {
    return new FiniteStateMachine();
  }

  /** Create a UtilityAI with the given initial action set. */
  createUtilityAI(actions: UtilityAction[]): UtilityAI {
    return new UtilityAI(actions);
  }

  /** Create a GOAPPlanner with the given action repertoire. */
  createPlanner(actions: GOAPAction[]): GOAPPlanner {
    return new GOAPPlanner(actions);
  }

  /** Create a new AStarPathfinder instance. */
  createPathfinder(): AStarPathfinder {
    return new AStarPathfinder();
  }

  /**
   * Auto-generate a behavior tree from a UniversalSeed's gene profile.
   *
   * Reads the following well-known gene keys from the seed:
   * - `archetype`  (CategoricalGene) — e.g. 'hero', 'trickster', 'destroyer'
   * - `aggression` (ScalarGene)      — 0–1 float controlling combat tendency
   * - `caution`    (ScalarGene)      — 0–1 float controlling flee threshold
   * - `energy`     (ScalarGene)      — 0–1 float controlling idle vs. active bias
   *
   * Missing genes fall back to safe defaults so any seed can produce a valid tree.
   *
   * @param seed - A UniversalSeed whose genes describe the entity's character.
   * @returns A BehaviorTree wired to a Blackboard-driven selector hierarchy.
   */
  fromSeed(seed: UniversalSeed): BehaviorTree {
    const rng = this.rng.fork(seed.$hash);

    // ── Read genes with defaults ──────────────────────────────────────────
    const archetypeGene = seed.genes[ARCHETYPE_KEY];
    const aggressionGene = seed.genes[AGGRESSION_KEY];
    const cautionGene = seed.genes[CAUTION_KEY];
    const energyGene = seed.genes[ENERGY_KEY];

    const archetype =
      archetypeGene?.type === 'categorical' ? archetypeGene.value : 'everyman';

    const aggression =
      aggressionGene?.type === 'scalar'
        ? Math.max(0, Math.min(1, aggressionGene.value))
        : rng.next();

    const caution =
      cautionGene?.type === 'scalar'
        ? Math.max(0, Math.min(1, cautionGene.value))
        : rng.next();

    const energy =
      energyGene?.type === 'scalar'
        ? Math.max(0, Math.min(1, energyGene.value))
        : rng.next();

    // ── Build leaf nodes ──────────────────────────────────────────────────

    /** True when health is below the caution threshold. */
    const isThreatened = new Condition(
      'IsThreatened',
      (ctx) => (ctx.get<number>('health') ?? 1) < caution,
    );

    /** True when an enemy is visible (blackboard key 'enemyVisible'). */
    const enemyVisible = new Condition(
      'EnemyVisible',
      (ctx) => ctx.get<boolean>('enemyVisible') ?? false,
    );

    /** True when target is within attack range. */
    const inAttackRange = new Condition(
      'InAttackRange',
      (ctx) => ctx.get<boolean>('inAttackRange') ?? false,
    );

    /** Flee: mark fleeing state. */
    const flee = new Action('Flee', (ctx) => {
      ctx.set('fleeing', true);
      ctx.set('attacking', false);
      return 'running';
    });

    /** Chase: move toward enemy. */
    const chase = new Action('Chase', (ctx) => {
      ctx.set('fleeing', false);
      ctx.set('chasing', true);
      return 'running';
    });

    /** Attack: strike enemy. */
    const attack = new Action('Attack', (ctx) => {
      ctx.set('attacking', true);
      ctx.set('chasing', false);
      return 'success';
    });

    /** Patrol: wander if energy is high. */
    const patrol = new Action('Patrol', (ctx) => {
      if (energy > 0.5) {
        ctx.set('patrolling', true);
        return 'running';
      }
      return 'failure';
    });

    /** Idle: rest when energy is low. */
    const idle = new Action('Idle', (ctx) => {
      ctx.set('patrolling', false);
      ctx.set('idle', true);
      return 'success';
    });

    // ── Archetype-specific utility bias ──────────────────────────────────
    // Aggressive archetypes prefer attack over flight; cautious ones prefer flight.
    const prefersAggression = aggression > 0.5 ||
      archetype === 'destroyer' ||
      archetype === 'hero' ||
      archetype === 'rebel';

    // ── Combat sub-tree ───────────────────────────────────────────────────
    // If aggression is dominant: try to attack first, flee if threatened.
    // If caution is dominant: flee first, attack only if cornered.
    const combatTree: BehaviorNode = prefersAggression
      ? new Selector('CombatAggressive', [
          new Sequence('AttackSequence', [inAttackRange, attack]),
          chase,
          new Sequence('FleeWhenDesperate', [isThreatened, flee]),
        ])
      : new Selector('CombatCautious', [
          new Sequence('FleeIfThreatened', [isThreatened, flee]),
          new Sequence('AttackIfPossible', [inAttackRange, attack]),
          chase,
        ]);

    // ── Passive sub-tree ─────────────────────────────────────────────────
    const passiveTree = new Selector('Passive', [patrol, idle]);

    // ── Root selector ─────────────────────────────────────────────────────
    const root = new Selector(`Root:${seed.$name}`, [
      new Sequence('CombatBranch', [enemyVisible, combatTree]),
      passiveTree,
    ]);

    return new BehaviorTree(root);
  }
}

// ─────────────────────────────────────────────
// Named Exports
// ─────────────────────────────────────────────

export type {
  // re-export the imported types so consumers can import everything from this package
};
