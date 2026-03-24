import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useParams, useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { useP2pStore } from '../store/p2pStore';
import { p2pService } from '../services/p2pService';
import { TeamDashboard } from './TeamDashboard';
import { TeamMembersList } from './TeamMembersList';
import { WorkDistributionPanel } from './WorkDistributionPanel';
import { PendingApprovalsPanel } from './PendingApprovalsPanel';
import { SessionSettingsPanel } from './SessionSettingsPanel';

export function TeamView() {
  const { t } = useTranslation();
  const { projectId } = useParams<{ projectId: string }>();
  const navigate = useNavigate();
  const session = useP2pStore(s => projectId ? s.sessions[projectId] ?? null : null);
  const { setWorkStats } = useP2pStore();

  // Refresh stats periodically
  useEffect(() => {
    if (!session || !projectId) return;

    const loadStats = () => {
      p2pService.getWorkStats(projectId).then(stats => setWorkStats(projectId, stats)).catch(() => {});
    };

    loadStats();
    const interval = setInterval(loadStats, 10000);
    return () => clearInterval(interval);
  }, [session?.sessionId, projectId]);

  if (!session) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-4">
        <i className="fas fa-users-slash text-4xl text-muted-foreground" />
        <p className="text-muted-foreground">{t('p2p.noActiveSession')}</p>
        <Button variant="outline" onClick={() => navigate(`/projects/${projectId}`)}>
          <i className="fas fa-arrow-left mr-2" />
          {t('p2p.backToProject')}
        </Button>
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-4xl mx-auto p-6 space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => navigate(`/projects/${projectId}`)}
            >
              <i className="fas fa-arrow-left mr-2" />
              {t('p2p.backToProject')}
            </Button>
            <div className="h-5 w-px bg-border" />
            <h1 className="text-lg font-bold flex items-center gap-2">
              <i className="fas fa-users text-violet-500" />
              {t('p2p.teamView')}
            </h1>
          </div>
          <div className="text-xs text-muted-foreground">
            {session.projectName}
          </div>
        </div>

        {/* Dashboard stats */}
        <TeamDashboard />

        {/* Two column layout */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Left column */}
          <div className="space-y-6">
            <div className="rounded-lg border bg-card p-4">
              <TeamMembersList />
            </div>
            <div className="rounded-lg border bg-card p-4">
              <PendingApprovalsPanel />
            </div>
          </div>

          {/* Right column */}
          <div className="space-y-6">
            <div className="rounded-lg border bg-card p-4">
              <WorkDistributionPanel />
            </div>
            <div className="rounded-lg border bg-card p-4">
              <SessionSettingsPanel />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
