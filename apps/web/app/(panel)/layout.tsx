'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useProSession } from '@/lib/auth';
import { Button, LoadingState, Select, cx } from '@/components/ui';
import { PanelProvider, usePanel } from './panel-context';

const NAV = [
  { href: '/agenda', label: 'Agenda' },
  { href: '/disponibilidad', label: 'Disponibilidad' },
  { href: '/servicios', label: 'Servicios' },
  { href: '/lista-espera', label: 'Lista de espera' },
  { href: '/equipo', label: 'Equipo', ownerOnly: true },
  { href: '/cuenta', label: 'Cuenta', ownerOnly: true },
];

export default function PanelLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { session, ready } = useProSession();
  const router = useRouter();

  useEffect(() => {
    if (ready && !session) router.replace('/login');
  }, [ready, session, router]);

  if (!ready) {
    return <LoadingState label="Cargando el panel…" />;
  }

  if (!session) {
    return <LoadingState label="Redirigiendo al ingreso…" />;
  }

  return (
    <PanelProvider user={session.user}>
      <PanelShell>{children}</PanelShell>
    </PanelProvider>
  );
}

function PanelShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { signOut } = useProSession();
  const {
    user,
    isOwner,
    professionals,
    activeProfessional,
    setActiveProfessionalId,
  } = usePanel();
  const [menuOpen, setMenuOpen] = useState(false);

  const items = NAV.filter((item) => !item.ownerOnly || isOwner);

  function onSignOut() {
    signOut();
    router.replace('/login');
  }

  return (
    <div className="flex min-h-full flex-col">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-3 px-4 py-3">
          <Link
            href="/agenda"
            className="text-sm font-semibold uppercase tracking-wide text-brand-700"
          >
            Asissto
          </Link>

          {professionals.length > 1 && (
            <div className="order-3 w-full sm:order-none sm:w-auto">
              <label htmlFor="profesional-activo" className="sr-only">
                Profesional activo
              </label>
              <Select
                id="profesional-activo"
                value={activeProfessional?.id ?? ''}
                onChange={(e) => setActiveProfessionalId(e.target.value)}
                className="py-1.5 text-sm sm:w-56"
              >
                {professionals.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.displayName}
                  </option>
                ))}
              </Select>
            </div>
          )}

          <div className="ml-auto flex items-center gap-2">
            <span className="hidden text-sm text-slate-600 sm:inline">
              {user.fullName}
            </span>
            <Button variant="secondary" size="sm" onClick={onSignOut}>
              Salir
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="sm:hidden"
              aria-expanded={menuOpen}
              aria-controls="nav-panel"
              onClick={() => setMenuOpen((v) => !v)}
            >
              {menuOpen ? 'Cerrar' : 'Menú'}
            </Button>
          </div>
        </div>

        <nav
          id="nav-panel"
          aria-label="Secciones del panel"
          className={cx(
            'mx-auto max-w-7xl px-4 pb-2',
            menuOpen ? 'block' : 'hidden sm:block',
          )}
        >
          <ul className="flex flex-col gap-1 sm:flex-row sm:gap-1">
            {items.map((item) => {
              const active = pathname === item.href;
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    onClick={() => setMenuOpen(false)}
                    aria-current={active ? 'page' : undefined}
                    className={cx(
                      'block rounded-md px-3 py-2 text-sm font-medium transition-colors',
                      active
                        ? 'bg-brand-50 text-brand-800'
                        : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900',
                    )}
                  >
                    {item.label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>
      </header>

      <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-6">
        {children}
      </main>
    </div>
  );
}
