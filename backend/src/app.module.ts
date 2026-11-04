import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AppConfigModule } from './app-config/app-config.module';
import { AuthModule } from './auth/auth.module';
import { CommonModule } from './common/common.module';
import { GoalsModule } from './goals/goals.module';
import { ReviewModule } from './review/review.module';
import { SessionsModule } from './sessions/sessions.module';
import { TopicsModule } from './topics/topics.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    CommonModule,
    AppConfigModule,
    AuthModule,
    GoalsModule,
    TopicsModule,
    SessionsModule,
    ReviewModule,
  ],
})
export class AppModule {}
