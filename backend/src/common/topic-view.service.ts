import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { computeTopicStates, TopicStatus } from '../topics/topic-logic';

export interface TopicView {
  id: number;
  goalId: number;
  title: string;
  completed: boolean;
  completedAt: Date | null;
  status: TopicStatus;
  prerequisites: { id: number; title: string }[];
  missingPrerequisites: { id: number; title: string }[];
  totalMinutes: number;
}

/** Builds the topics of a goal with their derived lock status and missing prerequisites. */
@Injectable()
export class TopicViewService {
  constructor(private prisma: PrismaService) {}

  async getGoalTopics(goalId: number): Promise<TopicView[]> {
    const topics = await this.prisma.topic.findMany({
      where: { goalId },
      include: { prerequisites: true, sessions: { select: { minutes: true } } },
      orderBy: { id: 'asc' },
    });

    const states = computeTopicStates(
      topics.map((t) => ({
        id: t.id,
        completed: t.completed,
        prerequisiteIds: t.prerequisites.map((p) => p.prerequisiteId),
      })),
    );
    const titles = new Map(topics.map((t) => [t.id, t.title]));
    const ref = (id: number) => ({ id, title: titles.get(id) ?? '' });

    return topics.map((t) => {
      const state = states.get(t.id)!;
      return {
        id: t.id,
        goalId: t.goalId,
        title: t.title,
        completed: t.completed,
        completedAt: t.completedAt,
        status: state.status,
        prerequisites: t.prerequisites.map((p) => ref(p.prerequisiteId)),
        missingPrerequisites: state.missingPrerequisiteIds.map(ref),
        totalMinutes: t.sessions.reduce((sum, s) => sum + s.minutes, 0),
      };
    });
  }
}
