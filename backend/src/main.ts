// FILE: main.ts
// PURPOSE: Bootstrap with /api/v1 prefix, global pipe, filter, interceptor and Swagger (non-production)
// DEPENDENCIES: AppModule
// PHASE: 2 (Swagger added in PHASE 3)
import 'reflect-metadata';
import { ValidationPipe } from '@nestjs/common';
import { NestFactory, Reflector } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';
import { GlobalExceptionFilter } from './common/filters/global-exception.filter';
import { ResponseInterceptor } from './common/interceptors/response.interceptor';
import { loadConfig } from './config/configuration';
import { loadEnvFile } from './config/load-env';

async function bootstrap(): Promise<void> {
  loadEnvFile();
  const config = loadConfig();
  const app = await NestFactory.create(AppModule, { rawBody: true }); // rawBody: webhook signatures are computed over the exact bytes
  app.setGlobalPrefix('api/v1');
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
  app.useGlobalFilters(new GlobalExceptionFilter());
  app.useGlobalInterceptors(new ResponseInterceptor(app.get(Reflector)));

  if (process.env.NODE_ENV !== 'production') {
    const doc = SwaggerModule.createDocument(
      app,
      new DocumentBuilder()
        .setTitle('Payment Hub API')
        .setVersion('1.0')
        .addBearerAuth()
        .addApiKey({ type: 'apiKey', name: 'x-api-key', in: 'header' }, 'api-key')
        .addApiKey({ type: 'apiKey', name: 'x-api-secret', in: 'header' }, 'api-secret')
        .build(),
    );
    SwaggerModule.setup('api/docs', app, doc);
  }

  await app.listen(config.port);
}

void bootstrap();
