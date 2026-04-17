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
  const { t } = useTranslation();

  const handleChange = (modelClassId: number, projectClassId: string | null) => {
    const updated = mapping.map((m) =>
      m.modelClassId === modelClassId ? { ...m, projectClassId } : m,
    );
    onChange(updated);
  };

  const handleRename = (modelClassId: number, name: string) => {
    const updated = mapping.map((m) =>
      m.modelClassId === modelClassId ? { ...m, modelClassName: name } : m,
    );
    onChange(updated);
  };

  const handleRemove = (modelClassId: number) => {
    // Filtrar y reindexar los modelClassId restantes
    const filtered = mapping.filter((m) => m.modelClassId !== modelClassId);
    const reindexed = filtered.map((m, i) => ({ ...m, modelClassId: i }));
    onChange(reindexed);
  };

  const handleAdd = () => {
    const nextId = mapping.length;
    onChange([
      ...mapping,
      {
        modelClassId: nextId,
        modelClassName: `class_${nextId}`,
        projectClassId: null,
      },
    ]);
  };

  const handleSetCount = (nRaw: number) => {
    const n = Math.max(0, Math.min(1000, Math.floor(nRaw)));
    if (n === mapping.length) return;
    if (n < mapping.length) {
      onChange(mapping.slice(0, n));
      return;
    }
    const extras = Array.from({ length: n - mapping.length }, (_, i) => {
      const id = mapping.length + i;
      return {
        modelClassId: id,
        modelClassName: `class_${id}`,
        projectClassId: null,
      };
    });
    onChange([...mapping, ...extras]);
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

  // Mapeo 1:1 por índice
  const mapByIndex = () => {
    const updated = mapping.map((m) => {
      const byIndex = projectClasses[m.modelClassId];
      return {
        ...m,
        projectClassId: byIndex ? String(byIndex.id) : m.projectClassId,
      };
    });
    onChange(updated);
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <h4 className="text-xs font-medium text-gray-400 uppercase tracking-wider">
          {t('inference.classMapping')}
        </h4>
        <div className="flex items-center gap-2">
          {mapping.length > 0 && (
            <>
              <button
                onClick={autoMap}
                className="text-xs text-emerald-400 hover:text-emerald-300 transition-colors"
                title="Mapear por nombre"
              >
                Auto (nombre)
              </button>
              <button
                onClick={mapByIndex}
                className="text-xs text-sky-400 hover:text-sky-300 transition-colors"
                title="Mapear por índice"
              >
                Por índice
              </button>
            </>
          )}
          <button
            onClick={handleAdd}
            className="text-xs text-purple-400 hover:text-purple-300 transition-colors"
            title="Agregar clase del modelo"
          >
            <i className="fas fa-plus mr-1" />
            Agregar
          </button>
        </div>
      </div>

      <div className="flex items-center gap-2 text-xs">
        <label className="text-gray-400">N° de clases del modelo:</label>
        <input
          type="number"
          min={0}
          max={1000}
          value={mapping.length}
          onChange={(e) => handleSetCount(Number(e.target.value))}
          className="w-20 bg-gray-800 border border-gray-700 rounded px-2 py-1 text-gray-200 font-mono text-xs"
        />
        <span className="text-gray-500 italic">
          (genera class_0…class_N-1)
        </span>
      </div>

      {mapping.length === 0 ? (
        <p className="text-xs text-gray-500 italic">
          {t('inference.noClassMapping')}
        </p>
      ) : (
        <div className="space-y-1 max-h-60 overflow-y-auto">
          {mapping.map((m) => (
            <div key={m.modelClassId} className="flex items-center gap-2 text-xs">
              <span className="w-6 text-right text-gray-500 font-mono">
                {m.modelClassId}
              </span>
              <input
                value={m.modelClassName}
                onChange={(e) => handleRename(m.modelClassId, e.target.value)}
                className="flex-1 min-w-0 bg-gray-800 border border-gray-700 rounded px-2 py-1 text-gray-200 font-mono text-xs"
              />
              <i className="fas fa-arrow-right text-gray-600 text-[10px]" />
              <select
                value={m.projectClassId || ''}
                onChange={(e) => handleChange(m.modelClassId, e.target.value || null)}
                className="flex-1 min-w-0 bg-gray-800 border border-gray-700 rounded px-2 py-1 text-gray-300 text-xs"
              >
                <option value="">{t('inference.unmapped')}</option>
                {projectClasses.map((c) => (
                  <option key={c.id} value={String(c.id)}>
                    [{c.id}] {c.name}
                  </option>
                ))}
              </select>
              <button
                onClick={() => handleRemove(m.modelClassId)}
                className="text-red-400 hover:text-red-300 text-xs px-1"
                title="Eliminar"
              >
                <i className="fas fa-times" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
