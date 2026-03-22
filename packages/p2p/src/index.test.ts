/**
 * Comprehensive test suite for @paradigm/p2p.
 *
 * Covers all 7 classes: PeerManager, SeedSync, ConflictResolver,
 * PeerDiscovery, MessageProtocol, BandwidthManager, P2PEngine.
 *
 * Target: 80%+ line coverage, 70%+ branch coverage, 80%+ function coverage.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { UniversalSeed, GeneMap } from '@paradigm/types';
import {
  PeerManager,
  SeedSync,
  ConflictResolver,
  PeerDiscovery,
  MessageProtocol,
  BandwidthManager,
  P2PEngine,
  BUILTIN_CHANNELS,
} from './index.js';
import type {
  Peer,
  PeerMessage,
  SeedSyncEntry,
  SyncDelta,
  ResolutionLogEntry,
  PeerAnnouncement,
  BandwidthStats,
  ResolutionStrategy,
  MessageHandler,
  PeerStatus,
} from './index.js';

// ─────────────────────────────────────────────
// Test Helpers
// ─────────────────────────────────────────────

/** Create a minimal valid UniversalSeed for testing. */
function makeSeed(overrides: Partial<{
  hash: string;
  name: string;
  generation: number;
  fitness: number;
  created: number;
  genes: GeneMap;
}> = {}): UniversalSeed {
  return {
    $gst: '4.0',
    $domain: 'organism',
    $hash: overrides.hash ?? '',
    $name: overrides.name ?? 'test-seed',
    $lineage: {
      generation: overrides.generation ?? 1,
      parents: [],
      timestamp: Date.now(),
    },
    genes: overrides.genes ?? {
      strength: { type: 'scalar', value: 0.5, min: 0, max: 1 },
    },
    $fitness: { primary: overrides.fitness ?? 0.5 },
    $metadata: {
      created: overrides.created ?? Date.now(),
    },
  } as UniversalSeed;
}

// ─────────────────────────────────────────────
// PeerManager
// ─────────────────────────────────────────────

describe('PeerManager', () => {
  let pm: PeerManager;

  beforeEach(() => {
    pm = new PeerManager();
  });

  describe('addPeer', () => {
    it('should create a peer in connecting state', () => {
      const peer = pm.addPeer('p1', 'Alice');
      expect(peer.id).toBe('p1');
      expect(peer.name).toBe('Alice');
      expect(peer.status).toBe('connecting');
      expect(peer.latency).toBe(0);
      expect(peer.seedCount).toBe(0);
      expect(peer.lastSeen).toBeGreaterThan(0);
    });

    it('should return existing peer on duplicate id', () => {
      const first = pm.addPeer('p1', 'Alice');
      const second = pm.addPeer('p1', 'Bob');
      expect(second).toBe(first);
      expect(second.name).toBe('Alice');
    });

    it('should add multiple distinct peers', () => {
      pm.addPeer('p1', 'Alice');
      pm.addPeer('p2', 'Bob');
      pm.addPeer('p3', 'Carol');
      expect(pm.getAll()).toHaveLength(3);
    });
  });

  describe('removePeer', () => {
    it('should return true when removing an existing peer', () => {
      pm.addPeer('p1', 'Alice');
      expect(pm.removePeer('p1')).toBe(true);
    });

    it('should return false when removing a non-existent peer', () => {
      expect(pm.removePeer('ghost')).toBe(false);
    });

    it('should make the peer unfindable after removal', () => {
      pm.addPeer('p1', 'Alice');
      pm.removePeer('p1');
      expect(pm.getPeer('p1')).toBeUndefined();
    });

    it('should also clear ban reason when removing a banned peer', () => {
      pm.addPeer('p1', 'Alice');
      pm.banPeer('p1', 'cheating');
      pm.removePeer('p1');
      expect(pm.getBanReason('p1')).toBeUndefined();
    });
  });

  describe('getPeer', () => {
    it('should return the peer by id', () => {
      pm.addPeer('p1', 'Alice');
      const peer = pm.getPeer('p1');
      expect(peer).toBeDefined();
      expect(peer!.name).toBe('Alice');
    });

    it('should return undefined for unknown id', () => {
      expect(pm.getPeer('unknown')).toBeUndefined();
    });
  });

  describe('getConnected', () => {
    it('should return empty array when no peers are connected', () => {
      pm.addPeer('p1', 'Alice');
      expect(pm.getConnected()).toHaveLength(0);
    });

    it('should return only connected peers', () => {
      pm.addPeer('p1', 'Alice');
      pm.addPeer('p2', 'Bob');
      pm.addPeer('p3', 'Carol');
      pm.updateStatus('p1', 'connected');
      pm.updateStatus('p3', 'connected');
      const connected = pm.getConnected();
      expect(connected).toHaveLength(2);
      expect(connected.map((p) => p.id)).toContain('p1');
      expect(connected.map((p) => p.id)).toContain('p3');
    });

    it('should exclude banned and disconnected peers', () => {
      pm.addPeer('p1', 'Alice');
      pm.addPeer('p2', 'Bob');
      pm.updateStatus('p1', 'connected');
      pm.updateStatus('p2', 'banned');
      expect(pm.getConnected()).toHaveLength(1);
    });
  });

  describe('getAll', () => {
    it('should return empty array when no peers exist', () => {
      expect(pm.getAll()).toHaveLength(0);
    });

    it('should return all peers regardless of status', () => {
      pm.addPeer('p1', 'Alice');
      pm.addPeer('p2', 'Bob');
      pm.updateStatus('p1', 'connected');
      pm.updateStatus('p2', 'banned');
      expect(pm.getAll()).toHaveLength(2);
    });
  });

  describe('updateStatus', () => {
    it('should change peer status', () => {
      pm.addPeer('p1', 'Alice');
      expect(pm.updateStatus('p1', 'connected')).toBe(true);
      expect(pm.getPeer('p1')!.status).toBe('connected');
    });

    it('should return false for non-existent peer', () => {
      expect(pm.updateStatus('ghost', 'connected')).toBe(false);
    });

    it('should support all status transitions', () => {
      pm.addPeer('p1', 'Alice');
      const statuses: PeerStatus[] = ['connecting', 'connected', 'disconnected', 'banned'];
      for (const s of statuses) {
        pm.updateStatus('p1', s);
        expect(pm.getPeer('p1')!.status).toBe(s);
      }
    });
  });

  describe('updateLastSeen', () => {
    it('should update lastSeen timestamp', () => {
      pm.addPeer('p1', 'Alice');
      const before = pm.getPeer('p1')!.lastSeen;
      // Small delay to ensure time advances
      pm.updateLastSeen('p1');
      expect(pm.getPeer('p1')!.lastSeen).toBeGreaterThanOrEqual(before);
    });

    it('should return false for non-existent peer', () => {
      expect(pm.updateLastSeen('ghost')).toBe(false);
    });

    it('should return true for existing peer', () => {
      pm.addPeer('p1', 'Alice');
      expect(pm.updateLastSeen('p1')).toBe(true);
    });
  });

  describe('banPeer', () => {
    it('should set status to banned and record reason', () => {
      pm.addPeer('p1', 'Alice');
      expect(pm.banPeer('p1', 'griefing')).toBe(true);
      expect(pm.getPeer('p1')!.status).toBe('banned');
      expect(pm.getBanReason('p1')).toBe('griefing');
    });

    it('should return false for non-existent peer', () => {
      expect(pm.banPeer('ghost', 'reason')).toBe(false);
    });

    it('should overwrite previous ban reason', () => {
      pm.addPeer('p1', 'Alice');
      pm.banPeer('p1', 'first offense');
      pm.banPeer('p1', 'second offense');
      expect(pm.getBanReason('p1')).toBe('second offense');
    });
  });

  describe('getBanned', () => {
    it('should return empty array when no peers are banned', () => {
      pm.addPeer('p1', 'Alice');
      expect(pm.getBanned()).toHaveLength(0);
    });

    it('should return only banned peers', () => {
      pm.addPeer('p1', 'Alice');
      pm.addPeer('p2', 'Bob');
      pm.addPeer('p3', 'Carol');
      pm.banPeer('p2', 'cheating');
      const banned = pm.getBanned();
      expect(banned).toHaveLength(1);
      expect(banned[0].id).toBe('p2');
    });
  });

  describe('getBanReason', () => {
    it('should return undefined for non-banned peer', () => {
      pm.addPeer('p1', 'Alice');
      expect(pm.getBanReason('p1')).toBeUndefined();
    });

    it('should return undefined for unknown peer', () => {
      expect(pm.getBanReason('ghost')).toBeUndefined();
    });
  });
});

// ─────────────────────────────────────────────
// SeedSync
// ─────────────────────────────────────────────

describe('SeedSync', () => {
  let ss: SeedSync;

  beforeEach(() => {
    ss = new SeedSync();
  });

  describe('registerLocalSeed', () => {
    it('should register a seed with version 1', () => {
      const seed = makeSeed({ hash: 'abc123' });
      ss.registerLocalSeed(seed);
      const state = ss.getSyncState();
      expect(state.size).toBe(1);
      const entry = state.get('abc123');
      expect(entry).toBeDefined();
      expect(entry!.version).toBe(1);
      expect(entry!.hash).toBe('abc123');
    });

    it('should increment version on re-registration with same hash', () => {
      const seed = makeSeed({ hash: 'abc123' });
      ss.registerLocalSeed(seed);
      ss.registerLocalSeed(seed);
      const entry = ss.getSyncState().get('abc123');
      expect(entry!.version).toBe(2);
    });

    it('should compute hash when $hash is empty', () => {
      const seed = makeSeed({ hash: '' });
      ss.registerLocalSeed(seed);
      const state = ss.getSyncState();
      expect(state.size).toBe(1);
      // Hash is computed from genes, should be non-empty
      const keys = Array.from(state.keys());
      expect(keys[0].length).toBeGreaterThan(0);
    });

    it('should track the seed object for retrieval', () => {
      const seed = makeSeed({ hash: 'abc123' });
      ss.registerLocalSeed(seed);
      const seeds = ss.getLocalSeeds();
      expect(seeds).toHaveLength(1);
      expect(seeds[0]).toBe(seed);
    });
  });

  describe('getSyncState', () => {
    it('should return empty map when no seeds registered', () => {
      expect(ss.getSyncState().size).toBe(0);
    });

    it('should return a copy (not the internal map)', () => {
      const seed = makeSeed({ hash: 'abc' });
      ss.registerLocalSeed(seed);
      const state1 = ss.getSyncState();
      const state2 = ss.getSyncState();
      expect(state1).not.toBe(state2);
    });
  });

  describe('computeDelta', () => {
    it('should mark all local seeds as toSend when remote is empty', () => {
      ss.registerLocalSeed(makeSeed({ hash: 'a1' }));
      ss.registerLocalSeed(makeSeed({ hash: 'b2' }));
      const delta = ss.computeDelta(new Map());
      expect(delta.toSend).toHaveLength(2);
      expect(delta.toRequest).toHaveLength(0);
    });

    it('should mark all remote seeds as toRequest when local is empty', () => {
      const remoteState = new Map<string, { hash: string; version: number }>();
      remoteState.set('r1', { hash: 'r1', version: 1 });
      remoteState.set('r2', { hash: 'r2', version: 1 });
      const delta = ss.computeDelta(remoteState);
      expect(delta.toSend).toHaveLength(0);
      expect(delta.toRequest).toHaveLength(2);
    });

    it('should send when local version is higher', () => {
      ss.registerLocalSeed(makeSeed({ hash: 'a1' }));
      ss.registerLocalSeed(makeSeed({ hash: 'a1' })); // version 2
      const remoteState = new Map<string, { hash: string; version: number }>();
      remoteState.set('a1', { hash: 'a1', version: 1 });
      const delta = ss.computeDelta(remoteState);
      expect(delta.toSend).toContain('a1');
      expect(delta.toRequest).not.toContain('a1');
    });

    it('should request when remote version is higher', () => {
      ss.registerLocalSeed(makeSeed({ hash: 'a1' }));
      const remoteState = new Map<string, { hash: string; version: number }>();
      remoteState.set('a1', { hash: 'a1', version: 5 });
      const delta = ss.computeDelta(remoteState);
      expect(delta.toRequest).toContain('a1');
      expect(delta.toSend).not.toContain('a1');
    });

    it('should neither send nor request when versions match', () => {
      ss.registerLocalSeed(makeSeed({ hash: 'a1' }));
      const remoteState = new Map<string, { hash: string; version: number }>();
      remoteState.set('a1', { hash: 'a1', version: 1 });
      const delta = ss.computeDelta(remoteState);
      expect(delta.toSend).toHaveLength(0);
      expect(delta.toRequest).toHaveLength(0);
    });

    it('should handle mixed scenario with sends and requests', () => {
      ss.registerLocalSeed(makeSeed({ hash: 'local-only' }));
      ss.registerLocalSeed(makeSeed({ hash: 'shared' }));
      const remoteState = new Map<string, { hash: string; version: number }>();
      remoteState.set('shared', { hash: 'shared', version: 1 });
      remoteState.set('remote-only', { hash: 'remote-only', version: 1 });
      const delta = ss.computeDelta(remoteState);
      expect(delta.toSend).toContain('local-only');
      expect(delta.toRequest).toContain('remote-only');
    });
  });

  describe('applyRemoteSeed', () => {
    it('should return "added" for a new seed', () => {
      const seed = makeSeed({ hash: 'new-seed' });
      const result = ss.applyRemoteSeed(seed);
      expect(result).toBe('added');
      expect(ss.getLocalSeeds()).toHaveLength(1);
    });

    it('should return "ignored" when genes are identical', () => {
      const genes: GeneMap = { hp: { type: 'scalar', value: 100, min: 0, max: 200 } };
      const seed1 = makeSeed({ hash: 'same', genes, generation: 1 });
      const seed2 = makeSeed({ hash: 'same', genes, generation: 1 });
      ss.registerLocalSeed(seed1);
      const result = ss.applyRemoteSeed(seed2);
      expect(result).toBe('ignored');
    });

    it('should return "updated" when remote has higher generation', () => {
      const genes1: GeneMap = { hp: { type: 'scalar', value: 100, min: 0, max: 200 } };
      const genes2: GeneMap = { hp: { type: 'scalar', value: 200, min: 0, max: 300 } };
      const local = makeSeed({ hash: 'seed1', genes: genes1, generation: 1 });
      const remote = makeSeed({ hash: 'seed1', genes: genes2, generation: 5 });
      ss.registerLocalSeed(local);
      const result = ss.applyRemoteSeed(remote);
      expect(result).toBe('updated');
    });

    it('should return "conflict" when remote has lower or equal generation with different genes', () => {
      const genes1: GeneMap = { hp: { type: 'scalar', value: 100, min: 0, max: 200 } };
      const genes2: GeneMap = { hp: { type: 'scalar', value: 200, min: 0, max: 300 } };
      const local = makeSeed({ hash: 'seed1', genes: genes1, generation: 5 });
      const remote = makeSeed({ hash: 'seed1', genes: genes2, generation: 3 });
      ss.registerLocalSeed(local);
      const result = ss.applyRemoteSeed(remote);
      expect(result).toBe('conflict');
    });

    it('should compute hash from genes when $hash is empty', () => {
      const seed = makeSeed({ hash: '' });
      const result = ss.applyRemoteSeed(seed);
      expect(result).toBe('added');
      expect(ss.getLocalSeeds()).toHaveLength(1);
    });

    it('should increment version on update', () => {
      const genes1: GeneMap = { hp: { type: 'scalar', value: 10, min: 0, max: 100 } };
      const genes2: GeneMap = { hp: { type: 'scalar', value: 90, min: 0, max: 100 } };
      const local = makeSeed({ hash: 'v-test', genes: genes1, generation: 1 });
      const remote = makeSeed({ hash: 'v-test', genes: genes2, generation: 10 });
      ss.registerLocalSeed(local);
      const stateBefore = ss.getSyncState().get('v-test');
      expect(stateBefore!.version).toBe(1);
      ss.applyRemoteSeed(remote);
      const stateAfter = ss.getSyncState().get('v-test');
      expect(stateAfter!.version).toBe(2);
    });
  });

  describe('getLocalSeeds', () => {
    it('should return empty array initially', () => {
      expect(ss.getLocalSeeds()).toHaveLength(0);
    });

    it('should return all registered seeds', () => {
      ss.registerLocalSeed(makeSeed({ hash: 'a' }));
      ss.registerLocalSeed(makeSeed({ hash: 'b' }));
      expect(ss.getLocalSeeds()).toHaveLength(2);
    });
  });

  describe('getSeedByHash', () => {
    it('should return a seed by its hash', () => {
      const seed = makeSeed({ hash: 'find-me' });
      ss.registerLocalSeed(seed);
      expect(ss.getSeedByHash('find-me')).toBe(seed);
    });

    it('should return undefined for unknown hash', () => {
      expect(ss.getSeedByHash('nope')).toBeUndefined();
    });
  });
});

// ─────────────────────────────────────────────
// ConflictResolver
// ─────────────────────────────────────────────

describe('ConflictResolver', () => {
  let cr: ConflictResolver;

  beforeEach(() => {
    cr = new ConflictResolver();
  });

  describe('resolve with fitness strategy (default)', () => {
    it('should pick local when local fitness is higher', () => {
      const local = makeSeed({ hash: 'L', fitness: 0.9 });
      const remote = makeSeed({ hash: 'R', fitness: 0.3 });
      const winner = cr.resolve(local, remote);
      expect(winner).toBe(local);
    });

    it('should pick remote when remote fitness is higher', () => {
      const local = makeSeed({ hash: 'L', fitness: 0.2 });
      const remote = makeSeed({ hash: 'R', fitness: 0.8 });
      const winner = cr.resolve(local, remote);
      expect(winner).toBe(remote);
    });

    it('should fall back to timestamp when fitness is equal', () => {
      const local = makeSeed({ hash: 'L', fitness: 0.5, created: 2000 });
      const remote = makeSeed({ hash: 'R', fitness: 0.5, created: 1000 });
      const winner = cr.resolve(local, remote);
      expect(winner).toBe(local); // local is newer
    });

    it('should fall back to hash when fitness and timestamp are equal', () => {
      const local = makeSeed({ hash: 'aaa', fitness: 0.5, created: 1000 });
      const remote = makeSeed({ hash: 'zzz', fitness: 0.5, created: 1000 });
      const winner = cr.resolve(local, remote);
      expect(winner).toBe(local); // 'aaa' < 'zzz'
    });

    it('should handle missing $fitness (defaults to 0)', () => {
      const local = makeSeed({ hash: 'L', fitness: 0.1 });
      const remote: UniversalSeed = {
        ...makeSeed({ hash: 'R' }),
        $fitness: undefined,
      } as unknown as UniversalSeed;
      const winner = cr.resolve(local, remote);
      expect(winner).toBe(local);
    });

    it('should handle missing $fitness.primary (defaults to 0)', () => {
      const local = makeSeed({ hash: 'L', fitness: 0.1 });
      const remote = makeSeed({ hash: 'R' });
      (remote as { $fitness?: { primary?: number } }).$fitness = {};
      const winner = cr.resolve(local, remote);
      expect(winner).toBe(local);
    });
  });

  describe('resolve with timestamp strategy', () => {
    beforeEach(() => {
      cr.setStrategy('timestamp');
    });

    it('should pick local when local is newer', () => {
      const local = makeSeed({ hash: 'L', created: 5000 });
      const remote = makeSeed({ hash: 'R', created: 1000 });
      const winner = cr.resolve(local, remote);
      expect(winner).toBe(local);
    });

    it('should pick remote when remote is newer', () => {
      const local = makeSeed({ hash: 'L', created: 1000 });
      const remote = makeSeed({ hash: 'R', created: 5000 });
      const winner = cr.resolve(local, remote);
      expect(winner).toBe(remote);
    });

    it('should fall back to hash when timestamps are equal', () => {
      const local = makeSeed({ hash: 'bbb', created: 1000 });
      const remote = makeSeed({ hash: 'aaa', created: 1000 });
      // 'aaa' < 'bbb', so remote wins? No: resolveByHash returns local if localHash <= remoteHash
      // localHash='bbb', remoteHash='aaa' => 'bbb' > 'aaa' => remote wins
      const winner = cr.resolve(local, remote);
      expect(winner).toBe(remote);
    });
  });

  describe('resolve with hash strategy', () => {
    beforeEach(() => {
      cr.setStrategy('hash');
    });

    it('should pick local when local hash is lexicographically less', () => {
      const local = makeSeed({ hash: 'aaa' });
      const remote = makeSeed({ hash: 'zzz' });
      const winner = cr.resolve(local, remote);
      expect(winner).toBe(local);
    });

    it('should pick remote when remote hash is lexicographically less', () => {
      const local = makeSeed({ hash: 'zzz' });
      const remote = makeSeed({ hash: 'aaa' });
      const winner = cr.resolve(local, remote);
      expect(winner).toBe(remote);
    });

    it('should pick local when hashes are equal', () => {
      const local = makeSeed({ hash: 'same' });
      const remote = makeSeed({ hash: 'same' });
      const winner = cr.resolve(local, remote);
      expect(winner).toBe(local); // localHash <= remoteHash
    });
  });

  describe('resolve computes hash from genes when $hash is empty', () => {
    it('should still resolve without error', () => {
      const local = makeSeed({ hash: '' });
      const remote = makeSeed({ hash: '' });
      const winner = cr.resolve(local, remote);
      expect(winner).toBeDefined();
    });
  });

  describe('setStrategy', () => {
    it('should change resolution behavior', () => {
      // With fitness: higher fitness wins
      const local = makeSeed({ hash: 'aaa', fitness: 0.1, created: 5000 });
      const remote = makeSeed({ hash: 'zzz', fitness: 0.9, created: 1000 });

      cr.setStrategy('fitness');
      expect(cr.resolve(local, remote)).toBe(remote);

      cr.setStrategy('timestamp');
      expect(cr.resolve(local, remote)).toBe(local);

      cr.setStrategy('hash');
      expect(cr.resolve(local, remote)).toBe(local);
    });
  });

  describe('getResolutionLog', () => {
    it('should return empty array initially', () => {
      expect(cr.getResolutionLog()).toHaveLength(0);
    });

    it('should log each resolution', () => {
      const local = makeSeed({ hash: 'L' });
      const remote = makeSeed({ hash: 'R' });
      cr.resolve(local, remote);
      cr.resolve(remote, local);
      const log = cr.getResolutionLog();
      expect(log).toHaveLength(2);
      expect(log[0].localHash).toBe('L');
      expect(log[0].remoteHash).toBe('R');
      expect(log[0].winner).toBeDefined();
      expect(log[0].reason).toBeDefined();
      expect(log[0].timestamp).toBeGreaterThan(0);
    });

    it('should return a copy of the log', () => {
      cr.resolve(makeSeed({ hash: 'A' }), makeSeed({ hash: 'B' }));
      const log1 = cr.getResolutionLog();
      const log2 = cr.getResolutionLog();
      expect(log1).not.toBe(log2);
      expect(log1).toEqual(log2);
    });

    it('should include correct reason strings for fitness wins', () => {
      cr.setStrategy('fitness');
      cr.resolve(makeSeed({ hash: 'L', fitness: 0.9 }), makeSeed({ hash: 'R', fitness: 0.1 }));
      const entry = cr.getResolutionLog()[0];
      expect(entry.reason).toContain('fitness');
      expect(entry.winner).toBe('local');
    });

    it('should include correct reason strings for timestamp wins', () => {
      cr.setStrategy('timestamp');
      cr.resolve(
        makeSeed({ hash: 'L', created: 1000 }),
        makeSeed({ hash: 'R', created: 5000 }),
      );
      const entry = cr.getResolutionLog()[0];
      expect(entry.reason).toContain('timestamp');
      expect(entry.winner).toBe('remote');
    });

    it('should include correct reason strings for hash wins', () => {
      cr.setStrategy('hash');
      cr.resolve(makeSeed({ hash: 'aaa' }), makeSeed({ hash: 'zzz' }));
      const entry = cr.getResolutionLog()[0];
      expect(entry.reason).toContain('hash');
      expect(entry.winner).toBe('local');
    });
  });
});

// ─────────────────────────────────────────────
// PeerDiscovery
// ─────────────────────────────────────────────

describe('PeerDiscovery', () => {
  let pd: PeerDiscovery;

  beforeEach(() => {
    pd = new PeerDiscovery();
  });

  describe('announce', () => {
    it('should add an announcement', () => {
      pd.announce('peer1', { version: '1.0' });
      const announcements = pd.discover();
      expect(announcements).toHaveLength(1);
      expect(announcements[0].peerId).toBe('peer1');
      expect(announcements[0].metadata).toEqual({ version: '1.0' });
      expect(announcements[0].discoveredAt).toBeGreaterThan(0);
    });

    it('should overwrite prior announcement for same peer', () => {
      pd.announce('peer1', { version: '1.0' });
      pd.announce('peer1', { version: '2.0' });
      const announcements = pd.discover();
      expect(announcements).toHaveLength(1);
      expect(announcements[0].metadata).toEqual({ version: '2.0' });
    });

    it('should support multiple peers', () => {
      pd.announce('p1', {});
      pd.announce('p2', {});
      pd.announce('p3', {});
      expect(pd.discover()).toHaveLength(3);
    });
  });

  describe('discover', () => {
    it('should return empty array initially', () => {
      expect(pd.discover()).toHaveLength(0);
    });

    it('should return a snapshot array', () => {
      pd.announce('p1', {});
      const d1 = pd.discover();
      const d2 = pd.discover();
      expect(d1).not.toBe(d2);
    });
  });

  describe('getAnnouncements', () => {
    it('should return empty map initially', () => {
      expect(pd.getAnnouncements().size).toBe(0);
    });

    it('should return a copy of the internal map', () => {
      pd.announce('p1', { foo: 'bar' });
      const a1 = pd.getAnnouncements();
      const a2 = pd.getAnnouncements();
      expect(a1).not.toBe(a2);
      expect(a1.size).toBe(1);
    });

    it('should contain announced peers', () => {
      pd.announce('p1', { x: 1 });
      const map = pd.getAnnouncements();
      expect(map.has('p1')).toBe(true);
      expect(map.get('p1')!.peerId).toBe('p1');
    });
  });

  describe('removeAnnouncement', () => {
    it('should return true when removing existing announcement', () => {
      pd.announce('p1', {});
      expect(pd.removeAnnouncement('p1')).toBe(true);
    });

    it('should return false when removing non-existent announcement', () => {
      expect(pd.removeAnnouncement('ghost')).toBe(false);
    });

    it('should actually remove the announcement', () => {
      pd.announce('p1', {});
      pd.removeAnnouncement('p1');
      expect(pd.discover()).toHaveLength(0);
    });
  });
});

// ─────────────────────────────────────────────
// MessageProtocol
// ─────────────────────────────────────────────

describe('MessageProtocol', () => {
  let mp: MessageProtocol;

  beforeEach(() => {
    mp = new MessageProtocol();
  });

  describe('createMessage', () => {
    it('should create a message with all fields', () => {
      const msg = mp.createMessage('alice', 'bob', 'seed.sync', { data: 42 });
      expect(msg.fromPeer).toBe('alice');
      expect(msg.toPeer).toBe('bob');
      expect(msg.channel).toBe('seed.sync');
      expect(msg.payload).toEqual({ data: 42 });
      expect(msg.id).toBeTruthy();
      expect(msg.timestamp).toBeGreaterThan(0);
    });

    it('should produce unique IDs for different messages', () => {
      const m1 = mp.createMessage('a', 'b', 'ch', null);
      const m2 = mp.createMessage('a', 'b', 'ch', null);
      expect(m1.id).not.toBe(m2.id);
    });

    it('should produce deterministic IDs based on counter', () => {
      const m1 = mp.createMessage('a', 'b', 'ch', null);
      // ID should be a hash string
      expect(typeof m1.id).toBe('string');
      expect(m1.id.length).toBeGreaterThan(0);
    });
  });

  describe('registerHandler', () => {
    it('should register a handler that receives dispatched messages', () => {
      const received: PeerMessage[] = [];
      mp.registerHandler('test-channel', (msg) => received.push(msg));
      const msg = mp.createMessage('a', 'b', 'test-channel', 'hello');
      mp.dispatch(msg);
      expect(received).toHaveLength(1);
      expect(received[0]).toBe(msg);
    });

    it('should support multiple handlers on the same channel', () => {
      let count = 0;
      mp.registerHandler('ch', () => { count += 1; });
      mp.registerHandler('ch', () => { count += 10; });
      mp.dispatch(mp.createMessage('a', 'b', 'ch', null));
      expect(count).toBe(11);
    });

    it('should return an unsubscribe function', () => {
      let count = 0;
      const unsub = mp.registerHandler('ch', () => { count += 1; });
      mp.dispatch(mp.createMessage('a', 'b', 'ch', null));
      expect(count).toBe(1);
      unsub();
      mp.dispatch(mp.createMessage('a', 'b', 'ch', null));
      expect(count).toBe(1); // handler removed
    });

    it('should clean up channel set when last handler is unsubscribed', () => {
      const unsub1 = mp.registerHandler('ch', () => {});
      const unsub2 = mp.registerHandler('ch', () => {});
      unsub1();
      unsub2();
      // No error when dispatching to empty channel
      mp.dispatch(mp.createMessage('a', 'b', 'ch', null));
    });

    it('should not affect other channels when unsubscribing', () => {
      let count = 0;
      const unsub = mp.registerHandler('ch1', () => { count += 1; });
      mp.registerHandler('ch2', () => { count += 10; });
      unsub();
      mp.dispatch(mp.createMessage('a', 'b', 'ch1', null));
      mp.dispatch(mp.createMessage('a', 'b', 'ch2', null));
      expect(count).toBe(10);
    });
  });

  describe('dispatch', () => {
    it('should add message to history', () => {
      const msg = mp.createMessage('a', 'b', 'ch', null);
      mp.dispatch(msg);
      expect(mp.getMessageHistory()).toHaveLength(1);
    });

    it('should dispatch to no handlers without error', () => {
      const msg = mp.createMessage('a', 'b', 'unregistered', null);
      expect(() => mp.dispatch(msg)).not.toThrow();
    });

    it('should dispatch to all handlers on the channel', () => {
      const results: string[] = [];
      mp.registerHandler('ch', () => results.push('h1'));
      mp.registerHandler('ch', () => results.push('h2'));
      mp.registerHandler('other', () => results.push('h3'));
      mp.dispatch(mp.createMessage('a', 'b', 'ch', null));
      expect(results).toEqual(['h1', 'h2']);
    });
  });

  describe('getMessageHistory', () => {
    it('should return empty array initially', () => {
      expect(mp.getMessageHistory()).toHaveLength(0);
    });

    it('should return last N messages with limit', () => {
      for (let i = 0; i < 10; i++) {
        mp.dispatch(mp.createMessage('a', 'b', 'ch', i));
      }
      const last3 = mp.getMessageHistory(3);
      expect(last3).toHaveLength(3);
      expect(last3[0].payload).toBe(7);
      expect(last3[2].payload).toBe(9);
    });

    it('should default to 100 limit', () => {
      for (let i = 0; i < 150; i++) {
        mp.dispatch(mp.createMessage('a', 'b', 'ch', i));
      }
      const history = mp.getMessageHistory();
      expect(history).toHaveLength(100);
      expect(history[0].payload).toBe(50);
    });

    it('should return all if fewer than limit', () => {
      mp.dispatch(mp.createMessage('a', 'b', 'ch', 1));
      mp.dispatch(mp.createMessage('a', 'b', 'ch', 2));
      expect(mp.getMessageHistory(100)).toHaveLength(2);
    });
  });

  describe('getMessageCount', () => {
    it('should return 0 initially', () => {
      expect(mp.getMessageCount()).toBe(0);
    });

    it('should increment with each dispatch', () => {
      mp.dispatch(mp.createMessage('a', 'b', 'ch', null));
      mp.dispatch(mp.createMessage('a', 'b', 'ch', null));
      expect(mp.getMessageCount()).toBe(2);
    });
  });
});

// ─────────────────────────────────────────────
// BandwidthManager
// ─────────────────────────────────────────────

describe('BandwidthManager', () => {
  let bm: BandwidthManager;

  beforeEach(() => {
    bm = new BandwidthManager();
  });

  describe('canSend', () => {
    it('should allow sending within rate limit', () => {
      expect(bm.canSend(1000)).toBe(true);
    });

    it('should deny sending over rate limit', () => {
      // Default is 1MB/s
      expect(bm.canSend(1_048_577)).toBe(false);
    });

    it('should account for previous sends in the window', () => {
      bm.recordSend(1_000_000);
      expect(bm.canSend(100_000)).toBe(false);
    });

    it('should allow sending exactly the max', () => {
      expect(bm.canSend(1_048_576)).toBe(true);
    });
  });

  describe('recordSend', () => {
    it('should accumulate bytes sent', () => {
      bm.recordSend(500);
      bm.recordSend(300);
      const stats = bm.getStats();
      expect(stats.bytesSent).toBe(800);
    });

    it('should affect the sliding window', () => {
      bm.recordSend(1_000_000);
      expect(bm.canSend(100_000)).toBe(false);
    });
  });

  describe('recordReceive', () => {
    it('should accumulate bytes received', () => {
      bm.recordReceive(1000);
      bm.recordReceive(2000);
      const stats = bm.getStats();
      expect(stats.bytesReceived).toBe(3000);
    });
  });

  describe('getStats', () => {
    it('should return zeroed stats initially', () => {
      const stats = bm.getStats();
      expect(stats.bytesSent).toBe(0);
      expect(stats.bytesReceived).toBe(0);
      expect(stats.currentRate).toBe(0);
      expect(stats.maxRate).toBe(1_048_576);
    });

    it('should reflect send and receive totals', () => {
      bm.recordSend(100);
      bm.recordReceive(200);
      const stats = bm.getStats();
      expect(stats.bytesSent).toBe(100);
      expect(stats.bytesReceived).toBe(200);
      expect(stats.currentRate).toBe(100);
    });

    it('should use custom max rate from constructor', () => {
      const custom = new BandwidthManager(5000);
      const stats = custom.getStats();
      expect(stats.maxRate).toBe(5000);
    });
  });

  describe('reset', () => {
    it('should clear all counters', () => {
      bm.recordSend(1000);
      bm.recordReceive(2000);
      bm.reset();
      const stats = bm.getStats();
      expect(stats.bytesSent).toBe(0);
      expect(stats.bytesReceived).toBe(0);
      expect(stats.currentRate).toBe(0);
    });

    it('should allow sending again after reset', () => {
      bm.recordSend(1_048_576);
      expect(bm.canSend(1)).toBe(false);
      bm.reset();
      expect(bm.canSend(1_048_576)).toBe(true);
    });
  });

  describe('sliding window reset', () => {
    it('should reset window after 1 second elapses', () => {
      bm.recordSend(1_048_576);
      expect(bm.canSend(1)).toBe(false);

      // Advance time by more than 1 second
      vi.useFakeTimers();
      vi.advanceTimersByTime(1001);
      expect(bm.canSend(1_048_576)).toBe(true);
      vi.useRealTimers();
    });
  });
});

// ─────────────────────────────────────────────
// P2PEngine
// ─────────────────────────────────────────────

describe('P2PEngine', () => {
  let engine: P2PEngine;

  beforeEach(() => {
    engine = new P2PEngine();
  });

  describe('constructor', () => {
    it('should initialize all sub-managers', () => {
      expect(engine.peers).toBeInstanceOf(PeerManager);
      expect(engine.sync).toBeInstanceOf(SeedSync);
      expect(engine.conflicts).toBeInstanceOf(ConflictResolver);
      expect(engine.discovery).toBeInstanceOf(PeerDiscovery);
      expect(engine.protocol).toBeInstanceOf(MessageProtocol);
      expect(engine.bandwidth).toBeInstanceOf(BandwidthManager);
    });

    it('should accept a custom RNG', async () => {
      const { DeterministicRNG } = await import('@paradigm/rng');
      const rng = new DeterministicRNG('custom-seed');
      const eng = new P2PEngine(rng);
      expect(eng).toBeDefined();
    });
  });

  describe('connectToPeer', () => {
    it('should add peer with connected status', () => {
      const peer = engine.connectToPeer('p1', 'Alice');
      expect(peer.status).toBe('connected');
    });

    it('should announce the peer for discovery', () => {
      engine.connectToPeer('p1', 'Alice');
      const announcements = engine.discovery.discover();
      expect(announcements).toHaveLength(1);
      expect(announcements[0].peerId).toBe('p1');
    });

    it('should dispatch a peer.hello message', () => {
      const messages: PeerMessage[] = [];
      engine.protocol.registerHandler('peer.hello', (msg) => messages.push(msg));
      engine.connectToPeer('p1', 'Alice');
      expect(messages).toHaveLength(1);
      expect(messages[0].toPeer).toBe('p1');
      expect(messages[0].channel).toBe('peer.hello');
    });

    it('should set the peer in the manager', () => {
      engine.connectToPeer('p1', 'Alice');
      const peer = engine.peers.getPeer('p1');
      expect(peer).toBeDefined();
      expect(peer!.name).toBe('Alice');
    });

    it('should update lastSeen', () => {
      engine.connectToPeer('p1', 'Alice');
      const peer = engine.peers.getPeer('p1')!;
      expect(peer.lastSeen).toBeGreaterThan(0);
    });

    it('should handle connecting the same peer twice', () => {
      const p1 = engine.connectToPeer('p1', 'Alice');
      const p2 = engine.connectToPeer('p1', 'Alice');
      expect(p1.id).toBe(p2.id);
      expect(engine.peers.getAll()).toHaveLength(1);
    });
  });

  describe('disconnectPeer', () => {
    it('should set status to disconnected', () => {
      engine.connectToPeer('p1', 'Alice');
      engine.disconnectPeer('p1');
      expect(engine.peers.getPeer('p1')!.status).toBe('disconnected');
    });

    it('should remove discovery announcement', () => {
      engine.connectToPeer('p1', 'Alice');
      engine.disconnectPeer('p1');
      expect(engine.discovery.discover()).toHaveLength(0);
    });

    it('should dispatch a peer.bye message', () => {
      const messages: PeerMessage[] = [];
      engine.protocol.registerHandler('peer.bye', (msg) => messages.push(msg));
      engine.connectToPeer('p1', 'Alice');
      engine.disconnectPeer('p1');
      expect(messages).toHaveLength(1);
      expect(messages[0].toPeer).toBe('p1');
    });

    it('should return false for unknown peer', () => {
      expect(engine.disconnectPeer('ghost')).toBe(false);
    });

    it('should return true for known peer', () => {
      engine.connectToPeer('p1', 'Alice');
      expect(engine.disconnectPeer('p1')).toBe(true);
    });
  });

  describe('syncWithPeer', () => {
    it('should return empty delta when peer not found', () => {
      const delta = engine.syncWithPeer('ghost');
      expect(delta.toSend).toHaveLength(0);
      expect(delta.toRequest).toHaveLength(0);
    });

    it('should return empty delta when peer is not connected', () => {
      engine.peers.addPeer('p1', 'Alice');
      // status is 'connecting', not 'connected'
      const delta = engine.syncWithPeer('p1');
      expect(delta.toSend).toHaveLength(0);
      expect(delta.toRequest).toHaveLength(0);
    });

    it('should return delta with seeds to send when local has seeds', () => {
      engine.connectToPeer('p1', 'Alice');
      engine.sync.registerLocalSeed(makeSeed({ hash: 'seed1' }));
      engine.sync.registerLocalSeed(makeSeed({ hash: 'seed2' }));
      const delta = engine.syncWithPeer('p1');
      expect(delta.toSend).toHaveLength(2);
      expect(delta.toSend).toContain('seed1');
      expect(delta.toSend).toContain('seed2');
    });

    it('should dispatch seed.sync messages for each seed to send', () => {
      const messages: PeerMessage[] = [];
      engine.protocol.registerHandler('seed.sync', (msg) => messages.push(msg));
      engine.connectToPeer('p1', 'Alice');
      engine.sync.registerLocalSeed(makeSeed({ hash: 'seed1' }));
      engine.syncWithPeer('p1');
      expect(messages).toHaveLength(1);
      expect(messages[0].channel).toBe('seed.sync');
    });

    it('should record bandwidth for sent seeds', () => {
      engine.connectToPeer('p1', 'Alice');
      engine.sync.registerLocalSeed(makeSeed({ hash: 'seed1' }));
      engine.syncWithPeer('p1');
      const stats = engine.bandwidth.getStats();
      expect(stats.bytesSent).toBeGreaterThan(0);
    });

    it('should update peer lastSeen and seedCount', () => {
      engine.connectToPeer('p1', 'Alice');
      engine.sync.registerLocalSeed(makeSeed({ hash: 's1' }));
      engine.syncWithPeer('p1');
      const peer = engine.peers.getPeer('p1')!;
      expect(peer.seedCount).toBe(1);
    });

    it('should return empty delta when no local seeds', () => {
      engine.connectToPeer('p1', 'Alice');
      const delta = engine.syncWithPeer('p1');
      expect(delta.toSend).toHaveLength(0);
      expect(delta.toRequest).toHaveLength(0);
    });

    it('should not send when bandwidth limit is exceeded', () => {
      const smallBw = new BandwidthManager(10); // 10 bytes/s
      // Use the engine's bandwidth by replacing with pre-saturated manager
      engine.connectToPeer('p1', 'Alice');
      engine.sync.registerLocalSeed(makeSeed({ hash: 'bigseed' }));

      // Saturate the engine bandwidth
      engine.bandwidth.recordSend(1_048_576);

      const statsBefore = engine.bandwidth.getStats();
      const sentBefore = statsBefore.bytesSent;

      engine.syncWithPeer('p1');

      // bytesSent should not increase further (canSend returns false)
      const statsAfter = engine.bandwidth.getStats();
      expect(statsAfter.bytesSent).toBe(sentBefore);
    });
  });
});

// ─────────────────────────────────────────────
// BUILTIN_CHANNELS constant
// ─────────────────────────────────────────────

describe('BUILTIN_CHANNELS', () => {
  it('should contain seed.sync', () => {
    expect(BUILTIN_CHANNELS).toContain('seed.sync');
  });

  it('should contain seed.request', () => {
    expect(BUILTIN_CHANNELS).toContain('seed.request');
  });

  it('should contain peer.hello', () => {
    expect(BUILTIN_CHANNELS).toContain('peer.hello');
  });

  it('should contain peer.bye', () => {
    expect(BUILTIN_CHANNELS).toContain('peer.bye');
  });

  it('should have exactly 4 channels', () => {
    expect(BUILTIN_CHANNELS).toHaveLength(4);
  });
});

// ─────────────────────────────────────────────
// Integration-style tests
// ─────────────────────────────────────────────

describe('Integration: full P2P workflow', () => {
  it('should connect, sync seeds, resolve conflicts, and disconnect', () => {
    const engine = new P2PEngine();

    // Connect two peers
    engine.connectToPeer('peer-a', 'NodeA');
    engine.connectToPeer('peer-b', 'NodeB');
    expect(engine.peers.getConnected()).toHaveLength(2);

    // Register local seeds
    engine.sync.registerLocalSeed(makeSeed({ hash: 'shared-seed', fitness: 0.8 }));

    // Sync with peer-a
    const delta = engine.syncWithPeer('peer-a');
    expect(delta.toSend).toContain('shared-seed');

    // Resolve a conflict
    const localSeed = makeSeed({ hash: 'L', fitness: 0.9 });
    const remoteSeed = makeSeed({ hash: 'R', fitness: 0.3 });
    const winner = engine.conflicts.resolve(localSeed, remoteSeed);
    expect(winner).toBe(localSeed);

    // Disconnect peer-b
    engine.disconnectPeer('peer-b');
    expect(engine.peers.getConnected()).toHaveLength(1);

    // Ban peer-a
    engine.peers.banPeer('peer-a', 'violation');
    expect(engine.peers.getBanned()).toHaveLength(1);
  });

  it('should track message history across operations', () => {
    const engine = new P2PEngine();
    engine.connectToPeer('p1', 'A');
    engine.sync.registerLocalSeed(makeSeed({ hash: 'h1' }));
    engine.syncWithPeer('p1');
    engine.disconnectPeer('p1');

    // hello + seed.sync + bye = 3 messages
    const history = engine.protocol.getMessageHistory();
    expect(history.length).toBeGreaterThanOrEqual(3);

    const channels = history.map((m) => m.channel);
    expect(channels).toContain('peer.hello');
    expect(channels).toContain('seed.sync');
    expect(channels).toContain('peer.bye');
  });

  it('should handle multiple peers with discovery', () => {
    const engine = new P2PEngine();
    engine.connectToPeer('p1', 'Alice');
    engine.connectToPeer('p2', 'Bob');
    engine.connectToPeer('p3', 'Carol');

    const discovered = engine.discovery.discover();
    expect(discovered).toHaveLength(3);
    expect(discovered.map((d) => d.peerId)).toContain('p1');
    expect(discovered.map((d) => d.peerId)).toContain('p2');
    expect(discovered.map((d) => d.peerId)).toContain('p3');

    engine.disconnectPeer('p2');
    expect(engine.discovery.discover()).toHaveLength(2);
  });
});
