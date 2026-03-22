/**
 * @paradigm/os — Process management and master control (Layer 6: Infrastructure).
 *
 * Provides an operating-system abstraction for GSPL worlds: process lifecycle,
 * priority scheduling, memory budgeting, inter-process communication, world
 * dependency graphs, a master tick loop, and unified system health monitoring.
 *
 * Zero external dependencies beyond @paradigm/types, @paradigm/rng, @paradigm/events.
 *
 * @packageDocumentation
 */

import type { GeneMap } from '@paradigm/types';
import { DeterministicRNG, computeQuickHash } from '@paradigm/rng';
import { EventBus } from '@paradigm/events';

// ─────────────────────────────────────────────
// Process Types
// ─────────────────────────────────────────────

/** Lifecycle status of a managed process. */
export type ProcessStatus = 'idle' | 'running' | 'paused' | 'completed' | 'failed';

/** A single tracked process within the OS. */
export interface Process {
  readonly id: string;
  readonly name: string;
  readonly type: string;
  status: ProcessStatus;
  readonly startTime: number;
  endTime?: number;
  /** Progress from 0 to 1. */
  progress: number;
  metadata: Record<string, unknown>;
}

// ─────────────────────────────────────────────
// ProcessTable — Track running processes
// ─────────────────────────────────────────────

/**
 * Registry of all managed processes. Supports spawn, kill, pause/resume,
 * progress tracking, and filtered queries by status or type.
 */
export class ProcessTable {
  private readonly entries: Map<string, Process> = new Map();
  private nextId = 0;
  private readonly rng: DeterministicRNG;

  constructor(rng?: DeterministicRNG) {
    this.rng = rng ?? new DeterministicRNG('process-table');
  }

  /** Spawn a new process with status 'running'. Returns the created entry. */
  spawn(name: string, type: string, metadata?: Record<string, unknown>): Process {
    const id = `proc-${this.nextId++}-${computeQuickHash(name + this.rng.next())}`;
    const entry: Process = {
      id,
      name,
      type,
      status: 'running',
      startTime: Date.now(),
      progress: 0,
      metadata: metadata ?? {},
    };
    this.entries.set(id, entry);
    return entry;
  }

  /** Kill a process (sets status to 'failed'). Returns false if not found. */
  kill(id: string): boolean {
    const entry = this.entries.get(id);
    if (entry === undefined) return false;
    entry.status = 'failed';
    entry.endTime = Date.now();
    return true;
  }

  /** Pause a running process. Returns false if not found or not running. */
  pause(id: string): boolean {
    const entry = this.entries.get(id);
    if (entry === undefined || entry.status !== 'running') return false;
    entry.status = 'paused';
    return true;
  }

  /** Resume a paused process. Returns false if not found or not paused. */
  resume(id: string): boolean {
    const entry = this.entries.get(id);
    if (entry === undefined || entry.status !== 'paused') return false;
    entry.status = 'running';
    return true;
  }

  /** Mark a process as 'completed'. Returns false if not found. */
  complete(id: string): boolean {
    const entry = this.entries.get(id);
    if (entry === undefined) return false;
    entry.status = 'completed';
    entry.endTime = Date.now();
    entry.progress = 1;
    return true;
  }

  /** Mark a process as 'failed' with a reason. Returns false if not found. */
  fail(id: string, reason: string): boolean {
    const entry = this.entries.get(id);
    if (entry === undefined) return false;
    entry.status = 'failed';
    entry.endTime = Date.now();
    entry.metadata['failReason'] = reason;
    return true;
  }

  /** Update progress (clamped to 0-1). Returns false if process not found. */
  updateProgress(id: string, progress: number): boolean {
    const entry = this.entries.get(id);
    if (entry === undefined) return false;
    entry.progress = Math.max(0, Math.min(1, progress));
    return true;
  }

  /** Get a process by id. */
  get(id: string): Process | undefined {
    return this.entries.get(id);
  }

  /** Get processes filtered by type. */
  getByType(type: string): Process[] {
    return this.getAll().filter((e) => e.type === type);
  }

  /** Get all active processes (running + paused). */
  getActive(): Process[] {
    return this.getAll().filter((e) => e.status === 'running' || e.status === 'paused');
  }

  /** Get all tracked processes. */
  getAll(): Process[] {
    return Array.from(this.entries.values());
  }

  /** Number of processes currently tracked. */
  get size(): number {
    return this.entries.size;
  }
}

// ─────────────────────────────────────────────
// Scheduler — Priority-based task scheduling
// ─────────────────────────────────────────────

/** A schedulable task entry. Higher priority number = higher priority. */
export interface TaskEntry {
  readonly id: string;
  readonly name: string;
  readonly priority: number;
  readonly callback: () => void | Promise<void>;
  readonly scheduledAt: number;
}

/**
 * Priority-based task scheduler. Tasks are queued and executed in priority
 * order (highest numeric priority first) when `runNext()` or `runAll()` is called.
 */
export class Scheduler {
  private pending: TaskEntry[] = [];
  private nextId = 0;

  /** Schedule a task for later execution. Returns a task ID. */
  schedule(name: string, priority: number, callback: () => void | Promise<void>): string {
    const id = `task-${this.nextId++}`;
    const entry: TaskEntry = {
      id,
      name,
      priority,
      callback,
      scheduledAt: Date.now(),
    };
    this.pending.push(entry);
    return id;
  }

  /** Cancel a pending task. Returns false if not found. */
  cancel(taskId: string): boolean {
    const idx = this.pending.findIndex((t) => t.id === taskId);
    if (idx < 0) return false;
    this.pending.splice(idx, 1);
    return true;
  }

  /**
   * Execute the highest-priority pending task.
   * Removes it from the pending queue.
   */
  async runNext(): Promise<void> {
    if (this.pending.length === 0) return;
    this.sortByPriority();
    const task = this.pending.shift();
    if (task === undefined) return;
    await task.callback();
  }

  /**
   * Execute all pending tasks in descending priority order.
   * Clears the pending queue. Tasks are run sequentially.
   */
  async runAll(): Promise<void> {
    this.sortByPriority();
    const tasks = this.pending.splice(0, this.pending.length);
    for (const task of tasks) {
      await task.callback();
    }
  }

  /** Get all pending tasks (not yet executed). */
  getPending(): TaskEntry[] {
    return [...this.pending];
  }

  /** Number of pending tasks. */
  get pendingCount(): number {
    return this.pending.length;
  }

  /** Sort pending tasks by descending priority (highest first). */
  private sortByPriority(): void {
    this.pending.sort((a, b) => b.priority - a.priority);
  }
}

// ─────────────────────────────────────────────
// MemoryManager — Resource tracking
// ─────────────────────────────────────────────

/** Default memory budget: 512 MB (536870912 bytes). */
const DEFAULT_MEMORY_BUDGET = 536870912;

/**
 * Tracks memory allocation per process against a configurable budget.
 * Does not allocate real memory — acts as an accounting ledger so that
 * higher-level systems can respect resource limits.
 */
export class MemoryManager {
  private allocations: Map<string, number> = new Map();
  private budget: number;

  constructor(maxBytes: number = DEFAULT_MEMORY_BUDGET) {
    this.budget = maxBytes;
  }

  /**
   * Allocate bytes for a process. Returns false if allocation would
   * exceed the budget. Allocations are additive for the same processId.
   */
  allocate(processId: string, bytes: number): boolean {
    if (bytes < 0) return false;
    const current = this.allocations.get(processId) ?? 0;
    const totalAfter = this.getTotalUsage() + bytes;
    if (totalAfter > this.budget) return false;
    this.allocations.set(processId, current + bytes);
    return true;
  }

  /** Release all memory allocated to a process. Returns bytes freed. */
  release(processId: string): number {
    const freed = this.allocations.get(processId) ?? 0;
    this.allocations.delete(processId);
    return freed;
  }

  /** Get bytes currently allocated to a process. */
  getUsage(processId: string): number {
    return this.allocations.get(processId) ?? 0;
  }

  /** Get total bytes allocated across all processes. */
  getTotalUsage(): number {
    let total = 0;
    for (const bytes of this.allocations.values()) {
      total += bytes;
    }
    return total;
  }

  /** Get the current memory budget. */
  getBudget(): number {
    return this.budget;
  }

  /** Set the memory budget (max bytes). */
  setBudget(maxBytes: number): void {
    this.budget = maxBytes;
  }

  /** Get utilization ratio (0-1). Returns 0 if budget is 0. */
  getUtilization(): number {
    if (this.budget <= 0) return 0;
    return this.getTotalUsage() / this.budget;
  }
}

// ─────────────────────────────────────────────
// IPCBus — Inter-process typed message passing
// ─────────────────────────────────────────────

/** Handler invoked when a process receives a message on a channel. */
export type IPCHandler = (payload: unknown, fromId: string) => void;

/** Internal subscription record. */
interface IPCSubscription {
  readonly processId: string;
  readonly channel: string;
  readonly handler: IPCHandler;
}

/**
 * Inter-process communication bus. Processes send typed messages on named
 * channels; subscribers receive payloads along with the sender's ID.
 */
export class IPCBus {
  private subscriptions: IPCSubscription[] = [];
  private messageCounts: Map<string, number> = new Map();

  /** Send a message from one process to another on a specific channel. */
  send(fromId: string, toId: string, channel: string, payload: unknown): void {
    const count = this.messageCounts.get(toId) ?? 0;
    this.messageCounts.set(toId, count + 1);

    for (const sub of this.subscriptions) {
      if (sub.processId === toId && sub.channel === channel) {
        try {
          sub.handler(payload, fromId);
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : String(err);
          console.error(`[IPCBus] Handler error on channel "${channel}": ${msg}`);
        }
      }
    }
  }

  /** Subscribe a process to a channel. Returns an unsubscribe function. */
  subscribe(processId: string, channel: string, handler: IPCHandler): () => void {
    const sub: IPCSubscription = { processId, channel, handler };
    this.subscriptions.push(sub);

    return () => {
      const idx = this.subscriptions.indexOf(sub);
      if (idx >= 0) {
        this.subscriptions.splice(idx, 1);
      }
    };
  }

  /** Broadcast a message on a channel to all subscribers (regardless of processId). */
  broadcast(fromId: string, channel: string, payload: unknown): void {
    for (const sub of this.subscriptions) {
      if (sub.channel === channel) {
        const count = this.messageCounts.get(sub.processId) ?? 0;
        this.messageCounts.set(sub.processId, count + 1);

        try {
          sub.handler(payload, fromId);
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : String(err);
          console.error(`[IPCBus] Broadcast handler error on channel "${channel}": ${msg}`);
        }
      }
    }
  }

  /** Get total messages received by a process. */
  getMessageCount(processId: string): number {
    return this.messageCounts.get(processId) ?? 0;
  }
}

// ─────────────────────────────────────────────
// WorldGraph — Dependency graph of active worlds
// ─────────────────────────────────────────────

/** Internal node in the world graph. */
interface WorldNode {
  readonly id: string;
  readonly name: string;
  readonly dependencies: Set<string>;
}

/**
 * Directed acyclic graph of active worlds and their dependencies.
 * Supports topological sorting for correct processing order and cycle detection.
 */
export class WorldGraph {
  private nodes: Map<string, WorldNode> = new Map();

  /** Add a world to the graph. */
  addWorld(id: string, name: string): void {
    if (this.nodes.has(id)) return;
    this.nodes.set(id, { id, name, dependencies: new Set() });
  }

  /** Remove a world and all edges referencing it. Returns false if not found. */
  removeWorld(id: string): boolean {
    if (!this.nodes.has(id)) return false;
    this.nodes.delete(id);

    // Remove edges pointing to the deleted world
    for (const node of this.nodes.values()) {
      node.dependencies.delete(id);
    }
    return true;
  }

  /** Add a dependency: `fromWorld` depends on `toWorld`. */
  addDependency(fromWorld: string, toWorld: string): void {
    const from = this.nodes.get(fromWorld);
    if (from === undefined) {
      throw new Error(`WorldGraph.addDependency: source world "${fromWorld}" not found`);
    }
    if (!this.nodes.has(toWorld)) {
      throw new Error(`WorldGraph.addDependency: target world "${toWorld}" not found`);
    }
    from.dependencies.add(toWorld);
  }

  /** Get the IDs of worlds that `worldId` depends on. */
  getDependencies(worldId: string): string[] {
    const node = this.nodes.get(worldId);
    if (node === undefined) return [];
    return Array.from(node.dependencies);
  }

  /** Get the IDs of worlds that depend on `worldId`. */
  getDependents(worldId: string): string[] {
    const result: string[] = [];
    for (const node of this.nodes.values()) {
      if (node.dependencies.has(worldId)) {
        result.push(node.id);
      }
    }
    return result;
  }

  /**
   * Topological sort (Kahn's algorithm). Returns world IDs in processing
   * order: dependencies come before dependents. Returns empty array if a
   * cycle is detected.
   */
  getTopologicalOrder(): string[] {
    // Build in-degree map.
    // If A depends on B, then B must come before A.
    // Edge direction for topo sort: B -> A, so in-degree of A += 1.
    const inDegree = new Map<string, number>();

    // Initialize all nodes to zero in-degree
    for (const node of this.nodes.values()) {
      inDegree.set(node.id, 0);
    }

    // For each dependency edge, increment in-degree of the dependent node
    for (const node of this.nodes.values()) {
      for (const _dep of node.dependencies) {
        const current = inDegree.get(node.id) ?? 0;
        inDegree.set(node.id, current + 1);
      }
    }

    // Start with nodes that have zero in-degree (no dependencies)
    const queue: string[] = [];
    for (const [id, deg] of inDegree) {
      if (deg === 0) {
        queue.push(id);
      }
    }

    const sorted: string[] = [];
    while (queue.length > 0) {
      const current = queue.shift()!;
      sorted.push(current);

      // Find nodes that depend on `current` and reduce their in-degree
      for (const node of this.nodes.values()) {
        if (node.dependencies.has(current)) {
          const deg = (inDegree.get(node.id) ?? 1) - 1;
          inDegree.set(node.id, deg);
          if (deg === 0) {
            queue.push(node.id);
          }
        }
      }
    }

    // If not all nodes were visited, a cycle exists
    if (sorted.length !== this.nodes.size) {
      return [];
    }

    return sorted;
  }

  /** Detect whether the graph contains a cycle. */
  hasCycle(): boolean {
    if (this.nodes.size === 0) return false;
    const order = this.getTopologicalOrder();
    return order.length !== this.nodes.size;
  }

  /** Get all worlds with their dependency lists. */
  getAll(): Array<{ id: string; name: string; dependencies: string[] }> {
    return Array.from(this.nodes.values()).map((n) => ({
      id: n.id,
      name: n.name,
      dependencies: Array.from(n.dependencies),
    }));
  }

  /** Number of worlds in the graph. */
  get size(): number {
    return this.nodes.size;
  }
}

// ─────────────────────────────────────────────
// TickLoop — Master simulation tick coordinator
// ─────────────────────────────────────────────

/** A registered system in the tick loop. */
interface TickSystem {
  readonly name: string;
  readonly updateFn: (dt: number) => void;
  readonly priority: number;
}

/**
 * Master simulation loop with fixed timestep. Systems are registered with
 * a priority and update function. Each `tick()` call advances all systems
 * by one frame at the target FPS rate. Higher priority systems run first.
 */
export class TickLoop {
  private systems: TickSystem[] = [];
  private tickCount = 0;
  private readonly targetFPS: number;
  private readonly fixedDt: number;
  private dtSamples: number[] = [];
  private readonly maxDtSamples = 120;

  constructor(targetFPS: number = 60) {
    this.targetFPS = Math.max(1, targetFPS);
    this.fixedDt = 1 / this.targetFPS;
  }

  /**
   * Add a named system with an update function and optional priority.
   * Higher priority number = runs first. Default priority is 0.
   * Re-registering the same name replaces the existing system.
   */
  addSystem(name: string, updateFn: (dt: number) => void, priority: number = 0): void {
    this.removeSystem(name);
    this.systems.push({ name, updateFn, priority });
    this.systems.sort((a, b) => b.priority - a.priority);
  }

  /** Remove a system by name. Returns false if not found. */
  removeSystem(name: string): boolean {
    const idx = this.systems.findIndex((s) => s.name === name);
    if (idx < 0) return false;
    this.systems.splice(idx, 1);
    return true;
  }

  /**
   * Advance all systems by one frame using the fixed timestep (1/targetFPS).
   * Systems execute in descending priority order.
   */
  tick(): void {
    const startTime =
      typeof performance !== 'undefined' && typeof performance.now === 'function'
        ? performance.now()
        : Date.now();

    this.tickCount++;

    for (const system of this.systems) {
      try {
        system.updateFn(this.fixedDt);
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error(
          `[TickLoop] System "${system.name}" error on tick ${this.tickCount}: ${msg}`,
        );
      }
    }

    const endTime =
      typeof performance !== 'undefined' && typeof performance.now === 'function'
        ? performance.now()
        : Date.now();
    const elapsed = endTime - startTime;
    this.dtSamples.push(elapsed);
    if (this.dtSamples.length > this.maxDtSamples) {
      this.dtSamples.shift();
    }
  }

  /** Get the total number of ticks elapsed. */
  getTickCount(): number {
    return this.tickCount;
  }

  /** Get the average tick duration in milliseconds over recent samples. */
  getAverageDt(): number {
    if (this.dtSamples.length === 0) return 0;
    let sum = 0;
    for (const s of this.dtSamples) {
      sum += s;
    }
    return sum / this.dtSamples.length;
  }

  /** Reset tick count, systems, and timing data. */
  reset(): void {
    this.tickCount = 0;
    this.systems = [];
    this.dtSamples = [];
  }

  /** Get the fixed timestep in seconds (1 / targetFPS). */
  getFixedDt(): number {
    return this.fixedDt;
  }

  /** Get the target frames per second. */
  getTargetFPS(): number {
    return this.targetFPS;
  }

  /** Get names of all registered systems in priority order. */
  getSystemNames(): string[] {
    return this.systems.map((s) => s.name);
  }
}

// ─────────────────────────────────────────────
// MasterControl — System health and metrics
// ─────────────────────────────────────────────

/** Metrics snapshot for a single subsystem. */
export interface SubsystemMetrics {
  readonly name: string;
  readonly cpu: number;
  readonly memory: number;
  readonly latency: number;
}

/** Aggregated health report for the entire OS. */
export interface HealthReport {
  readonly healthy: boolean;
  readonly subsystems: number;
  readonly totalMemory: number;
  readonly uptime: number;
}

/**
 * Aggregates system-wide health and performance information.
 * Subsystems register themselves and periodically report metrics.
 */
export class MasterControl {
  private readonly startTime: number;
  private readonly metricsMap: Map<string, SubsystemMetrics> = new Map();

  constructor() {
    this.startTime = Date.now();
  }

  /** Register a subsystem by name. Initialises its metrics to zero. */
  registerSubsystem(name: string): void {
    if (!this.metricsMap.has(name)) {
      this.metricsMap.set(name, { name, cpu: 0, memory: 0, latency: 0 });
    }
  }

  /** Report updated metrics for a subsystem. Registers it if not already known. */
  reportMetrics(name: string, cpu: number, memory: number, latency: number): void {
    this.metricsMap.set(name, { name, cpu, memory, latency });
  }

  /** Get metrics for all registered subsystems. */
  getSubsystemMetrics(): SubsystemMetrics[] {
    return Array.from(this.metricsMap.values());
  }

  /**
   * Get an aggregated health report.
   * The system is considered healthy if all subsystem CPU values are below 0.95
   * and all latencies are below 1000ms.
   */
  getHealthReport(): HealthReport {
    const metrics = this.getSubsystemMetrics();
    let totalMemory = 0;
    let healthy = true;

    for (const m of metrics) {
      totalMemory += m.memory;
      if (m.cpu >= 0.95 || m.latency >= 1000) {
        healthy = false;
      }
    }

    return {
      healthy,
      subsystems: metrics.length,
      totalMemory,
      uptime: Date.now() - this.startTime,
    };
  }
}

// ─────────────────────────────────────────────
// OSEngine — Top-level entry point
// ─────────────────────────────────────────────

/** Summary of all OS subsystem states. */
export interface SystemInfo {
  readonly processCount: number;
  readonly activeProcessCount: number;
  readonly pendingTasks: number;
  readonly memoryUsed: number;
  readonly memoryBudget: number;
  readonly memoryUtilization: number;
  readonly worldCount: number;
  readonly tickCount: number;
  readonly averageTickDt: number;
  readonly subsystemCount: number;
  readonly healthy: boolean;
  readonly uptime: number;
}

/**
 * Top-level operating system engine that wires together all subsystems.
 * Provides a unified API surface for process management, scheduling,
 * memory tracking, IPC, world graphs, tick coordination, and health monitoring.
 */
export class OSEngine {
  readonly processes: ProcessTable;
  readonly scheduler: Scheduler;
  readonly memory: MemoryManager;
  readonly ipc: IPCBus;
  readonly worlds: WorldGraph;
  readonly tickLoop: TickLoop;
  readonly control: MasterControl;

  private readonly rng: DeterministicRNG;
  private readonly events: EventBus;

  constructor(rng?: DeterministicRNG, events?: EventBus) {
    this.rng = rng ?? new DeterministicRNG('gspl-os');
    this.events = events ?? new EventBus();
    this.processes = new ProcessTable(this.rng.fork('processes'));
    this.scheduler = new Scheduler();
    this.memory = new MemoryManager();
    this.ipc = new IPCBus();
    this.worlds = new WorldGraph();
    this.tickLoop = new TickLoop();
    this.control = new MasterControl();
  }

  /** Get a summary of all subsystem states. */
  getSystemInfo(): SystemInfo {
    const health = this.control.getHealthReport();
    return {
      processCount: this.processes.getAll().length,
      activeProcessCount: this.processes.getActive().length,
      pendingTasks: this.scheduler.pendingCount,
      memoryUsed: this.memory.getTotalUsage(),
      memoryBudget: this.memory.getBudget(),
      memoryUtilization: this.memory.getUtilization(),
      worldCount: this.worlds.size,
      tickCount: this.tickLoop.getTickCount(),
      averageTickDt: this.tickLoop.getAverageDt(),
      subsystemCount: health.subsystems,
      healthy: health.healthy,
      uptime: health.uptime,
    };
  }

  /** Graceful shutdown: resets the tick loop and kills all active processes. */
  shutdown(): void {
    this.tickLoop.reset();

    const active = this.processes.getActive();
    for (const proc of active) {
      this.processes.kill(proc.id);
    }
  }
}
