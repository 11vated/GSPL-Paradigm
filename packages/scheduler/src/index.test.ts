import { describe, it, expect } from 'vitest';
import { MinHeap, WorldClock, EventScheduler } from './index.js';
import type { ScheduledEvent } from './index.js';

describe('MinHeap', () => {
  it('extracts elements in sorted order', () => {
    const heap = new MinHeap<number>((a, b) => a - b);
    const values = [5, 3, 8, 1, 9, 2, 7, 4, 6];
    for (const v of values) heap.push(v);

    const sorted: number[] = [];
    while (heap.size > 0) sorted.push(heap.pop()!);
    expect(sorted).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9]);
  });

  it('handles 1K elements correctly', () => {
    const heap = new MinHeap<number>((a, b) => a - b);
    for (let i = 0; i < 1000; i++) heap.push(Math.random());

    let prev = -Infinity;
    while (heap.size > 0) {
      const val = heap.pop()!;
      expect(val).toBeGreaterThanOrEqual(prev);
      prev = val;
    }
  });

  it('removes by predicate', () => {
    const heap = new MinHeap<number>((a, b) => a - b);
    for (let i = 0; i < 10; i++) heap.push(i);

    const removed = heap.removeWhere((v) => v % 2 === 0);
    expect(removed).toBe(5);
    expect(heap.size).toBe(5);

    const remaining: number[] = [];
    while (heap.size > 0) remaining.push(heap.pop()!);
    expect(remaining).toEqual([1, 3, 5, 7, 9]);
  });
});

describe('WorldClock', () => {
  it('tracks ticks and days', () => {
    const clock = new WorldClock({ ticksPerDay: 100 });
    expect(clock.tick).toBe(0);
    expect(clock.day).toBe(0);

    clock.advance(150);
    expect(clock.tick).toBe(150);
    expect(clock.day).toBe(1);
  });

  it('cycles through seasons', () => {
    const clock = new WorldClock({ ticksPerSeason: 10, seasonsPerYear: 4 });
    expect(clock.season).toBe('spring');

    clock.advance(10);
    expect(clock.season).toBe('summer');

    clock.advance(10);
    expect(clock.season).toBe('autumn');

    clock.advance(10);
    expect(clock.season).toBe('winter');

    clock.advance(10);
    expect(clock.season).toBe('spring'); // wraps
    expect(clock.year).toBe(1);
  });

  it('detects day/night', () => {
    const clock = new WorldClock({ ticksPerDay: 100 });
    clock.advance(30); // 30% of day
    expect(clock.isDay).toBe(true);

    clock.advance(50); // 80% of day
    expect(clock.isDay).toBe(false);
  });
});

describe('EventScheduler', () => {
  it('dispatches events in tick order', () => {
    const scheduler = new EventScheduler();
    scheduler.schedule('b', 20);
    scheduler.schedule('a', 10);
    scheduler.schedule('c', 30);

    scheduler.processTick(15);
    expect(scheduler.getStats().eventsProcessed).toBe(1); // 'a' at tick 10

    scheduler.processTick(10);
    expect(scheduler.getStats().eventsProcessed).toBe(2); // 'b' at tick 20

    scheduler.processTick(10);
    expect(scheduler.getStats().eventsProcessed).toBe(3); // 'c' at tick 30
  });

  it('respects priority within same tick', () => {
    const scheduler = new EventScheduler();
    const processed: string[] = [];

    scheduler.onCascade('track', (e) => {
      processed.push(e.payload['name'] as string);
      return [];
    });

    scheduler.schedule('track', 10, { name: 'low' }, { priority: 10 });
    scheduler.schedule('track', 10, { name: 'high' }, { priority: 1 });
    scheduler.schedule('track', 10, { name: 'mid' }, { priority: 5 });

    scheduler.processTick(15);
    expect(processed).toEqual(['high', 'mid', 'low']);
  });

  it('handles recurring events', () => {
    const scheduler = new EventScheduler();
    scheduler.schedule('pulse', 5, {}, { recurring: { intervalTicks: 5, maxRepeats: 3 } });

    scheduler.processTick(5);
    expect(scheduler.getStats().eventsProcessed).toBe(1);

    scheduler.processTick(5);
    expect(scheduler.getStats().eventsProcessed).toBe(2);

    scheduler.processTick(5);
    expect(scheduler.getStats().eventsProcessed).toBe(3);

    scheduler.processTick(5);
    expect(scheduler.getStats().eventsProcessed).toBe(4); // 1 original + 3 repeats

    scheduler.processTick(5);
    expect(scheduler.getStats().eventsProcessed).toBe(4); // no more
  });

  it('cancels events', () => {
    const scheduler = new EventScheduler();
    const id = scheduler.schedule('test', 10);

    expect(scheduler.cancel(id)).toBe(true);
    scheduler.processTick(15);
    expect(scheduler.getStats().eventsProcessed).toBe(0);
  });

  it('limits cascade depth', () => {
    const scheduler = new EventScheduler({ maxCascadeDepth: 3 });
    let depth = 0;

    scheduler.onCascade('chain', (e) => {
      depth++;
      return [{ ...e, id: `cascade_${depth}`, scheduledTick: e.scheduledTick, cancelled: false }];
    });

    scheduler.schedule('chain', 5);
    scheduler.processTick(10);

    expect(depth).toBeLessThanOrEqual(3);
  });

  it('reports stats', () => {
    const scheduler = new EventScheduler();
    for (let i = 0; i < 100; i++) scheduler.schedule('test', i + 1);

    scheduler.processTick(50);
    const stats = scheduler.getStats();
    expect(stats.eventsProcessed).toBe(50);
    expect(stats.currentQueueSize).toBe(50);
    expect(stats.maxQueueDepth).toBe(100);
  });
});
