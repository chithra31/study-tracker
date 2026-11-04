import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { Role } from '@prisma/client';
import { IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';
import { Type } from 'class-transformer';
import { IsInt } from 'class-validator';
import type { AuthUser } from '../auth/auth.types';
import { CurrentUser, Roles } from '../auth/decorators';
import { GoalsService } from './goals.service';

class CreateGoalDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  title: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;
}

class UpdateGoalDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  title?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;
}

class ListGoalsQuery {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  ownerId?: number;
}

@Controller('goals')
export class GoalsController {
  constructor(private goals: GoalsService) {}

  @Get()
  list(@CurrentUser() user: AuthUser, @Query() query: ListGoalsQuery) {
    return this.goals.list(user, query.ownerId);
  }

  /** Only learners own goals; mentors are read-only. */
  @Roles(Role.LEARNER)
  @Post()
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateGoalDto) {
    return this.goals.create(user, dto);
  }

  @Get(':id')
  detail(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: AuthUser) {
    return this.goals.getDetail(id, user);
  }

  @Get(':id/progress')
  progress(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: AuthUser) {
    return this.goals.getProgress(id, user);
  }

  @Patch(':id')
  update(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: AuthUser,
    @Body() dto: UpdateGoalDto,
  ) {
    return this.goals.update(id, user, dto);
  }

  @Delete(':id')
  remove(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: AuthUser) {
    return this.goals.remove(id, user);
  }
}
