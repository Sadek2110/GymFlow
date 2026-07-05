export interface JwtConfig {
  accessSecret: string;
  refreshSecret: string;
  accessTtl: string;
  refreshTtl: string;
}

export interface ReservaGymConfig {
  enabled: boolean;
  url?: string;
  apiKey?: string;
}

export interface AppConfiguration {
  port: number;
  corsOrigin: string;
  jwt: JwtConfig;
  reservagym: ReservaGymConfig;
}

export default (): AppConfiguration => ({
  port: parseInt(process.env.PORT ?? '4000', 10),
  corsOrigin: process.env.CORS_ORIGIN ?? '*',
  jwt: {
    accessSecret: process.env.JWT_SECRET ?? '',
    refreshSecret: process.env.JWT_REFRESH_SECRET ?? '',
    accessTtl: process.env.JWT_ACCESS_TTL ?? '15m',
    refreshTtl: process.env.JWT_REFRESH_TTL ?? '7d',
  },
  reservagym: {
    enabled: process.env.RESERVAGYM_ENABLED === 'true',
    url: process.env.RESERVAGYM_URL,
    apiKey: process.env.RESERVAGYM_API_KEY,
  },
});
