import { useEffect, useState, useMemo, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { useProjects } from '../hooks/useProjects';
import { ProjectCard } from './ProjectCard';
import { CreateProjectDialog } from './CreateProjectDialog';
import { Button } from '@/components/ui/button';
import { useUIStore } from '../../core/store/uiStore';
import { ImportDialog } from '@/features/import/components/ImportDialog';
import { P2pDialog } from '@/features/p2p/components/P2pDialog';
import { Card, CardContent } from '@/components/ui/card';
import * as tauriDb from '@/lib/tauriDb';
import { confirm } from '@/lib/dialogs';

// Carpetas vacías se guardan en localStorage
const EMPTY_FOLDERS_KEY = 'annotix:empty-folders';

function loadEmptyFolders(): string[] {
  try {
    return JSON.parse(localStorage.getItem(EMPTY_FOLDERS_KEY) || '[]');
  } catch { return []; }
}

function saveEmptyFolders(folders: string[]) {
  localStorage.setItem(EMPTY_FOLDERS_KEY, JSON.stringify(folders));
}

export function ProjectList() {
  const { t } = useTranslation();
  const { projects, isLoading } = useProjects();
  const { setCurrentProjectId } = useUIStore();
  const [openFolders, setOpenFolders] = useState<Set<string>>(new Set());
  const [creatingFolder, setCreatingFolder] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  const [emptyFolders, setEmptyFolders] = useState<string[]>(loadEmptyFolders);

  useEffect(() => {
    setCurrentProjectId(null);
  }, [setCurrentProjectId]);

  // Agrupar proyectos por carpeta
  const { folders, ungrouped } = useMemo(() => {
    const folderMap = new Map<string, typeof projects>();
    const ungrouped: typeof projects = [];

    for (const project of projects) {
      if (project.folder) {
        const list = folderMap.get(project.folder) || [];
        list.push(project);
        folderMap.set(project.folder, list);
      } else {
        ungrouped.push(project);
      }
    }

    // Incluir carpetas vacías
    for (const ef of emptyFolders) {
      if (!folderMap.has(ef)) {
        folderMap.set(ef, []);
      }
    }

    const folders = Array.from(folderMap.entries()).sort((a, b) => a[0].localeCompare(b[0]));
    return { folders, ungrouped };
  }, [projects, emptyFolders]);

  const allFolderNames = useMemo(() => folders.map(([name]) => name), [folders]);

  const toggleFolder = (name: string) => {
    setOpenFolders(prev => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  };

  const handleCreateFolder = useCallback(() => {
    const name = newFolderName.trim();
    if (!name || allFolderNames.includes(name)) return;
    const updated = [...emptyFolders, name];
    setEmptyFolders(updated);
    saveEmptyFolders(updated);
    setNewFolderName('');
    setCreatingFolder(false);
    // Abrir la carpeta recién creada
    setOpenFolders(prev => new Set(prev).add(name));
  }, [newFolderName, allFolderNames, emptyFolders]);

  const handleDeleteFolder = async (folderName: string) => {
    if (await confirm(t('projects.confirmDeleteFolder', { name: folderName }), { kind: 'warning' })) {
      // Mover proyectos a sin carpeta
      const folderProjects = folders.find(([n]) => n === folderName)?.[1] || [];
      for (const p of folderProjects) {
        if (p.id) await tauriDb.setProjectFolder(p.id, null);
      }
      // Quitar de carpetas vacías
      const updated = emptyFolders.filter(f => f !== folderName);
      setEmptyFolders(updated);
      saveEmptyFolders(updated);
    }
  };

  // Limpiar carpetas vacías que ya tienen proyectos
  useEffect(() => {
    const withProjects = new Set(projects.map(p => p.folder).filter(Boolean));
    const stillEmpty = emptyFolders.filter(f => !withProjects.has(f));
    if (stillEmpty.length !== emptyFolders.length) {
      setEmptyFolders(stillEmpty);
      saveEmptyFolders(stillEmpty);
    }
  }, [projects, emptyFolders]);

  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="text-center">
          <i className="fas fa-spinner fa-spin text-4xl text-muted-foreground"></i>
          <p className="mt-4 text-muted-foreground">{t('common.loading')}</p>
        </div>
      </div>
    );
  }

  const renderProjectGrid = (projectList: typeof projects) => (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
      {projectList.map((project) => (
        <ProjectCard key={project.id} project={project} folders={allFolderNames} />
      ))}
    </div>
  );

  const actionCards = (
    <Card className="border-dashed border-2 overflow-hidden">
      <CardContent className="p-0 flex h-full min-h-[180px]">
        <ImportDialog trigger={
          <button className="flex-1 flex flex-col items-center justify-center gap-3 p-4 cursor-pointer hover:bg-primary/5 transition-colors">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <i className="fas fa-file-import text-lg"></i>
            </div>
            <h3 className="font-semibold text-sm">{t('import.import')}</h3>
            <p className="text-xs text-muted-foreground text-center">{t('import.orClickToSelect')}</p>
          </button>
        } />
        <div className="w-px bg-border" />
        <P2pDialog trigger={
          <button className="flex-1 flex flex-col items-center justify-center gap-3 p-4 cursor-pointer hover:bg-primary/5 transition-colors">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-violet-500/10 text-violet-500">
              <i className="fas fa-people-arrows text-lg"></i>
            </div>
            <h3 className="font-semibold text-sm">{t('p2p.collaborate')}</h3>
            <p className="text-xs text-muted-foreground text-center">{t('p2p.description')}</p>
          </button>
        } />
      </CardContent>
    </Card>
  );

  return (
    <div className="h-full p-6 overflow-y-auto">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">{t('projects.title')}</h2>
          <p className="text-muted-foreground">{t('projects.subtitle')}</p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setCreatingFolder(true)}
          >
            <i className="fas fa-folder-plus mr-2" />
            {t('projects.newFolder', 'Nueva carpeta')}
          </Button>
          <CreateProjectDialog />
        </div>
      </div>

      {/* Crear carpeta */}
      {creatingFolder && (
        <div className="mb-4 flex items-center gap-2">
          <i className="fas fa-folder text-muted-foreground" />
          <input
            autoFocus
            className="border rounded px-2 py-1 text-sm bg-background"
            placeholder={t('projects.folderName', 'Nombre de la carpeta')}
            value={newFolderName}
            onChange={e => setNewFolderName(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter') handleCreateFolder();
              if (e.key === 'Escape') setCreatingFolder(false);
            }}
          />
          <Button size="sm" variant="ghost" onClick={handleCreateFolder}>
            <i className="fas fa-check" />
          </Button>
          <Button size="sm" variant="ghost" onClick={() => { setCreatingFolder(false); setNewFolderName(''); }}>
            <i className="fas fa-times" />
          </Button>
        </div>
      )}

      {projects.length === 0 && folders.length === 0 ? (
        <div className="flex h-[60vh] flex-col items-center justify-center rounded-lg border-2 border-dashed">
          <i className="fas fa-folder-open text-6xl text-muted-foreground"></i>
          <h3 className="mt-4 text-lg font-semibold">{t('projects.empty.title')}</h3>
          <p className="mt-2 text-muted-foreground">{t('projects.empty.description')}</p>
          <div className="mt-6 flex gap-4">
            <CreateProjectDialog trigger={
              <Button size="lg">
                <i className="fas fa-plus mr-2"></i>
                {t('projects.create')}
              </Button>
            } />
            <P2pDialog trigger={
              <Button size="lg" variant="outline">
                <i className="fas fa-people-arrows mr-2"></i>
                {t('p2p.joinSession')}
              </Button>
            } />
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          {/* Carpetas — colapsadas por defecto, compactas */}
          {folders.map(([folderName, folderProjects]) => {
            const isOpen = openFolders.has(folderName);
            return (
              <div key={folderName} className="rounded-lg border">
                <div
                  className="flex items-center gap-2 px-3 py-1.5 cursor-pointer select-none hover:bg-muted/50"
                  onClick={() => toggleFolder(folderName)}
                >
                  <i className={`fas fa-chevron-${isOpen ? 'down' : 'right'} text-[10px] text-muted-foreground w-3`} />
                  <i className={`fas fa-folder${isOpen ? '-open' : ''} text-sm text-muted-foreground`} />
                  <span className="font-medium text-sm flex-1">{folderName}</span>
                  <span className="text-[10px] text-muted-foreground bg-muted px-1.5 rounded">
                    {folderProjects.length}
                  </span>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-5 w-5 p-0 opacity-0 group-hover:opacity-100"
                    onClick={(e) => { e.stopPropagation(); handleDeleteFolder(folderName); }}
                    title={t('projects.deleteFolder', 'Eliminar carpeta')}
                  >
                    <i className="fas fa-times text-[10px] text-muted-foreground" />
                  </Button>
                </div>
                {isOpen && (
                  <div className="px-3 pb-3 pt-1">
                    {folderProjects.length === 0 ? (
                      <p className="text-xs text-muted-foreground italic py-2 text-center">
                        {t('projects.emptyFolder', 'Carpeta vacía — mové proyectos acá desde su menú')}
                      </p>
                    ) : (
                      renderProjectGrid(folderProjects)
                    )}
                  </div>
                )}
              </div>
            );
          })}

          {/* Proyectos sin carpeta + action cards */}
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {actionCards}
            {ungrouped.map((project) => (
              <ProjectCard key={project.id} project={project} folders={allFolderNames} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
