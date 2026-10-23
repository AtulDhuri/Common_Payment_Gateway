// FILE: modules/crypto/crypto.service.ts
// PURPOSE: AES-256-GCM encryption of secrets as "v1:<iv>:<tag>:<ciphertext>" (base64 parts), plus HMAC and hash helpers
// DEPENDENCIES: AppConfig (MASTER_ENCRYPTION_KEY), node:crypto
// PHASE: 4
import { createCipheriv, createDecipheriv, createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { APP_CONFIG } from '../../config/config.module';
import { AppConfig } from '../../config/configuration';

const VERSION = 'v1';
const IV_BYTES = 12;

@Injectable()
export class CryptoService {
  private readonly key: Buffer;

  constructor(@Inject(APP_CONFIG) config: AppConfig) {
    this.key = config.masterEncryptionKey;
  }

  encrypt(plaintext: string): string {
    const iv = randomBytes(IV_BYTES);
    const cipher = createCipheriv('aes-256-gcm', this.key, iv);
    const data = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
    const tag = cipher.getAuthTag();
    return [VERSION, iv.toString('base64'), tag.toString('base64'), data.toString('base64')].join(':');
  }

  /** Throws on a malformed envelope, wrong key or tampered data. */
  decrypt(envelope: string): string {
    const [version, iv, tag, data] = envelope.split(':');
    if (version !== VERSION || !iv || !tag || data === undefined) throw new Error('Invalid encrypted value');
    const decipher = createDecipheriv('aes-256-gcm', this.key, Buffer.from(iv, 'base64'));
    decipher.setAuthTag(Buffer.from(tag, 'base64'));
    return Buffer.concat([decipher.update(Buffer.from(data, 'base64')), decipher.final()]).toString('utf8');
  }

  isEnvelope(value: unknown): boolean {
    return typeof value === 'string' && /^v1:[^:]+:[^:]+:[^:]*$/.test(value);
  }

  sha256Hex(input: string): string {
    return createHash('sha256').update(input).digest('hex');
  }

  safeEqual(a: string, b: string): boolean {
    const ba = Buffer.from(a);
    const bb = Buffer.from(b);
    return ba.length === bb.length && timingSafeEqual(ba, bb);
  }
}
