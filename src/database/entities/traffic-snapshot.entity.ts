import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
} from 'typeorm';
import { Project } from './project.entity';
import { MediaPlatform } from './media-connection.entity';

/**
 * 일별 트래픽 스냅샷
 * 각 매체의 일별 방문자, 페이지뷰 등 트래픽 데이터 기록
 */
@Entity('traffic_snapshots')
@Index(['projectId', 'platform', 'date'], { unique: true })
@Index(['projectId', 'date'])
export class TrafficSnapshot {
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

  // 날짜 (일별 스냅샷)
  @Column({ type: 'date' })
  date: Date;

  // 트래픽 지표
  @Column({ type: 'int', default: 0 })
  visitors: number; // 방문자 수

  @Column({ type: 'int', default: 0 })
  uniqueVisitors: number; // 순방문자 수

  @Column({ type: 'int', default: 0 })
  pageViews: number; // 페이지뷰

  @Column({ type: 'float', default: 0 })
  avgSessionDuration: number; // 평균 체류 시간 (초)

  @Column({ type: 'float', default: 0 })
  bounceRate: number; // 이탈률 (%)

  // 유입 경로별 방문자 수
  @Column({ type: 'int', default: 0 })
  organicVisitors: number; // 검색 유입

  @Column({ type: 'int', default: 0 })
  directVisitors: number; // 직접 유입

  @Column({ type: 'int', default: 0 })
  socialVisitors: number; // SNS 유입

  @Column({ type: 'int', default: 0 })
  referralVisitors: number; // 추천/레퍼럴 유입

  // 상위 유입 키워드 (JSON)
  @Column({ type: 'jsonb', nullable: true })
  topKeywords: {
    keyword: string;
    visits: number;
  }[];

  // 상위 유입 페이지 (JSON)
  @Column({ type: 'jsonb', nullable: true })
  topPages: {
    path: string;
    views: number;
  }[];

  // 디바이스 분포 (JSON)
  @Column({ type: 'jsonb', nullable: true })
  deviceStats: {
    desktop: number;
    mobile: number;
    tablet: number;
  };

  @CreateDateColumn()
  createdAt: Date;
}

