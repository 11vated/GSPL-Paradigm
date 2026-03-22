/**
 * Comprehensive test suite for @paradigm/collab.
 *
 * Covers: VectorClock, OperationLog, PresenceSystem, SessionHub,
 * CollaborativeEvolution, and CollabEngine.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  VectorClock,
  OperationLog,
  PresenceSystem,
  SessionHub,
  CollaborativeEvolution,
  CollabEngine,
} from './index.js';
import type { Operation } from './index.js';
import type { UniversalSeed } from '@paradigm/types';
import { DeterministicRNG } from '@paradigm/rng';
import { EventBus } from '@paradigm/events';

// ─────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────

/** Build a minimal UniversalSeed for testing purposes. */
function makeSeed(hash: string, name?: string): UniversalSeed {
  return {
    $gst: '4.0',
    $domain: 'organism',
    $hash: hash,
    $name: name ?? `seed-${hash}`,
    $lineage: { generation: 0, parents: [], timestamp: Date.now() },
    genes: {},
    $metadata: { created: Date.now() },
  } as UniversalSeed;
}

/** Build a minimal Operation for testing purposes. */
function makeOp(overrides: Partial<Operation> = {}): Operation {
  return {
    id: overrides.id ?? 'op-1',
    userId: overrides.userId ?? 'user-a',
    type: overrides.type ?? 'create',
    targetId: overrides.targetId ?? 'target-1',
    payload: overrides.payload ?? { data: 1 },
    clock: overrides.clock ?? { local: 1 },
    timestamp: overrides.timestamp ?? 1000,
  };
}

// ─────────────────────────────────────────────
// VectorClock
// ─────────────────────────────────────────────

describe('VectorClock', () => {
  it('should initialize with the given node ID and counter 0', () => {
    const vc = new VectorClock('node-a');
    expect(vc.getNodeId()).toBe('node-a');
    expect(vc.getCounter('node-a')).toBe(0);
  });

  it('should return 0 for unknown nodes', () => {
    const vc = new VectorClock('node-a');
    expect(vc.getCounter('unknown')).toBe(0);
  });

  it('should increment own counter', () => {
    const vc = new VectorClock('node-a');
    vc.increment();
    expect(vc.getCounter('node-a')).toBe(1);
    vc.increment();
    expect(vc.getCounter('node-a')).toBe(2);
  });

  it('should increment multiple times correctly', () => {
    const vc = new VectorClock('n');
    for (let i = 0; i < 10; i++) vc.increment();
    expect(vc.getCounter('n')).toBe(10);
  });

  describe('merge', () => {
    it('should take the max of each counter', () => {
      const a = new VectorClock('a');
      const b = new VectorClock('b');
      a.increment(); // a=1
      a.increment(); // a=2
      b.increment(); // b=1
      a.merge(b);
      expect(a.getCounter('a')).toBe(2);
      expect(a.getCounter('b')).toBe(1);
    });

    it('should keep own higher counter after merge', () => {
      const a = new VectorClock('a');
      const b = new VectorClock('b');
      a.increment(); // a=1
      a.increment(); // a=2
      a.increment(); // a=3
      b.increment(); // b=1
      a.merge(b);
      expect(a.getCounter('a')).toBe(3);
    });

    it('should adopt higher counter from the other clock', () => {
      const a = new VectorClock('a');
      const b = new VectorClock('b');
      b.increment();
      b.increment();
      b.increment();
      a.merge(b);
      expect(a.getCounter('b')).toBe(3);
    });

    it('should introduce new nodes from other clock', () => {
      const a = new VectorClock('a');
      const b = new VectorClock('b');
      b.increment();
      a.merge(b);
      expect(a.getCounter('b')).toBe(1);
    });

    it('should not lower own counters when merging lower values', () => {
      const a = new VectorClock('a');
      const b = new VectorClock('b');
      // a knows about node 'b' with counter 5 via manual fromJSON
      const aLoaded = VectorClock.fromJSON('a', { a: 0, b: 5 });
      b.increment(); // b=1
      aLoaded.merge(b);
      expect(aLoaded.getCounter('b')).toBe(5);
    });
  });

  describe('happensBefore', () => {
    it('should return true when all counters <= and at least one <', () => {
      const a = new VectorClock('a');
      const b = new VectorClock('a');
      b.increment();
      expect(a.happensBefore(b)).toBe(true);
    });

    it('should return false when equal', () => {
      const a = new VectorClock('a');
      const b = new VectorClock('a');
      expect(a.happensBefore(b)).toBe(false);
    });

    it('should return false when this clock has a higher counter', () => {
      const a = new VectorClock('a');
      a.increment();
      const b = new VectorClock('a');
      expect(a.happensBefore(b)).toBe(false);
    });

    it('should handle clocks with different node sets', () => {
      const a = new VectorClock('a');
      const b = new VectorClock('b');
      b.increment();
      // a: {a:0}, b: {b:1}
      // a has a=0, b has a missing (0), so a[a]=0 <= b[a]=0 ok
      // a has b missing (0), b has b=1, so a[b]=0 < b[b]=1 => atLeastOneLess = true
      expect(a.happensBefore(b)).toBe(true);
    });

    it('should return false for concurrent clocks', () => {
      const a = new VectorClock('a');
      const b = new VectorClock('b');
      a.increment();
      b.increment();
      expect(a.happensBefore(b)).toBe(false);
      expect(b.happensBefore(a)).toBe(false);
    });
  });

  describe('isConcurrent', () => {
    it('should return true when neither happens before the other and not equal', () => {
      const a = new VectorClock('a');
      const b = new VectorClock('b');
      a.increment();
      b.increment();
      expect(a.isConcurrent(b)).toBe(true);
    });

    it('should return false when one happens before the other', () => {
      const a = new VectorClock('a');
      const b = new VectorClock('a');
      b.increment();
      expect(a.isConcurrent(b)).toBe(false);
    });

    it('should return false for equal clocks', () => {
      const a = new VectorClock('a');
      const b = new VectorClock('a');
      expect(a.isConcurrent(b)).toBe(false);
    });

    it('should be symmetric', () => {
      const a = new VectorClock('a');
      const b = new VectorClock('b');
      a.increment();
      b.increment();
      expect(a.isConcurrent(b)).toBe(b.isConcurrent(a));
    });
  });

  describe('toJSON / fromJSON', () => {
    it('should serialize to a plain object', () => {
      const vc = new VectorClock('a');
      vc.increment();
      const json = vc.toJSON();
      expect(json).toEqual({ a: 1 });
    });

    it('should round-trip through JSON', () => {
      const vc = new VectorClock('a');
      vc.increment();
      vc.increment();
      const json = vc.toJSON();
      const restored = VectorClock.fromJSON('a', json);
      expect(restored.getCounter('a')).toBe(2);
      expect(restored.getNodeId()).toBe('a');
    });

    it('should restore multiple node counters', () => {
      const restored = VectorClock.fromJSON('x', { x: 3, y: 5, z: 1 });
      expect(restored.getCounter('x')).toBe(3);
      expect(restored.getCounter('y')).toBe(5);
      expect(restored.getCounter('z')).toBe(1);
    });

    it('fromJSON overwrites the initial 0 counter for nodeId', () => {
      const restored = VectorClock.fromJSON('a', { a: 7 });
      expect(restored.getCounter('a')).toBe(7);
    });
  });
});

// ─────────────────────────────────────────────
// OperationLog
// ─────────────────────────────────────────────

describe('OperationLog', () => {
  let log: OperationLog;

  beforeEach(() => {
    log = new OperationLog();
  });

  it('should start empty', () => {
    expect(log.count()).toBe(0);
    expect(log.getAll()).toEqual([]);
  });

  it('should append and count operations', () => {
    log.append(makeOp());
    expect(log.count()).toBe(1);
    log.append(makeOp({ id: 'op-2' }));
    expect(log.count()).toBe(2);
  });

  it('should return all operations in insertion order', () => {
    const op1 = makeOp({ id: 'op-1' });
    const op2 = makeOp({ id: 'op-2' });
    log.append(op1);
    log.append(op2);
    const all = log.getAll();
    expect(all).toHaveLength(2);
    expect(all[0]!.id).toBe('op-1');
    expect(all[1]!.id).toBe('op-2');
  });

  it('getAll should return a copy, not the internal array', () => {
    log.append(makeOp());
    const all = log.getAll();
    all.push(makeOp({ id: 'extra' }));
    expect(log.count()).toBe(1);
  });

  describe('getSince', () => {
    it('should return operations with timestamp >= the given value', () => {
      log.append(makeOp({ id: 'a', timestamp: 100 }));
      log.append(makeOp({ id: 'b', timestamp: 200 }));
      log.append(makeOp({ id: 'c', timestamp: 300 }));
      const result = log.getSince(200);
      expect(result).toHaveLength(2);
      expect(result.map((o) => o.id)).toEqual(['b', 'c']);
    });

    it('should return empty array when no operations match', () => {
      log.append(makeOp({ timestamp: 100 }));
      expect(log.getSince(200)).toEqual([]);
    });

    it('should return all when timestamp is 0', () => {
      log.append(makeOp({ timestamp: 50 }));
      log.append(makeOp({ id: 'op-2', timestamp: 100 }));
      expect(log.getSince(0)).toHaveLength(2);
    });
  });

  describe('getByUser', () => {
    it('should filter by userId', () => {
      log.append(makeOp({ userId: 'alice' }));
      log.append(makeOp({ id: 'op-2', userId: 'bob' }));
      log.append(makeOp({ id: 'op-3', userId: 'alice' }));
      const result = log.getByUser('alice');
      expect(result).toHaveLength(2);
    });

    it('should return empty for unknown user', () => {
      log.append(makeOp({ userId: 'alice' }));
      expect(log.getByUser('charlie')).toEqual([]);
    });
  });

  describe('getByTarget', () => {
    it('should filter by targetId', () => {
      log.append(makeOp({ targetId: 'seed-1' }));
      log.append(makeOp({ id: 'op-2', targetId: 'seed-2' }));
      log.append(makeOp({ id: 'op-3', targetId: 'seed-1' }));
      const result = log.getByTarget('seed-1');
      expect(result).toHaveLength(2);
    });

    it('should return empty for unknown target', () => {
      expect(log.getByTarget('nonexistent')).toEqual([]);
    });
  });

  describe('replay', () => {
    beforeEach(() => {
      log.append(makeOp({ id: 'a', timestamp: 100 }));
      log.append(makeOp({ id: 'b', timestamp: 200 }));
      log.append(makeOp({ id: 'c', timestamp: 300 }));
      log.append(makeOp({ id: 'd', timestamp: 400 }));
    });

    it('should return operations in range [from, to]', () => {
      const result = log.replay(200, 300);
      expect(result.map((o) => o.id)).toEqual(['b', 'c']);
    });

    it('should return from onward when to is omitted', () => {
      const result = log.replay(250);
      expect(result.map((o) => o.id)).toEqual(['c', 'd']);
    });

    it('should return empty when range matches nothing', () => {
      expect(log.replay(500, 600)).toEqual([]);
    });

    it('should include boundaries exactly', () => {
      const result = log.replay(100, 400);
      expect(result).toHaveLength(4);
    });

    it('should handle from=to for single timestamp', () => {
      const result = log.replay(200, 200);
      expect(result).toHaveLength(1);
      expect(result[0]!.id).toBe('b');
    });
  });
});

// ─────────────────────────────────────────────
// PresenceSystem
// ─────────────────────────────────────────────

describe('PresenceSystem', () => {
  let presence: PresenceSystem;

  beforeEach(() => {
    presence = new PresenceSystem();
  });

  it('should start with zero active count', () => {
    expect(presence.getActiveCount()).toBe(0);
    expect(presence.getAll()).toEqual([]);
  });

  describe('join', () => {
    it('should add a user with explicit color', () => {
      presence.join('u1', 'Alice', '#ff0000');
      const p = presence.getPresence('u1');
      expect(p).toBeDefined();
      expect(p!.userId).toBe('u1');
      expect(p!.displayName).toBe('Alice');
      expect(p!.color).toBe('#ff0000');
    });

    it('should auto-assign color when none provided', () => {
      presence.join('u1', 'Alice');
      const p = presence.getPresence('u1');
      expect(p).toBeDefined();
      expect(p!.color).toBe('#e74c3c'); // first color in palette
    });

    it('should cycle through the color palette', () => {
      const colors: string[] = [];
      for (let i = 0; i < 13; i++) {
        presence.join(`u${i}`, `User ${i}`);
        colors.push(presence.getPresence(`u${i}`)!.color);
      }
      // 13th user wraps around to first color
      expect(colors[12]).toBe(colors[0]);
    });

    it('should set cursor to undefined and selection to null on join', () => {
      presence.join('u1', 'Alice');
      const p = presence.getPresence('u1');
      expect(p!.cursor).toBeUndefined();
      expect(p!.selection).toBeNull();
    });

    it('should increment active count', () => {
      presence.join('u1', 'Alice');
      presence.join('u2', 'Bob');
      expect(presence.getActiveCount()).toBe(2);
    });

    it('should overwrite if same user joins again', () => {
      presence.join('u1', 'Alice', '#aaa');
      presence.join('u1', 'Alice Updated', '#bbb');
      expect(presence.getActiveCount()).toBe(1);
      expect(presence.getPresence('u1')!.displayName).toBe('Alice Updated');
    });
  });

  describe('leave', () => {
    it('should remove a user', () => {
      presence.join('u1', 'Alice');
      presence.leave('u1');
      expect(presence.getPresence('u1')).toBeUndefined();
      expect(presence.getActiveCount()).toBe(0);
    });

    it('should not throw when leaving nonexistent user', () => {
      expect(() => presence.leave('nonexistent')).not.toThrow();
    });
  });

  describe('updateCursor', () => {
    it('should update cursor position', () => {
      presence.join('u1', 'Alice');
      presence.updateCursor('u1', { x: 10, y: 20 });
      const p = presence.getPresence('u1');
      expect(p!.cursor).toEqual({ x: 10, y: 20 });
    });

    it('should do nothing for nonexistent user', () => {
      presence.updateCursor('ghost', { x: 0, y: 0 });
      expect(presence.getPresence('ghost')).toBeUndefined();
    });

    it('should update lastActivity', () => {
      presence.join('u1', 'Alice');
      const before = presence.getPresence('u1')!.lastActivity;
      // tiny delay to ensure different timestamp
      vi.spyOn(Date, 'now').mockReturnValue(before + 1000);
      presence.updateCursor('u1', { x: 5, y: 5 });
      expect(presence.getPresence('u1')!.lastActivity).toBeGreaterThanOrEqual(before);
      vi.restoreAllMocks();
    });
  });

  describe('updateSelection', () => {
    it('should set selection to a seed id', () => {
      presence.join('u1', 'Alice');
      presence.updateSelection('u1', 'seed-42');
      expect(presence.getPresence('u1')!.selection).toBe('seed-42');
    });

    it('should set selection to null', () => {
      presence.join('u1', 'Alice');
      presence.updateSelection('u1', 'seed-42');
      presence.updateSelection('u1', null);
      expect(presence.getPresence('u1')!.selection).toBeNull();
    });

    it('should do nothing for nonexistent user', () => {
      presence.updateSelection('ghost', 'seed-1');
      expect(presence.getPresence('ghost')).toBeUndefined();
    });
  });

  describe('getAll', () => {
    it('should return all presences', () => {
      presence.join('u1', 'Alice');
      presence.join('u2', 'Bob');
      const all = presence.getAll();
      expect(all).toHaveLength(2);
      expect(all.map((p) => p.userId).sort()).toEqual(['u1', 'u2']);
    });
  });
});

// ─────────────────────────────────────────────
// SessionHub
// ─────────────────────────────────────────────

describe('SessionHub', () => {
  let hub: SessionHub;
  let rng: DeterministicRNG;

  beforeEach(() => {
    rng = new DeterministicRNG('test-session-hub');
    hub = new SessionHub(rng);
  });

  describe('create', () => {
    it('should create a session and return a string ID', () => {
      const id = hub.create('My Session', 'host-1');
      expect(typeof id).toBe('string');
      expect(id.length).toBeGreaterThan(0);
    });

    it('should set up session with correct host and name', () => {
      const id = hub.create('My Session', 'host-1');
      const session = hub.getSession(id);
      expect(session).toBeDefined();
      expect(session!.name).toBe('My Session');
      expect(session!.hostId).toBe('host-1');
      expect(session!.active).toBe(true);
    });

    it('should include host in participants', () => {
      const id = hub.create('S', 'host-1');
      expect(hub.getSession(id)!.participants).toContain('host-1');
    });

    it('should start with empty seeds map', () => {
      const id = hub.create('S', 'host-1');
      expect(hub.getSession(id)!.seeds.size).toBe(0);
    });

    it('should generate unique IDs for different sessions', () => {
      const id1 = hub.create('S1', 'host-1');
      const id2 = hub.create('S2', 'host-1');
      expect(id1).not.toBe(id2);
    });
  });

  describe('join', () => {
    it('should add a user to the session', () => {
      const id = hub.create('S', 'host-1');
      const result = hub.join(id, 'user-2');
      expect(result).toBe(true);
      expect(hub.getSession(id)!.participants).toContain('user-2');
    });

    it('should not duplicate participants', () => {
      const id = hub.create('S', 'host-1');
      hub.join(id, 'user-2');
      hub.join(id, 'user-2');
      const participants = hub.getSession(id)!.participants;
      expect(participants.filter((p) => p === 'user-2')).toHaveLength(1);
    });

    it('should return false for nonexistent session', () => {
      expect(hub.join('fake-id', 'user-1')).toBe(false);
    });

    it('should return false for inactive session', () => {
      const id = hub.create('S', 'host-1');
      hub.close(id, 'host-1');
      expect(hub.join(id, 'user-2')).toBe(false);
    });
  });

  describe('leave', () => {
    it('should remove a user from the session', () => {
      const id = hub.create('S', 'host-1');
      hub.join(id, 'user-2');
      const result = hub.leave(id, 'user-2');
      expect(result).toBe(true);
      expect(hub.getSession(id)!.participants).not.toContain('user-2');
    });

    it('should return false for nonexistent session', () => {
      expect(hub.leave('fake', 'user-1')).toBe(false);
    });

    it('should return false if user is not a participant', () => {
      const id = hub.create('S', 'host-1');
      expect(hub.leave(id, 'stranger')).toBe(false);
    });
  });

  describe('getSession', () => {
    it('should return undefined for unknown ID', () => {
      expect(hub.getSession('nope')).toBeUndefined();
    });
  });

  describe('addSeed', () => {
    it('should add a seed to the session', () => {
      const id = hub.create('S', 'host-1');
      const seed = makeSeed('hash-1');
      expect(hub.addSeed(id, seed)).toBe(true);
      expect(hub.getSession(id)!.seeds.has('hash-1')).toBe(true);
    });

    it('should return false for nonexistent session', () => {
      expect(hub.addSeed('fake', makeSeed('h'))).toBe(false);
    });

    it('should return false for inactive session', () => {
      const id = hub.create('S', 'host-1');
      hub.close(id, 'host-1');
      expect(hub.addSeed(id, makeSeed('h'))).toBe(false);
    });
  });

  describe('updateSeed', () => {
    it('should update an existing seed', () => {
      const id = hub.create('S', 'host-1');
      const seed = makeSeed('hash-1', 'original');
      hub.addSeed(id, seed);
      const updated = makeSeed('hash-1', 'updated');
      expect(hub.updateSeed(id, updated)).toBe(true);
      expect(hub.getSession(id)!.seeds.get('hash-1')!.$name).toBe('updated');
    });

    it('should return false if seed does not exist in session', () => {
      const id = hub.create('S', 'host-1');
      expect(hub.updateSeed(id, makeSeed('nonexistent'))).toBe(false);
    });

    it('should return false for nonexistent session', () => {
      expect(hub.updateSeed('fake', makeSeed('h'))).toBe(false);
    });

    it('should return false for inactive session', () => {
      const id = hub.create('S', 'host-1');
      hub.addSeed(id, makeSeed('h'));
      hub.close(id, 'host-1');
      expect(hub.updateSeed(id, makeSeed('h'))).toBe(false);
    });
  });

  describe('removeSeed', () => {
    it('should remove a seed from the session', () => {
      const id = hub.create('S', 'host-1');
      hub.addSeed(id, makeSeed('hash-1'));
      expect(hub.removeSeed(id, 'hash-1')).toBe(true);
      expect(hub.getSession(id)!.seeds.has('hash-1')).toBe(false);
    });

    it('should return false if seed does not exist', () => {
      const id = hub.create('S', 'host-1');
      expect(hub.removeSeed(id, 'nope')).toBe(false);
    });

    it('should return false for nonexistent session', () => {
      expect(hub.removeSeed('fake', 'h')).toBe(false);
    });

    it('should return false for inactive session', () => {
      const id = hub.create('S', 'host-1');
      hub.addSeed(id, makeSeed('h'));
      hub.close(id, 'host-1');
      expect(hub.removeSeed(id, 'h')).toBe(false);
    });
  });

  describe('listActive', () => {
    it('should return only active sessions', () => {
      const id1 = hub.create('S1', 'host-1');
      const id2 = hub.create('S2', 'host-1');
      hub.close(id1, 'host-1');
      const active = hub.listActive();
      expect(active).toHaveLength(1);
      expect(active[0]!.id).toBe(id2);
    });

    it('should return empty when no sessions exist', () => {
      expect(hub.listActive()).toEqual([]);
    });
  });

  describe('close', () => {
    it('should close a session when called by the host', () => {
      const id = hub.create('S', 'host-1');
      expect(hub.close(id, 'host-1')).toBe(true);
      expect(hub.getSession(id)!.active).toBe(false);
    });

    it('should return false when called by a non-host', () => {
      const id = hub.create('S', 'host-1');
      hub.join(id, 'user-2');
      expect(hub.close(id, 'user-2')).toBe(false);
      expect(hub.getSession(id)!.active).toBe(true);
    });

    it('should return false for nonexistent session', () => {
      expect(hub.close('fake', 'host-1')).toBe(false);
    });

    it('should return false when already closed', () => {
      const id = hub.create('S', 'host-1');
      hub.close(id, 'host-1');
      expect(hub.close(id, 'host-1')).toBe(false);
    });
  });
});

// ─────────────────────────────────────────────
// CollaborativeEvolution
// ─────────────────────────────────────────────

describe('CollaborativeEvolution', () => {
  let evo: CollaborativeEvolution;
  let rng: DeterministicRNG;

  beforeEach(() => {
    rng = new DeterministicRNG('test-evo');
    evo = new CollaborativeEvolution(rng);
  });

  describe('startRun', () => {
    it('should create a run and return a string ID', () => {
      const runId = evo.startRun('session-1', { populationSize: 10, generations: 5 });
      expect(typeof runId).toBe('string');
      expect(runId.length).toBeGreaterThan(0);
    });

    it('should initialize at generation 0', () => {
      const runId = evo.startRun('s1', { populationSize: 10, generations: 5 });
      const status = evo.getRunStatus(runId);
      expect(status).toBeDefined();
      expect(status!.generation).toBe(0);
    });

    it('should start with zero votes and participants', () => {
      const runId = evo.startRun('s1', { populationSize: 10, generations: 5 });
      const status = evo.getRunStatus(runId);
      expect(status!.totalVotes).toBe(0);
      expect(status!.participantCount).toBe(0);
    });

    it('should generate unique IDs', () => {
      const id1 = evo.startRun('s1', { populationSize: 5, generations: 3 });
      const id2 = evo.startRun('s1', { populationSize: 5, generations: 3 });
      expect(id1).not.toBe(id2);
    });
  });

  describe('vote', () => {
    it('should allow voting for a seed', () => {
      const runId = evo.startRun('s1', { populationSize: 10, generations: 5 });
      expect(evo.vote(runId, 'user-a', 'seed-1')).toBe(true);
    });

    it('should track the voter in participants', () => {
      const runId = evo.startRun('s1', { populationSize: 10, generations: 5 });
      evo.vote(runId, 'user-a', 'seed-1');
      const status = evo.getRunStatus(runId);
      expect(status!.participantCount).toBe(1);
    });

    it('should prevent duplicate votes from same user for same seed', () => {
      const runId = evo.startRun('s1', { populationSize: 10, generations: 5 });
      expect(evo.vote(runId, 'user-a', 'seed-1')).toBe(true);
      expect(evo.vote(runId, 'user-a', 'seed-1')).toBe(false);
    });

    it('should allow same user to vote for different seeds', () => {
      const runId = evo.startRun('s1', { populationSize: 10, generations: 5 });
      expect(evo.vote(runId, 'user-a', 'seed-1')).toBe(true);
      expect(evo.vote(runId, 'user-a', 'seed-2')).toBe(true);
    });

    it('should allow different users to vote for same seed', () => {
      const runId = evo.startRun('s1', { populationSize: 10, generations: 5 });
      expect(evo.vote(runId, 'user-a', 'seed-1')).toBe(true);
      expect(evo.vote(runId, 'user-b', 'seed-1')).toBe(true);
    });

    it('should return false for nonexistent run', () => {
      expect(evo.vote('fake', 'user-a', 'seed-1')).toBe(false);
    });

    it('should return false for inactive run', () => {
      const runId = evo.startRun('s1', { populationSize: 10, generations: 5 });
      evo.endRun(runId);
      expect(evo.vote(runId, 'user-a', 'seed-1')).toBe(false);
    });

    it('should increment totalVotes correctly', () => {
      const runId = evo.startRun('s1', { populationSize: 10, generations: 5 });
      evo.vote(runId, 'user-a', 'seed-1');
      evo.vote(runId, 'user-b', 'seed-1');
      evo.vote(runId, 'user-a', 'seed-2');
      const status = evo.getRunStatus(runId);
      expect(status!.totalVotes).toBe(3);
    });
  });

  describe('getVotes', () => {
    it('should return votes as a map', () => {
      const runId = evo.startRun('s1', { populationSize: 10, generations: 5 });
      evo.vote(runId, 'user-a', 'seed-1');
      evo.vote(runId, 'user-b', 'seed-1');
      evo.vote(runId, 'user-a', 'seed-2');
      const votes = evo.getVotes(runId);
      expect(votes.get('seed-1')).toEqual(['user-a', 'user-b']);
      expect(votes.get('seed-2')).toEqual(['user-a']);
    });

    it('should return empty map for nonexistent run', () => {
      const votes = evo.getVotes('fake');
      expect(votes.size).toBe(0);
    });

    it('should return a deep copy (not mutable reference)', () => {
      const runId = evo.startRun('s1', { populationSize: 10, generations: 5 });
      evo.vote(runId, 'user-a', 'seed-1');
      const votes = evo.getVotes(runId);
      votes.get('seed-1')!.push('injected');
      // Original should be unaffected
      const fresh = evo.getVotes(runId);
      expect(fresh.get('seed-1')).toEqual(['user-a']);
    });
  });

  describe('advanceGeneration', () => {
    it('should advance the generation counter', () => {
      const runId = evo.startRun('s1', { populationSize: 10, generations: 5 });
      evo.vote(runId, 'user-a', 'seed-1');
      const result = evo.advanceGeneration(runId);
      expect(result).toBeDefined();
      expect(result!.generation).toBe(1);
    });

    it('should rank seeds by vote count and return top survivors', () => {
      const runId = evo.startRun('s1', { populationSize: 2, generations: 5 });
      evo.vote(runId, 'user-a', 'seed-1');
      evo.vote(runId, 'user-b', 'seed-1');
      evo.vote(runId, 'user-a', 'seed-2');
      evo.vote(runId, 'user-b', 'seed-2');
      evo.vote(runId, 'user-c', 'seed-2');
      evo.vote(runId, 'user-a', 'seed-3');
      // seed-2: 3 votes, seed-1: 2 votes, seed-3: 1 vote
      const result = evo.advanceGeneration(runId);
      expect(result!.survivingSeeds).toHaveLength(2);
      expect(result!.survivingSeeds[0]).toBe('seed-2');
      expect(result!.survivingSeeds[1]).toBe('seed-1');
    });

    it('should clear votes after advancing', () => {
      const runId = evo.startRun('s1', { populationSize: 10, generations: 5 });
      evo.vote(runId, 'user-a', 'seed-1');
      evo.advanceGeneration(runId);
      const votes = evo.getVotes(runId);
      expect(votes.size).toBe(0);
      const status = evo.getRunStatus(runId);
      expect(status!.totalVotes).toBe(0);
    });

    it('should handle no votes gracefully (empty survivors)', () => {
      const runId = evo.startRun('s1', { populationSize: 10, generations: 5 });
      const result = evo.advanceGeneration(runId);
      expect(result!.survivingSeeds).toEqual([]);
      expect(result!.generation).toBe(1);
    });

    it('should end run when reaching target generations', () => {
      const runId = evo.startRun('s1', { populationSize: 10, generations: 2 });
      evo.advanceGeneration(runId); // gen 1
      evo.advanceGeneration(runId); // gen 2 -> should deactivate
      const status = evo.getRunStatus(runId);
      expect(status!.generation).toBe(2);
      // Run should be inactive now, so further advances fail
      expect(evo.advanceGeneration(runId)).toBeUndefined();
    });

    it('should return undefined for nonexistent run', () => {
      expect(evo.advanceGeneration('fake')).toBeUndefined();
    });

    it('should return undefined for inactive run', () => {
      const runId = evo.startRun('s1', { populationSize: 10, generations: 5 });
      evo.endRun(runId);
      expect(evo.advanceGeneration(runId)).toBeUndefined();
    });

    it('should limit survivors to populationSize even if more seeds voted', () => {
      const runId = evo.startRun('s1', { populationSize: 1, generations: 5 });
      evo.vote(runId, 'u1', 'seed-1');
      evo.vote(runId, 'u1', 'seed-2');
      evo.vote(runId, 'u2', 'seed-1');
      const result = evo.advanceGeneration(runId);
      expect(result!.survivingSeeds).toHaveLength(1);
      expect(result!.survivingSeeds[0]).toBe('seed-1');
    });
  });

  describe('getRunStatus', () => {
    it('should return undefined for nonexistent run', () => {
      expect(evo.getRunStatus('nope')).toBeUndefined();
    });

    it('should return correct status snapshot', () => {
      const runId = evo.startRun('s1', { populationSize: 10, generations: 5 });
      evo.vote(runId, 'user-a', 'seed-1');
      evo.vote(runId, 'user-b', 'seed-2');
      const status = evo.getRunStatus(runId);
      expect(status!.runId).toBe(runId);
      expect(status!.generation).toBe(0);
      expect(status!.totalVotes).toBe(2);
      expect(status!.participantCount).toBe(2);
    });
  });

  describe('endRun', () => {
    it('should deactivate an active run', () => {
      const runId = evo.startRun('s1', { populationSize: 10, generations: 5 });
      expect(evo.endRun(runId)).toBe(true);
    });

    it('should return false for nonexistent run', () => {
      expect(evo.endRun('fake')).toBe(false);
    });

    it('should return false if already ended', () => {
      const runId = evo.startRun('s1', { populationSize: 10, generations: 5 });
      evo.endRun(runId);
      expect(evo.endRun(runId)).toBe(false);
    });

    it('should prevent further voting after ending', () => {
      const runId = evo.startRun('s1', { populationSize: 10, generations: 5 });
      evo.endRun(runId);
      expect(evo.vote(runId, 'user-a', 'seed-1')).toBe(false);
    });
  });
});

// ─────────────────────────────────────────────
// CollabEngine
// ─────────────────────────────────────────────

describe('CollabEngine', () => {
  let engine: CollabEngine;
  let rng: DeterministicRNG;
  let bus: EventBus;

  beforeEach(() => {
    rng = new DeterministicRNG('test-engine');
    bus = new EventBus();
    engine = new CollabEngine(rng, bus);
  });

  it('should expose clock, operations, presence, sessions, and evolution', () => {
    expect(engine.clock).toBeInstanceOf(VectorClock);
    expect(engine.operations).toBeInstanceOf(OperationLog);
    expect(engine.presence).toBeInstanceOf(PresenceSystem);
    expect(engine.sessions).toBeInstanceOf(SessionHub);
    expect(engine.evolution).toBeInstanceOf(CollaborativeEvolution);
  });

  it('should work with default constructor (no args)', () => {
    const defaultEngine = new CollabEngine();
    expect(defaultEngine.clock).toBeInstanceOf(VectorClock);
    expect(defaultEngine.operations).toBeInstanceOf(OperationLog);
  });

  describe('recordOperation', () => {
    it('should return an Operation object', () => {
      const op = engine.recordOperation('user-a', 'create', 'target-1', { foo: 'bar' });
      expect(op.userId).toBe('user-a');
      expect(op.type).toBe('create');
      expect(op.targetId).toBe('target-1');
      expect(op.payload).toEqual({ foo: 'bar' });
      expect(typeof op.id).toBe('string');
      expect(typeof op.timestamp).toBe('number');
    });

    it('should increment the vector clock', () => {
      expect(engine.clock.getCounter('local')).toBe(0);
      engine.recordOperation('user-a', 'create', 't1', null);
      expect(engine.clock.getCounter('local')).toBe(1);
      engine.recordOperation('user-a', 'update', 't1', null);
      expect(engine.clock.getCounter('local')).toBe(2);
    });

    it('should append to the operation log', () => {
      expect(engine.operations.count()).toBe(0);
      engine.recordOperation('user-a', 'create', 't1', null);
      expect(engine.operations.count()).toBe(1);
      engine.recordOperation('user-a', 'update', 't1', null);
      expect(engine.operations.count()).toBe(2);
    });

    it('should include the clock snapshot in the operation', () => {
      const op = engine.recordOperation('user-a', 'create', 't1', null);
      expect(op.clock).toHaveProperty('local');
      expect(op.clock['local']).toBe(1);
    });

    it('should generate unique operation IDs', () => {
      const op1 = engine.recordOperation('u', 'create', 't', null);
      const op2 = engine.recordOperation('u', 'create', 't', null);
      expect(op1.id).not.toBe(op2.id);
    });

    it('should emit world.changed event on the bus', () => {
      const events: unknown[] = [];
      bus.on('world.changed', (evt) => {
        events.push(evt);
      });
      engine.recordOperation('user-a', 'create', 't1', null);
      expect(events).toHaveLength(1);
    });

    it('should emit event with correct action for each operation type', () => {
      const actions: string[] = [];
      bus.on('world.changed', (evt) => {
        actions.push((evt as { action: string }).action);
      });
      engine.recordOperation('u', 'create', 't', null);
      engine.recordOperation('u', 'update', 't', null);
      engine.recordOperation('u', 'delete', 't', null);
      expect(actions).toEqual(['collab.create', 'collab.update', 'collab.delete']);
    });

    it('should include seedCount (operation count) in event', () => {
      let captured: { seedCount?: number } = {};
      bus.on('world.changed', (evt) => {
        captured = evt as { seedCount: number };
      });
      engine.recordOperation('u', 'create', 't', null);
      expect(captured.seedCount).toBe(1);
      engine.recordOperation('u', 'create', 't2', null);
      expect(captured.seedCount).toBe(2);
    });
  });

  describe('integration: sessions + presence + evolution', () => {
    it('should allow creating a session and joining with presence', () => {
      const sessionId = engine.sessions.create('Collab', 'host');
      engine.sessions.join(sessionId, 'user-2');
      engine.presence.join('host', 'Host User');
      engine.presence.join('user-2', 'Guest');
      expect(engine.presence.getActiveCount()).toBe(2);
      expect(engine.sessions.getSession(sessionId)!.participants).toHaveLength(2);
    });

    it('should allow running an evolution within a session', () => {
      engine.sessions.create('Evo Session', 'host');
      const runId = engine.evolution.startRun('session-1', {
        populationSize: 2,
        generations: 3,
      });
      engine.evolution.vote(runId, 'host', 'seed-a');
      engine.evolution.vote(runId, 'guest', 'seed-a');
      engine.evolution.vote(runId, 'host', 'seed-b');
      const result = engine.evolution.advanceGeneration(runId);
      expect(result).toBeDefined();
      expect(result!.survivingSeeds).toContain('seed-a');
    });

    it('should allow recording operations and querying logs', () => {
      engine.recordOperation('alice', 'create', 'seed-1', { name: 'Fire' });
      engine.recordOperation('bob', 'update', 'seed-1', { name: 'Ice' });
      engine.recordOperation('alice', 'create', 'seed-2', { name: 'Wind' });

      expect(engine.operations.getByUser('alice')).toHaveLength(2);
      expect(engine.operations.getByUser('bob')).toHaveLength(1);
      expect(engine.operations.getByTarget('seed-1')).toHaveLength(2);
    });
  });
});
