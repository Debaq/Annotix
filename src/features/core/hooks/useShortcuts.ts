import { useEffect, useRef } from 'react';
import { shortcutsManager } from '@/features/core/utils/ShortcutsManager';

/**
 * Hook para registrar handlers de atajos de teclado
 * @param shortcutId - ID del atajo
 * @param handler - Función a ejecutar cuando se presione el atajo. Se lee por
 *   ref, así que siempre corre la última versión sin re-registrar el handler.
 */
export const useShortcut = (shortcutId: string, handler: () => void): void => {
  const handlerRef = useRef(handler);
  handlerRef.current = handler;

  useEffect(() => {
    shortcutsManager.registerHandler(shortcutId, () => {
      handlerRef.current();
    });
  }, [shortcutId]);
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
