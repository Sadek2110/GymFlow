import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
  type CipherGCM,
  type DecipherGCM,
} from 'node:crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_BYTES = 12;

@Injectable()
export class CryptoService {
  private readonly key: Buffer;

  constructor(config: ConfigService) {
    const hex = config.get<string>('CREDENTIALS_ENCRYPTION_KEY') ?? '';
    if (!/^[0-9a-f]{64}$/i.test(hex)) {
      throw new Error(
        'CREDENTIALS_ENCRYPTION_KEY debe ser 32 bytes en hexadecimal (64 caracteres)',
      );
    }
    this.key = Buffer.from(hex, 'hex');
  }

  encrypt(plainText: string): string {
    const iv = randomBytes(IV_BYTES);
    const cipher = createCipheriv(ALGORITHM, this.key, iv) as CipherGCM;
    const encrypted = Buffer.concat([
      cipher.update(plainText, 'utf8'),
      cipher.final(),
    ]);
    return [
      iv.toString('base64'),
      cipher.getAuthTag().toString('base64'),
      encrypted.toString('base64'),
    ].join('.');
  }

  decrypt(payload: string): string {
    const parts = payload.split('.');
    if (parts.length !== 3 || parts.some((part) => part.length === 0)) {
      throw new Error('Payload cifrado corrupto');
    }
    const [iv, tag, encrypted] = parts.map((part) =>
      Buffer.from(part, 'base64'),
    );
    const decipher = createDecipheriv(
      ALGORITHM,
      this.key,
      iv,
    ) as DecipherGCM;
    decipher.setAuthTag(tag);
    return Buffer.concat([
      decipher.update(encrypted),
      decipher.final(),
    ]).toString('utf8');
  }
}
