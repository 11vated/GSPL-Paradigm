/**
 * Comprehensive test suite for @paradigm/network.
 *
 * Covers: RoomManager, MessageRouter, SeedBroadcaster, PresenceServer,
 * GlobalDashboard, NetworkEngine.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  RoomManager,
  MessageRouter,
  SeedBroadcaster,
  PresenceServer,
  GlobalDashboard,
  NetworkEngine,
} from './index.js';
import type {
  NetworkMessage,
  Room,
  SeedBroadcastEvent,
  MetricSummary,
  DashboardSnapshot,
  MessageHandler,
  SeedBroadcastHandler,
  PresenceMetadata,
  ConnectionState,
} from './index.js';
import { DeterministicRNG } from '@paradigm/rng';
import { EventBus } from '@paradigm/events';
import type { UniversalSeed, GeneMap } from '@paradigm/types';

// ─────────────────────────────────────────────
// Test Fixtures
// ─────────────────────────────────────────────

function makeSeed(overrides: Partial<UniversalSeed> = {}): UniversalSeed {
  return {
    $gst: '4.0',
    $domain: 'organism',
    $hash: 'test-hash-001',
    $name: 'TestSeed',
    $lineage: {
      generation: 0,
      parents: [],
      timestamp: Date.now(),
    },
    genes: { strength: { type: 'scalar', value: 0.5, range: [0, 1] } } as GeneMap,
    $metadata: { created: Date.now() },
    ...overrides,
  } as UniversalSeed;
}

function makeMessage(overrides: Partial<NetworkMessage> = {}): NetworkMessage {
  return {
    id: 'msg-001',
    type: 'test.message',
    payload: { data: 'hello' },
    senderId: 'user-1',
    timestamp: Date.now(),
    ...overrides,
  };
}

function makeRng(seed: string = 'test-seed'): DeterministicRNG {
  return new DeterministicRNG(seed);
}

// ─────────────────────────────────────────────
// RoomManager
// ─────────────────────────────────────────────

describe('RoomManager', () => {
  let rm: RoomManager;

  beforeEach(() => {
    rm = new RoomManager(makeRng());
  });

  describe('createRoom', () => {
    it('should create a room with valid id, name, and creator as member', () => {
      const room = rm.createRoom('lobby', 'user-1');
      expect(room.id).toMatch(/^room-/);
      expect(room.name).toBe('lobby');
      expect(room.members.has('user-1')).toBe(true);
      expect(room.members.size).toBe(1);
    });

    it('should set createdAt to a recent timestamp', () => {
      const before = Date.now();
      const room = rm.createRoom('lobby', 'user-1');
      const after = Date.now();
      expect(room.createdAt).toBeGreaterThanOrEqual(before);
      expect(room.createdAt).toBeLessThanOrEqual(after);
    });

    it('should default metadata to empty object when not provided', () => {
      const room = rm.createRoom('lobby', 'user-1');
      expect(room.metadata).toEqual({});
    });

    it('should store provided metadata', () => {
      const meta = { maxPlayers: 10, mode: 'pvp' };
      const room = rm.createRoom('arena', 'user-1', meta);
      expect(room.metadata).toEqual(meta);
    });

    it('should create rooms with unique ids', () => {
      const r1 = rm.createRoom('room-a', 'user-1');
      const r2 = rm.createRoom('room-b', 'user-2');
      expect(r1.id).not.toBe(r2.id);
    });

    it('should allow creating multiple rooms with the same name', () => {
      const r1 = rm.createRoom('lobby', 'user-1');
      const r2 = rm.createRoom('lobby', 'user-2');
      expect(r1.id).not.toBe(r2.id);
      expect(rm.listRooms()).toHaveLength(2);
    });
  });

  describe('joinRoom', () => {
    it('should add a user to an existing room', () => {
      const room = rm.createRoom('lobby', 'user-1');
      const result = rm.joinRoom(room.id, 'user-2');
      expect(result).toBe(true);
      expect(room.members.has('user-2')).toBe(true);
      expect(room.members.size).toBe(2);
    });

    it('should return false for a non-existent room', () => {
      expect(rm.joinRoom('no-such-room', 'user-1')).toBe(false);
    });

    it('should not duplicate a user already in the room', () => {
      const room = rm.createRoom('lobby', 'user-1');
      rm.joinRoom(room.id, 'user-1');
      expect(room.members.size).toBe(1);
    });

    it('should allow multiple distinct users to join', () => {
      const room = rm.createRoom('lobby', 'user-1');
      rm.joinRoom(room.id, 'user-2');
      rm.joinRoom(room.id, 'user-3');
      rm.joinRoom(room.id, 'user-4');
      expect(room.members.size).toBe(4);
    });
  });

  describe('leaveRoom', () => {
    it('should remove a member from the room', () => {
      const room = rm.createRoom('lobby', 'user-1');
      rm.joinRoom(room.id, 'user-2');
      const result = rm.leaveRoom(room.id, 'user-2');
      expect(result).toBe(true);
      expect(room.members.has('user-2')).toBe(false);
    });

    it('should return false for a non-existent room', () => {
      expect(rm.leaveRoom('no-such-room', 'user-1')).toBe(false);
    });

    it('should return false when user is not in the room', () => {
      const room = rm.createRoom('lobby', 'user-1');
      expect(rm.leaveRoom(room.id, 'user-999')).toBe(false);
    });

    it('should allow the creator to leave', () => {
      const room = rm.createRoom('lobby', 'user-1');
      expect(rm.leaveRoom(room.id, 'user-1')).toBe(true);
      expect(room.members.size).toBe(0);
    });
  });

  describe('getRoom', () => {
    it('should return a room by id', () => {
      const room = rm.createRoom('lobby', 'user-1');
      expect(rm.getRoom(room.id)).toBe(room);
    });

    it('should return undefined for a non-existent id', () => {
      expect(rm.getRoom('no-such-room')).toBeUndefined();
    });
  });

  describe('getRoomsForUser', () => {
    it('should return all rooms containing a user', () => {
      const r1 = rm.createRoom('room-a', 'user-1');
      const r2 = rm.createRoom('room-b', 'user-1');
      rm.createRoom('room-c', 'user-2');
      const rooms = rm.getRoomsForUser('user-1');
      expect(rooms).toHaveLength(2);
      expect(rooms.map((r) => r.id)).toContain(r1.id);
      expect(rooms.map((r) => r.id)).toContain(r2.id);
    });

    it('should return an empty array if user is in no rooms', () => {
      rm.createRoom('room-a', 'user-1');
      expect(rm.getRoomsForUser('user-99')).toEqual([]);
    });

    it('should include rooms the user joined (not just created)', () => {
      const room = rm.createRoom('lobby', 'user-1');
      rm.joinRoom(room.id, 'user-2');
      const rooms = rm.getRoomsForUser('user-2');
      expect(rooms).toHaveLength(1);
      expect(rooms[0]!.id).toBe(room.id);
    });
  });

  describe('listRooms', () => {
    it('should return empty array when no rooms exist', () => {
      expect(rm.listRooms()).toEqual([]);
    });

    it('should list all created rooms', () => {
      rm.createRoom('a', 'u1');
      rm.createRoom('b', 'u2');
      rm.createRoom('c', 'u3');
      expect(rm.listRooms()).toHaveLength(3);
    });
  });

  describe('deleteRoom', () => {
    it('should delete an existing room', () => {
      const room = rm.createRoom('lobby', 'user-1');
      expect(rm.deleteRoom(room.id)).toBe(true);
      expect(rm.getRoom(room.id)).toBeUndefined();
    });

    it('should return false for a non-existent room', () => {
      expect(rm.deleteRoom('no-such-room')).toBe(false);
    });

    it('should not affect other rooms', () => {
      const r1 = rm.createRoom('a', 'u1');
      const r2 = rm.createRoom('b', 'u2');
      rm.deleteRoom(r1.id);
      expect(rm.getRoom(r2.id)).toBe(r2);
      expect(rm.listRooms()).toHaveLength(1);
    });
  });

  describe('broadcast', () => {
    it('should return member count for an existing room', () => {
      const room = rm.createRoom('lobby', 'user-1');
      rm.joinRoom(room.id, 'user-2');
      rm.joinRoom(room.id, 'user-3');
      const msg = makeMessage({ roomId: room.id });
      expect(rm.broadcast(room.id, msg)).toBe(3);
    });

    it('should return 0 for a non-existent room', () => {
      expect(rm.broadcast('no-such-room', makeMessage())).toBe(0);
    });

    it('should return 1 when only the creator is in the room', () => {
      const room = rm.createRoom('solo', 'user-1');
      expect(rm.broadcast(room.id, makeMessage())).toBe(1);
    });
  });
});

// ─────────────────────────────────────────────
// MessageRouter
// ─────────────────────────────────────────────

describe('MessageRouter', () => {
  let router: MessageRouter;

  beforeEach(() => {
    router = new MessageRouter();
  });

  describe('registerHandler', () => {
    it('should register a handler and return an unsubscribe function', () => {
      const handler = vi.fn();
      const unsub = router.registerHandler('test', handler);
      expect(typeof unsub).toBe('function');
      expect(router.getHandlerCount('test')).toBe(1);
    });

    it('should allow multiple handlers for the same type', () => {
      router.registerHandler('test', vi.fn());
      router.registerHandler('test', vi.fn());
      router.registerHandler('test', vi.fn());
      expect(router.getHandlerCount('test')).toBe(3);
    });

    it('should support handlers for different types', () => {
      router.registerHandler('type-a', vi.fn());
      router.registerHandler('type-b', vi.fn());
      expect(router.getHandlerCount('type-a')).toBe(1);
      expect(router.getHandlerCount('type-b')).toBe(1);
    });
  });

  describe('unsubscribe', () => {
    it('should remove the handler when called', () => {
      const handler = vi.fn();
      const unsub = router.registerHandler('test', handler);
      unsub();
      expect(router.getHandlerCount('test')).toBe(0);
    });

    it('should clean up the type entry when last handler is removed', () => {
      const h1 = vi.fn();
      const h2 = vi.fn();
      const unsub1 = router.registerHandler('test', h1);
      const unsub2 = router.registerHandler('test', h2);
      unsub1();
      expect(router.getHandlerCount('test')).toBe(1);
      unsub2();
      expect(router.getHandlerCount('test')).toBe(0);
    });

    it('should be safe to call unsubscribe multiple times', () => {
      const handler = vi.fn();
      const unsub = router.registerHandler('test', handler);
      unsub();
      unsub(); // should not throw
      expect(router.getHandlerCount('test')).toBe(0);
    });

    it('should not affect other handlers of the same type', () => {
      const h1 = vi.fn();
      const h2 = vi.fn();
      const unsub1 = router.registerHandler('test', h1);
      router.registerHandler('test', h2);
      unsub1();
      router.route(makeMessage({ type: 'test' }));
      expect(h1).not.toHaveBeenCalled();
      expect(h2).toHaveBeenCalledTimes(1);
    });
  });

  describe('route', () => {
    it('should dispatch a message to all matching handlers', () => {
      const h1 = vi.fn();
      const h2 = vi.fn();
      router.registerHandler('test.message', h1);
      router.registerHandler('test.message', h2);
      const msg = makeMessage({ type: 'test.message' });
      router.route(msg);
      expect(h1).toHaveBeenCalledWith(msg);
      expect(h2).toHaveBeenCalledWith(msg);
    });

    it('should not dispatch to handlers of a different type', () => {
      const handler = vi.fn();
      router.registerHandler('other', handler);
      router.route(makeMessage({ type: 'test' }));
      expect(handler).not.toHaveBeenCalled();
    });

    it('should log the message even if there are no handlers', () => {
      const msg = makeMessage();
      router.route(msg);
      expect(router.getMessageLog()).toHaveLength(1);
      expect(router.getMessageLog()[0]).toBe(msg);
    });

    it('should catch and log errors thrown by handlers', () => {
      const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
      const throwingHandler = () => {
        throw new Error('handler-boom');
      };
      const normalHandler = vi.fn();
      router.registerHandler('test', throwingHandler);
      router.registerHandler('test', normalHandler);
      router.route(makeMessage({ type: 'test' }));
      expect(spy).toHaveBeenCalledOnce();
      expect(spy.mock.calls[0]![0]).toContain('handler-boom');
      // The second handler still gets called
      expect(normalHandler).toHaveBeenCalledTimes(1);
      spy.mockRestore();
    });

    it('should handle non-Error throws from handlers', () => {
      const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
      const throwingHandler = () => {
        throw 'string-error'; // eslint-disable-line no-throw-literal
      };
      router.registerHandler('test', throwingHandler);
      router.route(makeMessage({ type: 'test' }));
      expect(spy).toHaveBeenCalledOnce();
      expect(spy.mock.calls[0]![0]).toContain('string-error');
      spy.mockRestore();
    });
  });

  describe('getHandlerCount', () => {
    it('should return 0 for an unregistered type', () => {
      expect(router.getHandlerCount('unknown')).toBe(0);
    });

    it('should reflect current handler count', () => {
      const unsub = router.registerHandler('test', vi.fn());
      expect(router.getHandlerCount('test')).toBe(1);
      unsub();
      expect(router.getHandlerCount('test')).toBe(0);
    });
  });

  describe('getMessageLog', () => {
    it('should return empty array when no messages have been routed', () => {
      expect(router.getMessageLog()).toEqual([]);
    });

    it('should return all messages up to the limit', () => {
      for (let i = 0; i < 10; i++) {
        router.route(makeMessage({ id: `msg-${i}` }));
      }
      expect(router.getMessageLog(5)).toHaveLength(5);
      expect(router.getMessageLog(5)[0]!.id).toBe('msg-5');
    });

    it('should default limit to 50', () => {
      for (let i = 0; i < 100; i++) {
        router.route(makeMessage({ id: `msg-${i}` }));
      }
      expect(router.getMessageLog()).toHaveLength(50);
    });

    it('should cap at maxLogSize and evict oldest', () => {
      const smallRouter = new MessageRouter(5);
      for (let i = 0; i < 10; i++) {
        smallRouter.route(makeMessage({ id: `msg-${i}` }));
      }
      const log = smallRouter.getMessageLog(100);
      expect(log).toHaveLength(5);
      expect(log[0]!.id).toBe('msg-5');
      expect(log[4]!.id).toBe('msg-9');
    });

    it('should return fewer than limit if fewer messages exist', () => {
      router.route(makeMessage());
      expect(router.getMessageLog(50)).toHaveLength(1);
    });
  });
});

// ─────────────────────────────────────────────
// SeedBroadcaster
// ─────────────────────────────────────────────

describe('SeedBroadcaster', () => {
  let broadcaster: SeedBroadcaster;

  beforeEach(() => {
    broadcaster = new SeedBroadcaster();
  });

  describe('publishCreate', () => {
    it('should broadcast a seed.created event to subscribers', () => {
      const handler = vi.fn();
      broadcaster.subscribe(handler);
      const seed = makeSeed();
      broadcaster.publishCreate(seed, 'user-1');
      expect(handler).toHaveBeenCalledOnce();
      const event = handler.mock.calls[0]![0] as SeedBroadcastEvent;
      expect(event.type).toBe('seed.created');
      expect((event as { seed: UniversalSeed }).seed).toBe(seed);
      expect(event.senderId).toBe('user-1');
      expect(event.timestamp).toBeGreaterThan(0);
    });

    it('should add the event to recent events', () => {
      broadcaster.publishCreate(makeSeed(), 'user-1');
      const events = broadcaster.getRecentEvents();
      expect(events).toHaveLength(1);
      expect(events[0]!.type).toBe('seed.created');
    });
  });

  describe('publishUpdate', () => {
    it('should broadcast a seed.updated event', () => {
      const handler = vi.fn();
      broadcaster.subscribe(handler);
      const seed = makeSeed({ $name: 'Updated' });
      broadcaster.publishUpdate(seed, 'user-2');
      expect(handler).toHaveBeenCalledOnce();
      const event = handler.mock.calls[0]![0] as SeedBroadcastEvent;
      expect(event.type).toBe('seed.updated');
      expect(event.senderId).toBe('user-2');
    });
  });

  describe('publishDelete', () => {
    it('should broadcast a seed.deleted event with seedHash', () => {
      const handler = vi.fn();
      broadcaster.subscribe(handler);
      broadcaster.publishDelete('hash-123', 'user-3');
      expect(handler).toHaveBeenCalledOnce();
      const event = handler.mock.calls[0]![0] as SeedBroadcastEvent;
      expect(event.type).toBe('seed.deleted');
      expect((event as { seedHash: string }).seedHash).toBe('hash-123');
      expect(event.senderId).toBe('user-3');
    });
  });

  describe('subscribe', () => {
    it('should return an unsubscribe function', () => {
      const handler = vi.fn();
      const unsub = broadcaster.subscribe(handler);
      expect(typeof unsub).toBe('function');
    });

    it('should stop receiving events after unsubscribe', () => {
      const handler = vi.fn();
      const unsub = broadcaster.subscribe(handler);
      broadcaster.publishCreate(makeSeed(), 'user-1');
      expect(handler).toHaveBeenCalledOnce();
      unsub();
      broadcaster.publishCreate(makeSeed(), 'user-1');
      expect(handler).toHaveBeenCalledOnce(); // still 1
    });

    it('should support multiple subscribers', () => {
      const h1 = vi.fn();
      const h2 = vi.fn();
      const h3 = vi.fn();
      broadcaster.subscribe(h1);
      broadcaster.subscribe(h2);
      broadcaster.subscribe(h3);
      broadcaster.publishCreate(makeSeed(), 'user-1');
      expect(h1).toHaveBeenCalledOnce();
      expect(h2).toHaveBeenCalledOnce();
      expect(h3).toHaveBeenCalledOnce();
    });

    it('should catch errors from handlers without affecting others', () => {
      const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
      const throwing = () => {
        throw new Error('sub-error');
      };
      const normal = vi.fn();
      broadcaster.subscribe(throwing);
      broadcaster.subscribe(normal);
      broadcaster.publishCreate(makeSeed(), 'user-1');
      expect(normal).toHaveBeenCalledOnce();
      expect(spy).toHaveBeenCalled();
      spy.mockRestore();
    });

    it('should handle non-Error throws from handlers', () => {
      const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
      broadcaster.subscribe(() => {
        throw 42; // eslint-disable-line no-throw-literal
      });
      broadcaster.publishCreate(makeSeed(), 'user-1');
      expect(spy).toHaveBeenCalled();
      expect(spy.mock.calls[0]![0]).toContain('42');
      spy.mockRestore();
    });
  });

  describe('getRecentEvents', () => {
    it('should return empty array initially', () => {
      expect(broadcaster.getRecentEvents()).toEqual([]);
    });

    it('should return events in order of publication', () => {
      broadcaster.publishCreate(makeSeed({ $name: 'A' }), 'u1');
      broadcaster.publishUpdate(makeSeed({ $name: 'B' }), 'u2');
      broadcaster.publishDelete('hash-c', 'u3');
      const events = broadcaster.getRecentEvents();
      expect(events).toHaveLength(3);
      expect(events[0]!.type).toBe('seed.created');
      expect(events[1]!.type).toBe('seed.updated');
      expect(events[2]!.type).toBe('seed.deleted');
    });

    it('should respect the limit parameter', () => {
      for (let i = 0; i < 10; i++) {
        broadcaster.publishCreate(makeSeed(), `u${i}`);
      }
      expect(broadcaster.getRecentEvents(3)).toHaveLength(3);
    });

    it('should default limit to 50', () => {
      for (let i = 0; i < 100; i++) {
        broadcaster.publishCreate(makeSeed(), `u${i}`);
      }
      expect(broadcaster.getRecentEvents()).toHaveLength(50);
    });

    it('should cap at maxEvents and evict oldest', () => {
      const small = new SeedBroadcaster(5);
      for (let i = 0; i < 10; i++) {
        small.publishCreate(makeSeed(), `u${i}`);
      }
      const events = small.getRecentEvents(100);
      expect(events).toHaveLength(5);
      expect(events[0]!.senderId).toBe('u5');
    });
  });
});

// ─────────────────────────────────────────────
// PresenceServer
// ─────────────────────────────────────────────

describe('PresenceServer', () => {
  let presence: PresenceServer;

  beforeEach(() => {
    vi.useFakeTimers();
    presence = new PresenceServer();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('connect', () => {
    it('should register a user as online', () => {
      presence.connect('user-1');
      expect(presence.isOnline('user-1')).toBe(true);
    });

    it('should store metadata', () => {
      presence.connect('user-1', { region: 'us-east', displayName: 'Alice' });
      const online = presence.getOnline();
      expect(online).toHaveLength(1);
      expect(online[0]!.metadata.region).toBe('us-east');
      expect(online[0]!.metadata.displayName).toBe('Alice');
    });

    it('should default metadata to empty object', () => {
      presence.connect('user-1');
      const online = presence.getOnline();
      expect(online[0]!.metadata).toEqual({});
    });

    it('should overwrite a prior entry on reconnect', () => {
      presence.connect('user-1', { region: 'us-east' });
      presence.connect('user-1', { region: 'eu-west' });
      const online = presence.getOnline();
      expect(online).toHaveLength(1);
      expect(online[0]!.metadata.region).toBe('eu-west');
    });

    it('should record connectedAt and lastHeartbeat', () => {
      const now = Date.now();
      presence.connect('user-1');
      const online = presence.getOnline();
      expect(online[0]!.connectedAt).toBe(now);
      expect(online[0]!.lastHeartbeat).toBe(now);
    });
  });

  describe('disconnect', () => {
    it('should remove a user from online list', () => {
      presence.connect('user-1');
      presence.disconnect('user-1');
      expect(presence.isOnline('user-1')).toBe(false);
    });

    it('should be a no-op for unknown user', () => {
      presence.disconnect('no-such-user'); // should not throw
      expect(presence.getOnlineCount()).toBe(0);
    });
  });

  describe('heartbeat', () => {
    it('should update lastHeartbeat for a connected user', () => {
      presence.connect('user-1');
      vi.advanceTimersByTime(10_000);
      presence.heartbeat('user-1');
      const online = presence.getOnline();
      expect(online[0]!.lastHeartbeat).toBe(Date.now());
    });

    it('should be a no-op for a disconnected user', () => {
      presence.heartbeat('no-such-user'); // should not throw
    });

    it('should prevent stale auto-disconnect', () => {
      presence.connect('user-1');
      vi.advanceTimersByTime(50_000);
      presence.heartbeat('user-1');
      vi.advanceTimersByTime(50_000);
      // 100s total, but heartbeat was at 50s, so only 50s since last heartbeat
      expect(presence.isOnline('user-1')).toBe(true);
    });
  });

  describe('getOnline', () => {
    it('should return empty array when no users connected', () => {
      expect(presence.getOnline()).toEqual([]);
    });

    it('should return all connected users', () => {
      presence.connect('user-1');
      presence.connect('user-2');
      presence.connect('user-3');
      expect(presence.getOnline()).toHaveLength(3);
    });

    it('should prune stale users before returning', () => {
      presence.connect('user-1');
      presence.connect('user-2');
      vi.advanceTimersByTime(61_000); // past 60s threshold
      expect(presence.getOnline()).toEqual([]);
    });

    it('should return full entry data', () => {
      presence.connect('user-1', { region: 'us-east' });
      const online = presence.getOnline();
      expect(online[0]).toHaveProperty('userId', 'user-1');
      expect(online[0]).toHaveProperty('metadata');
      expect(online[0]).toHaveProperty('connectedAt');
      expect(online[0]).toHaveProperty('lastHeartbeat');
    });
  });

  describe('getOnlineCount', () => {
    it('should return 0 when empty', () => {
      expect(presence.getOnlineCount()).toBe(0);
    });

    it('should count connected non-stale users', () => {
      presence.connect('user-1');
      presence.connect('user-2');
      expect(presence.getOnlineCount()).toBe(2);
    });

    it('should exclude stale users', () => {
      presence.connect('user-1');
      presence.connect('user-2');
      vi.advanceTimersByTime(30_000);
      presence.heartbeat('user-1'); // user-1 refreshed
      vi.advanceTimersByTime(31_001); // user-2 now stale (61s total)
      expect(presence.getOnlineCount()).toBe(1);
    });
  });

  describe('isOnline', () => {
    it('should return true for a connected non-stale user', () => {
      presence.connect('user-1');
      expect(presence.isOnline('user-1')).toBe(true);
    });

    it('should return false for a disconnected user', () => {
      expect(presence.isOnline('user-1')).toBe(false);
    });

    it('should return false for a stale user', () => {
      presence.connect('user-1');
      vi.advanceTimersByTime(61_000);
      expect(presence.isOnline('user-1')).toBe(false);
    });

    it('should return true at exactly the threshold boundary', () => {
      presence.connect('user-1');
      vi.advanceTimersByTime(60_000); // exactly at threshold, not past it
      expect(presence.isOnline('user-1')).toBe(true);
    });

    it('should return false just past the threshold', () => {
      presence.connect('user-1');
      vi.advanceTimersByTime(60_001);
      expect(presence.isOnline('user-1')).toBe(false);
    });
  });

  describe('getRegionStats', () => {
    it('should return empty map when no users', () => {
      expect(presence.getRegionStats().size).toBe(0);
    });

    it('should group users by region', () => {
      presence.connect('u1', { region: 'us-east' });
      presence.connect('u2', { region: 'us-east' });
      presence.connect('u3', { region: 'eu-west' });
      const stats = presence.getRegionStats();
      expect(stats.get('us-east')).toBe(2);
      expect(stats.get('eu-west')).toBe(1);
    });

    it('should group users without region under "unknown"', () => {
      presence.connect('u1');
      presence.connect('u2', { displayName: 'Bob' }); // no region
      const stats = presence.getRegionStats();
      expect(stats.get('unknown')).toBe(2);
    });

    it('should exclude stale users from region stats', () => {
      presence.connect('u1', { region: 'us-east' });
      presence.connect('u2', { region: 'us-east' });
      vi.advanceTimersByTime(61_000);
      expect(presence.getRegionStats().size).toBe(0);
    });

    it('should mix known and unknown regions', () => {
      presence.connect('u1', { region: 'us-east' });
      presence.connect('u2');
      const stats = presence.getRegionStats();
      expect(stats.get('us-east')).toBe(1);
      expect(stats.get('unknown')).toBe(1);
    });
  });

  describe('stale auto-disconnect', () => {
    it('should auto-disconnect multiple stale users while keeping fresh ones', () => {
      presence.connect('u1');
      presence.connect('u2');
      presence.connect('u3');
      vi.advanceTimersByTime(30_000);
      presence.heartbeat('u2'); // only u2 refreshed
      vi.advanceTimersByTime(31_001); // u1 and u3 are now stale
      expect(presence.isOnline('u1')).toBe(false);
      expect(presence.isOnline('u2')).toBe(true);
      expect(presence.isOnline('u3')).toBe(false);
      expect(presence.getOnlineCount()).toBe(1);
    });
  });
});

// ─────────────────────────────────────────────
// GlobalDashboard
// ─────────────────────────────────────────────

describe('GlobalDashboard', () => {
  let presence: PresenceServer;
  let rm: RoomManager;
  let broadcaster: SeedBroadcaster;
  let router: MessageRouter;
  let dashboard: GlobalDashboard;

  beforeEach(() => {
    vi.useFakeTimers();
    presence = new PresenceServer();
    rm = new RoomManager(makeRng());
    broadcaster = new SeedBroadcaster();
    router = new MessageRouter();
    dashboard = new GlobalDashboard(presence, rm, broadcaster, router);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('recordMetric', () => {
    it('should create a new metric buffer on first record', () => {
      dashboard.recordMetric('cpu', 50);
      const metric = dashboard.getMetric('cpu');
      expect(metric).toBeDefined();
      expect(metric!.current).toBe(50);
      expect(metric!.samples).toBe(1);
    });

    it('should append samples to existing metric', () => {
      dashboard.recordMetric('cpu', 50);
      dashboard.recordMetric('cpu', 70);
      dashboard.recordMetric('cpu', 60);
      const metric = dashboard.getMetric('cpu');
      expect(metric!.samples).toBe(3);
      expect(metric!.current).toBe(60);
    });

    it('should track min value across all samples', () => {
      dashboard.recordMetric('latency', 100);
      dashboard.recordMetric('latency', 50);
      dashboard.recordMetric('latency', 200);
      expect(dashboard.getMetric('latency')!.min).toBe(50);
    });

    it('should track max value across all samples', () => {
      dashboard.recordMetric('latency', 100);
      dashboard.recordMetric('latency', 50);
      dashboard.recordMetric('latency', 200);
      expect(dashboard.getMetric('latency')!.max).toBe(200);
    });

    it('should compute rolling average', () => {
      dashboard.recordMetric('score', 10);
      dashboard.recordMetric('score', 20);
      dashboard.recordMetric('score', 30);
      expect(dashboard.getMetric('score')!.avg).toBe(20);
    });

    it('should evict oldest samples past MAX_METRIC_SAMPLES (100)', () => {
      for (let i = 1; i <= 110; i++) {
        dashboard.recordMetric('count', i);
      }
      const metric = dashboard.getMetric('count');
      expect(metric!.samples).toBe(100);
      expect(metric!.current).toBe(110);
    });

    it('should handle negative values', () => {
      dashboard.recordMetric('delta', -10);
      dashboard.recordMetric('delta', 5);
      expect(dashboard.getMetric('delta')!.min).toBe(-10);
      expect(dashboard.getMetric('delta')!.max).toBe(5);
    });

    it('should handle zero values', () => {
      dashboard.recordMetric('zero', 0);
      expect(dashboard.getMetric('zero')!.current).toBe(0);
      expect(dashboard.getMetric('zero')!.min).toBe(0);
      expect(dashboard.getMetric('zero')!.max).toBe(0);
    });
  });

  describe('getMetric', () => {
    it('should return undefined for unknown metric', () => {
      expect(dashboard.getMetric('unknown')).toBeUndefined();
    });

    it('should return a full MetricSummary', () => {
      dashboard.recordMetric('test', 10);
      dashboard.recordMetric('test', 20);
      const m = dashboard.getMetric('test')!;
      expect(m).toHaveProperty('current');
      expect(m).toHaveProperty('min');
      expect(m).toHaveProperty('max');
      expect(m).toHaveProperty('avg');
      expect(m).toHaveProperty('samples');
    });

    it('should report the last recorded value as current', () => {
      dashboard.recordMetric('test', 1);
      dashboard.recordMetric('test', 2);
      dashboard.recordMetric('test', 3);
      expect(dashboard.getMetric('test')!.current).toBe(3);
    });
  });

  describe('getSnapshot', () => {
    it('should return a valid DashboardSnapshot', () => {
      const snap = dashboard.getSnapshot();
      expect(snap).toHaveProperty('onlineUsers');
      expect(snap).toHaveProperty('activeRooms');
      expect(snap).toHaveProperty('messagesPerMinute');
      expect(snap).toHaveProperty('seedBroadcasts');
      expect(snap).toHaveProperty('uptime');
    });

    it('should reflect online user count', () => {
      presence.connect('u1');
      presence.connect('u2');
      expect(dashboard.getSnapshot().onlineUsers).toBe(2);
    });

    it('should reflect active room count', () => {
      rm.createRoom('a', 'u1');
      rm.createRoom('b', 'u2');
      expect(dashboard.getSnapshot().activeRooms).toBe(2);
    });

    it('should count messages from last minute', () => {
      const now = Date.now();
      router.route(makeMessage({ timestamp: now }));
      router.route(makeMessage({ id: 'msg-2', timestamp: now }));
      expect(dashboard.getSnapshot().messagesPerMinute).toBe(2);
    });

    it('should exclude messages older than one minute', () => {
      const now = Date.now();
      router.route(makeMessage({ timestamp: now - 120_000 })); // 2 min ago
      router.route(makeMessage({ id: 'msg-2', timestamp: now }));
      expect(dashboard.getSnapshot().messagesPerMinute).toBe(1);
    });

    it('should count seed broadcasts', () => {
      broadcaster.publishCreate(makeSeed(), 'u1');
      broadcaster.publishUpdate(makeSeed(), 'u1');
      expect(dashboard.getSnapshot().seedBroadcasts).toBe(2);
    });

    it('should report uptime in milliseconds', () => {
      vi.advanceTimersByTime(5000);
      expect(dashboard.getSnapshot().uptime).toBeGreaterThanOrEqual(5000);
    });
  });

  describe('resetMetrics', () => {
    it('should clear all recorded metrics', () => {
      dashboard.recordMetric('a', 1);
      dashboard.recordMetric('b', 2);
      dashboard.resetMetrics();
      expect(dashboard.getMetric('a')).toBeUndefined();
      expect(dashboard.getMetric('b')).toBeUndefined();
    });

    it('should not affect presence or rooms', () => {
      presence.connect('u1');
      rm.createRoom('lobby', 'u1');
      dashboard.resetMetrics();
      expect(dashboard.getSnapshot().onlineUsers).toBe(1);
      expect(dashboard.getSnapshot().activeRooms).toBe(1);
    });

    it('should allow recording new metrics after reset', () => {
      dashboard.recordMetric('x', 10);
      dashboard.resetMetrics();
      dashboard.recordMetric('x', 20);
      expect(dashboard.getMetric('x')!.current).toBe(20);
      expect(dashboard.getMetric('x')!.samples).toBe(1);
    });
  });

  describe('rolling window behavior', () => {
    it('should preserve min/max even after samples are evicted', () => {
      // Record a very low value first
      dashboard.recordMetric('rw', 1);
      // Fill up to eviction
      for (let i = 0; i < 105; i++) {
        dashboard.recordMetric('rw', 50);
      }
      // min should still be 1 (tracked separately from samples array)
      const m = dashboard.getMetric('rw')!;
      expect(m.min).toBe(1);
      expect(m.samples).toBe(100);
    });
  });
});

// ─────────────────────────────────────────────
// NetworkEngine
// ─────────────────────────────────────────────

describe('NetworkEngine', () => {
  let engine: NetworkEngine;

  beforeEach(() => {
    vi.useFakeTimers();
    engine = new NetworkEngine(makeRng('engine-test'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('construction', () => {
    it('should create all subsystems', () => {
      expect(engine.rooms).toBeInstanceOf(RoomManager);
      expect(engine.router).toBeInstanceOf(MessageRouter);
      expect(engine.broadcaster).toBeInstanceOf(SeedBroadcaster);
      expect(engine.presence).toBeInstanceOf(PresenceServer);
      expect(engine.dashboard).toBeInstanceOf(GlobalDashboard);
    });

    it('should work with default rng and event bus', () => {
      const defaultEngine = new NetworkEngine();
      expect(defaultEngine.rooms).toBeInstanceOf(RoomManager);
    });

    it('should accept a custom EventBus', () => {
      const bus = new EventBus();
      const customEngine = new NetworkEngine(makeRng(), bus);
      expect(customEngine.rooms).toBeInstanceOf(RoomManager);
    });
  });

  describe('send', () => {
    it('should route the message through the router', () => {
      const handler = vi.fn();
      engine.router.registerHandler('test', handler);
      const msg = makeMessage({ type: 'test' });
      engine.send(msg);
      expect(handler).toHaveBeenCalledWith(msg);
    });

    it('should record messages.sent metric', () => {
      engine.send(makeMessage());
      const metric = engine.dashboard.getMetric('messages.sent');
      expect(metric).toBeDefined();
      expect(metric!.current).toBe(1);
    });

    it('should count room broadcast if message has roomId', () => {
      const room = engine.rooms.createRoom('lobby', 'user-1');
      engine.rooms.joinRoom(room.id, 'user-2');
      const msg = makeMessage({ roomId: room.id });
      engine.send(msg);
      // Should not throw, message is broadcast to room members
      expect(engine.dashboard.getMetric('messages.sent')).toBeDefined();
    });

    it('should not call rooms.broadcast if no roomId', () => {
      const msg = makeMessage(); // no roomId
      engine.send(msg);
      // No error, just routes through router
      expect(engine.dashboard.getMetric('messages.sent')!.samples).toBe(1);
    });

    it('should handle roomId for non-existent room gracefully', () => {
      const msg = makeMessage({ roomId: 'non-existent' });
      engine.send(msg); // should not throw
    });
  });

  describe('broadcastToRoom', () => {
    it('should return the number of room members', () => {
      const room = engine.rooms.createRoom('lobby', 'user-1');
      engine.rooms.joinRoom(room.id, 'user-2');
      engine.rooms.joinRoom(room.id, 'user-3');
      const count = engine.broadcastToRoom(room.id, 'chat', { text: 'hello' }, 'user-1');
      expect(count).toBe(3);
    });

    it('should return 0 for non-existent room', () => {
      const count = engine.broadcastToRoom('no-room', 'chat', {}, 'user-1');
      expect(count).toBe(0);
    });

    it('should route the constructed message through the router', () => {
      const handler = vi.fn();
      engine.router.registerHandler('chat', handler);
      const room = engine.rooms.createRoom('lobby', 'user-1');
      engine.broadcastToRoom(room.id, 'chat', { text: 'hi' }, 'user-1');
      expect(handler).toHaveBeenCalledOnce();
      const msg = handler.mock.calls[0]![0] as NetworkMessage;
      expect(msg.type).toBe('chat');
      expect(msg.payload).toEqual({ text: 'hi' });
      expect(msg.senderId).toBe('user-1');
      expect(msg.roomId).toBe(room.id);
      expect(msg.id).toMatch(/^msg-/);
    });

    it('should record messages.broadcast metric', () => {
      const room = engine.rooms.createRoom('lobby', 'user-1');
      engine.broadcastToRoom(room.id, 'test', {}, 'user-1');
      const metric = engine.dashboard.getMetric('messages.broadcast');
      expect(metric).toBeDefined();
      expect(metric!.current).toBe(1);
    });

    it('should generate unique message ids for each broadcast', () => {
      const room = engine.rooms.createRoom('lobby', 'user-1');
      const handler = vi.fn();
      engine.router.registerHandler('ping', handler);
      engine.broadcastToRoom(room.id, 'ping', {}, 'user-1');
      engine.broadcastToRoom(room.id, 'ping', {}, 'user-1');
      const id1 = (handler.mock.calls[0]![0] as NetworkMessage).id;
      const id2 = (handler.mock.calls[1]![0] as NetworkMessage).id;
      expect(id1).not.toBe(id2);
    });

    it('should set timestamp on broadcast message', () => {
      const room = engine.rooms.createRoom('lobby', 'user-1');
      const handler = vi.fn();
      engine.router.registerHandler('test', handler);
      engine.broadcastToRoom(room.id, 'test', {}, 'user-1');
      const msg = handler.mock.calls[0]![0] as NetworkMessage;
      expect(msg.timestamp).toBe(Date.now());
    });
  });

  describe('integration: full workflow', () => {
    it('should support a complete multi-user room chat scenario', () => {
      // Users come online
      engine.presence.connect('alice', { region: 'us-east', displayName: 'Alice' });
      engine.presence.connect('bob', { region: 'eu-west', displayName: 'Bob' });
      engine.presence.connect('charlie', { region: 'us-east', displayName: 'Charlie' });

      expect(engine.presence.getOnlineCount()).toBe(3);

      // Create and join a room
      const room = engine.rooms.createRoom('General', 'alice');
      engine.rooms.joinRoom(room.id, 'bob');
      engine.rooms.joinRoom(room.id, 'charlie');

      // Register a message handler
      const messages: NetworkMessage[] = [];
      engine.router.registerHandler('chat', (msg) => messages.push(msg));

      // Broadcast messages
      engine.broadcastToRoom(room.id, 'chat', { text: 'Hello!' }, 'alice');
      engine.broadcastToRoom(room.id, 'chat', { text: 'Hi Alice!' }, 'bob');

      expect(messages).toHaveLength(2);

      // Check dashboard
      const snap = engine.dashboard.getSnapshot();
      expect(snap.onlineUsers).toBe(3);
      expect(snap.activeRooms).toBe(1);
      expect(snap.messagesPerMinute).toBe(2);

      // Bob disconnects
      engine.presence.disconnect('bob');
      engine.rooms.leaveRoom(room.id, 'bob');
      expect(engine.presence.getOnlineCount()).toBe(2);
      expect(engine.rooms.getRoom(room.id)!.members.size).toBe(2);
    });

    it('should support seed lifecycle broadcast in network', () => {
      const events: SeedBroadcastEvent[] = [];
      engine.broadcaster.subscribe((e) => events.push(e));

      const seed = makeSeed({ $name: 'NetworkSeed' });
      engine.broadcaster.publishCreate(seed, 'creator-1');
      engine.broadcaster.publishUpdate({ ...seed, $name: 'UpdatedSeed' } as UniversalSeed, 'creator-1');
      engine.broadcaster.publishDelete(seed.$hash, 'creator-1');

      expect(events).toHaveLength(3);
      expect(events[0]!.type).toBe('seed.created');
      expect(events[1]!.type).toBe('seed.updated');
      expect(events[2]!.type).toBe('seed.deleted');

      const snap = engine.dashboard.getSnapshot();
      expect(snap.seedBroadcasts).toBe(3);
    });

    it('should wire dashboard to all subsystems correctly', () => {
      engine.presence.connect('u1');
      engine.rooms.createRoom('r1', 'u1');
      engine.send(makeMessage({ timestamp: Date.now() }));
      engine.broadcaster.publishCreate(makeSeed(), 'u1');

      const snap = engine.dashboard.getSnapshot();
      expect(snap.onlineUsers).toBe(1);
      expect(snap.activeRooms).toBe(1);
      expect(snap.messagesPerMinute).toBeGreaterThanOrEqual(1);
      expect(snap.seedBroadcasts).toBe(1);
      expect(snap.uptime).toBeGreaterThanOrEqual(0);
    });
  });
});

// ─────────────────────────────────────────────
// Type export smoke tests
// ─────────────────────────────────────────────

describe('Type exports', () => {
  it('should export ConnectionState type (compile-time check)', () => {
    const state: ConnectionState = 'connected';
    expect(state).toBe('connected');
  });

  it('should export all ConnectionState values', () => {
    const states: ConnectionState[] = ['connecting', 'connected', 'disconnected', 'error'];
    expect(states).toHaveLength(4);
  });

  it('should export NetworkMessage interface', () => {
    const msg: NetworkMessage = makeMessage();
    expect(msg.id).toBeDefined();
  });

  it('should export Room interface', () => {
    const rm = new RoomManager(makeRng());
    const room: Room = rm.createRoom('test', 'u1');
    expect(room.id).toBeDefined();
  });

  it('should export MetricSummary interface', () => {
    const presence = new PresenceServer();
    const rooms = new RoomManager(makeRng());
    const broadcaster = new SeedBroadcaster();
    const router = new MessageRouter();
    const dashboard = new GlobalDashboard(presence, rooms, broadcaster, router);
    dashboard.recordMetric('test', 42);
    const metric: MetricSummary | undefined = dashboard.getMetric('test');
    expect(metric).toBeDefined();
  });

  it('should export DashboardSnapshot interface', () => {
    const presence = new PresenceServer();
    const rooms = new RoomManager(makeRng());
    const broadcaster = new SeedBroadcaster();
    const router = new MessageRouter();
    const dashboard = new GlobalDashboard(presence, rooms, broadcaster, router);
    const snap: DashboardSnapshot = dashboard.getSnapshot();
    expect(snap).toBeDefined();
  });

  it('should export handler types', () => {
    const mh: MessageHandler = () => {};
    const sh: SeedBroadcastHandler = () => {};
    expect(typeof mh).toBe('function');
    expect(typeof sh).toBe('function');
  });

  it('should export PresenceMetadata interface', () => {
    const meta: PresenceMetadata = { region: 'us-east', displayName: 'Test' };
    expect(meta.region).toBe('us-east');
  });
});
