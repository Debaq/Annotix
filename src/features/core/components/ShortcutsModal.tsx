import React, { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { shortcutsManager } from '@/features/core/utils/ShortcutsManager';
import type { ShortcutCategory } from '@/features/core/utils/ShortcutsManager';
import '@/styles/ShortcutsModal.css';

interface ShortcutsModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export const ShortcutsModal: React.FC<ShortcutsModalProps> = ({ open, onOpenChange }) => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [categories, setCategories] = useState<ShortcutCategory[]>(shortcutsManager.getShortcutsByCategory());

  const refreshCategories = useCallback(() => {
    setCategories(shortcutsManager.getShortcutsByCategory());
  }, []);

  // Reaccionar a cambios de bindings
  useEffect(() => {
    const unsubscribe = shortcutsManager.addChangeListener(refreshCategories);
    return unsubscribe;
  }, [refreshCategories]);

  // Refrescar al abrir
  useEffect(() => {
    if (open) refreshCategories();
  }, [open, refreshCategories]);

  const getCategoryIcon = (categoryKey: string): string => {
    const categoryToIcon: Record<string, string> = {
      'general': '⚙️',
      'navigation': '🗺️',
      'tools': '🛠️',
      'editing': '✏️',
    };
    return categoryToIcon[categoryKey] || '📋';
  };

  const getCategoryTab = (categoryKey: string): string => {
    // categoryKey es la clave completa como "shortcuts.categories.general"
    // Extraemos solo la última parte
    const parts = categoryKey.split('.');
    return parts[parts.length - 1] || 'general';
  };

  const handleCustomize = () => {
    onOpenChange(false);
    navigate('/settings');
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl overflow-hidden">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <span>⌨️</span>
            <span>{t('shortcuts.title')}</span>
          </DialogTitle>
        </DialogHeader>

        <Tabs defaultValue="general" className="w-full">
          <TabsList className="grid w-full grid-cols-4">
            {categories.map(category => (
              <TabsTrigger key={getCategoryTab(category.name)} value={getCategoryTab(category.name)}>
                <span className="mr-1">{getCategoryIcon(category.name)}</span>
                <span className="hidden sm:inline">{t(category.name)}</span>
              </TabsTrigger>
            ))}
          </TabsList>

          {categories.map(category => (
            <TabsContent
              key={getCategoryTab(category.name)}
              value={getCategoryTab(category.name)}
              className="shortcuts-panel"
            >
              <div className="shortcuts-grid">
                {category.shortcuts.map(shortcut => (
                  <div key={shortcut.id} className="shortcut-item">
                    <div className="shortcut-content">
                      <div className="shortcut-name">
                        <strong>{t(shortcut.nameKey)}</strong>
                        {shortcut.descriptionKey && (
                          <p className="shortcut-description">{t(shortcut.descriptionKey)}</p>
                        )}
                      </div>
                    </div>
                    <Badge
                      variant={shortcutsManager.isCustomized(shortcut.id) ? 'default' : 'secondary'}
                      className={`shortcut-key ${
                        shortcutsManager.isCustomized(shortcut.id)
                          ? 'bg-amber-500/20 text-amber-700 dark:text-amber-400 border-amber-300'
                          : ''
                      }`}
                    >
                      {shortcut.key}
                    </Badge>
                  </div>
                ))}
              </div>
            </TabsContent>
          ))}
        </Tabs>

        <div className="mt-4 p-3 bg-muted rounded-lg text-sm text-muted-foreground flex items-center justify-between">
          <span>💡 <strong>Tip:</strong> {t('shortcuts.tip')}</span>
          <button
            onClick={handleCustomize}
            className="text-xs text-[var(--annotix-primary)] hover:underline whitespace-nowrap ml-4"
          >
            {t('settings.shortcuts.customize')}
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
};
