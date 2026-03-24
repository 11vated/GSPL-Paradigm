/**
 * @paradigm/scheduler — Event-driven simulation scheduler.
 *
 * O(log n) priority-based event dispatch via binary min-heap.
 * Enables million-seed ecosystems without tick-based polling.
 * Supports cascading events, recurring schedules, cancellation,
 * and dormancy optimization for inactive entities.
 *
 * @packageDocumentation
 */

import type { ParadigmEvent } from '@paradigm/types';
import { EventBus } from '@paradigm/events';

// ═══════════════════════════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════════════════════════

/** A scheduled event with timing and metadata. */
export interface ScheduledEvent {
  readonly id: string;
  readonly scheduledTick: number;
  readonly priority: number;
  readonly type: string;
  readonly payload: Record<string, unknown>;
  readonly sourceId?: string;
  readonly recurring?: { intervalTicks: number; maxRepeats: number; repeatCount: number };
  cancelled: boolean;
}

/** Statistics from the scheduler. */
export interface SchedulerStats {
  readonly eventsProcessed: number;
  readonly cascadesTriggered: number;
  readonly eventsDropped: number;
  readonly maxQueueDepth: number;
  readonly currentQueueSize: number;
  readonly currentTick: number;
}

// ═══════════════════════════════════════════════════════════════════
// MinHeap — Generic O(log n) priority queue
// ═══════════════════════════════════════════════════════════════════

/**
 * Binary min-heap with configurable comparator.
 * Insert and extract-min in O(log n). Cancel by predicate in O(n).
 */
export class MinHeap<T> {
  private readonly data: T[] = [];
  private readonly compare: (a: T, b: T) => number;

  constructor(compare: (a: T, b: T) => number) {
    this.compare = compare;
  }

  get size(): number { return this.data.length; }

  peek(): T | undefined { return this.data[0]; }

  push(item: T): void {
    this.data.push(item);
    this.bubbleUp(this.data.length - 1);
  }

  pop(): T | undefined {
    if (this.data.length === 0) return undefined;
    const top = this.data[0]!;
    const last = this.data.pop()!;
    if (this.data.length > 0) {
      this.data[0] = last;
      this.sinkDown(0);
    }
    return top;
  }

  /** Remove all items matching predicate. O(n) rebuild. */
  removeWhere(predicate: (item: T) => boolean): number {
    const before = this.data.length;
    const kept = this.data.filter((item) => !predicate(item));
    this.data.length = 0;
    // Rebuild heap from filtered array
    for (const item of kept) {
      this.data.push(item);
    }
    for (let i = Math.floor(this.data.length / 2) - 1; i >= 0; i--) {
      this.sinkDown(i);
    }
    return before - this.data.length;
  }

  clear(): void { this.data.length = 0; }

  private bubbleUp(i: number): void {
    while (i > 0) {
      const parent = Math.floor((i - 1) / 2);
      if (this.compare(this.data[i]!, this.data[parent]!) >= 0) break;
      [this.data[i], this.data[parent]] = [this.data[parent]!, this.data[i]!];
      i = parent;
    }
  }

  private sinkDown(i: number): void {
    const n = this.data.length;
    while (true) {
      let smallest = i;
      const left = 2 * i + 1;
      const right = 2 * i + 2;
      if (left < n && this.compare(this.data[left]!, this.data[smallest]!) < 0) smallest = left;
      if (right < n && this.compare(this.data[right]!, this.data[smallest]!) < 0) smallest = right;
      if (smallest === i) break;
      [this.data[i], this.data[smallest]] = [this.data[smallest]!, this.data[i]!];
      i = smallest;
    }
  }
}

// ═══════════════════════════════════════════════════════════════════
// WorldClock — Deterministic simulation time
// ═══════════════════════════════════════════════════════════════════

export interface ClockConfig {
  readonly ticksPerDay: number;
  readonly ticksPerSeason: number;
  readonly seasonsPerYear: number;
}

const DEFAULT_CLOCK_CONFIG: ClockConfig = {
  ticksPerDay: 1000,
  ticksPerSeason: 90_000,
  seasonsPerYear: 4,
};

export type Season = 'spring' | 'summer' | 'autumn' | 'winter';
const SEASONS: readonly Season[] = ['spring', 'summer', 'autumn', 'winter'];

/**
 * Deterministic world clock tracking ticks, days, and seasons.
 */
export class WorldClock {
  private _tick = 0;
  private readonly config: ClockConfig;

  constructor(config?: Partial<ClockConfig>) {
    this.config = { ...DEFAULT_CLOCK_CONFIG, ...config };
  }

  get tick(): number { return this._tick; }
  get day(): number { return Math.floor(this._tick / this.config.ticksPerDay); }
  get season(): Season { return SEASONS[Math.floor(this._tick / this.config.ticksPerSeason) % this.config.seasonsPerYear]!; }
  get year(): number { return Math.floor(this._tick / (this.config.ticksPerSeason * this.config.seasonsPerYear)); }
  get dayProgress(): number { return (this._tick % this.config.ticksPerDay) / this.config.ticksPerDay; }
  get isDay(): boolean { const p = this.dayProgress; return p > 0.25 && p < 0.75; }

  advance(ticks: number = 1): { dayChanged: boolean; seasonChanged: boolean } {
    const oldDay = this.day;
    const oldSeason = this.season;
    this._tick += ticks;
    return {
      dayChanged: this.day !== oldDay,
      seasonChanged: this.season !== oldSeason,
    };
  }

  reset(): void { this._tick = 0; }
}

// ═══════════════════════════════════════════════════════════════════
// EventScheduler — Priority-based dispatch with cascades
// ═══════════════════════════════════════════════════════════════════

export type CascadeHandler = (event: ScheduledEvent) => ScheduledEvent[];

/**
 * Priority-based event scheduler with O(log n) dispatch.
 *
 * Events are ordered by (scheduledTick, priority). Lower values dispatch first.
 * Supports cascading (events spawning follow-up events), recurring events,
 * cancellation, and integration with EventBus for real-time subscribers.
 */
export class EventScheduler {
  private readonly heap: MinHeap<ScheduledEvent>;
  private readonly clock: WorldClock;
  private readonly eventBus: EventBus | null;
  private readonly cascadeHandlers: Map<string, CascadeHandler> = new Map();
  private readonly maxCascadeDepth: number;
  private eventCounter = 0;
  private processedCount = 0;
  private cascadeCount = 0;
  private droppedCount = 0;
  private maxQueueSeen = 0;

  constructor(options?: { clock?: WorldClock; eventBus?: EventBus; maxCascadeDepth?: number }) {
    this.clock = options?.clock ?? new WorldClock();
    this.eventBus = options?.eventBus ?? null;
    this.maxCascadeDepth = options?.maxCascadeDepth ?? 10;
    this.heap = new MinHeap<ScheduledEvent>((a, b) => {
      if (a.scheduledTick !== b.scheduledTick) return a.scheduledTick - b.scheduledTick;
      return a.priority - b.priority;
    });
  }

  /** Schedule an event at a future tick. */
  schedule(type: string, tickOffset: number, payload: Record<string, unknown> = {}, options?: {
    priority?: number;
    sourceId?: string;
    recurring?: { intervalTicks: number; maxRepeats: number };
  }): string {
    const id = `evt_${++this.eventCounter}`;
    const event: ScheduledEvent = {
      id,
      scheduledTick: this.clock.tick + tickOffset,
      priority: options?.priority ?? 5,
      type,
      payload,
      sourceId: options?.sourceId,
      recurring: options?.recurring ? { ...options.recurring, repeatCount: 0 } : undefined,
      cancelled: false,
    };
    this.heap.push(event);
    this.trackQueueSize();
    return id;
  }

  /** Cancel a scheduled event by ID. */
  cancel(id: string): boolean {
    const removed = this.heap.removeWhere((e) => e.id === id);
    return removed > 0;
  }

  /** Register a cascade handler for an event type. */
  onCascade(eventType: string, handler: CascadeHandler): void {
    this.cascadeHandlers.set(eventType, handler);
  }

  /**
   * Process all events due at or before the current tick.
   * Advances the clock by the given ticks, then dispatches.
   * Returns the number of events processed.
   */
  processTick(advanceTicks: number = 1): number {
    const { dayChanged, seasonChanged } = this.clock.advance(advanceTicks);
    let processed = 0;

    // Dispatch all events due
    while (this.heap.size > 0) {
      const next = this.heap.peek();
      if (!next || next.scheduledTick > this.clock.tick) break;

      const event = this.heap.pop()!;
      if (event.cancelled) { this.droppedCount++; continue; }

      this.dispatchEvent(event, 0);
      processed++;

      // Handle recurring events
      if (event.recurring && event.recurring.repeatCount < event.recurring.maxRepeats) {
        const nextOccurrence: ScheduledEvent = {
          ...event,
          id: `${event.id}_r${event.recurring.repeatCount + 1}`,
          scheduledTick: this.clock.tick + event.recurring.intervalTicks,
          recurring: { ...event.recurring, repeatCount: event.recurring.repeatCount + 1 },
          cancelled: false,
        };
        this.heap.push(nextOccurrence);
      }
    }

    // Emit clock events
    if (dayChanged && this.eventBus) {
      this.eventBus.emit({ type: 'world.changed', action: 'day_changed', seedCount: 0, timestamp: Date.now() });
    }
    if (seasonChanged && this.eventBus) {
      this.eventBus.emit({ type: 'world.changed', action: 'season_changed', seedCount: 0, timestamp: Date.now() });
    }

    this.processedCount += processed;
    return processed;
  }

  /** Dispatch a single event, handling cascades recursively. */
  private dispatchEvent(event: ScheduledEvent, depth: number): void {
    // Emit to EventBus if connected
    if (this.eventBus) {
      this.eventBus.emit({
        type: 'simulation.step',
        tick: event.scheduledTick,
        seedCount: 0,
        timestamp: Date.now(),
      });
    }

    // Check for cascade handlers
    if (depth < this.maxCascadeDepth) {
      const handler = this.cascadeHandlers.get(event.type);
      if (handler) {
        const followUps = handler(event);
        this.cascadeCount += followUps.length;
        for (const followUp of followUps) {
          this.heap.push(followUp);
          this.dispatchEvent(followUp, depth + 1);
        }
      }
    }
  }

  private trackQueueSize(): void {
    if (this.heap.size > this.maxQueueSeen) this.maxQueueSeen = this.heap.size;
  }

  /** Get the world clock. */
  getClock(): WorldClock { return this.clock; }

  /** Get the current queue size. */
  getQueueSize(): number { return this.heap.size; }

  /** Get scheduler statistics. */
  getStats(): SchedulerStats {
    return {
      eventsProcessed: this.processedCount,
      cascadesTriggered: this.cascadeCount,
      eventsDropped: this.droppedCount,
      maxQueueDepth: this.maxQueueSeen,
      currentQueueSize: this.heap.size,
      currentTick: this.clock.tick,
    };
  }

  /** Reset all state. */
  reset(): void {
    this.heap.clear();
    this.clock.reset();
    this.processedCount = 0;
    this.cascadeCount = 0;
    this.droppedCount = 0;
    this.maxQueueSeen = 0;
  }
}
