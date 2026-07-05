# GymFlow AI — MVP 1

Monorepo de la app de gimnasio: registro, perfil con historial de peso, ejercicios, rutinas,
entrenamientos, historial y dashboard. **Mobile-first.**

> Stack (según `AGENTS.md`, que prevalece sobre la guía): **Astro + React (islas)** en el frontend,
> **NestJS + Prisma** en el backend, **Tailwind CSS** para estilos, **PostgreSQL 16**.
> Desarrollo **dirigido por tests (TDD)**.

## Estructura

```text
gymflow/
├── apps/
│   ├── api/   # NestJS + Prisma (backend)
│   └── web/   # Astro + React + Tailwind (frontend)
├── docker-compose.yml
└── package.json   # npm workspaces
```

## Requisitos

- Node.js 22+
- Docker (para Postgres y despliegue)

## Arranque rápido (desarrollo)

```bash
# 1. Instalar dependencias (raíz del monorepo)
npm install

# 2. Levantar la base de datos
npm run db:up            # docker compose up -d db

# 3. Configurar variables de entorno
cp apps/api/.env.example apps/api/.env
cp apps/web/.env.example apps/web/.env

# 4. Migraciones + seed
npm run prisma:migrate --workspace apps/api
npm run prisma:seed    --workspace apps/api

# 5. Arrancar
npm run dev:api          # http://localhost:4000/api/v1
npm run dev:web          # http://localhost:3000
```

## Tests

```bash
# API (Jest, prisma mockeado — no necesita DB)
npm test --workspace apps/api          # 112 tests
# Web (Vitest + Testing Library)
npm test --workspace apps/web          # 49 tests
```

## Todo el stack con Docker (dev o self-host)

```bash
docker compose up -d --build           # db (5433) + api (4000) + web (3001)
# La API aplica `prisma migrate deploy` al arrancar. Para sembrar datos:
docker compose exec api npx prisma db seed
```

Luego abre **http://localhost:3001**. Admin sembrado: `admin@gymflow.local` / `ChangeMe123!`.

## Progreso por fases

- [x] **Fase 0** — Infraestructura (monorepo, docker-compose, Prisma, tooling de tests)
- [x] **Fase 1** — Auth + perfil (register/login/refresh, guards, onboarding, measurements)
- [x] **Fase 2** — Ejercicios (listado con filtros + paginación, ficha, categorías, CRUD admin, seed 70 ejercicios)
- [x] **Fase 3** — Rutinas (CRUD, días, ejercicios por día, activar única, duplicar, reordenar)
- [x] **Fase 4** — Entrenamientos (start/active/logs/finish/abandon, pantalla `/train` con timer de descanso)
- [x] **Fase 5** — Dashboard + historial + progreso (overview, PRs al vuelo, e1RM, `/history`, gráficas)
- [x] **Fase 6** — Módulo reservas (proxy a ReservaGym con feature flag, opcional)
- [x] **Fase 7** — Pulido y despliegue (estados vacíos/errores/carga, 404, checklist de calidad, docs de deploy)

## Checklist de calidad (guía §10)

- [x] Contraseñas con `bcrypt` (cost 10) y nunca devueltas en las respuestas.
- [x] Validación de todos los DTOs (`class-validator`) y límites de paginación (`limit ≤ 100`).
- [x] Rate limiting en `/auth/*` (5 intentos/min con `@nestjs/throttler`).
- [x] Aislamiento por usuario: cada consulta filtra por `userId` (rutinas, sesiones, series, reservas).
- [x] Una sola rutina activa y una sola sesión `in_progress` por usuario.
- [x] La app no cae si ReservaGym falla: el proxy responde 502 y registra el intento como `failed`.
- [x] Seed reproducible e idempotente (`prisma db seed`: admin + 70 ejercicios).
- [x] `.env` fuera de git en los tres proyectos; `.env.example` documentado.

## Despliegue (EasyPanel)

Tres servicios independientes (como ReservaGym):

1. **DB** — PostgreSQL 16 con volumen persistente y backups.
2. **API** — imagen de `apps/api/Dockerfile`. Puerto interno `4000`. Variables (ver `apps/api/.env.example`):
   `DATABASE_URL`, `JWT_SECRET`, `JWT_REFRESH_SECRET`, `JWT_ACCESS_TTL`, `JWT_REFRESH_TTL`, `PORT`,
   `CORS_ORIGIN` (= dominio del front), y opcionalmente `RESERVAGYM_ENABLED/URL/API_KEY`.
   El contenedor ejecuta `prisma migrate deploy` al arrancar; el seed se lanza una vez a mano.
3. **Web** — imagen de `apps/web/Dockerfile`. Puerto interno `3000`. Variable `PUBLIC_API_URL`
   (= `https://api.tudominio.com/api/v1`).

## Integración con ReservaGym

El microservicio `ReservaGym` (Express + Playwright) se despliega por separado. El backend lo consume
como **proxy** con feature flag `RESERVAGYM_ENABLED`: `GET /reservations/health`, `POST /reservations/run`
(solo envía `{dryRun,time}`; las credenciales del gimnasio viven en el `.env` de ReservaGym) y
`GET /reservations`. Con el flag desactivado, el módulo responde `404` y el frontend muestra "no disponible".
