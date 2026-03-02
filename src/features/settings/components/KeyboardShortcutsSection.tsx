import { useState, useEffect, useCallback, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { shortcutsManager } from '@/features/core/utils/ShortcutsManager';
import { buildDisplayKey } from '@/features/core/utils/matchShortcut';
import type { ShortcutCategory, Shortcut } from '@/features/core/utils/ShortcutsManager';

export function KeyboardShortcutsSection() {
  const { t } = useTranslation();
  const [categories, setCategories] = useState<ShortcutCategory[]>([]);
  const [capturingId, setCapturingId] = useState<string | null>(null);
  const [conflict, setConflict] = useState<{ shortcutId: string; conflictWith: Shortcut } | null>(null);
  const [, forceUpdate] = useState(0);
  const captureRef = useRef<string | null>(null);

  // Mantener ref sincronizada para el handler de keydown
  captureRef.current = capturingId;

  const refreshCategories = useCallback(() => {
    setCategories(shortcutsManager.getShortcutsByCategory());
  }, []);

  useEffect(() => {
    refreshCategories();
    const unsubscribe = shortcutsManager.addChangeListener(() => {
      refreshCategories();
      forceUpdate(n => n + 1);
    });
    return unsubscribe;
  }, [refreshCategories]);

  // Captura de tecla
  useEffect(() => {
    if (!capturingId) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      e.preventDefault();
      e.stopPropagation();

      // Escape cancela la captura
      if (e.key === 'Escape') {
        setCapturingId(null);
        setConflict(null);
        return;
      }

      // Ignorar teclas modificadoras solas
      if (['Control', 'Shift', 'Alt', 'Meta'].includes(e.key)) return;

      const newKey = buildDisplayKey(e);
      const currentId = captureRef.current;
      if (!currentId) return;

      // Verificar conflictos
      const conflictShortcut = shortcutsManager.findConflict(currentId, newKey);
      if (conflictShortcut) {
        setConflict({ shortcutId: currentId, conflictWith: conflictShortcut });
        setCapturingId(null);
        return;
      }

      // Asignar nueva tecla
      shortcutsManager.updateShortcut(currentId, { key: newKey });
      setCapturingId(null);
      setConflict(null);
    };

    // Usar capture para interceptar antes que otros handlers
    window.addEventListener('keydown', handleKeyDown, true);
    return () => window.removeEventListener('keydown', handleKeyDown, true);
  }, [capturingId]);

  // Desactivar ShortcutsManager global durante captura
  useEffect(() => {
    if (capturingId) {
      shortcutsManager.setEnabled(false);
    } else {
      shortcutsManager.setEnabled(true);
    }
    return () => {
      shortcutsManager.setEnabled(true);
    };
  }, [capturingId]);

  const handleResetAll = () => {
    shortcutsManager.resetAllShortcuts();
    setConflict(null);
  };

  const handleResetOne = (id: string) => {
    shortcutsManager.resetShortcut(id);
    if (conflict?.shortcutId === id) setConflict(null);
  };

  const handleStartCapture = (id: string) => {
    setConflict(null);
    setCapturingId(id);
  };

  const getCategoryTab = (categoryKey: string): string => {
    const parts = categoryKey.split('.');
    return parts[parts.length - 1] || 'general';
  };

  const hasAnyCustomized = categories.some(cat =>
    cat.shortcuts.some(s => shortcutsManager.isCustomized(s.id))
  );

  return (
    <div className="space-y-6">
      {/* Header con botón global reset */}
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          {t('settings.shortcuts.description')}
        </p>
        {hasAnyCustomized && (
          <Button
            variant="outline"
            size="sm"
            onClick={handleResetAll}
          >
            <i className="fas fa-undo mr-2" />
            {t('settings.shortcuts.resetAll')}
          </Button>
        )}
      </div>

      {/* Mensaje de conflicto */}
      {conflict && (
        <div className="p-3 rounded-lg bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 text-sm text-red-700 dark:text-red-400">
          <i className="fas fa-exclamation-triangle mr-2" />
          {t('settings.shortcuts.conflict', {
            name: t(conflict.conflictWith.nameKey),
          })}
        </div>
      )}

      {/* Lista por categoría */}
      {categories.map(category => (
        <div key={getCategoryTab(category.name)}>
          <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3">
            {t(category.name)}
          </h3>
          <div className="space-y-1">
            {category.shortcuts.map(shortcut => {
              const isCapturing = capturingId === shortcut.id;
              const isEditable = shortcut.editable !== false;
              const isCustom = shortcutsManager.isCustomized(shortcut.id);

              return (
                <div
                  key={shortcut.id}
                  className="flex items-center justify-between px-3 py-2 rounded-lg hover:bg-muted/50 transition-colors"
                >
                  <div className="flex-1 min-w-0">
                    <span className="text-sm font-medium">
                      {t(shortcut.nameKey)}
                    </span>
                    {shortcut.descriptionKey && (
                      <p className="text-xs text-muted-foreground truncate">
                        {t(shortcut.descriptionKey)}
                      </p>
                    )}
                    {shortcut.context && (
                      <span className="text-[10px] text-muted-foreground/60 ml-1">
                        [{shortcut.context}]
                      </span>
                    )}
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    {isCustom && isEditable && (
                      <button
                        onClick={() => handleResetOne(shortcut.id)}
                        className="text-muted-foreground hover:text-foreground transition-colors p-1"
                        title={t('settings.shortcuts.resetOne')}
                      >
                        <i className="fas fa-undo text-xs" />
                      </button>
                    )}
                    <Badge
                      variant={isCapturing ? 'default' : isCustom ? 'default' : 'secondary'}
                      className={`min-w-[60px] justify-center text-xs font-mono ${
                        isEditable ? 'cursor-pointer' : 'cursor-default opacity-70'
                      } ${isCapturing ? 'animate-pulse bg-blue-500 text-white' : ''} ${
                        isCustom && !isCapturing ? 'bg-amber-500/20 text-amber-700 dark:text-amber-400 border-amber-300' : ''
                      }`}
                      onClick={() => {
                        if (isEditable && !isCapturing) {
                          handleStartCapture(shortcut.id);
                        }
                      }}
                    >
                      {isCapturing
                        ? t('settings.shortcuts.pressKey')
                        : shortcut.key
                      }
                    </Badge>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
