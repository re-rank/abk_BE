import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BullModule } from '@nestjs/bullmq';
import { ScheduleModule } from '@nestjs/schedule';
import { AuthModule } from './auth/auth.module';
import { ProjectsModule } from './projects/projects.module';
import { ContentModule } from './content/content.module';
import { BacklinksModule } from './backlinks/backlinks.module';
import { PublishModule } from './publish/publish.module';
import { SnsModule } from './sns/sns.module';
import { DashboardModule } from './dashboard/dashboard.module';
import { QueueModule } from './queue/queue.module';
import { MediaModule } from './media/media.module';
import { AnalyticsModule } from './analytics/analytics.module';

@Module({
  imports: [
    // 환경변수 설정
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
    }),

    // TypeORM - PostgreSQL (DATABASE_URL 또는 SUPABASE_DATABASE_URL)
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: (configService: ConfigService) => {
        const dbUrl = configService.get<string>('DATABASE_URL') || configService.get<string>('SUPABASE_DATABASE_URL');

        // 데이터베이스 URL이 없으면 경고 출력하고 로컬로 폴백
        if (!dbUrl) {
          console.warn('⚠️  DATABASE_URL not configured. Database features will be disabled.');
          // 연결하지 않음 - autoLoadEntities만 활성화
          return {
            type: 'postgres',
            host: 'localhost',
            port: 5432,
            username: 'postgres',
            password: 'postgres',
            database: 'abk_dev',
            autoLoadEntities: true,
            synchronize: false,
            retryAttempts: 0, // 재시도 안함
            retryDelay: 0,
          };
        }

        console.log('🔗 Attempting to connect to Supabase PostgreSQL...');
        const isProduction = configService.get('NODE_ENV') === 'production';
        return {
          type: 'postgres',
          url: dbUrl,
          autoLoadEntities: true,
          synchronize: false, // 항상 false - 마이그레이션 사용 권장
          ssl: {
            // Supabase는 자체 인증서 체인 사용 - Node.js slim 이미지에서 검증 불가
            // 연결은 여전히 TLS로 암호화됨
            rejectUnauthorized: false,
          },
          retryAttempts: isProduction ? 5 : 1,
          retryDelay: 3000,
          extra: {
            connectionTimeoutMillis: 10000,
            max: 20,
          },
        };
      },
      inject: [ConfigService],
    }),

    // BullMQ - Upstash Redis Queue (선택적)
    BullModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: (configService: ConfigService) => {
        const redisUrl = configService.get<string>('REDIS_URL');

        // Redis 설정이 없으면 기본 로컬 Redis 사용 시도
        if (!redisUrl) {
          console.warn('⚠️  REDIS_URL not configured. Queue features will use local Redis or be disabled.');
          return {
            connection: {
              host: 'localhost',
              port: 6379,
            },
          };
        }

        console.log('🔗 Attempting to connect to Upstash Redis...');
        return {
          connection: {
            url: redisUrl,
          },
        };
      },
      inject: [ConfigService],
    }),

    // Schedule Module
    ScheduleModule.forRoot(),

    // Feature Modules
    AuthModule,
    ProjectsModule,
    ContentModule,
    BacklinksModule,
    PublishModule,
    SnsModule,
    DashboardModule,
    QueueModule,
    MediaModule,
    AnalyticsModule,
  ],
})
export class AppModule {}

