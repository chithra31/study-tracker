import { ForbiddenException, Injectable } from '@nestjs/common';
import { Role } from '@prisma/client';
import type { AuthUser } from '../auth/auth.types';
import { AccessService } from '../common/access.service';
import { TopicViewService } from '../common/topic-view.service';
import { PrismaService } from '../prisma/prisma.service';
import { weeklyMinutes } from '../sessions/session-logic';
import { computeTopicStates } from '../topics/topic-logic';
import { summarizeProgress } from './progress-logic';

@Injectable()
export class GoalsService {
  constructor(
    private prisma: PrismaService,
    private access: AccessService,
    private topicView: TopicViewService,
  ) {}

  /** Learners see their own goals; mentors see everyone's (optionally filtered by learner). */
  async list(user: AuthUser, ownerId?: number) {
    if (user.role === Role.LEARNER && ownerId !== undefined && ownerId !== user.id) {
      throw new ForbiddenException('You can only access your own goals');
    }
    const where =
      user.role === Role.MENTOR ? (ownerId !== undefined ? { ownerId } : {}) : { ownerId: user.id };

    const goals = await this.prisma.goal.findMany({
      where,
      orderBy: { id: 'asc' },
      include: {
        owner: { select: { id: true, name: true, email: true } },
        topics: { include: { prerequisites: true, sessions: { select: { minutes: true } } } },
      },
    });

    return goals.map((g) => {
      const states = computeTopicStates(
        g.topics.map((t) => ({
          id: t.id,
          completed: t.completed,
          prerequisiteIds: t.prerequisites.map((p) => p.prerequisiteId),
        })),
      );
      const minutes = g.topics.reduce((s, t) => s + t.sessions.reduce((a, x) => a + x.minutes, 0), 0);
      return {
        id: g.id,
        title: g.title,
        description: g.description,
        owner: g.owner,
        ...summarizeProgress([...states.values()], minutes),
      };
    });
  }

  create(user: AuthUser, data: { title: string; description?: string }) {
    return this.prisma.goal.create({
      data: { title: data.title, description: data.description, ownerId: user.id },
    });
  }

  async getDetail(goalId: number, user: AuthUser) {
    const goal = await this.access.getGoalForView(goalId, user);
    const owner = await this.prisma.user.findUnique({
      where: { id: goal.ownerId },
      select: { id: true, name: true, email: true },
    });
    const topics = await this.topicView.getGoalTopics(goalId);
    return { ...goal, owner, topics };
  }

  async update(goalId: number, user: AuthUser, data: { title?: string; description?: string }) {
    await this.access.getGoalForEdit(goalId, user);
    return this.prisma.goal.update({ where: { id: goalId }, data });
  }

  async remove(goalId: number, user: AuthUser) {
    await this.access.getGoalForEdit(goalId, user);
    await this.prisma.goal.delete({ where: { id: goalId } });
    return { deleted: true };
  }

  /** Percent of topics complete, total minutes, and minutes per week for the chart. */
  async getProgress(goalId: number, user: AuthUser) {
    await this.access.getGoalForView(goalId, user);
    const topics = await this.topicView.getGoalTopics(goalId);
    const sessions = await this.prisma.studySession.findMany({
      where: { topic: { goalId } },
      select: { date: true, minutes: true },
    });
    const totalMinutes = sessions.reduce((sum, s) => sum + s.minutes, 0);
    const summary = summarizeProgress(
      topics.map((t) => ({
        id: t.id,
        completed: t.completed,
        status: t.status,
        missingPrerequisiteIds: t.missingPrerequisites.map((m) => m.id),
      })),
      totalMinutes,
    );
    return {
      goalId,
      ...summary,
      lockedTopics: topics.filter((t) => t.status === 'LOCKED').length,
      minutesPerWeek: weeklyMinutes(sessions),
    };
  }
}
