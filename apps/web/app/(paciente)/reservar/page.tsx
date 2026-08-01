'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { AccountGate } from '@/components/account-gate';
import { api, errorMessage } from '@/lib/api';
import { useRequirePatient } from '@/lib/auth';
import {
  addDays,
  endOfDay,
  fmtLongDate,
  fmtTime,
  formatDuration,
  fromISODate,
  startOfDay,
  toISODate,
} from '@/lib/date';
import { useAsync } from '@/lib/useAsync';
import {
  Alert,
  Button,
  Card,
  CardHeader,
  EmptyState,
  ErrorState,
  Field,
  LoadingState,
  Select,
  cx,
} from '@/components/ui';
import { ConfirmDialog } from '@/components/drawer';
import type { Appointment, Professional, ServiceType, Slot } from '@/types/api';

/** Ventana de búsqueda de horarios libres, en días desde hoy. */
const RANGE_DAYS = 14;

export default function ReservarPage() {
  return <AccountGate>{(accountId) => <Reservar accountId={accountId} />}</AccountGate>;
}

/** Exige sesión de paciente antes de dejar reservar (el alta va con su token). */
function Reservar({ accountId }: { accountId: string }) {
  const { session, ready } = useRequirePatient();

  if (!ready || !session) return <LoadingState />;
  return <Wizard accountId={accountId} />;
}

function Wizard({ accountId }: { accountId: string }) {
  const [professionalId, setProfessionalId] = useState<string | null>(null);
  const [serviceTypeId, setServiceTypeId] = useState<string | null>(null);
  const [selectedDay, setSelectedDay] = useState<string | null>(null);
  const [pending, setPending] = useState<Slot | null>(null);
  const [booking, setBooking] = useState(false);
  const [bookError, setBookError] = useState<string | null>(null);
  const [confirmed, setConfirmed] = useState<Appointment | null>(null);

  const professionals = useAsync<Professional[]>(
    () => api.publicProfessionals(accountId),
    [accountId],
  );

  const proList = professionals.data ?? [];
  // Con un solo profesional no tiene sentido pedir que lo elija.
  const effectiveProfId =
    professionalId ?? (proList.length === 1 ? proList[0].id : null);

  const services = useAsync<ServiceType[]>(
    () => api.publicServiceTypes(effectiveProfId as string),
    [effectiveProfId],
    Boolean(effectiveProfId),
  );

  const activeServices = (services.data ?? []).filter((s) => s.active);
  const effectiveServiceId =
    serviceTypeId ??
    (activeServices.length === 1 ? activeServices[0].id : null);

  const range = useMemo(() => {
    const now = new Date();
    return {
      from: startOfDay(now).toISOString(),
      to: endOfDay(addDays(now, RANGE_DAYS - 1)).toISOString(),
    };
  }, []);

  const slots = useAsync<Slot[]>(
    () =>
      api.slots({
        professionalId: effectiveProfId as string,
        serviceTypeId: effectiveServiceId as string,
        from: range.from,
        to: range.to,
      }),
    [effectiveProfId, effectiveServiceId, range.from, range.to],
    Boolean(effectiveProfId && effectiveServiceId),
  );

  const byDay = useMemo(() => {
    const map = new Map<string, Slot[]>();
    for (const slot of slots.data ?? []) {
      const key = toISODate(new Date(slot.startAt));
      const list = map.get(key) ?? [];
      list.push(slot);
      map.set(key, list);
    }
    return [...map.entries()].sort(([a], [b]) => a.localeCompare(b));
  }, [slots.data]);

  const activeDay = selectedDay ?? byDay[0]?.[0] ?? null;
  const daySlots = byDay.find(([day]) => day === activeDay)?.[1] ?? [];

  const selectedService = activeServices.find((s) => s.id === effectiveServiceId);
  const selectedPro = proList.find((p) => p.id === effectiveProfId);

  async function book() {
    if (!pending || !effectiveProfId || !effectiveServiceId) return;
    setBooking(true);
    setBookError(null);
    try {
      const appointment = await api.createAppointment({
        professionalId: effectiveProfId,
        serviceTypeId: effectiveServiceId,
        startAt: pending.startAt,
      });
      setConfirmed(appointment);
      setPending(null);
    } catch (err) {
      setBookError(errorMessage(err));
      setPending(null);
    } finally {
      setBooking(false);
    }
  }

  function reset() {
    setConfirmed(null);
    setPending(null);
    setBookError(null);
    setSelectedDay(null);
  }

  if (confirmed) {
    return (
      <Card>
        <div className="px-4 py-10 text-center sm:px-5">
          <p className="text-base font-semibold text-slate-900">
            ¡Turno confirmado!
          </p>
          <p className="mx-auto mt-1 max-w-md text-sm text-slate-600">
            Te esperamos el{' '}
            <strong>{fmtLongDate(confirmed.startAt)}</strong> a las{' '}
            <strong>{fmtTime(confirmed.startAt)}</strong>
            {selectedPro ? ` con ${selectedPro.displayName}` : ''}.
          </p>
          <div className="mt-5 flex flex-wrap justify-center gap-2">
            <Link
              href="/turnos"
              className="inline-flex items-center rounded-lg bg-brand-700 px-4 py-2.5 text-sm font-medium text-white hover:bg-brand-800"
            >
              Ver mis turnos
            </Link>
            <Button variant="secondary" onClick={reset}>
              Reservar otro
            </Button>
          </div>
        </div>
      </Card>
    );
  }

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-semibold text-slate-900">Reservar turno</h1>
        <p className="mt-1 text-sm text-slate-600">
          Elegí profesional, servicio y el horario que mejor te venga.
        </p>
      </div>

      {bookError && <Alert tone="error">{bookError}</Alert>}

      {professionals.loading ? (
        <Card>
          <LoadingState label="Cargando el consultorio…" />
        </Card>
      ) : professionals.error ? (
        <Card>
          <ErrorState message={professionals.error} onRetry={professionals.reload} />
        </Card>
      ) : proList.length === 0 ? (
        <Card>
          <EmptyState
            title="Este consultorio todavía no tiene profesionales cargados"
            description="Probá más tarde o escribile al consultorio."
          />
        </Card>
      ) : (
        <>
          {/* Paso 1: profesional (solo si hay más de uno) */}
          {proList.length > 1 && (
            <Card>
              <div className="px-4 py-4 sm:px-5">
                <Field label="Profesional">
                  {({ id }) => (
                    <Select
                      id={id}
                      value={effectiveProfId ?? ''}
                      onChange={(e) => {
                        setProfessionalId(e.target.value || null);
                        setServiceTypeId(null);
                        setSelectedDay(null);
                      }}
                    >
                      <option value="">Elegí un profesional…</option>
                      {proList.map((pro) => (
                        <option key={pro.id} value={pro.id}>
                          {pro.displayName}
                        </option>
                      ))}
                    </Select>
                  )}
                </Field>
              </div>
            </Card>
          )}

          {/* Paso 2: servicio */}
          {effectiveProfId && (
            <Card>
              <div className="px-4 py-4 sm:px-5">
                {services.loading ? (
                  <LoadingState label="Cargando servicios…" />
                ) : services.error ? (
                  <ErrorState message={services.error} onRetry={services.reload} />
                ) : activeServices.length === 0 ? (
                  <EmptyState title="Este profesional no tiene servicios disponibles" />
                ) : (
                  <Field label="Servicio">
                    {({ id }) => (
                      <Select
                        id={id}
                        value={effectiveServiceId ?? ''}
                        onChange={(e) => {
                          setServiceTypeId(e.target.value || null);
                          setSelectedDay(null);
                        }}
                      >
                        <option value="">Elegí un servicio…</option>
                        {activeServices.map((service) => (
                          <option key={service.id} value={service.id}>
                            {service.name} · {formatDuration(service.durationMinutes)}
                          </option>
                        ))}
                      </Select>
                    )}
                  </Field>
                )}
              </div>
            </Card>
          )}

          {/* Paso 3: día y horario */}
          {effectiveProfId && effectiveServiceId && (
            <Card>
              <CardHeader title="Elegí día y horario" />
              <div className="px-4 py-4 sm:px-5">
                {slots.loading ? (
                  <LoadingState label="Buscando horarios libres…" />
                ) : slots.error ? (
                  <ErrorState message={slots.error} onRetry={slots.reload} />
                ) : byDay.length === 0 ? (
                  <EmptyState
                    title="No hay horarios libres en los próximos días"
                    description="Anotate en la lista de espera y te avisamos apenas se libere uno."
                    action={
                      <Link
                        href="/lista-de-espera"
                        className="inline-flex items-center rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm font-medium text-slate-800 hover:bg-slate-50"
                      >
                        Ir a la lista de espera
                      </Link>
                    }
                  />
                ) : (
                  <div className="space-y-4">
                    {/* Días con cupos */}
                    <div className="flex gap-2 overflow-x-auto pb-1">
                      {byDay.map(([day, list]) => {
                        const date = fromISODate(day);
                        const active = day === activeDay;
                        return (
                          <button
                            key={day}
                            type="button"
                            aria-pressed={active}
                            onClick={() => setSelectedDay(day)}
                            className={cx(
                              'shrink-0 rounded-lg border px-3 py-2 text-center transition-colors',
                              active
                                ? 'border-brand-700 bg-brand-700 text-white'
                                : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50',
                            )}
                          >
                            <span className="block text-xs font-medium capitalize">
                              {new Intl.DateTimeFormat('es-AR', {
                                weekday: 'short',
                              }).format(date)}
                            </span>
                            <span className="block text-sm font-semibold">
                              {new Intl.DateTimeFormat('es-AR', {
                                day: '2-digit',
                                month: '2-digit',
                              }).format(date)}
                            </span>
                            <span
                              className={cx(
                                'block text-[11px]',
                                active ? 'text-white/80' : 'text-slate-500',
                              )}
                            >
                              {list.length}{' '}
                              {list.length === 1 ? 'horario' : 'horarios'}
                            </span>
                          </button>
                        );
                      })}
                    </div>

                    {/* Horarios del día elegido */}
                    <div>
                      {activeDay && (
                        <p className="mb-2 text-sm font-medium capitalize text-slate-700">
                          {fmtLongDate(fromISODate(activeDay))}
                        </p>
                      )}
                      <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
                        {daySlots.map((slot) => (
                          <button
                            key={slot.startAt}
                            type="button"
                            onClick={() => setPending(slot)}
                            className="rounded-lg border border-slate-300 bg-white px-2 py-2.5 text-sm font-medium text-slate-800 tabular-nums transition-colors hover:border-brand-700 hover:bg-brand-50 hover:text-brand-800"
                          >
                            {fmtTime(slot.startAt)}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </Card>
          )}
        </>
      )}

      <ConfirmDialog
        open={Boolean(pending)}
        danger={false}
        title="¿Confirmar este turno?"
        description={
          pending ? (
            <p>
              {selectedPro ? `${selectedPro.displayName} · ` : ''}
              {selectedService ? `${selectedService.name} · ` : ''}
              {fmtLongDate(pending.startAt)} a las {fmtTime(pending.startAt)}.
            </p>
          ) : (
            ''
          )
        }
        confirmLabel="Confirmar turno"
        loading={booking}
        onConfirm={book}
        onCancel={() => setPending(null)}
      />
    </div>
  );
}
