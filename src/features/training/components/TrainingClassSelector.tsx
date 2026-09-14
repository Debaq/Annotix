import { useTranslation } from 'react-i18next';
import { Checkbox } from '@/components/ui/checkbox';
import type { ClassDefinition } from '@/lib/db';

interface TrainingClassSelectorProps {
  classes: ClassDefinition[];
  /** `null` = entrenar con todas las clases del proyecto. */
  selected: number[] | null;
  onChange: (selected: number[] | null) => void;
}

/**
 * Elige con qué clases se entrena.
 *
 * Por defecto entran todas. Al desmarcar "todas", aparece la lista y el usuario
 * elige: las clases no marcadas se descartan antes de preparar el dataset, así
 * que sus anotaciones no existen para el entrenamiento (ni ocupan un índice de
 * clase) y las imágenes que solo las tenían no entran.
 */
export function TrainingClassSelector({ classes, selected, onChange }: TrainingClassSelectorProps) {
  const { t } = useTranslation();
  const todas = selected === null;
  const elegidas = selected ?? classes.map((c) => c.id);

  const toggleTodas = (checked: boolean) => {
    onChange(checked ? null : classes.map((c) => c.id));
  };

  const toggleClase = (id: number, checked: boolean) => {
    const siguiente = checked ? [...elegidas, id] : elegidas.filter((c) => c !== id);
    onChange(siguiente);
  };

  if (classes.length === 0) return null;

  return (
    <div className="space-y-3">
      <label className="text-sm font-medium block">{t('training.classes.title')}</label>

      <label className="flex items-center gap-2 cursor-pointer">
        <Checkbox checked={todas} onCheckedChange={(v) => toggleTodas(v === true)} />
        <span className="text-sm">{t('training.classes.all', { total: classes.length })}</span>
      </label>

      {!todas && (
        <div className="space-y-2 pl-1">
          <div className="flex items-center gap-3 text-xs">
            <button
              type="button"
              className="text-muted-foreground hover:text-foreground"
              onClick={() => onChange(classes.map((c) => c.id))}
            >
              {t('training.classes.selectAll')}
            </button>
            <button
              type="button"
              className="text-muted-foreground hover:text-foreground"
              onClick={() => onChange([])}
            >
              {t('training.classes.selectNone')}
            </button>
          </div>

          <div className="rounded-lg border divide-y max-h-56 overflow-y-auto">
            {classes.map((cls) => {
              const marcada = elegidas.includes(cls.id);
              return (
                <label
                  key={cls.id}
                  className="flex items-center gap-2 px-3 py-2 cursor-pointer hover:bg-muted/50"
                >
                  <Checkbox
                    checked={marcada}
                    onCheckedChange={(v) => toggleClase(cls.id, v === true)}
                  />
                  <span
                    className="h-3 w-3 rounded-sm shrink-0"
                    style={{ backgroundColor: cls.color }}
                  />
                  <span className={`text-sm truncate ${marcada ? '' : 'text-muted-foreground line-through'}`}>
                    {cls.name}
                  </span>
                </label>
              );
            })}
          </div>

          {elegidas.length === 0 ? (
            <p className="text-xs text-amber-500">
              <i className="fas fa-triangle-exclamation mr-1" />
              {t('training.classes.noneSelected')}
            </p>
          ) : (
            <p className="text-xs text-muted-foreground">
              {t('training.classes.summary', {
                selected: elegidas.length,
                total: classes.length,
              })}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
