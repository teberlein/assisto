'use client';

import type { ReactNode } from 'react';
import Link from 'next/link';
import { Card, EmptyState, ErrorState, LoadingState } from '@/components/ui';
import { usePanel } from './panel-context';
import type { Professional } from '@/types/api';

/**
 * Resuelve el profesional activo antes de renderizar la pantalla.
 * Evita repetir en cada página el loading / error / "todavía no hay ninguno".
 */
export function ProfessionalGate({
  children,
}: {
  children: (professional: Professional) => ReactNode;
}) {
  const {
    activeProfessional,
    loadingProfessionals,
    professionalsError,
    reloadProfessionals,
    isOwner,
  } = usePanel();

  if (loadingProfessionals) {
    return (
      <Card>
        <LoadingState label="Cargando profesionales…" />
      </Card>
    );
  }

  if (professionalsError) {
    return (
      <Card>
        <ErrorState message={professionalsError} onRetry={reloadProfessionals} />
      </Card>
    );
  }

  if (!activeProfessional) {
    return (
      <Card>
        <EmptyState
          title="Todavía no hay profesionales en la cuenta"
          description={
            isOwner
              ? 'Dá de alta al primer profesional para empezar a cargar disponibilidad y turnos.'
              : 'Pedile al dueño de la cuenta que te dé de alta como profesional.'
          }
          action={
            isOwner ? <LinkButton href="/equipo">Ir a Equipo</LinkButton> : undefined
          }
        />
      </Card>
    );
  }

  return <>{children(activeProfessional)}</>;
}

/** Encabezado estándar de las pantallas del panel. */
export function PageHeader({
  title,
  description,
  action,
}: {
  title: string;
  description?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-xl font-semibold text-slate-900">{title}</h1>
        {description && (
          <p className="mt-1 max-w-2xl text-sm text-slate-600">{description}</p>
        )}
      </div>
      {action}
    </div>
  );
}

export function LinkButton({
  href,
  children,
}: {
  href: string;
  children: ReactNode;
}) {
  return (
    <Link
      href={href}
      className="inline-flex items-center justify-center gap-2 rounded-lg border border-transparent bg-brand-700 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-brand-800"
    >
      {children}
    </Link>
  );
}
