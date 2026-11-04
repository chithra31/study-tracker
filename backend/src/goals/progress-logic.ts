import type { TopicState } from '../topics/topic-logic';

export interface GoalProgress {
  totalTopics: number;
  completedTopics: number;
  percentComplete: number;
  totalMinutes: number;
}

/** Percent of topics complete (effectively complete, so re-locked topics do not count) and minutes logged. */
export function summarizeProgress(states: TopicState[], totalMinutes: number): GoalProgress {
  const totalTopics = states.length;
  const completedTopics = states.filter((s) => s.status === 'COMPLETE').length;
  const percentComplete = totalTopics === 0 ? 0 : Math.round((completedTopics / totalTopics) * 100);
  return { totalTopics, completedTopics, percentComplete, totalMinutes };
}
