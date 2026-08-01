'use client';

import { Suspense, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { api, errorMessage } from '@/lib/api';
import { setPatientAccountId } from '@/lib/storage';
import { Alert, Button, Field, Input, LoadingState } from '@/components/ui';

export default function RegistroPage() {
  return (
    <Suspense fallback={<LoadingState />}>
      <Registro />
    </Suspense>
  );
}

function Registro() {
  const router = useRouter();
  const params = useSearchParams();
  const prefilledPhone = params.get('phone') ?? '';
  const accountId = params.get('accountId');

  const [phone, setPhone] = useState(prefilledPhone);
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (accountId) setPatientAccountId(accountId);
  }, [accountId]);

  useEffect(() => {
    if (prefilledPhone) setPhone(prefilledPhone);
  }, [prefilledPhone]);

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      await api.registerPatient({
        phone: phone.trim(),
        fullName: fullName.trim(),
        ...(email.trim() ? { email: email.trim() } : {}),
      });
      router.replace(`/ingresar?phone=${encodeURIComponent(phone.trim())}`);
    } catch (err) {
      setError(errorMessage(err));
      setSubmitting(false);
    }
  }

  return (
    <div>
      <h1 className="text-xl font-semibold text-slate-900">Registrate</h1>
      <p className="mt-1 text-sm text-slate-600">
        Con estos datos podés sacar turno con cualquier profesional de Asissto.
        Después entrás con un código que te mandamos al celular.
      </p>

      {prefilledPhone && (
        <div className="mt-4">
          <Alert tone="info">
            Ya cargamos el celular desde el que nos escribiste. Revisá que esté
            bien.
          </Alert>
        </div>
      )}

      <form onSubmit={onSubmit} className="mt-5 space-y-4" noValidate>
        {error && <Alert tone="error">{error}</Alert>}

        <Field
          label="Celular"
          required
          hint="En formato internacional, con el + adelante. Ej: +5491122334455"
        >
          {({ id, describedBy }) => (
            <Input
              id={id}
              aria-describedby={describedBy}
              type="tel"
              inputMode="tel"
              autoComplete="tel"
              required
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="+5491122334455"
            />
          )}
        </Field>

        <Field label="Nombre y apellido" required>
          {({ id }) => (
            <Input
              id={id}
              required
              autoComplete="name"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              placeholder="Juan Pérez"
            />
          )}
        </Field>

        <Field label="Email" hint="Opcional. Lo usamos sólo para avisos.">
          {({ id, describedBy }) => (
            <Input
              id={id}
              aria-describedby={describedBy}
              type="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          )}
        </Field>

        <Button type="submit" fullWidth loading={submitting}>
          Crear mi cuenta
        </Button>
      </form>

      <p className="mt-5 text-sm text-slate-600">
        ¿Ya te habías registrado?{' '}
        <Link
          href="/ingresar"
          className="font-medium text-brand-700 underline underline-offset-4"
        >
          Ingresá
        </Link>
        .
      </p>
    </div>
  );
}
