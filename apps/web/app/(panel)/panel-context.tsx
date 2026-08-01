'use client';

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  type ReactNode,
} from 'react';
import { api } from '@/lib/api';
import { useActiveProfessionalId, useProSession } from '@/lib/auth';
import { useAsync } from '@/lib/useAsync';
import type { AuthUser, Professional } from '@/types/api';

interface PanelContextValue {
  user: AuthUser;
  isOwner: boolean;
  professionals: Professional[];
  activeProfessional: Professional | null;
  setActiveProfessionalId: (id: string | null) => void;
  loadingProfessionals: boolean;
  professionalsError: string | null;
  reloadProfessionals: () => void;
}

const PanelContext = createContext<PanelContextValue | null>(null);

export function usePanel(): PanelContextValue {
  const value = useContext(PanelContext);
  if (!value) {
    throw new Error('usePanel debe usarse dentro de <PanelProvider>');
  }
  return value;
}

export function PanelProvider({
  user,
  children,
}: {
  user: AuthUser;
  children: ReactNode;
}) {
  const { isOwner } = useProSession();
  const [activeId, setActiveId] = useActiveProfessionalId();

  const {
    data,
    loading,
    error,
    reload,
  } = useAsync<Professional[]>(() => api.listProfessionals(), [user.id]);

  const professionals = useMemo(() => data ?? [], [data]);

  // Si no hay profesional elegido (o el elegido ya no existe), tomamos el primero.
  useEffect(() => {
    if (professionals.length === 0) return;
    const stillValid = professionals.some((p) => p.id === activeId);
    if (!stillValid) setActiveId(professionals[0].id);
  }, [professionals, activeId, setActiveId]);

  const activeProfessional =
    professionals.find((p) => p.id === activeId) ?? professionals[0] ?? null;

  const value: PanelContextValue = {
    user,
    isOwner,
    professionals,
    activeProfessional,
    setActiveProfessionalId: setActiveId,
    loadingProfessionals: loading,
    professionalsError: error,
    reloadProfessionals: reload,
  };

  return (
    <PanelContext.Provider value={value}>{children}</PanelContext.Provider>
  );
}
