/**
 * matchShortcut — utilidad para comparar eventos de teclado contra shortcuts configurados
 */

import { shortcutsManager } from './ShortcutsManager';

/**
 * Normaliza un KeyboardEvent a una representación canónica (ej: "Ctrl+S", "B", "Del")
 */
export function buildDisplayKey(e: KeyboardEvent): string {
  const parts: string[] = [];

  if (e.ctrlKey || e.metaKey) parts.push('Ctrl');
  if (e.shiftKey) parts.push('Shift');
  if (e.altKey) parts.push('Alt');

  const key = e.key;

  if (key === 'Delete') {
    parts.push('Del');
  } else if (key === 'Backspace') {
    parts.push('Backspace');
  } else if (key === 'Escape') {
    parts.push('Esc');
  } else if (key === 'Enter') {
    parts.push('Enter');
  } else if (key === ' ') {
    parts.push('Space');
  } else if (key === 'ArrowLeft') {
    parts.push('←');
  } else if (key === 'ArrowRight') {
    parts.push('→');
  } else if (key === 'ArrowUp') {
    parts.push('↑');
  } else if (key === 'ArrowDown') {
    parts.push('↓');
  } else if (key === 'PageUp') {
    parts.push('PageUp');
  } else if (key === 'PageDown') {
    parts.push('PageDown');
  } else if (key.length === 1) {
    // Caracteres simples: normalizar a mayúsculas
    parts.push(key.toUpperCase());
  } else if (!['Control', 'Shift', 'Alt', 'Meta'].includes(key)) {
    parts.push(key);
  }

  return parts.join('+');
}

/**
 * Normaliza un string de tecla definido en shortcut a forma canónica para comparación
 * Ej: "Ctrl+S" → "CTRL+S", "←" → "←", "Del / Backspace" → "DEL|BACKSPACE"
 */
function normalizeShortcutKey(key: string): string {
  // Soportar " / " y "|" como separadores OR
  return key
    .split(/\s*[/|]\s*/)
    .map(part => part.replace(/\s+/g, '').toUpperCase())
    .join('|');
}

/**
 * Compara un KeyboardEvent contra un shortcut registrado por su ID.
 * Retorna true si el evento coincide con la tecla configurada del shortcut.
 * Soporta teclas compuestas con " / " o "|" como OR (ej: "Del / Backspace").
 */
export function matchesShortcut(e: KeyboardEvent, shortcutId: string): boolean {
  const shortcut = shortcutsManager.getShortcut(shortcutId);
  if (!shortcut || shortcut.enabled === false) return false;

  const eventKey = buildDisplayKey(e).toUpperCase();
  const normalizedOptions = normalizeShortcutKey(shortcut.key);

  // Comprobar cada alternativa separada por |
  const options = normalizedOptions.split('|');
  return options.some(option => option === eventKey);
}
