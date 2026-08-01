import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );
  app.setGlobalPrefix('api');
  const config = app.get(ConfigService);
  const port = config.get<number>('API_PORT') ?? 3001;
  await app.listen(port);
  console.log(`API listening on http://localhost:${port}/api`);
}
bootstrap();
