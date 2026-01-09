import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity('authority_sites')
export class AuthoritySite {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  siteName: string;

  @Column()
  siteUrl: string;

  @Column({ nullable: true })
  description: string;

  @Column({ default: true })
  isActive: boolean;

  @Column({ default: 0 })
  priority: number;

  // WordPress 연동 정보
  @Column({ nullable: true })
  wordpressApiUrl: string;

  @Column({ nullable: true })
  wordpressUsername: string;

  @Column({ nullable: true })
  wordpressAppPassword: string;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}

