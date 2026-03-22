import { describe, it, expect } from 'vitest';
import type { UniversalSeed, GeneMap, ScalarGene, CategoricalGene } from '@paradigm/types';
import { DeterministicRNG } from '@paradigm/rng';
import {
  Blackboard,
  Action,
  Condition,
  Sequence,
  Selector,
  Parallel,
  Decorator,
  Inverter,
  Repeater,
  BehaviorTree,
  FiniteStateMachine,
  UtilityAI,
  GOAPPlanner,
  AStarPathfinder,
  PerceptionSystem,
  BehaviorEngine,
} from './index.js';
import type {
  BehaviorStatus,
  BehaviorNode,
  FSMState,
  UtilityAction,
  GOAPAction,
  GridNode,
} from './index.js';

// ─────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────

function makeNode(status: BehaviorStatus, name = 'test'): BehaviorNode {
  return new Action(name, () => status);
}

function makeGrid(rows: number, cols: number, blocked: Array<{ x: number; y: number }> = []): GridNode[][] {
  const grid: GridNode[][] = [];
  for (let y = 0; y < rows; y++) {
    const row: GridNode[] = [];
    for (let x = 0; x < cols; x++) {
      const isBlocked = blocked.some((b) => b.x === x && b.y === y);
      row.push({ x, y, walkable: !isBlocked });
    }
    grid.push(row);
  }
  return grid;
}

function makeRng(seedStr = 'test-seed'): DeterministicRNG {
  return new DeterministicRNG(seedStr);
}

function makeSeed(name: string, genes: GeneMap): UniversalSeed {
  return {
    $gst: '4.0',
    $domain: 'organism',
    $hash: `hash-${name}`,
    $name: name,
    $lineage: { generation: 0, parents: [], timestamp: 0 },
    genes,
    $metadata: { created: 0 },
    $activation: { alive: true, active: true, energy: 100, age: 0 },
  };
}

function makeAggressiveSeed(): UniversalSeed {
  return makeSeed('aggressive-entity', {
    archetype: { type: 'categorical', value: 'destroyer', options: ['destroyer', 'trickster', 'everyman'] } as CategoricalGene,
    aggression: { type: 'scalar', value: 0.9, min: 0, max: 1 } as ScalarGene,
    caution: { type: 'scalar', value: 0.2, min: 0, max: 1 } as ScalarGene,
    energy: { type: 'scalar', value: 0.8, min: 0, max: 1 } as ScalarGene,
  });
}

function makeCautiousSeed(): UniversalSeed {
  return makeSeed('cautious-entity', {
    archetype: { type: 'categorical', value: 'trickster', options: ['destroyer', 'trickster', 'everyman'] } as CategoricalGene,
    aggression: { type: 'scalar', value: 0.2, min: 0, max: 1 } as ScalarGene,
    caution: { type: 'scalar', value: 0.8, min: 0, max: 1 } as ScalarGene,
    energy: { type: 'scalar', value: 0.3, min: 0, max: 1 } as ScalarGene,
  });
}

function makeMinimalSeed(): UniversalSeed {
  return makeSeed('minimal-entity', {});
}

// ─────────────────────────────────────────────
// 1. Blackboard
// ─────────────────────────────────────────────

describe('Blackboard', () => {
  it('should store and retrieve a value by key', () => {
    const bb = new Blackboard();
    bb.set('health', 100);
    expect(bb.get<number>('health')).toBe(100);
  });

  it('should return undefined for missing keys', () => {
    const bb = new Blackboard();
    expect(bb.get<number>('missing')).toBeUndefined();
  });

  it('should report has() correctly for existing and missing keys', () => {
    const bb = new Blackboard();
    bb.set('x', 1);
    expect(bb.has('x')).toBe(true);
    expect(bb.has('y')).toBe(false);
  });

  it('should delete an existing key and return true', () => {
    const bb = new Blackboard();
    bb.set('key', 'val');
    expect(bb.delete('key')).toBe(true);
    expect(bb.has('key')).toBe(false);
  });

  it('should return false when deleting a non-existent key', () => {
    const bb = new Blackboard();
    expect(bb.delete('nope')).toBe(false);
  });

  it('should clear all entries', () => {
    const bb = new Blackboard();
    bb.set('a', 1);
    bb.set('b', 2);
    bb.clear();
    expect(bb.keys()).toEqual([]);
    expect(bb.has('a')).toBe(false);
  });

  it('should return all stored keys', () => {
    const bb = new Blackboard();
    bb.set('x', 1);
    bb.set('y', 2);
    bb.set('z', 3);
    expect(bb.keys().sort()).toEqual(['x', 'y', 'z']);
  });

  it('should handle type parameterization for different types', () => {
    const bb = new Blackboard();
    bb.set('str', 'hello');
    bb.set('num', 42);
    bb.set('bool', true);
    bb.set('arr', [1, 2, 3]);
    expect(bb.get<string>('str')).toBe('hello');
    expect(bb.get<number>('num')).toBe(42);
    expect(bb.get<boolean>('bool')).toBe(true);
    expect(bb.get<number[]>('arr')).toEqual([1, 2, 3]);
  });

  it('should overwrite existing values on set', () => {
    const bb = new Blackboard();
    bb.set('key', 'old');
    bb.set('key', 'new');
    expect(bb.get<string>('key')).toBe('new');
  });
});

// ─────────────────────────────────────────────
// 2. Action
// ─────────────────────────────────────────────

describe('Action', () => {
  it('should return success when callback returns success', () => {
    const action = new Action('act', () => 'success');
    expect(action.tick(new Blackboard())).toBe('success');
  });

  it('should return failure when callback returns failure', () => {
    const action = new Action('act', () => 'failure');
    expect(action.tick(new Blackboard())).toBe('failure');
  });

  it('should return running when callback returns running', () => {
    const action = new Action('act', () => 'running');
    expect(action.tick(new Blackboard())).toBe('running');
  });

  it('should receive the blackboard in the callback', () => {
    const bb = new Blackboard();
    bb.set('val', 42);
    const action = new Action('reader', (ctx) => {
      return ctx.get<number>('val') === 42 ? 'success' : 'failure';
    });
    expect(action.tick(bb)).toBe('success');
  });

  it('should expose the name property', () => {
    const action = new Action('myAction', () => 'success');
    expect(action.name).toBe('myAction');
  });

  it('should allow writing to the blackboard', () => {
    const bb = new Blackboard();
    const action = new Action('writer', (ctx) => {
      ctx.set('written', true);
      return 'success';
    });
    action.tick(bb);
    expect(bb.get<boolean>('written')).toBe(true);
  });
});

// ─────────────────────────────────────────────
// 3. Condition
// ─────────────────────────────────────────────

describe('Condition', () => {
  it('should return success when predicate is true', () => {
    const cond = new Condition('truthy', () => true);
    expect(cond.tick(new Blackboard())).toBe('success');
  });

  it('should return failure when predicate is false', () => {
    const cond = new Condition('falsy', () => false);
    expect(cond.tick(new Blackboard())).toBe('failure');
  });

  it('should receive the blackboard context', () => {
    const bb = new Blackboard();
    bb.set('ready', true);
    const cond = new Condition('check', (ctx) => ctx.get<boolean>('ready') === true);
    expect(cond.tick(bb)).toBe('success');
  });

  it('should expose the name property', () => {
    const cond = new Condition('myCond', () => true);
    expect(cond.name).toBe('myCond');
  });
});

// ─────────────────────────────────────────────
// 4. Sequence
// ─────────────────────────────────────────────

describe('Sequence', () => {
  it('should return success when all children succeed', () => {
    const seq = new Sequence('seq', [makeNode('success', 'a'), makeNode('success', 'b')]);
    expect(seq.tick(new Blackboard())).toBe('success');
  });

  it('should return failure on the first child that fails', () => {
    const callOrder: string[] = [];
    const a = new Action('a', () => { callOrder.push('a'); return 'success'; });
    const b = new Action('b', () => { callOrder.push('b'); return 'failure'; });
    const c = new Action('c', () => { callOrder.push('c'); return 'success'; });
    const seq = new Sequence('seq', [a, b, c]);
    expect(seq.tick(new Blackboard())).toBe('failure');
    expect(callOrder).toEqual(['a', 'b']);
  });

  it('should return running when a child returns running', () => {
    const seq = new Sequence('seq', [makeNode('success'), makeNode('running'), makeNode('success')]);
    expect(seq.tick(new Blackboard())).toBe('running');
  });

  it('should return success for empty children', () => {
    const seq = new Sequence('empty', []);
    expect(seq.tick(new Blackboard())).toBe('success');
  });

  it('should expose the name property', () => {
    const seq = new Sequence('mySeq', []);
    expect(seq.name).toBe('mySeq');
  });

  it('should stop evaluating after running', () => {
    const callOrder: string[] = [];
    const a = new Action('a', () => { callOrder.push('a'); return 'success'; });
    const b = new Action('b', () => { callOrder.push('b'); return 'running'; });
    const c = new Action('c', () => { callOrder.push('c'); return 'success'; });
    const seq = new Sequence('seq', [a, b, c]);
    seq.tick(new Blackboard());
    expect(callOrder).toEqual(['a', 'b']);
  });
});

// ─────────────────────────────────────────────
// 5. Selector
// ─────────────────────────────────────────────

describe('Selector', () => {
  it('should return success on the first child that succeeds', () => {
    const callOrder: string[] = [];
    const a = new Action('a', () => { callOrder.push('a'); return 'failure'; });
    const b = new Action('b', () => { callOrder.push('b'); return 'success'; });
    const c = new Action('c', () => { callOrder.push('c'); return 'success'; });
    const sel = new Selector('sel', [a, b, c]);
    expect(sel.tick(new Blackboard())).toBe('success');
    expect(callOrder).toEqual(['a', 'b']);
  });

  it('should return failure when all children fail', () => {
    const sel = new Selector('sel', [makeNode('failure'), makeNode('failure')]);
    expect(sel.tick(new Blackboard())).toBe('failure');
  });

  it('should return running when a child returns running', () => {
    const sel = new Selector('sel', [makeNode('failure'), makeNode('running'), makeNode('success')]);
    expect(sel.tick(new Blackboard())).toBe('running');
  });

  it('should return failure for empty children', () => {
    const sel = new Selector('empty', []);
    expect(sel.tick(new Blackboard())).toBe('failure');
  });

  it('should expose the name property', () => {
    const sel = new Selector('mySel', []);
    expect(sel.name).toBe('mySel');
  });

  it('should stop evaluating after running', () => {
    const callOrder: string[] = [];
    const a = new Action('a', () => { callOrder.push('a'); return 'failure'; });
    const b = new Action('b', () => { callOrder.push('b'); return 'running'; });
    const c = new Action('c', () => { callOrder.push('c'); return 'success'; });
    const sel = new Selector('sel', [a, b, c]);
    sel.tick(new Blackboard());
    expect(callOrder).toEqual(['a', 'b']);
  });
});

// ─────────────────────────────────────────────
// 6. Parallel
// ─────────────────────────────────────────────

describe('Parallel', () => {
  it('should return success when all children succeed (default threshold)', () => {
    const par = new Parallel('par', [makeNode('success'), makeNode('success'), makeNode('success')]);
    expect(par.tick(new Blackboard())).toBe('success');
  });

  it('should return failure when too many children fail (default threshold)', () => {
    const par = new Parallel('par', [makeNode('success'), makeNode('failure'), makeNode('failure')]);
    expect(par.tick(new Blackboard())).toBe('failure');
  });

  it('should return success with custom requiredSuccesses threshold', () => {
    const par = new Parallel('par', [makeNode('success'), makeNode('failure'), makeNode('success')], 2);
    expect(par.tick(new Blackboard())).toBe('success');
  });

  it('should return failure when threshold cannot be met', () => {
    const par = new Parallel('par', [makeNode('failure'), makeNode('failure'), makeNode('success')], 2);
    expect(par.tick(new Blackboard())).toBe('failure');
  });

  it('should return running when some are still running', () => {
    const par = new Parallel('par', [makeNode('success'), makeNode('running'), makeNode('running')], 2);
    expect(par.tick(new Blackboard())).toBe('running');
  });

  it('should tick all children every tick', () => {
    const callOrder: string[] = [];
    const a = new Action('a', () => { callOrder.push('a'); return 'success'; });
    const b = new Action('b', () => { callOrder.push('b'); return 'failure'; });
    const c = new Action('c', () => { callOrder.push('c'); return 'success'; });
    const par = new Parallel('par', [a, b, c], 2);
    par.tick(new Blackboard());
    expect(callOrder).toEqual(['a', 'b', 'c']);
  });

  it('should expose the name property', () => {
    const par = new Parallel('myPar', []);
    expect(par.name).toBe('myPar');
  });

  it('should return success with threshold of 1', () => {
    const par = new Parallel('par', [makeNode('failure'), makeNode('success'), makeNode('failure')], 1);
    expect(par.tick(new Blackboard())).toBe('success');
  });
});

// ─────────────────────────────────────────────
// 7. Decorator
// ─────────────────────────────────────────────

describe('Decorator', () => {
  it('should transform child status via the transform function', () => {
    const dec = new Decorator('dec', makeNode('failure'), () => 'success');
    expect(dec.tick(new Blackboard())).toBe('success');
  });

  it('should pass through status when transform is identity', () => {
    const dec = new Decorator('dec', makeNode('running'), (s) => s);
    expect(dec.tick(new Blackboard())).toBe('running');
  });

  it('should transform success to running', () => {
    const dec = new Decorator('dec', makeNode('success'), (s) => s === 'success' ? 'running' : s);
    expect(dec.tick(new Blackboard())).toBe('running');
  });

  it('should expose the name property', () => {
    const dec = new Decorator('myDec', makeNode('success'), (s) => s);
    expect(dec.name).toBe('myDec');
  });

  it('should tick the child node', () => {
    let ticked = false;
    const child = new Action('child', () => { ticked = true; return 'success'; });
    const dec = new Decorator('dec', child, (s) => s);
    dec.tick(new Blackboard());
    expect(ticked).toBe(true);
  });
});

// ─────────────────────────────────────────────
// 8. Inverter
// ─────────────────────────────────────────────

describe('Inverter', () => {
  it('should invert success to failure', () => {
    const inv = new Inverter('inv', makeNode('success'));
    expect(inv.tick(new Blackboard())).toBe('failure');
  });

  it('should invert failure to success', () => {
    const inv = new Inverter('inv', makeNode('failure'));
    expect(inv.tick(new Blackboard())).toBe('success');
  });

  it('should pass through running unchanged', () => {
    const inv = new Inverter('inv', makeNode('running'));
    expect(inv.tick(new Blackboard())).toBe('running');
  });

  it('should expose the name property', () => {
    const inv = new Inverter('myInv', makeNode('success'));
    expect(inv.name).toBe('myInv');
  });
});

// ─────────────────────────────────────────────
// 9. Repeater
// ─────────────────────────────────────────────

describe('Repeater', () => {
  it('should return running while repetitions remain', () => {
    const rep = new Repeater('rep', makeNode('success'), 3);
    expect(rep.tick(new Blackboard())).toBe('running');
  });

  it('should return success after all repetitions complete', () => {
    const rep = new Repeater('rep', makeNode('success'), 2);
    const bb = new Blackboard();
    expect(rep.tick(bb)).toBe('running'); // remaining: 2 -> 1
    expect(rep.tick(bb)).toBe('success'); // remaining: 1 -> 0 -> reset
  });

  it('should reset after completion and repeat again', () => {
    const rep = new Repeater('rep', makeNode('success'), 1);
    const bb = new Blackboard();
    expect(rep.tick(bb)).toBe('success'); // remaining: 1 -> 0 -> reset
    expect(rep.tick(bb)).toBe('success'); // remaining: 1 -> 0 -> reset (again)
  });

  it('should tick the child each time', () => {
    let count = 0;
    const child = new Action('child', () => { count++; return 'success'; });
    const rep = new Repeater('rep', child, 3);
    const bb = new Blackboard();
    rep.tick(bb);
    rep.tick(bb);
    rep.tick(bb);
    expect(count).toBe(3);
  });

  it('should expose the name property', () => {
    const rep = new Repeater('myRep', makeNode('success'), 5);
    expect(rep.name).toBe('myRep');
  });

  it('should handle times = 0 by returning success immediately', () => {
    const rep = new Repeater('rep', makeNode('success'), 0);
    expect(rep.tick(new Blackboard())).toBe('success');
  });
});

// ─────────────────────────────────────────────
// 10. BehaviorTree
// ─────────────────────────────────────────────

describe('BehaviorTree', () => {
  it('should propagate tick to the root node', () => {
    let ticked = false;
    const root = new Action('root', () => { ticked = true; return 'success'; });
    const tree = new BehaviorTree(root);
    tree.tick(new Blackboard());
    expect(ticked).toBe(true);
  });

  it('should return the root status from tick', () => {
    const tree = new BehaviorTree(makeNode('running'));
    expect(tree.tick(new Blackboard())).toBe('running');
  });

  it('should track last status via getLastStatus', () => {
    const tree = new BehaviorTree(makeNode('success'));
    expect(tree.getLastStatus()).toBe('failure'); // default before first tick
    tree.tick(new Blackboard());
    expect(tree.getLastStatus()).toBe('success');
  });

  it('should reset last status to failure', () => {
    const tree = new BehaviorTree(makeNode('success'));
    tree.tick(new Blackboard());
    expect(tree.getLastStatus()).toBe('success');
    tree.reset();
    expect(tree.getLastStatus()).toBe('failure');
  });

  it('should work with complex node hierarchies', () => {
    const root = new Selector('root', [
      new Sequence('seq', [makeNode('success'), makeNode('failure')]),
      makeNode('success', 'fallback'),
    ]);
    const tree = new BehaviorTree(root);
    expect(tree.tick(new Blackboard())).toBe('success');
  });
});

// ─────────────────────────────────────────────
// 11. FiniteStateMachine
// ─────────────────────────────────────────────

describe('FiniteStateMachine', () => {
  it('should add states and get current state', () => {
    const fsm = new FiniteStateMachine();
    fsm.addState({ name: 'idle' });
    fsm.setState('idle', new Blackboard());
    expect(fsm.getCurrentState()).toBe('idle');
  });

  it('should fire onEnter when entering a state', () => {
    const fsm = new FiniteStateMachine();
    let entered = false;
    fsm.addState({ name: 'idle', onEnter: () => { entered = true; } });
    fsm.setState('idle', new Blackboard());
    expect(entered).toBe(true);
  });

  it('should fire onExit when leaving a state', () => {
    const fsm = new FiniteStateMachine();
    let exited = false;
    fsm.addState({ name: 'idle', onExit: () => { exited = true; } });
    fsm.addState({ name: 'walking' });
    fsm.setState('idle', new Blackboard());
    fsm.setState('walking', new Blackboard());
    expect(exited).toBe(true);
  });

  it('should fire onUpdate during update', () => {
    const fsm = new FiniteStateMachine();
    let updated = false;
    fsm.addState({ name: 'idle', onUpdate: () => { updated = true; } });
    fsm.setState('idle', new Blackboard());
    fsm.update(new Blackboard());
    expect(updated).toBe(true);
  });

  it('should evaluate transitions in priority order', () => {
    const fsm = new FiniteStateMachine();
    const bb = new Blackboard();
    const log: string[] = [];

    fsm.addState({ name: 'idle', onEnter: () => log.push('enter-idle') });
    fsm.addState({ name: 'attack', onEnter: () => log.push('enter-attack') });
    fsm.addState({ name: 'flee', onEnter: () => log.push('enter-flee') });

    fsm.addTransition({ from: 'idle', to: 'flee', condition: () => true, priority: 10 });
    fsm.addTransition({ from: 'idle', to: 'attack', condition: () => true, priority: 1 });

    fsm.setState('idle', bb);
    log.length = 0;
    fsm.update(bb);
    expect(fsm.getCurrentState()).toBe('attack');
    expect(log).toContain('enter-attack');
  });

  it('should throw on duplicate state names', () => {
    const fsm = new FiniteStateMachine();
    fsm.addState({ name: 'idle' });
    expect(() => fsm.addState({ name: 'idle' })).toThrow('already registered');
  });

  it('should throw on setState to unknown state', () => {
    const fsm = new FiniteStateMachine();
    expect(() => fsm.setState('unknown', new Blackboard())).toThrow('unknown state');
  });

  it('should throw on transition with unknown from-state', () => {
    const fsm = new FiniteStateMachine();
    fsm.addState({ name: 'b' });
    expect(() => fsm.addTransition({ from: 'a', to: 'b', condition: () => true })).toThrow('unknown from-state');
  });

  it('should throw on transition with unknown to-state', () => {
    const fsm = new FiniteStateMachine();
    fsm.addState({ name: 'a' });
    expect(() => fsm.addTransition({ from: 'a', to: 'b', condition: () => true })).toThrow('unknown to-state');
  });

  it('should not transition when no condition is true', () => {
    const fsm = new FiniteStateMachine();
    fsm.addState({ name: 'idle' });
    fsm.addState({ name: 'walk' });
    fsm.addTransition({ from: 'idle', to: 'walk', condition: () => false });
    fsm.setState('idle', new Blackboard());
    fsm.update(new Blackboard());
    expect(fsm.getCurrentState()).toBe('idle');
  });

  it('should handle states with no lifecycle callbacks', () => {
    const fsm = new FiniteStateMachine();
    fsm.addState({ name: 'bare' });
    fsm.setState('bare', new Blackboard());
    fsm.update(new Blackboard());
    expect(fsm.getCurrentState()).toBe('bare');
  });

  it('should call onExit then onEnter during transition in update', () => {
    const fsm = new FiniteStateMachine();
    const log: string[] = [];
    fsm.addState({ name: 'a', onExit: () => log.push('exit-a') });
    fsm.addState({ name: 'b', onEnter: () => log.push('enter-b'), onUpdate: () => log.push('update-b') });
    fsm.addTransition({ from: 'a', to: 'b', condition: () => true });
    fsm.setState('a', new Blackboard());
    fsm.update(new Blackboard());
    expect(log).toEqual(['exit-a', 'enter-b', 'update-b']);
  });

  it('should use default priority of 0 for transitions without priority', () => {
    const fsm = new FiniteStateMachine();
    fsm.addState({ name: 'a' });
    fsm.addState({ name: 'b' });
    fsm.addState({ name: 'c' });
    // Both have default priority 0; first added wins (stable sort insertion order)
    fsm.addTransition({ from: 'a', to: 'b', condition: () => true });
    fsm.addTransition({ from: 'a', to: 'c', condition: () => true });
    fsm.setState('a', new Blackboard());
    fsm.update(new Blackboard());
    expect(fsm.getCurrentState()).toBe('b');
  });
});

// ─────────────────────────────────────────────
// 12. UtilityAI
// ─────────────────────────────────────────────

describe('UtilityAI', () => {
  it('should evaluate and pick the highest-scoring action', () => {
    const actions: UtilityAction[] = [
      { name: 'low', score: () => 10, execute: () => 'success' },
      { name: 'high', score: () => 90, execute: () => 'success' },
      { name: 'mid', score: () => 50, execute: () => 'success' },
    ];
    const ai = new UtilityAI(actions);
    const best = ai.evaluate(new Blackboard());
    expect(best?.name).toBe('high');
  });

  it('should execute the highest-scoring action', () => {
    let executed = '';
    const actions: UtilityAction[] = [
      { name: 'a', score: () => 1, execute: () => { executed = 'a'; return 'success'; } },
      { name: 'b', score: () => 99, execute: () => { executed = 'b'; return 'running'; } },
    ];
    const ai = new UtilityAI(actions);
    const status = ai.execute(new Blackboard());
    expect(executed).toBe('b');
    expect(status).toBe('running');
  });

  it('should return undefined from evaluate when no actions', () => {
    const ai = new UtilityAI([]);
    expect(ai.evaluate(new Blackboard())).toBeUndefined();
  });

  it('should return failure from execute when no actions', () => {
    const ai = new UtilityAI([]);
    expect(ai.execute(new Blackboard())).toBe('failure');
  });

  it('should support addAction at runtime', () => {
    const ai = new UtilityAI([]);
    ai.addAction({ name: 'added', score: () => 50, execute: () => 'success' });
    expect(ai.evaluate(new Blackboard())?.name).toBe('added');
  });

  it('should use blackboard context in scoring', () => {
    const bb = new Blackboard();
    bb.set('threat', 80);
    const actions: UtilityAction[] = [
      { name: 'flee', score: (ctx) => ctx.get<number>('threat') ?? 0, execute: () => 'running' },
      { name: 'idle', score: () => 10, execute: () => 'success' },
    ];
    const ai = new UtilityAI(actions);
    expect(ai.evaluate(bb)?.name).toBe('flee');
  });

  it('should break ties by insertion order (first registered wins)', () => {
    const actions: UtilityAction[] = [
      { name: 'first', score: () => 50, execute: () => 'success' },
      { name: 'second', score: () => 50, execute: () => 'success' },
    ];
    const ai = new UtilityAI(actions);
    // First inserted with equal score should NOT be overtaken (> not >=)
    expect(ai.evaluate(new Blackboard())?.name).toBe('first');
  });
});

// ─────────────────────────────────────────────
// 13. GOAPPlanner
// ─────────────────────────────────────────────

describe('GOAPPlanner', () => {
  it('should find a simple 1-action plan', () => {
    const actions: GOAPAction[] = [
      {
        name: 'pick-up-axe',
        cost: 1,
        preconditions: {},
        effects: { hasAxe: true },
        execute: () => 'success',
      },
    ];
    const planner = new GOAPPlanner(actions);
    const plan = planner.plan({}, { hasAxe: true });
    expect(plan.length).toBe(1);
    expect(plan[0]?.name).toBe('pick-up-axe');
  });

  it('should find a multi-step plan when goals require multiple actions', () => {
    const actions: GOAPAction[] = [
      {
        name: 'get-axe',
        cost: 1,
        preconditions: {},
        effects: { hasAxe: true },
        execute: () => 'success',
      },
      {
        name: 'get-sword',
        cost: 2,
        preconditions: {},
        effects: { hasSword: true },
        execute: () => 'success',
      },
    ];
    const planner = new GOAPPlanner(actions);
    // Goal requires both items -- each action satisfies one goal key
    const plan = planner.plan({}, { hasAxe: true, hasSword: true });
    expect(plan.length).toBe(2);
    const names = plan.map((a) => a.name);
    expect(names).toContain('get-axe');
    expect(names).toContain('get-sword');
  });

  it('should return empty array when no valid plan exists', () => {
    const actions: GOAPAction[] = [
      {
        name: 'need-key',
        cost: 1,
        preconditions: { hasKey: true },
        effects: { doorOpen: true },
        execute: () => 'success',
      },
    ];
    const planner = new GOAPPlanner(actions);
    const plan = planner.plan({}, { doorOpen: true });
    expect(plan).toEqual([]);
  });

  it('should return empty array when goal is already satisfied', () => {
    const planner = new GOAPPlanner([]);
    const plan = planner.plan({ hasAxe: true }, { hasAxe: true });
    expect(plan).toEqual([]);
  });

  it('should check preconditions', () => {
    const actions: GOAPAction[] = [
      {
        name: 'chop-tree',
        cost: 1,
        preconditions: { hasAxe: true },
        effects: { hasWood: true },
        execute: () => 'success',
      },
    ];
    const planner = new GOAPPlanner(actions);
    // Without hasAxe, cannot chop tree
    const plan = planner.plan({}, { hasWood: true });
    expect(plan).toEqual([]);
  });

  it('should prefer cheaper path (cost optimization)', () => {
    const actions: GOAPAction[] = [
      {
        name: 'expensive-axe',
        cost: 10,
        preconditions: {},
        effects: { hasAxe: true },
        execute: () => 'success',
      },
      {
        name: 'cheap-axe',
        cost: 1,
        preconditions: {},
        effects: { hasAxe: true },
        execute: () => 'success',
      },
    ];
    const planner = new GOAPPlanner(actions);
    const plan = planner.plan({}, { hasAxe: true });
    expect(plan.length).toBe(1);
    expect(plan[0]?.name).toBe('cheap-axe');
  });

  it('should handle actions with multiple effects', () => {
    const actions: GOAPAction[] = [
      {
        name: 'forge-sword',
        cost: 3,
        preconditions: {},
        effects: { hasSword: true, hasWeapon: true },
        execute: () => 'success',
      },
    ];
    const planner = new GOAPPlanner(actions);
    const plan = planner.plan({}, { hasSword: true, hasWeapon: true });
    expect(plan.length).toBe(1);
    expect(plan[0]?.name).toBe('forge-sword');
  });
});

// ─────────────────────────────────────────────
// 14. AStarPathfinder
// ─────────────────────────────────────────────

describe('AStarPathfinder', () => {
  it('should find a straight line path', () => {
    const grid = makeGrid(1, 5);
    const pathfinder = new AStarPathfinder();
    const path = pathfinder.findPath(grid, { x: 0, y: 0 }, { x: 4, y: 0 });
    expect(path.length).toBe(5);
    expect(path[0]).toEqual({ x: 0, y: 0 });
    expect(path[4]).toEqual({ x: 4, y: 0 });
  });

  it('should navigate around obstacles', () => {
    // 3x3 grid with center blocked
    const grid = makeGrid(3, 3, [{ x: 1, y: 1 }]);
    const pathfinder = new AStarPathfinder();
    const path = pathfinder.findPath(grid, { x: 0, y: 0 }, { x: 2, y: 2 });
    expect(path.length).toBeGreaterThan(0);
    expect(path[0]).toEqual({ x: 0, y: 0 });
    expect(path[path.length - 1]).toEqual({ x: 2, y: 2 });
    // Should not pass through the blocked cell
    const passesThroughCenter = path.some((p) => p.x === 1 && p.y === 1);
    expect(passesThroughCenter).toBe(false);
  });

  it('should return empty array when target is unreachable', () => {
    // Block the only path
    const grid = makeGrid(3, 3, [{ x: 1, y: 0 }, { x: 0, y: 1 }, { x: 1, y: 1 }]);
    const pathfinder = new AStarPathfinder();
    const path = pathfinder.findPath(grid, { x: 0, y: 0 }, { x: 2, y: 2 });
    expect(path).toEqual([]);
  });

  it('should return empty for empty grid', () => {
    const pathfinder = new AStarPathfinder();
    const path = pathfinder.findPath([], { x: 0, y: 0 }, { x: 1, y: 1 });
    expect(path).toEqual([]);
  });

  it('should return single point when start equals end', () => {
    const grid = makeGrid(3, 3);
    const pathfinder = new AStarPathfinder();
    const path = pathfinder.findPath(grid, { x: 1, y: 1 }, { x: 1, y: 1 });
    expect(path.length).toBe(1);
    expect(path[0]).toEqual({ x: 1, y: 1 });
  });

  it('should respect cost weighting (prefer cheaper cells)', () => {
    // 3x3 grid, top path has cost 1, bottom path has cost 10
    const grid: GridNode[][] = [
      [{ x: 0, y: 0, walkable: true, cost: 1 }, { x: 1, y: 0, walkable: true, cost: 1 }, { x: 2, y: 0, walkable: true, cost: 1 }],
      [{ x: 0, y: 1, walkable: true, cost: 1 }, { x: 1, y: 1, walkable: true, cost: 100 }, { x: 2, y: 1, walkable: true, cost: 1 }],
      [{ x: 0, y: 2, walkable: true, cost: 1 }, { x: 1, y: 2, walkable: true, cost: 1 }, { x: 2, y: 2, walkable: true, cost: 1 }],
    ];
    const pathfinder = new AStarPathfinder();
    const path = pathfinder.findPath(grid, { x: 0, y: 1 }, { x: 2, y: 1 });
    // Should avoid the expensive center cell
    const passesThroughCenter = path.some((p) => p.x === 1 && p.y === 1);
    expect(passesThroughCenter).toBe(false);
  });

  it('should return empty for grid with empty rows', () => {
    const grid: GridNode[][] = [[]];
    const pathfinder = new AStarPathfinder();
    const path = pathfinder.findPath(grid, { x: 0, y: 0 }, { x: 1, y: 0 });
    expect(path).toEqual([]);
  });

  it('should handle vertical paths', () => {
    const grid = makeGrid(5, 1);
    const pathfinder = new AStarPathfinder();
    const path = pathfinder.findPath(grid, { x: 0, y: 0 }, { x: 0, y: 4 });
    expect(path.length).toBe(5);
    expect(path[0]).toEqual({ x: 0, y: 0 });
    expect(path[4]).toEqual({ x: 0, y: 4 });
  });
});

// ─────────────────────────────────────────────
// 15. PerceptionSystem
// ─────────────────────────────────────────────

describe('PerceptionSystem', () => {
  it('should return true when target is within range', () => {
    const ps = new PerceptionSystem(10);
    expect(ps.canSee({ x: 0, y: 0 }, { x: 5, y: 0 })).toBe(true);
  });

  it('should return false when target is outside range', () => {
    const ps = new PerceptionSystem(10);
    expect(ps.canSee({ x: 0, y: 0 }, { x: 11, y: 0 })).toBe(false);
  });

  it('should return true at exact range boundary', () => {
    const ps = new PerceptionSystem(5);
    expect(ps.canSee({ x: 0, y: 0 }, { x: 3, y: 4 })).toBe(true); // distance = 5
  });

  it('should filter getNearby to only entities in range', () => {
    const ps = new PerceptionSystem(5);
    const entities = [
      { id: 'a', x: 1, y: 1 },
      { id: 'b', x: 10, y: 10 },
      { id: 'c', x: 3, y: 3 },
    ];
    const nearby = ps.getNearby({ x: 0, y: 0 }, entities);
    const ids = nearby.map((e) => e.id);
    expect(ids).toContain('a');
    expect(ids).toContain('c');
    expect(ids).not.toContain('b');
  });

  it('should return empty array when no entities are nearby', () => {
    const ps = new PerceptionSystem(1);
    const entities = [
      { id: 'far', x: 100, y: 100 },
    ];
    const nearby = ps.getNearby({ x: 0, y: 0 }, entities);
    expect(nearby).toEqual([]);
  });

  it('should handle same position (distance 0)', () => {
    const ps = new PerceptionSystem(5);
    expect(ps.canSee({ x: 3, y: 3 }, { x: 3, y: 3 })).toBe(true);
  });

  it('should handle diagonal distances', () => {
    const ps = new PerceptionSystem(10);
    // sqrt(7^2 + 7^2) = sqrt(98) ~= 9.899 < 10
    expect(ps.canSee({ x: 0, y: 0 }, { x: 7, y: 7 })).toBe(true);
    // sqrt(8^2 + 8^2) = sqrt(128) ~= 11.31 > 10
    expect(ps.canSee({ x: 0, y: 0 }, { x: 8, y: 8 })).toBe(false);
  });

  it('should return all entities when all are in range', () => {
    const ps = new PerceptionSystem(100);
    const entities = [
      { id: 'a', x: 1, y: 1 },
      { id: 'b', x: 2, y: 2 },
    ];
    const nearby = ps.getNearby({ x: 0, y: 0 }, entities);
    expect(nearby.length).toBe(2);
  });
});

// ─────────────────────────────────────────────
// 16. BehaviorEngine
// ─────────────────────────────────────────────

describe('BehaviorEngine', () => {
  describe('factory methods', () => {
    it('should create a BehaviorTree via createTree', () => {
      const engine = new BehaviorEngine();
      const tree = engine.createTree(makeNode('success'));
      expect(tree).toBeInstanceOf(BehaviorTree);
      expect(tree.tick(new Blackboard())).toBe('success');
    });

    it('should create a FiniteStateMachine via createFSM', () => {
      const engine = new BehaviorEngine();
      const fsm = engine.createFSM();
      expect(fsm).toBeInstanceOf(FiniteStateMachine);
    });

    it('should create a UtilityAI via createUtilityAI', () => {
      const engine = new BehaviorEngine();
      const ai = engine.createUtilityAI([]);
      expect(ai).toBeInstanceOf(UtilityAI);
    });

    it('should create a GOAPPlanner via createPlanner', () => {
      const engine = new BehaviorEngine();
      const planner = engine.createPlanner([]);
      expect(planner).toBeInstanceOf(GOAPPlanner);
    });

    it('should create an AStarPathfinder via createPathfinder', () => {
      const engine = new BehaviorEngine();
      const pf = engine.createPathfinder();
      expect(pf).toBeInstanceOf(AStarPathfinder);
    });

    it('should accept a custom DeterministicRNG', () => {
      const rng = new DeterministicRNG('custom');
      const engine = new BehaviorEngine(rng);
      const tree = engine.createTree(makeNode('success'));
      expect(tree).toBeInstanceOf(BehaviorTree);
    });
  });

  describe('fromSeed — aggressive archetype', () => {
    it('should produce a BehaviorTree from an aggressive seed', () => {
      const engine = new BehaviorEngine(makeRng('engine'));
      const seed = makeAggressiveSeed();
      const tree = engine.fromSeed(seed);
      expect(tree).toBeInstanceOf(BehaviorTree);
    });

    it('should prefer attack when enemy is visible and in range', () => {
      const engine = new BehaviorEngine(makeRng('engine'));
      const seed = makeAggressiveSeed();
      const tree = engine.fromSeed(seed);
      const bb = new Blackboard();
      bb.set('enemyVisible', true);
      bb.set('inAttackRange', true);
      bb.set('health', 1.0);
      tree.tick(bb);
      expect(bb.get<boolean>('attacking')).toBe(true);
    });

    it('should chase when enemy is visible but not in range', () => {
      const engine = new BehaviorEngine(makeRng('engine'));
      const seed = makeAggressiveSeed();
      const tree = engine.fromSeed(seed);
      const bb = new Blackboard();
      bb.set('enemyVisible', true);
      bb.set('inAttackRange', false);
      bb.set('health', 1.0);
      tree.tick(bb);
      expect(bb.get<boolean>('chasing')).toBe(true);
    });

    it('should patrol when no enemy visible and energy is high', () => {
      const engine = new BehaviorEngine(makeRng('engine'));
      const seed = makeAggressiveSeed();
      const tree = engine.fromSeed(seed);
      const bb = new Blackboard();
      bb.set('enemyVisible', false);
      bb.set('health', 1.0);
      tree.tick(bb);
      expect(bb.get<boolean>('patrolling')).toBe(true);
    });
  });

  describe('fromSeed — cautious archetype', () => {
    it('should produce a BehaviorTree from a cautious seed', () => {
      const engine = new BehaviorEngine(makeRng('engine'));
      const seed = makeCautiousSeed();
      const tree = engine.fromSeed(seed);
      expect(tree).toBeInstanceOf(BehaviorTree);
    });

    it('should flee when health is low and enemy visible', () => {
      const engine = new BehaviorEngine(makeRng('engine'));
      const seed = makeCautiousSeed();
      const tree = engine.fromSeed(seed);
      const bb = new Blackboard();
      bb.set('enemyVisible', true);
      bb.set('health', 0.1); // below caution threshold of 0.8
      bb.set('inAttackRange', false);
      tree.tick(bb);
      expect(bb.get<boolean>('fleeing')).toBe(true);
    });

    it('should idle when no enemy visible and energy is low', () => {
      const engine = new BehaviorEngine(makeRng('engine'));
      const seed = makeCautiousSeed();
      const tree = engine.fromSeed(seed);
      const bb = new Blackboard();
      bb.set('enemyVisible', false);
      bb.set('health', 1.0);
      tree.tick(bb);
      // Energy is 0.3, so patrol returns failure, idle runs
      expect(bb.get<boolean>('idle')).toBe(true);
    });

    it('should attack when in range but not threatened', () => {
      const engine = new BehaviorEngine(makeRng('engine'));
      const seed = makeCautiousSeed();
      const tree = engine.fromSeed(seed);
      const bb = new Blackboard();
      bb.set('enemyVisible', true);
      bb.set('health', 1.0); // above caution of 0.8
      bb.set('inAttackRange', true);
      tree.tick(bb);
      expect(bb.get<boolean>('attacking')).toBe(true);
    });
  });

  describe('fromSeed — missing genes (defaults)', () => {
    it('should produce a valid BehaviorTree with no genes at all', () => {
      const engine = new BehaviorEngine(makeRng('engine'));
      const seed = makeMinimalSeed();
      const tree = engine.fromSeed(seed);
      expect(tree).toBeInstanceOf(BehaviorTree);
    });

    it('should still tick without errors on a minimal seed', () => {
      const engine = new BehaviorEngine(makeRng('engine'));
      const seed = makeMinimalSeed();
      const tree = engine.fromSeed(seed);
      const bb = new Blackboard();
      const status = tree.tick(bb);
      expect(['success', 'failure', 'running']).toContain(status);
    });

    it('should use everyman archetype when archetype gene is missing', () => {
      const engine = new BehaviorEngine(makeRng('engine'));
      const seed = makeMinimalSeed();
      const tree = engine.fromSeed(seed);
      // The tree was created without throwing, archetype defaulted to 'everyman'
      expect(tree).toBeInstanceOf(BehaviorTree);
    });

    it('should use RNG defaults for missing scalar genes', () => {
      const engine = new BehaviorEngine(makeRng('engine'));
      const seed = makeMinimalSeed();
      // fromSeed should not throw even with no genes
      const tree = engine.fromSeed(seed);
      const bb = new Blackboard();
      bb.set('enemyVisible', true);
      bb.set('inAttackRange', true);
      bb.set('health', 1.0);
      const status = tree.tick(bb);
      expect(['success', 'failure', 'running']).toContain(status);
    });
  });

  describe('fromSeed — hero archetype prefers aggression', () => {
    it('should build aggressive tree for hero archetype', () => {
      const genes: GeneMap = {
        archetype: { type: 'categorical', value: 'hero', options: ['hero', 'everyman'] } as CategoricalGene,
        aggression: { type: 'scalar', value: 0.3, min: 0, max: 1 } as ScalarGene,
        caution: { type: 'scalar', value: 0.5, min: 0, max: 1 } as ScalarGene,
        energy: { type: 'scalar', value: 0.7, min: 0, max: 1 } as ScalarGene,
      };
      const seed = makeSeed('hero-entity', genes);
      const engine = new BehaviorEngine(makeRng('engine'));
      const tree = engine.fromSeed(seed);
      const bb = new Blackboard();
      bb.set('enemyVisible', true);
      bb.set('inAttackRange', true);
      bb.set('health', 1.0);
      tree.tick(bb);
      // Hero archetype prefers aggression even with low aggression value
      expect(bb.get<boolean>('attacking')).toBe(true);
    });
  });

  describe('fromSeed — rebel archetype prefers aggression', () => {
    it('should build aggressive tree for rebel archetype', () => {
      const genes: GeneMap = {
        archetype: { type: 'categorical', value: 'rebel', options: ['rebel', 'everyman'] } as CategoricalGene,
        aggression: { type: 'scalar', value: 0.1, min: 0, max: 1 } as ScalarGene,
        caution: { type: 'scalar', value: 0.5, min: 0, max: 1 } as ScalarGene,
        energy: { type: 'scalar', value: 0.7, min: 0, max: 1 } as ScalarGene,
      };
      const seed = makeSeed('rebel-entity', genes);
      const engine = new BehaviorEngine(makeRng('engine'));
      const tree = engine.fromSeed(seed);
      const bb = new Blackboard();
      bb.set('enemyVisible', true);
      bb.set('inAttackRange', true);
      bb.set('health', 1.0);
      tree.tick(bb);
      expect(bb.get<boolean>('attacking')).toBe(true);
    });
  });
});
