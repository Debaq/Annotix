import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useP2pStore } from '../store/p2pStore';
import { p2pService } from '../services/p2pService';
import { canManage } from '../hooks/useP2pCanEdit';

export function PendingApprovalsPanel() {
  const { t } = useTranslation();
  const { activeSession, pendingApprovals, setPendingApprovals, removePendingApproval } = useP2pStore();
  const [loading, setLoading] = useState<string | null>(null);

  const isManager = activeSession ? canManage(activeSession.role) : false;
  const requireApproval = activeSession?.rules.requireDataApproval;

  // Load pending approvals on mount
  useEffect(() => {
    if (activeSession && requireApproval) {
      p2pService.listPendingApprovals()
        .then((approvals) => setPendingApprovals(approvals.filter(a => a.status === 'pending')))
        .catch(() => {});
    }
  }, [activeSession?.sessionId, requireApproval]);

  if (!activeSession || !requireApproval) return null;

  const pending = pendingApprovals.filter(a => a.status === 'pending');
  if (pending.length === 0 && !isManager) return null;

  const handleApprove = async (itemId: string) => {
    setLoading(itemId);
    try {
      await p2pService.approveData(itemId);
      removePendingApproval(itemId);
    } catch (err) {
      console.error('Error approving data:', err);
    } finally {
      setLoading(null);
    }
  };

  const handleReject = async (itemId: string) => {
    setLoading(itemId);
    try {
      await p2pService.rejectData(itemId);
      removePendingApproval(itemId);
    } catch (err) {
      console.error('Error rejecting data:', err);
    } finally {
      setLoading(null);
    }
  };

  return (
    <div className="space-y-2">
      <h3 className="text-sm font-semibold flex items-center gap-2">
        <i className="fas fa-clipboard-check text-muted-foreground" />
        {t('p2p.pendingApprovals')}
        {pending.length > 0 && (
          <Badge variant="secondary" className="text-[10px] h-5">{pending.length}</Badge>
        )}
      </h3>

      {pending.length === 0 ? (
        <p className="text-xs text-muted-foreground text-center py-3">
          {t('p2p.noPendingApprovals')}
        </p>
      ) : (
        <div className="space-y-2">
          {pending.map((approval) => (
            <div key={approval.itemId} className="rounded border p-2 space-y-1.5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <i className={`fas ${approval.itemType === 'video' ? 'fa-video' : 'fa-image'} text-xs text-muted-foreground`} />
                  <span className="text-xs font-medium truncate">{approval.itemId.slice(0, 12)}...</span>
                </div>
                <Badge variant="outline" className="text-[10px] bg-amber-500/10 text-amber-600 border-amber-500/30">
                  {t('p2p.pending')}
                </Badge>
              </div>
              <p className="text-[10px] text-muted-foreground">
                {t('p2p.submittedBy')}: {approval.submittedByName}
              </p>
              {isManager && (
                <div className="flex gap-1.5 pt-1">
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-6 text-[10px] flex-1 text-green-600 hover:bg-green-500/10"
                    onClick={() => handleApprove(approval.itemId)}
                    disabled={loading === approval.itemId}
                  >
                    <i className="fas fa-check mr-1" />
                    {t('p2p.approve')}
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-6 text-[10px] flex-1 text-red-600 hover:bg-red-500/10"
                    onClick={() => handleReject(approval.itemId)}
                    disabled={loading === approval.itemId}
                  >
                    <i className="fas fa-times mr-1" />
                    {t('p2p.reject')}
                  </Button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
