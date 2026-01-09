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

