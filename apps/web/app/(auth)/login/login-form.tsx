'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api, errorMessage } from '@/lib/api';
import { useProSession } from '@/lib/auth';
import { Alert, Button, Field, Input } from '@/components/ui';

export function LoginForm() {
  const router = useRouter();
  const { session, ready, signIn } = useProSession();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (ready && session) router.replace('/agenda');
  }, [ready, session, router]);

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const result = await api.login({ email: email.trim(), password });
      signIn({ accessToken: result.accessToken, user: result.user });
      router.replace('/agenda');
    } catch (err) {
      setError(errorMessage(err));
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="mt-6 space-y-4" noValidate>
      {error && <Alert tone="error">{error}</Alert>}
      <Alert tone="info" title="Demo">
        Usá <strong>demo@asissto.dev</strong> con contraseña <strong>demo1234</strong>.
      </Alert>

      <Field label="Email" required>
        {({ id, describedBy }) => (
          <Input
            id={id}
            aria-describedby={describedBy}
            type="email"
            name="email"
            autoComplete="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="vos@consultorio.com"
          />
        )}
      </Field>

      <Field label="Contraseña" required>
        {({ id, describedBy }) => (
          <Input
            id={id}
            aria-describedby={describedBy}
            type="password"
            name="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        )}
      </Field>

      <Button type="submit" fullWidth loading={submitting}>
        Ingresar
      </Button>
    </form>
  );
}
