import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  OneToMany,
  JoinColumn,
} from 'typeorm';
import { Project } from './project.entity';
import { Backlink } from './backlink.entity';
import { PublishLog } from './publish-log.entity';
import { SnsPost } from './sns-post.entity';

export enum ContentType {
  INFO = 'INFO',
  CASE = 'CASE',
  GUIDE = 'GUIDE',
}

export enum ContentStatus {
  SCHEDULED = 'SCHEDULED',  // 발행 예약됨
  PUBLISHING = 'PUBLISHING', // 발행 중
  CREATED = 'CREATED',
  PUBLISHED = 'PUBLISHED',
  FAILED = 'FAILED',
}

@Entity('contents')
export class Content {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  projectId: string;

  @ManyToOne(() => Project, (project) => project.contents)
  @JoinColumn({ name: 'projectId' })
  project: Project;

  @Column()
  title: string;

  @Column('text')
  body: string;

  @Column({
    type: 'enum',
    enum: ContentType,
    default: ContentType.INFO,
  })
  contentType: ContentType;

  @Column('text', { nullable: true })
  searchCta: string;

  @Column({
    type: 'enum',
    enum: ContentStatus,
    default: ContentStatus.CREATED,
  })
  status: ContentStatus;

  @Column({ nullable: true })
  wordpressPostId: string;

  @Column({ nullable: true })
  mediumPostId: string;

  @Column({ nullable: true })
  naverBlogPostId: string;

  @Column({ nullable: true })
  tistoryPostId: string;

  // 예약 발행 설정
  @Column({ type: 'timestamp', nullable: true })
  scheduledAt: Date;  // 예약 발행 시간 (콘텐츠별 설정)

  @Column({ nullable: true })
  scheduledPlatforms: string;  // 예약 발행 플랫폼 (comma separated)

  @Column({ nullable: true })
  qstashMessageIds: string;  // QStash 메시지 ID들 (JSON)

  @OneToMany(() => Backlink, (backlink) => backlink.content)
  backlinks: Backlink[];

  @OneToMany(() => PublishLog, (log) => log.content)
  publishLogs: PublishLog[];

  @OneToMany(() => SnsPost, (post) => post.content)
  snsPosts: SnsPost[];

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}

