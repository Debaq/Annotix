import { useTranslation } from 'react-i18next';
import { useUIStore } from '../../core/store/uiStore';
import { useCurrentProject } from '../../projects/hooks/useCurrentProject';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

export function ClassSelector() {
  const { t } = useTranslation();
  const { activeClassId, setActiveClassId } = useUIStore();
  const { project } = useCurrentProject();

  if (!project || project.classes.length === 0) return null;

  const activeClass = project.classes.find((c) => c.id === activeClassId);

  return (
    <Select
      value={activeClassId?.toString()}
      onValueChange={(value) => setActiveClassId(parseInt(value, 10))}
    >
      <SelectTrigger className="w-[200px] bg-card">
        <SelectValue>
          {activeClass && (
            <div className="flex items-center gap-2">
              <div
                className="h-3 w-3 rounded"
                style={{ backgroundColor: activeClass.color }}
              ></div>
              <span>{activeClass.name}</span>
            </div>
          )}
        </SelectValue>
      </SelectTrigger>
      <SelectContent>
        {project.classes.map((cls, index) => (
          <SelectItem key={cls.id} value={cls.id.toString()}>
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground">{index + 1}</span>
              <div
                className="h-3 w-3 rounded"
                style={{ backgroundColor: cls.color }}
              ></div>
              <span>{cls.name}</span>
            </div>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
