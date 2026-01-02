# Annotix Modern - Development Guide

## FASE 1 - Implementación Completa

Todos los archivos para FASE 1 han sido generados. Esta fase incluye:

### Estructura de Características (Features)

```
src/features/
├── core/          # Layout, Header, Sidebar, LanguageSelector, StorageIndicator, Shortcuts
├── projects/      # ProjectList, CRUD, ClassManager, Stats
├── gallery/       # ImageGallery, Upload, Filters, Navigation
├── canvas/        # AnnotationCanvas, Tools (BBox, Mask, Select, Pan), Renderers
└── export/        # ExportDialog, YOLO Exporter, Converters
```

### Instalación y Ejecución

```bash
# Instalar dependencias
npm install

# Ejecutar en modo desarrollo
npm run dev

# Build para producción
npm run build

# Preview del build
npm run preview
```

### Dependencias Instaladas

**Runtime:**
- React 19 + Vite
- TypeScript 5.7
- Tailwind CSS + Shadcn/ui
- Dexie (IndexedDB ORM)
- i18next (Internacionalización)
- Zustand (State Management)
- JSZip (Exportación ZIP)
- Radix UI (Primitivos de UI)

### Stack Tecnológico

**Frontend:**
- **Framework:** Vite 6.0 + React 19
- **Language:** TypeScript 5.7
- **Styling:** Tailwind CSS 4.0 (futuro)
- **Components:** Shadcn/ui (Radix UI + Tailwind)
- **Icons:** Font Awesome 6.4.0

**State Management:**
- **Global:** Zustand (UIStore, CanvasTransform, DrawingTool)
- **Local:** React hooks (useProjects, useImages, useAnnotations)

**Database:**
- **Client-side:** Dexie (IndexedDB wrapper)
- **Stores:** projects, images
- **Limit:** ~500MB-1GB (browser-dependent)

**i18n:**
- **Library:** i18next + react-i18next
- **Languages:** 10 idiomas (es, en, fr, zh, ja, de, pt, it, ru, ko)
- **Location:** /locales/{lang}.json

### Arquitectura de Componentes

#### 1. Core Feature
- `AppLayout.tsx` - Layout principal (Header + Sidebar + Main)
- `Header.tsx` - Logo, LanguageSelector, StorageIndicator
- `Sidebar.tsx` - Tool buttons, ProjectStats
- `LanguageSelector.tsx` - Dropdown con banderas
- `StorageIndicator.tsx` - Progress bar de IndexedDB
- `useKeyboardShortcuts.ts` - Global shortcuts (1-9, B/M/V/H, Ctrl+S, etc.)
- `useStorageEstimate.ts` - navigator.storage.estimate()

#### 2. Projects Feature
- `ProjectList.tsx` - Grid de proyectos
- `ProjectCard.tsx` - Card con stats y actions
- `CreateProjectDialog.tsx` - Modal de creación
- `ProjectTypeSelector.tsx` - Radio group (bbox/mask)
- `ClassManager.tsx` - CRUD de clases
- `ClassColorPicker.tsx` - Input color
- `ProjectStats.tsx` - Stats panel (images, annotations, progress)
- `useProjects.ts` - CRUD con Dexie
- `useCurrentProject.ts` - Proyecto activo
- `useClasses.ts` - Gestión de clases
- `projectService.ts` - Dexie operations

#### 3. Gallery Feature
- `ImageGallery.tsx` - Container principal
- `ImageGrid.tsx` - Responsive grid
- `ImageCard.tsx` - Card con thumbnail y badges
- `ImageUploader.tsx` - File input + drag&drop
- `GalleryFilters.tsx` - All/Annotated/Unannotated
- `ImageNavigation.tsx` - Prev/Next buttons
- `useImages.ts` - CRUD con Dexie
- `useCurrentImage.ts` - Imagen activa
- `useImageNavigation.ts` - Navegación
- `imageService.ts` - Dexie + blob handling

#### 4. Canvas Feature
- `AnnotationCanvas.tsx` - Canvas principal
- `CanvasToolbar.tsx` - ClassSelector + BrushSizeSlider
- `ZoomControls.tsx` - +/-/Reset
- `AnnotationList.tsx` - Sidebar de anotaciones
- `AnnotationItem.tsx` - Item individual
- `ClassSelector.tsx` - Select con clases
- `BrushSizeSlider.tsx` - Slider 1-100px
- **Hooks:**
  - `useCanvas.ts` - Setup, render loop, tools
  - `useAnnotations.ts` - CRUD annotations
  - `useCanvasTransform.ts` - Zoom/Pan con Zustand
  - `useDrawingTool.ts` - Brush size/erase mode con Zustand
- **Tools:**
  - `BaseTool.ts` - Abstract class
  - `BBoxTool.ts` - Dibujar rectángulos
  - `MaskTool.ts` - Brush/erase con canvas temporal
  - `SelectTool.ts` - Seleccionar (skeleton)
  - `PanTool.ts` - Pan canvas
- **Renderers:**
  - `bboxRenderer.ts` - Función pura para bbox
  - `maskRenderer.ts` - Función pura para mask
- **Services:**
  - `annotationService.ts` - Save/load a Dexie

#### 5. Export Feature
- `ExportDialog.tsx` - Modal de exportación
- `FormatSelector.tsx` - Radio group de formatos
- `ExportProgress.tsx` - Progress bar
- `BaseExporter.ts` - Abstract class
- `YOLOExporter.ts` - YOLO Detection/Segmentation con JSZip
- `zipUtils.ts` - JSZip helpers
- `converters.ts` - Normalize coords, mask→polygon (skeleton)
- `exportService.ts` - Orchestrate export

### Flujo de Datos

```
User Action → App.tsx (event listeners)
    ↓
UIStore (currentProjectId, currentImageId, activeClassId, activeTool)
    ↓
Features (useProjects, useImages, useAnnotations, useCanvas)
    ↓
Services (projectService, imageService, annotationService)
    ↓
Dexie → IndexedDB
    ↓
React re-render
```

### Canvas System

**Coordinate Transform:**
```typescript
canvasCoord = (screenCoord - pan) / zoom
screenCoord = canvasCoord * zoom + pan
```

**Device Pixel Ratio:**
```typescript
canvas.width = displayWidth * dpr
canvas.height = displayHeight * dpr
ctx.scale(dpr, dpr)
```

**Rendering Pipeline:**
1. Clear canvas
2. ctx.save()
3. ctx.translate(panX, panY)
4. ctx.scale(zoom, zoom)
5. Draw image
6. Draw annotations (bbox/mask)
7. Tool.render() overlay
8. ctx.restore()
9. requestAnimationFrame loop

**Tools Implementation:**
- **BBoxTool:**
  - onMouseDown → save startX, startY
  - onMouseMove → draw temp rect
  - onMouseUp → dispatch 'annotix:annotation-created' event
- **MaskTool:**
  - Temporary canvas overlay
  - Brush drawing with line interpolation
  - Erase mode: composite operation 'destination-out'
  - onMouseUp → canvas.toDataURL() → dispatch event
- **SelectTool:**
  - Skeleton implementation
  - TODO: Selection, resize handles
- **PanTool:**
  - Updates transform.setPan()
  - Drags the canvas

### Event System

**Custom Events:**
- `annotix:annotation-created` - Tool creates annotation
- `annotix:save` - Ctrl+S pressed
- `annotix:undo` - Ctrl+Z pressed

**Listeners in App.tsx:**
```typescript
useEffect(() => {
  const handler = (e: CustomEvent) => {
    const { type, data } = e.detail;
    const annotation = {
      id: crypto.randomUUID(),
      type,
      classId: activeClassId,
      data,
    };
    addAnnotation(annotation);
  };
  window.addEventListener('annotix:annotation-created', handler);
  return () => window.removeEventListener('annotix:annotation-created', handler);
}, [addAnnotation]);
```

### Keyboard Shortcuts

Implementados en `useKeyboardShortcuts.ts`:

- **Tools:** B (bbox), M (mask), V (select), H (pan)
- **Classes:** 1-9 (select class by index)
- **Navigation:** ← (previous image), → (next image)
- **Actions:** Ctrl+S (save), Ctrl+Z (undo)

**Ignore rules:**
- Skip if focus in input/textarea
- Skip if contentEditable

### YOLO Export Format

**Estructura del ZIP:**
```
dataset.zip
├── images/              # Original images
├── labels/              # .txt files (one per image)
├── classes.txt          # Newline-separated class names
└── data.yaml            # YOLO config
```

**data.yaml:**
```yaml
path: .
train: images
val: images
nc: 3
names:
  0: Person
  1: Car
  2: Dog
```

**labels/image.txt (Detection):**
```
<class_id> <x_center> <y_center> <width> <height>
0 0.5 0.5 0.3 0.4
1 0.2 0.3 0.1 0.15
```

Todas las coordenadas normalizadas 0-1.

**labels/image.txt (Segmentation):**
```
<class_id> <x1> <y1> <x2> <y2> ... <xn> <yn>
0 0.1 0.1 0.2 0.1 0.2 0.2 0.1 0.2
```

TODO: Implementar mask→polygon conversion.

### Database Schema (Dexie)

**projects store:**
```typescript
{
  id: number (auto),
  name: string,
  type: 'bbox' | 'mask',
  classes: ClassDefinition[],
  createdAt: number,
  updatedAt: number
}
```

**images store:**
```typescript
{
  id: number (auto),
  projectId: number (indexed),
  name: string,
  image: Blob,
  annotations: Annotation[],
  width: number,
  height: number,
  timestamp: number
}
```

**Annotation:**
```typescript
{
  id: string (UUID),
  type: 'bbox' | 'mask',
  classId: number,
  data: BBoxData | string // BBox coords or base64 PNG
}
```

### UI State (Zustand Stores)

**UIStore:** Global UI state
- currentProjectId, currentImageId
- activeClassId, activeTool
- galleryFilter
- showLabels, showGrid
- (deprecated: zoom, pan, brushSize, eraseMode)

**CanvasTransformStore:** Canvas transform
- zoom (0.1-5)
- panX, panY
- zoomIn(), zoomOut(), resetZoom()
- setPan(), setZoom()

**DrawingToolStore:** Mask tool state
- brushSize (1-100)
- eraseMode
- setBrushSize(), setEraseMode()

### Pending Features (Future Phases)

**FASE 1 - Completado:**
- ✅ Setup base (Vite, React, TypeScript, Tailwind, Shadcn)
- ✅ Dexie schema
- ✅ i18n system
- ✅ UIStore
- ✅ Core, Projects, Gallery, Canvas, Export features
- ✅ BBox and Mask tools
- ✅ YOLO Detection export
- ✅ Keyboard shortcuts

**FASE 2 - TODO:**
- Select tool (edit annotations)
- Mask→Polygon conversion for YOLO Segmentation
- COCO JSON export
- U-Net PNG masks export
- Pascal VOC XML export
- CSV export
- .tix project import/export
- .tixconfig config sharing
- Data augmentation
- Auto-save functionality
- Undo/redo history stack
- Tour system (intro.js)

**FASE 3 - TODO:**
- Inference system (ONNX models)
- Training connector
- Advanced annotation tools
- Multi-language expansion
- Performance optimizations

### Testing the Application

1. **Create a Project:**
   - Click "Nuevo Proyecto"
   - Enter name
   - Select type (BBox or Mask)
   - Add classes
   - Click "Crear"

2. **Upload Images:**
   - Click "Cargar Imágenes"
   - Select multiple images
   - Images load to gallery

3. **Annotate:**
   - Click image card
   - Select class (1-9 keys)
   - Select tool (B/M/V/H keys)
   - Draw annotation
   - Press Ctrl+S to save

4. **Export:**
   - Click "Exportar"
   - Select format (YOLO Detection/Segmentation)
   - Click "Exportar Dataset"
   - ZIP downloads

### Common Issues

**Canvas not rendering:**
- Check if image blob loaded correctly
- Verify devicePixelRatio scaling
- Check browser console for errors

**Annotations not saving:**
- Verify Dexie connection
- Check browser storage permissions
- Look for IndexedDB quota errors

**Tools not working:**
- Ensure project type matches tool (bbox project → bbox tool)
- Check activeTool in UIStore
- Verify activeClassId is set

**Export fails:**
- Ensure JSZip is installed
- Check if images have annotations
- Verify YOLO format conversion

### Browser Compatibility

- **Chrome/Edge 90+:** Full support
- **Firefox 88+:** Full support
- **Safari 14+:** Full support (may have cache limits on iOS)
- **Opera 76+:** Full support

**Required APIs:**
- IndexedDB
- Canvas API
- Fetch API
- File API
- Blob/URL.createObjectURL
- ES6+ (modules, classes, async/await)

### Performance Notes

**Large Images:**
- Consider downsampling images >2048px
- Implement canvas tiling for very large images
- Use web workers for heavy processing

**Many Annotations:**
- Render only visible annotations (viewport culling)
- Use offscreen canvas for complex masks
- Debounce save operations

**Memory:**
- IndexedDB limit: ~500MB-1GB
- Clear image cache periodically
- Export and delete old projects

### License & Credits

Developed by **FabLab TecMedHub, Universidad Austral de Chile - Sede Puerto Montt**

---

## Next Steps

Run `npm run dev` and test all features. Report any bugs or missing translations.
