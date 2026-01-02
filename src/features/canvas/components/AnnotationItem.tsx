import { Annotation, Project } from '@/lib/db';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';

interface AnnotationItemProps {
  annotation: Annotation;
  project: Project;
  onDelete: () => void;
}

export function AnnotationItem({ annotation, project, onDelete }: AnnotationItemProps) {
  const classInfo = project.classes.find((c) => c.id === annotation.classId);

  if (!classInfo) return null;

  const getAnnotationInfo = () => {
    if (annotation.type === 'bbox') {
      const { x, y, width, height } = annotation.data as {
        x: number;
        y: number;
        width: number;
        height: number;
      };
      return `BBox: ${Math.round(x)}, ${Math.round(y)}, ${Math.round(width)}×${Math.round(height)}`;
    } else {
      return 'Mask';
    }
  };

  return (
    <Card className="p-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div
            className="h-4 w-4 rounded"
            style={{ backgroundColor: classInfo.color }}
          ></div>
          <div>
            <p className="text-sm font-medium">{classInfo.name}</p>
            <p className="text-xs text-muted-foreground">{getAnnotationInfo()}</p>
          </div>
        </div>
        <Button variant="ghost" size="icon" onClick={onDelete}>
          <i className="fas fa-trash text-destructive"></i>
        </Button>
      </div>
    </Card>
  );
}
