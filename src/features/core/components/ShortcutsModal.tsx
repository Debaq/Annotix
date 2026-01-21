import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
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
  const [categories] = useState<ShortcutCategory[]>(shortcutsManager.getShortcutsByCategory());

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

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
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
            <TabsContent key={getCategoryTab(category.name)} value={getCategoryTab(category.name)}>
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
                    <Badge variant="secondary" className="shortcut-key">
                      {shortcut.key}
                    </Badge>
                  </div>
                ))}
              </div>
            </TabsContent>
          ))}
        </Tabs>

        <div className="mt-4 p-3 bg-muted rounded-lg text-sm text-muted-foreground">
          💡 <strong>Tip:</strong> {t('shortcuts.tip')}
        </div>
      </DialogContent>
    </Dialog>
  );
};
