import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ClassDefinition } from '@/lib/db';
import { ClassColorPicker } from './ClassColorPicker';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

interface ClassManagerProps {
  classes: ClassDefinition[];
  onChange: (classes: ClassDefinition[]) => void;
}

const PRESET_COLORS = [
  '#ff0000', '#00ff00', '#0000ff', '#ffff00', '#ff00ff',
  '#00ffff', '#ff8800', '#8800ff', '#00ff88', '#ff0088',
];

export function ClassManager({ classes, onChange }: ClassManagerProps) {
  const { t } = useTranslation();
  const [newClassName, setNewClassName] = useState('');

  const handleAddClass = () => {
    if (!newClassName.trim()) return;

    const newId = classes.length > 0 ? Math.max(...classes.map((c) => c.id)) + 1 : 0;
    const newColor = PRESET_COLORS[classes.length % PRESET_COLORS.length];

    onChange([
      ...classes,
      { id: newId, name: newClassName.trim(), color: newColor },
    ]);
    setNewClassName('');
  };

  const handleUpdateClass = (id: number, updates: Partial<ClassDefinition>) => {
    onChange(
      classes.map((cls) => (cls.id === id ? { ...cls, ...updates } : cls))
    );
  };

  const handleDeleteClass = (id: number) => {
    onChange(classes.filter((cls) => cls.id !== id));
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleAddClass();
    }
  };

  return (
    <div className="space-y-3">
      <div className="max-h-60 space-y-2 overflow-y-auto rounded-lg border p-3">
        {classes.map((cls, index) => (
          <div key={cls.id} className="flex items-center gap-2">
            <span className="flex h-6 w-6 items-center justify-center rounded bg-muted text-xs font-medium">
              {index + 1}
            </span>
            <Input
              value={cls.name}
              onChange={(e) => handleUpdateClass(cls.id, { name: e.target.value })}
              className="flex-1"
            />
            <ClassColorPicker
              color={cls.color}
              onChange={(color) => handleUpdateClass(cls.id, { color })}
            />
            <Button
              variant="ghost"
              size="icon"
              onClick={() => handleDeleteClass(cls.id)}
              disabled={classes.length === 1}
            >
              <i className="fas fa-trash text-destructive"></i>
            </Button>
          </div>
        ))}
      </div>

      <div className="flex gap-2">
        <Input
          value={newClassName}
          onChange={(e) => setNewClassName(e.target.value)}
          onKeyPress={handleKeyPress}
          placeholder={t('classes.addPlaceholder')}
          className="flex-1"
        />
        <Button onClick={handleAddClass} disabled={!newClassName.trim()}>
          <i className="fas fa-plus mr-2"></i>
          {t('classes.add')}
        </Button>
      </div>
    </div>
  );
}
