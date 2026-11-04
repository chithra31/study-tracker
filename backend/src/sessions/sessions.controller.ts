import { Body, Controller, Delete, Get, Param, ParseIntPipe, Post, Query } from '@nestjs/common';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, MaxLength } from 'class-validator';
import type { AuthUser } from '../auth/auth.types';
import { CurrentUser } from '../auth/decorators';
import { SessionsService } from './sessions.service';

class CreateSessionDto {
  @IsInt()
  topicId: number;

  /** YYYY-MM-DD, interpreted as a UTC calendar day. */
  @IsString()
  date: string;

  @IsInt()
  minutes: number;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  note?: string;
}

class ListSessionsQuery {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  goalId?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  topicId?: number;
}

@Controller('sessions')
export class SessionsController {
  constructor(private sessions: SessionsService) {}

  @Post()
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateSessionDto) {
    return this.sessions.create(user, dto);
  }

  @Get()
  list(@CurrentUser() user: AuthUser, @Query() query: ListSessionsQuery) {
    return this.sessions.list(user, query);
  }

  @Delete(':id')
  remove(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: AuthUser) {
    return this.sessions.remove(id, user);
  }
}
