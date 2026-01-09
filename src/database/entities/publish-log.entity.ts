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

  @CreateDateColumn()
  createdAt: Date;
}

