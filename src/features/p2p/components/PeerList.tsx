import { useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { p2pService } from '../services/p2pService';
import { useP2pStore } from '../store/p2pStore';
import type { PeerInfo, PeerRole } from '../types';

interface PeerListProps {
  peers: PeerInfo[];
  myNodeId?: string;
  projectId?: string;
}

const roleIcons: Record<PeerRole, string> = {
  lead_researcher: 'fa-flask',
  annotator: 'fa-pen',
  data_curator: 'fa-database',
};

const roleBadgeVariant: Record<PeerRole, 'default' | 'secondary' | 'outline'> = {
  lead_researcher: 'default',
  annotator: 'secondary',
  data_curator: 'outline',
};

export function PeerList({ peers, myNodeId, projectId }: PeerListProps) {
  const { t } = useTranslation();
  const setPeers = useP2pStore(s => s.setPeers);
  const [refreshing, setRefreshing] = useState(false);

  const handleRefresh = useCallback(async () => {
    if (!projectId || refreshing) return;
    setRefreshing(true);
    try {
      const freshPeers = await p2pService.listPeers(projectId);
      setPeers(projectId, freshPeers);
    } catch (err) {
      console.error('Error refreshing peers:', err);
    } finally {
      setRefreshing(false);
    }
  }, [projectId, refreshing, setPeers]);

  if (peers.length === 0) {
    return (
      <div className="text-center py-2 space-y-2">
        <p className="text-sm text-muted-foreground">
          {t('p2p.noPeersYet')}
        </p>
        {projectId && (
          <Button variant="ghost" size="sm" onClick={handleRefresh} disabled={refreshing} className="h-7 text-xs">
            <i className={`fas fa-sync-alt mr-1 ${refreshing ? 'animate-spin' : ''}`} />
            {t('common.refresh', 'Refresh')}
          </Button>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {projectId && (
        <div className="flex justify-end">
          <Button variant="ghost" size="sm" onClick={handleRefresh} disabled={refreshing} className="h-7 w-7 p-0">
            <i className={`fas fa-sync-alt text-xs ${refreshing ? 'animate-spin' : ''}`} />
          </Button>
        </div>
      )}
      {peers.map((peer) => {
        const icon = roleIcons[peer.role] || 'fa-user';
        const variant = roleBadgeVariant[peer.role] || 'secondary';

        return (
          <div
            key={peer.nodeId}
            className="flex items-center gap-3 rounded-lg border p-2 px-3"
          >
            <div className={`h-2 w-2 rounded-full ${peer.online ? 'bg-green-500' : 'bg-gray-400'}`} />
            <span className="flex-1 text-sm font-medium truncate">
              {peer.displayName}
              {peer.nodeId === myNodeId && (
                <span className="text-xs text-muted-foreground ml-1">({t('p2p.you')})</span>
              )}
            </span>
            <Badge variant={variant} className="text-xs gap-1">
              <i className={`fas ${icon} text-[10px]`} />
              {t(`p2p.role_${peer.role}`)}
            </Badge>
          </div>
        );
      })}
    </div>
  );
}
