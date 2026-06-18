import crypto from "node:crypto";
import { env } from "./env";

// 用 APP_ENCRYPTION_KEY (base64, 32 bytes) 做 AES-256-GCM 加解密。
// 用來保護存進 DB 的 Threads access token / Shopee secret。
function key(): Buffer {
  const raw = Buffer.from(env.encryptionKey, "base64");
  if (raw.length !== 32) {
    throw new Error("APP_ENCRYPTION_KEY 必須是 base64 編碼的 32 bytes（openssl rand -base64 32）");
  }
  return raw;
}

export function encrypt(plain: string): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key(), iv);
  const enc = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [iv, tag, enc].map((b) => b.toString("base64")).join(".");
}

export function decrypt(payload: string): string {
  const parts = payload.split(".");
  if (parts.length !== 3) throw new Error("無效的加密資料格式，解密失敗");
  const [ivB64, tagB64, dataB64] = parts;
  const decipher = crypto.createDecipheriv("aes-256-gcm", key(), Buffer.from(ivB64, "base64"));
  decipher.setAuthTag(Buffer.from(tagB64, "base64"));
  return Buffer.concat([decipher.update(Buffer.from(dataB64, "base64")), decipher.final()]).toString("utf8");
}
