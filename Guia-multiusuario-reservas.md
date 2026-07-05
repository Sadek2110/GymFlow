# Guía: Reservas multiusuario en GymFlow — credenciales, cancelación, doble franja y panel admin

Esta guía amplía el módulo de reservas para convertirlo en **multiusuario real**. Cubre
cuatro funcionalidades, en el orden en que conviene implementarlas porque cada una
depende (parcial o totalmente) de la anterior:

| Fase | Funcionalidad | Depende de |
|------|---------------|------------|
| A | Credenciales de gimnasio por usuario (DNI + contraseña) | — |
| B | Cancelar una reserva | A |
| C | Dos (o más) sesiones el mismo día | A |
| D | Panel de administración (usuarios + reservas) | — (puede ir en paralelo) |

**Producción**: `https://gymflow.dksaa.com`. Todos los `curl` de esta guía usan
`https://gymflow.dksaa.com/api/v1` como base. Si tu API vive en otro subdominio
(p. ej. `https://api.dksaa.com/api/v1`), ajusta la variable:

```bash
export BASE="https://gymflow.dksaa.com/api/v1"
export JWT="<tu-access-token>"
```

---

## 0. Estado de partida

Antes de empezar, verifica que ya tienes (todo esto existe hoy):

- `ReservationsModule` funcionando con `GET /reservations/health`, `POST /reservations/run`
  y `GET /reservations`.
- `AutoReserveService` con cron a las 05:00 Europe/Madrid.
- Estados de `Reservation`: `pending | confirmed | failed | dry_run | skipped`.
- ReservaGym desplegado con `GYM_DNI` y `GYM_PASSWORD` en **su** `.env` (modo mono-usuario).
- `RESERVAGYM_ENABLED=true` en la API.

Comprobación rápida contra producción:

```bash
curl "$BASE/reservations/health" -H "Authorization: Bearer $JWT"
# → { "ok": true, "service": "gym-reserver-api", "status": "online" }
```

### 0.1 El cambio de paradigma

Hasta ahora ReservaGym era **mono-usuario**: las credenciales vivían en su `.env` y por
eso la regla era "nunca credenciales en el body". Al pasar a multiusuario esa regla
cambia de forma, no de fondo:

- Las credenciales de cada usuario se guardan **cifradas (AES-256-GCM) en la base de
  datos de GymFlow**, nunca en texto plano.
- Se descifran **solo en el momento de llamar a ReservaGym**, viajan por HTTPS con
  Bearer entre tus dos servicios, y **jamás se loguean** (ni en la API ni en ReservaGym).
- El `.env` de ReservaGym conserva `GYM_DNI`/`GYM_PASSWORD` únicamente como *fallback*
  para tu propio uso por CLI; la API siempre envía credenciales explícitas.
- El admin nunca ve credenciales de nadie: solo un booleano "configuradas: sí/no".

---

# FASE A — Credenciales de gimnasio por usuario

## A.1 Variable de entorno: clave maestra de cifrado

Genera una clave de 32 bytes y añádela al `.env` de `apps/api` (y a EasyPanel):

```bash
openssl rand -hex 32
```

```env
# apps/api/.env
CREDENTIALS_ENCRYPTION_KEY=<los 64 caracteres hex generados>
```

⚠️ **Si pierdes esta clave, pierdes las credenciales guardadas** (habría que pedirlas de
nuevo a los usuarios). Guárdala en tu gestor de secretos. No la rotes sin plan de
re-cifrado.

## A.2 Modelo `GymCredential` en Prisma

Edita `apps/api/prisma/schema.prisma`:

```prisma
model User {
  // ...campos existentes...

  gymCredential GymCredential?   // ← NUEVO (1:1)
}

// Credenciales del portal del gimnasio, cifradas con AES-256-GCM.
// NUNCA se devuelven al cliente; los endpoints solo exponen "configured: boolean".
model GymCredential {
  id          String   @id @default(uuid())
  userId      String   @unique
  dniEnc      String   // formato: iv.tag.ciphertext (base64)
  passwordEnc String
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt
  user        User     @relation(fields: [userId], references: [id], onDelete: Cascade)
}
```

Migración:

```bash
cd apps/api
npx prisma migrate dev --name add-gym-credentials
```

## A.3 `CryptoService` (AES-256-GCM)

Crea `apps/api/src/common/crypto/crypto.service.ts`:

```ts
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';

const ALGO = 'aes-256-gcm';
const IV_BYTES = 12; // recomendado para GCM

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

  /** Devuelve "iv.tag.ciphertext" en base64. IV aleatorio por operación. */
  encrypt(plain: string): string {
    const iv = randomBytes(IV_BYTES);
    const cipher = createCipheriv(ALGO, this.key, iv);
    const enc = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
    const tag = cipher.getAuthTag();
    return `${iv.toString('base64')}.${tag.toString('base64')}.${enc.toString('base64')}`;
  }

  decrypt(payload: string): string {
    const [ivB64, tagB64, dataB64] = payload.split('.');
    if (!ivB64 || !tagB64 || !dataB64) throw new Error('Payload cifrado corrupto');
    const decipher = createDecipheriv(ALGO, this.key, Buffer.from(ivB64, 'base64'));
    decipher.setAuthTag(Buffer.from(tagB64, 'base64'));
    return Buffer.concat([
      decipher.update(Buffer.from(dataB64, 'base64')),
      decipher.final(),
    ]).toString('utf8');
  }
}
```

Regístralo en un módulo común (o directamente en `ReservationsModule`):

```ts
// apps/api/src/common/crypto/crypto.module.ts
import { Module } from '@nestjs/common';
import { CryptoService } from './crypto.service';

@Module({ providers: [CryptoService], exports: [CryptoService] })
export class CryptoModule {}
```

## A.4 DTO y endpoints de credenciales

Crea `apps/api/src/reservations/dto/gym-credentials.dto.ts`:

```ts
import { IsString, Length, Matches } from 'class-validator';

export class SaveGymCredentialsDto {
  // DNI/NIE o carnet del portal. Se valida formato laxo para no bloquear carnets internos.
  @IsString()
  @Length(5, 20)
  @Matches(/^[0-9A-Za-z-]+$/, { message: 'DNI/carnet con formato inválido' })
  dni!: string;

  @IsString()
  @Length(4, 100)
  password!: string;
}
```

Añade al `ReservationsController` (todos bajo `JwtAuthGuard`, que ya aplica):

```ts
// GET /reservations/credentials → estado, nunca el contenido
@Get('credentials')
async credentialsStatus(@CurrentUser() user: JwtUser) {
  const cred = await this.prisma.gymCredential.findUnique({
    where: { userId: user.id },
    select: { updatedAt: true },
  });
  return { configured: !!cred, updatedAt: cred?.updatedAt ?? null };
}

// PUT /reservations/credentials → crear o actualizar
@Put('credentials')
async saveCredentials(
  @CurrentUser() user: JwtUser,
  @Body() dto: SaveGymCredentialsDto,
) {
  await this.prisma.gymCredential.upsert({
    where: { userId: user.id },
    create: {
      userId: user.id,
      dniEnc: this.crypto.encrypt(dto.dni),
      passwordEnc: this.crypto.encrypt(dto.password),
    },
    update: {
      dniEnc: this.crypto.encrypt(dto.dni),
      passwordEnc: this.crypto.encrypt(dto.password),
    },
  });
  return { configured: true };
}

// DELETE /reservations/credentials
@Delete('credentials')
async deleteCredentials(@CurrentUser() user: JwtUser) {
  await this.prisma.gymCredential.deleteMany({ where: { userId: user.id } });
  return { configured: false };
}

// POST /reservations/credentials/test → dry run de solo-login contra el portal
@Post('credentials/test')
async testCredentials(@CurrentUser() user: JwtUser) {
  return this.reservations.testLogin(user.id);
}
```

> **Nota**: `dto.password` pasa por el pipeline de NestJS. Asegúrate de que ningún
> interceptor de logging vuelca bodies de `/reservations/credentials` (si usas un
> `LoggingInterceptor`, añade esa ruta a su lista de exclusión).

## A.5 Cambios en `ReservationsService`

El servicio deja de confiar en el `.env` de ReservaGym y envía credenciales explícitas.

```ts
// apps/api/src/reservations/reservations.service.ts

import { PreconditionFailedException } from '@nestjs/common';
import { CryptoService } from '../common/crypto/crypto.service';

// En el constructor, inyecta CryptoService:
constructor(
  private readonly prisma: PrismaService,
  private readonly crypto: CryptoService,
  configService: ConfigService,
) { /* ... */ }

/** Obtiene y descifra las credenciales del usuario o lanza 412. */
private async getCredentials(userId: string): Promise<{ dni: string; password: string }> {
  const cred = await this.prisma.gymCredential.findUnique({ where: { userId } });
  if (!cred) {
    throw new PreconditionFailedException(
      'Configura tus credenciales del gimnasio en Ajustes antes de reservar',
    );
  }
  return {
    dni: this.crypto.decrypt(cred.dniEnc),
    password: this.crypto.decrypt(cred.passwordEnc),
  };
}
```

Y en `run()`, el body de la llamada a ReservaGym pasa de `{ dryRun, time }` a:

```ts
async run(userId: string, dto: RunReservationDto) {
  this.assertEnabled();
  const dryRun = dto.dryRun ?? true;
  const creds = await this.getCredentials(userId); // ← NUEVO: 412 si no hay

  // ... dentro del doFetch:
  body: JSON.stringify({
    dryRun,
    dni: creds.dni,           // ← NUEVO
    password: creds.password, // ← NUEVO
    ...(dto.time ? { time: dto.time } : {}),
  }),
  // ...
}
```

⚠️ **Muy importante — logging**: `buildLog()` concatena `stdout`/`stderr` del script y
lo persiste en `rawLog`. Las credenciales **no** deben aparecer ahí. En ReservaGym el
script rellena los campos con `locator.fill()` sin imprimirlos, pero como red de
seguridad añade en `buildLog()`:

```ts
private buildLog(result: any): string {
  const parts = [result?.stdout, result?.stderr, result?.message, result?.error]
    .filter(Boolean)
    .join('\n')
    .slice(0, MAX_LOG);
  // Nunca persistir nada que parezca una credencial (defensa en profundidad).
  return parts.replace(/("?password"?\s*[:=]\s*)"[^"]*"/gi, '$1"***"');
}
```

Nuevo método `testLogin` (reutiliza el endpoint `/reservar` con un flag nuevo
`loginOnly`, ver A.6):

```ts
async testLogin(userId: string) {
  this.assertEnabled();
  const creds = await this.getCredentials(userId);
  try {
    const res = await this.doFetch(
      `${this.config.url}/reservar`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.config.apiKey}`,
        },
        body: JSON.stringify({ dryRun: true, loginOnly: true, ...creds }),
      },
      60_000, // el login solo tarda segundos, no 200s
    );
    const result = await res.json().catch(() => null);
    if (!res.ok || !result?.ok) {
      return { ok: false, message: 'El portal rechazó las credenciales' };
    }
    return { ok: true, message: 'Login correcto en el portal' };
  } catch {
    throw new BadGatewayException('El servicio de reservas no respondió');
  }
}
```

## A.6 Cambios en ReservaGym

Tres cambios pequeños en el microservicio Express:

**1. Exigir credenciales cuando llegan de la API** (y mantener el `.env` como fallback
solo para uso CLI local):

```js
// server.js — handler de POST /reservar
const dni = req.body?.dni ?? process.env.GYM_DNI;
const password = req.body?.password ?? process.env.GYM_PASSWORD;

if (!dni || !password) {
  return res.status(400).json({ ok: false, error: 'Faltan credenciales (dni/password)' });
}
```

**2. Nunca loguear el body.** Busca cualquier `console.log(req.body)` o middleware tipo
`morgan` con body-logging y elimínalo. Si quieres traza, loguea solo:

```js
console.log(`[reservar] dryRun=${req.body?.dryRun} time=${req.body?.time ?? 'default'} dni=***`);
```

**3. Soportar `loginOnly`** para el test de credenciales: el script hace el Paso 1
(login) y termina:

```js
// En el script de Playwright, tras verificar el login:
if (process.env.LOGIN_ONLY === 'true') {
  console.log('LOGIN_ONLY: login verificado, terminando.');
  return;
}
```

(El server pasa `LOGIN_ONLY=true` como env del proceso hijo cuando `req.body.loginOnly === true`.)

## A.7 Cambio en `AutoReserveService`

El cron ahora debe saltarse a los usuarios sin credenciales, con un nuevo motivo de skip:

```ts
// En runForUser(), antes de llamar a reservations.run():
const hasCreds = await this.prisma.gymCredential.count({ where: { userId } });
if (!hasCreds) {
  await this.persistSkip(userId, tomorrow, time, 'no-credentials');
  await this.telegram.send(
    `⚠️ <b>${userName}</b>: auto-reserva activada pero sin credenciales configuradas.`,
  );
  return { skipped: true, reason: 'no-credentials' };
}
```

## A.8 Frontend: sección "Credenciales del gimnasio" en Ajustes

En `/settings`, un bloque nuevo con:

- Estado actual (`GET /reservations/credentials`): badge "Configuradas ✓" o "Sin configurar".
- Formulario DNI + contraseña (input `type="password"`), botón **Guardar** (`PUT`).
- Botón **Probar conexión** (`POST /reservations/credentials/test`) que muestra el
  resultado ("Login correcto" / "El portal rechazó las credenciales").
- Botón **Eliminar** (`DELETE`) con confirmación.
- Texto legal/informativo visible: *"Tus credenciales del portal del ICD se guardan
  cifradas y solo se usan para hacer tus reservas. Puedes eliminarlas cuando quieras."*

En `ReservationsPanel`, si `configured === false`, deshabilita el botón de reservar y
muestra un enlace a Ajustes. El backend ya devuelve 412 como segunda barrera.

## A.9 Pruebas de la Fase A contra producción

```bash
# 1. Sin credenciales, reservar debe dar 412
curl -X POST "$BASE/reservations/run" \
  -H "Authorization: Bearer $JWT" -H "Content-Type: application/json" \
  -d '{"dryRun": true}'
# → 412 "Configura tus credenciales..."

# 2. Guardar credenciales
curl -X PUT "$BASE/reservations/credentials" \
  -H "Authorization: Bearer $JWT" -H "Content-Type: application/json" \
  -d '{"dni": "12345678A", "password": "mi_password_del_portal"}'
# → { "configured": true }

# 3. Probar login real contra el portal
curl -X POST "$BASE/reservations/credentials/test" \
  -H "Authorization: Bearer $JWT"
# → { "ok": true, "message": "Login correcto en el portal" }

# 4. Dry run completo con tus credenciales
curl -X POST "$BASE/reservations/run" \
  -H "Authorization: Bearer $JWT" -H "Content-Type: application/json" \
  -d '{"dryRun": true, "time": "09:00 - 10:00"}'
# → row Reservation con status "dry_run"
```

Verifica en la base de datos que `dniEnc`/`passwordEnc` son blobs base64 con dos puntos
(`iv.tag.ciphertext`) y **no** texto plano, y que ningún `rawLog` contiene la contraseña.

---

# FASE B — Cancelar una reserva

El portal `.aspx` es la única fuente de verdad: cancelar significa **automatizar el
flujo de anulación del portal** con Playwright, igual que se hizo con la reserva.

## B.1 Reconocimiento manual del portal (hazlo primero, a mano)

Antes de escribir código, entra a `https://reservasicd.ceuta.es/a2SportWeb/` con tu
usuario y documenta:

1. ¿Dónde se listan las reservas activas? (busca un enlace tipo **"MIS RESERVAS"** o
   similar en el menú tras identificarte).
2. ¿Cómo identifica cada fila la reserva? (fecha, hora, servicio).
3. ¿Qué botón/enlace anula? ¿Abre un confirm de JavaScript, un postback o una página
   intermedia?
4. **¿Hay plazo límite de cancelación?** (p. ej. "no se puede anular con menos de 2 h").
5. **¿Se devuelve el uso del bono al anular?**

Las respuestas a 4 y 5 determinan las validaciones de la UI. Para descubrir los
selectores exactos, usa el generador de Playwright en tu máquina:

```bash
cd reservaGym
npx playwright codegen https://reservasicd.ceuta.es/a2SportWeb/
```

## B.2 Script `cancel.js` en ReservaGym

Crea `scripts/cancel.js` (mismo patrón que el script de reserva). El esqueleto — los
selectores marcados `TODO` salen del reconocimiento del punto B.1:

```js
const { chromium } = require('playwright');
require('dotenv').config();

(async () => {
  const DNI = process.env.GYM_DNI;
  const PASSWORD = process.env.GYM_PASSWORD;
  const TARGET_DATE = process.env.TARGET_DATE;   // "dd/mm/yyyy"
  const TARGET_TIME = process.env.TARGET_TIME;   // "09:00 - 10:00"
  const DRY_RUN = process.env.DRY_RUN !== 'false';

  if (!DNI || !PASSWORD || !TARGET_DATE || !TARGET_TIME) {
    console.error('Faltan GYM_DNI/GYM_PASSWORD/TARGET_DATE/TARGET_TIME');
    process.exit(1);
  }

  const browser = await chromium.launch({ headless: process.env.HEADLESS !== 'false' });
  const page = await browser.newPage();

  try {
    // 1. Login (idéntico al script de reserva)
    await page.goto('https://reservasicd.ceuta.es/a2SportWeb/', { waitUntil: 'domcontentloaded' });
    await page.locator('#SiteContent_MainContent_a2txtCodigo_txtA2TextBox').fill(DNI);
    await page.locator('#SiteContent_MainContent_a2txtPassword_txtA2TextBox').fill(PASSWORD);
    await page.locator('#SiteContent_MainContent_btnLogin').click();

    // 2. Ir al listado de reservas del usuario
    // TODO: confirmar el nombre exacto del enlace en el portal
    await page.getByRole('link', { name: 'MIS RESERVAS' }).click();

    // 3. Localizar la fila por fecha + hora
    const row = page
      .locator('tr')
      .filter({ hasText: TARGET_DATE })
      .filter({ hasText: TARGET_TIME });

    if ((await row.count()) === 0) {
      console.error(`No se encontró reserva para ${TARGET_DATE} ${TARGET_TIME}`);
      // Listar lo que hay en pantalla ayuda al debugging desde rawLog
      console.log('Filas visibles:', await page.locator('tr').allTextContents());
      process.exit(2);
    }

    // 4. Botón de anular de esa fila
    // TODO: confirmar selector real (input submit "ANULAR", enlace, icono...)
    const cancelBtn = row.first().locator('a:has-text("ANULAR"), input[value*="ANULAR"]');

    if (DRY_RUN) {
      console.log('DRY RUN: reserva localizada, no se anula.');
      await page.screenshot({ path: 'screenshots/cancel-dry-run.png', fullPage: true });
      process.exit(0);
    }

    // Los portales aspx suelen usar confirm() de JS: aceptarlo antes del clic
    page.once('dialog', (d) => d.accept());
    await cancelBtn.click();

    // 5. Verificar que la fila ya no existe (o que aparece mensaje de éxito)
    await page.waitForLoadState('domcontentloaded');
    const stillThere = await page
      .locator('tr')
      .filter({ hasText: TARGET_DATE })
      .filter({ hasText: TARGET_TIME })
      .count();

    if (stillThere > 0) {
      console.error('La reserva sigue apareciendo tras anular');
      process.exit(3);
    }

    console.log('Reserva anulada correctamente.');
    process.exit(0);
  } finally {
    await browser.close();
  }
})();
```

## B.3 Endpoint `POST /cancelar` en ReservaGym

En `server.js`, junto a `/reservar` (misma autenticación Bearer):

```js
app.post('/cancelar', authMiddleware, async (req, res) => {
  const { dni, password, date, time, dryRun = true } = req.body ?? {};
  const DNI = dni ?? process.env.GYM_DNI;
  const PASSWORD = password ?? process.env.GYM_PASSWORD;

  if (!DNI || !PASSWORD) return res.status(400).json({ ok: false, error: 'Faltan credenciales' });
  if (!date || !time)     return res.status(400).json({ ok: false, error: 'Faltan date/time' });

  try {
    const result = await runScript('scripts/cancel.js', {
      GYM_DNI: DNI,
      GYM_PASSWORD: PASSWORD,
      TARGET_DATE: date,   // "dd/mm/yyyy"
      TARGET_TIME: time,
      DRY_RUN: String(dryRun),
    });
    res.json({ ok: true, dryRun, ...result });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message, stdout: err.stdout, stderr: err.stderr });
  }
});
```

(`runScript` es el mismo helper que ya usas para lanzar el script de reserva con
timeout de 180 s; reutilízalo.)

## B.4 GymFlow: nuevo estado `cancelled` y endpoint de cancelación

**Schema** (solo comentario, `status` es `String`):

```prisma
status String // pending | confirmed | failed | dry_run | skipped | cancelled
```

**DTO** `apps/api/src/reservations/dto/cancel-reservation.dto.ts`:

```ts
import { IsBoolean, IsOptional } from 'class-validator';

export class CancelReservationDto {
  @IsOptional()
  @IsBoolean()
  dryRun?: boolean;
}
```

**Controller**:

```ts
@Post(':id/cancel')
async cancel(
  @CurrentUser() user: JwtUser,
  @Param('id') id: string,
  @Body() dto: CancelReservationDto,
) {
  return this.reservations.cancel(user.id, id, dto.dryRun ?? false);
}
```

**Service**:

```ts
async cancel(userId: string, reservationId: string, dryRun: boolean) {
  this.assertEnabled();

  const reservation = await this.prisma.reservation.findFirst({
    where: { id: reservationId, userId }, // aislamiento por usuario, como siempre
  });
  if (!reservation) throw new NotFoundException('Reserva no encontrada');
  if (reservation.status !== 'confirmed') {
    throw new BadRequestException('Solo se pueden cancelar reservas confirmadas');
  }

  const creds = await this.getCredentials(userId);
  const dateStr = this.toPortalDate(reservation.date); // "dd/mm/yyyy"

  let res: Response;
  let result: any;
  try {
    res = await this.doFetch(
      `${this.config.url}/cancelar`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.config.apiKey}`,
        },
        body: JSON.stringify({
          ...creds,
          date: dateStr,
          time: reservation.timeSlot,
          dryRun,
        }),
      },
      RUN_TIMEOUT_MS,
    );
    result = await res.json().catch(() => null);
  } catch (err) {
    throw new BadGatewayException('El servicio de reservas no respondió a tiempo');
  }

  if (!res.ok || !result?.ok) {
    throw new BadGatewayException(result?.error ?? 'No se pudo anular la reserva');
  }

  if (dryRun) return { ok: true, dryRun: true };

  return this.prisma.reservation.update({
    where: { id: reservation.id },
    data: {
      status: 'cancelled',
      rawLog: [reservation.rawLog, '--- CANCELACIÓN ---', this.buildLog(result)]
        .filter(Boolean)
        .join('\n')
        .slice(0, MAX_LOG),
    },
  });
}

private toPortalDate(d: Date): string {
  const day = String(d.getDate()).padStart(2, '0');
  const month = String(d.getMonth() + 1).padStart(2, '0');
  return `${day}/${month}/${d.getFullYear()}`;
}
```

## B.5 Frontend

- En el historial de `ReservationsPanel`, cada fila con `status === 'confirmed'` y
  fecha futura muestra botón **Cancelar** (con confirm).
- Nuevo label y badge:

```ts
cancelled: 'Cancelada',
// badge:
cancelled: 'bg-slate-200 text-slate-500 line-through',
```

- Si en B.1 descubriste plazo límite (p. ej. 2 h antes), oculta el botón cuando
  `reservation.date + horaInicio - ahora < límite` y documenta el motivo en un tooltip.

## B.6 Pruebas de la Fase B

```bash
# Dry run de cancelación (localiza la reserva en el portal sin anularla)
curl -X POST "$BASE/reservations/<reservation-id>/cancel" \
  -H "Authorization: Bearer $JWT" -H "Content-Type: application/json" \
  -d '{"dryRun": true}'

# Cancelación real
curl -X POST "$BASE/reservations/<reservation-id>/cancel" \
  -H "Authorization: Bearer $JWT" -H "Content-Type: application/json" \
  -d '{"dryRun": false}'
# → status pasa a "cancelled"; verifica en el portal a mano la primera vez
```

---

# FASE C — Dos (o más) sesiones el mismo día

## C.1 La pregunta previa: ¿lo permite el portal?

Antes de tocar código, comprueba **a mano o con dry run** si el bono admite dos
reservas el mismo día. Si el portal lo rechaza, el script fallará al seleccionar la
segunda franja o al confirmar; captura ese caso y muestra un error claro en vez de un
`failed` genérico. Esta guía asume que sí se permite (o que quieres al menos intentarlo
y registrar el resultado).

## C.2 Anti-duplicados en la API

Evita que dos clics (o el cron + un clic manual) creen la misma reserva. En
`ReservationsService.run()`, antes de llamar a ReservaGym:

```ts
// No repetir la misma franja del mismo día si ya hay una activa
const duplicate = await this.prisma.reservation.findFirst({
  where: {
    userId,
    date: this.targetDate(),
    timeSlot: dto.time ?? DEFAULT_SLOT,
    status: { in: ['pending', 'confirmed'] },
  },
});
if (duplicate) {
  throw new ConflictException('Ya tienes una reserva activa para esa franja');
}
```

(Nota: no uses un `@@unique` en Prisma aquí — los estados `failed`/`cancelled` deben
poder repetirse. El check en servicio es suficiente para un flujo de este volumen.)

## C.3 Mutex en ReservaGym: una ejecución de Chromium a la vez

Dos Playwright en paralelo contra un portal `.aspx` con postbacks es receta para
fallos aleatorios. Serializa las ejecuciones con una cola de promesas en `server.js`:

```js
// Cola global: cada tarea espera a que termine la anterior.
let queue = Promise.resolve();

function enqueue(task) {
  const run = queue.then(task, task); // se ejecuta pase lo que pase con la anterior
  queue = run.catch(() => {});        // la cola nunca se rompe
  return run;
}

// Uso en los handlers:
app.post('/reservar', authMiddleware, (req, res) => {
  enqueue(() => handleReservar(req, res));
});
app.post('/cancelar', authMiddleware, (req, res) => {
  enqueue(() => handleCancelar(req, res));
});
```

⚠️ Con la cola, una segunda petición puede esperar hasta ~180 s a que acabe la primera.
El timeout del proxy en GymFlow es 200 s: para dos franjas seguidas ese margen se queda
corto. Por eso **la API no lanza las dos franjas en paralelo**, sino en secuencia
(punto C.5), y cada una con su propio timeout de 200 s.

## C.4 Migración: `autoReserveTime` → `autoReserveTimes[]`

```prisma
model User {
  // ...
  autoReserveEnabled Boolean  @default(false)
  autoReserveTimes   String[] @default([]) // p.ej. ["09:00 - 10:00", "18:00 - 19:00"]
}
```

```bash
npx prisma migrate dev --name auto-reserve-multiple-times --create-only
```

Edita el SQL generado para **migrar el dato existente** antes de borrar la columna:

```sql
ALTER TABLE "User" ADD COLUMN "autoReserveTimes" TEXT[] NOT NULL DEFAULT '{}';

UPDATE "User"
SET "autoReserveTimes" = ARRAY["autoReserveTime"]
WHERE "autoReserveTime" IS NOT NULL;

ALTER TABLE "User" DROP COLUMN "autoReserveTime";
```

```bash
npx prisma migrate dev
```

Actualiza el DTO:

```ts
export class UpdateAutoReserveDto {
  @IsBoolean()
  enabled!: boolean;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(3) // límite sano; súbelo si el gimnasio lo permite
  @IsString({ each: true })
  @Matches(/^\d{2}:\d{2} - \d{2}:\d{2}$/, { each: true })
  times?: string[];
}
```

## C.5 Cron: iterar franjas en secuencia

En `AutoReserveService.runForUser()`, sustituye la llamada única por un bucle
secuencial (nunca `Promise.all`):

```ts
const times = user.autoReserveTimes.length > 0
  ? user.autoReserveTimes
  : [undefined]; // sin preferencia → TARGET_TIME por defecto de ReservaGym

const results = [];
for (const time of times) {
  try {
    const r = await this.reservations.run(userId, { dryRun: false, time });
    results.push({ time, status: r.status });
  } catch (err) {
    // Un fallo en una franja no impide intentar la siguiente
    results.push({ time, status: 'failed' });
  }
}

const okCount = results.filter((r) => r.status === 'confirmed').length;
await this.telegram.send(
  `📋 <b>${userName}</b>: ${okCount}/${results.length} reservas para ${check.dayTitle}.`,
);
return results;
```

## C.6 Frontend

- En Ajustes, el selector de franja pasa a permitir **añadir varias** (chips
  eliminables, máx. 3).
- En `ReservationsPanel`, la reserva manual mantiene una franja por clic: para dos
  sesiones, el usuario lanza dos reservas. El anti-duplicado del backend (C.2) evita
  repetir la misma.

## C.7 Pruebas de la Fase C

```bash
# Dos franjas distintas el mismo día (secuencial, espera a que termine la primera)
curl -X POST "$BASE/reservations/run" \
  -H "Authorization: Bearer $JWT" -H "Content-Type: application/json" \
  -d '{"dryRun": true, "time": "09:00 - 10:00"}'

curl -X POST "$BASE/reservations/run" \
  -H "Authorization: Bearer $JWT" -H "Content-Type: application/json" \
  -d '{"dryRun": true, "time": "18:00 - 19:00"}'

# Duplicado exacto → 409
curl -X POST "$BASE/reservations/run" \
  -H "Authorization: Bearer $JWT" -H "Content-Type: application/json" \
  -d '{"dryRun": false, "time": "09:00 - 10:00"}'
curl -X POST "$BASE/reservations/run" \
  -H "Authorization: Bearer $JWT" -H "Content-Type: application/json" \
  -d '{"dryRun": false, "time": "09:00 - 10:00"}'
# → segunda llamada: 409 "Ya tienes una reserva activa para esa franja"
```

---

# FASE D — Panel de administración

Independiente del scraping: solo API + frontend. Ya tienes `Role.ADMIN`, el decorador
`@Roles()` y el usuario admin del seed.

## D.1 Módulo `AdminModule`

```bash
# apps/api/src/admin/
#   admin.module.ts
#   admin.controller.ts
#   admin.service.ts
#   dto/list-users.dto.ts
#   dto/list-reservations.dto.ts
```

**DTOs** con la misma disciplina de paginación que el resto de la API (`limit ≤ 100`):

```ts
// dto/list-users.dto.ts
import { IsInt, IsOptional, IsString, Max, Min } from 'class-validator';
import { Type } from 'class-transformer';

export class ListUsersDto {
  @IsOptional() @IsString()
  search?: string; // nombre o email

  @IsOptional() @Type(() => Number) @IsInt() @Min(1)
  page = 1;

  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100)
  limit = 20;
}
```

```ts
// dto/list-reservations.dto.ts
import { IsIn, IsISO8601, IsOptional, IsUUID } from 'class-validator';

export class ListReservationsDto extends ListUsersDto {
  @IsOptional() @IsUUID()
  userId?: string;

  @IsOptional()
  @IsIn(['pending', 'confirmed', 'failed', 'dry_run', 'skipped', 'cancelled'])
  status?: string;

  @IsOptional() @IsISO8601()
  from?: string;

  @IsOptional() @IsISO8601()
  to?: string;
}
```

**Service**:

```ts
import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ListUsersDto } from './dto/list-users.dto';
import { ListReservationsDto } from './dto/list-reservations.dto';

@Injectable()
export class AdminService {
  constructor(private readonly prisma: PrismaService) {}

  async listUsers(dto: ListUsersDto) {
    const where = dto.search
      ? {
          OR: [
            { name: { contains: dto.search, mode: 'insensitive' as const } },
            { email: { contains: dto.search, mode: 'insensitive' as const } },
          ],
        }
      : {};

    const [items, total] = await this.prisma.$transaction([
      this.prisma.user.findMany({
        where,
        skip: (dto.page - 1) * dto.limit,
        take: dto.limit,
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          name: true,
          email: true,
          role: true,
          createdAt: true,
          autoReserveEnabled: true,
          // "configuradas sí/no", NUNCA el contenido:
          gymCredential: { select: { updatedAt: true } },
          _count: { select: { reservations: true, sessions: true } },
        },
      }),
      this.prisma.user.count({ where }),
    ]);

    return {
      items: items.map((u) => ({
        ...u,
        gymCredential: undefined,
        credentialsConfigured: !!u.gymCredential,
      })),
      total,
      page: dto.page,
      limit: dto.limit,
    };
  }

  async getUser(id: string) {
    const user = await this.prisma.user.findUnique({
      where: { id },
      select: {
        id: true, name: true, email: true, role: true, createdAt: true,
        autoReserveEnabled: true, autoReserveTimes: true,
        profile: true,
        gymCredential: { select: { updatedAt: true } },
        _count: { select: { reservations: true, sessions: true, routines: true } },
      },
    });
    if (!user) throw new NotFoundException('Usuario no encontrado');
    return { ...user, gymCredential: undefined, credentialsConfigured: !!user.gymCredential };
  }

  async listReservations(dto: ListReservationsDto) {
    const where = {
      ...(dto.userId ? { userId: dto.userId } : {}),
      ...(dto.status ? { status: dto.status } : {}),
      ...(dto.from || dto.to
        ? {
            date: {
              ...(dto.from ? { gte: new Date(dto.from) } : {}),
              ...(dto.to ? { lte: new Date(dto.to) } : {}),
            },
          }
        : {}),
    };

    const [items, total] = await this.prisma.$transaction([
      this.prisma.reservation.findMany({
        where,
        skip: (dto.page - 1) * dto.limit,
        take: dto.limit,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.reservation.count({ where }),
    ]);

    // Adjuntar nombre/email del usuario de cada reserva (Reservation no tiene relación
    // declarada; join manual barato):
    const userIds = [...new Set(items.map((r) => r.userId))];
    const users = await this.prisma.user.findMany({
      where: { id: { in: userIds } },
      select: { id: true, name: true, email: true },
    });
    const byId = new Map(users.map((u) => [u.id, u]));

    return {
      items: items.map((r) => ({ ...r, user: byId.get(r.userId) ?? null })),
      total, page: dto.page, limit: dto.limit,
    };
  }

  async stats() {
    const [users, reservations, byStatus] = await this.prisma.$transaction([
      this.prisma.user.count(),
      this.prisma.reservation.count(),
      this.prisma.reservation.groupBy({ by: ['status'], _count: true }),
    ]);
    return {
      users,
      reservations,
      byStatus: Object.fromEntries(byStatus.map((s) => [s.status, s._count])),
    };
  }
}
```

> 💡 Ya que estás: añade la relación que falta en `Reservation` para el futuro
> (`user User @relation(...)` + `reservations Reservation[]` en `User`). El `_count`
> de `listUsers` la necesita. Si prefieres no tocar el schema aún, sustituye ese
> `_count` por un `groupBy` de reservas como en `listReservations`.

**Controller** (todo protegido con rol ADMIN):

```ts
import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { Role } from '@prisma/client';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { AdminService } from './admin.service';
import { ListUsersDto } from './dto/list-users.dto';
import { ListReservationsDto } from './dto/list-reservations.dto';

@Controller('admin')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN)
export class AdminController {
  constructor(private readonly admin: AdminService) {}

  @Get('stats')
  stats() {
    return this.admin.stats();
  }

  @Get('users')
  listUsers(@Query() dto: ListUsersDto) {
    return this.admin.listUsers(dto);
  }

  @Get('users/:id')
  getUser(@Param('id') id: string) {
    return this.admin.getUser(id);
  }

  @Get('reservations')
  listReservations(@Query() dto: ListReservationsDto) {
    return this.admin.listReservations(dto);
  }
}
```

Registra `AdminModule` en `AppModule`.

## D.2 Frontend: ruta `/admin`

Estructura mínima en `apps/web`:

- **Guard de ruta**: si `user.role !== 'ADMIN'`, redirige a `/dashboard`. (El backend ya
  protege con `RolesGuard`; esto es solo UX.)
- **`/admin`** — tarjetas con `GET /admin/stats` (usuarios totales, reservas por estado)
  y tabla de usuarios (`GET /admin/users`): nombre, email, rol, nº reservas, badge
  "credenciales ✓/✗", toggle informativo de auto-reserva, buscador con debounce.
- **`/admin/users/[id]`** — perfil del usuario + su historial de reservas
  (`GET /admin/reservations?userId=...`) con los mismos badges de estado del panel de
  usuario (verde `confirmed`, rojo `failed`, azul `skipped`, gris `dry_run`, tachado
  `cancelled`).
- **`/admin/reservations`** — vista global con filtros por estado y rango de fechas.
  Cada fila muestra el usuario y un desplegable con `rawLog` (útil para diagnosticar
  fallos del scraping sin entrar al servidor).

Añade la entrada "Admin" a la navegación **solo** cuando `role === 'ADMIN'`.

## D.3 Reglas de oro del panel admin

- El admin **nunca** ve DNI ni contraseña de nadie: solo `credentialsConfigured`.
- `rawLog` es visible para el admin (es la herramienta de diagnóstico), y por eso el
  saneado de credenciales de A.5 es obligatorio **antes** de esta fase.
- Todo endpoint `/admin/*` con `JwtAuthGuard + RolesGuard + @Roles(ADMIN)`. Un test e2e
  debe verificar que un usuario normal recibe 403.

## D.4 Pruebas de la Fase D

```bash
# Como admin:
curl "$BASE/admin/stats" -H "Authorization: Bearer $JWT_ADMIN"
curl "$BASE/admin/users?search=deksa&page=1&limit=20" -H "Authorization: Bearer $JWT_ADMIN"
curl "$BASE/admin/reservations?status=failed" -H "Authorization: Bearer $JWT_ADMIN"

# Como usuario normal → 403:
curl "$BASE/admin/users" -H "Authorization: Bearer $JWT"
```

---

# 5. Despliegue en EasyPanel

### 5.1 Variables nuevas

Servicio **API**:

```env
CREDENTIALS_ENCRYPTION_KEY=<64 hex, openssl rand -hex 32>
```

Servicio **ReservaGym**: sin variables nuevas. `GYM_DNI`/`GYM_PASSWORD` pasan a ser
solo fallback de CLI; puedes dejarlas o quitarlas cuando confirmes que la API siempre
envía credenciales.

### 5.2 Orden de despliegue

1. **ReservaGym** primero (acepta credenciales en body y `loginOnly`, expone
   `/cancelar`, cola de ejecución). Es retrocompatible: sin body-creds usa el `.env`.
2. **API** después (migraciones `add-gym-credentials` y
   `auto-reserve-multiple-times` se aplican solas con `prisma migrate deploy` al
   arrancar; verifica los logs).
3. **Web** al final.

### 5.3 Verificación post-deploy

```bash
curl "$BASE/reservations/health" -H "Authorization: Bearer $JWT"
curl -X POST "$BASE/reservations/credentials/test" -H "Authorization: Bearer $JWT"
```

Y en los logs de la API al arrancar, confirma que el cron sigue registrado
(`AutoReserveService.runDaily registered`).

---

# 6. Checklist final

**Fase A — Credenciales**
- [ ] `CREDENTIALS_ENCRYPTION_KEY` generada y guardada en gestor de secretos.
- [ ] Migración `add-gym-credentials` aplicada.
- [ ] `CryptoService` con tests (encrypt → decrypt → igual; payload corrupto → error).
- [ ] Endpoints `GET/PUT/DELETE /reservations/credentials` + `POST .../test`.
- [ ] `run()` envía `dni/password` descifrados; 412 sin credenciales.
- [ ] `buildLog()` sanea posibles credenciales.
- [ ] ReservaGym no loguea bodies; soporta `loginOnly`.
- [ ] Cron: skip `no-credentials` + aviso Telegram.
- [ ] UI en Ajustes con guardar / probar / eliminar y aviso de privacidad.
- [ ] Verificado en DB: `dniEnc`/`passwordEnc` cifrados, ningún `rawLog` con contraseña.

**Fase B — Cancelación**
- [ ] Reconocimiento manual del portal documentado (enlace, selector de anular, plazo, bono).
- [ ] `scripts/cancel.js` probado primero con `DRY_RUN=true` y `HEADLESS=false` en local.
- [ ] `POST /cancelar` en ReservaGym con Bearer.
- [ ] Estado `cancelled` en schema (comentario), labels y badges en frontend.
- [ ] `POST /reservations/:id/cancel` con aislamiento por usuario y solo `confirmed`.
- [ ] Primera cancelación real verificada a mano en el portal.

**Fase C — Multi-franja**
- [ ] Comprobado si el bono permite 2 reservas/día.
- [ ] Anti-duplicado (409) en `run()`.
- [ ] Cola de ejecución en ReservaGym (nunca 2 Chromium a la vez).
- [ ] Migración `auto-reserve-multiple-times` con copia del dato existente.
- [ ] Cron itera franjas en secuencia; un fallo no bloquea la siguiente.
- [ ] UI de Ajustes con múltiples franjas (chips, máx. 3).

**Fase D — Admin**
- [ ] `AdminModule` con `stats`, `users`, `users/:id`, `reservations`.
- [ ] Guard: usuario normal recibe 403 en `/admin/*` (test e2e).
- [ ] Frontend `/admin` con tabla de usuarios, detalle y vista global de reservas.
- [ ] El admin nunca ve credenciales, solo `credentialsConfigured`.

---

# 7. Troubleshooting

**`412 Configura tus credenciales` con credenciales guardadas.** Comprueba que el
`upsert` escribió la row (`SELECT "userId", "updatedAt" FROM "GymCredential"`) y que el
`userId` del JWT coincide. Si cambiaste `CREDENTIALS_ENCRYPTION_KEY`, el `decrypt`
lanza error de auth tag: pide al usuario reintroducirlas.

**`Unsupported state or unable to authenticate data` al descifrar.** La clave maestra
no es la misma con la que se cifró (rotaste la key o hay `.env` distinto entre local y
producción). Los datos cifrados con la clave vieja son irrecuperables sin ella.

**El test de login dice OK pero la reserva real falla.** El login funciona pero el
usuario no tiene bono válido para ese servicio, o la franja está llena. Revisa
`rawLog`: el script lista las horas visibles cuando no encuentra la franja.

**`/cancelar` no encuentra la reserva.** El formato de fecha del portal debe coincidir
exactamente (`dd/mm/yyyy` con ceros). Revisa también que `timeSlot` guardado en la row
es literal al del portal (`"09:00 - 10:00"`, con espacios alrededor del guion).

**La segunda franja del cron da timeout.** La cola de ReservaGym serializa: la segunda
espera a la primera (hasta 180 s) y luego ejecuta (otros 180 s). El proxy tiene 200 s
por llamada, pero como el cron las lanza en secuencia (C.5), cada `run()` abre su
propio timeout. Si aún así falla, sube `RUN_TIMEOUT_MS` a 250–300 s.

**Un usuario normal ve `/admin` en el menú.** El guard del frontend es cosmético; lo
que protege es el `RolesGuard` del backend. Aun así, corrige el render condicional por
`role`.

**El portal cambió el HTML y todo falla.** Es la fragilidad conocida del `.aspx`. Los
screenshots que guarda el script (`screenshots/*.png`) y el `rawLog` visible en el
panel admin (D.2) son tus herramientas de diagnóstico. Regenera selectores con
`npx playwright codegen`.
