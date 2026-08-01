'use client';

import { useState } from 'react';
import { api, errorMessage } from '@/lib/api';
import { formatDuration } from '@/lib/date';
import { useAsync } from '@/lib/useAsync';
import {
  Alert,
  Badge,
  Button,
  Card,
  CardHeader,
  EmptyState,
  ErrorState,
  Field,
  Input,
  LoadingState,
} from '@/components/ui';
import { ConfirmDialog } from '@/components/drawer';
import { PageHeader, ProfessionalGate } from '../professional-gate';
import type { Professional, ServiceType } from '@/types/api';

export default function ServiciosPage() {
  return (
    <ProfessionalGate>
      {(professional) => <Servicios professional={professional} />}
    </ProfessionalGate>
  );
}

function Servicios({ professional }: { professional: Professional }) {
  const { data, loading, error, reload } = useAsync<ServiceType[]>(
    () => api.listServiceTypes(professional.id),
    [professional.id],
  );

  const services = data ?? [];

  return (
    <>
      <PageHeader
        title="Tipos de servicio"
        description="La duración define cuánto ocupa cada turno en la agenda y qué horarios se le ofrecen al paciente."
      />

      <div className="grid gap-4 lg:grid-cols-[minmax(0,20rem)_minmax(0,1fr)]">
        <NewServiceForm professionalId={professional.id} onCreated={reload} />

        <Card>
          <CardHeader title="Servicios cargados" />

          {loading && <LoadingState label="Cargando servicios…" />}
          {!loading && error && <ErrorState message={error} onRetry={reload} />}

          {!loading && !error && services.length === 0 && (
            <EmptyState
              title="Todavía no hay servicios"
              description="Cargá al menos uno para que los pacientes puedan sacar turno."
            />
          )}

          {!loading && !error && services.length > 0 && (
            <ul className="divide-y divide-slate-200">
              {services.map((service) => (
                <ServiceRow
                  key={service.id}
                  service={service}
                  professionalId={professional.id}
                  onChanged={reload}
                />
              ))}
            </ul>
          )}
        </Card>
      </div>
    </>
  );
}

function ServiceRow({
  service,
  professionalId,
  onChanged,
}: {
  service: ServiceType;
  professionalId: string;
  onChanged: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(service.name);
  const [duration, setDuration] = useState(String(service.durationMinutes));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  async function save() {
    const minutes = Number(duration);
    if (!name.trim()) {
      setError('El nombre no puede estar vacío.');
      return;
    }
    if (!Number.isFinite(minutes) || minutes < 5) {
      setError('La duración tiene que ser de al menos 5 minutos.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await api.updateServiceType(professionalId, service.id, {
        name: name.trim(),
        durationMinutes: minutes,
      });
      setEditing(false);
      onChanged();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function toggleActive() {
    setBusy(true);
    setError(null);
    try {
      await api.updateServiceType(professionalId, service.id, {
        active: !service.active,
      });
      onChanged();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    setBusy(true);
    setError(null);
    try {
      await api.deleteServiceType(professionalId, service.id);
      setConfirmDelete(false);
      onChanged();
    } catch (err) {
      setError(errorMessage(err));
      setConfirmDelete(false);
    } finally {
      setBusy(false);
    }
  }

  return (
    <li className="px-4 py-3 sm:px-5">
      {editing ? (
        <div className="space-y-3">
          <Field label="Nombre del servicio" required>
            {({ id }) => (
              <Input
                id={id}
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            )}
          </Field>
          <Field label="Duración (minutos)" required>
            {({ id }) => (
              <Input
                id={id}
                type="number"
                min={5}
                step={5}
                value={duration}
                onChange={(e) => setDuration(e.target.value)}
              />
            )}
          </Field>
          {error && <Alert tone="error">{error}</Alert>}
          <div className="flex gap-2">
            <Button size="sm" loading={busy} onClick={save}>
              Guardar
            </Button>
            <Button
              size="sm"
              variant="secondary"
              disabled={busy}
              onClick={() => {
                setEditing(false);
                setName(service.name);
                setDuration(String(service.durationMinutes));
                setError(null);
              }}
            >
              Cancelar
            </Button>
          </div>
        </div>
      ) : (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="flex items-center gap-2 text-sm font-medium text-slate-900">
              {service.name}
              {!service.active && <Badge tone="slate">Inactivo</Badge>}
            </p>
            <p className="text-sm text-slate-600">
              {formatDuration(service.durationMinutes)}
            </p>
            {error && <p className="mt-1 text-xs text-red-700">{error}</p>}
          </div>
          <div className="flex gap-2">
            <Button size="sm" variant="secondary" onClick={() => setEditing(true)}>
              Editar
            </Button>
            <Button
              size="sm"
              variant="secondary"
              loading={busy}
              onClick={toggleActive}
            >
              {service.active ? 'Desactivar' : 'Activar'}
            </Button>
            <Button
              size="sm"
              variant="ghost"
              disabled={busy}
              onClick={() => setConfirmDelete(true)}
            >
              Borrar
            </Button>
          </div>
        </div>
      )}

      <ConfirmDialog
        open={confirmDelete}
        title={`¿Borrar «${service.name}»?`}
        description="Si ya hay turnos con este servicio, quizá te convenga desactivarlo en vez de borrarlo."
        confirmLabel="Sí, borrar"
        loading={busy}
        onConfirm={remove}
        onCancel={() => setConfirmDelete(false)}
      />
    </li>
  );
}

function NewServiceForm({
  professionalId,
  onCreated,
}: {
  professionalId: string;
  onCreated: () => void;
}) {
  const [name, setName] = useState('');
  const [duration, setDuration] = useState('30');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState(false);

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    setOk(false);
    const minutes = Number(duration);
    if (!Number.isFinite(minutes) || minutes < 5) {
      setError('La duración tiene que ser de al menos 5 minutos.');
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await api.createServiceType(professionalId, {
        name: name.trim(),
        durationMinutes: minutes,
        active: true,
      });
      setName('');
      setDuration('30');
      setOk(true);
      onCreated();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Card className="h-fit">
      <CardHeader title="Nuevo servicio" />
      <form onSubmit={onSubmit} className="space-y-4 px-4 py-4 sm:px-5" noValidate>
        {error && <Alert tone="error">{error}</Alert>}
        {ok && <Alert tone="success">Servicio creado.</Alert>}

        <Field label="Nombre" required>
          {({ id }) => (
            <Input
              id={id}
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Consulta inicial"
            />
          )}
        </Field>

        <Field label="Duración (minutos)" required hint="Mínimo 5 minutos.">
          {({ id, describedBy }) => (
            <Input
              id={id}
              aria-describedby={describedBy}
              type="number"
              min={5}
              step={5}
              required
              value={duration}
              onChange={(e) => setDuration(e.target.value)}
            />
          )}
        </Field>

        <Button type="submit" fullWidth loading={submitting}>
          Crear servicio
        </Button>
      </form>
    </Card>
  );
}
