import { useTranslation } from 'react-i18next';
import { Badge } from '@/components/ui/badge';
import type { PeerInfo, PeerRole } from '../types';

interface PeerListProps {
  peers: PeerInfo[];
  myNodeId?: string;
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

export function PeerList({ peers, myNodeId }: PeerListProps) {
  const { t } = useTranslation();

  if (peers.length === 0) {
    return (
      <p className="text-sm text-muted-foreground text-center py-2">
        {t('p2p.noPeersYet')}
      </p>
    );
  }

  return (
    <div className="space-y-2">
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
