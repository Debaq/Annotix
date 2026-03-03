import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { useP2pStore } from '../store/p2pStore';
import { p2pService } from '../services/p2pService';
import { PeerList } from './PeerList';
import { WorkDistributionPanel } from './WorkDistributionPanel';
import { canManage } from '../hooks/useP2pCanEdit';
import type { SessionRules } from '../types';

export function P2pSessionPanel() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { activeSession, peers, reset, updateRules } = useP2pStore();
  const [leaving, setLeaving] = useState(false);
  const [pausing, setPausing] = useState(false);
  const [savingRules, setSavingRules] = useState(false);

  if (!activeSession) return null;

  const isManager = canManage(activeSession.role);
  const rules = activeSession.rules;

  const handlePause = async () => {
    setPausing(true);
    try {
      await p2pService.pauseSession();
      reset();
    } catch (err) {
      console.error('Error pausing session:', err);
    } finally {
      setPausing(false);
    }
  };

  const handleLeave = async () => {
    setLeaving(true);
    try {
      await p2pService.leaveSession();
      reset();
    } catch (err) {
      console.error('Error leaving session:', err);
    } finally {
      setLeaving(false);
    }
  };

  const handleUpdateRule = async (key: keyof SessionRules, value: boolean) => {
    const newRules: SessionRules = { ...rules, [key]: value };
    setSavingRules(true);
    try {
      await p2pService.updateRules(newRules);
      updateRules(newRules);
    } catch (err) {
      console.error('Error updating rules:', err);
    } finally {
      setSavingRules(false);
    }
  };

  return (
    <div className="border rounded-lg p-4 space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          {isManager
            ? <i className="fas fa-flask text-violet-500" />
            : <i className="fas fa-people-arrows text-violet-500" />
          }
          <span className="font-semibold text-sm">{t('p2p.activeSession')}</span>
        </div>
        <Badge variant={activeSession.status === 'connected' ? 'default' : 'secondary'}>
          {t(`p2p.status.${activeSession.status}`)}
        </Badge>
      </div>

      <div className="text-xs text-muted-foreground space-y-1">
        <div className="flex justify-between">
          <span>{t('p2p.role')}:</span>
          <span className="font-medium">
            {t(`p2p.role_${activeSession.role}`)}
          </span>
        </div>
        <div className="flex justify-between">
          <span>{t('p2p.lockMode')}:</span>
          <span className="font-medium">
            {rules.lockMode === 'individual' ? t('p2p.lockIndividual') : t('p2p.lockBatch')}
          </span>
        </div>
      </div>

      {/* Share code (only manager) */}
      {isManager && activeSession.shareCode && (
        <div className="rounded border bg-muted/50 p-2 text-center">
          <p className="text-xs text-muted-foreground">{t('p2p.shareCodeLabel')}</p>
          <p className="font-mono text-xs font-bold select-all break-all">{activeSession.shareCode}</p>
          <Button
            variant="ghost"
            size="sm"
            className="mt-1 h-6 text-xs"
            onClick={() => navigator.clipboard.writeText(activeSession.shareCode)}
          >
            <i className="fas fa-copy mr-1" />
            {t('p2p.copyCode')}
          </Button>
        </div>
      )}

      {/* Rules (editable only by manager, visible for all) */}
      <div>
        <p className="text-xs font-medium mb-2">{t('p2p.collaboratorPermissions')}</p>
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <Checkbox
              checked={rules.canUpload}
              onCheckedChange={(v) => handleUpdateRule('canUpload', v === true)}
              disabled={!isManager || savingRules}
            />
            <Label className="text-xs cursor-pointer">{t('p2p.permUpload')}</Label>
          </div>
          <div className="flex items-center gap-2">
            <Checkbox
              checked={rules.canEditClasses}
              onCheckedChange={(v) => handleUpdateRule('canEditClasses', v === true)}
              disabled={!isManager || savingRules}
            />
            <Label className="text-xs cursor-pointer">{t('p2p.permEditClasses')}</Label>
          </div>
          <div className="flex items-center gap-2">
            <Checkbox
              checked={rules.canDelete}
              onCheckedChange={(v) => handleUpdateRule('canDelete', v === true)}
              disabled={!isManager || savingRules}
            />
            <Label className="text-xs cursor-pointer">{t('p2p.permDelete')}</Label>
          </div>
          <div className="flex items-center gap-2">
            <Checkbox
              checked={rules.canExport}
              onCheckedChange={(v) => handleUpdateRule('canExport', v === true)}
              disabled={!isManager || savingRules}
            />
            <Label className="text-xs cursor-pointer">{t('p2p.permExport')}</Label>
          </div>
        </div>
      </div>

      <div>
        <p className="text-xs font-medium mb-2">{t('p2p.connectedPeers')} ({peers.length})</p>
        <PeerList peers={peers} myNodeId={activeSession.myNodeId} />
      </div>

      <WorkDistributionPanel />

      {/* Link to Team View */}
      <Button
        variant="outline"
        size="sm"
        className="w-full"
        onClick={() => navigate(`/projects/${activeSession.projectId}/team`)}
      >
        <i className="fas fa-users mr-2" />
        {t('p2p.manageTeam')}
      </Button>

      <div className="flex gap-2">
        <Button
          variant="outline"
          size="sm"
          className="flex-1"
          onClick={handlePause}
          disabled={pausing || leaving}
        >
          {pausing ? <i className="fas fa-spinner fa-spin mr-2" /> : <i className="fas fa-pause mr-2" />}
          {t('p2p.pauseSession')}
        </Button>
        <Button
          variant="destructive"
          size="sm"
          className="flex-1"
          onClick={handleLeave}
          disabled={leaving || pausing}
        >
          {leaving ? <i className="fas fa-spinner fa-spin mr-2" /> : <i className="fas fa-sign-out-alt mr-2" />}
          {t('p2p.leaveSession')}
        </Button>
      </div>
    </div>
  );
}
