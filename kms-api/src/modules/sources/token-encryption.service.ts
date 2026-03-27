import { Injectable } from '@nestjs/common';
import * as crypto from 'crypto';

/**
 * TokenEncryptionService — AES-256-GCM symmetric encryption for OAuth tokens.
 *
 * Tokens are stored encrypted in the database.  The plaintext is NEVER logged
 * or returned to API clients.  The key is derived from the
 * `API_KEY_ENCRYPTION_SECRET` environment variable via scrypt so that even a
 * weak passphrase produces a full 256-bit key.
 *
 * @example
 * ```typescript
 * const svc = new TokenEncryptionService();
 * const ciphertext = svc.encrypt(JSON.stringify(tokens));
 * const plaintext  = svc.decrypt(ciphertext);
 * ```
 */
@Injectable()
export class TokenEncryptionService {
  private readonly algorithm = 'aes-256-gcm';
  private readonly key: Buffer;

  constructor() {
    const secret =
      process.env.API_KEY_ENCRYPTION_SECRET || 'dev-secret-32-bytes-exactly!!!!!!';
    this.key = crypto.scryptSync(secret, 'kms-salt', 32);
  }

  /**
   * Encrypts a plaintext string using AES-256-GCM.
   *
   * Output format (base64): `[12-byte IV] + [16-byte auth tag] + [ciphertext]`
   *
   * @param plaintext - The UTF-8 string to encrypt
   * @returns Base64-encoded ciphertext with prepended IV and auth tag
   */
  encrypt(plaintext: string): string {
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv(this.algorithm, this.key, iv);
    const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
    const tag = cipher.getAuthTag();
    return Buffer.concat([iv, tag, encrypted]).toString('base64');
  }

  /**
   * Decrypts a ciphertext produced by {@link encrypt}.
   *
   * @param ciphertext - Base64-encoded string from {@link encrypt}
   * @returns Decrypted UTF-8 plaintext
   * @throws Error if authentication tag verification fails (tampered data)
   */
  decrypt(ciphertext: string): string {
    const buf = Buffer.from(ciphertext, 'base64');
    const iv = buf.subarray(0, 12);
    const tag = buf.subarray(12, 28);
    const encrypted = buf.subarray(28);
    const decipher = crypto.createDecipheriv(this.algorithm, this.key, iv);
    decipher.setAuthTag(tag);
    return decipher.update(encrypted) + decipher.final('utf8');
  }
}
