import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { Badge } from '@/components/ui/badge';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { useP2pStore } from '../store/p2pStore';
import { useUIStore } from '../../core/store/uiStore';

export function P2pStatusIndicator() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const currentProjectId = useUIStore(s => s.currentProjectId);
  const session = useP2pStore(s => currentProjectId ? s.sessions[currentProjectId] ?? null : null);
  const peers = useP2pStore(s => currentProjectId ? s.peersByProject[currentProjectId] ?? [] : []);

  if (!session) return null;

  const statusColor = session.status === 'connected'
    ? 'bg-green-500'
    : session.status === 'syncing' || session.status === 'connecting'
    ? 'bg-yellow-500'
    : 'bg-red-500';

  const handleClick = () => {
    if (session.projectId) {
      navigate(`/projects/${session.projectId}/team`);
    }
  };

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Badge
          variant="outline"
          className="gap-1.5 cursor-pointer hover:bg-white/10 transition-colors"
          onClick={handleClick}
        >
          <span className={`h-2 w-2 rounded-full ${statusColor} animate-pulse`} />
          <i className="fas fa-people-arrows text-xs text-violet-500" />
          <span className="text-xs">{peers.length + 1}</span>
        </Badge>
      </TooltipTrigger>
      <TooltipContent>
        <p>{t('p2p.activeSession')}</p>
        <p className="text-xs text-muted-foreground">
          {t('p2p.connectedPeers')}: {peers.length + 1} · {t(`p2p.status.${session.status}`)}
        </p>
        <p className="text-xs text-muted-foreground mt-1">{t('p2p.clickToManageTeam')}</p>
      </TooltipContent>
    </Tooltip>
  );
}
