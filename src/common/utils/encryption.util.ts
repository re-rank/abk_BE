import * as crypto from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16;

// 암호화 활성화 여부 (ENCRYPTION_KEY가 있으면 활성화)
let encryptionEnabled = false;
let encryptionKey: Buffer | null = null;

/**
 * 암호화 키 초기화 (앱 시작 시 한 번만 실행)
 */
function initEncryptionKey(): void {
  const key = process.env.ENCRYPTION_KEY;
  if (key) {
    encryptionKey = crypto.createHash('sha256').update(key).digest();
    encryptionEnabled = true;
    console.log('🔐 암호화 활성화됨');
  } else {
    encryptionEnabled = false;
    console.warn('⚠️  ENCRYPTION_KEY 미설정 - 민감 데이터 암호화 비활성화');
  }
}

// 초기화 실행
initEncryptionKey();

/**
 * 암호화 키 가져오기
 */
function getEncryptionKey(): Buffer | null {
  return encryptionKey;
}

/**
 * 문자열 암호화 (AES-256-GCM)
 * ENCRYPTION_KEY가 없으면 평문 반환
 */
export function encrypt(plainText: string | null | undefined): string | null {
  if (!plainText) return null;

  const key = getEncryptionKey();
  if (!key) {
    // 암호화 키가 없으면 평문 그대로 저장
    return plainText;
  }

  try {
    const iv = crypto.randomBytes(IV_LENGTH);
    const cipher = crypto.createCipheriv(ALGORITHM, key, iv);

    let encrypted = cipher.update(plainText, 'utf8', 'base64');
    encrypted += cipher.final('base64');

    const authTag = cipher.getAuthTag();

    // iv:authTag:encrypted 형식으로 저장
    return `${iv.toString('base64')}:${authTag.toString('base64')}:${encrypted}`;
  } catch (error) {
    console.error('암호화 실패, 평문 저장:', error);
    return plainText;
  }
}

/**
 * 문자열 복호화 (AES-256-GCM)
 * ENCRYPTION_KEY가 없거나 평문이면 그대로 반환
 */
export function decrypt(encryptedText: string | null | undefined): string | null {
  if (!encryptedText) return null;

  // 암호화되지 않은 데이터 (: 가 없으면 평문)
  if (!encryptedText.includes(':')) {
    return encryptedText;
  }

  const key = getEncryptionKey();
  if (!key) {
    // 암호화 키가 없으면 복호화 불가 - 원본 반환
    return encryptedText;
  }

  try {
    const [ivBase64, authTagBase64, encrypted] = encryptedText.split(':');

    if (!ivBase64 || !authTagBase64 || !encrypted) {
      return encryptedText;
    }

    const iv = Buffer.from(ivBase64, 'base64');
    const authTag = Buffer.from(authTagBase64, 'base64');
    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(authTag);

    let decrypted = decipher.update(encrypted, 'base64', 'utf8');
    decrypted += decipher.final('utf8');

    return decrypted;
  } catch (error) {
    // 복호화 실패 시 원본 반환 (이전 데이터 호환성)
    return encryptedText;
  }
}

/**
 * TypeORM Column Transformer - 자동 암호화/복호화
 */
export const EncryptionTransformer = {
  to: (value: string | null | undefined): string | null => encrypt(value),
  from: (value: string | null | undefined): string | null => decrypt(value),
};

/**
 * 암호화 키 생성 헬퍼 (초기 설정용)
 * 콘솔에서 실행: node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
 */
export function generateEncryptionKey(): string {
  return crypto.randomBytes(32).toString('base64');
}

/**
 * 암호화 활성화 여부 확인
 */
export function isEncryptionEnabled(): boolean {
  return encryptionEnabled;
}
