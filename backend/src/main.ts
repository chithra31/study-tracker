import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  // Reject unknown fields and convert payloads to the DTO types.
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
  app.enableCors({ origin: ['http://localhost:4200'] });
  await app.listen(process.env.PORT ?? 3000);
}
void bootstrap();
