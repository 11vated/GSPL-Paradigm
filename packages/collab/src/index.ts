/**
 * @paradigm/collab — Real-time collaborative editing system.
 *
 * Provides vector clocks for causal ordering, operation logs for history,
 * presence tracking, session management, and collaborative evolution runs.
 * Layer 6: Infrastructure.
 *
 * @packageDocumentation
 */

import type { UniversalSeed } from '@paradigm/types';
import { DeterministicRNG, computeQuickHash } from '@paradigm/rng';
import { EventBus } from '@paradigm/events';

// ─────────────────────────────────────────────
// VectorClock — Causal ordering of concurrent operations
// ─────────────────────────────────────────────

/**
 * Vector clock for establishing causal ordering between
 * distributed operations in a collaborative session.
 *
 * Each node maintains a counter; merging takes the max of
 * all counters to track the "latest known state" from every peer.
 */
export class VectorClock {
  private readonly nodeId: string;
  private readonly counters: Map<string, number>;

  constructor(nodeId: string) {
    this.nodeId = nodeId;
    this.counters = new Map<string, number>();
    this.counters.set(nodeId, 0);
  }

  /** Increment this node's counter by 1. */
  increment(): void {
    const current = this.counters.get(this.nodeId) ?? 0;
    this.counters.set(this.nodeId, current + 1);
  }

  /** Merge with another vector clock by taking the max of each counter. */
  merge(other: VectorClock): void {
    for (const [node, count] of other.counters) {
      const current = this.counters.get(node) ?? 0;
      this.counters.set(node, Math.max(current, count));
    }
  }

  /**
   * Returns true if this clock causally happens-before the other clock.
   * A happens-before B iff all counters in A <= B and at least one is strictly less.
   */
  happensBefore(other: VectorClock): boolean {
    const allNodes = new Set<string>([
      ...this.counters.keys(),
      ...other.counters.keys(),
    ]);

    let atLeastOneLess = false;

    for (const node of allNodes) {
      const thisVal = this.counters.get(node) ?? 0;
      const otherVal = other.counters.get(node) ?? 0;
      if (thisVal > otherVal) {
        return false;
      }
      if (thisVal < otherVal) {
        atLeastOneLess = true;
      }
    }

    return atLeastOneLess;
  }

  /**
   * Returns true if this clock is concurrent with the other clock.
   * Two clocks are concurrent if neither happens-before the other.
   */
  isConcurrent(other: VectorClock): boolean {
    return !this.happensBefore(other) && !other.happensBefore(this) && !this.equals(other);
  }

  /** Serialize to a plain record for transport/storage. */
  toJSON(): Record<string, number> {
    const result: Record<string, number> = {};
    for (const [node, count] of this.counters) {
      result[node] = count;
    }
    return result;
  }

  /** Reconstruct a VectorClock from serialized data. */
  static fromJSON(nodeId: string, data: Record<string, number>): VectorClock {
    const clock = new VectorClock(nodeId);
    for (const [node, count] of Object.entries(data)) {
      clock.counters.set(node, count);
    }
    return clock;
  }

  /** Get the counter value for a specific node. */
  getCounter(node: string): number {
    return this.counters.get(node) ?? 0;
  }

  /** Get this clock's node ID. */
  getNodeId(): string {
    return this.nodeId;
  }

  /** Check equality: all counters match. */
  private equals(other: VectorClock): boolean {
    const allNodes = new Set<string>([
      ...this.counters.keys(),
      ...other.counters.keys(),
    ]);
    for (const node of allNodes) {
      if ((this.counters.get(node) ?? 0) !== (other.counters.get(node) ?? 0)) {
        return false;
      }
    }
    return true;
  }
}

// ─────────────────────────────────────────────
// Operation — Single collaborative edit
// ─────────────────────────────────────────────

/** A single collaborative operation recorded in the operation log. */
export interface Operation {
  readonly id: string;
  readonly userId: string;
  readonly type: 'create' | 'update' | 'delete';
  readonly targetId: string;
  readonly payload: unknown;
  readonly clock: Record<string, number>;
  readonly timestamp: number;
}

// ─────────────────────────────────────────────
// OperationLog — Append-only operation history
// ─────────────────────────────────────────────

/**
 * Append-only log of all collaborative operations.
 * Supports querying by timestamp, user, and target for
 * selective replay and conflict resolution.
 */
export class OperationLog {
  private readonly ops: Operation[] = [];

  /** Append an operation to the log. */
  append(op: Operation): void {
    this.ops.push(op);
  }

  /** Get all operations in insertion order. */
  getAll(): Operation[] {
    return [...this.ops];
  }

  /** Get operations with timestamp >= the given value. */
  getSince(timestamp: number): Operation[] {
    return this.ops.filter((op) => op.timestamp >= timestamp);
  }

  /** Get all operations by a specific user. */
  getByUser(userId: string): Operation[] {
    return this.ops.filter((op) => op.userId === userId);
  }

  /** Get all operations targeting a specific entity. */
  getByTarget(targetId: string): Operation[] {
    return this.ops.filter((op) => op.targetId === targetId);
  }

  /** Total number of operations recorded. */
  count(): number {
    return this.ops.length;
  }

  /**
   * Replay operations within a time range [from, to].
   * If `to` is omitted, returns all operations from `from` onward.
   */
  replay(from: number, to?: number): Operation[] {
    return this.ops.filter((op) => {
      if (op.timestamp < from) return false;
      if (to !== undefined && op.timestamp > to) return false;
      return true;
    });
  }
}

// ─────────────────────────────────────────────
// PresenceSystem — Who's online and what they're doing
// ─────────────────────────────────────────────

/** Cursor position in 2D space. */
export interface CursorPosition {
  readonly x: number;
  readonly y: number;
}

/** Presence state for a single participant. */
export interface PresenceInfo {
  readonly userId: string;
  readonly displayName: string;
  readonly color: string;
  cursor?: CursorPosition;
  selection?: string | null;
  lastActivity: number;
}

/** Default color palette for auto-assignment when no color is provided. */
const PRESENCE_COLORS: readonly string[] = [
  '#e74c3c', '#3498db', '#2ecc71', '#f39c12',
  '#9b59b6', '#1abc9c', '#e67e22', '#34495e',
  '#16a085', '#c0392b', '#2980b9', '#27ae60',
] as const;

/**
 * Tracks which users are present in a collaborative session,
 * their cursor positions, and their current selections.
 */
export class PresenceSystem {
  private readonly presences: Map<string, PresenceInfo> = new Map();
  private colorIndex: number = 0;

  /** Add a user to the presence system. Auto-assigns color if not provided. */
  join(userId: string, displayName: string, color?: string): void {
    const assignedColor = color ?? this.nextColor();
    this.presences.set(userId, {
      userId,
      displayName,
      color: assignedColor,
      cursor: undefined,
      selection: null,
      lastActivity: Date.now(),
    });
  }

  /** Remove a user from the presence system. */
  leave(userId: string): void {
    this.presences.delete(userId);
  }

  /** Update a user's cursor position. */
  updateCursor(userId: string, position: CursorPosition): void {
    const presence = this.presences.get(userId);
    if (presence === undefined) return;
    const updated: PresenceInfo = {
      ...presence,
      cursor: { x: position.x, y: position.y },
      lastActivity: Date.now(),
    };
    this.presences.set(userId, updated);
  }

  /** Update a user's current seed selection. */
  updateSelection(userId: string, seedId: string | null): void {
    const presence = this.presences.get(userId);
    if (presence === undefined) return;
    const updated: PresenceInfo = {
      ...presence,
      selection: seedId,
      lastActivity: Date.now(),
    };
    this.presences.set(userId, updated);
  }

  /** Get presence info for a specific user. */
  getPresence(userId: string): PresenceInfo | undefined {
    return this.presences.get(userId);
  }

  /** Get all active presences. */
  getAll(): PresenceInfo[] {
    return Array.from(this.presences.values());
  }

  /** Get the number of active participants. */
  getActiveCount(): number {
    return this.presences.size;
  }

  /** Cycle through the color palette for auto-assignment. */
  private nextColor(): string {
    const color = PRESENCE_COLORS[this.colorIndex % PRESENCE_COLORS.length]!;
    this.colorIndex++;
    return color;
  }
}

// ─────────────────────────────────────────────
// SessionHub — Shared editing sessions
// ─────────────────────────────────────────────

/** A collaborative editing session with shared seeds. */
export interface SessionInfo {
  readonly id: string;
  readonly name: string;
  readonly hostId: string;
  readonly participants: string[];
  readonly seeds: Map<string, UniversalSeed>;
  readonly createdAt: number;
  active: boolean;
}

/**
 * Manages collaborative editing sessions.
 * Each session has a host, a set of participants, and shared seeds.
 * Only the host can close a session.
 */
export class SessionHub {
  private readonly sessions: Map<string, SessionInfo> = new Map();
  private readonly rng: DeterministicRNG;

  constructor(rng: DeterministicRNG) {
    this.rng = rng;
  }

  /** Create a new session. Returns the generated session ID. */
  create(name: string, hostId: string): string {
    const sessionId = computeQuickHash(`session:${name}:${hostId}:${Date.now()}:${this.rng.next()}`);
    const session: SessionInfo = {
      id: sessionId,
      name,
      hostId,
      participants: [hostId],
      seeds: new Map<string, UniversalSeed>(),
      createdAt: Date.now(),
      active: true,
    };
    this.sessions.set(sessionId, session);
    return sessionId;
  }

  /** Join an existing session. Returns false if session does not exist or is inactive. */
  join(sessionId: string, userId: string): boolean {
    const session = this.sessions.get(sessionId);
    if (session === undefined || !session.active) return false;
    if (!session.participants.includes(userId)) {
      session.participants.push(userId);
    }
    return true;
  }

  /** Leave a session. Returns false if session does not exist. */
  leave(sessionId: string, userId: string): boolean {
    const session = this.sessions.get(sessionId);
    if (session === undefined) return false;
    const idx = session.participants.indexOf(userId);
    if (idx === -1) return false;
    session.participants.splice(idx, 1);
    return true;
  }

  /** Get session info by ID. */
  getSession(sessionId: string): SessionInfo | undefined {
    return this.sessions.get(sessionId);
  }

  /** Add a seed to a session's shared workspace. Returns false if session is missing or inactive. */
  addSeed(sessionId: string, seed: UniversalSeed): boolean {
    const session = this.sessions.get(sessionId);
    if (session === undefined || !session.active) return false;
    session.seeds.set(seed.$hash, seed);
    return true;
  }

  /** Update an existing seed in a session. Returns false if session or seed is missing. */
  updateSeed(sessionId: string, seed: UniversalSeed): boolean {
    const session = this.sessions.get(sessionId);
    if (session === undefined || !session.active) return false;
    if (!session.seeds.has(seed.$hash)) return false;
    session.seeds.set(seed.$hash, seed);
    return true;
  }

  /** Remove a seed from a session by hash. Returns false if session or seed is missing. */
  removeSeed(sessionId: string, seedHash: string): boolean {
    const session = this.sessions.get(sessionId);
    if (session === undefined || !session.active) return false;
    return session.seeds.delete(seedHash);
  }

  /** List all active sessions. */
  listActive(): SessionInfo[] {
    return Array.from(this.sessions.values()).filter((s) => s.active);
  }

  /** Close a session. Only the host can close it. Returns false on failure. */
  close(sessionId: string, userId: string): boolean {
    const session = this.sessions.get(sessionId);
    if (session === undefined || !session.active) return false;
    if (session.hostId !== userId) return false;
    session.active = false;
    return true;
  }
}

// ─────────────────────────────────────────────
// CollaborativeEvolution — Multi-user evolution runs
// ─────────────────────────────────────────────

/** Configuration for a collaborative evolution run. */
export interface EvolutionRunConfig {
  readonly populationSize: number;
  readonly generations: number;
}

/** Status snapshot of a collaborative evolution run. */
export interface EvolutionRunStatus {
  readonly runId: string;
  readonly generation: number;
  readonly totalVotes: number;
  readonly participantCount: number;
}

/** Result of advancing to the next generation. */
export interface GenerationAdvanceResult {
  readonly generation: number;
  readonly survivingSeeds: string[];
}

/** Internal state for an active evolution run. */
interface EvolutionRunState {
  readonly runId: string;
  readonly sessionId: string;
  readonly config: EvolutionRunConfig;
  generation: number;
  /** seedHash -> list of userIds who voted for it */
  votes: Map<string, string[]>;
  participants: Set<string>;
  active: boolean;
}

/**
 * Manages collaborative evolution runs where multiple users
 * vote on which seeds survive each generation.
 * Top-voted seeds (up to populationSize) advance.
 */
export class CollaborativeEvolution {
  private readonly runs: Map<string, EvolutionRunState> = new Map();
  private readonly rng: DeterministicRNG;

  constructor(rng: DeterministicRNG) {
    this.rng = rng;
  }

  /** Start a new collaborative evolution run. Returns the run ID. */
  startRun(sessionId: string, config: EvolutionRunConfig): string {
    const runId = computeQuickHash(
      `run:${sessionId}:${config.populationSize}:${config.generations}:${this.rng.next()}`,
    );
    const run: EvolutionRunState = {
      runId,
      sessionId,
      config,
      generation: 0,
      votes: new Map<string, string[]>(),
      participants: new Set<string>(),
      active: true,
    };
    this.runs.set(runId, run);
    return runId;
  }

  /**
   * Cast a vote for a seed in a run.
   * Each user can vote for a seed only once per generation.
   * Returns false if the run does not exist, is inactive, or the user already voted for this seed.
   */
  vote(runId: string, userId: string, seedHash: string): boolean {
    const run = this.runs.get(runId);
    if (run === undefined || !run.active) return false;

    run.participants.add(userId);

    const existing = run.votes.get(seedHash);
    if (existing !== undefined) {
      if (existing.includes(userId)) return false;
      existing.push(userId);
    } else {
      run.votes.set(seedHash, [userId]);
    }
    return true;
  }

  /** Get all votes for a run as a map of seedHash to voter list. */
  getVotes(runId: string): Map<string, string[]> {
    const run = this.runs.get(runId);
    if (run === undefined) return new Map<string, string[]>();
    // Return a deep copy to prevent external mutation
    const copy = new Map<string, string[]>();
    for (const [hash, voters] of run.votes) {
      copy.set(hash, [...voters]);
    }
    return copy;
  }

  /**
   * Advance to the next generation.
   * Seeds are ranked by vote count; top seeds (up to populationSize) survive.
   * Votes are cleared for the next generation.
   */
  advanceGeneration(runId: string): GenerationAdvanceResult | undefined {
    const run = this.runs.get(runId);
    if (run === undefined || !run.active) return undefined;

    // Rank seeds by vote count (descending)
    const ranked = Array.from(run.votes.entries())
      .map(([hash, voters]) => ({ hash, voteCount: voters.length }))
      .sort((a, b) => b.voteCount - a.voteCount);

    const survivorCount = Math.min(ranked.length, run.config.populationSize);
    const survivingSeeds = ranked
      .slice(0, survivorCount)
      .map((entry) => entry.hash);

    run.generation++;
    run.votes = new Map<string, string[]>();

    // End run if we've reached the target generation count
    if (run.generation >= run.config.generations) {
      run.active = false;
    }

    return {
      generation: run.generation,
      survivingSeeds,
    };
  }

  /** Get the current status of an evolution run. */
  getRunStatus(runId: string): EvolutionRunStatus | undefined {
    const run = this.runs.get(runId);
    if (run === undefined) return undefined;

    let totalVotes = 0;
    for (const voters of run.votes.values()) {
      totalVotes += voters.length;
    }

    return {
      runId: run.runId,
      generation: run.generation,
      totalVotes,
      participantCount: run.participants.size,
    };
  }

  /** End an evolution run. Returns false if run does not exist or is already ended. */
  endRun(runId: string): boolean {
    const run = this.runs.get(runId);
    if (run === undefined || !run.active) return false;
    run.active = false;
    return true;
  }
}

// ─────────────────────────────────────────────
// CollabEngine — Top-level entry point
// ─────────────────────────────────────────────

/** Default node ID used when none is provided. */
const DEFAULT_NODE_ID = 'local';

/**
 * Top-level collaborative editing engine.
 *
 * Orchestrates vector clocks, operation logging, presence tracking,
 * session management, and collaborative evolution. Emits events
 * on the provided EventBus whenever operations are recorded.
 */
export class CollabEngine {
  readonly clock: VectorClock;
  readonly operations: OperationLog;
  readonly presence: PresenceSystem;
  readonly sessions: SessionHub;
  readonly evolution: CollaborativeEvolution;

  private readonly rng: DeterministicRNG;
  private readonly bus: EventBus;
  private operationCounter: number = 0;

  constructor(rng?: DeterministicRNG, bus?: EventBus) {
    this.rng = rng ?? new DeterministicRNG('collab-default');
    this.bus = bus ?? new EventBus();
    this.clock = new VectorClock(DEFAULT_NODE_ID);
    this.operations = new OperationLog();
    this.presence = new PresenceSystem();
    this.sessions = new SessionHub(this.rng);
    this.evolution = new CollaborativeEvolution(this.rng);
  }

  /**
   * Record a collaborative operation.
   *
   * Increments the vector clock, creates an Operation with a deterministic ID,
   * appends it to the operation log, and emits a world.changed event on the bus.
   *
   * @param userId - The user performing the operation
   * @param type - The operation type (create, update, delete)
   * @param targetId - The ID of the target entity
   * @param payload - Arbitrary payload data for the operation
   * @returns The created Operation
   */
  recordOperation(
    userId: string,
    type: 'create' | 'update' | 'delete',
    targetId: string,
    payload: unknown,
  ): Operation {
    this.clock.increment();
    this.operationCounter++;

    const opId = computeQuickHash(
      `op:${userId}:${type}:${targetId}:${this.operationCounter}:${this.rng.next()}`,
    );

    const op: Operation = {
      id: opId,
      userId,
      type,
      targetId,
      payload,
      clock: this.clock.toJSON(),
      timestamp: Date.now(),
    };

    this.operations.append(op);

    this.bus.emit({
      type: 'world.changed',
      action: `collab.${type}`,
      seedCount: this.operations.count(),
      timestamp: op.timestamp,
    });

    return op;
  }
}
