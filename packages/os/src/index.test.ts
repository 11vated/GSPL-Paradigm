/**
 * Comprehensive test suite for @paradigm/os.
 * Covers: ProcessTable, Scheduler, MemoryManager, IPCBus, WorldGraph,
 * TickLoop, MasterControl, OSEngine.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  ProcessTable,
  Scheduler,
  MemoryManager,
  IPCBus,
  WorldGraph,
  TickLoop,
  MasterControl,
  OSEngine,
} from './index.js';
import { DeterministicRNG } from '@paradigm/rng';

// ─────────────────────────────────────────────
// ProcessTable
// ─────────────────────────────────────────────

describe('ProcessTable', () => {
  let table: ProcessTable;

  beforeEach(() => {
    table = new ProcessTable(new DeterministicRNG('test-pt'));
  });

  describe('spawn', () => {
    it('creates a process with status running', () => {
      const proc = table.spawn('worker', 'compute');
      expect(proc.status).toBe('running');
      expect(proc.name).toBe('worker');
      expect(proc.type).toBe('compute');
      expect(proc.progress).toBe(0);
    });

    it('generates unique IDs for each process', () => {
      const a = table.spawn('a', 'x');
      const b = table.spawn('b', 'x');
      expect(a.id).not.toBe(b.id);
    });

    it('sets startTime to a reasonable timestamp', () => {
      const before = Date.now();
      const proc = table.spawn('test', 'type');
      const after = Date.now();
      expect(proc.startTime).toBeGreaterThanOrEqual(before);
      expect(proc.startTime).toBeLessThanOrEqual(after);
    });

    it('stores metadata when provided', () => {
      const proc = table.spawn('w', 't', { key: 'val' });
      expect(proc.metadata).toEqual({ key: 'val' });
    });

    it('defaults metadata to empty object', () => {
      const proc = table.spawn('w', 't');
      expect(proc.metadata).toEqual({});
    });

    it('increments the table size', () => {
      expect(table.size).toBe(0);
      table.spawn('a', 't');
      expect(table.size).toBe(1);
      table.spawn('b', 't');
      expect(table.size).toBe(2);
    });

    it('works without providing an RNG (default constructor)', () => {
      const defaultTable = new ProcessTable();
      const proc = defaultTable.spawn('test', 'type');
      expect(proc.id).toContain('proc-');
    });
  });

  describe('kill', () => {
    it('sets process status to failed and sets endTime', () => {
      const proc = table.spawn('w', 't');
      expect(table.kill(proc.id)).toBe(true);
      expect(proc.status).toBe('failed');
      expect(proc.endTime).toBeDefined();
    });

    it('returns false for unknown id', () => {
      expect(table.kill('nonexistent')).toBe(false);
    });
  });

  describe('pause', () => {
    it('pauses a running process', () => {
      const proc = table.spawn('w', 't');
      expect(table.pause(proc.id)).toBe(true);
      expect(proc.status).toBe('paused');
    });

    it('returns false if process is not running', () => {
      const proc = table.spawn('w', 't');
      table.pause(proc.id);
      expect(table.pause(proc.id)).toBe(false); // already paused
    });

    it('returns false for unknown id', () => {
      expect(table.pause('nope')).toBe(false);
    });
  });

  describe('resume', () => {
    it('resumes a paused process', () => {
      const proc = table.spawn('w', 't');
      table.pause(proc.id);
      expect(table.resume(proc.id)).toBe(true);
      expect(proc.status).toBe('running');
    });

    it('returns false if process is not paused', () => {
      const proc = table.spawn('w', 't');
      expect(table.resume(proc.id)).toBe(false); // running, not paused
    });

    it('returns false for unknown id', () => {
      expect(table.resume('nope')).toBe(false);
    });
  });

  describe('complete', () => {
    it('marks a process as completed with progress 1', () => {
      const proc = table.spawn('w', 't');
      expect(table.complete(proc.id)).toBe(true);
      expect(proc.status).toBe('completed');
      expect(proc.progress).toBe(1);
      expect(proc.endTime).toBeDefined();
    });

    it('returns false for unknown id', () => {
      expect(table.complete('nope')).toBe(false);
    });
  });

  describe('fail', () => {
    it('marks a process as failed with a reason', () => {
      const proc = table.spawn('w', 't');
      expect(table.fail(proc.id, 'out of memory')).toBe(true);
      expect(proc.status).toBe('failed');
      expect(proc.metadata['failReason']).toBe('out of memory');
      expect(proc.endTime).toBeDefined();
    });

    it('returns false for unknown id', () => {
      expect(table.fail('nope', 'reason')).toBe(false);
    });
  });

  describe('updateProgress', () => {
    it('updates progress within bounds', () => {
      const proc = table.spawn('w', 't');
      expect(table.updateProgress(proc.id, 0.5)).toBe(true);
      expect(proc.progress).toBe(0.5);
    });

    it('clamps progress below 0', () => {
      const proc = table.spawn('w', 't');
      table.updateProgress(proc.id, -0.5);
      expect(proc.progress).toBe(0);
    });

    it('clamps progress above 1', () => {
      const proc = table.spawn('w', 't');
      table.updateProgress(proc.id, 1.5);
      expect(proc.progress).toBe(1);
    });

    it('returns false for unknown id', () => {
      expect(table.updateProgress('nope', 0.5)).toBe(false);
    });
  });

  describe('get', () => {
    it('retrieves a process by id', () => {
      const proc = table.spawn('w', 't');
      expect(table.get(proc.id)).toBe(proc);
    });

    it('returns undefined for unknown id', () => {
      expect(table.get('nope')).toBeUndefined();
    });
  });

  describe('getByType', () => {
    it('filters processes by type', () => {
      table.spawn('a', 'compute');
      table.spawn('b', 'io');
      table.spawn('c', 'compute');
      const computes = table.getByType('compute');
      expect(computes).toHaveLength(2);
      expect(computes.every((p) => p.type === 'compute')).toBe(true);
    });

    it('returns empty array for unknown type', () => {
      table.spawn('a', 'x');
      expect(table.getByType('y')).toHaveLength(0);
    });
  });

  describe('getActive', () => {
    it('returns running and paused processes', () => {
      const a = table.spawn('a', 't');
      const b = table.spawn('b', 't');
      const c = table.spawn('c', 't');
      table.pause(b.id);
      table.complete(c.id);
      const active = table.getActive();
      expect(active).toHaveLength(2);
      expect(active.map((p) => p.id).sort()).toEqual([a.id, b.id].sort());
    });
  });

  describe('getAll', () => {
    it('returns all processes regardless of status', () => {
      const a = table.spawn('a', 't');
      const b = table.spawn('b', 't');
      table.kill(b.id);
      expect(table.getAll()).toHaveLength(2);
    });

    it('returns empty array when no processes', () => {
      expect(table.getAll()).toEqual([]);
    });
  });
});

// ─────────────────────────────────────────────
// Scheduler
// ─────────────────────────────────────────────

describe('Scheduler', () => {
  let scheduler: Scheduler;

  beforeEach(() => {
    scheduler = new Scheduler();
  });

  describe('schedule', () => {
    it('returns a task ID', () => {
      const id = scheduler.schedule('task1', 5, () => {});
      expect(id).toContain('task-');
    });

    it('generates unique IDs', () => {
      const a = scheduler.schedule('a', 1, () => {});
      const b = scheduler.schedule('b', 1, () => {});
      expect(a).not.toBe(b);
    });

    it('increments pending count', () => {
      expect(scheduler.pendingCount).toBe(0);
      scheduler.schedule('t', 1, () => {});
      expect(scheduler.pendingCount).toBe(1);
    });
  });

  describe('cancel', () => {
    it('removes a pending task', () => {
      const id = scheduler.schedule('t', 1, () => {});
      expect(scheduler.cancel(id)).toBe(true);
      expect(scheduler.pendingCount).toBe(0);
    });

    it('returns false for unknown task', () => {
      expect(scheduler.cancel('task-999')).toBe(false);
    });
  });

  describe('runNext', () => {
    it('executes the highest-priority task', async () => {
      const order: string[] = [];
      scheduler.schedule('low', 1, () => order.push('low'));
      scheduler.schedule('high', 10, () => order.push('high'));
      scheduler.schedule('mid', 5, () => order.push('mid'));

      await scheduler.runNext();
      expect(order).toEqual(['high']);
      expect(scheduler.pendingCount).toBe(2);
    });

    it('does nothing when no tasks are pending', async () => {
      await expect(scheduler.runNext()).resolves.toBeUndefined();
    });

    it('handles async callbacks', async () => {
      let called = false;
      scheduler.schedule('async', 1, async () => {
        called = true;
      });
      await scheduler.runNext();
      expect(called).toBe(true);
    });
  });

  describe('runAll', () => {
    it('executes all tasks in priority order', async () => {
      const order: string[] = [];
      scheduler.schedule('low', 1, () => order.push('low'));
      scheduler.schedule('high', 10, () => order.push('high'));
      scheduler.schedule('mid', 5, () => order.push('mid'));

      await scheduler.runAll();
      expect(order).toEqual(['high', 'mid', 'low']);
      expect(scheduler.pendingCount).toBe(0);
    });

    it('handles empty queue', async () => {
      await expect(scheduler.runAll()).resolves.toBeUndefined();
    });

    it('handles mixed sync and async callbacks', async () => {
      const order: number[] = [];
      scheduler.schedule('sync', 2, () => order.push(1));
      scheduler.schedule('async', 1, async () => order.push(2));
      await scheduler.runAll();
      expect(order).toEqual([1, 2]);
    });
  });

  describe('getPending', () => {
    it('returns a copy of pending tasks', () => {
      scheduler.schedule('t', 1, () => {});
      const pending = scheduler.getPending();
      expect(pending).toHaveLength(1);
      expect(pending[0].name).toBe('t');
      // Ensure it is a copy
      pending.pop();
      expect(scheduler.pendingCount).toBe(1);
    });

    it('returns task entries with correct fields', () => {
      scheduler.schedule('myTask', 42, () => {});
      const [task] = scheduler.getPending();
      expect(task.name).toBe('myTask');
      expect(task.priority).toBe(42);
      expect(task.scheduledAt).toBeGreaterThan(0);
    });
  });
});

// ─────────────────────────────────────────────
// MemoryManager
// ─────────────────────────────────────────────

describe('MemoryManager', () => {
  let mem: MemoryManager;

  beforeEach(() => {
    mem = new MemoryManager(1000); // 1000 byte budget for easy testing
  });

  describe('allocate', () => {
    it('allocates bytes for a process', () => {
      expect(mem.allocate('p1', 100)).toBe(true);
      expect(mem.getUsage('p1')).toBe(100);
    });

    it('rejects allocation exceeding budget', () => {
      expect(mem.allocate('p1', 1001)).toBe(false);
      expect(mem.getUsage('p1')).toBe(0);
    });

    it('rejects negative allocations', () => {
      expect(mem.allocate('p1', -10)).toBe(false);
    });

    it('accumulates allocations for same process', () => {
      mem.allocate('p1', 400);
      mem.allocate('p1', 300);
      expect(mem.getUsage('p1')).toBe(700);
    });

    it('considers total usage across processes', () => {
      mem.allocate('p1', 600);
      expect(mem.allocate('p2', 500)).toBe(false); // 600+500 > 1000
      expect(mem.allocate('p2', 400)).toBe(true);
    });

    it('allows allocation of exactly remaining budget', () => {
      mem.allocate('p1', 500);
      expect(mem.allocate('p2', 500)).toBe(true);
    });

    it('rejects allocation of zero+1 when fully used', () => {
      mem.allocate('p1', 1000);
      expect(mem.allocate('p2', 1)).toBe(false);
    });

    it('allows allocation of zero bytes', () => {
      expect(mem.allocate('p1', 0)).toBe(true);
    });
  });

  describe('release', () => {
    it('frees allocated memory and returns bytes freed', () => {
      mem.allocate('p1', 500);
      expect(mem.release('p1')).toBe(500);
      expect(mem.getUsage('p1')).toBe(0);
    });

    it('returns 0 for unknown process', () => {
      expect(mem.release('unknown')).toBe(0);
    });

    it('allows re-allocation after release', () => {
      mem.allocate('p1', 900);
      mem.release('p1');
      expect(mem.allocate('p2', 900)).toBe(true);
    });
  });

  describe('getUsage', () => {
    it('returns 0 for unknown process', () => {
      expect(mem.getUsage('unknown')).toBe(0);
    });
  });

  describe('getTotalUsage', () => {
    it('returns sum across all processes', () => {
      mem.allocate('p1', 200);
      mem.allocate('p2', 300);
      expect(mem.getTotalUsage()).toBe(500);
    });

    it('returns 0 when nothing allocated', () => {
      expect(mem.getTotalUsage()).toBe(0);
    });
  });

  describe('getBudget / setBudget', () => {
    it('returns the initial budget', () => {
      expect(mem.getBudget()).toBe(1000);
    });

    it('updates the budget', () => {
      mem.setBudget(2000);
      expect(mem.getBudget()).toBe(2000);
    });

    it('uses default budget when not specified', () => {
      const defaultMem = new MemoryManager();
      expect(defaultMem.getBudget()).toBe(536870912);
    });
  });

  describe('getUtilization', () => {
    it('returns ratio of usage to budget', () => {
      mem.allocate('p1', 250);
      expect(mem.getUtilization()).toBe(0.25);
    });

    it('returns 0 when budget is 0', () => {
      mem.setBudget(0);
      expect(mem.getUtilization()).toBe(0);
    });

    it('returns 0 when budget is negative', () => {
      mem.setBudget(-100);
      expect(mem.getUtilization()).toBe(0);
    });

    it('returns 0 when nothing allocated', () => {
      expect(mem.getUtilization()).toBe(0);
    });

    it('returns 1.0 at full capacity', () => {
      mem.allocate('p1', 1000);
      expect(mem.getUtilization()).toBe(1);
    });
  });
});

// ─────────────────────────────────────────────
// IPCBus
// ─────────────────────────────────────────────

describe('IPCBus', () => {
  let ipc: IPCBus;

  beforeEach(() => {
    ipc = new IPCBus();
  });

  describe('send', () => {
    it('delivers message to matching subscriber', () => {
      let received: unknown = null;
      let sender = '';
      ipc.subscribe('proc-b', 'chat', (payload, fromId) => {
        received = payload;
        sender = fromId;
      });
      ipc.send('proc-a', 'proc-b', 'chat', { text: 'hello' });
      expect(received).toEqual({ text: 'hello' });
      expect(sender).toBe('proc-a');
    });

    it('does not deliver to wrong channel', () => {
      let called = false;
      ipc.subscribe('proc-b', 'other', () => {
        called = true;
      });
      ipc.send('proc-a', 'proc-b', 'chat', 'hi');
      expect(called).toBe(false);
    });

    it('does not deliver to wrong process', () => {
      let called = false;
      ipc.subscribe('proc-c', 'chat', () => {
        called = true;
      });
      ipc.send('proc-a', 'proc-b', 'chat', 'hi');
      expect(called).toBe(false);
    });

    it('increments message count for recipient', () => {
      ipc.subscribe('proc-b', 'chat', () => {});
      ipc.send('proc-a', 'proc-b', 'chat', 'msg1');
      ipc.send('proc-a', 'proc-b', 'chat', 'msg2');
      expect(ipc.getMessageCount('proc-b')).toBe(2);
    });

    it('increments message count even without matching subscriber', () => {
      ipc.send('proc-a', 'proc-b', 'chat', 'msg');
      expect(ipc.getMessageCount('proc-b')).toBe(1);
    });

    it('handles handler errors gracefully', () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      ipc.subscribe('proc-b', 'chat', () => {
        throw new Error('handler boom');
      });
      expect(() => ipc.send('proc-a', 'proc-b', 'chat', 'hi')).not.toThrow();
      expect(consoleSpy).toHaveBeenCalled();
      consoleSpy.mockRestore();
    });

    it('handles non-Error throws in handler', () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      ipc.subscribe('proc-b', 'chat', () => {
        throw 'string error'; // eslint-disable-line no-throw-literal
      });
      ipc.send('proc-a', 'proc-b', 'chat', 'hi');
      expect(consoleSpy).toHaveBeenCalled();
      consoleSpy.mockRestore();
    });

    it('delivers to multiple subscribers on same channel', () => {
      let count = 0;
      ipc.subscribe('proc-b', 'chat', () => count++);
      ipc.subscribe('proc-b', 'chat', () => count++);
      ipc.send('proc-a', 'proc-b', 'chat', 'hi');
      expect(count).toBe(2);
    });
  });

  describe('subscribe', () => {
    it('returns an unsubscribe function', () => {
      let count = 0;
      const unsub = ipc.subscribe('proc-b', 'chat', () => count++);
      ipc.send('proc-a', 'proc-b', 'chat', 'msg1');
      expect(count).toBe(1);
      unsub();
      ipc.send('proc-a', 'proc-b', 'chat', 'msg2');
      expect(count).toBe(1);
    });

    it('unsubscribe is idempotent', () => {
      const unsub = ipc.subscribe('proc-b', 'chat', () => {});
      unsub();
      unsub(); // second call should not throw
    });
  });

  describe('broadcast', () => {
    it('delivers to all subscribers on channel regardless of processId', () => {
      const received: string[] = [];
      ipc.subscribe('proc-a', 'news', () => received.push('a'));
      ipc.subscribe('proc-b', 'news', () => received.push('b'));
      ipc.subscribe('proc-c', 'other', () => received.push('c'));
      ipc.broadcast('system', 'news', { headline: 'test' });
      expect(received).toEqual(['a', 'b']);
    });

    it('increments message count for each subscriber', () => {
      ipc.subscribe('proc-a', 'news', () => {});
      ipc.subscribe('proc-b', 'news', () => {});
      ipc.broadcast('system', 'news', 'data');
      expect(ipc.getMessageCount('proc-a')).toBe(1);
      expect(ipc.getMessageCount('proc-b')).toBe(1);
    });

    it('handles handler errors gracefully', () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      ipc.subscribe('proc-a', 'news', () => {
        throw new Error('boom');
      });
      expect(() => ipc.broadcast('system', 'news', 'data')).not.toThrow();
      consoleSpy.mockRestore();
    });

    it('handles non-Error throws in broadcast handler', () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      ipc.subscribe('proc-a', 'news', () => {
        throw 42; // eslint-disable-line no-throw-literal
      });
      ipc.broadcast('system', 'news', 'data');
      expect(consoleSpy).toHaveBeenCalled();
      consoleSpy.mockRestore();
    });
  });

  describe('getMessageCount', () => {
    it('returns 0 for unknown process', () => {
      expect(ipc.getMessageCount('unknown')).toBe(0);
    });
  });
});

// ─────────────────────────────────────────────
// WorldGraph
// ─────────────────────────────────────────────

describe('WorldGraph', () => {
  let graph: WorldGraph;

  beforeEach(() => {
    graph = new WorldGraph();
  });

  describe('addWorld', () => {
    it('adds a world to the graph', () => {
      graph.addWorld('w1', 'World One');
      expect(graph.size).toBe(1);
    });

    it('ignores duplicate world ids', () => {
      graph.addWorld('w1', 'World One');
      graph.addWorld('w1', 'Different Name');
      expect(graph.size).toBe(1);
    });
  });

  describe('removeWorld', () => {
    it('removes a world and returns true', () => {
      graph.addWorld('w1', 'World One');
      expect(graph.removeWorld('w1')).toBe(true);
      expect(graph.size).toBe(0);
    });

    it('returns false for unknown world', () => {
      expect(graph.removeWorld('nope')).toBe(false);
    });

    it('removes dependency edges pointing to removed world', () => {
      graph.addWorld('w1', 'A');
      graph.addWorld('w2', 'B');
      graph.addDependency('w2', 'w1'); // w2 depends on w1
      graph.removeWorld('w1');
      expect(graph.getDependencies('w2')).toEqual([]);
    });
  });

  describe('addDependency', () => {
    it('adds a dependency edge', () => {
      graph.addWorld('w1', 'A');
      graph.addWorld('w2', 'B');
      graph.addDependency('w2', 'w1');
      expect(graph.getDependencies('w2')).toEqual(['w1']);
    });

    it('throws if source world not found', () => {
      graph.addWorld('w1', 'A');
      expect(() => graph.addDependency('w99', 'w1')).toThrow(/source world/);
    });

    it('throws if target world not found', () => {
      graph.addWorld('w1', 'A');
      expect(() => graph.addDependency('w1', 'w99')).toThrow(/target world/);
    });

    it('does not create duplicate edges', () => {
      graph.addWorld('w1', 'A');
      graph.addWorld('w2', 'B');
      graph.addDependency('w2', 'w1');
      graph.addDependency('w2', 'w1');
      expect(graph.getDependencies('w2')).toEqual(['w1']);
    });
  });

  describe('getDependencies', () => {
    it('returns empty for world with no dependencies', () => {
      graph.addWorld('w1', 'A');
      expect(graph.getDependencies('w1')).toEqual([]);
    });

    it('returns empty for unknown world', () => {
      expect(graph.getDependencies('unknown')).toEqual([]);
    });
  });

  describe('getDependents', () => {
    it('returns worlds that depend on the given world', () => {
      graph.addWorld('w1', 'A');
      graph.addWorld('w2', 'B');
      graph.addWorld('w3', 'C');
      graph.addDependency('w2', 'w1');
      graph.addDependency('w3', 'w1');
      const dependents = graph.getDependents('w1');
      expect(dependents.sort()).toEqual(['w2', 'w3']);
    });

    it('returns empty for world with no dependents', () => {
      graph.addWorld('w1', 'A');
      expect(graph.getDependents('w1')).toEqual([]);
    });
  });

  describe('getTopologicalOrder', () => {
    it('returns correct order for linear chain', () => {
      graph.addWorld('w1', 'A');
      graph.addWorld('w2', 'B');
      graph.addWorld('w3', 'C');
      graph.addDependency('w2', 'w1'); // w2 depends on w1
      graph.addDependency('w3', 'w2'); // w3 depends on w2
      const order = graph.getTopologicalOrder();
      expect(order.indexOf('w1')).toBeLessThan(order.indexOf('w2'));
      expect(order.indexOf('w2')).toBeLessThan(order.indexOf('w3'));
    });

    it('returns empty array when cycle detected', () => {
      graph.addWorld('w1', 'A');
      graph.addWorld('w2', 'B');
      graph.addDependency('w1', 'w2');
      graph.addDependency('w2', 'w1');
      expect(graph.getTopologicalOrder()).toEqual([]);
    });

    it('returns all nodes for graph with no edges', () => {
      graph.addWorld('w1', 'A');
      graph.addWorld('w2', 'B');
      const order = graph.getTopologicalOrder();
      expect(order).toHaveLength(2);
    });

    it('handles diamond dependency', () => {
      graph.addWorld('w1', 'A');
      graph.addWorld('w2', 'B');
      graph.addWorld('w3', 'C');
      graph.addWorld('w4', 'D');
      graph.addDependency('w2', 'w1');
      graph.addDependency('w3', 'w1');
      graph.addDependency('w4', 'w2');
      graph.addDependency('w4', 'w3');
      const order = graph.getTopologicalOrder();
      expect(order).toHaveLength(4);
      expect(order.indexOf('w1')).toBeLessThan(order.indexOf('w2'));
      expect(order.indexOf('w1')).toBeLessThan(order.indexOf('w3'));
      expect(order.indexOf('w2')).toBeLessThan(order.indexOf('w4'));
      expect(order.indexOf('w3')).toBeLessThan(order.indexOf('w4'));
    });

    it('handles empty graph', () => {
      expect(graph.getTopologicalOrder()).toEqual([]);
    });
  });

  describe('hasCycle', () => {
    it('returns false for empty graph', () => {
      expect(graph.hasCycle()).toBe(false);
    });

    it('returns false for acyclic graph', () => {
      graph.addWorld('w1', 'A');
      graph.addWorld('w2', 'B');
      graph.addDependency('w2', 'w1');
      expect(graph.hasCycle()).toBe(false);
    });

    it('returns true for cyclic graph', () => {
      graph.addWorld('w1', 'A');
      graph.addWorld('w2', 'B');
      graph.addDependency('w1', 'w2');
      graph.addDependency('w2', 'w1');
      expect(graph.hasCycle()).toBe(true);
    });

    it('detects 3-node cycle', () => {
      graph.addWorld('a', 'A');
      graph.addWorld('b', 'B');
      graph.addWorld('c', 'C');
      graph.addDependency('a', 'b');
      graph.addDependency('b', 'c');
      graph.addDependency('c', 'a');
      expect(graph.hasCycle()).toBe(true);
    });
  });

  describe('getAll', () => {
    it('returns all worlds with their dependency lists', () => {
      graph.addWorld('w1', 'A');
      graph.addWorld('w2', 'B');
      graph.addDependency('w2', 'w1');
      const all = graph.getAll();
      expect(all).toHaveLength(2);
      const w2 = all.find((w) => w.id === 'w2');
      expect(w2?.dependencies).toEqual(['w1']);
    });
  });

  describe('size', () => {
    it('returns 0 for empty graph', () => {
      expect(graph.size).toBe(0);
    });
  });
});

// ─────────────────────────────────────────────
// TickLoop
// ─────────────────────────────────────────────

describe('TickLoop', () => {
  let loop: TickLoop;

  beforeEach(() => {
    loop = new TickLoop(60);
  });

  describe('constructor', () => {
    it('sets target FPS', () => {
      expect(loop.getTargetFPS()).toBe(60);
    });

    it('calculates fixed dt from FPS', () => {
      expect(loop.getFixedDt()).toBeCloseTo(1 / 60);
    });

    it('clamps FPS to at least 1', () => {
      const slow = new TickLoop(0);
      expect(slow.getTargetFPS()).toBe(1);
    });

    it('uses default 60 FPS', () => {
      const def = new TickLoop();
      expect(def.getTargetFPS()).toBe(60);
    });
  });

  describe('addSystem', () => {
    it('registers a system', () => {
      loop.addSystem('physics', () => {});
      expect(loop.getSystemNames()).toEqual(['physics']);
    });

    it('sorts systems by descending priority', () => {
      loop.addSystem('render', () => {}, 1);
      loop.addSystem('physics', () => {}, 10);
      loop.addSystem('audio', () => {}, 5);
      expect(loop.getSystemNames()).toEqual(['physics', 'audio', 'render']);
    });

    it('replaces existing system with same name', () => {
      let callCount = 0;
      loop.addSystem('sys', () => callCount++);
      loop.addSystem('sys', () => (callCount += 10));
      loop.tick();
      expect(callCount).toBe(10);
    });
  });

  describe('removeSystem', () => {
    it('removes a system and returns true', () => {
      loop.addSystem('sys', () => {});
      expect(loop.removeSystem('sys')).toBe(true);
      expect(loop.getSystemNames()).toEqual([]);
    });

    it('returns false for unknown system', () => {
      expect(loop.removeSystem('nope')).toBe(false);
    });
  });

  describe('tick', () => {
    it('increments tick count', () => {
      loop.tick();
      loop.tick();
      expect(loop.getTickCount()).toBe(2);
    });

    it('calls all systems with fixed dt', () => {
      const dts: number[] = [];
      loop.addSystem('sys', (dt) => dts.push(dt));
      loop.tick();
      expect(dts).toHaveLength(1);
      expect(dts[0]).toBeCloseTo(1 / 60);
    });

    it('calls systems in priority order', () => {
      const order: string[] = [];
      loop.addSystem('low', () => order.push('low'), 1);
      loop.addSystem('high', () => order.push('high'), 10);
      loop.tick();
      expect(order).toEqual(['high', 'low']);
    });

    it('handles system errors gracefully', () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      let secondCalled = false;
      loop.addSystem('bad', () => { throw new Error('oops'); }, 10);
      loop.addSystem('good', () => { secondCalled = true; }, 1);
      loop.tick();
      expect(secondCalled).toBe(true);
      expect(consoleSpy).toHaveBeenCalled();
      consoleSpy.mockRestore();
    });

    it('handles non-Error throws in system', () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      loop.addSystem('bad', () => { throw 'string error'; }); // eslint-disable-line no-throw-literal
      loop.tick();
      expect(consoleSpy).toHaveBeenCalled();
      consoleSpy.mockRestore();
    });

    it('records dt samples for averaging', () => {
      loop.tick();
      expect(loop.getAverageDt()).toBeGreaterThanOrEqual(0);
    });
  });

  describe('getTickCount', () => {
    it('returns 0 initially', () => {
      expect(loop.getTickCount()).toBe(0);
    });
  });

  describe('getAverageDt', () => {
    it('returns 0 with no samples', () => {
      expect(loop.getAverageDt()).toBe(0);
    });

    it('computes average over multiple ticks', () => {
      loop.tick();
      loop.tick();
      loop.tick();
      // Average should be some non-negative number
      expect(loop.getAverageDt()).toBeGreaterThanOrEqual(0);
    });
  });

  describe('reset', () => {
    it('resets tick count, systems, and timing data', () => {
      loop.addSystem('sys', () => {});
      loop.tick();
      loop.tick();
      loop.reset();
      expect(loop.getTickCount()).toBe(0);
      expect(loop.getSystemNames()).toEqual([]);
      expect(loop.getAverageDt()).toBe(0);
    });
  });

  describe('getSystemNames', () => {
    it('returns empty array when no systems', () => {
      expect(loop.getSystemNames()).toEqual([]);
    });
  });
});

// ─────────────────────────────────────────────
// MasterControl
// ─────────────────────────────────────────────

describe('MasterControl', () => {
  let control: MasterControl;

  beforeEach(() => {
    control = new MasterControl();
  });

  describe('registerSubsystem', () => {
    it('registers a subsystem with zero metrics', () => {
      control.registerSubsystem('physics');
      const metrics = control.getSubsystemMetrics();
      expect(metrics).toHaveLength(1);
      expect(metrics[0]).toEqual({ name: 'physics', cpu: 0, memory: 0, latency: 0 });
    });

    it('does not overwrite existing subsystem on re-register', () => {
      control.registerSubsystem('physics');
      control.reportMetrics('physics', 0.5, 100, 10);
      control.registerSubsystem('physics');
      const metrics = control.getSubsystemMetrics();
      expect(metrics[0].cpu).toBe(0.5); // not overwritten
    });
  });

  describe('reportMetrics', () => {
    it('updates metrics for a subsystem', () => {
      control.reportMetrics('render', 0.8, 2048, 16);
      const metrics = control.getSubsystemMetrics();
      expect(metrics).toHaveLength(1);
      expect(metrics[0]).toEqual({ name: 'render', cpu: 0.8, memory: 2048, latency: 16 });
    });

    it('registers subsystem implicitly if not already registered', () => {
      control.reportMetrics('new-sys', 0.1, 100, 5);
      expect(control.getSubsystemMetrics()).toHaveLength(1);
    });
  });

  describe('getSubsystemMetrics', () => {
    it('returns empty array when no subsystems', () => {
      expect(control.getSubsystemMetrics()).toEqual([]);
    });

    it('returns metrics for all subsystems', () => {
      control.registerSubsystem('a');
      control.registerSubsystem('b');
      expect(control.getSubsystemMetrics()).toHaveLength(2);
    });
  });

  describe('getHealthReport', () => {
    it('reports healthy when all subsystems are within limits', () => {
      control.reportMetrics('sys1', 0.5, 100, 50);
      control.reportMetrics('sys2', 0.3, 200, 100);
      const report = control.getHealthReport();
      expect(report.healthy).toBe(true);
      expect(report.subsystems).toBe(2);
      expect(report.totalMemory).toBe(300);
      expect(report.uptime).toBeGreaterThanOrEqual(0);
    });

    it('reports unhealthy when CPU >= 0.95', () => {
      control.reportMetrics('hot', 0.95, 100, 50);
      expect(control.getHealthReport().healthy).toBe(false);
    });

    it('reports unhealthy when latency >= 1000', () => {
      control.reportMetrics('slow', 0.1, 100, 1000);
      expect(control.getHealthReport().healthy).toBe(false);
    });

    it('reports healthy when no subsystems registered', () => {
      const report = control.getHealthReport();
      expect(report.healthy).toBe(true);
      expect(report.subsystems).toBe(0);
      expect(report.totalMemory).toBe(0);
    });

    it('reports correct uptime', () => {
      const report = control.getHealthReport();
      expect(report.uptime).toBeGreaterThanOrEqual(0);
      expect(report.uptime).toBeLessThan(5000); // should be nearly instant
    });

    it('marks unhealthy with CPU exactly at threshold', () => {
      control.reportMetrics('edge', 0.95, 0, 0);
      expect(control.getHealthReport().healthy).toBe(false);
    });

    it('stays healthy with CPU just below threshold', () => {
      control.reportMetrics('edge', 0.949, 0, 0);
      expect(control.getHealthReport().healthy).toBe(true);
    });

    it('marks unhealthy with latency exactly at threshold', () => {
      control.reportMetrics('edge', 0, 0, 1000);
      expect(control.getHealthReport().healthy).toBe(false);
    });

    it('stays healthy with latency just below threshold', () => {
      control.reportMetrics('edge', 0, 0, 999);
      expect(control.getHealthReport().healthy).toBe(true);
    });
  });
});

// ─────────────────────────────────────────────
// OSEngine
// ─────────────────────────────────────────────

describe('OSEngine', () => {
  let os: OSEngine;

  beforeEach(() => {
    os = new OSEngine(new DeterministicRNG('test-os'));
  });

  it('creates all subsystems', () => {
    expect(os.processes).toBeInstanceOf(ProcessTable);
    expect(os.scheduler).toBeInstanceOf(Scheduler);
    expect(os.memory).toBeInstanceOf(MemoryManager);
    expect(os.ipc).toBeInstanceOf(IPCBus);
    expect(os.worlds).toBeInstanceOf(WorldGraph);
    expect(os.tickLoop).toBeInstanceOf(TickLoop);
    expect(os.control).toBeInstanceOf(MasterControl);
  });

  it('constructs with defaults when no args provided', () => {
    const defaultOs = new OSEngine();
    expect(defaultOs.processes).toBeInstanceOf(ProcessTable);
  });

  describe('getSystemInfo', () => {
    it('returns zeroed info initially', () => {
      const info = os.getSystemInfo();
      expect(info.processCount).toBe(0);
      expect(info.activeProcessCount).toBe(0);
      expect(info.pendingTasks).toBe(0);
      expect(info.memoryUsed).toBe(0);
      expect(info.memoryBudget).toBe(536870912);
      expect(info.memoryUtilization).toBe(0);
      expect(info.worldCount).toBe(0);
      expect(info.tickCount).toBe(0);
      expect(info.averageTickDt).toBe(0);
      expect(info.subsystemCount).toBe(0);
      expect(info.healthy).toBe(true);
      expect(info.uptime).toBeGreaterThanOrEqual(0);
    });

    it('reflects process spawns', () => {
      os.processes.spawn('worker', 'compute');
      const info = os.getSystemInfo();
      expect(info.processCount).toBe(1);
      expect(info.activeProcessCount).toBe(1);
    });

    it('reflects scheduled tasks', () => {
      os.scheduler.schedule('task', 1, () => {});
      expect(os.getSystemInfo().pendingTasks).toBe(1);
    });

    it('reflects memory allocations', () => {
      os.memory.allocate('p1', 1024);
      const info = os.getSystemInfo();
      expect(info.memoryUsed).toBe(1024);
      expect(info.memoryUtilization).toBeGreaterThan(0);
    });

    it('reflects world additions', () => {
      os.worlds.addWorld('w1', 'Test');
      expect(os.getSystemInfo().worldCount).toBe(1);
    });

    it('reflects tick count', () => {
      os.tickLoop.tick();
      os.tickLoop.tick();
      expect(os.getSystemInfo().tickCount).toBe(2);
    });

    it('reflects subsystem registrations', () => {
      os.control.registerSubsystem('render');
      expect(os.getSystemInfo().subsystemCount).toBe(1);
    });

    it('reflects health status', () => {
      os.control.reportMetrics('overloaded', 0.99, 0, 0);
      expect(os.getSystemInfo().healthy).toBe(false);
    });
  });

  describe('shutdown', () => {
    it('resets tick loop', () => {
      os.tickLoop.addSystem('sys', () => {});
      os.tickLoop.tick();
      os.shutdown();
      expect(os.tickLoop.getTickCount()).toBe(0);
      expect(os.tickLoop.getSystemNames()).toEqual([]);
    });

    it('kills all active processes', () => {
      os.processes.spawn('a', 't');
      os.processes.spawn('b', 't');
      const c = os.processes.spawn('c', 't');
      os.processes.complete(c.id);
      os.shutdown();
      const active = os.processes.getActive();
      expect(active).toHaveLength(0);
    });

    it('kills paused processes too', () => {
      const proc = os.processes.spawn('a', 't');
      os.processes.pause(proc.id);
      os.shutdown();
      expect(os.processes.getActive()).toHaveLength(0);
    });

    it('handles shutdown with no active processes', () => {
      expect(() => os.shutdown()).not.toThrow();
    });
  });

  describe('wiring integration', () => {
    it('process table uses forked RNG', () => {
      const rng = new DeterministicRNG('seed');
      const engine = new OSEngine(rng);
      const p1 = engine.processes.spawn('test', 'type');
      expect(p1.id).toContain('proc-');
    });

    it('subsystems interact correctly', async () => {
      // Spawn a process, allocate memory, schedule a task, tick
      const proc = os.processes.spawn('worker', 'compute');
      os.memory.allocate(proc.id, 2048);
      let taskRan = false;
      os.scheduler.schedule('work', 5, () => {
        taskRan = true;
      });
      os.tickLoop.addSystem('main', () => {});
      os.tickLoop.tick();
      await os.scheduler.runAll();

      expect(taskRan).toBe(true);
      expect(os.getSystemInfo().tickCount).toBe(1);
      expect(os.getSystemInfo().memoryUsed).toBe(2048);
    });
  });
});
