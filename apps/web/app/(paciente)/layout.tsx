'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { usePatientSession } from '@/lib/auth';
import { Button, cx } from '@/components/ui';

const NAV = [
  { href: '/turnos', label: 'Mis turnos' },
  { href: '/reservar', label: 'Reservar' },
  { href: '/cupos', label: 'Cupos' },
  { href: '/lista-de-espera', label: 'Lista de espera' },
];

export default function PacienteLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const { session, ready, signOut } = usePatientSession();

  return (
    <div className="flex min-h-full flex-col bg-white">
      <header className="sticky top-0 z-30 border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-2xl items-center gap-3 px-4 py-3">
          <Link
            href="/turnos"
            className="text-sm font-semibold uppercase tracking-wide text-brand-700"
          >
            Asissto
          </Link>
          <div className="ml-auto flex items-center gap-2">
            {ready && session && (
              <>
                <span className="hidden text-sm text-slate-600 sm:inline">
                  {session.patient.fullName}
                </span>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => {
                    signOut();
                    router.replace('/ingresar');
                  }}
                >
                  Salir
                </Button>
              </>
            )}
            {ready && !session && (
              <Link
                href="/ingresar"
                className="text-sm font-medium text-brand-700 underline underline-offset-4"
              >
                Ingresar
              </Link>
            )}
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-2xl flex-1 px-4 py-5 pb-24 sm:pb-8">
        {children}
      </main>

      <nav
        aria-label="Secciones"
        className="fixed inset-x-0 bottom-0 z-30 border-t border-slate-200 bg-white sm:static sm:border-t-0"
      >
        <ul className="mx-auto flex max-w-2xl">
          {NAV.map((item) => {
            const active = pathname === item.href;
            return (
              <li key={item.href} className="flex-1">
                <Link
                  href={item.href}
                  aria-current={active ? 'page' : undefined}
                  className={cx(
                    'block px-2 py-3 text-center text-xs font-medium transition-colors sm:py-2',
                    active
                      ? 'text-brand-800 sm:border-b-2 sm:border-brand-700'
                      : 'text-slate-500 hover:text-slate-800',
                  )}
                >
                  {item.label}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
    </div>
  );
}
