# Annotix Modern

> ML Dataset Annotation Tool - Modern Stack Migration

## Stack Tecnológico

- **Frontend**: Vite + React 19 + TypeScript
- **Styling**: Tailwind CSS + Shadcn/ui
- **Database**: Dexie.js (IndexedDB wrapper)
- **i18n**: i18next + react-i18next
- **State**: Zustand
- **Icons**: Lucide React

## Estructura del Proyecto

```
annotix-modern/
├── src/
│   ├── lib/                # Core libraries
│   │   ├── db.ts          # Dexie schema & types
│   │   ├── i18n.ts        # i18next configuration
│   │   └── utils.ts       # Utility functions (cn, etc.)
│   ├── features/          # Feature modules
│   │   ├── core/          # Layout & Navigation
│   │   ├── projects/      # Project management
│   │   ├── gallery/       # Image gallery
│   │   ├── canvas/        # Annotation canvas
│   │   └── export/        # Dataset export
│   ├── components/ui/     # Shadcn components
│   ├── hooks/             # Custom hooks
│   └── styles/            # Global styles
├── public/
│   ├── locales/           # Translation files (10 languages)
│   └── favicon.ico
├── legacy/                # Original vanilla JS codebase
└── CLAUDE.md              # Complete specification
```

## Desarrollo

### Instalación

```bash
# Instalar dependencias
npm install

# Ejecutar en desarrollo
npm run dev

# Build para producción
npm run build

# Preview del build
npm run preview
```

### Estado Actual

✅ **Setup Base Completo (FASE 1 - Preparación)**
- [x] Vite + React 19 + TypeScript configurado
- [x] Tailwind CSS + Shadcn/ui instalado
- [x] Dexie.js schema implementado
- [x] i18next configurado (10 idiomas)
- [x] Estructura de carpetas feature-based creada
- [x] Build funcional

### Próximos Pasos

**FASE 1: Core + BBox/Mask + YOLO Export**
- [ ] Componentes de layout (AppLayout, Header, Sidebar)
- [ ] Feature: Projects (CRUD operations)
- [ ] Feature: Gallery (upload, grid, filters)
- [ ] Feature: Canvas (BBox, Mask tools)
- [ ] Feature: Export (YOLO format)
- [ ] Keyboard shortcuts

Ver [CLAUDE.md](./CLAUDE.md) para especificación completa de todas las fases.

## Idiomas Soportados

🇪🇸 Español | 🇬🇧 English | 🇫🇷 Français | 🇨🇳 中文 | 🇯🇵 日本語
🇩🇪 Deutsch | 🇵🇹 Português | 🇮🇹 Italiano | 🇷🇺 Русский | 🇰🇷 한국어

## Base de Datos (Dexie)

```typescript
// 4 tablas principales
projects      // Proyectos de anotación
images        // Imágenes con anotaciones
inferenceCache  // Cache de predicciones ONNX (Fase 4)
trainingJobs    // Jobs de entrenamiento (Fase 5)
```

## Características Planificadas

### FASE 1: MVP Funcional
- Gestión de proyectos (crear, listar, eliminar)
- Subir imágenes
- Herramientas: BBox, Mask
- Exportar YOLO Detection/Segmentation

### FASE 2: Herramientas Avanzadas
- Polygon, Keypoints, Landmarks, OBB
- Exportar COCO, Pascal VOC, CSV

### FASE 3: Clasificación + Series Temporales
- Clasificación single/multi-label
- 9 tipos de series temporales

### FASE 4: Inferencia ONNX
- Auto-anotación con modelos ONNX
- Batch inference

### FASE 5: Training con FastAPI
- Conector Python FastAPI
- Entrenamiento local
- Progreso en tiempo real (WebSocket)

## Créditos

**Desarrollado por:**
FabLab TecMedHub
Universidad Austral de Chile - Sede Puerto Montt

---

**Versión:** 2.0.0 (En desarrollo)
**Licencia:** TBD
