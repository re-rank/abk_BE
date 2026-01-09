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

export enum SearchEngine {
  NAVER = 'NAVER',
  GOOGLE = 'GOOGLE',
  DAUM = 'DAUM',
}

/**
 * 키워드별 순위 트래킹
 * 각 프로젝트의 타겟 키워드에 대한 검색 순위 기록
 */
@Entity('keyword_rankings')
@Index(['projectId', 'keyword', 'searchEngine'])
export class KeywordRanking {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  userId: string;

  @Column({ type: 'uuid' })
  projectId: string;

  @ManyToOne(() => Project, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'projectId' })
  project: Project;

  // 키워드 정보
  @Column()
  keyword: string;

  @Column({
    type: 'enum',
    enum: SearchEngine,
    default: SearchEngine.NAVER,
  })
  searchEngine: SearchEngine;

  // 매체 정보 (선택적 - 특정 매체 URL 순위 추적 시)
  @Column({
    type: 'enum',
    enum: MediaPlatform,
    nullable: true,
  })
  platform: MediaPlatform;

  @Column({ nullable: true })
  targetUrl: string; // 순위에 잡힌 URL

  // 순위 정보
  @Column({ type: 'int', nullable: true })
  currentRank: number | null; // 현재 순위 (null = 100위 밖)

  @Column({ type: 'int', nullable: true })
  previousRank: number | null; // 이전 순위

  @Column({ type: 'int', default: 0 })
  rankChange: number; // + 상승, - 하락, 0 유지

  @Column({ type: 'int', nullable: true })
  bestRank: number; // 최고 순위

  @Column({ type: 'timestamp', nullable: true })
  bestRankAt: Date;

  // 검색량 정보
  @Column({ type: 'int', default: 0 })
  monthlySearchVolume: number; // 월간 검색량

  @Column({ type: 'int', default: 0 })
  competitionLevel: number; // 0-100 (경쟁 난이도)

  // 순위 히스토리 (최근 30일, JSON)
  @Column({ type: 'jsonb', nullable: true })
  rankHistory: {
    date: string;
    rank: number | null;
  }[];

  // 활성 상태
  @Column({ type: 'boolean', default: true })
  isActive: boolean;

  @Column({ type: 'timestamp', nullable: true })
  lastCheckedAt: Date;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}

