import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { listen } from '@tauri-apps/api/event';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogTrigger } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Progress } from '@/components/ui/progress';
import { Checkbox } from '@/components/ui/checkbox';
import { p2pService } from '../services/p2pService';
import { useP2pStore } from '../store/p2pStore';
import { useUIStore } from '../../core/store/uiStore';
import type { P2pSessionInfo, LockMode, SessionRules } from '../types';

interface P2pDialogProps {
  trigger?: React.ReactNode;
  projectId?: string;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}

type Step = 'choose' | 'create-configure' | 'create-exporting' | 'create-ready' | 'join-enter-code' | 'join-downloading' | 'connected';

export function P2pDialog({ trigger, projectId, open: controlledOpen, onOpenChange }: P2pDialogProps) {
  const { t } = useTranslation();
  const [internalOpen, setInternalOpen] = useState(false);
  const open = controlledOpen ?? internalOpen;
  const setOpen = onOpenChange ?? setInternalOpen;
  const [step, setStep] = useState<Step>('choose');
  const [displayName, setDisplayName] = useState('');
  const [lockMode, setLockMode] = useState<LockMode>('individual');
  const [canUpload, setCanUpload] = useState(false);
  const [canEditClasses, setCanEditClasses] = useState(false);
  const [canDelete, setCanDelete] = useState(false);
  const [canExport, setCanExport] = useState(true);
  const [requireDataApproval, setRequireDataApproval] = useState(false);
  const [shareCode, setShareCode] = useState('');
  const [sessionInfo, setSessionInfo] = useState<P2pSessionInfo | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [exportProgress, setExportProgress] = useState<{ current: number; total: number } | null>(null);
  const { setSession } = useP2pStore();
  const { downloadProgress } = useP2pStore();
  const { setCurrentProjectId } = useUIStore();

  // Listener para progreso de export (host importando blobs)
  useEffect(() => {
    let unlisten: (() => void) | null = null;
    listen<{ current: number; total: number; imageName: string }>('p2p:export-progress', (event) => {
      setExportProgress({ current: event.payload.current, total: event.payload.total });
    }).then((fn) => { unlisten = fn; });
    return () => { unlisten?.(); };
  }, []);

  const handleReset = () => {
    setStep('choose');
    setDisplayName('');
    setLockMode('individual');
    setCanUpload(false);
    setCanEditClasses(false);
    setCanDelete(false);
    setCanExport(true);
    setRequireDataApproval(false);
    setShareCode('');
    setSessionInfo(null);
    setError('');
    setLoading(false);
    setExportProgress(null);
  };

  const handleCreateSession = async () => {
    if (!displayName.trim() || !projectId) return;
    setError('');
    setLoading(true);
    setExportProgress(null);
    setStep('create-exporting');

    try {
      const rules: SessionRules = {
        lockMode,
        canUpload,
        canEditClasses,
        canDelete,
        canExport,
        requireDataApproval,
      };
      const session = await p2pService.createSession(projectId, displayName.trim(), rules);
      setSessionInfo(session);
      setSession(session.projectId || projectId!, session);
      setStep('create-ready');
    } catch (err) {
      setError(String(err));
      setStep('create-configure');
    } finally {
      setLoading(false);
    }
  };

  const handleJoinSession = async () => {
    if (!displayName.trim() || !shareCode.trim()) return;
    setError('');
    setLoading(true);
    setStep('join-downloading');

    try {
      const session = await p2pService.joinSession(shareCode.trim(), displayName.trim());
      setSessionInfo(session);
      setSession(session.projectId, session);
      setCurrentProjectId(session.projectId);
      // La descarga de imágenes continúa en background, cerrar modal directamente
      handleClose();
    } catch (err) {
      setError(String(err));
      setStep('join-enter-code');
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => {
    setOpen(false);
    handleReset();
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) handleClose(); else setOpen(true); }}>
      {trigger && (
        <DialogTrigger asChild>
          {trigger}
        </DialogTrigger>
      )}
      {!trigger && controlledOpen === undefined && (
        <DialogTrigger asChild>
          <Button variant="outline">
            <i className="fas fa-people-arrows mr-2" />
            {t('p2p.collaborate')}
          </Button>
        </DialogTrigger>
      )}

      <DialogContent className="sm:max-w-md" preventClose={step === 'join-downloading'}>
        {/* Step: Choose */}
        {step === 'choose' && (
          <>
            <DialogHeader>
              <DialogTitle>{t('p2p.collaborate')}</DialogTitle>
              <DialogDescription>{t('p2p.chooseAction')}</DialogDescription>
            </DialogHeader>
            <div className="space-y-3">
              {projectId && (
                <button
                  className="w-full flex items-center gap-4 rounded-lg border p-4 text-left hover:bg-accent transition-colors"
                  onClick={() => setStep('create-configure')}
                >
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-violet-500/10 text-violet-500">
                    <i className="fas fa-broadcast-tower text-lg" />
                  </div>
                  <div>
                    <div className="font-semibold">{t('p2p.createSession')}</div>
                    <div className="text-sm text-muted-foreground">{t('p2p.createSessionDesc')}</div>
                  </div>
                </button>
              )}
              <button
                className="w-full flex items-center gap-4 rounded-lg border p-4 text-left hover:bg-accent transition-colors"
                onClick={() => setStep('join-enter-code')}
              >
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-blue-500/10 text-blue-500">
                  <i className="fas fa-link text-lg" />
                </div>
                <div>
                  <div className="font-semibold">{t('p2p.joinSession')}</div>
                  <div className="text-sm text-muted-foreground">{t('p2p.joinSessionDesc')}</div>
                </div>
              </button>
            </div>
          </>
        )}

        {/* Step: Create - Configure */}
        {step === 'create-configure' && (
          <>
            <DialogHeader>
              <DialogTitle>{t('p2p.createSession')}</DialogTitle>
              <DialogDescription>{t('p2p.configureSession')}</DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <Label>{t('p2p.displayName')}</Label>
                <Input
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  placeholder={t('p2p.displayNamePlaceholder')}
                  className="mt-1"
                />
              </div>
              <div>
                <Label>{t('p2p.lockMode')}</Label>
                <RadioGroup value={lockMode} onValueChange={(v) => setLockMode(v as LockMode)} className="mt-2">
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="individual" id="lock-individual" />
                    <Label htmlFor="lock-individual" className="cursor-pointer">
                      <span className="font-medium">{t('p2p.lockIndividual')}</span>
                      <span className="text-xs text-muted-foreground ml-2">{t('p2p.lockIndividualDesc')}</span>
                    </Label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="batch" id="lock-batch" />
                    <Label htmlFor="lock-batch" className="cursor-pointer">
                      <span className="font-medium">{t('p2p.lockBatch')}</span>
                      <span className="text-xs text-muted-foreground ml-2">{t('p2p.lockBatchDesc')}</span>
                    </Label>
                  </div>
                </RadioGroup>
              </div>

              {/* Permisos de colaboradores */}
              <div>
                <Label className="text-sm font-medium">{t('p2p.collaboratorPermissions')}</Label>
                <div className="mt-2 space-y-3">
                  <div className="flex items-center gap-2">
                    <Checkbox id="perm-upload" checked={canUpload} onCheckedChange={(v) => setCanUpload(v === true)} />
                    <Label htmlFor="perm-upload" className="text-sm cursor-pointer">{t('p2p.permUpload')}</Label>
                  </div>
                  <div className="flex items-center gap-2">
                    <Checkbox id="perm-classes" checked={canEditClasses} onCheckedChange={(v) => setCanEditClasses(v === true)} />
                    <Label htmlFor="perm-classes" className="text-sm cursor-pointer">{t('p2p.permEditClasses')}</Label>
                  </div>
                  <div className="flex items-center gap-2">
                    <Checkbox id="perm-delete" checked={canDelete} onCheckedChange={(v) => setCanDelete(v === true)} />
                    <Label htmlFor="perm-delete" className="text-sm cursor-pointer">{t('p2p.permDelete')}</Label>
                  </div>
                  <div className="flex items-center gap-2">
                    <Checkbox id="perm-export" checked={canExport} onCheckedChange={(v) => setCanExport(v === true)} />
                    <Label htmlFor="perm-export" className="text-sm cursor-pointer">{t('p2p.permExport')}</Label>
                  </div>
                  <div className="flex items-center gap-2">
                    <Checkbox id="perm-approval" checked={requireDataApproval} onCheckedChange={(v) => setRequireDataApproval(v === true)} />
                    <Label htmlFor="perm-approval" className="text-sm cursor-pointer">
                      {t('p2p.requireDataApproval')}
                      <span className="text-xs text-muted-foreground ml-1">{t('p2p.requireDataApprovalDesc')}</span>
                    </Label>
                  </div>
                </div>
              </div>

              {error && <p className="text-sm text-destructive">{error}</p>}
              <div className="flex gap-2 justify-end">
                <Button variant="outline" onClick={() => setStep('choose')}>{t('common.back')}</Button>
                <Button onClick={handleCreateSession} disabled={!displayName.trim() || loading}>
                  {loading ? <i className="fas fa-spinner fa-spin mr-2" /> : <i className="fas fa-broadcast-tower mr-2" />}
                  {t('p2p.startSharing')}
                </Button>
              </div>
            </div>
          </>
        )}

        {/* Step: Create - Exporting (host importing blobs) */}
        {step === 'create-exporting' && (
          <>
            <DialogHeader>
              <DialogTitle>{t('p2p.createSession')}</DialogTitle>
              <DialogDescription>{t('p2p.exportingProject')}</DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="text-center">
                <i className="fas fa-upload fa-spin text-4xl text-violet-500 mb-4" />
              </div>
              {exportProgress && (
                <div>
                  <Progress value={(exportProgress.current / Math.max(exportProgress.total, 1)) * 100} />
                  <p className="text-sm text-muted-foreground text-center mt-2">
                    {t('p2p.exportingImages', { current: exportProgress.current, total: exportProgress.total })}
                  </p>
                </div>
              )}
              {!exportProgress && (
                <p className="text-sm text-muted-foreground text-center">
                  {t('p2p.preparingSession')}
                </p>
              )}
              {error && <p className="text-sm text-destructive text-center">{error}</p>}
            </div>
          </>
        )}

        {/* Step: Create - Ready (show codes) */}
        {step === 'create-ready' && sessionInfo && (
          <>
            <DialogHeader>
              <DialogTitle>{t('p2p.sessionReady')}</DialogTitle>
              <DialogDescription>{t('p2p.shareCodeInstructions')}</DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              {/* Código para colaboradores */}
              <div className="rounded-lg border bg-muted/50 p-4">
                <p className="text-xs text-muted-foreground mb-1">{t('p2p.shareCodeLabel')}</p>
                <p className="text-lg font-mono font-bold tracking-wider select-all break-all">{sessionInfo.shareCode}</p>
                <Button
                  variant="ghost"
                  size="sm"
                  className="mt-1 h-7 text-xs"
                  onClick={() => navigator.clipboard.writeText(sessionInfo.shareCode)}
                >
                  <i className="fas fa-copy mr-1" />
                  {t('p2p.copyCode')}
                </Button>
              </div>

              {/* Clave del host */}
              {sessionInfo.hostKey && (
                <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-4">
                  <div className="flex items-center gap-2 mb-1">
                    <i className="fas fa-key text-amber-500 text-xs" />
                    <p className="text-xs font-medium text-amber-600 dark:text-amber-400">{t('p2p.hostKeyLabel')}</p>
                  </div>
                  <p className="text-xs font-mono select-all break-all text-amber-700 dark:text-amber-300">{sessionInfo.hostKey}</p>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="mt-1 h-7 text-xs"
                    onClick={() => navigator.clipboard.writeText(sessionInfo.hostKey!)}
                  >
                    <i className="fas fa-copy mr-1" />
                    {t('p2p.copyHostKey')}
                  </Button>
                  <p className="text-xs text-muted-foreground mt-2">
                    <i className="fas fa-exclamation-triangle mr-1 text-amber-500" />
                    {t('p2p.hostKeyWarning')}
                  </p>
                </div>
              )}

              <p className="text-xs text-muted-foreground text-center">
                <i className="fas fa-info-circle mr-1" />
                {t('p2p.waitingForPeers')}
              </p>
              <Button className="w-full" onClick={handleClose}>
                {t('common.close')}
              </Button>
            </div>
          </>
        )}

        {/* Step: Join - Enter Code */}
        {step === 'join-enter-code' && (
          <>
            <DialogHeader>
              <DialogTitle>{t('p2p.joinSession')}</DialogTitle>
              <DialogDescription>{t('p2p.enterShareCode')}</DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <Label>{t('p2p.displayName')}</Label>
                <Input
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  placeholder={t('p2p.displayNamePlaceholder')}
                  className="mt-1"
                />
              </div>
              <div>
                <Label>{t('p2p.codeOrHostKey')}</Label>
                <Input
                  value={shareCode}
                  onChange={(e) => setShareCode(e.target.value.toUpperCase())}
                  placeholder="ANN-XXXX-... / ANN-HOST-XXXX-..."
                  className="mt-1 font-mono text-xs"
                />
                <p className="text-xs text-muted-foreground mt-1">
                  {shareCode.startsWith('ANN-HOST')
                    ? <><i className="fas fa-flask text-violet-500 mr-1" />{t('p2p.joiningAsLeadResearcher')}</>
                    : <><i className="fas fa-pen text-blue-500 mr-1" />{t('p2p.joiningAsAnnotator')}</>
                  }
                </p>
              </div>
              {error && <p className="text-sm text-destructive">{error}</p>}
              <div className="flex gap-2 justify-end">
                <Button variant="outline" onClick={() => setStep('choose')}>{t('common.back')}</Button>
                <Button onClick={handleJoinSession} disabled={!displayName.trim() || !shareCode.trim() || loading}>
                  {loading ? <i className="fas fa-spinner fa-spin mr-2" /> : <i className="fas fa-link mr-2" />}
                  {t('p2p.join')}
                </Button>
              </div>
            </div>
          </>
        )}

        {/* Step: Join - Downloading */}
        {step === 'join-downloading' && (
          <>
            <DialogHeader>
              <DialogTitle>{t('p2p.syncing')}</DialogTitle>
              <DialogDescription>{t('p2p.downloadingProject')}</DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="text-center">
                <i className="fas fa-download fa-spin text-4xl text-blue-500 mb-4" />
              </div>
              {sessionInfo && downloadProgress[sessionInfo.projectId] && (
                <div>
                  <Progress value={(downloadProgress[sessionInfo.projectId].current / Math.max(downloadProgress[sessionInfo.projectId].total, 1)) * 100} />
                  <p className="text-sm text-muted-foreground text-center mt-2">
                    {t('p2p.downloadingImages', {
                      current: downloadProgress[sessionInfo.projectId].current,
                      total: downloadProgress[sessionInfo.projectId].total,
                    })}
                  </p>
                </div>
              )}
              {(!sessionInfo || !downloadProgress[sessionInfo?.projectId]) && !error && (
                <p className="text-sm text-muted-foreground text-center">
                  {t('p2p.connectingToHost')}
                </p>
              )}
              {error && <p className="text-sm text-destructive text-center">{error}</p>}
            </div>
          </>
        )}

        {/* Step: Connected */}
        {step === 'connected' && sessionInfo && (
          <>
            <DialogHeader>
              <DialogTitle>{t('p2p.connected')}</DialogTitle>
              <DialogDescription>{t('p2p.connectedDesc')}</DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="text-center">
                <div className="inline-flex h-16 w-16 items-center justify-center rounded-full bg-green-500/10 text-green-500">
                  <i className="fas fa-check text-3xl" />
                </div>
              </div>
              <div className="text-sm text-center text-muted-foreground space-y-1">
                <p>{t('p2p.readyToAnnotate')}</p>
                <p className="font-medium">
                  <i className={`fas ${sessionInfo.role === 'lead_researcher' ? 'fa-flask text-violet-500' : sessionInfo.role === 'data_curator' ? 'fa-database text-amber-500' : 'fa-pen text-blue-500'} mr-1`} />
                  {t(`p2p.role_${sessionInfo.role}`)}
                </p>
              </div>
              <Button className="w-full" onClick={handleClose}>
                {t('p2p.startAnnotating')}
              </Button>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
