import { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Header } from './Header';
import { useP2pStore } from '@/features/p2p/store/p2pStore';
import { useUIStore } from '../store/uiStore';

interface AppLayoutProps {
  children: ReactNode;
}

export function AppLayout({ children }: AppLayoutProps) {
  const { t } = useTranslation();
  const currentProjectId = useUIStore(s => s.currentProjectId);
  const session = useP2pStore(s => currentProjectId ? s.sessions[currentProjectId] ?? null : null);
  const hostStopped = useP2pStore(s => currentProjectId ? s.hostStoppedByProject[currentProjectId] ?? false : false);

  const showDisconnectedBanner = session && (
    hostStopped || session.status === 'disconnected'
  ) && session.role !== 'lead_researcher';

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <Header />
      {showDisconnectedBanner && (
        <div className="flex items-center justify-center gap-2 bg-amber-500 px-4 py-1.5 text-sm font-medium text-white">
          <i className="fas fa-exclamation-triangle"></i>
          {hostStopped
            ? t('p2p.hostStoppedBanner', 'The host has stopped sharing. The project is now read-only.')
            : t('p2p.disconnectedBanner', 'Disconnected from the P2P session. The project is read-only.')}
        </div>
      )}
      <main className="flex-1 overflow-hidden">
        {children}
      </main>
    </div>
  );
}
