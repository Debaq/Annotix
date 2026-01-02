import { useTranslation } from 'react-i18next';
import { useProjects } from '../hooks/useProjects';
import { ProjectCard } from './ProjectCard';
import { CreateProjectDialog } from './CreateProjectDialog';
import { Button } from '@/components/ui/button';

export function ProjectList() {
  const { t } = useTranslation();
  const { projects, isLoading } = useProjects();

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
          <CreateProjectDialog trigger={
            <Button className="mt-6" size="lg">
              <i className="fas fa-plus mr-2"></i>
              {t('projects.create')}
            </Button>
          } />
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {projects.map((project) => (
            <ProjectCard key={project.id} project={project} />
          ))}
        </div>
      )}
    </div>
  );
}
