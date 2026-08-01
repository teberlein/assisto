'use client';

import { Suspense, useEffect, useState, type ReactNode } from 'react';
import { useSearchParams } from 'next/navigation';
import { useSyncExternalStore } from 'react';
import {
  getPatientAccountId,
  setPatientAccountId,
  subscribe,
} from '@/lib/storage';
import { Alert, Button, Field, Input, LoadingState } from './ui';

/**
 * El paciente llega desde un link del consultorio, que trae `?accountId=`.
 * Lo guardamos para el resto de la sesión. Si no vino por link (o se limpió el
 * storage) pedimos el identificador a mano, que es lo que necesitamos para
 * listar los profesionales de esa cuenta.
 */
export function AccountGate({
  children,
}: {
  children: (accountId: string) => ReactNode;
}) {
  return (
    <Suspense fallback={<LoadingState />}>
      <AccountGateInner>{children}</AccountGateInner>
    </Suspense>
  );
}

function AccountGateInner({
  children,
}: {
  children: (accountId: string) => ReactNode;
}) {
  const params = useSearchParams();
  const fromQuery = params.get('accountId');

  const stored = useSyncExternalStore(
    subscribe,
    () => getPatientAccountId(),
    () => null,
  );

  const [manual, setManual] = useState('');

  useEffect(() => {
    if (fromQuery && fromQuery !== stored) setPatientAccountId(fromQuery);
  }, [fromQuery, stored]);

  const accountId = fromQuery ?? stored;

  if (!accountId) {
    return (
      <div className="space-y-4">
        <Alert tone="info" title="Nos falta saber a qué consultorio querés ir">
          Normalmente llegás acá desde el link que te pasa el consultorio por
          WhatsApp, que ya trae todo cargado. Si lo tenés a mano, abrilo. Si no,
          pegá abajo el identificador de la cuenta.
        </Alert>

        <form
          className="space-y-3"
          onSubmit={(event) => {
            event.preventDefault();
            if (manual.trim()) setPatientAccountId(manual.trim());
          }}
        >
          <Field label="Identificador del consultorio">
            {({ id }) => (
              <Input
                id={id}
                value={manual}
                onChange={(e) => setManual(e.target.value)}
                placeholder="p. ej. 8f3a…"
              />
            )}
          </Field>
          <Button type="submit" disabled={!manual.trim()}>
            Continuar
          </Button>
        </form>
      </div>
    );
  }

  return <>{children(accountId)}</>;
}
