/**
 * Pure logic for the weekly review: building the compact context sent to the
 * model, a deterministic fallback review, and validation of model output.
 * Nothing here touches the network or the database.
 */

export type ReviewTopicStatus = 'COMPLETE' | 'UNLOCKED' | 'LOCKED';

export interface ReviewTopic {
  title: string;
  status: ReviewTopicStatus;
  missing: string[];
  minutes: number;
  /** How many locked topics are waiting on this one. */
  unlocks: number;
}

export interface ReviewContext {
  goal: string;
  today: string;
  percentComplete: number;
  totalMinutes: number;
  last7Minutes: number;
  prev7Minutes: number;
  sessionsLast7: number;
  daysSinceLastSession: number | null;
  topics: ReviewTopic[];
  recentSessions: { date: string; topic: string; minutes: number; note: string }[];
}

export interface PlanItem {
  topic: string;
  minutes: number;
  reason: string;
}

export interface ReviewResult {
  summary: string;
  highlights: string[];
  suggestedPlan: PlanItem[];
  encouragement: string;
}

export interface Limits {
  min: number;
  max: number;
}

const DAY_MS = 24 * 60 * 60 * 1000;

const dayNumber = (date: string) => Math.floor(new Date(`${date}T00:00:00Z`).getTime() / DAY_MS);
const toDay = (d: Date | string) => (typeof d === 'string' ? d : d.toISOString()).slice(0, 10);

export function buildReviewContext(input: {
  goalTitle: string;
  percentComplete: number;
  today: string;
  topics: { title: string; status: ReviewTopicStatus; missingPrerequisites: { title: string }[]; totalMinutes: number }[];
  sessions: { date: Date | string; minutes: number; note: string; topicTitle: string }[];
}): ReviewContext {
  const today = dayNumber(input.today);
  const sessions = input.sessions.map((s) => ({ ...s, day: toDay(s.date) }));
  const ageOf = (s: { day: string }) => today - dayNumber(s.day);

  const last7 = sessions.filter((s) => ageOf(s) >= 0 && ageOf(s) < 7);
  const prev7 = sessions.filter((s) => ageOf(s) >= 7 && ageOf(s) < 14);
  const sum = (list: { minutes: number }[]) => list.reduce((total, s) => total + s.minutes, 0);
  const latest = sessions.length ? Math.min(...sessions.map(ageOf)) : null;

  const topics: ReviewTopic[] = input.topics.map((t) => ({
    title: t.title,
    status: t.status,
    missing: t.missingPrerequisites.map((m) => m.title),
    minutes: t.totalMinutes,
    unlocks: input.topics.filter((o) => o.missingPrerequisites.some((m) => m.title === t.title)).length,
  }));

  return {
    goal: input.goalTitle,
    today: input.today,
    percentComplete: input.percentComplete,
    totalMinutes: sum(sessions),
    last7Minutes: sum(last7),
    prev7Minutes: sum(prev7),
    sessionsLast7: last7.length,
    daysSinceLastSession: latest,
    topics,
    recentSessions: [...sessions]
      .sort((a, b) => (a.day < b.day ? 1 : -1))
      .slice(0, 10)
      .map((s) => ({ date: s.day, topic: s.topicTitle, minutes: s.minutes, note: s.note.slice(0, 200) })),
  };
}

const clamp = (n: number, { min, max }: Limits) => Math.min(max, Math.max(min, Math.round(n)));

/** Deterministic review used when no API key is set or the model call fails. */
export function ruleBasedReview(ctx: ReviewContext, limits: Limits): ReviewResult {
  const trend =
    ctx.last7Minutes > ctx.prev7Minutes
      ? `up from ${ctx.prev7Minutes} the week before`
      : ctx.last7Minutes < ctx.prev7Minutes
        ? `down from ${ctx.prev7Minutes} the week before`
        : 'the same as the week before';
  const summary =
    `"${ctx.goal}" is ${ctx.percentComplete}% complete. You studied ${ctx.last7Minutes} minutes ` +
    `over ${ctx.sessionsLast7} session${ctx.sessionsLast7 === 1 ? '' : 's'} in the last 7 days, ${trend}.`;

  const highlights: string[] = [];
  if (ctx.daysSinceLastSession === null) {
    highlights.push('No sessions logged yet. A short first session is the best way to start.');
  } else if (ctx.daysSinceLastSession >= 4) {
    highlights.push(`It has been ${ctx.daysSinceLastSession} days since your last session. Try a short one to rebuild the habit.`);
  }
  const locked = ctx.topics.filter((t) => t.status === 'LOCKED');
  if (locked.length > 0) {
    const blockers = [...new Set(locked.flatMap((t) => t.missing))];
    highlights.push(`${locked.length} topic${locked.length === 1 ? ' is' : 's are'} locked, waiting on: ${blockers.join(', ')}.`);
  }
  const done = ctx.topics.filter((t) => t.status === 'COMPLETE');
  if (done.length > 0) highlights.push(`${done.length} of ${ctx.topics.length} topics complete.`);

  const open = ctx.topics
    .filter((t) => t.status === 'UNLOCKED')
    .sort((a, b) => b.unlocks - a.unlocks || b.minutes - a.minutes)
    .slice(0, 3);
  const suggestedPlan: PlanItem[] = open.map((t) => ({
    topic: t.title,
    minutes: clamp(45, limits),
    reason:
      t.unlocks > 0
        ? `Finishing it unlocks ${t.unlocks} more topic${t.unlocks === 1 ? '' : 's'}.`
        : t.minutes > 0
          ? `You already have ${t.minutes} minutes in. Keep the momentum.`
          : 'It is unlocked and ready to start.',
  }));

  const allDone = ctx.topics.length > 0 && done.length === ctx.topics.length;
  return {
    summary,
    highlights,
    suggestedPlan,
    encouragement: allDone ? 'Every topic is complete. Great work!' : 'Steady, regular sessions beat long, rare ones.',
  };
}

const str = (v: unknown, max: number): string | null =>
  typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : null;

/**
 * Validates model output. The model is only trusted for wording: plan items
 * must name real, unlocked topics and minutes are forced into the configured
 * session limits. Returns null if the output is unusable.
 */
export function sanitizeReview(raw: unknown, ctx: ReviewContext, limits: Limits): ReviewResult | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const r = raw as Record<string, unknown>;
  const summary = str(r.summary, 700);
  if (!summary) return null;

  const highlights = (Array.isArray(r.highlights) ? r.highlights : [])
    .map((h) => str(h, 250))
    .filter((h): h is string => h !== null)
    .slice(0, 5);

  const usable = new Map(ctx.topics.filter((t) => t.status !== 'LOCKED').map((t) => [t.title, t]));
  const suggestedPlan: PlanItem[] = [];
  for (const item of Array.isArray(r.suggestedPlan) ? r.suggestedPlan : []) {
    const entry = item as Record<string, unknown> | null;
    const topic = str(entry?.topic, 120);
    const reason = str(entry?.reason, 250);
    const minutes = Number(entry?.minutes);
    if (topic && reason && usable.has(topic) && Number.isFinite(minutes)) {
      suggestedPlan.push({ topic, minutes: clamp(minutes, limits), reason });
    }
    if (suggestedPlan.length === 5) break;
  }

  return { summary, highlights, suggestedPlan, encouragement: str(r.encouragement, 250) ?? '' };
}
