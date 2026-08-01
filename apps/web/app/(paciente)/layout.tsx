'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { usePatientSession } from '@/lib/auth';
import { Button, cx } from '@/components/ui';

type NavIconProps = { className?: string };

function IconTurnos({ className }: NavIconProps) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <rect x="3" y="4" width="18" height="17" rx="2" />
      <path d="M3 9h18M8 2v4M16 2v4M9 15l2 2 4-4" />
    </svg>
  );
}

function IconReservar({ className }: NavIconProps) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="9" />
      <path d="M12 8v8M8 12h8" />
    </svg>
  );
}

function IconCupos({ className }: NavIconProps) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M13 2 4 14h7l-1 8 9-12h-7z" />
    </svg>
  );
}

function IconEspera({ className }: NavIconProps) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" />
    </svg>
  );
}

const NAV = [
  { href: '/turnos', label: 'Mis turnos', short: 'Turnos', Icon: IconTurnos },
  { href: '/reservar', label: 'Reservar', short: 'Reservar', Icon: IconReservar },
  { href: '/cupos', label: 'Cupos', short: 'Cupos', Icon: IconCupos },
  {
    href: '/lista-de-espera',
    label: 'Lista de espera',
    short: 'Espera',
    Icon: IconEspera,
  },
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
        className="fixed inset-x-0 bottom-0 z-30 border-t border-slate-200 bg-white pb-safe sm:static sm:border-t-0 sm:pb-0"
      >
        <ul className="mx-auto flex max-w-2xl">
          {NAV.map((item) => {
            const active = pathname === item.href;
            const { Icon } = item;
            return (
              <li key={item.href} className="flex-1">
                <Link
                  href={item.href}
                  aria-current={active ? 'page' : undefined}
                  className={cx(
                    'flex min-h-14 flex-col items-center justify-center gap-1 px-1 py-2 text-center transition-colors',
                    'sm:min-h-0 sm:flex-row sm:gap-2 sm:py-2',
                    active
                      ? 'text-brand-700 sm:border-b-2 sm:border-brand-700 sm:text-brand-800'
                      : 'text-slate-500 hover:text-slate-800',
                  )}
                >
                  <Icon className="h-6 w-6 sm:h-4 sm:w-4" />
                  <span className="text-[11px] font-medium leading-none sm:text-sm">
                    <span className="sm:hidden">{item.short}</span>
                    <span className="hidden sm:inline">{item.label}</span>
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
    </div>
  );
}
