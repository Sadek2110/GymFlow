import { useEffect, useState } from 'react';
import { fetchAdminUser, type AdminUser } from '../lib/admin';
import AdminReservations from './AdminReservations';

export default function AdminUserDetail({ id }: { id: string }) {
  const [user, setUser] = useState<AdminUser | null>(null);
  useEffect(() => {
    fetchAdminUser(id).then(setUser);
  }, [id]);
  return (
    <div className="grid gap-6">
      <a href="/admin" className="font-semibold text-brand-700">Volver al panel</a>
      <header className="rounded-2xl border border-slate-200 bg-white p-5">
        <h1 className="text-2xl font-bold text-slate-950">{user?.name ?? 'Cargando…'}</h1>
        <p className="mt-1 text-slate-600">{user?.email}</p>
        {user && (
          <dl className="mt-4 grid gap-2 text-sm sm:grid-cols-3">
            <div><dt className="text-slate-500">Rol</dt><dd>{user.role}</dd></div>
            <div><dt className="text-slate-500">Auto-reserva</dt><dd>{user.autoReserveEnabled ? 'Activa' : 'Inactiva'}</dd></div>
            <div><dt className="text-slate-500">Credenciales</dt><dd>{user.credentialsConfigured ? 'Configuradas' : 'No configuradas'}</dd></div>
          </dl>
        )}
      </header>
      <h2 className="text-xl font-bold text-slate-950">Reservas</h2>
      <AdminReservations userId={id} />
    </div>
  );
}
