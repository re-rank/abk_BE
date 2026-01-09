import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { Content } from './content.entity';

export enum SnsPlatform {
  TWITTER = 'TWITTER',
  LINKEDIN = 'LINKEDIN',
}

export enum SnsPostStatus {
  PENDING = 'PENDING',
  SUCCESS = 'SUCCESS',
  FAILED = 'FAILED',
}

@Entity('sns_posts')
export class SnsPost {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  contentId: string;

  @ManyToOne(() => Content, (content) => content.snsPosts)
  @JoinColumn({ name: 'contentId' })
  content: Content;

  @Column({
    type: 'enum',
    enum: SnsPlatform,
  })
  platform: SnsPlatform;

  @Column({
    type: 'enum',
    enum: SnsPostStatus,
    default: SnsPostStatus.PENDING,
  })
  status: SnsPostStatus;

  @Column('text')
  postContent: string;

  @Column({ nullable: true })
  externalPostId: string;

  @Column({ nullable: true })
  postUrl: string;

  @Column('text', { nullable: true })
  errorMessage: string;

  @CreateDateColumn()
  createdAt: Date;
}

