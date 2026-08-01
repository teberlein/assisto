'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { api, errorMessage } from '@/lib/api';
import { useProSession } from '@/lib/auth';
import { Alert, Button, Field, Input } from '@/components/ui';

export function SignupForm() {
  const router = useRouter();
  const { signIn } = useProSession();
  const [form, setForm] = useState({
    accountName: '',
    fullName: '',
    email: '',
    password: '',
  });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function set<K extends keyof typeof form>(key: K, value: string) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (form.password.length < 8) {
      setError('La contraseña tiene que tener al menos 8 caracteres.');
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const result = await api.signupOwner({
        accountName: form.accountName.trim(),
        fullName: form.fullName.trim(),
        email: form.email.trim(),
        password: form.password,
      });
      signIn({ accessToken: result.accessToken, user: result.user });
      router.replace('/equipo');
    } catch (err) {
      setError(errorMessage(err));
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="mt-6 space-y-4" noValidate>
      {error && <Alert tone="error">{error}</Alert>}

      <Field label="Nombre del consultorio o cuenta" required>
        {({ id }) => (
          <Input
            id={id}
            required
            value={form.accountName}
            onChange={(e) => set('accountName', e.target.value)}
            placeholder="Consultorio Belgrano"
          />
        )}
      </Field>

      <Field label="Tu nombre y apellido" required>
        {({ id }) => (
          <Input
            id={id}
            required
            autoComplete="name"
            value={form.fullName}
            onChange={(e) => set('fullName', e.target.value)}
            placeholder="Ana Pérez"
          />
        )}
      </Field>

      <Field label="Email" required>
        {({ id }) => (
          <Input
            id={id}
            type="email"
            required
            autoComplete="email"
            value={form.email}
            onChange={(e) => set('email', e.target.value)}
            placeholder="ana@consultorio.com"
          />
        )}
      </Field>

      <Field
        label="Contraseña"
        required
        hint="Mínimo 8 caracteres."
      >
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
        Crear cuenta
      </Button>
    </form>
  );
}
