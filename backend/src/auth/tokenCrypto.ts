import crypto from "node:crypto";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12;

function keyFromHex(keyHex: string): Buffer {
  return Buffer.from(keyHex, "hex");
}

/** OAuth 토큰을 AES-256-GCM으로 암호화한다. 결과: "iv.authTag.ciphertext" (모두 base64url) */
export function encryptToken(plainText: string, keyHex: string): string {
  const key = keyFromHex(keyHex);
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);

  const ciphertext = Buffer.concat([cipher.update(plainText, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();

  return [iv.toString("base64url"), authTag.toString("base64url"), ciphertext.toString("base64url")].join(".");
}

/** encryptToken()으로 암호화된 값을 복호화한다. 변조/키 불일치 시 예외 발생 (GCM 인증 실패) */
export function decryptToken(encrypted: string, keyHex: string): string {
  // base64url 알파벳에는 "."이 없으므로 빈 암호문(평문이 빈 문자열인 경우)이어도 항상 3개 파트로 나뉜다
  const parts = encrypted.split(".");
  if (parts.length !== 3) {
    throw new Error("decryptToken: 암호화된 토큰 형식이 올바르지 않습니다");
  }
  const [ivPart, authTagPart, ciphertextPart] = parts;

  const key = keyFromHex(keyHex);
  const iv = Buffer.from(ivPart, "base64url");
  const authTag = Buffer.from(authTagPart, "base64url");
  const ciphertext = Buffer.from(ciphertextPart, "base64url");

  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);

  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8");
}
