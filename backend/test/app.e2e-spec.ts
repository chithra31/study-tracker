import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';

/**
 * End-to-end tests against the real API and the seeded PostgreSQL database
 * (run `npx prisma db seed` first). Each run creates its own goal, deletes it
 * afterwards, and restores the configuration it changed.
 */
describe('Study Progress Tracker API (e2e)', () => {
  let app: INestApplication;
  let http: ReturnType<INestApplication['getHttpServer']>;

  let alice: string;
  let bob: string;
  let mentor: string;
  let originalConfig: Record<string, number>;

  let goalId: number;
  const ids: Record<string, number> = {};

  const login = async (email: string) => {
    const res = await request(http).post('/auth/login').send({ email, password: 'Password123!' });
    return res.body.accessToken as string;
  };
  const as = (token: string) => ({ Authorization: `Bearer ${token}` });
  const setConfig = (changes: Record<string, number>) =>
    request(http).put('/config').set(as(mentor)).send(changes);
  const topicStatus = async (title: string) => {
    const res = await request(http).get(`/goals/${goalId}`).set(as(alice));
    return res.body.topics.find((t: { title: string }) => t.title === title);
  };
  const logSession = (token: string, topicId: number, extra: object = {}) =>
    request(http)
      .post('/sessions')
      .set(as(token))
      .send({ topicId, date: '2026-11-01', minutes: 30, ...extra });

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    await app.init();
    http = app.getHttpServer();

    alice = await login('alice@example.com');
    bob = await login('bob@example.com');
    mentor = await login('mentor@example.com');
    originalConfig = (await request(http).get('/config').set(as(alice))).body;

    // Fixture goal: A <- B <- C, plus an unrelated D.
    const goal = await request(http).post('/goals').set(as(alice)).send({ title: 'E2E goal' });
    goalId = goal.body.id;
    for (const title of ['A', 'B', 'C', 'D']) {
      await request(http).post(`/goals/${goalId}/topics`).set(as(alice)).send({ title });
    }
    const topics = (await request(http).get(`/goals/${goalId}`).set(as(alice))).body.topics;
    for (const t of topics) ids[t.title] = t.id;
    await request(http).put(`/topics/${ids.B}/prerequisites`).set(as(alice)).send({ prerequisiteIds: [ids.A] });
    await request(http).put(`/topics/${ids.C}/prerequisites`).set(as(alice)).send({ prerequisiteIds: [ids.B] });
  });

  afterAll(async () => {
    await setConfig(originalConfig);
    await request(http).delete(`/goals/${goalId}`).set(as(alice));
    await app.close();
  });

  describe('authentication', () => {
    it('logs in with valid credentials and returns the role', async () => {
      const res = await request(http)
        .post('/auth/login')
        .send({ email: 'mentor@example.com', password: 'Password123!' })
        .expect(200);
      expect(res.body.accessToken).toEqual(expect.any(String));
      expect(res.body.user.role).toBe('MENTOR');
    });

    it('rejects a wrong password', () =>
      request(http).post('/auth/login').send({ email: 'alice@example.com', password: 'nope' }).expect(401));

    it('rejects requests without a token', () => request(http).get('/goals').expect(401));
  });

  describe('roles enforced on the server', () => {
    it('stops a learner reading another learner\'s goal', () =>
      request(http).get(`/goals/${goalId}`).set(as(bob)).expect(403));

    it('lets a mentor read any learner\'s goal', () =>
      request(http).get(`/goals/${goalId}`).set(as(mentor)).expect(200));

    it('shows a learner only their own goals, and a mentor everyone\'s', async () => {
      const own = await request(http).get('/goals').set(as(bob)).expect(200);
      expect(own.body.every((g: { owner: { email: string } }) => g.owner.email === 'bob@example.com')).toBe(true);

      const all = await request(http).get('/goals').set(as(mentor)).expect(200);
      const owners = new Set(all.body.map((g: { owner: { email: string } }) => g.owner.email));
      expect(owners.size).toBeGreaterThan(1);
    });

    it('stops a learner editing another learner\'s topics and sessions', async () => {
      await request(http).post(`/topics/${ids.A}/complete`).set(as(bob)).expect(403);
      await logSession(bob, ids.A).expect(403);
    });

    it('makes mentors read-only on learner data', async () => {
      await request(http).post('/goals').set(as(mentor)).send({ title: 'x' }).expect(403);
      await request(http).post(`/topics/${ids.A}/complete`).set(as(mentor)).expect(403);
      await logSession(mentor, ids.A).expect(403);
    });

    it('lets only a mentor change the configuration', async () => {
      await request(http).put('/config').set(as(alice)).send({ maxSessionMinutes: 100 }).expect(403);
      await setConfig({ maxSessionMinutes: originalConfig.maxSessionMinutes }).expect(200);
    });
  });

  describe('prerequisite rules', () => {
    it('rejects a topic that is its own prerequisite', () =>
      request(http).put(`/topics/${ids.A}/prerequisites`).set(as(alice)).send({ prerequisiteIds: [ids.A] }).expect(400));

    it('rejects a prerequisite loop (A requires C, but C needs B needs A)', async () => {
      const res = await request(http)
        .put(`/topics/${ids.A}/prerequisites`)
        .set(as(alice))
        .send({ prerequisiteIds: [ids.C] })
        .expect(400);
      expect(res.body.message).toMatch(/circular/);
    });

    it('enforces the configurable maximum number of prerequisites', async () => {
      await setConfig({ maxPrerequisitesPerTopic: 1 }).expect(200);
      await request(http)
        .put(`/topics/${ids.D}/prerequisites`)
        .set(as(alice))
        .send({ prerequisiteIds: [ids.A, ids.B] })
        .expect(400);

      // Same request succeeds once the admin raises the limit: no code change.
      await setConfig({ maxPrerequisitesPerTopic: 3 }).expect(200);
      await request(http)
        .put(`/topics/${ids.D}/prerequisites`)
        .set(as(alice))
        .send({ prerequisiteIds: [ids.A, ids.B] })
        .expect(200);
      await request(http).put(`/topics/${ids.D}/prerequisites`).set(as(alice)).send({ prerequisiteIds: [] }).expect(200);
    });
  });

  describe('unlock rule', () => {
    it('keeps a topic locked and names the missing prerequisite', async () => {
      const b = await topicStatus('B');
      expect(b.status).toBe('LOCKED');
      expect(b.missingPrerequisites.map((p: { title: string }) => p.title)).toEqual(['A']);

      const res = await request(http).post(`/topics/${ids.B}/complete`).set(as(alice)).expect(400);
      expect(res.body.message).toMatch(/A/);
    });

    it('refuses to log a session on a locked topic', () => logSession(alice, ids.B).expect(400));

    it('unlocks a topic when its prerequisites are complete', async () => {
      await request(http).post(`/topics/${ids.A}/complete`).set(as(alice)).expect(200);
      expect((await topicStatus('B')).status).toBe('UNLOCKED');
      await logSession(alice, ids.B).expect(201);
      await request(http).post(`/topics/${ids.B}/complete`).set(as(alice)).expect(200);
      expect((await topicStatus('C')).status).toBe('UNLOCKED');
    });

    it('re-locks dependents when a completed topic is reopened, and restores them when re-completed', async () => {
      await request(http).post(`/topics/${ids.A}/reopen`).set(as(alice)).expect(200);
      expect((await topicStatus('B')).status).toBe('LOCKED');
      expect((await topicStatus('C')).status).toBe('LOCKED');

      await request(http).post(`/topics/${ids.A}/complete`).set(as(alice)).expect(200);
      expect((await topicStatus('B')).status).toBe('COMPLETE');
      expect((await topicStatus('C')).status).toBe('UNLOCKED');
    });
  });

  describe('session log validation', () => {
    it('rejects a date in the future', () => logSession(alice, ids.A, { date: '2999-01-01' }).expect(400));

    it('rejects minutes outside the configured range and follows config changes', async () => {
      await logSession(alice, ids.A, { minutes: 2 }).expect(400);
      await logSession(alice, ids.A, { minutes: 500 }).expect(400);

      await setConfig({ minSessionMinutes: 5, maxSessionMinutes: 600 }).expect(200);
      await logSession(alice, ids.A, { minutes: 500 }).expect(201);

      await setConfig({ maxSessionMinutes: 60 }).expect(200);
      await logSession(alice, ids.A, { minutes: 90 }).expect(400);
    });

    it('refuses an invalid configuration (max below min)', () =>
      setConfig({ minSessionMinutes: 50, maxSessionMinutes: 10 }).expect(400));
  });

  describe('weekly review', () => {
    it('stops a learner requesting a review of another learner\'s goal', () =>
      request(http).post(`/goals/${goalId}/review`).set(as(bob)).expect(403));

    it('returns a review that never suggests a locked topic (AI or rule-based fallback)', async () => {
      const res = await request(http).post(`/goals/${goalId}/review`).set(as(alice)).expect(200);
      expect(['ai', 'rules']).toContain(res.body.source);
      expect(res.body.summary).toEqual(expect.any(String));

      const detail = await request(http).get(`/goals/${goalId}`).set(as(alice));
      const locked = detail.body.topics.filter((t: { status: string }) => t.status === 'LOCKED').map((t: { title: string }) => t.title);
      for (const item of res.body.suggestedPlan) expect(locked).not.toContain(item.topic);
    });
  });

  describe('progress', () => {
    it('reports percent complete, total minutes and weekly minutes', async () => {
      const res = await request(http).get(`/goals/${goalId}/progress`).set(as(alice)).expect(200);
      // A and B are complete out of 4 topics (A, B, C, D).
      expect(res.body.totalTopics).toBe(4);
      expect(res.body.completedTopics).toBe(2);
      expect(res.body.percentComplete).toBe(50);
      expect(res.body.totalMinutes).toBe(30 + 500);
      expect(res.body.minutesPerWeek).toHaveLength(6);
    });

    it('drops the percentage when a reopened topic re-locks its dependents', async () => {
      await request(http).post(`/topics/${ids.A}/reopen`).set(as(alice)).expect(200);
      const res = await request(http).get(`/goals/${goalId}/progress`).set(as(mentor)).expect(200);
      expect(res.body.completedTopics).toBe(0);
      expect(res.body.lockedTopics).toBe(2); // B and C
    });
  });
});
