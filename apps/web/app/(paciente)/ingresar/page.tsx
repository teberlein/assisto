'use client';

import { Suspense, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { api, errorMessage } from '@/lib/api';
import { usePatientSession } from '@/lib/auth';
import { setPatientAccountId } from '@/lib/storage';
import { Alert, Button, Field, Input, LoadingState } from '@/components/ui';

export default function IngresarPage() {
  return (
    <Suspense fallback={<LoadingState />}>
      <Ingresar />
    </Suspense>
  );
}

type Step = 'phone' | 'code';

function Ingresar() {
  const router = useRouter();
  const params = useSearchParams();
  const next = params.get('next') || '/turnos';
  const accountId = params.get('accountId');

  const { session, ready, signIn } = usePatientSession();

  const [step, setStep] = useState<Step>('phone');
  const [phone, setPhone] = useState(params.get('phone') ?? '');
  const [code, setCode] = useState('');
  const [simulated, setSimulated] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (accountId) setPatientAccountId(accountId);
  }, [accountId]);

  useEffect(() => {
    if (ready && session) router.replace(next);
  }, [ready, session, router, next]);

  async function requestCode(event: React.FormEvent) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const result = await api.requestOtp({ phone: phone.trim() });
      setSimulated(Boolean(result?.simulated));
      setStep('code');
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSubmitting(false);
    }
  }

  async function verifyCode(event: React.FormEvent) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const result = await api.verifyOtp({
        phone: phone.trim(),
        code: code.trim(),
      });
      signIn({ accessToken: result.accessToken, patient: result.patient });
      router.replace(next);
    } catch (err) {
      setError(errorMessage(err));
      setSubmitting(false);
    }
  }

  return (
    <div>
      <h1 className="text-xl font-semibold text-slate-900">Ingresar</h1>
      <p className="mt-1 text-sm text-slate-600">
        {step === 'phone'
          ? 'Poné tu celular y te mandamos un código para entrar.'
          : `Escribí el código de 6 dígitos que enviamos a ${phone}.`}
      </p>

      <ol
        className="mt-4 flex gap-2 text-xs font-medium"
        aria-label="Pasos del ingreso"
      >
        <li
          aria-current={step === 'phone' ? 'step' : undefined}
          className={
            step === 'phone'
              ? 'rounded-full bg-brand-700 px-3 py-1 text-white'
              : 'rounded-full bg-slate-100 px-3 py-1 text-slate-600'
          }
        >
          1. Tu celular
        </li>
        <li
          aria-current={step === 'code' ? 'step' : undefined}
          className={
            step === 'code'
              ? 'rounded-full bg-brand-700 px-3 py-1 text-white'
              : 'rounded-full bg-slate-100 px-3 py-1 text-slate-600'
          }
        >
          2. Código
        </li>
      </ol>

      {step === 'phone' ? (
        <form onSubmit={requestCode} className="mt-5 space-y-4" noValidate>
          {error && <Alert tone="error">{error}</Alert>}

          <Field
            label="Celular"
            required
            hint="El mismo con el que te registraste, en formato internacional."
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

          <Button type="submit" fullWidth loading={submitting}>
            Enviarme el código
          </Button>
        </form>
      ) : (
        <form onSubmit={verifyCode} className="mt-5 space-y-4" noValidate>
          {error && <Alert tone="error">{error}</Alert>}

          {simulated && (
            <Alert tone="info" title="Modo desarrollo">
              El envío por WhatsApp está simulado: el código sale por la consola
              de la API (buscá la línea{' '}
              <code className="font-mono">[OTP SIMULATED]</code>). En dev el
              código fijo es <strong>000000</strong>.
            </Alert>
          )}

          <Field label="Código de 6 dígitos" required>
            {({ id }) => (
              <Input
                id={id}
                inputMode="numeric"
                autoComplete="one-time-code"
                pattern="[0-9]*"
                maxLength={6}
                required
                value={code}
                onChange={(e) =>
                  setCode(e.target.value.replace(/\D/g, '').slice(0, 6))
                }
                placeholder="000000"
                className="text-center text-lg tracking-[0.5em] tabular-nums"
              />
            )}
          </Field>

          <Button type="submit" fullWidth loading={submitting}>
            Entrar
          </Button>
          <Button
            type="button"
            variant="ghost"
            fullWidth
            disabled={submitting}
            onClick={() => {
              setStep('phone');
              setCode('');
              setError(null);
            }}
          >
            Cambiar el número
          </Button>
        </form>
      )}

      <p className="mt-5 text-sm text-slate-600">
        ¿Primera vez?{' '}
        <Link
          href="/registro"
          className="font-medium text-brand-700 underline underline-offset-4"
        >
          Registrate
        </Link>
        .
      </p>
    </div>
  );
}
