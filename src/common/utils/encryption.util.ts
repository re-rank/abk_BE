import * as crypto from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16;
const AUTH_TAG_LENGTH = 16;
const SALT_LENGTH = 32;

/**
 * 암호화 키 가져오기 (환경변수에서)
 * 키가 없으면 에러 발생
 */
function getEncryptionKey(): Buffer {
  const key = process.env.ENCRYPTION_KEY;
  if (!key) {
    throw new Error('ENCRYPTION_KEY 환경변수가 설정되지 않았습니다.');
  }
  // 키를 32바이트로 해싱 (AES-256 요구사항)
  return crypto.createHash('sha256').update(key).digest();
}

/**
 * 문자열 암호화 (AES-256-GCM)
 * @param plainText 암호화할 평문
 * @returns Base64 인코딩된 암호문 (iv:authTag:encrypted 형식)
 */
export function encrypt(plainText: string | null | undefined): string | null {
  if (!plainText) return null;

  try {
    const key = getEncryptionKey();
    const iv = crypto.randomBytes(IV_LENGTH);
    const cipher = crypto.createCipheriv(ALGORITHM, key, iv);

    let encrypted = cipher.update(plainText, 'utf8', 'base64');
    encrypted += cipher.final('base64');

    const authTag = cipher.getAuthTag();

    // iv:authTag:encrypted 형식으로 저장
    return `${iv.toString('base64')}:${authTag.toString('base64')}:${encrypted}`;
  } catch (error) {
    console.error('암호화 실패:', error);
    throw new Error('데이터 암호화에 실패했습니다.');
  }
}

/**
 * 문자열 복호화 (AES-256-GCM)
 * @param encryptedText Base64 인코딩된 암호문
 * @returns 복호화된 평문
 */
export function decrypt(encryptedText: string | null | undefined): string | null {
  if (!encryptedText) return null;

  // 이미 평문인 경우 (마이그레이션 전 데이터)
  if (!encryptedText.includes(':')) {
    console.warn('암호화되지 않은 데이터 발견 - 마이그레이션 필요');
    return encryptedText;
  }

  try {
    const key = getEncryptionKey();
    const [ivBase64, authTagBase64, encrypted] = encryptedText.split(':');

    if (!ivBase64 || !authTagBase64 || !encrypted) {
      console.warn('잘못된 암호문 형식');
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
    console.error('복호화 실패:', error);
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
