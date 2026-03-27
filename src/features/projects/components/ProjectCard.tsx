import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { confirm } from '@/lib/dialogs';
import { Project } from '@/lib/db';
import { useProjects } from '../hooks/useProjects';
import { Card, CardContent, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { ProjectSettingsDialog } from './ProjectSettingsDialog';
import { P2pDialog } from '@/features/p2p/components/P2pDialog';
import { useP2pStore } from '@/features/p2p/store/p2pStore';
import { p2pService } from '@/features/p2p/services/p2pService';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import * as tauriDb from '@/lib/tauriDb';
import { invoke } from '@tauri-apps/api/core';
import { save } from '@tauri-apps/plugin-dialog';

interface ProjectCardProps {
  project: Project;
  folders?: string[];
}

const EMPTY_PEERS: never[] = [];

export function ProjectCard({ project, folders = [] }: ProjectCardProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { deleteProject } = useProjects();
  const [p2pOpen, setP2pOpen] = useState(false);
  const session = useP2pStore(s => project.id ? s.sessions[project.id] ?? null : null);
  const peers = useP2pStore(s => project.id ? s.peersByProject[project.id] ?? EMPTY_PEERS : EMPTY_PEERS);
  const downloadProgress = useP2pStore(s => s.downloadProgress);
  const isSharing = !!session;
  const isHost = isSharing && session?.role === 'lead_researcher';
  const isCollaborator = isSharing && session?.role !== 'lead_researcher';
  const [stopping, setStopping] = useState(false);
  const [resuming, setResuming] = useState(false);
  const dlProgress = downloadProgress[project.id!];
  const hasPausedP2p = !isSharing && project.hasP2pConfig;

  const handleResumeP2p = async () => {
    setResuming(true);
    try {
      const info = await p2pService.resumeSession(project.id!);
      useP2pStore.getState().setSession(project.id!, info);
    } catch (err) {
      console.error('Error resuming P2P session:', err);
    } finally {
      setResuming(false);
    }
  };

  const handleStopSharing = async () => {
    if (!await confirm(t('p2p.confirmStop'), { kind: 'warning' })) return;
    setStopping(true);
    try {
      await p2pService.leaveSession(project.id!);
      useP2pStore.getState().reset(project.id!);
    } catch (err) {
      console.error('Error stopping P2P session:', err);
    } finally {
      setStopping(false);
    }
  };

  const handleOpen = () => {
    navigate(`/projects/${project.id}`);
  };

  const handleDelete = async () => {
    if (await confirm(t('projects.confirmDelete', { name: project.name }), { kind: 'warning' })) {
      await deleteProject(project.id!);
    }
  };

  const typeIconMap: Record<string, string> = {
    bbox: 'fa-vector-square',
    mask: 'fa-paintbrush',
    polygon: 'fa-draw-polygon',
    keypoints: 'fa-sitemap',
    landmarks: 'fa-location-dot',
    obb: 'fa-rotate',
    classification: 'fa-tag',
    'multi-label-classification': 'fa-tags',
    'timeseries-classification': 'fa-chart-line',
    'timeseries-forecasting': 'fa-chart-area',
    'anomaly-detection': 'fa-exclamation-triangle',
    'timeseries-segmentation': 'fa-layer-group',
    'pattern-recognition': 'fa-wave-square',
    'event-detection': 'fa-bolt',
    'timeseries-regression': 'fa-chart-simple',
    clustering: 'fa-circle-nodes',
    imputation: 'fa-fill-drip',
    tabular: 'fa-table',
    'audio-classification': 'fa-music',
    'speech-recognition': 'fa-microphone',
    'sound-event-detection': 'fa-volume-high',
  };

  const typeIcon = typeIconMap[project.type] || 'fa-folder';

  return (
    <Card className={`flex h-full flex-col transition-shadow hover:shadow-lg ${isSharing ? 'ring-2 ring-violet-500/50' : ''}`}>
      <CardContent className="flex-1 pt-6">
        {hasPausedP2p && (
          <div className="mb-3 rounded-lg bg-amber-500/10 px-3 py-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-xs text-amber-600 dark:text-amber-400">
                <i className="fas fa-pause-circle" />
                <span className="font-medium">{t('p2p.pausedSession')}</span>
              </div>
              <Button
                variant="outline"
                size="sm"
                className="h-6 text-xs"
                onClick={handleResumeP2p}
                disabled={resuming}
              >
                {resuming
                  ? <i className="fas fa-spinner fa-spin mr-1" />
                  : <i className="fas fa-play mr-1" />
                }
                {t('p2p.resumeSession')}
              </Button>
            </div>
          </div>
        )}
        {isHost && (
          <div className="mb-3 rounded-lg bg-violet-500/10 px-3 py-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-xs text-violet-600 dark:text-violet-400">
                <span className="relative flex h-2 w-2">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-violet-400 opacity-75" />
                  <span className="relative inline-flex h-2 w-2 rounded-full bg-violet-500" />
                </span>
                <i className="fas fa-broadcast-tower" />
                <span className="font-medium">{t('p2p.sharing')}</span>
                <span className="text-muted-foreground">· {peers.length + 1} {t('p2p.peers')}</span>
              </div>
              <div className="flex items-center gap-2">
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      className="text-xs text-violet-500 hover:text-violet-700 dark:hover:text-violet-300"
                      onClick={() => {
                        if (session?.shareCode) {
                          navigator.clipboard.writeText(session.shareCode);
                        }
                      }}
                    >
                      <i className="fas fa-copy" />
                    </button>
                  </TooltipTrigger>
                  <TooltipContent>{t('p2p.copyCode')}</TooltipContent>
                </Tooltip>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      className="text-xs text-red-500 hover:text-red-700 dark:hover:text-red-300"
                      onClick={handleStopSharing}
                      disabled={stopping}
                    >
                      <i className={`fas ${stopping ? 'fa-spinner fa-spin' : 'fa-stop'}`} />
                    </button>
                  </TooltipTrigger>
                  <TooltipContent>{t('p2p.stopSharing')}</TooltipContent>
                </Tooltip>
              </div>
            </div>
            <div className="flex items-center gap-2 text-xs text-violet-600 dark:text-violet-400 mt-1.5 pt-1.5 border-t border-violet-500/20">
              <i className="fas fa-images" />
              <span>{project.imageCount ?? 0} {t('p2p.totalImages')}</span>
            </div>
          </div>
        )}
        {isCollaborator && (
          <div className="mb-3 rounded-lg bg-blue-500/10 px-3 py-2">
            <div className="flex items-center gap-2 text-xs text-blue-600 dark:text-blue-400">
              <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-blue-400 opacity-75" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-blue-500" />
              </span>
              <i className="fas fa-link" />
              <span className="font-medium">{t('p2p.connected')}</span>
              <span className="text-muted-foreground">· {peers.length + 1} {t('p2p.peers')}</span>
            </div>
            {dlProgress ? (
              <div className="mt-1.5 pt-1.5 border-t border-blue-500/20">
                <div className="flex items-center gap-2 text-xs text-blue-600 dark:text-blue-400 mb-1">
                  <span className="bunny-hop">&#x1F430;</span>
                  <span>{t('p2p.downloadingImages')}</span>
                  <span className="ml-auto font-medium">{dlProgress.current} / {dlProgress.total}</span>
                </div>
                <Progress value={(dlProgress.current / Math.max(dlProgress.total, 1)) * 100} className="h-1.5" />
              </div>
            ) : project.p2pDownload ? (
              <div className="flex items-center gap-2 text-xs text-amber-600 dark:text-amber-400 mt-1.5 pt-1.5 border-t border-blue-500/20">
                <i className="fas fa-exclamation-triangle" />
                <span>{t('p2p.pendingDownload')}</span>
                <span className="ml-auto font-medium">{project.p2pDownload.downloadedImages} / {project.p2pDownload.totalImages}</span>
              </div>
            ) : (
              <div className="flex items-center gap-2 text-xs text-blue-600 dark:text-blue-400 mt-1.5 pt-1.5 border-t border-blue-500/20">
                <i className="fas fa-images" />
                <span>{project.imageCount ?? 0} {t('p2p.totalImages')}</span>
              </div>
            )}
          </div>
        )}
        <div className="mb-4 flex items-start justify-between">
          <div className="flex items-center gap-3">
            <div className={`flex h-10 w-10 items-center justify-center rounded-lg ${isSharing ? 'bg-violet-500/10 text-violet-500' : 'bg-primary/10 text-primary'}`}>
              <i className={`fas ${isSharing ? 'fa-broadcast-tower' : typeIcon}`}></i>
            </div>
            <div>
              <h3 className="font-semibold">{project.name}</h3>
              <p className="text-xs text-muted-foreground">
                {t(`project.types.${project.type}.name`)}
              </p>
            </div>
          </div>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon">
                <i className="fas fa-ellipsis-v"></i>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={handleOpen}>
                <i className="fas fa-folder-open mr-2"></i>
                {t('projects.open')}
              </DropdownMenuItem>

              <DropdownMenuItem onClick={() => invoke('reveal_project_folder', { projectId: project.id })}>
                <i className="fas fa-external-link-alt mr-2"></i>
                {t('projects.revealFolder', 'Abrir en explorador')}
              </DropdownMenuItem>

              <DropdownMenuItem onClick={async () => {
                const path = await save({
                  defaultPath: `${project.name.replace(/[^a-zA-Z0-9_-]/g, '_')}.zip`,
                  filters: [{ name: 'ZIP', extensions: ['zip'] }],
                });
                if (path) {
                  await invoke('zip_project', { projectId: project.id, outputPath: path });
                }
              }}>
                <i className="fas fa-download mr-2"></i>
                {t('projects.downloadZip', 'Descargar como ZIP')}
              </DropdownMenuItem>

              {!isCollaborator && !isSharing && (
                <DropdownMenuItem onSelect={() => setP2pOpen(true)}>
                  <i className="fas fa-people-arrows mr-2"></i>
                  {t('p2p.share')}
                </DropdownMenuItem>
              )}

              {!isCollaborator && isSharing && (
                <DropdownMenuItem onClick={() => navigate(`/projects/${project.id}/team`)}>
                  <i className="fas fa-users mr-2"></i>
                  {t('p2p.manageTeam')}
                </DropdownMenuItem>
              )}

              {!isCollaborator && (
                <ProjectSettingsDialog
                  project={project}
                  trigger={
                    <DropdownMenuItem onSelect={(e) => e.preventDefault()}>
                      <i className="fas fa-cog mr-2"></i>
                      {t('projects.configure')}
                    </DropdownMenuItem>
                  }
                />
              )}

              {folders.length > 0 && (
                <DropdownMenuSub>
                  <DropdownMenuSubTrigger>
                    <i className="fas fa-folder mr-2"></i>
                    {t('projects.moveToFolder', 'Mover a carpeta')}
                  </DropdownMenuSubTrigger>
                  <DropdownMenuSubContent>
                    {project.folder && (
                      <DropdownMenuItem onClick={() => project.id && tauriDb.setProjectFolder(project.id, null)}>
                        <i className="fas fa-times mr-2 text-muted-foreground"></i>
                        {t('projects.removeFromFolder', 'Sin carpeta')}
                      </DropdownMenuItem>
                    )}
                    {folders.filter(f => f !== project.folder).map(f => (
                      <DropdownMenuItem key={f} onClick={() => project.id && tauriDb.setProjectFolder(project.id, f)}>
                        <i className="fas fa-folder mr-2 text-muted-foreground"></i>
                        {f}
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuSubContent>
                </DropdownMenuSub>
              )}

              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={async () => {
                  const msg = isCollaborator
                    ? t('p2p.confirmLeaveAndDelete', 'Esto abandonará la sesión P2P y eliminará la copia local. ¿Continuar?')
                    : t('projects.confirmDelete', { name: project.name });
                  if (await confirm(msg, { kind: 'warning' })) {
                    if (isCollaborator) {
                      try { await p2pService.leaveSession(project.id!); } catch {}
                      useP2pStore.getState().reset(project.id!);
                    }
                    await deleteProject(project.id!);
                  }
                }}
                className="text-destructive"
              >
                <i className="fas fa-trash mr-2"></i>
                {isCollaborator ? t('p2p.leaveAndDelete', 'Abandonar y eliminar') : t('projects.delete')}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">{t('projects.stats.classes')}</span>
            <span className="font-medium">{project.classes.length}</span>
          </div>
          <div className="flex flex-wrap gap-1">
            {project.classes.slice(0, 5).map((cls) => (
              <div
                key={cls.id}
                className="inline-flex items-center gap-1 rounded-full bg-secondary px-2 py-1 text-xs"
              >
                <div
                  className="h-2 w-2 rounded-full"
                  style={{ backgroundColor: cls.color }}
                ></div>
                {cls.name}
              </div>
            ))}
            {project.classes.length > 5 && (
              <div className="inline-flex items-center rounded-full bg-secondary px-2 py-1 text-xs">
                +{project.classes.length - 5}
              </div>
            )}
          </div>
        </div>
      </CardContent>
      <CardFooter className="border-t bg-muted/50 pt-4">
        <Button onClick={handleOpen} className="w-full">
          <i className="fas fa-folder-open mr-2"></i>
          {t('projects.open')}
        </Button>
      </CardFooter>

      <P2pDialog
        projectId={project.id}
        open={p2pOpen}
        onOpenChange={setP2pOpen}
      />
    </Card>
  );
}
