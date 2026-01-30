# Arquitectura Modular del Canvas de Anotaciones

## Descripción General

El canvas de anotaciones ha sido refactorizado siguiendo una arquitectura modular que separa las responsabilidades en handlers, renderers y el canvas principal como orquestador.

## Estructura de Archivos

```
src/features/canvas/
├── components/
│   ├── AnnotationCanvas.tsx          # Componente orquestador principal
│   └── renderers/                    # Componentes de renderizado
│       ├── BBoxRenderer.tsx
│       ├── OBBRenderer.tsx
│       ├── PolygonRenderer.tsx
│       ├── KeypointsRenderer.tsx
│       ├── LandmarksRenderer.tsx
│       ├── MaskRenderer.tsx
│       └── index.ts
├── handlers/                         # Lógica de negocio por tipo
│   ├── BBoxHandler.ts
│   ├── OBBHandler.ts
│   ├── PolygonHandler.ts
│   ├── KeypointsHandler.ts
│   ├── LandmarksHandler.ts
│   ├── MaskHandler.ts
│   └── index.ts
└── types/
    └── handlers.ts                   # Interfaces y tipos compartidos
```

## Componentes Principales

### 1. Handlers (Lógica de Negocio)

Cada handler maneja la lógica específica de un tipo de anotación:

**Interfaz Base: `BaseHandler`**
```typescript
interface BaseHandler {
  onMouseDown(event: MouseEventData): void;
  onMouseMove(event: MouseEventData): void;
  onMouseUp(event: MouseEventData): void;
  isActive(): boolean;
  reset(): void;
  finish?(): Promise<void> | void;
  cancel?(): void;
}
```

**Handlers Disponibles:**
- `BBoxHandler` - Dibujo de cajas delimitadoras rectangulares
- `OBBHandler` - Cajas delimitadoras orientadas (con rotación)
- `PolygonHandler` - Polígonos con puntos click-to-add
- `KeypointsHandler` - Puntos clave con esqueleto (COCO, MediaPipe, etc.)
- `LandmarksHandler` - Puntos de referencia arbitrarios
- `MaskHandler` - Máscaras de segmentación con pincel

**Características:**
- Encapsulan toda la lógica de interacción del mouse
- Mantienen su propio estado de dibujo
- Llaman automáticamente a `addAnnotation` cuando se completa una anotación
- Proporcionan métodos `finish()` y `cancel()` para completar o abortar

### 2. Renderers (Componentes de Visualización)

Componentes React puros que solo se encargan de renderizar:

**Props Comunes:**
```typescript
interface RendererProps {
  id?: string;              // Para el transformer
  data: AnnotationData;     // Datos específicos del tipo
  scale: number;            // Escala de la imagen
  imageOffset: Point;       // Offset de la imagen en el canvas
  color: string;            // Color de la clase
  isSelected?: boolean;     // Si está seleccionada
  listening?: boolean;      // Si responde a eventos
  onClick?: () => void;     // Handler de click
}
```

**Renderers Disponibles:**
- `BBoxRenderer` - Renderiza un `<Rect>` de Konva
- `OBBRenderer` - Renderiza un `<Group>` con `<Rect>` rotado
- `PolygonRenderer` - Renderiza un `<Line>` cerrado
- `KeypointsRenderer` - Renderiza conexiones y puntos
- `LandmarksRenderer` - Renderiza círculos para cada punto
- `MaskRenderer` - Renderiza imagen con `useState` y `useEffect` (soluciona el bug de hooks en .map())

**Ventajas:**
- Componentes puros y reutilizables
- Fácil de probar individualmente
- El bug de hooks en .map() está resuelto (MaskRenderer tiene su propio estado)
- Separación clara entre lógica y presentación

### 3. AnnotationCanvas (Orquestador)

El componente principal ahora es mucho más simple:

**Responsabilidades:**
1. Inicializa todos los handlers usando `useMemo`
2. Selecciona el handler activo según `activeTool`
3. Convierte coordenadas del stage a coordenadas de imagen
4. Delega eventos del mouse al handler activo
5. Renderiza anotaciones guardadas usando los renderers
6. Muestra previews de dibujo usando datos de los handlers

**Código Simplificado:**
```typescript
// Inicialización de handlers
const bboxHandler = useMemo(() => 
  new BBoxHandler(activeClassId, addAnnotation), 
  [activeClassId, addAnnotation]
);

// Selección del handler activo
const currentHandler = useMemo(() => {
  switch (activeTool) {
    case 'bbox': return bboxHandler;
    case 'obb': return obbHandler;
    // ...
    default: return null;
  }
}, [activeTool, ...handlers]);

// Delegación de eventos
const handleMouseDown = (e: any) => {
  if (currentHandler && clickedOnEmptyArea) {
    const coords = getImageCoordinates(stageRef.current);
    if (coords) currentHandler.onMouseDown(coords);
  }
};

// Renderizado con switch-case limpio
switch (ann.type) {
  case 'bbox':
    return <BBoxRenderer key={ann.id} data={ann.data} {...props} />;
  case 'obb':
    return <OBBRenderer key={ann.id} data={ann.data} {...props} />;
  // ...
}
```

## Flujo de Trabajo

### Crear una Nueva Anotación

1. Usuario selecciona herramienta (e.g., `activeTool = 'bbox'`)
2. `AnnotationCanvas` selecciona `bboxHandler` como `currentHandler`
3. Usuario hace click → `handleMouseDown` → `currentHandler.onMouseDown(coords)`
4. Usuario mueve mouse → `handleMouseMove` → `currentHandler.onMouseMove(coords)`
5. Usuario suelta mouse → `handleMouseUp` → `currentHandler.onMouseUp(coords)`
6. `BBoxHandler` valida tamaño y llama automáticamente a `addAnnotation()`
7. Nueva anotación se guarda en IndexedDB
8. `AnnotationCanvas` renderiza la anotación con `<BBoxRenderer>`

### Teclado (Polygon, Keypoints, Landmarks, Mask)

Para herramientas que requieren múltiples puntos:

1. Usuario presiona **Enter** → `currentHandler.finish()` → Crea la anotación
2. Usuario presiona **Escape** → `currentHandler.cancel()` → Cancela el dibujo

## Ventajas de la Arquitectura

### ✅ Separación de Responsabilidades
- **Handlers**: Lógica de negocio y estado
- **Renderers**: Presentación pura
- **Canvas**: Orquestación y coordinación

### ✅ Mantenibilidad
- Cada tipo de anotación está en su propio archivo
- Fácil agregar nuevos tipos sin modificar código existente
- Cambios en un tipo no afectan a otros

### ✅ Testabilidad
- Handlers son clases puras fáciles de testear
- Renderers son componentes puros sin lógica
- Mocks simples para probar cada parte

### ✅ Escalabilidad
- Agregar un nuevo tipo de anotación:
  1. Crear `NewTypeHandler.ts`
  2. Crear `NewTypeRenderer.tsx`
  3. Agregar caso en `currentHandler` switch
  4. Agregar caso en renderizado switch

### ✅ Bugs Resueltos
- **Mask hooks bug**: `MaskRenderer` tiene su propio estado, no hooks en .map()
- **Código duplicado**: Lógica similar ahora está en handlers base
- **Acoplamiento**: Ya no hay lógica de negocio mezclada con renderizado

## Extensión: Agregar Nuevo Tipo de Anotación

### Ejemplo: Agregar "Circle" (Círculo)

**1. Crear el Handler**
```typescript
// src/features/canvas/handlers/CircleHandler.ts
export class CircleHandler implements BaseHandler {
  private center: Point | null = null;
  private radius: number = 0;
  private isDrawing: boolean = false;

  onMouseDown(event: MouseEventData): void {
    this.center = { x: event.imageX, y: event.imageY };
    this.isDrawing = true;
  }

  onMouseMove(event: MouseEventData): void {
    if (!this.isDrawing || !this.center) return;
    const dx = event.imageX - this.center.x;
    const dy = event.imageY - this.center.y;
    this.radius = Math.sqrt(dx * dx + dy * dy);
  }

  onMouseUp(event: MouseEventData): void {
    if (this.radius > 5 && this.activeClassId !== null) {
      this.onAddAnnotation({
        id: crypto.randomUUID(),
        type: 'circle',
        classId: this.activeClassId,
        data: { center: this.center, radius: this.radius },
      });
    }
    this.reset();
  }

  isActive(): boolean {
    return this.isDrawing;
  }

  reset(): void {
    this.center = null;
    this.radius = 0;
    this.isDrawing = false;
  }
}
```

**2. Crear el Renderer**
```typescript
// src/features/canvas/components/renderers/CircleRenderer.tsx
export function CircleRenderer({ data, scale, imageOffset, color }: Props) {
  return (
    <Circle
      x={data.center.x * scale + imageOffset.x}
      y={data.center.y * scale + imageOffset.y}
      radius={data.radius * scale}
      stroke={color}
      strokeWidth={2}
      fill={color + '20'}
    />
  );
}
```

**3. Integrar en AnnotationCanvas**
```typescript
// Agregar handler
const circleHandler = useMemo(() => 
  new CircleHandler(activeClassId, addAnnotation), 
  [activeClassId, addAnnotation]
);

// Agregar al switch de currentHandler
case 'circle': return circleHandler;

// Agregar al switch de renderizado
case 'circle':
  return <CircleRenderer key={ann.id} data={ann.data} {...props} />;
```

## Tipos de Datos

### MouseEventData
```typescript
interface MouseEventData {
  imageX: number;      // Coordenadas en la imagen original
  imageY: number;
  canvasX: number;     // Coordenadas en el canvas
  canvasY: number;
}
```

### Point
```typescript
interface Point {
  x: number;
  y: number;
}
```

### DrawingState
```typescript
interface DrawingState {
  isDrawing: boolean;
  data: any;           // Estado específico del handler
}
```

## Notas de Implementación

- **Coordenadas**: Todos los handlers trabajan con coordenadas de imagen (sin escala)
- **Escala**: Los renderers aplican la escala al renderizar
- **Estado**: Cada handler mantiene su propio estado interno
- **Memoria**: Los handlers se recrean cuando cambia `activeClassId` (usando `useMemo`)
- **Transformer**: Solo funciona con anotaciones que tengan `id={'ann-' + ann.id}`

## Conclusión

Esta arquitectura modular hace que Annotix sea:
- **Mantenible**: Código organizado y fácil de entender
- **Extensible**: Agregar tipos nuevos es simple
- **Robusto**: Bugs como el de mask están resueltos
- **Testeable**: Cada parte se puede probar independientemente
- **Escalable**: Preparado para crecer sin problemas técnicos
