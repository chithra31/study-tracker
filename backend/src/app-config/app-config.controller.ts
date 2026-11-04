import { Body, Controller, Get, Put } from '@nestjs/common';
import { Role } from '@prisma/client';
import { IsInt, IsOptional } from 'class-validator';
import { Roles } from '../auth/decorators';
import { AppConfigService } from './app-config.service';

class UpdateConfigDto {
  @IsOptional()
  @IsInt()
  minSessionMinutes?: number;

  @IsOptional()
  @IsInt()
  maxSessionMinutes?: number;

  @IsOptional()
  @IsInt()
  maxPrerequisitesPerTopic?: number;
}

@Controller('config')
export class AppConfigController {
  constructor(private settings: AppConfigService) {}

  /** Any signed-in user can read the limits (the forms show them). */
  @Get()
  get() {
    return this.settings.getSettings();
  }

  /** Only mentors, who act as admins, can change them. */
  @Roles(Role.MENTOR)
  @Put()
  update(@Body() dto: UpdateConfigDto) {
    return this.settings.update(dto);
  }
}
