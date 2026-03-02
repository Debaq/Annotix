import { useState, useEffect } from 'react';
import { shortcutsManager } from '../utils/ShortcutsManager';

/**
 * Hook reactivo que retorna la tecla actual configurada para un shortcut.
 * Se actualiza automáticamente cuando el usuario personaliza el binding.
 */
export function useShortcutKey(shortcutId: string): string {
  const [key, setKey] = useState(() => shortcutsManager.getKeyForShortcut(shortcutId));

  useEffect(() => {
    // Sincronizar si cambió entre renders
    setKey(shortcutsManager.getKeyForShortcut(shortcutId));

    const unsubscribe = shortcutsManager.addChangeListener(() => {
      setKey(shortcutsManager.getKeyForShortcut(shortcutId));
    });
    return unsubscribe;
  }, [shortcutId]);

  return key;
}
