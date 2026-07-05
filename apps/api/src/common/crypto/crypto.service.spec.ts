import { CryptoService } from './crypto.service';

const KEY = 'a'.repeat(64);

describe('CryptoService', () => {
  it('cifra cada valor con un IV distinto y recupera el texto original', () => {
    const service = new CryptoService({
      get: (name: string) =>
        name === 'CREDENTIALS_ENCRYPTION_KEY' ? KEY : undefined,
    } as any);

    const first = service.encrypt('secreto');
    const second = service.encrypt('secreto');

    expect(first).not.toBe(second);
    expect(first.split('.')).toHaveLength(3);
    expect(service.decrypt(first)).toBe('secreto');
    expect(service.decrypt(second)).toBe('secreto');
  });

  it('rechaza claves maestras inválidas y payloads manipulados', () => {
    expect(
      () => new CryptoService({ get: () => 'corta' } as any),
    ).toThrow(/64 caracteres/);

    const service = new CryptoService({
      get: () => KEY,
    } as any);
    expect(() => service.decrypt('payload-corrupto')).toThrow(
      /Payload cifrado corrupto/,
    );
  });
});
