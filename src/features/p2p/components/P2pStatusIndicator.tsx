import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { Badge } from '@/components/ui/badge';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { useP2pStore } from '../store/p2pStore';

export function P2pStatusIndicator() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { activeSession, peers } = useP2pStore();

  if (!activeSession) return null;

  const statusColor = activeSession.status === 'connected'
    ? 'bg-green-500'
    : activeSession.status === 'syncing' || activeSession.status === 'connecting'
    ? 'bg-yellow-500'
    : 'bg-red-500';

  const handleClick = () => {
    if (activeSession.projectId) {
      navigate(`/projects/${activeSession.projectId}/team`);
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
          {t('p2p.connectedPeers')}: {peers.length + 1} · {t(`p2p.status.${activeSession.status}`)}
        </p>
        <p className="text-xs text-muted-foreground mt-1">{t('p2p.clickToManageTeam')}</p>
      </TooltipContent>
    </Tooltip>
  );
}
