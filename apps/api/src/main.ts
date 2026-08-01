import { NestFactory } from '@nestjs/core';
import { ConsoleLogger, LoggerService, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AppModule } from './app.module';

/**
 * Logger JSON para producción (deuda técnica: "logging estructurado").
 *
 * A propósito no agrega dependencias: pino/winston implicarían tocar
 * package.json. Una línea JSON por evento alcanza para que cualquier colector
 * (CloudWatch, Loki, Datadog) parsee sin regex. En dev seguimos usando el
 * ConsoleLogger de Nest, que es mucho más legible.
 */
/** Severidades en el vocabulario habitual de los colectores, no el de Nest. */
type JsonLevel = 'info' | 'error' | 'warn' | 'debug' | 'verbose';

class JsonLogger implements LoggerService {
  log(message: unknown, context?: string) {
    this.write('info', message, context);
  }
  error(message: unknown, stack?: string, context?: string) {
    this.write('error', message, context, stack);
  }
  warn(message: unknown, context?: string) {
    this.write('warn', message, context);
  }
  debug(message: unknown, context?: string) {
    this.write('debug', message, context);
  }
  verbose(message: unknown, context?: string) {
    this.write('verbose', message, context);
  }

  private write(
    level: JsonLevel,
    message: unknown,
    context?: string,
    stack?: string,
  ) {
    const line = JSON.stringify({
      level,
      time: new Date().toISOString(),
      context,
      // Los mensajes de Nest a veces son objetos; los serializamos igual.
      message: typeof message === 'string' ? message : safeStringify(message),
      ...(stack ? { stack } : {}),
    });
    if (level === 'error' || level === 'warn') process.stderr.write(`${line}\n`);
    else process.stdout.write(`${line}\n`);
  }
}

function safeStringify(value: unknown): string {
  try {
    return JSON.stringify(value) ?? String(value);
  } catch {
    return String(value);
  }
}

async function bootstrap() {
  const isProd = process.env.NODE_ENV === 'production';

  const app = await NestFactory.create(AppModule, {
    // Necesario para validar la firma HMAC del webhook de Kapso: hay que
    // hashear el cuerpo crudo, no el JSON re-serializado (el orden de las
    // claves y el espaciado cambiarían el digest).
    rawBody: true,
    logger: isProd ? new JsonLogger() : new ConsoleLogger(),
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );
  app.setGlobalPrefix('api');

  const config = app.get(ConfigService);

  // CORS para el panel web (apps/web). Lista separada por comas en CORS_ORIGINS.
  const origins = (
    config.get<string>('CORS_ORIGINS') ?? 'http://localhost:3000'
  )
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean);
  app.enableCors({
    origin: origins,
    credentials: true,
    methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
  });

  // Que Nest propague SIGTERM/SIGINT a onModuleDestroy: las colas (BullMQ) y el
  // pool de Prisma tienen que cerrar limpio antes de que muera el proceso.
  app.enableShutdownHooks();

  const port = config.get<number>('API_PORT') ?? 3001;
  await app.listen(port);
  console.log(`API listening on http://localhost:${port}/api`);
}
bootstrap();
