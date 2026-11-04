import { computeTopicStates } from '../topics/topic-logic';
import { summarizeProgress } from './progress-logic';

const summarize = (completed: number[], minutes: number) => {
  const states = computeTopicStates([
    { id: 1, completed: completed.includes(1), prerequisiteIds: [] },
    { id: 2, completed: completed.includes(2), prerequisiteIds: [1] },
    { id: 3, completed: completed.includes(3), prerequisiteIds: [2] },
    { id: 4, completed: completed.includes(4), prerequisiteIds: [] },
  ]);
  return summarizeProgress([...states.values()], minutes);
};

describe('summarizeProgress', () => {
  it('computes percent of topics complete and total minutes', () => {
    expect(summarize([1, 4], 120)).toEqual({
      totalTopics: 4,
      completedTopics: 2,
      percentComplete: 50,
      totalMinutes: 120,
    });
  });

  it('does not count a topic that was re-locked by a reopened prerequisite', () => {
    // 1 reopened: 2 and 3 keep their flag but are locked, so only topic 4 counts.
    expect(summarize([2, 3, 4], 0).completedTopics).toBe(1);
    expect(summarize([2, 3, 4], 0).percentComplete).toBe(25);
  });

  it('returns 0 percent for a goal with no topics', () => {
    expect(summarizeProgress([], 0).percentComplete).toBe(0);
  });
});
