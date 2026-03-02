import { useTranslation } from 'react-i18next';
import { Badge } from '@/components/ui/badge';
import type { PeerInfo } from '../types';

interface PeerListProps {
  peers: PeerInfo[];
  myNodeId?: string;
}

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
      {peers.map((peer) => (
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
          <Badge variant={peer.role === 'host' ? 'default' : 'secondary'} className="text-xs">
            {peer.role === 'host' ? t('p2p.host') : t('p2p.collaborator')}
          </Badge>
        </div>
      ))}
    </div>
  );
}
