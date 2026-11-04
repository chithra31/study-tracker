import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Role } from '@prisma/client';
import { AppConfigService } from '../app-config/app-config.service';
import type { AuthUser } from '../auth/auth.types';
import { AccessService } from '../common/access.service';
import { TopicViewService } from '../common/topic-view.service';
import { PrismaService } from '../prisma/prisma.service';
import { validateSession } from './session-logic';

@Injectable()
export class SessionsService {
  constructor(
    private prisma: PrismaService,
    private access: AccessService,
    private topicView: TopicViewService,
    private settings: AppConfigService,
  ) {}

  async create(
    user: AuthUser,
    dto: { topicId: number; date: string; minutes: number; note?: string },
  ) {
    const topic = await this.access.getTopicForEdit(dto.topicId, user);

    // Limits come from the database on every request, so admin changes apply immediately.
    const { minSessionMinutes, maxSessionMinutes } = await this.settings.getSettings();
    const errors = validateSession(dto, { min: minSessionMinutes, max: maxSessionMinutes });
    if (errors.length > 0) throw new BadRequestException(errors);

    const topics = await this.topicView.getGoalTopics(topic.goalId);
    const view = topics.find((t) => t.id === topic.id)!;
    if (view.status === 'LOCKED') {
      const names = view.missingPrerequisites.map((p) => p.title).join(', ');
      throw new BadRequestException(`Topic is locked. Complete these prerequisites first: ${names}`);
    }

    return this.prisma.studySession.create({
      data: {
        topicId: dto.topicId,
        userId: user.id,
        date: new Date(`${dto.date}T00:00:00Z`),
        minutes: dto.minutes,
        note: dto.note ?? '',
      },
    });
  }

  /** Learners see their own sessions; mentors can see any learner's by goal or topic. */
  async list(user: AuthUser, filter: { goalId?: number; topicId?: number }) {
    if (filter.goalId !== undefined) await this.access.getGoalForView(filter.goalId, user);

    return this.prisma.studySession.findMany({
      where: {
        ...(user.role === Role.LEARNER ? { userId: user.id } : {}),
        ...(filter.topicId !== undefined ? { topicId: filter.topicId } : {}),
        ...(filter.goalId !== undefined ? { topic: { goalId: filter.goalId } } : {}),
      },
      include: { topic: { select: { id: true, title: true, goalId: true } } },
      orderBy: [{ date: 'desc' }, { id: 'desc' }],
    });
  }

  async remove(id: number, user: AuthUser) {
    const session = await this.prisma.studySession.findUnique({
      where: { id },
      include: { topic: { include: { goal: true } } },
    });
    if (!session) throw new NotFoundException('Session not found');
    if (user.role === Role.MENTOR || session.topic.goal.ownerId !== user.id) {
      throw new ForbiddenException('You can only delete your own sessions');
    }
    await this.prisma.studySession.delete({ where: { id } });
    return { deleted: true };
  }
}
