import { BadRequestException, Injectable } from '@nestjs/common';
import type { AuthUser } from '../auth/auth.types';
import { AppConfigService } from '../app-config/app-config.service';
import { AccessService } from '../common/access.service';
import { TopicViewService } from '../common/topic-view.service';
import { PrismaService } from '../prisma/prisma.service';
import { findPrerequisiteError } from './topic-logic';

/** Every mutation returns the goal's full, freshly computed topic list so the UI can refresh in one step. */
@Injectable()
export class TopicsService {
  constructor(
    private prisma: PrismaService,
    private access: AccessService,
    private topicView: TopicViewService,
    private settings: AppConfigService,
  ) {}

  async create(goalId: number, user: AuthUser, title: string) {
    await this.access.getGoalForEdit(goalId, user);
    await this.prisma.topic.create({ data: { goalId, title } });
    return this.topicView.getGoalTopics(goalId);
  }

  async rename(topicId: number, user: AuthUser, title: string) {
    const topic = await this.access.getTopicForEdit(topicId, user);
    await this.prisma.topic.update({ where: { id: topicId }, data: { title } });
    return this.topicView.getGoalTopics(topic.goalId);
  }

  async remove(topicId: number, user: AuthUser) {
    const topic = await this.access.getTopicForEdit(topicId, user);
    await this.prisma.topic.delete({ where: { id: topicId } });
    return this.topicView.getGoalTopics(topic.goalId);
  }

  /** Replaces the prerequisites of a topic after validating self-reference, loops and the configured maximum. */
  async setPrerequisites(topicId: number, user: AuthUser, prerequisiteIds: number[]) {
    const topic = await this.access.getTopicForEdit(topicId, user);
    const { maxPrerequisitesPerTopic } = await this.settings.getSettings();

    const goalTopics = await this.prisma.topic.findMany({
      where: { goalId: topic.goalId },
      include: { prerequisites: true },
    });
    const edges = new Map(goalTopics.map((t) => [t.id, t.prerequisites.map((p) => p.prerequisiteId)]));

    const error = findPrerequisiteError({
      topicId,
      prerequisiteIds,
      maxPrerequisites: maxPrerequisitesPerTopic,
      goalTopicIds: new Set(goalTopics.map((t) => t.id)),
      edges,
    });
    if (error) throw new BadRequestException(error);

    await this.prisma.$transaction([
      this.prisma.topicPrerequisite.deleteMany({ where: { topicId } }),
      this.prisma.topicPrerequisite.createMany({
        data: prerequisiteIds.map((prerequisiteId) => ({ topicId, prerequisiteId })),
      }),
    ]);
    return this.topicView.getGoalTopics(topic.goalId);
  }

  /** A topic can only be completed while unlocked (all prerequisites complete). */
  async complete(topicId: number, user: AuthUser) {
    const topic = await this.access.getTopicForEdit(topicId, user);
    const topics = await this.topicView.getGoalTopics(topic.goalId);
    const view = topics.find((t) => t.id === topicId)!;
    if (view.status === 'LOCKED') {
      const names = view.missingPrerequisites.map((p) => p.title).join(', ');
      throw new BadRequestException(`Topic is locked. Complete these prerequisites first: ${names}`);
    }
    await this.prisma.topic.update({
      where: { id: topicId },
      data: { completed: true, completedAt: new Date() },
    });
    return this.topicView.getGoalTopics(topic.goalId);
  }

  /** Reopening a topic re-locks everything that depends on it, because status is derived on read. */
  async reopen(topicId: number, user: AuthUser) {
    const topic = await this.access.getTopicForEdit(topicId, user);
    await this.prisma.topic.update({
      where: { id: topicId },
      data: { completed: false, completedAt: null },
    });
    return this.topicView.getGoalTopics(topic.goalId);
  }
}
