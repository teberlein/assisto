'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { api, ApiError, errorMessage } from '@/lib/api';
import { usePatientSession } from '@/lib/auth';
import { fmtDateTime, relativeTime } from '@/lib/date';
import { useAsync } from '@/lib/useAsync';
import {
  Alert,
  Button,
  Card,
  CardHeader,
  EmptyState,
  ErrorState,
  LoadingState,
} from '@/components/ui';
import { ConfirmDialog } from '@/components/drawer';
import type { Appointment } from '@/types/api';

/**
 * Cupos liberados y todavía disponibles (sec 6.4). Ver la lista es abierto;
 * tomar un cupo requiere sesión de paciente. Como cualquiera puede tomarlo, el
 * claim puede volver 409 si otro se adelantó: lo tratamos como caso normal.
 */
export default function CuposPage() {
  const router = useRouter();
  const [notice, setNotice] = useState<string | null>(null);

  const { data, loading, error, reload } = useAsync<Appointment[]>(
    () => api.openSlots(),
    [],
  );

  const cupos = data ?? [];

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-semibold text-slate-900">Cupos liberados</h1>
        <p className="mt-1 text-sm text-slate-600">
          Turnos que alguien canceló y quedaron libres ahora mismo. El primero
          que lo toma, se lo queda.
        </p>
      </div>

      {notice && <Alert tone="info">{notice}</Alert>}

      {loading && (
        <Card>
          <LoadingState label="Buscando cupos libres…" />
        </Card>
      )}
      {!loading && error && (
        <Card>
          <ErrorState message={error} onRetry={reload} />
        </Card>
      )}

      {!loading && !error && (
        <Card>
          <CardHeader
            title="Disponibles ahora"
            description={
              cupos.length > 0
                ? `${cupos.length} ${cupos.length === 1 ? 'cupo' : 'cupos'} para tomar.`
                : undefined
            }
            action={
              <Button variant="secondary" size="sm" onClick={reload}>
                Actualizar
              </Button>
            }
          />
          {cupos.length === 0 ? (
            <EmptyState
              title="No hay cupos liberados por ahora"
              description="Anotate en la lista de espera y te avisamos apenas se libere uno que te sirva."
              action={
                <Link
                  href="/lista-de-espera"
                  className="inline-flex items-center rounded-lg bg-brand-700 px-4 py-2.5 text-sm font-medium text-white hover:bg-brand-800"
                >
                  Ver mi lista de espera
                </Link>
              }
            />
          ) : (
            <ul className="divide-y divide-slate-200">
              {cupos.map((cupo) => (
                <CupoRow
                  key={cupo.id}
                  cupo={cupo}
                  onClaimed={() => router.push('/turnos')}
                  onConflict={() => {
                    setNotice(
                      'Otro paciente tomó ese cupo primero. Actualizamos la lista con los que siguen disponibles.',
                    );
                    reload();
                  }}
                />
              ))}
            </ul>
          )}
        </Card>
      )}
    </div>
  );
}

function CupoRow({
  cupo,
  onClaimed,
  onConflict,
}: {
  cupo: Appointment;
  onClaimed: () => void;
  onConflict: () => void;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const { session, ready } = usePatientSession();

  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function start() {
    // Ver es público; tomar necesita identificarse. Si no hay sesión, mandamos
    // a ingresar y volvemos acá con `next`.
    if (ready && !session) {
      router.push(`/ingresar?next=${encodeURIComponent(pathname)}`);
      return;
    }
    setConfirm(true);
  }

  async function claim() {
    setBusy(true);
    setError(null);
    try {
      await api.claimAppointment(cupo.id);
      setConfirm(false);
      onClaimed();
    } catch (err) {
      setConfirm(false);
      if (err instanceof ApiError && err.isConflict) {
        onConflict();
      } else {
        setError(errorMessage(err));
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <li className="px-4 py-4 sm:px-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-slate-900">
            {fmtDateTime(cupo.startAt)}
          </p>
          <p className="text-sm text-slate-600">
            {cupo.professional?.displayName ?? 'Profesional'}
            {cupo.serviceType ? ` · ${cupo.serviceType.name}` : ''}
          </p>
          <p className="mt-0.5 text-xs text-slate-500">
            {relativeTime(cupo.startAt)}
          </p>
        </div>
        <Button className="w-full shrink-0 sm:w-auto" onClick={start}>
          Tomar este cupo
        </Button>
      </div>

      {error && (
        <div className="mt-3">
          <Alert tone="error">{error}</Alert>
        </div>
      )}

      <ConfirmDialog
        open={confirm}
        danger={false}
        title="¿Tomar este cupo?"
        description={
          <>
            <p>Vas a quedar agendado para el {fmtDateTime(cupo.startAt)}.</p>
            <p className="mt-2">
              Es por orden de llegada: puede pasar que alguien lo tome justo
              antes que vos.
            </p>
          </>
        }
        confirmLabel="Sí, es mío"
        loading={busy}
        onConfirm={claim}
        onCancel={() => setConfirm(false)}
      />
    </li>
  );
}
