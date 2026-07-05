/**
 * Validación de variables de entorno críticas al arrancar.
 * Falla rápido (fail-fast) si faltan secretos: es preferible no arrancar a
 * arrancar con JWT inseguros. (security-best-practices)
 */
export function validateEnv(
  config: Record<string, unknown>,
): Record<string, unknown> {
  const required = ['DATABASE_URL', 'JWT_SECRET', 'JWT_REFRESH_SECRET'];
  const missing = required.filter((key) => {
    const value = config[key];
    return value === undefined || value === null || value === '';
  });

  if (missing.length > 0) {
    throw new Error(
      `Faltan variables de entorno obligatorias: ${missing.join(', ')}`,
    );
  }

  for (const secretKey of ['JWT_SECRET', 'JWT_REFRESH_SECRET']) {
    const secret = String(config[secretKey]);
    if (secret.length < 16) {
      throw new Error(
        `${secretKey} es demasiado corto (mínimo 16 caracteres). Usa una clave larga y aleatoria.`,
      );
    }
  }

  if (config.RESERVAGYM_ENABLED === 'true') {
    const encryptionKey = String(config.CREDENTIALS_ENCRYPTION_KEY ?? '');
    if (!/^[0-9a-f]{64}$/i.test(encryptionKey)) {
      throw new Error(
        'CREDENTIALS_ENCRYPTION_KEY debe tener 64 caracteres hexadecimales',
      );
    }
  }

  return config;
}
