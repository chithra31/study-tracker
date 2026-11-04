export type Role = 'LEARNER' | 'MENTOR';
export type TopicStatus = 'COMPLETE' | 'UNLOCKED' | 'LOCKED';

export interface User {
  id: number;
  name: string;
  email: string;
  role: Role;
}

export interface Person {
  id: number;
  name: string;
  email: string;
}

export interface GoalSummary {
  id: number;
  title: string;
  description: string | null;
  owner: Person;
  totalTopics: number;
  completedTopics: number;
  percentComplete: number;
  totalMinutes: number;
}

export interface TopicRef {
  id: number;
  title: string;
}

export interface TopicView {
  id: number;
  goalId: number;
  title: string;
  completed: boolean;
  completedAt: string | null;
  status: TopicStatus;
  prerequisites: TopicRef[];
  missingPrerequisites: TopicRef[];
  totalMinutes: number;
}

export interface GoalDetail {
  id: number;
  title: string;
  description: string | null;
  ownerId: number;
  owner: Person | null;
  topics: TopicView[];
}

export interface WeekMinutes {
  weekStart: string;
  minutes: number;
}

export interface Progress {
  goalId: number;
  totalTopics: number;
  completedTopics: number;
  percentComplete: number;
  totalMinutes: number;
  lockedTopics: number;
  minutesPerWeek: WeekMinutes[];
}

export interface StudySession {
  id: number;
  topicId: number;
  date: string;
  minutes: number;
  note: string;
  topic: { id: number; title: string; goalId: number };
}

export interface Settings {
  minSessionMinutes: number;
  maxSessionMinutes: number;
  maxPrerequisitesPerTopic: number;
}

export interface PlanItem {
  topic: string;
  minutes: number;
  reason: string;
}

export interface Review {
  summary: string;
  highlights: string[];
  suggestedPlan: PlanItem[];
  encouragement: string;
  /** "ai" when written by Claude, "rules" for the built-in fallback. */
  source: 'ai' | 'rules';
  model: string | null;
  generatedAt: string;
}

export interface LoginResponse {
  accessToken: string;
  user: User;
}
