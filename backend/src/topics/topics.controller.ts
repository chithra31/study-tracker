import {
  Body,
  Controller,
  Delete,
  HttpCode,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Put,
} from '@nestjs/common';
import { ArrayMaxSize, IsArray, IsInt, IsNotEmpty, IsString, MaxLength } from 'class-validator';
import type { AuthUser } from '../auth/auth.types';
import { CurrentUser } from '../auth/decorators';
import { TopicsService } from './topics.service';

class TopicTitleDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  title: string;
}

class SetPrerequisitesDto {
  @IsArray()
  @ArrayMaxSize(100)
  @IsInt({ each: true })
  prerequisiteIds: number[];
}

@Controller()
export class TopicsController {
  constructor(private topics: TopicsService) {}

  @Post('goals/:goalId/topics')
  create(
    @Param('goalId', ParseIntPipe) goalId: number,
    @CurrentUser() user: AuthUser,
    @Body() dto: TopicTitleDto,
  ) {
    return this.topics.create(goalId, user, dto.title);
  }

  @Patch('topics/:id')
  rename(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: AuthUser,
    @Body() dto: TopicTitleDto,
  ) {
    return this.topics.rename(id, user, dto.title);
  }

  @Delete('topics/:id')
  remove(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: AuthUser) {
    return this.topics.remove(id, user);
  }

  @Put('topics/:id/prerequisites')
  setPrerequisites(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: AuthUser,
    @Body() dto: SetPrerequisitesDto,
  ) {
    return this.topics.setPrerequisites(id, user, dto.prerequisiteIds);
  }

  @Post('topics/:id/complete')
  @HttpCode(200)
  complete(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: AuthUser) {
    return this.topics.complete(id, user);
  }

  @Post('topics/:id/reopen')
  @HttpCode(200)
  reopen(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: AuthUser) {
    return this.topics.reopen(id, user);
  }
}
