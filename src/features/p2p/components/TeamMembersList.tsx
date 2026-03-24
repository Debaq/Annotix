import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useParams } from 'react-router-dom';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useP2pStore } from '../store/p2pStore';
import { p2pService } from '../services/p2pService';
import { canManage } from '../hooks/useP2pCanEdit';
import type { PeerRole, PeerWorkStats } from '../types';

const EMPTY_PEERS: never[] = [];
const EMPTY_STATS: never[] = [];

const roleIcons: Record<PeerRole, string> = {
  lead_researcher: 'fa-flask',
  annotator: 'fa-pen',
  data_curator: 'fa-database',
};

const roleColors: Record<PeerRole, string> = {
  lead_researcher: 'bg-violet-500/10 text-violet-600 border-violet-500/30',
  annotator: 'bg-blue-500/10 text-blue-600 border-blue-500/30',
  data_curator: 'bg-amber-500/10 text-amber-600 border-amber-500/30',
};

export function TeamMembersList() {
  const { t } = useTranslation();
  const { projectId } = useParams<{ projectId: string }>();
  const session = useP2pStore(s => projectId ? s.sessions[projectId] ?? null : null);
  const peers = useP2pStore(s => projectId ? s.peersByProject[projectId] ?? EMPTY_PEERS : EMPTY_PEERS);
  const workStats = useP2pStore(s => projectId ? s.workStatsByProject[projectId] ?? EMPTY_STATS : EMPTY_STATS);
  const [changingRole, setChangingRole] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  if (!session || !projectId) return null;

  const isManager = canManage(session.role);

  // Build combined list: self + peers
  const allMembers = [
    {
      nodeId: session.myNodeId,
      displayName: session.myDisplayName,
      role: session.role,
      online: true,
      isMe: true,
    },
    ...peers.map((p) => ({
      nodeId: p.nodeId,
      displayName: p.displayName,
      role: p.role,
      online: p.online,
      isMe: false,
    })),
  ];

  const handleChangeRole = async (nodeId: string, newRole: PeerRole) => {
    setLoading(true);
    try {
      await p2pService.updatePeerRole(projectId, nodeId, newRole);
      setChangingRole(null);
    } catch (err) {
      console.error('Error changing role:', err);
    } finally {
      setLoading(false);
    }
  };

  const getStats = (nodeId: string): PeerWorkStats | undefined =>
    workStats.find((s) => s.nodeId === nodeId);

  return (
    <div className="space-y-2">
      <h3 className="text-sm font-semibold flex items-center gap-2">
        <i className="fas fa-users text-muted-foreground" />
        {t('p2p.teamMembers')} ({allMembers.length})
      </h3>
      <div className="space-y-2">
        {allMembers.map((member) => {
          const stat = getStats(member.nodeId);
          const icon = roleIcons[member.role] || 'fa-user';
          const colorClass = roleColors[member.role] || '';

          return (
            <div
              key={member.nodeId}
              className={`rounded-lg border p-3 space-y-2 ${member.isMe ? 'border-blue-500/50 bg-blue-500/5' : ''}`}
            >
              <div className="flex items-center gap-3">
                <div className={`h-2.5 w-2.5 rounded-full ${member.online ? 'bg-green-500' : 'bg-gray-400'}`} />
                <span className="flex-1 text-sm font-medium truncate">
                  {member.displayName}
                  {member.isMe && (
                    <span className="text-xs text-muted-foreground ml-1">({t('p2p.you')})</span>
                  )}
                </span>
                <Badge variant="outline" className={`text-xs gap-1 ${colorClass}`}>
                  <i className={`fas ${icon} text-[10px]`} />
                  {t(`p2p.role_${member.role}`)}
                </Badge>
              </div>

              {stat && (
                <div className="space-y-1">
                  <Progress value={stat.progressPercent} className="h-1.5" />
                  <div className="flex justify-between text-[10px] text-muted-foreground">
                    <span>
                      {stat.imagesCompleted + stat.videosCompleted} / {stat.imagesAssigned + stat.videosAssigned} items
                    </span>
                    <span>{stat.progressPercent}%</span>
                  </div>
                </div>
              )}

              {/* Change role controls (only for manager, not for self) */}
              {isManager && !member.isMe && (
                <>
                  {changingRole === member.nodeId ? (
                    <div className="flex items-center gap-2 pt-1">
                      <Select
                        onValueChange={(value) => handleChangeRole(member.nodeId, value as PeerRole)}
                        disabled={loading}
                      >
                        <SelectTrigger className="h-7 text-xs flex-1">
                          <SelectValue placeholder={t('p2p.changeRole')} />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="lead_researcher">{t('p2p.role_lead_researcher')}</SelectItem>
                          <SelectItem value="annotator">{t('p2p.role_annotator')}</SelectItem>
                          <SelectItem value="data_curator">{t('p2p.role_data_curator')}</SelectItem>
                        </SelectContent>
                      </Select>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 text-xs"
                        onClick={() => setChangingRole(null)}
                      >
                        {t('common.cancel')}
                      </Button>
                    </div>
                  ) : (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-6 text-[10px] w-full"
                      onClick={() => setChangingRole(member.nodeId)}
                    >
                      <i className="fas fa-user-edit mr-1" />
                      {t('p2p.changeRole')}
                    </Button>
                  )}
                </>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
