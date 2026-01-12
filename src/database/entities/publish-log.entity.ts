import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { Content } from './content.entity';

export enum PublishPlatform {
  WORDPRESS = 'WORDPRESS',
  MEDIUM = 'MEDIUM',
  NAVER_BLOG = 'NAVER_BLOG',
  TISTORY = 'TISTORY',
}

export enum PublishStatus {
  SCHEDULED = 'SCHEDULED',  // 발행 예약됨
  PROCESSING = 'PROCESSING', // 발행 진행 중
  PENDING = 'PENDING',
  SUCCESS = 'SUCCESS',
  FAILED = 'FAILED',
}

@Entity('publish_logs')
export class PublishLog {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  contentId: string;

  @ManyToOne(() => Content, (content) => content.publishLogs)
  @JoinColumn({ name: 'contentId' })
  content: Content;

  @Column({
    type: 'enum',
    enum: PublishPlatform,
  })
  platform: PublishPlatform;

  @Column({
    type: 'enum',
    enum: PublishStatus,
    default: PublishStatus.PENDING,
  })
  status: PublishStatus;

  @Column({ nullable: true })
  publishedUrl: string;

  @Column({ nullable: true })
  externalPostId: string;

  @Column('text', { nullable: true })
  errorMessage: string;

  @Column({ nullable: true })
  retryCount: number;

  @Column({ type: 'timestamp', nullable: true })
  scheduledAt: Date;  // 예약 발행 시간

  @Column({ nullable: true })
  qstashMessageId: string;  // QStash 메시지 ID

  @CreateDateColumn()
  createdAt: Date;
}

