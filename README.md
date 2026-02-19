# 🎓 Annotix – Plataforma Inteligente de Anotación para ML (Offline-First)

Crea, organiza, anota y exporta datasets para entrenamiento de modelos de Computer Vision y Series Temporales, con almacenamiento local y soporte de inferencia/entrenamiento modular.

---

## 📚 Documentación extendida

- Wiki técnica (navegación principal): `Annotix.wiki/Home.md`
- Especificación técnica extensa y roadmap detallado: `CLAUDE.md` (se mantiene)
- Versión legacy (vanilla JS): carpeta `legacy/`

---

## 📌 Tabla de Contenidos

- [Instalación](#-instalación)
  - [Instrucciones rápidas](#instrucciones-rápidas)
  - [Dependencias](#dependencias)
  - [Estructura del proyecto](#estructura-del-proyecto)
- [Uso](#️-uso)
  - [Flujo básico](#flujo-básico)
  - [Atajos de teclado](#atajos-de-teclado)
  - [Exportación de datasets](#exportación-de-datasets)
- [Motor Inteligente](#-motor-inteligente)
- [Cambios y mejoras implementadas](#-cambios-y-mejoras-implementadas)
- [Conector Python (opcional)](#-conector-python-opcional)
- [Pendientes / próximos pasos](#-pendientes--próximos-pasos)
- [Contribuciones](#-contribuciones)
- [Licencia](#-licencia)
- [Estado del proyecto](#-estado-del-proyecto)

---

## 📦 Instalación

### Instrucciones rápidas

```bash
git clone <repo-url>
cd Annotix
npm install
npm run dev
```

Abrir en el navegador:

- `http://localhost:3000` (según `vite.config.ts`)

### Dependencias

- Node.js >= 18
- npm >= 9
- Navegador moderno (Chrome, Edge, Firefox)

### Estructura del proyecto

```text
Annotix/
├── public/
│   └── locales/                 # Traducciones (10 idiomas)
├── src/
│   ├── features/
│   │   ├── core/                # Layout, shortcuts, estado UI
│   │   ├── projects/            # CRUD de proyectos y clases
│   │   ├── gallery/             # Carga y navegación de imágenes
│   │   ├── canvas/              # Herramientas de anotación
│   │   ├── classification/      # Single / multi-label
│   │   ├── timeseries/          # Importación y anotación TS
│   │   ├── import/              # Importadores (TIX, COCO, CSV, etc.)
│   │   └── export/              # Exportadores de datasets
│   ├── components/ui/           # Shadcn/ui
│   ├── lib/                     # Dexie DB, i18n, utilidades
│   └── styles/
├── legacy/                      # Versión anterior + assets históricos
├── package.json
└── CLAUDE.md                    # Documento técnico principal
```

---

## ▶️ Uso

### Flujo básico

1. Crear proyecto (tipo + clases)
2. Subir imágenes o importar datos
3. Anotar en canvas (BBox, Mask, Polygon, Keypoints, Landmarks, OBB, etc.)
4. Revisar y editar anotaciones
5. Exportar dataset en el formato requerido

### Atajos de teclado

- Herramientas: `B`, `M`, `P`, `K`, `L`, `O`, `V`, `H`
- Clases rápidas: `1..0` + `Q..P`
- Guardar: `Ctrl+S`
- Deshacer: `Ctrl+Z`
- Eliminar anotación seleccionada: `Del / Backspace`
- Máscara:
  - Cambiar grosor: `[` y `]`
  - Toggle borrador: `E`

### Exportación de datasets

Incluye múltiples formatos (dependiendo del tipo de proyecto):

- YOLO (Detection / Segmentation)
- COCO JSON
- Pascal VOC XML
- CSV (variantes)
- U-Net masks
- Folders by class

---

## 🤖 Motor Inteligente

Annotix soporta flujo inteligente con enfoque local/offline:

- Inference en navegador (ONNX Runtime Web)
- Pre/post-procesamiento para modelos de detección/segmentación
- Caché de inferencias en Dexie
- Arquitectura preparada para entrenamiento vía conector Python

---

## 🔄 Cambios y mejoras implementadas

Resumen de mejoras destacadas en la migración moderna:

- Migración de vanilla JS a Vite + React + TypeScript
- Arquitectura modular por features
- Persistencia local robusta con Dexie
- 10 idiomas con i18next
- Herramientas avanzadas de anotación (Polygon, Keypoints, Landmarks, OBB)
- Import/export robusto con normalización de anotaciones entre formatos
- Mejoras UX recientes en canvas:
  - Reasignación de clase desde selección
  - Cursor dinámico y control de grosor para mask
  - Erase mode integrado y shortcuts actualizados
  - Eliminación por teclado desde selección en thumbnails/canvas

> Nota: Para navegación de documentación usa la Wiki (`Annotix.wiki/`). `CLAUDE.md` se conserva como referencia técnica extensa.

---

## 🐍 Conector Python (opcional)

En este repositorio existe base para integración con backend de entrenamiento.

Flujo esperado:

1. Exportar dataset desde frontend
2. Enviar/usar dataset en conector Python
3. Lanzar entrenamiento y monitorear progreso

> La implementación concreta del backend puede variar por entorno/proyecto.

---

## 🚧 Pendientes / próximos pasos

- Continuar hardening del flujo de inferencia/entrenamiento según roadmap
- Expandir modalidades futuras (audio, video, 3D, texto)
- Revisar consistencia de traducciones en todos los idiomas
- Optimizaciones de rendimiento para datasets grandes

---

## 🤝 Contribuciones

- Crear issues claros con contexto y pasos de reproducción
- Usar commits descriptivos
- Abrir PRs con objetivo técnico y validación
- Mantener cambios acotados por feature

---

## 📄 Licencia

Definir según política del repositorio (MIT / GPL / Propietaria).

---

## 🚧 Estado del proyecto

Proyecto en desarrollo activo con stack moderno y arquitectura escalable.

- Frontend React + TypeScript operativo
- Módulos de anotación e import/export en evolución continua
- Wiki técnica activa en `Annotix.wiki/`
- `CLAUDE.md` mantenido como documento de especificación detallada
