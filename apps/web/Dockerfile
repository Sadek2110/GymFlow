# --- Build stage ---
FROM node:22-alpine AS builder
WORKDIR /app

COPY package.json package-lock.json* ./
COPY apps/web/package.json ./apps/web/package.json
RUN npm install --workspace apps/web --include-workspace-root

COPY apps/web ./apps/web
WORKDIR /app/apps/web
# PUBLIC_API_URL se incrusta en el bundle en build time (Vite/Astro)
ARG PUBLIC_API_URL
ENV PUBLIC_API_URL=$PUBLIC_API_URL
RUN npm run build

# --- Runtime stage ---
FROM node:22-alpine AS runner
WORKDIR /app/apps/web
ENV NODE_ENV=production
ENV HOST=0.0.0.0
ENV PORT=3000

COPY --from=builder /app/apps/web/node_modules ./node_modules
COPY --from=builder /app/node_modules /app/node_modules
COPY --from=builder /app/apps/web/dist ./dist
COPY apps/web/package.json ./package.json

EXPOSE 3000
CMD ["node", "./dist/server/entry.mjs"]
