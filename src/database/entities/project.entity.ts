import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  OneToMany,
} from 'typeorm';
import { Content } from './content.entity';
import { Backlink } from './backlink.entity';

@Entity('projects')
export class Project {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  // Supabase Auth의 user ID (auth.users.id) - 외래 키 없이 저장
  @Column({ type: 'uuid', nullable: true })
  userId: string | null;

  @Column()
  projectName: string;

  @Column()
  brandName: string;

  @Column()
  mainKeyword: string;

  @Column()
  targetUrl: string;

  @Column({ nullable: true })
  description: string;

  // 발행 스케줄 설정
  @Column({ default: true })
  autoPublishEnabled: boolean;

  // 발행 요일 (0=일, 1=월, 2=화, 3=수, 4=목, 5=금, 6=토) - JSON 배열로 저장
  @Column({ type: 'simple-array', default: '1,3,5' })
  publishDays: string; // "1,3,5" 형태로 저장 (월,수,금)

  // 발행 시간 (24시간 형식, 예: "10:00")
  @Column({ default: '10:00' })
  publishTime: string;

  // 발행 시 랜덤 지연 최대 시간 (분 단위)
  @Column({ default: 240 })
  randomDelayMinutes: number;

  // 연동할 매체 플랫폼 목록 (JSON 배열)
  @Column({ type: 'simple-array', nullable: true })
  targetPlatforms: string; // "WORDPRESS,X,LINKEDIN" 형태로 저장

  // Google Analytics 연동 (타겟 URL 사이트 분석용)
  @Column({ nullable: true })
  googleAnalyticsPropertyId: string; // GA4 속성 ID

  @Column({ type: 'text', nullable: true })
  googleAnalyticsCredentials: string; // 서비스 계정 JSON

  @Column({ type: 'boolean', default: false })
  googleAnalyticsConnected: boolean;

  @OneToMany(() => Content, (content) => content.project)
  contents: Content[];

  @OneToMany(() => Backlink, (backlink) => backlink.project)
  backlinks: Backlink[];

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}

