/**
 * ShortcutsManager - Gestiona los atajos de teclado y su visualización
 */

const STORAGE_KEY = 'annotix-keyboard-shortcuts';

export interface Shortcut {
  id: string;
  nameKey: string; // Clave de traducción para el nombre
  key: string;
  descriptionKey?: string; // Clave de traducción para la descripción
  category: 'navigation' | 'tools' | 'general' | 'editing';
  context?: string; // Contexto: 'image' | 'video' | 'timeseries' | undefined (global)
  handler?: (e: KeyboardEvent) => void;
  enabled?: boolean;
  editable?: boolean; // false para atajos que no se pueden personalizar
}

export interface ShortcutCategory {
  name: string;
  description?: string;
  shortcuts: Shortcut[];
}

class ShortcutsManager {
  private shortcuts: Map<string, Shortcut> = new Map();
  private defaultKeys: Map<string, string> = new Map(); // Mapa inmutable de defaults
  private listeners: Set<(shortcut: Shortcut) => void> = new Set();
  private changeListeners: Set<() => void> = new Set(); // Para re-renders reactivos
  private enabled: boolean = true;

  constructor() {
    this.initializeDefaultShortcuts();
    this.loadCustomBindings();
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
        editable: true,
      },
      {
        id: 'undo',
        nameKey: 'shortcuts.items.undo.name',
        key: 'Ctrl+Z',
        category: 'general',
        enabled: true,
        editable: true,
      },
      {
        id: 'redo',
        nameKey: 'shortcuts.items.redo.name',
        key: 'Ctrl+Y',
        category: 'general',
        enabled: true,
        editable: true,
      },
      {
        id: 'delete',
        nameKey: 'shortcuts.items.delete.name',
        key: 'Del / Backspace',
        descriptionKey: 'shortcuts.items.delete.description',
        category: 'editing',
        enabled: true,
        editable: true,
      },
      {
        id: 'deselect',
        nameKey: 'shortcuts.items.deselect.name',
        key: 'Esc',
        category: 'general',
        enabled: true,
        editable: true,
      },

      // Navegación
      {
        id: 'prev-image',
        nameKey: 'shortcuts.items.prevImage.name',
        key: '←',
        category: 'navigation',
        enabled: true,
        editable: true,
      },
      {
        id: 'next-image',
        nameKey: 'shortcuts.items.nextImage.name',
        key: '→',
        category: 'navigation',
        enabled: true,
        editable: true,
      },
      {
        id: 'zoom-in',
        nameKey: 'shortcuts.items.zoomIn.name',
        key: 'Ctrl++',
        category: 'navigation',
        enabled: true,
        editable: true,
      },
      {
        id: 'zoom-out',
        nameKey: 'shortcuts.items.zoomOut.name',
        key: 'Ctrl+-',
        category: 'navigation',
        enabled: true,
        editable: true,
      },
      {
        id: 'zoom-fit',
        nameKey: 'shortcuts.items.zoomFit.name',
        key: 'Ctrl+0',
        category: 'navigation',
        enabled: true,
        editable: true,
      },

      // Herramientas de imagen
      {
        id: 'tool-box',
        nameKey: 'shortcuts.items.toolBox.name',
        key: 'B',
        descriptionKey: 'shortcuts.items.toolBox.description',
        category: 'tools',
        context: 'image',
        enabled: true,
        editable: true,
      },
      {
        id: 'tool-obb',
        nameKey: 'shortcuts.items.toolOBB.name',
        key: 'O',
        descriptionKey: 'shortcuts.items.toolOBB.description',
        category: 'tools',
        context: 'image',
        enabled: true,
        editable: true,
      },
      {
        id: 'tool-mask',
        nameKey: 'shortcuts.items.toolMask.name',
        key: 'M',
        descriptionKey: 'shortcuts.items.toolMask.description',
        category: 'tools',
        context: 'image',
        enabled: true,
        editable: true,
      },
      {
        id: 'tool-polygon',
        nameKey: 'shortcuts.items.toolPolygon.name',
        key: 'P',
        descriptionKey: 'shortcuts.items.toolPolygon.description',
        category: 'tools',
        context: 'image',
        enabled: true,
        editable: true,
      },
      {
        id: 'tool-keypoints',
        nameKey: 'shortcuts.items.toolKeypoints.name',
        key: 'K',
        descriptionKey: 'shortcuts.items.toolKeypoints.description',
        category: 'tools',
        context: 'image',
        enabled: true,
        editable: true,
      },
      {
        id: 'tool-landmarks',
        nameKey: 'shortcuts.items.toolLandmarks.name',
        key: 'L',
        descriptionKey: 'shortcuts.items.toolLandmarks.description',
        category: 'tools',
        context: 'image',
        enabled: true,
        editable: true,
      },
      {
        id: 'tool-select',
        nameKey: 'shortcuts.items.toolSelect.name',
        key: 'V',
        descriptionKey: 'shortcuts.items.toolSelect.description',
        category: 'tools',
        enabled: true,
        editable: true,
      },
      {
        id: 'tool-pan',
        nameKey: 'shortcuts.items.toolPan.name',
        key: 'H',
        descriptionKey: 'shortcuts.items.toolPan.description',
        category: 'tools',
        enabled: true,
        editable: true,
      },
      {
        id: 'mask-brush-size',
        nameKey: 'shortcuts.items.brushSize.name',
        key: '[ / ]',
        descriptionKey: 'shortcuts.items.brushSize.description',
        category: 'tools',
        context: 'image',
        enabled: true,
        editable: false, // Compuesto, no editable
      },
      {
        id: 'mask-erase-toggle',
        nameKey: 'shortcuts.items.eraseToggle.name',
        key: 'E',
        category: 'tools',
        context: 'image',
        enabled: true,
        editable: true,
      },
      {
        id: 'rotate-left',
        nameKey: 'shortcuts.items.rotateLeft.name',
        key: 'A',
        category: 'tools',
        context: 'image',
        enabled: true,
        editable: true,
      },
      {
        id: 'rotate-right',
        nameKey: 'shortcuts.items.rotateRight.name',
        key: 'D',
        category: 'tools',
        context: 'image',
        enabled: true,
        editable: true,
      },
      {
        id: 'confirm-drawing',
        nameKey: 'shortcuts.items.confirmDrawing.name',
        key: 'Enter',
        category: 'editing',
        context: 'image',
        enabled: true,
        editable: true,
      },
      {
        id: 'cancel-drawing',
        nameKey: 'shortcuts.items.cancelDrawing.name',
        key: 'Esc',
        category: 'editing',
        context: 'image',
        enabled: true,
        editable: true,
      },

      // Video
      {
        id: 'video-new-track',
        nameKey: 'shortcuts.items.videoNewTrack.name',
        key: 'T',
        category: 'editing',
        context: 'video',
        enabled: true,
        editable: true,
      },
      {
        id: 'video-prev-frame',
        nameKey: 'shortcuts.items.videoPrevFrame.name',
        key: '←',
        category: 'navigation',
        context: 'video',
        enabled: true,
        editable: true,
      },
      {
        id: 'video-next-frame',
        nameKey: 'shortcuts.items.videoNextFrame.name',
        key: '→',
        category: 'navigation',
        context: 'video',
        enabled: true,
        editable: true,
      },

      // Timeseries
      {
        id: 'ts-tool-select',
        nameKey: 'shortcuts.items.tsToolSelect.name',
        key: 'V',
        category: 'tools',
        context: 'timeseries',
        enabled: true,
        editable: true,
      },
      {
        id: 'ts-tool-point',
        nameKey: 'shortcuts.items.tsToolPoint.name',
        key: 'P',
        category: 'tools',
        context: 'timeseries',
        enabled: true,
        editable: true,
      },
      {
        id: 'ts-tool-range',
        nameKey: 'shortcuts.items.tsToolRange.name',
        key: 'R',
        category: 'tools',
        context: 'timeseries',
        enabled: true,
        editable: true,
      },
      {
        id: 'ts-tool-event',
        nameKey: 'shortcuts.items.tsToolEvent.name',
        key: 'E',
        category: 'tools',
        context: 'timeseries',
        enabled: true,
        editable: true,
      },
      {
        id: 'ts-tool-anomaly',
        nameKey: 'shortcuts.items.tsToolAnomaly.name',
        key: 'A',
        category: 'tools',
        context: 'timeseries',
        enabled: true,
        editable: true,
      },

      // Clases (no editables - sistema posicional)
      {
        id: 'class-1',
        nameKey: 'shortcuts.items.class1.name',
        key: '1',
        category: 'editing',
        enabled: true,
        editable: false,
      },
      {
        id: 'class-2',
        nameKey: 'shortcuts.items.class2.name',
        key: '2',
        category: 'editing',
        enabled: true,
        editable: false,
      },
      {
        id: 'class-3',
        nameKey: 'shortcuts.items.class3.name',
        key: '3',
        category: 'editing',
        enabled: true,
        editable: false,
      },
      {
        id: 'class-4',
        nameKey: 'shortcuts.items.class4.name',
        key: '4',
        category: 'editing',
        enabled: true,
        editable: false,
      },
      {
        id: 'class-5',
        nameKey: 'shortcuts.items.class5.name',
        key: '5',
        category: 'editing',
        enabled: true,
        editable: false,
      },
      {
        id: 'class-6',
        nameKey: 'shortcuts.items.class6.name',
        key: '6',
        category: 'editing',
        enabled: true,
        editable: false,
      },
      {
        id: 'class-7',
        nameKey: 'shortcuts.items.class7.name',
        key: '7',
        category: 'editing',
        enabled: true,
        editable: false,
      },
      {
        id: 'class-8',
        nameKey: 'shortcuts.items.class8.name',
        key: '8',
        category: 'editing',
        enabled: true,
        editable: false,
      },
      {
        id: 'class-9',
        nameKey: 'shortcuts.items.class9.name',
        key: '9',
        category: 'editing',
        enabled: true,
        editable: false,
      },
      {
        id: 'class-extended',
        nameKey: 'classes.title',
        key: '0, Q..P',
        category: 'editing',
        enabled: true,
        editable: false,
      },
    ];

    defaultShortcuts.forEach(shortcut => {
      this.shortcuts.set(shortcut.id, shortcut);
      this.defaultKeys.set(shortcut.id, shortcut.key);
    });
  }

  /**
   * Carga bindings personalizados desde localStorage
   */
  private loadCustomBindings(): void {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const bindings: Record<string, string> = JSON.parse(raw);
      for (const [id, key] of Object.entries(bindings)) {
        const shortcut = this.shortcuts.get(id);
        if (shortcut && shortcut.editable !== false) {
          shortcut.key = key;
        }
      }
    } catch {
      // Ignorar errores de localStorage corrupto
    }
  }

  /**
   * Guarda bindings personalizados en localStorage
   */
  private saveCustomBindings(): void {
    const bindings: Record<string, string> = {};
    this.shortcuts.forEach((shortcut, id) => {
      const defaultKey = this.defaultKeys.get(id);
      if (defaultKey && shortcut.key !== defaultKey && shortcut.editable !== false) {
        bindings[id] = shortcut.key;
      }
    });
    if (Object.keys(bindings).length === 0) {
      localStorage.removeItem(STORAGE_KEY);
    } else {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(bindings));
    }
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
   * Normaliza el nombre de la tecla para comparación (público para uso externo)
   */
  normalizeKey(key: string): string {
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
   * Notifica a los change listeners (para re-renders)
   */
  private notifyChangeListeners(): void {
    this.changeListeners.forEach(listener => listener());
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
   * Obtiene la tecla actual de un shortcut por ID
   */
  getKeyForShortcut(shortcutId: string): string {
    return this.shortcuts.get(shortcutId)?.key ?? '';
  }

  /**
   * Verifica si un shortcut ha sido personalizado (distinto al default)
   */
  isCustomized(shortcutId: string): boolean {
    const shortcut = this.shortcuts.get(shortcutId);
    const defaultKey = this.defaultKeys.get(shortcutId);
    if (!shortcut || !defaultKey) return false;
    return shortcut.key !== defaultKey;
  }

  /**
   * Busca conflicto: otro shortcut (en el mismo contexto) que ya use esa tecla
   * Retorna el shortcut en conflicto o null.
   */
  findConflict(shortcutId: string, newKey: string): Shortcut | null {
    const source = this.shortcuts.get(shortcutId);
    if (!source) return null;
    const normalizedNew = this.normalizeKey(newKey);

    for (const [id, shortcut] of this.shortcuts) {
      if (id === shortcutId) continue;
      if (shortcut.enabled === false) continue;
      // Solo conflicto si comparten contexto o alguno es global
      const sameContext =
        !source.context || !shortcut.context || source.context === shortcut.context;
      if (!sameContext) continue;

      // Comprobar cada alternativa del shortcut existente
      const existingOptions = this.normalizeKey(shortcut.key).split(/[/|]/);
      if (existingOptions.some(opt => opt === normalizedNew)) {
        return shortcut;
      }
    }
    return null;
  }

  /**
   * Resetea un shortcut individual a su valor por defecto
   */
  resetShortcut(shortcutId: string): void {
    const shortcut = this.shortcuts.get(shortcutId);
    const defaultKey = this.defaultKeys.get(shortcutId);
    if (shortcut && defaultKey) {
      shortcut.key = defaultKey;
      this.saveCustomBindings();
      this.notifyChangeListeners();
    }
  }

  /**
   * Resetea todos los shortcuts a sus valores por defecto
   */
  resetAllShortcuts(): void {
    this.defaultKeys.forEach((defaultKey, id) => {
      const shortcut = this.shortcuts.get(id);
      if (shortcut) {
        shortcut.key = defaultKey;
      }
    });
    localStorage.removeItem(STORAGE_KEY);
    this.notifyChangeListeners();
  }

  /**
   * Agrega un listener para cambios de bindings (para reactividad en componentes)
   */
  addChangeListener(listener: () => void): () => void {
    this.changeListeners.add(listener);
    return () => this.changeListeners.delete(listener);
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
   * Personaliza un atajo existente (con persistencia)
   */
  updateShortcut(shortcutId: string, updates: Partial<Shortcut>): void {
    const shortcut = this.shortcuts.get(shortcutId);
    if (shortcut) {
      Object.assign(shortcut, updates);
      if ('key' in updates) {
        this.saveCustomBindings();
        this.notifyChangeListeners();
      }
    }
  }
}

// Exportar instancia singleton
export const shortcutsManager = new ShortcutsManager();

export default ShortcutsManager;
