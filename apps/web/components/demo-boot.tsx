'use client';

import { useEffect } from 'react';
import { bootDemoClient, MOCK_ENABLED } from '@/lib/mock';

/**
 * Inicializa el modo demo del lado del cliente: siembra el estado en
 * localStorage y precarga el accountId del paciente para que el flujo público
 * no requiera un link con `?accountId=`.
 */
export function DemoBoot() {
  useEffect(() => {
    bootDemoClient();
  }, []);

  if (!MOCK_ENABLED) return null;
  return (
    <div
      aria-hidden
      className="pointer-events-none fixed bottom-3 left-1/2 z-50 -translate-x-1/2 rounded-full border border-amber-300 bg-amber-100/90 px-3 py-1 text-xs font-medium text-amber-900 shadow-sm"
    >
      Modo demo · datos simulados en tu navegador
    </div>
  );
}
