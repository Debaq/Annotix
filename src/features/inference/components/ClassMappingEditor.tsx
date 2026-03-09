import { useTranslation } from 'react-i18next';
import type { ClassMapping } from '../types';

interface ClassDef {
  id: number;
  name: string;
  color: string;
}

interface ClassMappingEditorProps {
  mapping: ClassMapping[];
  projectClasses: ClassDef[];
  onChange: (mapping: ClassMapping[]) => void;
}

export function ClassMappingEditor({ mapping, projectClasses, onChange }: ClassMappingEditorProps) {
  const { t } = useTranslation('inference');

  const handleChange = (modelClassId: number, projectClassId: string | null) => {
    const updated = mapping.map((m) =>
      m.modelClassId === modelClassId
        ? { ...m, projectClassId }
        : m,
    );
    onChange(updated);
  };

  // Auto-mapeo por nombre
  const autoMap = () => {
    const updated = mapping.map((m) => {
      const match = projectClasses.find(
        (c) => c.name.toLowerCase() === m.modelClassName.toLowerCase(),
      );
      return {
        ...m,
        projectClassId: match ? String(match.id) : m.projectClassId,
      };
    });
    onChange(updated);
  };

  if (mapping.length === 0) {
    return (
      <p className="text-xs text-gray-500 italic">
        {t('noClassMapping')}
      </p>
    );
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <h4 className="text-xs font-medium text-gray-400 uppercase tracking-wider">
          {t('classMapping')}
        </h4>
        <button
          onClick={autoMap}
          className="text-xs text-emerald-400 hover:text-emerald-300 transition-colors"
        >
          Auto-map
        </button>
      </div>
      <div className="space-y-1 max-h-48 overflow-y-auto">
        {mapping.map((m) => (
          <div
            key={m.modelClassId}
            className="flex items-center gap-2 text-xs"
          >
            <span className="flex-1 truncate text-gray-300 font-mono">
              {m.modelClassName}
            </span>
            <i className="fas fa-arrow-right text-gray-600 text-[10px]" />
            <select
              value={m.projectClassId || ''}
              onChange={(e) =>
                handleChange(m.modelClassId, e.target.value || null)
              }
              className="flex-1 bg-gray-800 border border-gray-700 rounded px-2 py-1 text-gray-300 text-xs"
            >
              <option value="">{t('unmapped')}</option>
              {projectClasses.map((c) => (
                <option key={c.id} value={String(c.id)}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
        ))}
      </div>
    </div>
  );
}
