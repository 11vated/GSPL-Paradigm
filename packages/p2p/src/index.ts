/**
 * @paradigm/p2p — Peer-to-peer networking with CRDT conflict resolution.
 *
 * Layer 6: Infrastructure. Pure protocol/logic implementation with in-memory
 * message queues — no actual network sockets. Provides peer lifecycle management,
 * delta-based seed synchronization, CRDT conflict resolution, peer discovery,
 * typed message routing, and bandwidth throttling.
 *
 * Zero external dependencies beyond @paradigm/types and @paradigm/rng.
 *
 * @packageDocumentation
 */

import type { UniversalSeed, GeneMap } from '@paradigm/types';
import { DeterministicRNG, computeQuickHash } from '@paradigm/rng';

// ─────────────────────────────────────────────
// Core Types
// ─────────────────────────────────────────────

/** Lifecycle status of a peer connection. */
export type PeerStatus = 'connecting' | 'connected' | 'disconnected' | 'banned';

/** Represents a single peer in the network. */
export interface Peer {
  readonly id: string;
  name: string;
  status: PeerStatus;
  lastSeen: number;
  latency: number;
  seedCount: number;
}

/** A typed message exchanged between peers over a named channel. */
export interface PeerMessage {
  readonly id: string;
  readonly fromPeer: string;
  readonly toPeer: string;
  readonly channel: string;
  readonly payload: unknown;
  readonly timestamp: number;
}

/** Internal tracking state for a locally-registered seed. */
export interface SeedSyncEntry {
  hash: string;
  version: number;
  lastSync: number;
}

/** Result of a delta comparison between local and remote sync states. */
export interface SyncDelta {
  toSend: string[];
  toRequest: string[];
}

/** A single conflict resolution log entry. */
export interface ResolutionLogEntry {
  localHash: string;
  remoteHash: string;
  winner: 'local' | 'remote';
  reason: string;
  timestamp: number;
}

/** An announcement from a peer advertising its presence. */
export interface PeerAnnouncement {
  peerId: string;
  metadata: Record<string, unknown>;
  discoveredAt: number;
}

/** Bandwidth statistics snapshot. */
export interface BandwidthStats {
  bytesSent: number;
  bytesReceived: number;
  currentRate: number;
  maxRate: number;
}

/** Strategy used by the conflict resolver. */
export type ResolutionStrategy = 'fitness' | 'timestamp' | 'hash';

/** Handler function signature for incoming messages on a channel. */
export type MessageHandler = (msg: PeerMessage) => void;

/** Built-in protocol channel names. */
export const BUILTIN_CHANNELS = [
  'seed.sync',
  'seed.request',
  'peer.hello',
  'peer.bye',
] as const;

export type BuiltinChannel = (typeof BUILTIN_CHANNELS)[number];

// ─────────────────────────────────────────────
// PeerManager — Peer lifecycle management
// ─────────────────────────────────────────────

/**
 * Manages the set of known peers and their lifecycle states.
 * Tracks connections, disconnections, bans, and last-seen timestamps.
 */
export class PeerManager {
  private readonly peers: Map<string, Peer> = new Map();
  private readonly banReasons: Map<string, string> = new Map();

  /** Add a new peer in 'connecting' state. Returns the created Peer (or existing if duplicate). */
  addPeer(id: string, name: string): Peer {
    const existing = this.peers.get(id);
    if (existing !== undefined) {
      return existing;
    }
    const peer: Peer = {
      id,
      name,
      status: 'connecting',
      lastSeen: Date.now(),
      latency: 0,
      seedCount: 0,
    };
    this.peers.set(id, peer);
    return peer;
  }

  /** Remove a peer entirely. Returns true if the peer existed. */
  removePeer(id: string): boolean {
    this.banReasons.delete(id);
    return this.peers.delete(id);
  }

  /** Retrieve a peer by ID, or undefined if not found. */
  getPeer(id: string): Peer | undefined {
    return this.peers.get(id);
  }

  /** Return all peers currently in 'connected' status. */
  getConnected(): Peer[] {
    const result: Peer[] = [];
    for (const peer of this.peers.values()) {
      if (peer.status === 'connected') {
        result.push(peer);
      }
    }
    return result;
  }

  /** Return all known peers regardless of status. */
  getAll(): Peer[] {
    return Array.from(this.peers.values());
  }

  /** Update a peer's status. Returns false if the peer does not exist. */
  updateStatus(id: string, status: PeerStatus): boolean {
    const peer = this.peers.get(id);
    if (peer === undefined) {
      return false;
    }
    peer.status = status;
    return true;
  }

  /** Update a peer's lastSeen to current time. Returns false if not found. */
  updateLastSeen(id: string): boolean {
    const peer = this.peers.get(id);
    if (peer === undefined) {
      return false;
    }
    peer.lastSeen = Date.now();
    return true;
  }

  /** Ban a peer, setting status to 'banned' and recording the reason. */
  banPeer(id: string, reason: string): boolean {
    const peer = this.peers.get(id);
    if (peer === undefined) {
      return false;
    }
    peer.status = 'banned';
    this.banReasons.set(id, reason);
    return true;
  }

  /** Return all peers with 'banned' status. */
  getBanned(): Peer[] {
    const result: Peer[] = [];
    for (const peer of this.peers.values()) {
      if (peer.status === 'banned') {
        result.push(peer);
      }
    }
    return result;
  }

  /** Retrieve the ban reason for a peer, if any. */
  getBanReason(id: string): string | undefined {
    return this.banReasons.get(id);
  }
}

// ─────────────────────────────────────────────
// SeedSync — Delta-based seed replication
// ─────────────────────────────────────────────

/**
 * Tracks local seeds and computes deltas for efficient peer synchronization.
 * Uses hash+version tracking to determine what needs to be sent or requested.
 */
export class SeedSync {
  private readonly localSeeds: Map<string, UniversalSeed> = new Map();
  private readonly syncEntries: Map<string, SeedSyncEntry> = new Map();

  /** Register a local seed for sync tracking. Computes hash and increments version. */
  registerLocalSeed(seed: UniversalSeed): void {
    const hash = seed.$hash !== '' ? seed.$hash : computeQuickHash(seed.genes);
    const existing = this.syncEntries.get(hash);
    const version = existing !== undefined ? existing.version + 1 : 1;
    this.localSeeds.set(hash, seed);
    this.syncEntries.set(hash, {
      hash,
      version,
      lastSync: Date.now(),
    });
  }

  /** Return the current sync state map (hash -> { hash, version, lastSync }). */
  getSyncState(): Map<string, SeedSyncEntry> {
    return new Map(this.syncEntries);
  }

  /**
   * Compute the delta between local state and a remote peer's state.
   * Returns arrays of seed hashes to send (we have newer or they lack)
   * and to request (they have newer or we lack).
   */
  computeDelta(remoteState: Map<string, { hash: string; version: number }>): SyncDelta {
    const toSend: string[] = [];
    const toRequest: string[] = [];

    for (const [hash, localEntry] of this.syncEntries) {
      const remoteEntry = remoteState.get(hash);
      if (remoteEntry === undefined) {
        toSend.push(hash);
      } else if (localEntry.version > remoteEntry.version) {
        toSend.push(hash);
      }
    }

    for (const [hash, remoteEntry] of remoteState) {
      const localEntry = this.syncEntries.get(hash);
      if (localEntry === undefined) {
        toRequest.push(hash);
      } else if (remoteEntry.version > localEntry.version) {
        toRequest.push(hash);
      }
    }

    return { toSend, toRequest };
  }

  /**
   * Apply a seed received from a remote peer.
   * Returns the outcome: 'added', 'updated', 'conflict', or 'ignored'.
   */
  applyRemoteSeed(seed: UniversalSeed): 'added' | 'updated' | 'conflict' | 'ignored' {
    const hash = seed.$hash !== '' ? seed.$hash : computeQuickHash(seed.genes);
    const existing = this.localSeeds.get(hash);

    if (existing === undefined) {
      this.localSeeds.set(hash, seed);
      this.syncEntries.set(hash, {
        hash,
        version: 1,
        lastSync: Date.now(),
      });
      return 'added';
    }

    const existingGeneHash = computeQuickHash(existing.genes);
    const remoteGeneHash = computeQuickHash(seed.genes);

    if (existingGeneHash === remoteGeneHash) {
      return 'ignored';
    }

    const localGen = existing.$lineage.generation;
    const remoteGen = seed.$lineage.generation;

    if (remoteGen > localGen) {
      this.localSeeds.set(hash, seed);
      const entry = this.syncEntries.get(hash);
      const newVersion = entry !== undefined ? entry.version + 1 : 1;
      this.syncEntries.set(hash, {
        hash,
        version: newVersion,
        lastSync: Date.now(),
      });
      return 'updated';
    }

    return 'conflict';
  }

  /** Return all locally-tracked seeds. */
  getLocalSeeds(): UniversalSeed[] {
    return Array.from(this.localSeeds.values());
  }

  /** Retrieve a specific seed by hash, or undefined if not tracked. */
  getSeedByHash(hash: string): UniversalSeed | undefined {
    return this.localSeeds.get(hash);
  }
}

// ─────────────────────────────────────────────
// ConflictResolver — CRDT-based seed merging
// ─────────────────────────────────────────────

/**
 * Resolves conflicts when two peers have divergent versions of a seed.
 *
 * Default strategy chain: fitness > timestamp > lexicographic hash.
 * - Higher fitness wins.
 * - If equal, newer timestamp wins.
 * - If equal, lower lexicographic hash wins (deterministic tiebreaker).
 *
 * Strategy can be overridden to prioritize a single dimension.
 */
export class ConflictResolver {
  private strategy: ResolutionStrategy = 'fitness';
  private readonly log: ResolutionLogEntry[] = [];

  /**
   * Resolve a conflict between a local and remote seed.
   * Returns the winning seed according to the current strategy.
   */
  resolve(local: UniversalSeed, remote: UniversalSeed): UniversalSeed {
    const localHash = local.$hash !== '' ? local.$hash : computeQuickHash(local.genes);
    const remoteHash = remote.$hash !== '' ? remote.$hash : computeQuickHash(remote.genes);
    const timestamp = Date.now();

    const result = this.compareSeeds(local, remote, localHash, remoteHash);

    this.log.push({
      localHash,
      remoteHash,
      winner: result.winner,
      reason: result.reason,
      timestamp,
    });

    return result.winner === 'local' ? local : remote;
  }

  /** Set the primary resolution strategy. */
  setStrategy(strategy: ResolutionStrategy): void {
    this.strategy = strategy;
  }

  /** Return the full resolution log. */
  getResolutionLog(): ResolutionLogEntry[] {
    return [...this.log];
  }

  /** Compare two seeds using the configured strategy. */
  private compareSeeds(
    local: UniversalSeed,
    remote: UniversalSeed,
    localHash: string,
    remoteHash: string,
  ): { winner: 'local' | 'remote'; reason: string } {
    switch (this.strategy) {
      case 'fitness':
        return this.resolveByFitnessThenTimestampThenHash(
          local, remote, localHash, remoteHash,
        );
      case 'timestamp':
        return this.resolveByTimestampThenHash(local, remote, localHash, remoteHash);
      case 'hash':
        return this.resolveByHash(localHash, remoteHash);
    }
  }

  /** Full strategy chain: fitness -> timestamp -> hash. */
  private resolveByFitnessThenTimestampThenHash(
    local: UniversalSeed,
    remote: UniversalSeed,
    localHash: string,
    remoteHash: string,
  ): { winner: 'local' | 'remote'; reason: string } {
    const localFitness = local.$fitness?.primary ?? 0;
    const remoteFitness = remote.$fitness?.primary ?? 0;

    if (localFitness > remoteFitness) {
      return { winner: 'local', reason: `higher fitness (${localFitness} > ${remoteFitness})` };
    }
    if (remoteFitness > localFitness) {
      return { winner: 'remote', reason: `higher fitness (${remoteFitness} > ${localFitness})` };
    }

    return this.resolveByTimestampThenHash(local, remote, localHash, remoteHash);
  }

  /** Timestamp -> hash fallback chain. */
  private resolveByTimestampThenHash(
    local: UniversalSeed,
    remote: UniversalSeed,
    localHash: string,
    remoteHash: string,
  ): { winner: 'local' | 'remote'; reason: string } {
    const localTs = local.$metadata.created;
    const remoteTs = remote.$metadata.created;

    if (localTs > remoteTs) {
      return { winner: 'local', reason: `newer timestamp (${localTs} > ${remoteTs})` };
    }
    if (remoteTs > localTs) {
      return { winner: 'remote', reason: `newer timestamp (${remoteTs} > ${localTs})` };
    }

    return this.resolveByHash(localHash, remoteHash);
  }

  /** Lexicographic hash comparison — deterministic tiebreaker. */
  private resolveByHash(
    localHash: string,
    remoteHash: string,
  ): { winner: 'local' | 'remote'; reason: string } {
    if (localHash <= remoteHash) {
      return { winner: 'local', reason: `lexicographic hash (${localHash} <= ${remoteHash})` };
    }
    return { winner: 'remote', reason: `lexicographic hash (${remoteHash} < ${localHash})` };
  }
}

// ─────────────────────────────────────────────
// PeerDiscovery — Simulated peer discovery
// ─────────────────────────────────────────────

/**
 * Simulates peer discovery on a local network.
 * Peers announce their presence with metadata; others can discover them.
 */
export class PeerDiscovery {
  private readonly announcements: Map<string, PeerAnnouncement> = new Map();

  /** Announce a peer's presence with metadata. Overwrites any prior announcement. */
  announce(peerId: string, metadata: Record<string, unknown>): void {
    this.announcements.set(peerId, {
      peerId,
      metadata,
      discoveredAt: Date.now(),
    });
  }

  /** Discover all currently announced peers. Returns a snapshot array. */
  discover(): PeerAnnouncement[] {
    return Array.from(this.announcements.values());
  }

  /** Return all active announcements as a map. */
  getAnnouncements(): Map<string, PeerAnnouncement> {
    return new Map(this.announcements);
  }

  /** Remove a peer's announcement. Returns true if it existed. */
  removeAnnouncement(peerId: string): boolean {
    return this.announcements.delete(peerId);
  }
}

// ─────────────────────────────────────────────
// MessageProtocol — Typed channel-based messaging
// ─────────────────────────────────────────────

/**
 * Typed message protocol with channel-based routing and handler registration.
 * Supports dispatch to multiple handlers per channel and maintains a history
 * of all dispatched messages.
 *
 * Built-in channels: 'seed.sync', 'seed.request', 'peer.hello', 'peer.bye'.
 */
export class MessageProtocol {
  private readonly handlers: Map<string, Set<MessageHandler>> = new Map();
  private readonly history: PeerMessage[] = [];
  private messageCounter: number = 0;

  /** Create a new PeerMessage with a deterministic unique ID. */
  createMessage(from: string, to: string, channel: string, payload: unknown): PeerMessage {
    this.messageCounter += 1;
    const idSource = `${from}:${to}:${channel}:${this.messageCounter}`;
    const id = computeQuickHash(idSource);
    return {
      id,
      fromPeer: from,
      toPeer: to,
      channel,
      payload,
      timestamp: Date.now(),
    };
  }

  /**
   * Register a handler for a specific channel.
   * Returns an unsubscribe function that removes the handler.
   */
  registerHandler(channel: string, handler: MessageHandler): () => void {
    let channelHandlers = this.handlers.get(channel);
    if (channelHandlers === undefined) {
      channelHandlers = new Set();
      this.handlers.set(channel, channelHandlers);
    }
    channelHandlers.add(handler);

    return () => {
      const set = this.handlers.get(channel);
      if (set !== undefined) {
        set.delete(handler);
        if (set.size === 0) {
          this.handlers.delete(channel);
        }
      }
    };
  }

  /** Dispatch a message to all handlers registered on its channel. */
  dispatch(message: PeerMessage): void {
    this.history.push(message);
    const channelHandlers = this.handlers.get(message.channel);
    if (channelHandlers !== undefined) {
      for (const handler of channelHandlers) {
        handler(message);
      }
    }
  }

  /** Return the most recent messages, up to the specified limit (default 100). */
  getMessageHistory(limit: number = 100): PeerMessage[] {
    const start = Math.max(0, this.history.length - limit);
    return this.history.slice(start);
  }

  /** Return the total number of messages dispatched. */
  getMessageCount(): number {
    return this.history.length;
  }
}

// ─────────────────────────────────────────────
// BandwidthManager — Throttling and prioritization
// ─────────────────────────────────────────────

/** Default max bandwidth: 1 MB/s (1,048,576 bytes). */
const DEFAULT_MAX_BYTES_PER_SECOND = 1_048_576;

/**
 * Simulates bandwidth throttling and tracks send/receive statistics.
 * Uses a 1-second sliding window to determine whether additional sends
 * are within the configured rate limit.
 */
export class BandwidthManager {
  private readonly maxBytesPerSecond: number;
  private bytesSent: number = 0;
  private bytesReceived: number = 0;
  private windowStart: number = Date.now();
  private windowBytesSent: number = 0;

  constructor(maxBytesPerSecond: number = DEFAULT_MAX_BYTES_PER_SECOND) {
    this.maxBytesPerSecond = maxBytesPerSecond;
  }

  /** Check whether sending the given number of bytes is within the rate limit. */
  canSend(bytes: number): boolean {
    this.refreshWindow();
    return this.windowBytesSent + bytes <= this.maxBytesPerSecond;
  }

  /** Record that the given number of bytes were sent. */
  recordSend(bytes: number): void {
    this.refreshWindow();
    this.bytesSent += bytes;
    this.windowBytesSent += bytes;
  }

  /** Record that the given number of bytes were received. */
  recordReceive(bytes: number): void {
    this.bytesReceived += bytes;
  }

  /** Return current bandwidth statistics. */
  getStats(): BandwidthStats {
    this.refreshWindow();
    return {
      bytesSent: this.bytesSent,
      bytesReceived: this.bytesReceived,
      currentRate: this.windowBytesSent,
      maxRate: this.maxBytesPerSecond,
    };
  }

  /** Reset all counters and the rate window. */
  reset(): void {
    this.bytesSent = 0;
    this.bytesReceived = 0;
    this.windowStart = Date.now();
    this.windowBytesSent = 0;
  }

  /** If more than 1 second has elapsed, reset the sliding window. */
  private refreshWindow(): void {
    const now = Date.now();
    if (now - this.windowStart >= 1000) {
      this.windowStart = now;
      this.windowBytesSent = 0;
    }
  }
}

// ─────────────────────────────────────────────
// P2PEngine — Top-level orchestrator
// ─────────────────────────────────────────────

/**
 * Top-level entry point for the P2P subsystem.
 * Composes PeerManager, SeedSync, ConflictResolver, PeerDiscovery,
 * MessageProtocol, and BandwidthManager into a single unified facade.
 */
export class P2PEngine {
  readonly peers: PeerManager;
  readonly sync: SeedSync;
  readonly conflicts: ConflictResolver;
  readonly discovery: PeerDiscovery;
  readonly protocol: MessageProtocol;
  readonly bandwidth: BandwidthManager;
  private readonly rng: DeterministicRNG;

  constructor(rng?: DeterministicRNG) {
    this.rng = rng ?? new DeterministicRNG('p2p-default');
    this.peers = new PeerManager();
    this.sync = new SeedSync();
    this.conflicts = new ConflictResolver();
    this.discovery = new PeerDiscovery();
    this.protocol = new MessageProtocol();
    this.bandwidth = new BandwidthManager();
  }

  /**
   * Connect to a peer: registers the peer, sets status to 'connected',
   * announces discovery, and dispatches a 'peer.hello' message.
   * Returns the peer with updated status.
   */
  connectToPeer(id: string, name: string): Peer {
    const peer = this.peers.addPeer(id, name);
    this.peers.updateStatus(id, 'connected');
    this.peers.updateLastSeen(id);
    this.discovery.announce(id, { name });

    const helloMsg = this.protocol.createMessage('local', id, 'peer.hello', {
      name,
      timestamp: Date.now(),
    });
    this.protocol.dispatch(helloMsg);

    return this.peers.getPeer(id) ?? peer;
  }

  /**
   * Disconnect a peer: sets status to 'disconnected', removes discovery
   * announcement, and dispatches a 'peer.bye' message.
   * Returns false if the peer was not found.
   */
  disconnectPeer(id: string): boolean {
    const peer = this.peers.getPeer(id);
    if (peer === undefined) {
      return false;
    }

    const byeMsg = this.protocol.createMessage('local', id, 'peer.bye', {
      timestamp: Date.now(),
    });
    this.protocol.dispatch(byeMsg);

    this.peers.updateStatus(id, 'disconnected');
    this.discovery.removeAnnouncement(id);
    return true;
  }

  /**
   * Synchronize seeds with a connected peer.
   *
   * Computes the delta between local sync state and a simulated remote state
   * (empty by default), dispatches sync/request messages on the protocol,
   * and returns the computed delta.
   *
   * Returns an empty delta if the peer is not found or not connected.
   */
  syncWithPeer(peerId: string): SyncDelta {
    const peer = this.peers.getPeer(peerId);
    if (peer === undefined || peer.status !== 'connected') {
      return { toSend: [], toRequest: [] };
    }

    // In a real network, we would request the remote's sync state.
    // Here we simulate an empty remote for protocol demonstration.
    const remoteState = new Map<string, { hash: string; version: number }>();
    const delta = this.sync.computeDelta(remoteState);

    for (const hash of delta.toSend) {
      const seed = this.sync.getSeedByHash(hash);
      if (seed !== undefined) {
        const syncMsg = this.protocol.createMessage('local', peerId, 'seed.sync', {
          seed,
          hash,
        });
        this.protocol.dispatch(syncMsg);

        const estimatedBytes = JSON.stringify(seed).length;
        if (this.bandwidth.canSend(estimatedBytes)) {
          this.bandwidth.recordSend(estimatedBytes);
        }
      }
    }

    for (const hash of delta.toRequest) {
      const requestMsg = this.protocol.createMessage('local', peerId, 'seed.request', {
        hash,
      });
      this.protocol.dispatch(requestMsg);
    }

    this.peers.updateLastSeen(peerId);
    peer.seedCount = this.sync.getLocalSeeds().length;

    return delta;
  }
}
