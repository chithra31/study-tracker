/**
 * Pure business rules for topics: unlock status and prerequisite validation.
 * No database access here, so every rule can be unit-tested in isolation.
 */

export interface TopicNode {
  id: number;
  completed: boolean;
  prerequisiteIds: number[];
}

export type TopicStatus = 'COMPLETE' | 'UNLOCKED' | 'LOCKED';

export interface TopicState {
  id: number;
  /** The stored flag, which survives a re-lock so re-completing a prerequisite restores it. */
  completed: boolean;
  status: TopicStatus;
  missingPrerequisiteIds: number[];
}

/**
 * Computes the status of every topic from the stored `completed` flags.
 *
 * A topic counts as effectively complete only if it is marked complete AND all
 * of its prerequisites are effectively complete. A topic with any prerequisite
 * that is not effectively complete is LOCKED. Because status is derived on
 * every read, reopening a topic automatically re-locks everything that depends
 * on it, directly or transitively, and completing it again restores them.
 */
export function computeTopicStates(nodes: TopicNode[]): Map<number, TopicState> {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const cache = new Map<number, boolean>();
  const visiting = new Set<number>();

  const isEffectivelyComplete = (id: number): boolean => {
    const cached = cache.get(id);
    if (cached !== undefined) return cached;
    const node = byId.get(id);
    if (!node || visiting.has(id)) return false; // unknown topic or a loop: never complete
    visiting.add(id);
    const result = node.completed && node.prerequisiteIds.every(isEffectivelyComplete);
    visiting.delete(id);
    cache.set(id, result);
    return result;
  };

  const states = new Map<number, TopicState>();
  for (const node of nodes) {
    const missing = node.prerequisiteIds.filter((p) => !isEffectivelyComplete(p));
    const status: TopicStatus =
      missing.length > 0 ? 'LOCKED' : node.completed ? 'COMPLETE' : 'UNLOCKED';
    states.set(node.id, {
      id: node.id,
      completed: node.completed,
      status,
      missingPrerequisiteIds: missing,
    });
  }
  return states;
}

/**
 * True if giving `topicId` the prerequisites `prerequisiteIds` would create a
 * loop, i.e. one of the prerequisites already (directly or indirectly) depends
 * on `topicId`. `edges` maps a topic id to the ids of its current prerequisites.
 */
export function wouldCreateCycle(
  topicId: number,
  prerequisiteIds: number[],
  edges: Map<number, number[]>,
): boolean {
  const stack = [...prerequisiteIds];
  const seen = new Set<number>();
  while (stack.length > 0) {
    const current = stack.pop()!;
    if (current === topicId) return true;
    if (seen.has(current)) continue;
    seen.add(current);
    stack.push(...(edges.get(current) ?? []));
  }
  return false;
}

export interface PrerequisiteCheck {
  topicId: number;
  prerequisiteIds: number[];
  maxPrerequisites: number;
  /** Ids of every topic in the same goal. */
  goalTopicIds: Set<number>;
  /** Current prerequisite edges of the goal's topics. */
  edges: Map<number, number[]>;
}

/** Returns a human-readable error if the prerequisite list is invalid, otherwise null. */
export function findPrerequisiteError(check: PrerequisiteCheck): string | null {
  const { topicId, prerequisiteIds, maxPrerequisites, goalTopicIds, edges } = check;

  if (new Set(prerequisiteIds).size !== prerequisiteIds.length) {
    return 'Duplicate prerequisites are not allowed';
  }
  if (prerequisiteIds.includes(topicId)) {
    return 'A topic cannot be its own prerequisite';
  }
  if (prerequisiteIds.some((id) => !goalTopicIds.has(id))) {
    return 'Prerequisites must be topics from the same goal';
  }
  if (prerequisiteIds.length > maxPrerequisites) {
    return `A topic can have at most ${maxPrerequisites} ${maxPrerequisites === 1 ? 'prerequisite' : 'prerequisites'}`;
  }
  if (wouldCreateCycle(topicId, prerequisiteIds, edges)) {
    return 'These prerequisites would create a circular dependency';
  }
  return null;
}
