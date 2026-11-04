import { Global, Module } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AccessService } from './access.service';
import { TopicViewService } from './topic-view.service';

@Global()
@Module({
  providers: [PrismaService, AccessService, TopicViewService],
  exports: [PrismaService, AccessService, TopicViewService],
})
export class CommonModule {}
