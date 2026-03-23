/**
 * @paradigm/events — Typed event bus with replay and filtering.
 *
 * Enables loose coupling between genome evolution, world simulation,
 * agent intelligence, and all external systems. Supports both synchronous
 * and asynchronous handlers, event filtering, replay buffers, and
 * JSON-safe serialization for SSE transport.
 *
 * @packageDocumentation
 */

import type { ParadigmEvent } from '@paradigm/types';

// ─────────────────────────────────────────────
// Event Handler Types
// ─────────────────────────────────────────────

/** Synchronous or async event handler. */
export type EventHandler<T extends ParadigmEvent = ParadigmEvent> = (
  event: T,
) => void | Promise<void>;

/** Extract specific event type from the ParadigmEvent union by its `type` field. */
export type EventOfType<TType extends ParadigmEvent['type']> = Extract<
  ParadigmEvent,
  { readonly type: TType }
>;

/** Internal untyped handler reference. */
type UntypedHandler = (event: ParadigmEvent) => void | Promise<void>;

// ─────────────────────────────────────────────
// EventBus — Core typed event bus
// ─────────────────────────────────────────────

/**
 * Typed event bus with strongly-typed on/off/emit.
 *
 * Supports:
 * - Type-safe subscriptions via discriminated union event types
 * - Synchronous and async emission
 * - Wildcard listeners (subscribe to ALL events)
 * - Replay buffer for debugging and late-subscriber catch-up
 * - Event filtering (subscribe to multiple types at once)
 * - JSON serialization for SSE transport
 */
export class EventBus {
  private handlers: Map<string, Set<UntypedHandler>> = new Map();
  private wildcardHandlers: Set<UntypedHandler> = new Set();
  private replayBuffer: ParadigmEvent[] = [];
  private readonly maxReplaySize: number;
  private _totalEmitted: number = 0;

  // Backpressure: pending events queue
  private readonly maxQueueDepth: number;
  private pendingQueue: ParadigmEvent[] = [];
  private _droppedCount: number = 0;

  // Dead-letter queue: events whose handlers threw
  private deadLetterQueue: Array<{ event: ParadigmEvent; error: unknown; handler: string; timestamp: number }> = [];
  private readonly maxDeadLetterSize: number;

  // Handler timing metrics
  private handlerTimings: Map<string, { totalMs: number; callCount: number; maxMs: number }> = new Map();

  constructor(options?: {
    maxReplaySize?: number;
    maxQueueDepth?: number;
    maxDeadLetterSize?: number;
  }) {
    this.maxReplaySize = options?.maxReplaySize ?? 0;
    this.maxQueueDepth = options?.maxQueueDepth ?? 10_000;
    this.maxDeadLetterSize = options?.maxDeadLetterSize ?? 100;
  }

  /**
   * Register handler for a specific event type.
   * Returns an unsubscribe function.
   */
  on<TType extends ParadigmEvent['type']>(
    eventType: TType,
    handler: EventHandler<EventOfType<TType>>,
  ): () => void {
    if (!this.handlers.has(eventType)) {
      this.handlers.set(eventType, new Set());
    }
    const typedHandler = handler as UntypedHandler;
    this.handlers.get(eventType)!.add(typedHandler);

    return () => {
      this.off(eventType, handler);
    };
  }

  /**
   * Register handler for ALL event types (wildcard).
   * Returns an unsubscribe function.
   */
  onAny(handler: EventHandler<ParadigmEvent>): () => void {
    this.wildcardHandlers.add(handler as UntypedHandler);
    return () => {
      this.wildcardHandlers.delete(handler as UntypedHandler);
    };
  }

  /**
   * Register handler for multiple event types at once.
   * Returns a single unsubscribe function that removes all.
   */
  onMany<TType extends ParadigmEvent['type']>(
    eventTypes: TType[],
    handler: EventHandler<EventOfType<TType>>,
  ): () => void {
    const unsubscribers = eventTypes.map((type) => this.on(type, handler));
    return () => {
      for (const unsub of unsubscribers) {
        unsub();
      }
    };
  }

  /** Unregister handler for a specific event type. */
  off<TType extends ParadigmEvent['type']>(
    eventType: TType,
    handler: EventHandler<EventOfType<TType>>,
  ): void {
    const handlerSet = this.handlers.get(eventType);
    if (handlerSet) {
      handlerSet.delete(handler as UntypedHandler);
      if (handlerSet.size === 0) {
        this.handlers.delete(eventType);
      }
    }
  }

  /**
   * Register a one-time handler that auto-removes after first invocation.
   * Returns an unsubscribe function (can cancel before firing).
   */
  once<TType extends ParadigmEvent['type']>(
    eventType: TType,
    handler: EventHandler<EventOfType<TType>>,
  ): () => void {
    const wrappedHandler: EventHandler<EventOfType<TType>> = (event) => {
      unsub();
      return handler(event);
    };
    const unsub = this.on(eventType, wrappedHandler);
    return unsub;
  }

  /**
   * Emit event synchronously to all registered handlers.
   * Handlers are called in registration order. Errors are caught, logged,
   * and routed to the dead-letter queue.
   */
  emit<T extends ParadigmEvent>(event: T): void {
    this._totalEmitted++;
    this.recordToReplayBuffer(event);

    const handlerSet = this.handlers.get(event.type);
    if (handlerSet) {
      for (const handler of handlerSet) {
        const start = performance.now();
        try {
          handler(event);
        } catch (err) {
          console.error(`[EventBus] Handler error for ${event.type}:`, err);
          this.recordDeadLetter(event, err, event.type);
        }
        this.recordTiming(event.type, performance.now() - start);
      }
    }

    for (const handler of this.wildcardHandlers) {
      const start = performance.now();
      try {
        handler(event);
      } catch (err) {
        console.error(`[EventBus] Wildcard handler error for ${event.type}:`, err);
        this.recordDeadLetter(event, err, '*');
      }
      this.recordTiming('*', performance.now() - start);
    }
  }

  /**
   * Emit multiple events in a batch. Applies backpressure: if the queue
   * exceeds maxQueueDepth, oldest events are dropped.
   *
   * @param events - Array of events to emit.
   * @returns Number of events actually emitted (may be less than input if backpressure applied).
   */
  emitBatch(events: ParadigmEvent[]): number {
    const available = Math.max(0, this.maxQueueDepth - this.pendingQueue.length);
    const toProcess = events.slice(0, available);
    const dropped = events.length - toProcess.length;

    if (dropped > 0) {
      this._droppedCount += dropped;
      console.warn(`[EventBus] Backpressure: dropped ${dropped} events (queue full at ${this.maxQueueDepth})`);
    }

    for (const event of toProcess) {
      this.emit(event);
    }

    return toProcess.length;
  }

  /**
   * Emit event and wait for all handlers (including async) to complete.
   */
  async emitAsync<T extends ParadigmEvent>(event: T): Promise<void> {
    this._totalEmitted++;
    this.recordToReplayBuffer(event);

    const handlerSet = this.handlers.get(event.type);
    const promises: Promise<void>[] = [];

    if (handlerSet) {
      for (const handler of handlerSet) {
        promises.push(
          Promise.resolve()
            .then(() => handler(event))
            .catch((err) => {
              console.error(`[EventBus] Async handler error for ${event.type}:`, err);
            }),
        );
      }
    }

    for (const handler of this.wildcardHandlers) {
      promises.push(
        Promise.resolve()
          .then(() => handler(event))
          .catch((err) => {
            console.error(`[EventBus] Async wildcard handler error for ${event.type}:`, err);
          }),
      );
    }

    await Promise.all(promises);
  }

  // ─────────────────────────────────────────
  // Replay Buffer
  // ─────────────────────────────────────────

  private recordToReplayBuffer(event: ParadigmEvent): void {
    if (this.maxReplaySize <= 0) return;
    this.replayBuffer.push(event);
    if (this.replayBuffer.length > this.maxReplaySize) {
      this.replayBuffer.shift();
    }
  }

  /**
   * Replay all buffered events to a handler.
   * Useful for late subscribers that need to catch up on recent history.
   */
  replay(handler: EventHandler<ParadigmEvent>): void {
    for (const event of this.replayBuffer) {
      try {
        handler(event);
      } catch (err) {
        console.error(`[EventBus] Replay handler error:`, err);
      }
    }
  }

  /**
   * Replay only events of a specific type.
   */
  replayType<TType extends ParadigmEvent['type']>(
    eventType: TType,
    handler: EventHandler<EventOfType<TType>>,
  ): void {
    for (const event of this.replayBuffer) {
      if (event.type === eventType) {
        try {
          (handler as UntypedHandler)(event);
        } catch (err) {
          console.error(`[EventBus] Replay handler error for ${eventType}:`, err);
        }
      }
    }
  }

  /** Get a copy of the replay buffer. */
  getReplayBuffer(): readonly ParadigmEvent[] {
    return [...this.replayBuffer];
  }

  /** Clear the replay buffer. */
  clearReplayBuffer(): void {
    this.replayBuffer = [];
  }

  // ─────────────────────────────────────────
  // Introspection
  // ─────────────────────────────────────────

  /** Get handler count for a specific event type. */
  getHandlerCount(eventType: string): number {
    return (this.handlers.get(eventType)?.size ?? 0) + this.wildcardHandlers.size;
  }

  /** Total number of events emitted since creation. */
  get totalEmitted(): number {
    return this._totalEmitted;
  }

  /** Get all event types that have registered handlers. */
  getRegisteredTypes(): string[] {
    return Array.from(this.handlers.keys());
  }

  /** Clear handlers for an event type, or all handlers if not specified. */
  clear(eventType?: string): void {
    if (eventType) {
      this.handlers.delete(eventType);
    } else {
      this.handlers.clear();
      this.wildcardHandlers.clear();
    }
  }

  /** Full reset: clear all handlers, replay buffer, dead letters, and metrics. */
  reset(): void {
    this.handlers.clear();
    this.wildcardHandlers.clear();
    this.replayBuffer = [];
    this.pendingQueue = [];
    this.deadLetterQueue = [];
    this.handlerTimings.clear();
    this._totalEmitted = 0;
    this._droppedCount = 0;
  }

  // ─────────────────────────────────────────
  // Dead-Letter Queue
  // ─────────────────────────────────────────

  /** Record an event that caused a handler to throw. */
  private recordDeadLetter(event: ParadigmEvent, error: unknown, handler: string): void {
    this.deadLetterQueue.push({
      event,
      error,
      handler,
      timestamp: Date.now(),
    });
    if (this.deadLetterQueue.length > this.maxDeadLetterSize) {
      this.deadLetterQueue.shift();
    }
  }

  /** Get all dead-letter entries (events whose handlers threw). */
  getDeadLetters(): ReadonlyArray<{ event: ParadigmEvent; error: unknown; handler: string; timestamp: number }> {
    return [...this.deadLetterQueue];
  }

  /** Clear the dead-letter queue. */
  clearDeadLetters(): void {
    this.deadLetterQueue = [];
  }

  /** Number of events dropped due to backpressure. */
  get droppedCount(): number {
    return this._droppedCount;
  }

  // ─────────────────────────────────────────
  // Handler Timing Metrics
  // ─────────────────────────────────────────

  /** Record handler execution time for a given event type. */
  private recordTiming(eventType: string, ms: number): void {
    let timing = this.handlerTimings.get(eventType);
    if (!timing) {
      timing = { totalMs: 0, callCount: 0, maxMs: 0 };
      this.handlerTimings.set(eventType, timing);
    }
    timing.totalMs += ms;
    timing.callCount += 1;
    if (ms > timing.maxMs) timing.maxMs = ms;
  }

  /**
   * Get handler execution metrics per event type.
   *
   * @returns Map of event type to { avgMs, maxMs, callCount }.
   */
  getMetrics(): Map<string, { avgMs: number; maxMs: number; callCount: number }> {
    const result = new Map<string, { avgMs: number; maxMs: number; callCount: number }>();
    for (const [type, timing] of this.handlerTimings) {
      result.set(type, {
        avgMs: timing.callCount > 0 ? timing.totalMs / timing.callCount : 0,
        maxMs: timing.maxMs,
        callCount: timing.callCount,
      });
    }
    return result;
  }

  /** Clear all timing metrics. */
  clearMetrics(): void {
    this.handlerTimings.clear();
  }
}

// ─────────────────────────────────────────────
// Event Serialization — JSON-safe for SSE transport
// ─────────────────────────────────────────────

/**
 * Serialize a ParadigmEvent to a JSON string for SSE or persistence.
 * Handles all event types in the discriminated union.
 */
export function serializeEvent(event: ParadigmEvent): string {
  return JSON.stringify(event);
}

/**
 * Deserialize a JSON string back to a ParadigmEvent.
 * Returns null if parsing fails or the result lacks a valid `type` field.
 */
export function deserializeEvent(json: string): ParadigmEvent | null {
  try {
    const parsed: unknown = JSON.parse(json);
    if (
      typeof parsed === 'object' &&
      parsed !== null &&
      'type' in parsed &&
      typeof (parsed as Record<string, unknown>)['type'] === 'string'
    ) {
      return parsed as ParadigmEvent;
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Format an event as an SSE data line: `data: {...}\n\n`
 */
export function formatSSE(event: ParadigmEvent): string {
  return `data: ${serializeEvent(event)}\n\n`;
}

// ─────────────────────────────────────────────
// Event Filter Utility
// ─────────────────────────────────────────────

/**
 * Create a filtered event stream that only passes events matching a predicate.
 * Useful for building derived event streams or conditional subscriptions.
 */
export function createFilteredSubscription(
  bus: EventBus,
  predicate: (event: ParadigmEvent) => boolean,
  handler: EventHandler<ParadigmEvent>,
): () => void {
  return bus.onAny((event) => {
    if (predicate(event)) {
      return handler(event);
    }
  });
}
