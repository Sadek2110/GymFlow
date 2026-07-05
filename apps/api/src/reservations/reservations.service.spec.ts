import { BadGatewayException, NotFoundException } from '@nestjs/common';
import { ReservationsService } from './reservations.service';
import { createPrismaMock } from '../../test/prisma.mock';

const USER = 'user-1';

function build(reservagym: any) {
  const prisma = createPrismaMock();
  const config = { get: (key: string) => (key === 'reservagym' ? reservagym : undefined) };
  const service = new ReservationsService(prisma as any, config as any);
  return { service, prisma };
}

const ENABLED = {
  enabled: true,
  url: 'http://reserva.local',
  apiKey: 'secret-key',
};

function mockFetchOnce(response: { ok: boolean; status?: number; body?: any }) {
  (global as any).fetch = jest.fn().mockResolvedValue({
    ok: response.ok,
    status: response.status ?? (response.ok ? 200 : 500),
    json: async () => response.body,
  });
}

describe('ReservationsService', () => {
  afterEach(() => {
    delete (global as any).fetch;
    jest.restoreAllMocks();
  });

  describe('feature flag desactivado', () => {
    it('health / run / list lanzan NotFound cuando RESERVAGYM_ENABLED=false', async () => {
      const { service } = build({ enabled: false });
      await expect(service.health()).rejects.toBeInstanceOf(NotFoundException);
      await expect(service.run(USER, {})).rejects.toBeInstanceOf(NotFoundException);
      await expect(service.list(USER)).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('health', () => {
    it('proxya GET /health del microservicio y devuelve su estado', async () => {
      const { service } = build(ENABLED);
      mockFetchOnce({ ok: true, body: { ok: true, status: 'online' } });

      const res = await service.health();

      expect((global as any).fetch).toHaveBeenCalledWith(
        'http://reserva.local/health',
        expect.objectContaining({ method: 'GET' }),
      );
      expect(res).toMatchObject({ status: 'online' });
    });

    it('devuelve 502 si el microservicio no responde', async () => {
      const { service } = build(ENABLED);
      (global as any).fetch = jest.fn().mockRejectedValue(new Error('ECONNREFUSED'));
      await expect(service.health()).rejects.toBeInstanceOf(BadGatewayException);
    });
  });

  describe('run', () => {
    it('dryRun: llama a /reservar con Bearer y {dryRun,time}, y guarda status dry_run', async () => {
      const { service, prisma } = build(ENABLED);
      mockFetchOnce({ ok: true, body: { ok: true, dryRun: true, stdout: 'flujo ok', stderr: '' } });
      prisma.reservation.create.mockImplementation(async ({ data }: any) => ({ id: 'res1', ...data }));

      const res = await service.run(USER, { dryRun: true, time: '09:00 - 10:00' });

      const [url, init] = (global as any).fetch.mock.calls[0];
      expect(url).toBe('http://reserva.local/reservar');
      expect(init.method).toBe('POST');
      expect(init.headers.Authorization).toBe('Bearer secret-key');
      const sentBody = JSON.parse(init.body);
      expect(sentBody).toEqual({ dryRun: true, time: '09:00 - 10:00' });
      // NUNCA se envían credenciales del gimnasio desde la app.
      expect(sentBody.dni).toBeUndefined();
      expect(sentBody.password).toBeUndefined();

      const created = prisma.reservation.create.mock.calls[0][0].data;
      expect(created.userId).toBe(USER);
      expect(created.status).toBe('dry_run');
      expect(created.timeSlot).toBe('09:00 - 10:00');
      expect(created.rawLog).toContain('flujo ok');
      expect(res.status).toBe('dry_run');
    });

    it('reserva real (dryRun=false) ok → status confirmed', async () => {
      const { service, prisma } = build(ENABLED);
      mockFetchOnce({ ok: true, body: { ok: true, dryRun: false, stdout: 'reservado' } });
      prisma.reservation.create.mockImplementation(async ({ data }: any) => ({ id: 'r', ...data }));

      const res = await service.run(USER, { dryRun: false });
      expect(res.status).toBe('confirmed');
    });

    it('por defecto (sin dryRun) asume dryRun=true por seguridad', async () => {
      const { service, prisma } = build(ENABLED);
      mockFetchOnce({ ok: true, body: { ok: true, dryRun: true } });
      prisma.reservation.create.mockImplementation(async ({ data }: any) => ({ id: 'r', ...data }));

      await service.run(USER, {});
      const sentBody = JSON.parse((global as any).fetch.mock.calls[0][1].body);
      expect(sentBody.dryRun).toBe(true);
    });

    it('si el microservicio responde ok:false → guarda failed y lanza 502', async () => {
      const { service, prisma } = build(ENABLED);
      mockFetchOnce({ ok: false, status: 500, body: { ok: false, error: 'El proceso falló', stderr: 'boom' } });
      prisma.reservation.create.mockImplementation(async ({ data }: any) => ({ id: 'r', ...data }));

      await expect(service.run(USER, { dryRun: false })).rejects.toBeInstanceOf(BadGatewayException);
      const created = prisma.reservation.create.mock.calls[0][0].data;
      expect(created.status).toBe('failed');
    });

    it('si el microservicio no responde (red/timeout) → guarda failed y lanza 502', async () => {
      const { service, prisma } = build(ENABLED);
      (global as any).fetch = jest.fn().mockRejectedValue(new Error('timeout'));
      prisma.reservation.create.mockImplementation(async ({ data }: any) => ({ id: 'r', ...data }));

      await expect(service.run(USER, {})).rejects.toBeInstanceOf(BadGatewayException);
      expect(prisma.reservation.create).toHaveBeenCalled();
      expect(prisma.reservation.create.mock.calls[0][0].data.status).toBe('failed');
    });
  });

  describe('list', () => {
    it('devuelve el historial del usuario ordenado por fecha desc', async () => {
      const { service, prisma } = build(ENABLED);
      prisma.reservation.findMany.mockResolvedValue([{ id: 'r1' }]);

      const res = await service.list(USER);

      const arg = prisma.reservation.findMany.mock.calls[0][0];
      expect(arg.where).toEqual({ userId: USER });
      expect(arg.orderBy).toEqual({ createdAt: 'desc' });
      expect(res).toHaveLength(1);
    });
  });
});
