import { Controller, HttpCode, Param, ParseIntPipe, Post } from '@nestjs/common';
import type { AuthUser } from '../auth/auth.types';
import { CurrentUser } from '../auth/decorators';
import { ReviewService } from './review.service';

@Controller('goals')
export class ReviewController {
  constructor(private review: ReviewService) {}

  /** Weekly review of a goal. Learners can request it for their own goals; mentors for any learner's. */
  @Post(':id/review')
  @HttpCode(200)
  generate(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: AuthUser) {
    return this.review.review(id, user);
  }
}
