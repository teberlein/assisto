'use client';

import { useState } from 'react';
import { api, errorMessage } from '@/lib/api';
import {
  Alert,
  Button,
  Card,
  CardHeader,
  EmptyState,
  ErrorState,
  Field,
  Input,
  LoadingState,
} from '@/components/ui';
import { PageHeader } from '../professional-gate';
import { usePanel } from '../panel-context';

export default function EquipoPage() {
  const {
    isOwner,
    professionals,
    loadingProfessionals,
    professionalsError,
    reloadProfessionals,
  } = usePanel();

  if (!isOwner) {
    return (
      <Alert tone="warning" title="Sección sólo para el dueño de la cuenta">
        Pedile al dueño de la cuenta que dé de alta a los profesionales.
      </Alert>
    );
  }

  return (
    <>
      <PageHeader
        title="Equipo"
        description="Cada profesional entra al panel con su propio email y contraseña, y ve su propia agenda."
      />

      <div className="grid gap-4 lg:grid-cols-[minmax(0,22rem)_minmax(0,1fr)]">
        <NewProfessionalForm onCreated={reloadProfessionals} />

        <Card>
          <CardHeader title="Profesionales de la cuenta" />

          {loadingProfessionals && <LoadingState label="Cargando equipo…" />}
          {!loadingProfessionals && professionalsError && (
            <ErrorState
              message={professionalsError}
              onRetry={reloadProfessionals}
            />
          )}

          {!loadingProfessionals &&
            !professionalsError &&
            professionals.length === 0 && (
              <EmptyState
                title="Todavía no hay profesionales"
                description="Dá de alta al primero con el formulario de la izquierda."
              />
            )}

          {!loadingProfessionals &&
            !professionalsError &&
            professionals.length > 0 && (
              <ul className="divide-y divide-slate-200">
                {professionals.map((professional) => (
                  <li key={professional.id} className="px-4 py-3 sm:px-5">
                    <p className="text-sm font-medium text-slate-900">
                      {professional.displayName}
                    </p>
                    {professional.user && (
                      <p className="text-sm text-slate-600">
                        {professional.user.fullName} · {professional.user.email}
                      </p>
                    )}
                  </li>
                ))}
              </ul>
            )}
        </Card>
      </div>
    </>
  );
}

function NewProfessionalForm({ onCreated }: { onCreated: () => void }) {
  const [form, setForm] = useState({
    displayName: '',
    fullName: '',
    email: '',
    password: '',
  });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState(false);

  function set<K extends keyof typeof form>(key: K, value: string) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    setOk(false);
    if (form.password.length < 8) {
      setError('La contraseña tiene que tener al menos 8 caracteres.');
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await api.createProfessional({
        displayName: form.displayName.trim(),
        fullName: form.fullName.trim(),
        email: form.email.trim(),
        password: form.password,
      });
      setForm({ displayName: '', fullName: '', email: '', password: '' });
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
      <CardHeader title="Alta de profesional" />
      <form onSubmit={onSubmit} className="space-y-4 px-4 py-4 sm:px-5" noValidate>
        {error && <Alert tone="error">{error}</Alert>}
        {ok && (
          <Alert tone="success">
            Profesional creado. Pasale el email y la contraseña para que pueda
            ingresar.
          </Alert>
        )}

        <Field
          label="Nombre para mostrar"
          required
          hint="Es el que ven los pacientes al elegir profesional."
        >
          {({ id, describedBy }) => (
            <Input
              id={id}
              aria-describedby={describedBy}
              required
              value={form.displayName}
              onChange={(e) => set('displayName', e.target.value)}
              placeholder="Dra. Ana Pérez"
            />
          )}
        </Field>

        <Field label="Nombre y apellido" required>
          {({ id }) => (
            <Input
              id={id}
              required
              value={form.fullName}
              onChange={(e) => set('fullName', e.target.value)}
              placeholder="Ana Pérez"
            />
          )}
        </Field>

        <Field label="Email de ingreso" required>
          {({ id }) => (
            <Input
              id={id}
              type="email"
              required
              value={form.email}
              onChange={(e) => set('email', e.target.value)}
              placeholder="ana@consultorio.com"
            />
          )}
        </Field>

        <Field label="Contraseña inicial" required hint="Mínimo 8 caracteres.">
          {({ id, describedBy }) => (
            <Input
              id={id}
              aria-describedby={describedBy}
              type="password"
              required
              minLength={8}
              autoComplete="new-password"
              value={form.password}
              onChange={(e) => set('password', e.target.value)}
            />
          )}
        </Field>

        <Button type="submit" fullWidth loading={submitting}>
          Dar de alta
        </Button>
      </form>
    </Card>
  );
}
