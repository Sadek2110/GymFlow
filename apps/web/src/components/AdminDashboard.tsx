import { useEffect, useState } from 'react';
import {
  fetchAdminStats,
  fetchAdminUsers,
  type AdminStats,
  type AdminUser,
} from '../lib/admin';

export default function AdminDashboard() {
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [search, setSearch] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchAdminStats().then(setStats).catch(() => setError('No se pudieron cargar las estadísticas.'));
  }, []);
  useEffect(() => {
    const timer = window.setTimeout(() => {
      fetchAdminUsers(search)
        .then((page) => setUsers(page.items))
        .catch(() => setError('No se pudieron cargar los usuarios.'));
    }, 250);
    return () => window.clearTimeout(timer);
  }, [search]);

  return (
    <div className="grid gap-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-950">Administración</h1>
          <p className="mt-1 text-sm/6 text-slate-600">
            Usuarios y reservas de GymFlow.
          </p>
        </div>
        <a className="font-semibold text-brand-700 underline underline-offset-4" href="/admin/reservations">
          Ver todas las reservas
        </a>
      </header>
      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <Stat label="Usuarios" value={stats?.users ?? '—'} />
        <Stat label="Reservas" value={stats?.reservations ?? '—'} />
        <Stat label="Confirmadas" value={stats?.byStatus.confirmed ?? 0} />
      </section>
      <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-xs">
        <label className="grid gap-1 text-sm font-medium text-slate-700">
          Buscar por nombre o email
          <input
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            className="min-h-11 rounded-xl border border-slate-300 px-4 outline-hidden focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
          />
        </label>
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-2xl text-left text-sm">
            <thead className="text-slate-600">
              <tr>
                <th className="p-3">Usuario</th>
                <th className="p-3">Rol</th>
                <th className="p-3">Reservas</th>
                <th className="p-3">Credenciales</th>
              </tr>
            </thead>
            <tbody>
              {users.map((user) => (
                <tr key={user.id} className="border-t border-slate-100">
                  <td className="p-3">
                    <a className="font-semibold text-brand-700" href={`/admin/users/${user.id}`}>
                      {user.name}
                    </a>
                    <span className="block text-slate-600">{user.email}</span>
                  </td>
                  <td className="p-3">{user.role}</td>
                  <td className="p-3 tabular-nums">{user._count.reservations}</td>
                  <td className="p-3">
                    <span className={`rounded-full px-3 py-1 font-medium ${
                      user.credentialsConfigured
                        ? 'bg-green-100 text-green-800'
                        : 'bg-slate-100 text-slate-700'
                    }`}>
                      {user.credentialsConfigured ? 'Configuradas' : 'No configuradas'}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
      {error && <p role="alert" className="text-red-700">{error}</p>}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number | string }) {
  return (
    <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs">
      <p className="text-sm font-medium text-slate-600">{label}</p>
      <p className="mt-2 text-3xl font-bold tabular-nums text-slate-950">{value}</p>
    </article>
  );
}
