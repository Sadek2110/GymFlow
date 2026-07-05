# --- Build stage ---
FROM node:22-alpine AS builder
RUN apk add --no-cache openssl libc6-compat
WORKDIR /app

# Instala dependencias del workspace del API (context = raíz del monorepo)
COPY package.json package-lock.json* ./
COPY apps/api/package.json ./apps/api/package.json
RUN npm install --workspace apps/api --include-workspace-root

COPY apps/api ./apps/api
WORKDIR /app/apps/api
RUN npx prisma generate
RUN npm run build
# npm hoistea las deps a /app/node_modules; garantiza que el dir exista para el COPY del runner
RUN mkdir -p node_modules

# --- Runtime stage ---
FROM node:22-alpine AS runner
RUN apk add --no-cache openssl libc6-compat
WORKDIR /app/apps/api
ENV NODE_ENV=production

COPY --from=builder /app/apps/api/node_modules ./node_modules
COPY --from=builder /app/node_modules /app/node_modules
COPY --from=builder /app/apps/api/dist ./dist
COPY --from=builder /app/apps/api/prisma ./prisma
COPY apps/api/package.json ./package.json
COPY apps/api/tsconfig.json ./tsconfig.json

EXPOSE 4000
# Aplica migraciones y arranca
CMD ["sh", "-c", "npx prisma migrate deploy && node dist/main.js"]
