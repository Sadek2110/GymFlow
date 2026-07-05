# Guía: Auto-reserva ReservaGym desde GymFlow (sin n8n)

Esta guía convierte la orquestación externa (n8n + Google Sheets) en un cron nativo dentro
del backend de GymFlow. El backend consulta la rutina activa del usuario y decide si mañana
toca reservar; si toca, llama al proxy `ReservationsService` que ya existe.

**Encaja como extensión de la Fase 6** del roadmap (`Módulo reservas`), sin tocar la Fase 7.

---

## 0. Estado de partida

Antes de empezar, verifica que ya tienes:

- `apps/api` con el módulo `ReservationsModule` funcionando (Fase 6 completa).
- El modelo `Reservation` con estados `pending | confirmed | failed | dry_run`.
- La variable `RESERVAGYM_ENABLED=true` en `apps/api/.env`.
- ReservaGym desplegado en `https://reservagym.dksaa.com` con credenciales de gimnasio
  en su propio `.env` (nunca en el body de la petición).
- Rutina activa creada con al menos un `RoutineDay` con `isRestDay=true`.

Comprobación rápida:

```bash
curl http://localhost:4000/api/v1/reservations/health \
  -H "Authorization: Bearer <tu-jwt>"
# Debe devolver { ok: true, ... }
```

---

## 1. Ampliar el modelo `User` en Prisma

La decisión de "este usuario quiere reservas automáticas" es una preferencia del usuario,
así que va en `User` (o en `UserProfile` si prefieres separar preferencias). Aquí lo pongo
en `User` para no tocar `UserProfile`.

### 1.1 Editar `apps/api/prisma/schema.prisma`

```prisma
model User {
  id           String   @id @default(uuid())
  name         String
  email        String   @unique
  passwordHash String
  role         Role     @default(USER)
  createdAt    DateTime @default(now())
  updatedAt    DateTime @updatedAt

  // --- NUEVO ---
  autoReserveEnabled Boolean @default(false)
  autoReserveTime    String? // p.ej. "09:00 - 10:00"; null = usa el TARGET_TIME de ReservaGym

  profile             UserProfile?
  measurements        BodyMeasurement[]
  routines            Routine[]
  sessions            WorkoutSession[]
  refreshTokens       RefreshToken[]
  passwordResetTokens PasswordResetToken[]
}
```

### 1.2 Añadir el estado `skipped` a `Reservation`

Los estados actuales solo cubren éxito y fallo. Necesitamos un cuarto estado para "hoy
tocaba descanso, no se hizo llamada". No requiere migración de schema porque `status` es
`String`, pero **sí** hay que documentarlo. Actualiza el comentario:

```prisma
model Reservation {
  // ...
  status String // pending | confirmed | failed | dry_run | skipped
  // ...
}
```

Y también en `apps/web/src/lib/reservations.ts` para que el frontend lo pinte:

```ts
export interface Reservation {
  // ...
  status: 'pending' | 'confirmed' | 'failed' | 'dry_run' | 'skipped';
  // ...
}

export const RESERVATION_STATUS_LABEL: Record<Reservation['status'], string> = {
  pending:   'Pendiente',
  confirmed: 'Confirmada',
  failed:    'Fallida',
  dry_run:   'Prueba (dry run)',
  skipped:   'Omitida (descanso)', // ← NUEVO
};

export const RESERVATION_STATUS_BADGE: Record<Reservation['status'], string> = {
  pending:   'bg-amber-100 text-amber-700',
  confirmed: 'bg-green-100 text-green-700',
  failed:    'bg-red-100 text-red-700',
  dry_run:   'bg-slate-100 text-slate-600',
  skipped:   'bg-blue-100 text-blue-700', // ← NUEVO
};
```

### 1.3 Crear la migración

```bash
cd apps/api
npx prisma migrate dev --name add-auto-reserve-preferences
```

Prisma creará `apps/api/prisma/migrations/2026xxxx_add_auto_reserve_preferences/migration.sql`
con dos `ALTER TABLE`. Revísala antes de continuar.

### 1.4 Actualizar el seed

En `apps/api/prisma/seed.ts`, activa la auto-reserva para el usuario admin como usuario de
prueba:

```ts
await prisma.user.upsert({
  where: { email: 'admin@gymflow.local' },
  update: { autoReserveEnabled: true, autoReserveTime: '09:00 - 10:00' },
  create: {
    // ...campos existentes,
    autoReserveEnabled: true,
    autoReserveTime: '09:00 - 10:00',
  },
});
```

---

## 2. Instalar `@nestjs/schedule`

```bash
npm install @nestjs/schedule --workspace apps/api
```

Este paquete usa `cron` internamente y soporta zonas horarias (crítico para tu caso: la
reserva abre a las 05:00 **Europe/Madrid**, no UTC).

### 2.1 Registrar en `AppModule`

Edita `apps/api/src/app.module.ts`:

```ts
import { ScheduleModule } from '@nestjs/schedule';

@Module({
  imports: [
    ScheduleModule.forRoot(),   // ← NUEVO, antes de tus módulos
    ConfigModule.forRoot({ /* ... */ }),
    // ...resto de módulos
    ReservationsModule,
  ],
})
export class AppModule {}
```

---

## 3. Crear `AutoReserveService`

Un servicio dedicado, en el mismo módulo de reservas, para no acoplar el cron al
`ReservationsService` (que ya tiene bastante).

### 3.1 Crear el archivo `apps/api/src/reservations/auto-reserve.service.ts`

```ts
import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';
import { ReservationsService } from './reservations.service';

const FACILITY = 'C.D. Díaz Flor';
const SERVICE = 'Sala Cardio-Fitness';

// Decisión: por qué el cron a las 04:59:55 en vez de 05:00:00.
// La ventana de reserva del ICD Ceuta abre exactamente a las 05:00. Si arrancamos justo
// a esa hora perdemos ~2-3 s en cold start de Playwright. Adelantar 5 s nos deja listos
// para hacer submit en cuanto abre.
const CRON_EXPR = '55 59 4 * * *';
const TZ = 'Europe/Madrid';

export interface ShouldReserveResult {
  shouldReserve: boolean;
  reason?: 'no-active-routine' | 'day-not-in-routine' | 'rest-day' | 'empty-day';
  dayTitle?: string;
}

@Injectable()
export class AutoReserveService {
  private readonly logger = new Logger(AutoReserveService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly reservations: ReservationsService,
  ) {}

  // ---------- CRON DIARIO ----------
  @Cron(CRON_EXPR, { timeZone: TZ })
  async runDaily() {
    this.logger.log('Iniciando ciclo de auto-reserva');

    const users = await this.prisma.user.findMany({
      where: { autoReserveEnabled: true },
    });

    if (users.length === 0) {
      this.logger.log('No hay usuarios con auto-reserva activa');
      return;
    }

    for (const user of users) {
      try {
        await this.runForUser(user.id, user.autoReserveTime ?? undefined);
      } catch (err) {
        // Nunca dejamos que un fallo en un usuario tumbe el resto.
        this.logger.error(
          `Auto-reserva fallida para ${user.id}: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }
    this.logger.log(`Ciclo terminado: ${users.length} usuario(s) procesado(s)`);
  }

  // ---------- LÓGICA POR USUARIO ----------
  async runForUser(userId: string, time?: string) {
    const tomorrow = this.addDays(this.now(), 1);
    const check = await this.shouldReserve(userId, tomorrow);

    if (!check.shouldReserve) {
      this.logger.log(`Skip ${userId}: ${check.reason}`);
      await this.persistSkip(userId, tomorrow, time, check.reason!);
      return { skipped: true, reason: check.reason };
    }

    this.logger.log(`Reservando para ${userId} (${check.dayTitle})`);
    // Delegamos en el servicio existente: él persiste el Reservation con status
    // dry_run/confirmed/failed y llama a ReservaGym con solo { dryRun, time }.
    return this.reservations.run(userId, { dryRun: false, time });
  }

  // ---------- DECISIÓN ----------
  async shouldReserve(userId: string, date: Date): Promise<ShouldReserveResult> {
    const routine = await this.prisma.routine.findFirst({
      where: { userId, isActive: true },
      include: { days: { include: { exercises: true } } },
    });

    if (!routine) return { shouldReserve: false, reason: 'no-active-routine' };

    // JS: getDay() → 0=domingo … 6=sábado. Nuestra convención: 0=lunes … 6=domingo.
    const dow = (date.getDay() + 6) % 7;
    const day = routine.days.find((d) => d.dayOfWeek === dow);

    if (!day) return { shouldReserve: false, reason: 'day-not-in-routine' };
    if (day.isRestDay) return { shouldReserve: false, reason: 'rest-day' };
    if (day.exercises.length === 0)
      return { shouldReserve: false, reason: 'empty-day' };

    return { shouldReserve: true, dayTitle: day.title ?? 'Entrenamiento' };
  }

  // ---------- HELPERS ----------
  // Aislados para permitir tests deterministas (mockear now() en Jest).
  now(): Date {
    return new Date();
  }

  private addDays(d: Date, n: number): Date {
    const r = new Date(d);
    r.setDate(r.getDate() + n);
    r.setHours(0, 0, 0, 0);
    return r;
  }

  private async persistSkip(
    userId: string,
    date: Date,
    time: string | undefined,
    reason: string,
  ) {
    return this.prisma.reservation.create({
      data: {
        userId,
        facility: FACILITY,
        service: SERVICE,
        date,
        timeSlot: time ?? 'default',
        status: 'skipped',
        rawLog: `Auto-reserva omitida: ${reason}`,
      },
    });
  }
}
```

### 3.2 Registrar el servicio en `ReservationsModule`

Edita `apps/api/src/reservations/reservations.module.ts`:

```ts
import { AutoReserveService } from './auto-reserve.service';

@Module({
  imports: [ConfigModule, PrismaModule],
  controllers: [ReservationsController],
  providers: [ReservationsService, AutoReserveService], // ← añadir
  exports: [ReservationsService, AutoReserveService],   // ← añadir
})
export class ReservationsModule {}
```

---

## 4. Endpoints REST para el usuario

Tres endpoints nuevos: uno para consultar el estado, otro para cambiar la preferencia,
y otro de *preview* que responde "¿mañana toca reservar?" (útil para mostrar en el
dashboard sin esperar al cron).

### 4.1 DTOs

Crea `apps/api/src/reservations/dto/auto-reserve.dto.ts`:

```ts
import { IsBoolean, IsOptional, IsString, Matches } from 'class-validator';

export class UpdateAutoReserveDto {
  @IsBoolean()
  enabled!: boolean;

  // Formato exacto que espera ReservaGym: "HH:MM - HH:MM"
  @IsOptional()
  @IsString()
  @Matches(/^\d{2}:\d{2} - \d{2}:\d{2}$/, {
    message: 'time debe tener formato "HH:MM - HH:MM"',
  })
  time?: string;
}
```

### 4.2 Extender el controller

Edita `apps/api/src/reservations/reservations.controller.ts`:

```ts
import { AutoReserveService } from './auto-reserve.service';
import { UpdateAutoReserveDto } from './dto/auto-reserve.dto';

@Controller('reservations')
@UseGuards(JwtAuthGuard)
export class ReservationsController {
  constructor(
    private readonly reservations: ReservationsService,
    private readonly autoReserve: AutoReserveService,
    private readonly prisma: PrismaService,
  ) {}

  // ... endpoints existentes (health, run, list)

  @Get('auto-reserve')
  async getAutoReserve(@CurrentUser() user: JwtUser) {
    const u = await this.prisma.user.findUnique({
      where: { id: user.id },
      select: { autoReserveEnabled: true, autoReserveTime: true },
    });
    return {
      enabled: u?.autoReserveEnabled ?? false,
      time: u?.autoReserveTime ?? null,
    };
  }

  @Patch('auto-reserve')
  async updateAutoReserve(
    @CurrentUser() user: JwtUser,
    @Body() dto: UpdateAutoReserveDto,
  ) {
    const updated = await this.prisma.user.update({
      where: { id: user.id },
      data: {
        autoReserveEnabled: dto.enabled,
        autoReserveTime: dto.time ?? null,
      },
      select: { autoReserveEnabled: true, autoReserveTime: true },
    });
    return { enabled: updated.autoReserveEnabled, time: updated.autoReserveTime };
  }

  @Get('should-run')
  async shouldRun(@CurrentUser() user: JwtUser) {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    return this.autoReserve.shouldReserve(user.id, tomorrow);
  }
}
```

---

## 5. Frontend: toggle en Ajustes y aviso en el Dashboard

### 5.1 Extender el cliente API

Edita `apps/web/src/lib/reservations.ts`:

```ts
export interface AutoReserveState {
  enabled: boolean;
  time: string | null;
}

export interface ShouldRunResponse {
  shouldReserve: boolean;
  reason?: 'no-active-routine' | 'day-not-in-routine' | 'rest-day' | 'empty-day';
  dayTitle?: string;
}

export const fetchAutoReserve = () =>
  api.get<AutoReserveState>('/reservations/auto-reserve');

export const updateAutoReserve = (body: AutoReserveState) =>
  api.patch<AutoReserveState>('/reservations/auto-reserve', body);

export const fetchShouldRunTomorrow = () =>
  api.get<ShouldRunResponse>('/reservations/should-run');
```

### 5.2 Toggle en `/settings`

Mobile-first, un `<label>` grande con switch nativo y un `<input>` de texto para la hora
(oculto cuando `enabled=false`). Ejemplo de esqueleto en React:

```tsx
// apps/web/src/components/settings/AutoReserveCard.tsx
import { useEffect, useState } from 'react';
import { fetchAutoReserve, updateAutoReserve } from '../../lib/reservations';

export function AutoReserveCard() {
  const [enabled, setEnabled] = useState(false);
  const [time, setTime] = useState('09:00 - 10:00');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetchAutoReserve().then((s) => {
      setEnabled(s.enabled);
      if (s.time) setTime(s.time);
    });
  }, []);

  const save = async (next: { enabled: boolean; time: string }) => {
    setSaving(true);
    try {
      const saved = await updateAutoReserve(next);
      setEnabled(saved.enabled);
      if (saved.time) setTime(saved.time);
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="rounded-2xl bg-white p-4 shadow-sm">
      <h2 className="text-lg font-semibold">Reservas automáticas</h2>
      <p className="mt-1 text-sm text-slate-600">
        Reservaremos automáticamente cada mañana a las 05:00 si mañana es un día
        de entrenamiento en tu rutina activa.
      </p>

      <label className="mt-4 flex items-center justify-between">
        <span>Activar</span>
        <input
          type="checkbox"
          className="h-6 w-11 accent-emerald-600"
          checked={enabled}
          onChange={(e) => save({ enabled: e.target.checked, time })}
          disabled={saving}
        />
      </label>

      {enabled && (
        <label className="mt-4 block">
          <span className="text-sm">Franja horaria</span>
          <input
            type="text"
            className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
            value={time}
            onBlur={(e) => save({ enabled, time: e.target.value })}
            onChange={(e) => setTime(e.target.value)}
            placeholder="09:00 - 10:00"
          />
        </label>
      )}
    </section>
  );
}
```

### 5.3 Aviso en el Dashboard

En la tarjeta "Próximo entrenamiento" del overview, añade un pequeño chip que llame a
`fetchShouldRunTomorrow()` y muestre:

- ✅ *"Reserva prevista mañana"* si `shouldReserve=true`.
- 💤 *"Mañana descansas, no se reservará"* si `reason='rest-day'`.
- ⚠️ *"No hay rutina activa"* si `reason='no-active-routine'`.

Así el usuario sabe qué esperar antes de dormirse.

---

## 6. Tests

Tres capas: unit del `shouldReserve`, unit del cron con `now()` mockeado, y e2e del
endpoint `PATCH /reservations/auto-reserve`.

### 6.1 Añadir el servicio al mock de Prisma (ya está)

Tu `apps/api/test/prisma.mock.ts` ya incluye `reservation` y `user`, así que no hay
cambios. Solo necesitarás mockear `reservations.service` cuando testees el cron.

### 6.2 Test unitario del `shouldReserve`

Crea `apps/api/src/reservations/auto-reserve.service.spec.ts`:

```ts
import { Test } from '@nestjs/testing';
import { AutoReserveService } from './auto-reserve.service';
import { ReservationsService } from './reservations.service';
import { PrismaService } from '../prisma/prisma.service';
import { createPrismaMock, PrismaMock } from '../../test/prisma.mock';

describe('AutoReserveService', () => {
  let service: AutoReserveService;
  let prisma: PrismaMock;
  let reservations: { run: jest.Mock };

  const USER = 'user-1';

  beforeEach(async () => {
    prisma = createPrismaMock();
    reservations = { run: jest.fn() };
    const moduleRef = await Test.createTestingModule({
      providers: [
        AutoReserveService,
        { provide: PrismaService, useValue: prisma },
        { provide: ReservationsService, useValue: reservations },
      ],
    }).compile();
    service = moduleRef.get(AutoReserveService);
  });

  describe('shouldReserve', () => {
    it('sin rutina activa → skip con no-active-routine', async () => {
      prisma.routine.findFirst.mockResolvedValue(null);
      const res = await service.shouldReserve(USER, new Date('2026-07-07')); // martes
      expect(res).toEqual({ shouldReserve: false, reason: 'no-active-routine' });
    });

    it('día de descanso → skip con rest-day', async () => {
      prisma.routine.findFirst.mockResolvedValue({
        id: 'r', isActive: true, days: [
          { dayOfWeek: 1 /* martes */, isRestDay: true, exercises: [], title: null },
        ],
      });
      const res = await service.shouldReserve(USER, new Date('2026-07-07T00:00:00Z'));
      expect(res).toEqual({ shouldReserve: false, reason: 'rest-day' });
    });

    it('día de entrenamiento con ejercicios → shouldReserve=true', async () => {
      prisma.routine.findFirst.mockResolvedValue({
        id: 'r', isActive: true, days: [
          {
            dayOfWeek: 1, isRestDay: false,
            exercises: [{ id: 'e1' }], title: 'Pecho y tríceps',
          },
        ],
      });
      const res = await service.shouldReserve(USER, new Date('2026-07-07T00:00:00Z'));
      expect(res).toEqual({ shouldReserve: true, dayTitle: 'Pecho y tríceps' });
    });

    it('día sin ejercicios (aunque no sea rest) → skip con empty-day', async () => {
      prisma.routine.findFirst.mockResolvedValue({
        id: 'r', isActive: true, days: [
          { dayOfWeek: 1, isRestDay: false, exercises: [], title: null },
        ],
      });
      const res = await service.shouldReserve(USER, new Date('2026-07-07T00:00:00Z'));
      expect(res).toEqual({ shouldReserve: false, reason: 'empty-day' });
    });
  });

  describe('runForUser', () => {
    beforeEach(() => {
      // Fijamos "hoy" en lunes 6 julio 2026 → "mañana" = martes 7
      jest.spyOn(service, 'now').mockReturnValue(new Date('2026-07-06T04:59:55+02:00'));
    });

    it('cuando shouldReserve=true → llama a reservations.run con dryRun=false', async () => {
      prisma.routine.findFirst.mockResolvedValue({
        id: 'r', isActive: true, days: [
          { dayOfWeek: 1, isRestDay: false, exercises: [{ id: 'e1' }], title: 'Pecho' },
        ],
      });
      await service.runForUser(USER, '09:00 - 10:00');
      expect(reservations.run).toHaveBeenCalledWith(USER, {
        dryRun: false, time: '09:00 - 10:00',
      });
    });

    it('cuando shouldReserve=false → NO llama a reservations.run y crea Reservation skipped', async () => {
      prisma.routine.findFirst.mockResolvedValue({
        id: 'r', isActive: true, days: [
          { dayOfWeek: 1, isRestDay: true, exercises: [], title: null },
        ],
      });
      prisma.reservation.create.mockResolvedValue({ id: 'skip-1' });

      const res = await service.runForUser(USER);

      expect(reservations.run).not.toHaveBeenCalled();
      expect(prisma.reservation.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ userId: USER, status: 'skipped' }),
      });
      expect(res).toEqual({ skipped: true, reason: 'rest-day' });
    });
  });
});
```

### 6.3 Ejecutar

```bash
npm test --workspace apps/api
```

Deberías ver 6 tests nuevos pasando, sumados a los 112 existentes.

---

## 7. Notificaciones Telegram (opcional pero recomendado)

Sustituye el nodo Telegram de n8n con 30 líneas en NestJS.

### 7.1 Variables en `apps/api/.env`

```env
TELEGRAM_BOT_TOKEN=123456:AAAA...
TELEGRAM_CHAT_ID=5551234567
```

### 7.2 Servicio ligero

Crea `apps/api/src/notifications/telegram.service.ts`:

```ts
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class TelegramService {
  private readonly logger = new Logger(TelegramService.name);
  private readonly token?: string;
  private readonly chatId?: string;

  constructor(config: ConfigService) {
    this.token = config.get('TELEGRAM_BOT_TOKEN');
    this.chatId = config.get('TELEGRAM_CHAT_ID');
  }

  async send(text: string) {
    if (!this.token || !this.chatId) return; // silenciosamente noop si no está configurado
    try {
      await fetch(`https://api.telegram.org/bot${this.token}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: this.chatId,
          text,
          parse_mode: 'HTML',
        }),
      });
    } catch (err) {
      this.logger.warn(`No se pudo enviar aviso Telegram: ${err instanceof Error ? err.message : err}`);
    }
  }
}
```

Registra el servicio en un `NotificationsModule` propio y expórtalo. Luego inyéctalo en
`AutoReserveService` y llama en cada rama:

```ts
// En runForUser, tras cada resultado:
if (result skipped) {
  await this.telegram.send(`💤 <b>${user.name}</b>: mañana descansas, no se reserva.`);
} else if (confirmed) {
  await this.telegram.send(`✅ <b>${user.name}</b>: reserva hecha para ${dayTitle}.`);
} else if (failed) {
  await this.telegram.send(`❌ <b>${user.name}</b>: fallo en reserva. Revisa logs.`);
}
```

---

## 8. Migración desde n8n (paso a paso)

Antes de apagar nada, hay que verificar en paralelo durante 2-3 días.

### 8.1 Día 0: convivencia con `dryRun=true`

1. Deja el workflow de n8n como está, con `dryRun: true`.
2. Despliega GymFlow con el cron activado pero forzando también `dryRun=true` en `runForUser`.
3. Al día siguiente compara: ¿ambos sistemas decidieron lo mismo?
4. Repite dos días. Si coinciden, sigue al paso 8.2.

### 8.2 Día 1: apagar la mitad de n8n

En el workflow de n8n, edita el nodo IF de `activo`: pon la condición a `false` para
todos los usuarios. El workflow se seguirá disparando pero no llamará a ReservaGym.
En GymFlow pasa `dryRun=false`. Vigila 1-2 días.

### 8.3 Día 2: apagar el schedule de n8n

Desactiva el Schedule Trigger del workflow. Deja el workflow guardado por si necesitas
volver atrás.

### 8.4 Día 3: exportar histórico

Si quieres conservar el histórico de Google Sheets en tu base de datos, un script
puntual:

```ts
// scripts/import-sheet-history.ts
// Lee la hoja "Hoja 2" (logs) y crea rows Reservation con status derivado.
// No lo dejes en producción, ejecútalo una vez con ts-node.
```

Después borra las credenciales de Google Sheets del panel de n8n y limpia el bearer
`APIreservasGym` que ya no se usa.

---

## 9. Despliegue en EasyPanel

### 9.1 Variables de entorno

En el servicio `API` de EasyPanel, añade (si no las tenías):

```env
RESERVAGYM_ENABLED=true
RESERVAGYM_URL=https://reservagym.dksaa.com
RESERVAGYM_API_KEY=<la-clave-larga>
TELEGRAM_BOT_TOKEN=<opcional>
TELEGRAM_CHAT_ID=<opcional>
TZ=Europe/Madrid
```

### 9.2 Zona horaria del contenedor

**Crítico**: aunque `@nestjs/schedule` acepta `timeZone`, si el contenedor tiene otro
`TZ` los logs saldrán descolocados. En el `Dockerfile` de `apps/api` asegúrate de:

```dockerfile
ENV TZ=Europe/Madrid
RUN apt-get update && apt-get install -y tzdata && rm -rf /var/lib/apt/lists/*
```

### 9.3 Comprobar que el cron está registrado

Al arrancar, NestJS loguea los crons registrados. Deberías ver algo como:

```
[Nest] LOG [SchedulerRegistry] AutoReserveService.runDaily registered
```

Si no aparece: revisa que `ScheduleModule.forRoot()` está antes de `ReservationsModule`
en `AppModule.imports`.

### 9.4 Test manual antes del primer día

Provoca el cron a mano vía endpoint temporal (bórralo tras probar):

```ts
@Post('auto-reserve/trigger') // ← ELIMINAR tras probar
@UseGuards(AdminGuard)
async manualTrigger() {
  return this.autoReserve.runDaily();
}
```

Llámalo con `dryRun=true` forzado y comprueba que crea la row en `Reservation`.

---

## 10. Troubleshooting rápido

**El cron no se dispara.** Verifica que `ScheduleModule.forRoot()` está en `AppModule`.
Comprueba `TZ` del contenedor (`docker exec ... date`). Cambia temporalmente el cron a
`*/1 * * * *` (cada minuto) para validar sin esperar 24h.

**Se dispara a la hora incorrecta.** El decorador acepta `timeZone`, pero si tu
contenedor tiene `TZ=UTC` y algún día usas `new Date()` sin conversión, harás cálculos
erróneos. Usa siempre `date-fns-tz` o mantén el contenedor en `Europe/Madrid`.

**ReservaGym responde 502 desde el cron.** El proxy `ReservationsService` ya persiste
`status=failed`. Revisa `rawLog` en la row para ver el error. Los timeouts largos (180 s
en ReservaGym, 200 s en el proxy) están alineados por diseño.

**El usuario cambió la rutina justo antes del cron.** No hay problema: el cron lee la
rutina **cuando se ejecuta** (05:00), no la cachea. Cualquier cambio hasta 04:59 se
respeta.

**Dos usuarios con el mismo DNI en ReservaGym.** Imposible por diseño: ReservaGym es
mono-usuario y las credenciales viven solo en su `.env`. Si algún día pasas a
multi-usuario, tocará añadir un mapa `userId → credenciales cifradas` en el proxy, no
en el body.

---

## 11. Checklist final

- [ ] Migración `add_auto_reserve_preferences` aplicada.
- [ ] `@nestjs/schedule` instalado y `ScheduleModule.forRoot()` en `AppModule`.
- [ ] `AutoReserveService` creado, registrado en `ReservationsModule`.
- [ ] Tres endpoints REST (`GET /reservations/auto-reserve`, `PATCH ...`, `GET .../should-run`).
- [ ] Toggle en `/settings` funcionando en móvil.
- [ ] Chip "Reserva prevista mañana" en `/dashboard`.
- [ ] Estado `skipped` reconocido en frontend con badge azul.
- [ ] Al menos 6 tests nuevos pasando en `apps/api`.
- [ ] `TZ=Europe/Madrid` en el `Dockerfile` de `apps/api`.
- [ ] Cron aparece en los logs de arranque.
- [ ] Verificado en paralelo con n8n durante 2 días.
- [ ] Workflow n8n desactivado y bearer `APIreservasGym` rotado/eliminado.
- [ ] `RESERVAGYM_ENABLED=true` en EasyPanel producción.

Cuando todos estén marcados, el pipeline es 100% GymFlow → ReservaGym, sin
intermediarios.