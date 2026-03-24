import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useParams } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useP2pStore } from '../store/p2pStore';
import { p2pService } from '../services/p2pService';
import { canManage } from '../hooks/useP2pCanEdit';
import type { PeerWorkStats } from '../types';

export function WorkDistributionPanel() {
  const { t } = useTranslation();
  const { projectId } = useParams<{ projectId: string }>();
  const session = useP2pStore(s => projectId ? s.sessions[projectId] ?? null : null);
  const distribution = useP2pStore(s => projectId ? s.distributionByProject[projectId] ?? null : null);
  const { setDistribution } = useP2pStore();
  const [stats, setStats] = useState<PeerWorkStats[]>([]);
  const [loading, setLoading] = useState(false);
  const [adjustTarget, setAdjustTarget] = useState<string | null>(null);

  const isHost = session ? canManage(session.role) : false;

  // Cargar stats cuando hay distribución
  useEffect(() => {
    if (distribution && projectId) {
      p2pService.getWorkStats(projectId).then(setStats).catch(() => {});
    } else {
      setStats([]);
    }
  }, [distribution?.version, projectId]);

  const handleDistribute = async () => {
    if (!projectId) return;
    setLoading(true);
    try {
      const dist = await p2pService.distributeWork(projectId);
      setDistribution(projectId, dist);
    } catch (err) {
      console.error('Error distributing work:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleMoveItems = async (itemIds: string[], itemType: 'video' | 'image', targetNodeId: string) => {
    if (!projectId) return;
    try {
      const dist = await p2pService.adjustAssignment(projectId, itemIds, itemType, targetNodeId);
      setDistribution(projectId, dist);
      setAdjustTarget(null);
    } catch (err) {
      console.error('Error adjusting assignment:', err);
    }
  };

  if (!session || !projectId) return null;

  // Sin distribución
  if (!distribution) {
    return (
      <div className="border rounded-lg p-3 space-y-2">
        <p className="text-xs font-medium flex items-center gap-1.5">
          <i className="fas fa-tasks text-muted-foreground" />
          {t('p2p.distributeWork')}
        </p>
        <p className="text-xs text-muted-foreground">{t('p2p.noDistributionDesc')}</p>
        {isHost && (
          <Button size="sm" className="w-full" onClick={handleDistribute} disabled={loading}>
            {loading ? <i className="fas fa-spinner fa-spin mr-2" /> : <i className="fas fa-random mr-2" />}
            {t('p2p.distributeWork')}
          </Button>
        )}
      </div>
    );
  }

  // Con distribución
  const myNodeId = session.myNodeId;
  const availablePeers = distribution.assignments.filter(a => a.nodeId !== adjustTarget);

  return (
    <div className="border rounded-lg p-3 space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-xs font-medium flex items-center gap-1.5">
          <i className="fas fa-tasks text-muted-foreground" />
          {t('p2p.distributeWork')}
        </p>
        <span className="text-[10px] text-muted-foreground">v{distribution.version}</span>
      </div>

      {/* Assignments */}
      <div className="space-y-2">
        {distribution.assignments.map((assignment) => {
          const stat = stats.find(s => s.nodeId === assignment.nodeId);
          const isMe = assignment.nodeId === myNodeId;
          const totalItems = assignment.videoIds.length + assignment.imageIds.length;

          return (
            <div
              key={assignment.nodeId}
              className={`rounded border p-2 space-y-1.5 ${isMe ? 'border-blue-500/50 bg-blue-500/5' : ''}`}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                  <span className="text-xs font-medium">
                    {assignment.displayName}
                  </span>
                  {isMe && (
                    <span className="text-[9px] bg-blue-500 text-white px-1 rounded">{t('p2p.you')}</span>
                  )}
                </div>
                <span className="text-[10px] text-muted-foreground">
                  {totalItems} items
                </span>
              </div>

              <div className="flex gap-3 text-[10px] text-muted-foreground">
                {assignment.videoIds.length > 0 && (
                  <span><i className="fas fa-video mr-0.5" />{assignment.videoIds.length} {t('p2p.videosAssigned')}</span>
                )}
                {assignment.imageIds.length > 0 && (
                  <span><i className="fas fa-image mr-0.5" />{assignment.imageIds.length} {t('p2p.imagesAssigned')}</span>
                )}
              </div>

              {stat && (
                <div className="space-y-1">
                  <Progress value={stat.progressPercent} className="h-1.5" />
                  <p className="text-[10px] text-muted-foreground text-right">
                    {stat.progressPercent}% {t('p2p.progress')}
                  </p>
                </div>
              )}

              {/* Ajustar: mover todos los items de este peer a otro */}
              {isHost && adjustTarget === assignment.nodeId && (
                <div className="pt-1 space-y-1">
                  <p className="text-[10px] font-medium">{t('p2p.selectTarget')}</p>
                  <Select onValueChange={(targetId) => {
                    const allVideos = assignment.videoIds;
                    const allImages = assignment.imageIds;
                    if (allVideos.length > 0) handleMoveItems(allVideos, 'video', targetId);
                    if (allImages.length > 0) handleMoveItems(allImages, 'image', targetId);
                  }}>
                    <SelectTrigger className="h-7 text-xs">
                      <SelectValue placeholder={t('p2p.selectTarget')} />
                    </SelectTrigger>
                    <SelectContent>
                      {availablePeers
                        .filter(p => p.nodeId !== assignment.nodeId)
                        .map(p => (
                          <SelectItem key={p.nodeId} value={p.nodeId}>
                            {p.displayName}
                          </SelectItem>
                        ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              {isHost && totalItems > 0 && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 text-[10px] w-full"
                  onClick={() => setAdjustTarget(adjustTarget === assignment.nodeId ? null : assignment.nodeId)}
                >
                  <i className="fas fa-exchange-alt mr-1" />
                  {t('p2p.moveItems')}
                </Button>
              )}
            </div>
          );
        })}
      </div>

      {/* Botón redistribuir */}
      {isHost && (
        <Button variant="outline" size="sm" className="w-full" onClick={handleDistribute} disabled={loading}>
          {loading ? <i className="fas fa-spinner fa-spin mr-2" /> : <i className="fas fa-redo mr-2" />}
          {t('p2p.redistribute')}
        </Button>
      )}
    </div>
  );
}
