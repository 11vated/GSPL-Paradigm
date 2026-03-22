import { describe, it, expect, vi } from 'vitest';
import type { ParadigmEvent, SeedCreatedEvent, SeedMutatedEvent } from '@paradigm/types';
import {
  EventBus,
  serializeEvent,
  deserializeEvent,
  formatSSE,
  createFilteredSubscription,
} from './index.js';

function makeSeedCreatedEvent(): SeedCreatedEvent {
  return {
    type: 'seed.created',
    seed: {
      $gst: '4.0',
      $domain: 'organism',
      $hash: 'abc123',
      $name: 'test-seed',
      $lineage: { generation: 0, parents: [], timestamp: 0 },
      genes: {},
      $metadata: { created: 0 },
    },
    timestamp: 1000,
  };
}

function makeSeedMutatedEvent(): SeedMutatedEvent {
  const seed = makeSeedCreatedEvent().seed;
  return {
    type: 'seed.mutated',
    original: seed,
    mutated: { ...seed, $hash: 'def456', $name: 'mutated-seed' },
    intensity: 0.5,
    timestamp: 2000,
  };
}

describe('EventBus', () => {
  it('emits events to registered handlers', () => {
    const bus = new EventBus();
    const handler = vi.fn();
    bus.on('seed.created', handler);

    const event = makeSeedCreatedEvent();
    bus.emit(event);

    expect(handler).toHaveBeenCalledWith(event);
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('does not call handler for different event types', () => {
    const bus = new EventBus();
    const handler = vi.fn();
    bus.on('seed.created', handler);
    bus.emit(makeSeedMutatedEvent());
    expect(handler).not.toHaveBeenCalled();
  });

  it('supports multiple handlers for same event', () => {
    const bus = new EventBus();
    const h1 = vi.fn();
    const h2 = vi.fn();
    bus.on('seed.created', h1);
    bus.on('seed.created', h2);
    bus.emit(makeSeedCreatedEvent());
    expect(h1).toHaveBeenCalledTimes(1);
    expect(h2).toHaveBeenCalledTimes(1);
  });

  it('on returns unsubscribe function', () => {
    const bus = new EventBus();
    const handler = vi.fn();
    const unsub = bus.on('seed.created', handler);
    bus.emit(makeSeedCreatedEvent());
    expect(handler).toHaveBeenCalledTimes(1);
    unsub();
    bus.emit(makeSeedCreatedEvent());
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('off removes handler', () => {
    const bus = new EventBus();
    const handler = vi.fn();
    bus.on('seed.created', handler);
    bus.off('seed.created', handler);
    bus.emit(makeSeedCreatedEvent());
    expect(handler).not.toHaveBeenCalled();
  });

  it('onAny receives all events', () => {
    const bus = new EventBus();
    const handler = vi.fn();
    bus.onAny(handler);
    bus.emit(makeSeedCreatedEvent());
    bus.emit(makeSeedMutatedEvent());
    expect(handler).toHaveBeenCalledTimes(2);
  });

  it('onAny returns unsubscribe', () => {
    const bus = new EventBus();
    const handler = vi.fn();
    const unsub = bus.onAny(handler);
    unsub();
    bus.emit(makeSeedCreatedEvent());
    expect(handler).not.toHaveBeenCalled();
  });

  it('onMany subscribes to multiple types', () => {
    const bus = new EventBus();
    const handler = vi.fn();
    bus.onMany(['seed.created', 'seed.mutated'], handler);
    bus.emit(makeSeedCreatedEvent());
    bus.emit(makeSeedMutatedEvent());
    expect(handler).toHaveBeenCalledTimes(2);
  });

  it('onMany returns single unsubscribe', () => {
    const bus = new EventBus();
    const handler = vi.fn();
    const unsub = bus.onMany(['seed.created', 'seed.mutated'], handler);
    unsub();
    bus.emit(makeSeedCreatedEvent());
    bus.emit(makeSeedMutatedEvent());
    expect(handler).not.toHaveBeenCalled();
  });

  it('once fires only once', () => {
    const bus = new EventBus();
    const handler = vi.fn();
    bus.once('seed.created', handler);
    bus.emit(makeSeedCreatedEvent());
    bus.emit(makeSeedCreatedEvent());
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('once can be cancelled before firing', () => {
    const bus = new EventBus();
    const handler = vi.fn();
    const unsub = bus.once('seed.created', handler);
    unsub();
    bus.emit(makeSeedCreatedEvent());
    expect(handler).not.toHaveBeenCalled();
  });

  it('emitAsync waits for async handlers', async () => {
    const bus = new EventBus();
    let resolved = false;
    bus.on('seed.created', async () => {
      await new Promise((r) => setTimeout(r, 10));
      resolved = true;
    });
    await bus.emitAsync(makeSeedCreatedEvent());
    expect(resolved).toBe(true);
  });

  it('handler errors do not prevent other handlers', () => {
    const bus = new EventBus();
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const h1 = vi.fn(() => { throw new Error('boom'); });
    const h2 = vi.fn();
    bus.on('seed.created', h1);
    bus.on('seed.created', h2);
    bus.emit(makeSeedCreatedEvent());
    expect(h2).toHaveBeenCalledTimes(1);
    errorSpy.mockRestore();
  });

  it('tracks totalEmitted', () => {
    const bus = new EventBus();
    expect(bus.totalEmitted).toBe(0);
    bus.emit(makeSeedCreatedEvent());
    bus.emit(makeSeedMutatedEvent());
    expect(bus.totalEmitted).toBe(2);
  });

  it('getHandlerCount includes wildcard', () => {
    const bus = new EventBus();
    bus.on('seed.created', vi.fn());
    bus.onAny(vi.fn());
    expect(bus.getHandlerCount('seed.created')).toBe(2);
  });

  it('getRegisteredTypes lists subscribed types', () => {
    const bus = new EventBus();
    bus.on('seed.created', vi.fn());
    bus.on('seed.mutated', vi.fn());
    expect(bus.getRegisteredTypes()).toContain('seed.created');
    expect(bus.getRegisteredTypes()).toContain('seed.mutated');
  });

  it('clear removes handlers for specific type', () => {
    const bus = new EventBus();
    const h = vi.fn();
    bus.on('seed.created', h);
    bus.clear('seed.created');
    bus.emit(makeSeedCreatedEvent());
    expect(h).not.toHaveBeenCalled();
  });

  it('clear() removes all handlers', () => {
    const bus = new EventBus();
    bus.on('seed.created', vi.fn());
    bus.onAny(vi.fn());
    bus.clear();
    expect(bus.getHandlerCount('seed.created')).toBe(0);
  });

  it('reset clears everything', () => {
    const bus = new EventBus({ maxReplaySize: 10 });
    bus.on('seed.created', vi.fn());
    bus.emit(makeSeedCreatedEvent());
    bus.reset();
    expect(bus.totalEmitted).toBe(0);
    expect(bus.getReplayBuffer().length).toBe(0);
  });
});

describe('EventBus replay', () => {
  it('does not record when maxReplaySize is 0', () => {
    const bus = new EventBus();
    bus.emit(makeSeedCreatedEvent());
    expect(bus.getReplayBuffer().length).toBe(0);
  });

  it('records events when maxReplaySize > 0', () => {
    const bus = new EventBus({ maxReplaySize: 10 });
    bus.emit(makeSeedCreatedEvent());
    bus.emit(makeSeedMutatedEvent());
    expect(bus.getReplayBuffer().length).toBe(2);
  });

  it('evicts oldest when buffer overflows', () => {
    const bus = new EventBus({ maxReplaySize: 2 });
    const e1 = makeSeedCreatedEvent();
    const e2 = makeSeedMutatedEvent();
    const e3 = { ...makeSeedCreatedEvent(), timestamp: 3000 };
    bus.emit(e1);
    bus.emit(e2);
    bus.emit(e3);
    const buffer = bus.getReplayBuffer();
    expect(buffer.length).toBe(2);
    expect(buffer[0]).toEqual(e2);
  });

  it('replay sends buffered events to handler', () => {
    const bus = new EventBus({ maxReplaySize: 10 });
    bus.emit(makeSeedCreatedEvent());
    bus.emit(makeSeedMutatedEvent());
    const received: ParadigmEvent[] = [];
    bus.replay((e) => { received.push(e); });
    expect(received.length).toBe(2);
  });

  it('replayType only replays matching events', () => {
    const bus = new EventBus({ maxReplaySize: 10 });
    bus.emit(makeSeedCreatedEvent());
    bus.emit(makeSeedMutatedEvent());
    const received: ParadigmEvent[] = [];
    bus.replayType('seed.created', (e) => { received.push(e); });
    expect(received.length).toBe(1);
    expect(received[0]!.type).toBe('seed.created');
  });

  it('clearReplayBuffer empties buffer', () => {
    const bus = new EventBus({ maxReplaySize: 10 });
    bus.emit(makeSeedCreatedEvent());
    bus.clearReplayBuffer();
    expect(bus.getReplayBuffer().length).toBe(0);
  });
});

describe('serialization', () => {
  it('serializeEvent produces valid JSON', () => {
    const event = makeSeedCreatedEvent();
    const json = serializeEvent(event);
    const parsed = JSON.parse(json);
    expect(parsed.type).toBe('seed.created');
  });

  it('deserializeEvent round-trips', () => {
    const event = makeSeedCreatedEvent();
    const json = serializeEvent(event);
    const parsed = deserializeEvent(json);
    expect(parsed).toEqual(event);
  });

  it('deserializeEvent returns null for invalid JSON', () => {
    expect(deserializeEvent('not json')).toBeNull();
  });

  it('deserializeEvent returns null for missing type', () => {
    expect(deserializeEvent('{"data": 1}')).toBeNull();
  });

  it('formatSSE produces SSE format', () => {
    const event = makeSeedCreatedEvent();
    const sse = formatSSE(event);
    expect(sse.startsWith('data: ')).toBe(true);
    expect(sse.endsWith('\n\n')).toBe(true);
  });
});

describe('createFilteredSubscription', () => {
  it('only passes events matching predicate', () => {
    const bus = new EventBus();
    const received: ParadigmEvent[] = [];
    createFilteredSubscription(
      bus,
      (e) => e.type === 'seed.created',
      (e) => { received.push(e); },
    );
    bus.emit(makeSeedCreatedEvent());
    bus.emit(makeSeedMutatedEvent());
    expect(received.length).toBe(1);
  });

  it('returns unsubscribe function', () => {
    const bus = new EventBus();
    const handler = vi.fn();
    const unsub = createFilteredSubscription(bus, () => true, handler);
    unsub();
    bus.emit(makeSeedCreatedEvent());
    expect(handler).not.toHaveBeenCalled();
  });
});
