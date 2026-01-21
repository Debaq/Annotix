import { useEffect } from 'react';
import { shortcutsManager } from '@/features/core/utils/ShortcutsManager';

/**
 * Hook para registrar handlers de atajos de teclado
 * @param shortcutId - ID del atajo
 * @param handler - Función a ejecutar cuando se presione el atajo
 * @param dependencies - Dependencias para el efecto
 */
export const useShortcut = (
  shortcutId: string,
  handler: () => void,
  dependencies: unknown[] = []
): void => {
  useEffect(() => {
    shortcutsManager.registerHandler(shortcutId, () => {
      handler();
    });
  }, [shortcutId, handler, ...dependencies]);
};

/**
 * Hook para escuchar cambios en los atajos
 * @param callback - Función a ejecutar cuando se presione un atajo
 */
export const useShortcutsListener = (
  callback: (shortcutId: string) => void
): void => {
  useEffect(() => {
    const unsubscribe = shortcutsManager.addListener(shortcut => {
      callback(shortcut.id);
    });

    return unsubscribe;
  }, [callback]);
};

/**
 * Hook para habilitar/deshabilitar atajos
 * @param enabled - Si los atajos deben estar habilitados
 */
export const useShortcutsEnabled = (enabled: boolean): void => {
  useEffect(() => {
    shortcutsManager.setEnabled(enabled);
  }, [enabled]);
};

/**
 * Hook para obtener todos los atajos
 */
export const useAllShortcuts = () => {
  return shortcutsManager.getAllShortcuts();
};

/**
 * Hook para obtener atajos por categoría
 */
export const useShortcutsByCategory = () => {
  return shortcutsManager.getShortcutsByCategory();
};
