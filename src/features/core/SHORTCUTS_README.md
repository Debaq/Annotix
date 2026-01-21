# ShortcutsManager - Documentación

## Descripción General

El `ShortcutsManager` es un sistema completo de gestión de atajos de teclado para la aplicación Annotix. Incluye:

- ✅ Definición centralizada de atajos
- ✅ Handlers personalizables
- ✅ Modal interactivo para visualizar atajos
- ✅ Soporte para categorías
- ✅ Hooks React para integración fácil
- ✅ Validación automática de inputs/textareas

## Componentes

### 1. ShortcutsManager (Núcleo)
Archivo: `src/features/core/utils/ShortcutsManager.ts`

Clase principal que gestiona todos los atajos y sus handlers.

#### Uso Básico:
```typescript
import { shortcutsManager } from '@/features/core/utils/ShortcutsManager';

// Registrar un handler para un atajo
shortcutsManager.registerHandler('save', () => {
  console.log('Guardando...');
});

// Obtener todos los atajos
const allShortcuts = shortcutsManager.getAllShortcuts();

// Obtener atajos por categoría
const categories = shortcutsManager.getShortcutsByCategory();

// Habilitar/deshabilitar atajos
shortcutsManager.setShortcutEnabled('save', false);
shortcutsManager.setEnabled(false); // Deshabilitar todos
```

### 2. ShortcutsModal (Componente)
Archivo: `src/features/core/components/ShortcutsModal.tsx`

Componente React que muestra un modal con todos los atajos, organizados por categorías.

#### Uso Básico:
```typescript
import { ShortcutsModal } from '@/features/core/components/ShortcutsModal';
import { useState } from 'react';

export const MyComponent = () => {
  const [showShortcuts, setShowShortcuts] = useState(false);

  return (
    <>
      <button onClick={() => setShowShortcuts(true)}>
        Ver Atajos
      </button>
      <ShortcutsModal open={showShortcuts} onOpenChange={setShowShortcuts} />
    </>
  );
};
```

### 3. Hooks (useShortcuts)
Archivo: `src/features/core/hooks/useShortcuts.ts`

Conjunto de hooks para integrar atajos en componentes React.

#### useShortcut
Registra un handler para un atajo específico:
```typescript
import { useShortcut } from '@/features/core/hooks/useShortcuts';

export const EditorComponent = () => {
  useShortcut('save', () => {
    handleSave();
  });

  return <div>Editor...</div>;
};
```

#### useShortcutsListener
Escucha todos los atajos ejecutados:
```typescript
import { useShortcutsListener } from '@/features/core/hooks/useShortcuts';

export const ToolbarComponent = () => {
  useShortcutsListener((shortcutId) => {
    if (shortcutId === 'tool-box') {
      selectTool('box');
    }
  });

  return <div>Toolbar...</div>;
};
```

#### useShortcutsEnabled
Controla si los atajos están habilitados globalmente:
```typescript
import { useShortcutsEnabled } from '@/features/core/hooks/useShortcuts';

export const Modal = () => {
  // Deshabilitar atajos mientras el modal está abierto
  useShortcutsEnabled(false);

  return <div>Modal con atajos deshabilitados...</div>;
};
```

#### useAllShortcuts y useShortcutsByCategory
Obtienen datos de atajos:
```typescript
import { 
  useAllShortcuts, 
  useShortcutsByCategory 
} from '@/features/core/hooks/useShortcuts';

export const ShortcutsPanel = () => {
  const shortcuts = useAllShortcuts();
  const categories = useShortcutsByCategory();

  return <div>Panel de atajos...</div>;
};
```

### 4. ShortcutsProvider (Proveedor)
Archivo: `src/features/core/components/Shortcutkeys.tsx`

Componente proveedor que envuelve la aplicación y habilita el sistema de atajos globalmente.

#### Uso en App.tsx:
```typescript
import { ShortcutsProvider } from '@/features/core/components/Shortcutkeys';

export const App = () => {
  return (
    <ShortcutsProvider>
      {/* Tu aplicación */}
    </ShortcutsProvider>
  );
};
```

## Atajos Disponibles

### General
- **Ctrl+S**: Guardar
- **Ctrl+Z**: Deshacer
- **Ctrl+Y**: Rehacer
- **Esc**: Deseleccionar

### Navegación
- **← →**: Navegar entre imágenes
- **Ctrl++**: Ampliar
- **Ctrl+-**: Reducir
- **Ctrl+0**: Ajustar

### Herramientas
- **B**: Herramienta Box
- **O**: Herramienta OBB
- **M**: Herramienta Mask
- **P**: Herramienta Polígono
- **K**: Herramienta Puntos Clave
- **V**: Seleccionar
- **H**: Pan
- **A**: Rotar izquierda
- **D**: Rotar derecha

### Edición
- **1-9**: Seleccionar clase

### Ayuda
- **?** ó **/**: Abrir modal de atajos

## Personalización

### Agregar un nuevo atajo
```typescript
import { shortcutsManager } from '@/features/core/utils/ShortcutsManager';

shortcutsManager.updateShortcut('my-shortcut', {
  name: 'Mi Atajo Personalizado',
  key: 'Ctrl+Alt+M',
  enabled: true,
});
```

### Registrar un handler personalizado
```typescript
shortcutsManager.registerHandler('my-shortcut', (e: KeyboardEvent) => {
  console.log('Mi atajo fue ejecutado');
});
```

## Arquitectura

```
ShortcutsManager (Singleton)
├── ShortcutsProvider (Componente)
├── ShortcutsModal (Componente)
└── Hooks (useShortcuts)
    ├── useShortcut
    ├── useShortcutsListener
    ├── useShortcutsEnabled
    ├── useAllShortcuts
    └── useShortcutsByCategory
```

## Características

- ✅ **Gestión centralizada**: Todos los atajos en un lugar
- ✅ **Categorías**: Organización visual de atajos
- ✅ **Handlers personalizables**: Asocia acciones a atajos
- ✅ **Validación inteligente**: No activa en inputs/textareas
- ✅ **Listeners**: Reacciona a cualquier atajo ejecutado
- ✅ **Enable/Disable**: Control granular de atajos
- ✅ **Responsive**: Modal adaptable a diferentes pantallas
- ✅ **Dark Mode**: Soporte para tema oscuro
- ✅ **TypeScript**: Tipado completo

## Ejemplo Completo

```typescript
import React, { useState } from 'react';
import { ShortcutsProvider } from '@/features/core/components/Shortcutkeys';
import { useShortcut } from '@/features/core/hooks/useShortcuts';

const Editor = () => {
  const [content, setContent] = useState('');

  // Guardar con Ctrl+S
  useShortcut('save', () => {
    console.log('Guardando:', content);
  });

  return (
    <textarea 
      value={content}
      onChange={(e) => setContent(e.target.value)}
      placeholder="Escribe aquí..."
    />
  );
};

export const App = () => {
  return (
    <ShortcutsProvider>
      <Editor />
    </ShortcutsProvider>
  );
};
```

## Notas

- Los atajos NO se activan mientras el usuario está escribiendo en un input o textarea
- El modal de atajos se abre con **?** o **/** en cualquier momento
- Todos los atajos están en español
- El sistema es completamente extensible y personalizable
