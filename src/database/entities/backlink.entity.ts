import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { Content } from './content.entity';
import { Project } from './project.entity';

export enum BacklinkSourceType {
  SELF = 'SELF',
  AUTHORITY = 'AUTHORITY',
  INTERNAL = 'INTERNAL',
}

export enum BacklinkPlatform {
  WORDPRESS = 'WORDPRESS',
  MEDIUM = 'MEDIUM',
}

export enum BacklinkPosition {
  MID = 'MID',
  BOTTOM = 'BOTTOM',
}

@Entity('backlinks')
export class Backlink {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  contentId: string;

  @ManyToOne(() => Content, (content) => content.backlinks)
  @JoinColumn({ name: 'contentId' })
  content: Content;

  @Column()
  projectId: string;

  @ManyToOne(() => Project, (project) => project.backlinks)
  @JoinColumn({ name: 'projectId' })
  project: Project;

  @Column({
    type: 'enum',
    enum: BacklinkSourceType,
    default: BacklinkSourceType.SELF,
  })
  sourceType: BacklinkSourceType;

  @Column({
    type: 'enum',
    enum: BacklinkPlatform,
    default: BacklinkPlatform.WORDPRESS,
  })
  sourcePlatform: BacklinkPlatform;

  @Column({ nullable: true })
  sourceUrl: string;

  @Column()
  targetUrl: string;

  @Column()
  anchorText: string;

  @Column({ default: true })
  isFollow: boolean;

  @Column({
    type: 'enum',
    enum: BacklinkPosition,
    default: BacklinkPosition.BOTTOM,
  })
  insertedPosition: BacklinkPosition;

  @Column({ default: false })
  isApproved: boolean;

  @CreateDateColumn()
  createdAt: Date;
}

