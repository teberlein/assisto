'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { errorMessage } from './api';

export interface AsyncState<T> {
  data: T | null;
  loading: boolean;
  error: string | null;
  /** Vuelve a ejecutar la carga. */
  reload: () => void;
  setData: (updater: T | ((prev: T | null) => T | null) | null) => void;
}

/**
 * Carga de datos del lado del cliente con estados de loading/error explícitos.
 * `enabled: false` mantiene la carga en pausa (ej.: falta elegir profesional).
 */
export function useAsync<T>(
  loader: () => Promise<T>,
  deps: readonly unknown[],
  enabled = true,
): AsyncState<T> {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(enabled);
  const [error, setError] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0);

  const loaderRef = useRef(loader);
  loaderRef.current = loader;

  useEffect(() => {
    if (!enabled) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);

    loaderRef
      .current()
      .then((result) => {
        if (!cancelled) setData(result);
      })
      .catch((err) => {
        if (!cancelled) setError(errorMessage(err));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, enabled, nonce]);

  const reload = useCallback(() => setNonce((n) => n + 1), []);

  const update = useCallback(
    (updater: T | ((prev: T | null) => T | null) | null) => {
      setData((prev) =>
        typeof updater === 'function'
          ? (updater as (p: T | null) => T | null)(prev)
          : updater,
      );
    },
    [],
  );

  return { data, loading, error, reload, setData: update };
}
