import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Role } from '@prisma/client';
import type { AuthUser } from '../auth/auth.types';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Server-side ownership rules.
 *  - A mentor can view any learner's goals but cannot change them.
 *  - A learner can view and edit only their own goals.
 */
@Injectable()
export class AccessService {
  constructor(private prisma: PrismaService) {}

  async getGoalForView(goalId: number, user: AuthUser) {
    const goal = await this.prisma.goal.findUnique({ where: { id: goalId } });
    if (!goal) throw new NotFoundException('Goal not found');
    if (user.role !== Role.MENTOR && goal.ownerId !== user.id) {
      throw new ForbiddenException('You can only access your own goals');
    }
    return goal;
  }

  async getGoalForEdit(goalId: number, user: AuthUser) {
    const goal = await this.prisma.goal.findUnique({ where: { id: goalId } });
    if (!goal) throw new NotFoundException('Goal not found');
    this.assertCanEdit(goal.ownerId, user);
    return goal;
  }

  async getTopicForEdit(topicId: number, user: AuthUser) {
    const topic = await this.prisma.topic.findUnique({ where: { id: topicId }, include: { goal: true } });
    if (!topic) throw new NotFoundException('Topic not found');
    this.assertCanEdit(topic.goal.ownerId, user);
    return topic;
  }

  assertCanEdit(ownerId: number, user: AuthUser) {
    if (user.role === Role.MENTOR) {
      throw new ForbiddenException('Mentors have read-only access to learner goals');
    }
    if (ownerId !== user.id) {
      throw new ForbiddenException('You can only edit your own goals');
    }
  }
}
