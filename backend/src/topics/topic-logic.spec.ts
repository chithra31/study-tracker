import {
  computeTopicStates,
  findPrerequisiteError,
  TopicNode,
  wouldCreateCycle,
} from './topic-logic';

/** Chain: 1 <- 2 <- 3 (3 requires 2, 2 requires 1) plus 4 requiring both 2 and 3. */
const chain = (completed: number[]): TopicNode[] => [
  { id: 1, completed: completed.includes(1), prerequisiteIds: [] },
  { id: 2, completed: completed.includes(2), prerequisiteIds: [1] },
  { id: 3, completed: completed.includes(3), prerequisiteIds: [2] },
  { id: 4, completed: completed.includes(4), prerequisiteIds: [2, 3] },
];

const status = (nodes: TopicNode[], id: number) => computeTopicStates(nodes).get(id)!;

describe('computeTopicStates (unlock rule)', () => {
  it('leaves a topic without prerequisites unlocked', () => {
    expect(status(chain([]), 1).status).toBe('UNLOCKED');
  });

  it('locks a topic until all its prerequisites are complete', () => {
    expect(status(chain([]), 2).status).toBe('LOCKED');
    expect(status(chain([1]), 2).status).toBe('UNLOCKED');
  });

  it('lists exactly which prerequisites are still missing', () => {
    // Topic 4 needs 2 and 3; only 2 is complete.
    const state = status(chain([1, 2]), 4);
    expect(state.status).toBe('LOCKED');
    expect(state.missingPrerequisiteIds).toEqual([3]);
  });

  it('unlocks a topic once every prerequisite is complete', () => {
    const state = status(chain([1, 2, 3]), 4);
    expect(state.status).toBe('UNLOCKED');
    expect(state.missingPrerequisiteIds).toEqual([]);
  });

  it('reports a completed topic with complete prerequisites as COMPLETE', () => {
    expect(status(chain([1, 2]), 2).status).toBe('COMPLETE');
  });

  it('re-locks direct dependents when a completed topic is reopened', () => {
    // 1, 2 and 3 are complete, so 4 is unlocked. Reopen 2.
    expect(status(chain([1, 2, 3]), 4).status).toBe('UNLOCKED');
    const reopened = chain([1, 3]); // 2 is no longer complete
    expect(status(reopened, 3).status).toBe('LOCKED');
    expect(status(reopened, 4).status).toBe('LOCKED');
    expect(status(reopened, 4).missingPrerequisiteIds).toEqual([2, 3]);
  });

  it('re-locks transitive dependents too, and restores them when re-completed', () => {
    const allDone = chain([1, 2, 3, 4]);
    expect(status(allDone, 4).status).toBe('COMPLETE');

    // Reopen the root topic: everything downstream must lock, even though they keep their completed flag.
    const reopenedRoot = chain([2, 3, 4]);
    expect(status(reopenedRoot, 2).status).toBe('LOCKED');
    expect(status(reopenedRoot, 3).status).toBe('LOCKED');
    expect(status(reopenedRoot, 4).status).toBe('LOCKED');
    expect(status(reopenedRoot, 4).completed).toBe(true);

    // Completing the root again restores the whole chain.
    expect(status(allDone, 3).status).toBe('COMPLETE');
    expect(status(allDone, 4).status).toBe('COMPLETE');
  });
});

describe('wouldCreateCycle', () => {
  // 3 requires 2, 2 requires 1.
  const edges = new Map<number, number[]>([
    [1, []],
    [2, [1]],
    [3, [2]],
  ]);

  it('detects a direct loop (A requires B, B requires A)', () => {
    expect(wouldCreateCycle(1, [2], edges)).toBe(true);
  });

  it('detects an indirect loop (1 requires 3, and 3 -> 2 -> 1)', () => {
    expect(wouldCreateCycle(1, [3], edges)).toBe(true);
  });

  it('allows a valid prerequisite', () => {
    expect(wouldCreateCycle(3, [1], edges)).toBe(false);
  });

  it('terminates on diamond-shaped graphs', () => {
    const diamond = new Map<number, number[]>([
      [1, []],
      [2, [1]],
      [3, [1]],
      [4, [2, 3]],
    ]);
    expect(wouldCreateCycle(5, [4], diamond)).toBe(false);
  });
});

describe('findPrerequisiteError', () => {
  const base = {
    topicId: 3,
    prerequisiteIds: [] as number[],
    maxPrerequisites: 3,
    goalTopicIds: new Set([1, 2, 3, 4, 5]),
    edges: new Map<number, number[]>([
      [1, []],
      [2, [1]],
      [3, []],
      [4, []],
      [5, []],
    ]),
  };

  it('accepts a valid list', () => {
    expect(findPrerequisiteError({ ...base, prerequisiteIds: [1, 2] })).toBeNull();
  });

  it('rejects a topic being its own prerequisite', () => {
    expect(findPrerequisiteError({ ...base, prerequisiteIds: [3] })).toMatch(/own prerequisite/);
  });

  it('rejects a loop', () => {
    const edges = new Map(base.edges).set(1, [3]); // 1 requires 3
    expect(findPrerequisiteError({ ...base, edges, prerequisiteIds: [1] })).toMatch(/circular/);
  });

  it('rejects more prerequisites than the configured maximum', () => {
    const tooMany = { ...base, prerequisiteIds: [1, 2, 4, 5] };
    expect(findPrerequisiteError(tooMany)).toMatch(/at most 3/);
  });

  it('applies a changed maximum without any code change', () => {
    const two = { ...base, prerequisiteIds: [1, 2] };
    expect(findPrerequisiteError({ ...two, maxPrerequisites: 2 })).toBeNull();
    expect(findPrerequisiteError({ ...two, maxPrerequisites: 1 })).toMatch(/at most 1 prerequisite$/);
  });

  it('rejects duplicates and topics from another goal', () => {
    expect(findPrerequisiteError({ ...base, prerequisiteIds: [1, 1] })).toMatch(/Duplicate/);
    expect(findPrerequisiteError({ ...base, prerequisiteIds: [99] })).toMatch(/same goal/);
  });
});
