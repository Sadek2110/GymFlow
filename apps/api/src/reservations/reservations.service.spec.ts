import {
  BadRequestException,
  ConflictException,
  NotFoundException,
  PreconditionFailedException,
} from '@nestjs/common';
import { ReservationsService } from './reservations.service';
import { createPrismaMock } from '../../test/prisma.mock';

const USER = 'user-1';
const ENABLED = {
  enabled: true,
  url: 'http://reserva.local',
  apiKey: 'secret-key',
};

function build(reservagym: any = ENABLED) {
  const prisma = createPrismaMock();
  const crypto = {
    encrypt: jest.fn((value: string) => `enc:${value}`),
    decrypt: jest.fn((value: string) => value.replace('enc:', '')),
  };
  const config = {
    get: (key: string) => (key === 'reservagym' ? reservagym : undefined),
  };
  const service = new ReservationsService(
    prisma as any,
    crypto as any,
    config as any,
  );
  return { service, prisma, crypto };
}

function credentials(prisma: ReturnType<typeof createPrismaMock>) {
  prisma.gymCredential.findUnique.mockResolvedValue({
    dniEnc: 'enc:12345678A',
    passwordEnc: 'enc:clave',
  });
  prisma.reservation.findFirst.mockResolvedValue(null);
}

function mockFetch(body: any, ok = true) {
  (global as any).fetch = jest.fn().mockResolvedValue({
    ok,
    status: ok ? 200 : 500,
    json: async () => body,
  });
}

describe('ReservationsService', () => {
  afterEach(() => {
    delete (global as any).fetch;
    jest.restoreAllMocks();
  });

  it('protege todos sus seams cuando el módulo está desactivado', async () => {
    const { service } = build({ enabled: false });
    await expect(service.health()).rejects.toBeInstanceOf(NotFoundException);
    await expect(service.run(USER, {})).rejects.toBeInstanceOf(
      NotFoundException,
    );
    await expect(service.list(USER)).rejects.toBeInstanceOf(NotFoundException);
  });

  it('proxya el health del microservicio', async () => {
    const { service } = build();
    mockFetch({ ok: true, status: 'online' });
    await expect(service.health()).resolves.toMatchObject({ status: 'online' });
  });

  it('sin credenciales devuelve 412 y no llama al microservicio', async () => {
    const { service, prisma } = build();
    prisma.gymCredential.findUnique.mockResolvedValue(null);
    await expect(service.run(USER, {})).rejects.toBeInstanceOf(
      PreconditionFailedException,
    );
    expect((global as any).fetch).toBeUndefined();
  });

  it('envía credenciales descifradas y persiste el dry run', async () => {
    const { service, prisma } = build();
    credentials(prisma);
    mockFetch({ ok: true, dryRun: true, stdout: 'flujo ok' });
    prisma.reservation.create.mockImplementation(async ({ data }: any) => ({
      id: 'r1',
      ...data,
    }));

    const result = await service.run(USER, {
      dryRun: true,
      time: '09:00 - 10:00',
    });
    const [url, init] = (global as any).fetch.mock.calls[0];
    expect(url).toBe('http://reserva.local/reservar');
    expect(init.headers.Authorization).toBe('Bearer secret-key');
    expect(JSON.parse(init.body)).toEqual({
      dryRun: true,
      time: '09:00 - 10:00',
      dni: '12345678A',
      password: 'clave',
    });
    expect(result.status).toBe('dry_run');
  });

  it('rechaza una franja activa duplicada con 409', async () => {
    const { service, prisma } = build();
    credentials(prisma);
    prisma.reservation.findFirst.mockResolvedValue({ id: 'existing' });
    await expect(
      service.run(USER, { time: '09:00 - 10:00' }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('sanea contraseñas antes de persistir rawLog', async () => {
    const { service, prisma } = build();
    credentials(prisma);
    mockFetch({
      ok: true,
      dryRun: true,
      stdout: '{"password":"filtrada"}',
    });
    prisma.reservation.create.mockImplementation(async ({ data }: any) => data);
    const result = await service.run(USER, {});
    expect(result.rawLog).toContain('"password":"***"');
    expect(result.rawLog).not.toContain('filtrada');
  });

  it('cancela únicamente una reserva confirmada del usuario', async () => {
    const { service, prisma } = build();
    prisma.reservation.findFirst.mockResolvedValue({
      id: 'r1',
      userId: USER,
      date: new Date(2026, 6, 7),
      timeSlot: '09:00 - 10:00',
      status: 'confirmed',
      rawLog: null,
    });
    prisma.gymCredential.findUnique.mockResolvedValue({
      dniEnc: 'enc:12345678A',
      passwordEnc: 'enc:clave',
    });
    prisma.reservation.update.mockResolvedValue({
      id: 'r1',
      status: 'cancelled',
    });
    mockFetch({ ok: true, stdout: 'cancelada' });

    await expect(service.cancel(USER, 'r1', false)).resolves.toMatchObject({
      status: 'cancelled',
    });
    expect(prisma.reservation.findFirst).toHaveBeenCalledWith({
      where: { id: 'r1', userId: USER },
    });
    expect(
      JSON.parse((global as any).fetch.mock.calls[0][1].body),
    ).toMatchObject({
      dni: '12345678A',
      password: 'clave',
      date: '07/07/2026',
      time: '09:00 - 10:00',
      dryRun: false,
    });
  });

  it('rechaza cancelar reservas ajenas o no confirmadas', async () => {
    const { service, prisma } = build();
    prisma.reservation.findFirst.mockResolvedValueOnce(null);
    await expect(service.cancel(USER, 'other', false)).rejects.toBeInstanceOf(
      NotFoundException,
    );
    prisma.reservation.findFirst.mockResolvedValueOnce({
      id: 'r2',
      status: 'dry_run',
    });
    await expect(service.cancel(USER, 'r2', false)).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('lista solo el historial del usuario', async () => {
    const { service, prisma } = build();
    prisma.reservation.findMany.mockResolvedValue([{ id: 'r1' }]);
    await expect(service.list(USER)).resolves.toHaveLength(1);
    expect(prisma.reservation.findMany).toHaveBeenCalledWith({
      where: { userId: USER },
      orderBy: { createdAt: 'desc' },
    });
  });
});
