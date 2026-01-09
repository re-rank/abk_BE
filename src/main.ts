import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // 모든 요청 로깅 미들웨어
  app.use((req: { method: string; url: string; headers: { authorization?: string } }, _res: unknown, next: () => void) => {
    const authHeader = req.headers.authorization;
    console.log(`📥 ${req.method} ${req.url} - Auth: ${authHeader ? 'Bearer ...' + authHeader.slice(-20) : 'NONE'}`);
    next();
  });

  // CORS 설정
  const allowedOrigins = [
    'http://localhost:5173',
    'https://abk-fn.vercel.app',
    process.env.FRONTEND_URL,
  ].filter(Boolean);

  app.enableCors({
    origin: allowedOrigins,
    credentials: true,
  });

  // Global Validation Pipe
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  // API 접두사 설정
  app.setGlobalPrefix('api');

  // Swagger 설정
  const config = new DocumentBuilder()
    .setTitle('ABK SEO Solution API')
    .setDescription('자동완성 검색 유도 + 백링크 SEO 통합 솔루션 API')
    .setVersion('1.0')
    .addBearerAuth()
    .build();
  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api/docs', app, document);

  const port = process.env.PORT || 3000;
  await app.listen(port);
  console.log(`Application is running on: http://localhost:${port}`);
  console.log(`Swagger docs: http://localhost:${port}/api/docs`);
}
bootstrap();

