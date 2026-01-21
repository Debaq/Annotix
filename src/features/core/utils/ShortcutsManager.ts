/**
 * ShortcutsManager - Gestiona los atajos de teclado y su visualización
 */

export interface Shortcut {
  id: string;
  nameKey: string; // Clave de traducción para el nombre
  key: string;
  descriptionKey?: string; // Clave de traducción para la descripción
  category: 'navigation' | 'tools' | 'general' | 'editing';
  handler?: (e: KeyboardEvent) => void;
  enabled?: boolean;
}

export interface ShortcutCategory {
  name: string;
  description?: string;
  shortcuts: Shortcut[];
}

class ShortcutsManager {
  private shortcuts: Map<string, Shortcut> = new Map();
  private listeners: Set<(shortcut: Shortcut) => void> = new Set();
  private enabled: boolean = true;

  constructor() {
    this.initializeDefaultShortcuts();
    this.setupEventListeners();
  }

  /**
   * Inicializa los atajos por defecto
   */
  private initializeDefaultShortcuts(): void {
    const defaultShortcuts: Shortcut[] = [
      // General
      {
        id: 'save',
        nameKey: 'shortcuts.items.save.name',
        key: 'Ctrl+S',
        category: 'general',
        enabled: true,
      },
      {
        id: 'undo',
        nameKey: 'shortcuts.items.undo.name',
        key: 'Ctrl+Z',
        category: 'general',
        enabled: true,
      },
      {
        id: 'redo',
        nameKey: 'shortcuts.items.redo.name',
        key: 'Ctrl+Y',
        category: 'general',
        enabled: true,
      },
      {
        id: 'delete',
        nameKey: 'shortcuts.items.delete.name',
        key: 'Del / Backspace',
        descriptionKey: 'shortcuts.items.delete.description',
        category: 'editing',
        enabled: true,
      },
      {
        id: 'deselect',
        nameKey: 'shortcuts.items.deselect.name',
        key: 'Esc',
        category: 'general',
        enabled: true,
      },

      // Navegación
      {
        id: 'prev-image',
        nameKey: 'shortcuts.items.prevImage.name',
        key: '←',
        category: 'navigation',
        enabled: true,
      },
      {
        id: 'next-image',
        nameKey: 'shortcuts.items.nextImage.name',
        key: '→',
        category: 'navigation',
        enabled: true,
      },
      {
        id: 'zoom-in',
        nameKey: 'shortcuts.items.zoomIn.name',
        key: 'Ctrl++',
        category: 'navigation',
        enabled: true,
      },
      {
        id: 'zoom-out',
        nameKey: 'shortcuts.items.zoomOut.name',
        key: 'Ctrl+-',
        category: 'navigation',
        enabled: true,
      },
      {
        id: 'zoom-fit',
        nameKey: 'shortcuts.items.zoomFit.name',
        key: 'Ctrl+0',
        category: 'navigation',
        enabled: true,
      },

      // Herramientas
      {
        id: 'tool-box',
        nameKey: 'shortcuts.items.toolBox.name',
        key: 'B',
        descriptionKey: 'shortcuts.items.toolBox.description',
        category: 'tools',
        enabled: true,
      },
      {
        id: 'tool-obb',
        nameKey: 'shortcuts.items.toolOBB.name',
        key: 'O',
        descriptionKey: 'shortcuts.items.toolOBB.description',
        category: 'tools',
        enabled: true,
      },
      {
        id: 'tool-mask',
        nameKey: 'shortcuts.items.toolMask.name',
        key: 'M',
        descriptionKey: 'shortcuts.items.toolMask.description',
        category: 'tools',
        enabled: true,
      },
      {
        id: 'tool-polygon',
        nameKey: 'shortcuts.items.toolPolygon.name',
        key: 'P',
        descriptionKey: 'shortcuts.items.toolPolygon.description',
        category: 'tools',
        enabled: true,
      },
      {
        id: 'tool-keypoints',
        nameKey: 'shortcuts.items.toolKeypoints.name',
        key: 'K',
        descriptionKey: 'shortcuts.items.toolKeypoints.description',
        category: 'tools',
        enabled: true,
      },
      {
        id: 'tool-select',
        nameKey: 'shortcuts.items.toolSelect.name',
        key: 'V',
        descriptionKey: 'shortcuts.items.toolSelect.description',
        category: 'tools',
        enabled: true,
      },
      {
        id: 'tool-pan',
        nameKey: 'shortcuts.items.toolPan.name',
        key: 'H',
        descriptionKey: 'shortcuts.items.toolPan.description',
        category: 'tools',
        enabled: true,
      },
      {
        id: 'rotate-left',
        nameKey: 'shortcuts.items.rotateLeft.name',
        key: 'A',
        category: 'tools',
        enabled: true,
      },
      {
        id: 'rotate-right',
        nameKey: 'shortcuts.items.rotateRight.name',
        key: 'D',
        category: 'tools',
        enabled: true,
      },

      // Clases
      {
        id: 'class-1',
        nameKey: 'shortcuts.items.class1.name',
        key: '1',
        category: 'editing',
        enabled: true,
      },
      {
        id: 'class-2',
        nameKey: 'shortcuts.items.class2.name',
        key: '2',
        category: 'editing',
        enabled: true,
      },
      {
        id: 'class-3',
        nameKey: 'shortcuts.items.class3.name',
        key: '3',
        category: 'editing',
        enabled: true,
      },
      {
        id: 'class-4',
        nameKey: 'shortcuts.items.class4.name',
        key: '4',
        category: 'editing',
        enabled: true,
      },
      {
        id: 'class-5',
        nameKey: 'shortcuts.items.class5.name',
        key: '5',
        category: 'editing',
        enabled: true,
      },
      {
        id: 'class-6',
        nameKey: 'shortcuts.items.class6.name',
        key: '6',
        category: 'editing',
        enabled: true,
      },
      {
        id: 'class-7',
        nameKey: 'shortcuts.items.class7.name',
        key: '7',
        category: 'editing',
        enabled: true,
      },
      {
        id: 'class-8',
        nameKey: 'shortcuts.items.class8.name',
        key: '8',
        category: 'editing',
        enabled: true,
      },
      {
        id: 'class-9',
        nameKey: 'shortcuts.items.class9.name',
        key: '9',
        category: 'editing',
        enabled: true,
      },
    ];

    defaultShortcuts.forEach(shortcut => {
      this.shortcuts.set(shortcut.id, shortcut);
    });
  }

  /**
   * Configura los event listeners globales para los atajos
   */
  private setupEventListeners(): void {
    document.addEventListener('keydown', (e: KeyboardEvent) => {
      if (!this.enabled) return;

      // Prevenir si se está escribiendo en un input o textarea
      if (this.isInputElement(e.target as HTMLElement)) {
        return;
      }

      const shortcutKey = this.getShortcutKey(e);
      this.shortcuts.forEach(shortcut => {
        if (shortcut.enabled && this.normalizeKey(shortcut.key) === shortcutKey) {
          if (shortcut.handler) {
            e.preventDefault();
            shortcut.handler(e);
          }
          this.notifyListeners(shortcut);
        }
      });
    });
  }

  /**
   * Obtiene la combinación de tecla presionada
   */
  private getShortcutKey(e: KeyboardEvent): string {
    const parts: string[] = [];

    if (e.ctrlKey || e.metaKey) parts.push('Ctrl');
    if (e.shiftKey) parts.push('Shift');
    if (e.altKey) parts.push('Alt');

    const key = e.key.toUpperCase();
    if (key.length === 1 || key.includes('Arrow')) {
      if (key.startsWith('Arrow')) {
        parts.push(key.replace('Arrow', ''));
      } else if (key !== 'Control' && key !== 'Shift' && key !== 'Alt' && key !== 'Meta') {
        parts.push(key);
      }
    } else if (key === 'Delete') {
      parts.push('Del');
    } else if (key !== 'Control' && key !== 'Shift' && key !== 'Alt' && key !== 'Meta') {
      parts.push(key);
    }

    return parts.join('+');
  }

  /**
   * Normaliza el nombre de la tecla para comparación
   */
  private normalizeKey(key: string): string {
    return key.replace(/\s+/g, '').toUpperCase();
  }

  /**
   * Verifica si el elemento es un input
   */
  private isInputElement(element: HTMLElement): boolean {
    return (
      element instanceof HTMLInputElement ||
      element instanceof HTMLTextAreaElement ||
      element.contentEditable === 'true'
    );
  }

  /**
   * Notifica a los listeners sobre un atajo ejecutado
   */
  private notifyListeners(shortcut: Shortcut): void {
    this.listeners.forEach(listener => listener(shortcut));
  }

  /**
   * Registra un handler para un atajo específico
   */
  registerHandler(shortcutId: string, handler: (e: KeyboardEvent) => void): void {
    const shortcut = this.shortcuts.get(shortcutId);
    if (shortcut) {
      shortcut.handler = handler;
    }
  }

  /**
   * Habilita o deshabilita un atajo
   */
  setShortcutEnabled(shortcutId: string, enabled: boolean): void {
    const shortcut = this.shortcuts.get(shortcutId);
    if (shortcut) {
      shortcut.enabled = enabled;
    }
  }

  /**
   * Habilita o deshabilita todos los atajos
   */
  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
  }

  /**
   * Obtiene todos los atajos agrupados por categoría
   */
  getShortcutsByCategory(): ShortcutCategory[] {
    const categories: Map<string, Shortcut[]> = new Map();

    this.shortcuts.forEach(shortcut => {
      if (!categories.has(shortcut.category)) {
        categories.set(shortcut.category, []);
      }
      categories.get(shortcut.category)!.push(shortcut);
    });

    const categoryLabelKeys: Record<string, string> = {
      general: 'shortcuts.categories.general',
      navigation: 'shortcuts.categories.navigation',
      tools: 'shortcuts.categories.tools',
      editing: 'shortcuts.categories.editing',
    };

    const order = ['general', 'navigation', 'tools', 'editing'];

    return Array.from(categories.entries())
      .map(([key, shortcuts]) => ({
        name: categoryLabelKeys[key] || key,
        shortcuts: shortcuts.sort((a, b) => a.nameKey.localeCompare(b.nameKey)),
      }))
      .sort((a, b) => {
        const aOrder = order.indexOf(Object.keys(categoryLabelKeys).find(k => categoryLabelKeys[k] === a.name) || '');
        const bOrder = order.indexOf(Object.keys(categoryLabelKeys).find(k => categoryLabelKeys[k] === b.name) || '');
        return aOrder - bOrder;
      });
  }

  /**
   * Obtiene un atajo específico
   */
  getShortcut(shortcutId: string): Shortcut | undefined {
    return this.shortcuts.get(shortcutId);
  }

  /**
   * Obtiene todos los atajos
   */
  getAllShortcuts(): Shortcut[] {
    return Array.from(this.shortcuts.values());
  }

  /**
   * Agrega un listener para cambios en atajos
   */
  addListener(listener: (shortcut: Shortcut) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /**
   * Personaliza un atajo existente
   */
  updateShortcut(shortcutId: string, updates: Partial<Shortcut>): void {
    const shortcut = this.shortcuts.get(shortcutId);
    if (shortcut) {
      Object.assign(shortcut, updates);
    }
  }
}

// Exportar instancia singleton
export const shortcutsManager = new ShortcutsManager();

export default ShortcutsManager;
