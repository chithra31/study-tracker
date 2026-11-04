import { buildReviewContext, ReviewContext, ruleBasedReview, sanitizeReview } from './review-logic';

const TODAY = '2026-11-05';
const limits = { min: 5, max: 480 };

const topics = [
  { title: 'Basics', status: 'COMPLETE' as const, missingPrerequisites: [], totalMinutes: 100 },
  { title: 'Generics', status: 'UNLOCKED' as const, missingPrerequisites: [], totalMinutes: 60 },
  { title: 'Advanced', status: 'LOCKED' as const, missingPrerequisites: [{ title: 'Generics' }], totalMinutes: 0 },
];

const ctxWith = (sessions: { date: string; minutes: number }[]): ReviewContext =>
  buildReviewContext({
    goalTitle: 'TypeScript',
    percentComplete: 33,
    today: TODAY,
    topics,
    sessions: sessions.map((s) => ({ ...s, note: 'note', topicTitle: 'Generics' })),
  });

describe('buildReviewContext', () => {
  it('splits minutes into the last 7 days and the 7 days before', () => {
    const ctx = ctxWith([
      { date: '2026-11-04', minutes: 30 }, // 1 day ago
      { date: '2026-10-30', minutes: 20 }, // 6 days ago
      { date: '2026-10-29', minutes: 50 }, // 7 days ago -> previous week
      { date: '2026-10-01', minutes: 99 }, // older, counted only in the total
    ]);
    expect(ctx.last7Minutes).toBe(50);
    expect(ctx.prev7Minutes).toBe(50);
    expect(ctx.sessionsLast7).toBe(2);
    expect(ctx.totalMinutes).toBe(199);
    expect(ctx.daysSinceLastSession).toBe(1);
  });

  it('counts how many locked topics each topic would unlock', () => {
    const generics = ctxWith([]).topics.find((t) => t.title === 'Generics')!;
    expect(generics.unlocks).toBe(1);
  });

  it('truncates long notes so they cannot bloat the prompt', () => {
    const ctx = buildReviewContext({
      goalTitle: 'x',
      percentComplete: 0,
      today: TODAY,
      topics,
      sessions: [{ date: '2026-11-04', minutes: 10, note: 'a'.repeat(5000), topicTitle: 'Generics' }],
    });
    expect(ctx.recentSessions[0].note).toHaveLength(200);
  });
});

describe('ruleBasedReview (fallback)', () => {
  it('suggests only unlocked topics, never locked ones', () => {
    const review = ruleBasedReview(ctxWith([{ date: '2026-11-04', minutes: 30 }]), limits);
    expect(review.suggestedPlan.map((p) => p.topic)).toEqual(['Generics']);
    expect(review.suggestedPlan[0].reason).toMatch(/unlocks 1 more topic/);
  });

  it('flags inactivity and names what is blocking locked topics', () => {
    const review = ruleBasedReview(ctxWith([{ date: '2026-10-20', minutes: 30 }]), limits);
    expect(review.highlights.join(' ')).toMatch(/16 days since your last session/);
    expect(review.highlights.join(' ')).toMatch(/waiting on: Generics/);
  });

  it('keeps suggested minutes inside the configured limits', () => {
    const review = ruleBasedReview(ctxWith([]), { min: 60, max: 90 });
    expect(review.suggestedPlan[0].minutes).toBe(60);
  });
});

describe('sanitizeReview (validating model output)', () => {
  const ctx = ctxWith([{ date: '2026-11-04', minutes: 30 }]);

  it('accepts a well-formed review', () => {
    const result = sanitizeReview(
      {
        summary: 'Good week.',
        highlights: ['Nice pace'],
        suggestedPlan: [{ topic: 'Generics', minutes: 40, reason: 'Unlocks Advanced' }],
        encouragement: 'Keep going',
      },
      ctx,
      limits,
    );
    expect(result?.suggestedPlan).toEqual([{ topic: 'Generics', minutes: 40, reason: 'Unlocks Advanced' }]);
  });

  it('drops plan items for locked or unknown topics', () => {
    const result = sanitizeReview(
      {
        summary: 'ok',
        highlights: [],
        suggestedPlan: [
          { topic: 'Advanced', minutes: 30, reason: 'locked, must be dropped' },
          { topic: 'Quantum Physics', minutes: 30, reason: 'does not exist' },
          { topic: 'Generics', minutes: 30, reason: 'valid' },
        ],
        encouragement: '',
      },
      ctx,
      limits,
    );
    expect(result?.suggestedPlan.map((p) => p.topic)).toEqual(['Generics']);
  });

  it('clamps suggested minutes into the configured limits', () => {
    const result = sanitizeReview(
      { summary: 'ok', highlights: [], suggestedPlan: [{ topic: 'Generics', minutes: 9999, reason: 'r' }], encouragement: '' },
      ctx,
      limits,
    );
    expect(result?.suggestedPlan[0].minutes).toBe(480);
  });

  it('rejects unusable output so the caller can fall back', () => {
    expect(sanitizeReview(null, ctx, limits)).toBeNull();
    expect(sanitizeReview('text', ctx, limits)).toBeNull();
    expect(sanitizeReview({ highlights: [] }, ctx, limits)).toBeNull();
  });
});
