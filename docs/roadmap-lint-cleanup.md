# Roadmap limpieza ESLint

Tras migración a flat config (eslint v9 + typescript-eslint v8): **0 errores**. Estado actual: **120 warnings** (191 originales). Script `lint` corre con `--max-warnings 130` (techo se baja al cerrar fases).

**Hecho:** Fase 1 (unused-vars) y Fase 2 (react-refresh).
- 66 → 0 unused-vars (imports muertos borrados, args/vars sin uso prefijados con `_` o eliminados, config con `varsIgnorePattern`/`caughtErrorsIgnorePattern`/`destructuredArrayIgnorePattern`).
- 5 → 0 react-refresh (eslint-disable inline en patrón shadcn-ui y exports auxiliares).

## Inventario

| Regla | Count | Severidad real |
|---|---|---|
| `@typescript-eslint/no-explicit-any` | 68 | Baja — tipado laxo en límites de I/O y eventos |
| `react-hooks/exhaustive-deps` | 52 | **Media-alta** — riesgo real de bugs (stale closures) |
| ~~`@typescript-eslint/no-unused-vars`~~ | ~~66~~ → 0 | Resuelto |
| ~~`react-refresh/only-export-components`~~ | ~~5~~ → 0 | Resuelto |

## Hotspots (top archivos)

| # | Archivo | Warnings |
|---|---|---|
| 1 | `src/features/canvas/components/AnnotationCanvas.tsx` | 36 |
| 2 | `src/features/p2p/store/p2pStore.ts` | 11 |
| 3 | `src/features/canvas/handlers/BBoxHandler.ts` | 8 |
| 4 | `src/utils/translationUtils.ts` | 7 |
| 5 | `src/features/timeseries/components/TimeSeriesCanvas.tsx` | 5 |
| 6 | `src/features/projects/components/ProjectCard.tsx` | 5 |
| 7 | `src/features/sam/components/SamOverlay.tsx` | 4 |
| 8 | `src/features/inference/components/InferencePanel.tsx` | 4 |
| 9 | `src/features/canvas/handlers/OBBHandler.ts` | 4 |
| 10 | `src/features/canvas/components/renderers/{OBB,BBox}Renderer.tsx` | 4+4 |

## Plan por fases

### Fase 1 — `no-unused-vars` (66) → bajo riesgo, alto barrido
- Borrar imports/destructurings/funciones muertas.
- Para args obligatorios sin uso: prefijar `_`.
- Verificar que no sea API pública antes de borrar exports.
- **Meta:** -66 warnings, sin cambio de comportamiento.

### Fase 2 — `react-refresh/only-export-components` (5) → trivial
- Mover constantes exportadas junto a componentes a archivos hermanos `*.constants.ts`.
- **Meta:** -5 warnings.

### Fase 3 — `react-hooks/exhaustive-deps` (52) → caso por caso
Riesgo real. Para cada warning decidir:
- **Falta dep legítima** → agregar (puede causar re-runs; verificar lógica).
- **Dep estable garantizada** (refs, setters) → agregar igual o `useCallback`.
- **Intencional** → `// eslint-disable-next-line react-hooks/exhaustive-deps` con comentario explicando *por qué*.

Priorizar: `AnnotationCanvas.tsx`, `p2pStore.ts`, hooks de canvas.

### Fase 4 — `no-explicit-any` (68) → tipar bordes
- `translationUtils.ts` (7): tipar wrapper `t` con generics de i18next.
- Eventos Tauri / payloads: usar `unknown` + narrowing o tipos del SDK.
- DTOs de import/export: definir interfaces.
- Renderers/handlers de canvas: tipar shapes de Konva.
- **Meta:** -68 warnings; mejor seguridad de tipos en runtime de anotaciones.

### Fase 5 — apretar threshold
- Bajar `--max-warnings` progresivamente: 200 → 100 → 50 → 0.
- Activar `--max-warnings 0` permanente cuando llegue a 0.

## No-goals

- No tocar lógica de negocio en cleanup de tipos (`any` → tipo) salvo bug evidente.
- No reescribir hooks completos por `exhaustive-deps`; aplicar la corrección mínima.
- No eliminar `// eslint-disable` existentes si comentan razón válida.

## Ejecución sugerida

Una fase por sesión, commits separados por archivo o grupo lógico. Tras cada fase: bajar `--max-warnings` al nuevo techo para evitar regresiones.
