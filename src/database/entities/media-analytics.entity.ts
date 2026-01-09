import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
} from 'typeorm';
import { Project } from './project.entity';
import { MediaPlatform } from './media-connection.entity';

/**
 * 매체별 분석 데이터 메인 테이블
 * 각 프로젝트의 연동된 매체별 SEO 지표 및 통계 저장
 */
@Entity('media_analytics')
@Index(['projectId', 'platform'], { unique: true })
export class MediaAnalytics {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  userId: string;

  @Column({ type: 'uuid' })
  projectId: string;

  @ManyToOne(() => Project, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'projectId' })
  project: Project;

  @Column({
    type: 'enum',
    enum: MediaPlatform,
  })
  platform: MediaPlatform;

  // SEO 지표
  @Column({ type: 'int', default: 0 })
  domainAuthority: number; // 0-100

  @Column({ type: 'int', default: 0 })
  pageAuthority: number; // 0-100

  @Column({ type: 'int', default: 0 })
  totalBacklinks: number;

  @Column({ type: 'int', default: 0 })
  indexedPages: number;

  @Column({ type: 'int', default: 0 })
  spamScore: number; // 0-100 (낮을수록 좋음)

  // 콘텐츠 성과
  @Column({ type: 'int', default: 0 })
  totalPosts: number;

  @Column({ type: 'int', default: 0 })
  totalViews: number;

  @Column({ type: 'float', default: 0 })
  avgViews: number;

  @Column({ type: 'float', default: 0 })
  engagementRate: number; // 퍼센트

  // 트래픽 소스 분포 (JSON)
  @Column({ type: 'jsonb', nullable: true })
  trafficSources: {
    organic: number;
    direct: number;
    social: number;
    referral: number;
  };

  // 인기 게시물 (JSON)
  @Column({ type: 'jsonb', nullable: true })
  topPosts: {
    title: string;
    url: string;
    views: number;
    publishedAt: string;
  }[];

  // 외부 API 연동 정보 - 네이버
  @Column({ nullable: true })
  naverSearchAdvisorSiteId: string;

  // Google Analytics 연동은 Project 엔티티에서 관리 (타겟 URL과 직접 연결)

  @Column({ type: 'timestamp', nullable: true })
  lastDataCollectedAt: Date;

  @Column({ nullable: true })
  lastCollectionError: string;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}

