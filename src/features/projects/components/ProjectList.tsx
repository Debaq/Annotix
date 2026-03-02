import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useProjects } from '../hooks/useProjects';
import { ProjectCard } from './ProjectCard';
import { CreateProjectDialog } from './CreateProjectDialog';
import { Button } from '@/components/ui/button';
import { useUIStore } from '../../core/store/uiStore';
import { ImportDialog } from '@/features/import/components/ImportDialog';
import { P2pDialog } from '@/features/p2p/components/P2pDialog';
import { Card, CardContent } from '@/components/ui/card';

export function ProjectList() {
  const { t } = useTranslation();
  const { projects, isLoading } = useProjects();
  const { setCurrentProjectId } = useUIStore();

  // Clear current project selection when on the project list
  useEffect(() => {
    setCurrentProjectId(null);
  }, [setCurrentProjectId]);

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

  return (
    <div className="h-full p-6">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">{t('projects.title')}</h2>
          <p className="text-muted-foreground">{t('projects.subtitle')}</p>
        </div>
        <CreateProjectDialog />
      </div>

      {projects.length === 0 ? (
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
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
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
          {projects.map((project) => (
            <ProjectCard key={project.id} project={project} />
          ))}
        </div>
      )}
    </div>
  );
}
