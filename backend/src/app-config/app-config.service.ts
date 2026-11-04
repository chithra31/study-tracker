import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

export interface AppSettings {
  minSessionMinutes: number;
  maxSessionMinutes: number;
  maxPrerequisitesPerTopic: number;
}

const KEYS: Record<keyof AppSettings, string> = {
  minSessionMinutes: 'MIN_SESSION_MINUTES',
  maxSessionMinutes: 'MAX_SESSION_MINUTES',
  maxPrerequisitesPerTopic: 'MAX_PREREQUISITES_PER_TOPIC',
};

const DEFAULTS: AppSettings = {
  minSessionMinutes: 5,
  maxSessionMinutes: 480,
  maxPrerequisitesPerTopic: 3,
};

/**
 * Admin-configurable business values. They are read from the database on every
 * call (no caching), so changing one changes behaviour immediately with no code
 * change or restart.
 */
@Injectable()
export class AppConfigService {
  constructor(private prisma: PrismaService) {}

  async getSettings(): Promise<AppSettings> {
    const rows = await this.prisma.config.findMany();
    const byKey = new Map(rows.map((r) => [r.key, r.value]));
    const settings = { ...DEFAULTS };
    for (const name of Object.keys(KEYS) as (keyof AppSettings)[]) {
      const value = byKey.get(KEYS[name]);
      if (value !== undefined) settings[name] = value;
    }
    return settings;
  }

  async update(changes: Partial<AppSettings>): Promise<AppSettings> {
    const merged = { ...(await this.getSettings()), ...stripUndefined(changes) };

    if (merged.minSessionMinutes < 1) {
      throw new BadRequestException('minSessionMinutes must be at least 1');
    }
    if (merged.maxSessionMinutes < merged.minSessionMinutes) {
      throw new BadRequestException('maxSessionMinutes must be greater than or equal to minSessionMinutes');
    }
    if (merged.maxPrerequisitesPerTopic < 0 || merged.maxPrerequisitesPerTopic > 50) {
      throw new BadRequestException('maxPrerequisitesPerTopic must be between 0 and 50');
    }

    for (const name of Object.keys(KEYS) as (keyof AppSettings)[]) {
      if (changes[name] === undefined) continue;
      await this.prisma.config.update({ where: { key: KEYS[name] }, data: { value: merged[name] } });
    }
    return merged;
  }
}

function stripUndefined<T extends object>(obj: T): Partial<T> {
  return Object.fromEntries(Object.entries(obj).filter(([, v]) => v !== undefined)) as Partial<T>;
}
