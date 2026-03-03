import { type ReactNode } from 'react';
import { useP2pPermission } from '../hooks/useP2pCanEdit';
import { useP2pStore } from '../store/p2pStore';
import type { P2pPermission } from '../types';

interface P2pGuardProps {
  permission: P2pPermission;
  children: ReactNode;
  /** Texto de tooltip nativo cuando no tiene permiso */
  tooltip?: string;
}

/**
 * Wrapper que deshabilita visualmente sus children cuando el usuario
 * no tiene el permiso P2P indicado, o la sesión está desconectada/detenida.
 * Si no hay sesión P2P activa (modo local), no bloquea nada.
 */
export function P2pGuard({ permission, children, tooltip }: P2pGuardProps) {
  const allowed = useP2pPermission(permission);
  const hostStopped = useP2pStore((s) => s.hostStopped);
  const activeSession = useP2pStore((s) => s.activeSession);

  const sessionBlocked = activeSession && (
    (hostStopped || activeSession.status === 'disconnected') &&
    activeSession.role !== 'lead_researcher'
  );

  const blocked = !allowed || sessionBlocked;

  if (!blocked) return <>{children}</>;

  const titleText = tooltip
    || (sessionBlocked ? 'Session disconnected' : 'No permission');

  return (
    <div
      className="relative"
      title={titleText}
    >
      <div className="opacity-50 pointer-events-none select-none">
        {children}
      </div>
      {/* Overlay invisible que captura clicks y muestra tooltip */}
      <div className="absolute inset-0 cursor-not-allowed" />
    </div>
  );
}
