import { SetMetadata } from '@nestjs/common';

export const IS_PUBLIC_KEY = 'isPublic';

/** Marca una ruta como pública (sin JWT). El JwtAuthGuard la deja pasar. */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
