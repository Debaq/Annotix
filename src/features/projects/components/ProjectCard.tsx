import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { Project } from '@/lib/db';
import { useProjects } from '../hooks/useProjects';
import { Card, CardContent, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ProjectSettingsDialog } from './ProjectSettingsDialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

interface ProjectCardProps {
  project: Project;
}

export function ProjectCard({ project }: ProjectCardProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { deleteProject } = useProjects();

  const handleOpen = () => {
    navigate(`/projects/${project.id}`);
  };

  const handleDelete = async () => {
    if (confirm(t('projects.confirmDelete', { name: project.name }))) {
      await deleteProject(project.id!);
    }
  };

  const typeIcon = project.type === 'bbox' ? 'fa-vector-square' : 'fa-paintbrush';

  return (
    <Card className="transition-shadow hover:shadow-lg">
      <CardContent className="pt-6">
        <div className="mb-4 flex items-start justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <i className={`fas ${typeIcon}`}></i>
            </div>
            <div>
              <h3 className="font-semibold">{project.name}</h3>
              <p className="text-xs text-muted-foreground">
                {t(`project.type.${project.type}`)}
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
              
              <ProjectSettingsDialog 
                project={project} 
                trigger={
                  <DropdownMenuItem onSelect={(e) => e.preventDefault()}>
                    <i className="fas fa-cog mr-2"></i>
                    Configurar
                  </DropdownMenuItem>
                }
              />

              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={handleDelete} className="text-destructive">
                <i className="fas fa-trash mr-2"></i>
                {t('projects.delete')}
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
    </Card>
  );
}
