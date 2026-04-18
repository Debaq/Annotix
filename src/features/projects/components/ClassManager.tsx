import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ClassDefinition } from '@/lib/db';
import { ClassColorPicker } from './ClassColorPicker';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

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
  const [descEditingId, setDescEditingId] = useState<number | null>(null);
  const [descDraft, setDescDraft] = useState('');

  const descEditing = classes.find((c) => c.id === descEditingId) ?? null;

  const openDescription = (cls: ClassDefinition) => {
    setDescEditingId(cls.id);
    setDescDraft(cls.description ?? '');
  };

  const saveDescription = () => {
    if (descEditingId === null) return;
    handleUpdateClass(descEditingId, { description: descDraft.trim() || undefined });
    setDescEditingId(null);
  };

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

  const handleMove = (index: number, delta: number) => {
    const target = index + delta;
    if (target < 0 || target >= classes.length) return;
    const next = [...classes];
    [next[index], next[target]] = [next[target], next[index]];
    onChange(next);
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
              onClick={() => openDescription(cls)}
              title={t('classes.editDescription', 'Descripción')}
            >
              <i className={`fas fa-align-left ${cls.description ? 'text-primary' : ''}`}></i>
            </Button>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => handleMove(index, -1)}
              disabled={index === 0}
              title={t('classes.moveUp', 'Mover arriba')}
            >
              <i className="fas fa-arrow-up"></i>
            </Button>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => handleMove(index, 1)}
              disabled={index === classes.length - 1}
              title={t('classes.moveDown', 'Mover abajo')}
            >
              <i className="fas fa-arrow-down"></i>
            </Button>
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

      <Dialog
        open={descEditingId !== null}
        onOpenChange={(o) => { if (!o) setDescEditingId(null); }}
      >
        <DialogContent onKeyDown={(e) => e.stopPropagation()}>
          <DialogHeader>
            <DialogTitle>
              {t('classes.editDescription', 'Descripción')}
              {descEditing ? ` — ${descEditing.name}` : ''}
            </DialogTitle>
            <DialogDescription>
              {t('classes.descriptionHelp', 'Notas o criterios para anotar esta clase.')}
            </DialogDescription>
          </DialogHeader>
          <textarea
            value={descDraft}
            onChange={(e) => setDescDraft(e.target.value)}
            rows={6}
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            placeholder={t('classes.descriptionPlaceholder', 'Describe esta clase…')}
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setDescEditingId(null)}>
              {t('classes.cancel')}
            </Button>
            <Button onClick={saveDescription}>{t('classes.save')}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
