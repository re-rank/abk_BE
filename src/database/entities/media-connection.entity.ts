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
import { EncryptionTransformer } from '../../common/utils/encryption.util';

export enum MediaPlatform {
  WORDPRESS = 'WORDPRESS',
  X = 'X', // Twitter/X
  LINKEDIN = 'LINKEDIN',
  NAVER_BLOG = 'NAVER_BLOG',
  TISTORY = 'TISTORY',
}

export enum ConnectionStatus {
  CONNECTED = 'CONNECTED',
  DISCONNECTED = 'DISCONNECTED',
  ERROR = 'ERROR',
}

export enum AuthType {
  API_KEY = 'API_KEY', // WordPress App Password, etc.
  OAUTH = 'OAUTH', // X, LinkedIn OAuth
  PLAYWRIGHT = 'PLAYWRIGHT', // Naver Blog, Tistory (브라우저 자동화)
}

@Entity('media_connections')
@Index(['projectId', 'platform'], { unique: true }) // 프로젝트당 플랫폼별 하나의 연동만 허용
export class MediaConnection {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  // Supabase Auth의 user ID (보안 검증용)
  @Column({ type: 'uuid' })
  userId: string;

  // 프로젝트별 연동 (필수) - 프로젝트 간 연동 정보 격리
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

  @Column({
    type: 'enum',
    enum: ConnectionStatus,
    default: ConnectionStatus.DISCONNECTED,
  })
  status: ConnectionStatus;

  @Column({
    type: 'enum',
    enum: AuthType,
  })
  authType: AuthType;

  // 플랫폼별 연동 정보 (암호화 필요)
  @Column({ nullable: true })
  apiUrl?: string; // WordPress API URL

  @Column({ nullable: true })
  username?: string; // WordPress username, Naver ID, etc.

  @Column({ nullable: true, transformer: EncryptionTransformer })
  password?: string; // WordPress App Password (AES-256-GCM 암호화)

  // OAuth 클라이언트 정보 (LinkedIn, X)
  @Column({ nullable: true })
  clientId?: string; // OAuth Client ID (LinkedIn, X)

  @Column({ nullable: true, transformer: EncryptionTransformer })
  clientSecret?: string; // OAuth Client Secret (AES-256-GCM 암호화)

  @Column({ nullable: true, transformer: EncryptionTransformer })
  accessToken?: string; // OAuth access token (AES-256-GCM 암호화)

  @Column({ nullable: true, transformer: EncryptionTransformer })
  refreshToken?: string; // OAuth refresh token (AES-256-GCM 암호화)

  @Column({ type: 'timestamp', nullable: true })
  tokenExpiresAt?: Date;

  // 연동된 계정 정보
  @Column({ nullable: true })
  accountName?: string; // 연동된 계정 이름/닉네임

  @Column({ nullable: true })
  accountUrl?: string; // 블로그/프로필 URL

  @Column({ nullable: true })
  profileImageUrl?: string;

  // 마지막 연동 테스트 결과
  @Column({ type: 'timestamp', nullable: true })
  lastCheckedAt?: Date;

  @Column({ nullable: true })
  lastError?: string;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}

