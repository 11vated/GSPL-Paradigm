/**
 * @paradigm/network — Real-time networking and global presence.
 *
 * Layer 6: Infrastructure. Provides abstract message routing, room management,
 * seed broadcasting, presence tracking, and system-wide metrics. This is a
 * pure protocol/logic implementation with no actual WebSocket or Node.js
 * network APIs — all transport concerns are delegated to adapters.
 *
 * Zero external dependencies beyond @paradigm/types, @paradigm/rng, @paradigm/events.
 *
 * @packageDocumentation
 */

import type { UniversalSeed, GeneMap } from '@paradigm/types';
import { DeterministicRNG, computeQuickHash } from '@paradigm/rng';
import { EventBus } from '@paradigm/events';

// ─────────────────────────────────────────────
// Connection & Message Types
// ─────────────────────────────────────────────

/** Possible states of a network connection. */
export type ConnectionState = 'connecting' | 'connected' | 'disconnected' | 'error';

/** Wire-format message routed through the network layer. */
export interface NetworkMessage {
  readonly id: string;
  readonly type: string;
  readonly payload: unknown;
  readonly senderId: string;
  readonly timestamp: number;
  readonly roomId?: string;
}

/** A named communication channel with a set of members. */
export interface Room {
  readonly id: string;
  readonly name: string;
  readonly members: Set<string>;
  readonly createdAt: number;
  readonly metadata: Record<string, unknown>;
}

// ─────────────────────────────────────────────
// Seed Broadcast Event Types
// ─────────────────────────────────────────────

/** Discriminated union of seed lifecycle broadcast events. */
export type SeedBroadcastEvent =
  | { readonly type: 'seed.created'; readonly seed: UniversalSeed; readonly senderId: string; readonly timestamp: number }
  | { readonly type: 'seed.updated'; readonly seed: UniversalSeed; readonly senderId: string; readonly timestamp: number }
  | { readonly type: 'seed.deleted'; readonly seedHash: string; readonly senderId: string; readonly timestamp: number };

// ─────────────────────────────────────────────
// Presence Types
// ─────────────────────────────────────────────

/** Metadata attached to a connected user's presence entry. */
export interface PresenceMetadata {
  readonly region?: string;
  readonly displayName?: string;
}

/** A single presence record for an online user. */
export interface PresenceEntry {
  readonly userId: string;
  readonly metadata: PresenceMetadata;
  readonly connectedAt: number;
  lastHeartbeat: number;
}

// ─────────────────────────────────────────────
// Metric Types
// ─────────────────────────────────────────────

/** Aggregated metric snapshot for a single named metric. */
export interface MetricSummary {
  readonly current: number;
  readonly min: number;
  readonly max: number;
  readonly avg: number;
  readonly samples: number;
}

/** System-wide dashboard snapshot. */
export interface DashboardSnapshot {
  readonly onlineUsers: number;
  readonly activeRooms: number;
  readonly messagesPerMinute: number;
  readonly seedBroadcasts: number;
  readonly uptime: number;
}

// ─────────────────────────────────────────────
// RoomManager — Room-based message routing
// ─────────────────────────────────────────────

/**
 * Manages named rooms and their membership.
 * Provides creation, join/leave, listing, and broadcast counting.
 */
export class RoomManager {
  private readonly rooms: Map<string, Room> = new Map();
  private readonly rng: DeterministicRNG;

  constructor(rng: DeterministicRNG) {
    this.rng = rng;
  }

  /** Create a new room with the given name. The creator is automatically joined. */
  createRoom(name: string, creatorId: string, metadata?: Record<string, unknown>): Room {
    const id = `room-${computeQuickHash({ name, creatorId, t: this.rng.next() })}`;
    const members = new Set<string>();
    members.add(creatorId);
    const room: Room = {
      id,
      name,
      members,
      createdAt: Date.now(),
      metadata: metadata ?? {},
    };
    this.rooms.set(id, room);
    return room;
  }

  /** Add a user to a room. Returns false if the room does not exist. */
  joinRoom(roomId: string, userId: string): boolean {
    const room = this.rooms.get(roomId);
    if (room === undefined) {
      return false;
    }
    room.members.add(userId);
    return true;
  }

  /** Remove a user from a room. Returns false if the room does not exist. */
  leaveRoom(roomId: string, userId: string): boolean {
    const room = this.rooms.get(roomId);
    if (room === undefined) {
      return false;
    }
    return room.members.delete(userId);
  }

  /** Look up a room by ID. */
  getRoom(roomId: string): Room | undefined {
    return this.rooms.get(roomId);
  }

  /** Return all rooms that contain the given user. */
  getRoomsForUser(userId: string): Room[] {
    const result: Room[] = [];
    for (const room of this.rooms.values()) {
      if (room.members.has(userId)) {
        result.push(room);
      }
    }
    return result;
  }

  /** Return all rooms. */
  listRooms(): Room[] {
    return Array.from(this.rooms.values());
  }

  /** Delete a room entirely. Returns false if the room did not exist. */
  deleteRoom(roomId: string): boolean {
    return this.rooms.delete(roomId);
  }

  /**
   * Count the number of members in a room that would receive a broadcast.
   * Returns 0 if the room does not exist.
   */
  broadcast(roomId: string, _message: NetworkMessage): number {
    const room = this.rooms.get(roomId);
    if (room === undefined) {
      return 0;
    }
    return room.members.size;
  }
}

// ─────────────────────────────────────────────
// MessageRouter — Type-based message dispatch
// ─────────────────────────────────────────────

/** Handler function invoked when a message of a matching type arrives. */
export type MessageHandler = (msg: NetworkMessage) => void;

/**
 * Routes NetworkMessages to registered handlers by message type.
 * Maintains a log of routed messages for replay and debugging.
 */
export class MessageRouter {
  private readonly handlers: Map<string, Set<MessageHandler>> = new Map();
  private readonly messageLog: NetworkMessage[] = [];
  private readonly maxLogSize: number;

  constructor(maxLogSize: number = 1000) {
    this.maxLogSize = maxLogSize;
  }

  /**
   * Register a handler for a specific message type.
   * Returns an unsubscribe function.
   */
  registerHandler(type: string, handler: MessageHandler): () => void {
    let handlerSet = this.handlers.get(type);
    if (handlerSet === undefined) {
      handlerSet = new Set<MessageHandler>();
      this.handlers.set(type, handlerSet);
    }
    handlerSet.add(handler);

    return () => {
      const set = this.handlers.get(type);
      if (set !== undefined) {
        set.delete(handler);
        if (set.size === 0) {
          this.handlers.delete(type);
        }
      }
    };
  }

  /** Dispatch a message to all handlers registered for its type. */
  route(message: NetworkMessage): void {
    this.messageLog.push(message);
    if (this.messageLog.length > this.maxLogSize) {
      this.messageLog.shift();
    }

    const handlerSet = this.handlers.get(message.type);
    if (handlerSet !== undefined) {
      for (const handler of handlerSet) {
        try {
          handler(message);
        } catch (err: unknown) {
          const errMsg = err instanceof Error ? err.message : String(err);
          console.error(
            `[MessageRouter] Handler error for type "${message.type}": ${errMsg}`,
          );
        }
      }
    }
  }

  /** Return the number of handlers registered for a specific type. */
  getHandlerCount(type: string): number {
    return this.handlers.get(type)?.size ?? 0;
  }

  /**
   * Return recent messages from the log.
   * @param limit Maximum number of messages to return (default: 50).
   */
  getMessageLog(limit: number = 50): NetworkMessage[] {
    const start = Math.max(0, this.messageLog.length - limit);
    return this.messageLog.slice(start);
  }
}

// ─────────────────────────────────────────────
// SeedBroadcaster — Publish seed lifecycle events
// ─────────────────────────────────────────────

/** Handler for seed broadcast events. */
export type SeedBroadcastHandler = (event: SeedBroadcastEvent) => void;

/**
 * Publishes and subscribes to seed lifecycle events (create, update, delete).
 * Maintains a rolling log of recent events for late-subscriber catch-up.
 */
export class SeedBroadcaster {
  private readonly subscribers: Set<SeedBroadcastHandler> = new Set();
  private readonly recentEvents: SeedBroadcastEvent[] = [];
  private readonly maxEvents: number;

  constructor(maxEvents: number = 200) {
    this.maxEvents = maxEvents;
  }

  /** Broadcast that a new seed was created. */
  publishCreate(seed: UniversalSeed, senderId: string): void {
    const event: SeedBroadcastEvent = {
      type: 'seed.created',
      seed,
      senderId,
      timestamp: Date.now(),
    };
    this.dispatch(event);
  }

  /** Broadcast that a seed was updated. */
  publishUpdate(seed: UniversalSeed, senderId: string): void {
    const event: SeedBroadcastEvent = {
      type: 'seed.updated',
      seed,
      senderId,
      timestamp: Date.now(),
    };
    this.dispatch(event);
  }

  /** Broadcast that a seed was deleted. */
  publishDelete(seedHash: string, senderId: string): void {
    const event: SeedBroadcastEvent = {
      type: 'seed.deleted',
      seedHash,
      senderId,
      timestamp: Date.now(),
    };
    this.dispatch(event);
  }

  /**
   * Subscribe to all seed broadcast events.
   * Returns an unsubscribe function.
   */
  subscribe(handler: SeedBroadcastHandler): () => void {
    this.subscribers.add(handler);
    return () => {
      this.subscribers.delete(handler);
    };
  }

  /**
   * Return recent broadcast events.
   * @param limit Maximum number of events to return (default: 50).
   */
  getRecentEvents(limit: number = 50): SeedBroadcastEvent[] {
    const start = Math.max(0, this.recentEvents.length - limit);
    return this.recentEvents.slice(start);
  }

  /** Dispatch an event to all subscribers and log it. */
  private dispatch(event: SeedBroadcastEvent): void {
    this.recentEvents.push(event);
    if (this.recentEvents.length > this.maxEvents) {
      this.recentEvents.shift();
    }
    for (const handler of this.subscribers) {
      try {
        handler(event);
      } catch (err: unknown) {
        const errMsg = err instanceof Error ? err.message : String(err);
        console.error(`[SeedBroadcaster] Handler error: ${errMsg}`);
      }
    }
  }
}

// ─────────────────────────────────────────────
// PresenceServer — Global user tracking
// ─────────────────────────────────────────────

/** Stale threshold in milliseconds: users without a heartbeat for this long are auto-disconnected. */
const STALE_THRESHOLD_MS = 60_000;

/**
 * Tracks which users are online, their metadata, and connection timing.
 * Automatically prunes stale entries on every read operation.
 */
export class PresenceServer {
  private readonly entries: Map<string, PresenceEntry> = new Map();

  /** Connect a user, recording their presence. Overwrites any prior entry. */
  connect(userId: string, metadata?: PresenceMetadata): void {
    const now = Date.now();
    const entry: PresenceEntry = {
      userId,
      metadata: metadata ?? {},
      connectedAt: now,
      lastHeartbeat: now,
    };
    this.entries.set(userId, entry);
  }

  /** Disconnect a user, removing their presence. */
  disconnect(userId: string): void {
    this.entries.delete(userId);
  }

  /** Update the heartbeat timestamp for a connected user. No-op if not connected. */
  heartbeat(userId: string): void {
    const entry = this.entries.get(userId);
    if (entry !== undefined) {
      entry.lastHeartbeat = Date.now();
    }
  }

  /** Return all currently online (non-stale) users. Prunes stale entries first. */
  getOnline(): Array<{ userId: string; metadata: PresenceMetadata; connectedAt: number; lastHeartbeat: number }> {
    this.pruneStale();
    const result: Array<{ userId: string; metadata: PresenceMetadata; connectedAt: number; lastHeartbeat: number }> = [];
    for (const entry of this.entries.values()) {
      result.push({
        userId: entry.userId,
        metadata: entry.metadata,
        connectedAt: entry.connectedAt,
        lastHeartbeat: entry.lastHeartbeat,
      });
    }
    return result;
  }

  /** Return the count of online (non-stale) users. */
  getOnlineCount(): number {
    this.pruneStale();
    return this.entries.size;
  }

  /** Check whether a specific user is currently online and non-stale. */
  isOnline(userId: string): boolean {
    this.pruneStale();
    return this.entries.has(userId);
  }

  /** Return a map of region names to user counts. Unknown regions are grouped under "unknown". */
  getRegionStats(): Map<string, number> {
    this.pruneStale();
    const stats = new Map<string, number>();
    for (const entry of this.entries.values()) {
      const region = entry.metadata.region ?? 'unknown';
      const current = stats.get(region) ?? 0;
      stats.set(region, current + 1);
    }
    return stats;
  }

  /** Remove entries whose last heartbeat exceeds the stale threshold. */
  private pruneStale(): void {
    const now = Date.now();
    const staleIds: string[] = [];
    for (const [userId, entry] of this.entries) {
      if (now - entry.lastHeartbeat > STALE_THRESHOLD_MS) {
        staleIds.push(userId);
      }
    }
    for (const id of staleIds) {
      this.entries.delete(id);
    }
  }
}

// ─────────────────────────────────────────────
// GlobalDashboard — System-wide metrics
// ─────────────────────────────────────────────

/** Internal rolling-window sample buffer for a single metric. */
interface MetricBuffer {
  samples: number[];
  min: number;
  max: number;
}

/** Maximum number of samples retained per metric. */
const MAX_METRIC_SAMPLES = 100;

/**
 * Records and aggregates system-wide metrics with a rolling window.
 * Provides snapshots for monitoring dashboards and health checks.
 */
export class GlobalDashboard {
  private readonly metrics: Map<string, MetricBuffer> = new Map();
  private readonly startTime: number;
  private readonly presence: PresenceServer;
  private readonly roomManager: RoomManager;
  private readonly broadcaster: SeedBroadcaster;
  private readonly router: MessageRouter;

  constructor(
    presence: PresenceServer,
    roomManager: RoomManager,
    broadcaster: SeedBroadcaster,
    router: MessageRouter,
  ) {
    this.startTime = Date.now();
    this.presence = presence;
    this.roomManager = roomManager;
    this.broadcaster = broadcaster;
    this.router = router;
  }

  /** Record a numeric sample for a named metric. */
  recordMetric(name: string, value: number): void {
    let buffer = this.metrics.get(name);
    if (buffer === undefined) {
      buffer = { samples: [], min: value, max: value };
      this.metrics.set(name, buffer);
    }
    buffer.samples.push(value);
    if (buffer.samples.length > MAX_METRIC_SAMPLES) {
      buffer.samples.shift();
    }
    if (value < buffer.min) {
      buffer.min = value;
    }
    if (value > buffer.max) {
      buffer.max = value;
    }
  }

  /** Retrieve the aggregated summary for a named metric, or undefined if never recorded. */
  getMetric(name: string): MetricSummary | undefined {
    const buffer = this.metrics.get(name);
    if (buffer === undefined) {
      return undefined;
    }
    const { samples, min, max } = buffer;
    const count = samples.length;
    if (count === 0) {
      return undefined;
    }
    const last = samples[count - 1];
    const sum = samples.reduce((acc, v) => acc + v, 0);
    return {
      current: last!,
      min,
      max,
      avg: sum / count,
      samples: count,
    };
  }

  /** Return a system-wide snapshot combining presence, rooms, messaging, and broadcast stats. */
  getSnapshot(): DashboardSnapshot {
    const now = Date.now();
    const messageLog = this.router.getMessageLog(1000);
    const oneMinuteAgo = now - 60_000;
    const recentMessages = messageLog.filter((m) => m.timestamp > oneMinuteAgo);

    return {
      onlineUsers: this.presence.getOnlineCount(),
      activeRooms: this.roomManager.listRooms().length,
      messagesPerMinute: recentMessages.length,
      seedBroadcasts: this.broadcaster.getRecentEvents(10000).length,
      uptime: now - this.startTime,
    };
  }

  /** Reset all recorded metrics. Does not affect presence, rooms, or other subsystems. */
  resetMetrics(): void {
    this.metrics.clear();
  }
}

// ─────────────────────────────────────────────
// NetworkEngine — Top-level entry point
// ─────────────────────────────────────────────

/**
 * Top-level orchestrator for the @paradigm/network layer.
 * Composes RoomManager, MessageRouter, SeedBroadcaster, PresenceServer,
 * and GlobalDashboard into a single entry point.
 */
export class NetworkEngine {
  /** Room-based member management and broadcast counting. */
  readonly rooms: RoomManager;

  /** Type-based message dispatch with logging. */
  readonly router: MessageRouter;

  /** Seed lifecycle event broadcasting. */
  readonly broadcaster: SeedBroadcaster;

  /** Global user presence tracking with stale detection. */
  readonly presence: PresenceServer;

  /** System-wide metrics and snapshot dashboard. */
  readonly dashboard: GlobalDashboard;

  private readonly rng: DeterministicRNG;
  private readonly eventBus: EventBus;

  constructor(rng?: DeterministicRNG, eventBus?: EventBus) {
    this.rng = rng ?? new DeterministicRNG('network-default');
    this.eventBus = eventBus ?? new EventBus();
    this.rooms = new RoomManager(this.rng);
    this.router = new MessageRouter();
    this.broadcaster = new SeedBroadcaster();
    this.presence = new PresenceServer();
    this.dashboard = new GlobalDashboard(
      this.presence,
      this.rooms,
      this.broadcaster,
      this.router,
    );
  }

  /**
   * Send a message through the router and record the event in the dashboard.
   * If the message has a roomId, it is also counted as a room broadcast.
   */
  send(message: NetworkMessage): void {
    this.router.route(message);
    this.dashboard.recordMetric('messages.sent', 1);

    if (message.roomId !== undefined) {
      this.rooms.broadcast(message.roomId, message);
    }
  }

  /**
   * Construct and broadcast a NetworkMessage to all members of a room.
   * The message is routed through the MessageRouter and recorded in the dashboard.
   * Returns the number of room members who would receive the message.
   */
  broadcastToRoom(roomId: string, type: string, payload: unknown, senderId: string): number {
    const id = `msg-${computeQuickHash({ roomId, type, senderId, t: this.rng.next() })}`;
    const message: NetworkMessage = {
      id,
      type,
      payload,
      senderId,
      timestamp: Date.now(),
      roomId,
    };
    this.router.route(message);
    this.dashboard.recordMetric('messages.broadcast', 1);
    return this.rooms.broadcast(roomId, message);
  }
}
