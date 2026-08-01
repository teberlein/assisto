'use client';

import { useEffect, useState } from 'react';
import { api, errorMessage } from '@/lib/api';
import { useAsync } from '@/lib/useAsync';
import {
  Alert,
  Button,
  Card,
  CardHeader,
  ErrorState,
  Field,
  Input,
  LoadingState,
  Select,
} from '@/components/ui';
import { PageHeader } from '../professional-gate';
import { usePanel } from '../panel-context';
import type { Account } from '@/types/api';

const TIMEZONES = [
  'America/Argentina/Buenos_Aires',
  'America/Argentina/Cordoba',
  'America/Argentina/Mendoza',
  'America/Argentina/Salta',
  'America/Argentina/Ushuaia',
  'America/Montevideo',
  'America/Santiago',
  'America/Sao_Paulo',
];

export default function CuentaPage() {
  const { isOwner } = usePanel();
  const { data, loading, error, reload, setData } = useAsync<Account>(
    () => api.getAccount(),
    [],
  );

  if (!isOwner) {
    return (
      <Alert tone="warning" title="Sección sólo para el dueño de la cuenta">
        Los datos de facturación y el número de WhatsApp los administra el
        dueño.
      </Alert>
    );
  }

  return (
    <>
      <PageHeader
        title="Cuenta"
        description="Datos generales de la cuenta. La zona horaria se usa para calcular horarios y las ventanas de notificación del motor."
      />

      <Card className="max-w-2xl">
        <CardHeader title="Datos de la cuenta" />
        {loading && <LoadingState label="Cargando la cuenta…" />}
        {!loading && error && <ErrorState message={error} onRetry={reload} />}
        {!loading && !error && data && (
          <AccountForm account={data} onSaved={(next) => setData(next)} />
        )}
      </Card>
    </>
  );
}

function AccountForm({
  account,
  onSaved,
}: {
  account: Account;
  onSaved: (account: Account) => void;
}) {
  const [name, setName] = useState(account.name);
  const [timezone, setTimezone] = useState(account.timezone);
  const [whatsappNumber, setWhatsappNumber] = useState(
    account.whatsappNumber ?? '',
  );
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState(false);

  useEffect(() => {
    setName(account.name);
    setTimezone(account.timezone);
    setWhatsappNumber(account.whatsappNumber ?? '');
  }, [account]);

  const options = TIMEZONES.includes(timezone)
    ? TIMEZONES
    : [timezone, ...TIMEZONES];

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    setOk(false);
    setSubmitting(true);
    setError(null);
    try {
      const updated = await api.updateAccount({
        name: name.trim(),
        timezone,
        whatsappNumber: whatsappNumber.trim() || null,
      });
      onSaved(updated ?? { ...account, name, timezone, whatsappNumber });
      setOk(true);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4 px-4 py-4 sm:px-5" noValidate>
      {error && <Alert tone="error">{error}</Alert>}
      {ok && <Alert tone="success">Cambios guardados.</Alert>}

      <Field label="Nombre de la cuenta" required>
        {({ id }) => (
          <Input
            id={id}
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        )}
      </Field>

      <Field
        label="Zona horaria"
        required
        hint="Todos los horarios de la cuenta se interpretan en esta zona."
      >
        {({ id, describedBy }) => (
          <Select
            id={id}
            aria-describedby={describedBy}
            value={timezone}
            onChange={(e) => setTimezone(e.target.value)}
          >
            {options.map((tz) => (
              <option key={tz} value={tz}>
                {tz}
              </option>
            ))}
          </Select>
        )}
      </Field>

      <Field
        label="Número de WhatsApp"
        hint="Un único número por cuenta, en formato internacional. Es el que usan los pacientes para escribir al bot."
      >
        {({ id, describedBy }) => (
          <Input
            id={id}
            aria-describedby={describedBy}
            type="tel"
            inputMode="tel"
            value={whatsappNumber}
            onChange={(e) => setWhatsappNumber(e.target.value)}
            placeholder="+5491122334455"
          />
        )}
      </Field>

      <div className="rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-600">
        ID de la cuenta:{' '}
        <code className="font-mono text-slate-800">{account.id}</code>
        <br />
        Los pacientes pueden reservar desde{' '}
        <code className="font-mono text-slate-800">
          /reservar?accountId={account.id}
        </code>
      </div>

      <Button type="submit" loading={submitting}>
        Guardar cambios
      </Button>
    </form>
  );
}
