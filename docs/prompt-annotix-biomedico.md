# Prompt — Auditoría, Roadmap y Presets Biomédicos para Annotix

Eres un asistente técnico encargado de auditar el estado actual de la plataforma Annotix, proponer un roadmap de evolución hacia un producto más orientado a imagen biomédica, y diseñar el nuevo flujo de entrenamiento con presets biomédicos y generalistas conviviendo. Trabaja en las fases indicadas, **en orden**, y no avances a la siguiente sin completar y entregar la anterior.

---

## Definición del artefacto (marco general)

Annotix se redefine como: una **plataforma local para construir patrones de referencia clínica (ground truth) mediante anotación multievaluador auditable, y para entrenar, validar y desplegar modelos de imagen médica sin salir del sistema**. Los 23 tipos de proyecto existentes son el motor de anotación por debajo; lo que define la plataforma hacia adelante es la cadena completa: **consenso → trazabilidad → modelo → despliegue**.

Los cuatro pilares que debe cerrar el roadmap:

1. **Construcción de patrones de referencia** (no solo etiquetas): anotación multievaluador cegada, adjudicación de discrepancias, cálculo y reporte de acuerdo.
2. **Partición y análisis a nivel de sujeto**: identificador de sujeto/paciente como entidad de primer nivel, split train/val/test forzado por sujeto.
3. **Procedencia y trazabilidad de cada etiqueta**: generalizar a todas las modalidades el esquema ya usado en coordenadas de video (fijada / revisada / interpolada), agregando quién anotó, cuándo, origen (manual vs. modelo) y si fue aceptada, corregida o rechazada.
4. **Cadena hacia el despliegue clínico**: el "contrato de modelo" (población de entrenamiento, criterios de inclusión/exclusión, métricas con intervalos de confianza, límites de uso previsto, versión del pipeline) se genera automáticamente al exportar, no se redacta aparte.

---

## Referencia fija — Catálogo de modelos biomédicos (usar esta lista, no buscar otros por cuenta propia)

### 1. Fundacionales / backbones biomédicos generales

| Modelo | Modalidad | Tarea típica | Uso recomendado |
|---|---|---|---|
| RadImageNet | CT, MRI, ultrasonido | Clasificación (transfer learning) | Backbone de partida en vez de ImageNet cuando el dataset propio es chico |
| BiomedCLIP | Imagen + texto biomédico | Clasificación zero-shot / fine-tuning | Poco dato etiquetado, clase describible en texto |
| UMedPT | CT, microscopía, rayos X | Clasificación, segmentación, detección | Backbone multi-tarea con corpus multimodal |
| MedSAM | Cualquier modalidad 2D | Segmentación | Pre-anotación asistida (sugerencia de modelo) antes de revisión humana |

### 2. Segmentación anatómica

| Modelo | Modalidad | Tarea | Uso recomendado |
|---|---|---|---|
| nnU-Net | CT, MRI (2D/3D) | Segmentación | Motor autoconfigurable; preset "segmentación biomédica genérica" |
| TotalSegmentator | CT, MRI | Segmentación de +100 estructuras | Preset "segmentación anatómica preentrenada", fine-tuning rápido |
| MONAI Model Zoo | Multi-modalidad | Segmentación, clasificación, detección | Repositorio de modelos listos para exportar como preset |

### 3. Radiografía de tórax / pulmón

| Modelo | Modalidad | Tarea | Uso recomendado |
|---|---|---|---|
| CheXNet / CheXpert | Rayos X de tórax | Clasificación multi-etiqueta | Preset "rayos X torácico" |
| TorchXRayVision | Rayos X de tórax | Clasificación | Alternativa liviana, pesos intercambiables |

### 4. Patología digital / histología

| Modelo | Modalidad | Tarea | Uso recomendado |
|---|---|---|---|
| HIPT | Whole slide images (WSI) | Clasificación jerárquica | Preset "histopatología", imágenes gigapixel |
| CTransPath | WSI | Backbone self-supervised | Fine-tuning con poco dato etiquetado |
| UNI (Mahmood Lab) | WSI | Backbone fundacional | Alternativa reciente y robusta a CTransPath |

### 5. Oftalmología / retina

| Modelo | Modalidad | Tarea | Uso recomendado |
|---|---|---|---|
| RETFound | Fondo de ojo, OCT | Clasificación, detección de enfermedad | Preset "retinopatía / seguimiento ocular" |

### 6. Detección/segmentación de células y núcleos (familia SAM + especialistas)

| Modelo | Modalidad | Tarea | Uso recomendado |
|---|---|---|---|
| μSAM (micro-SAM) | Microscopía de luz y electrónica | Segmentación de instancias (célula, núcleo, organelo) | Adaptación de SAM/SAM2 a microscopía; punto de partida general para fine-tuning propio |
| CellSAM | Microscopía (amplio rango de tipos celulares) | Detección + segmentación de instancias | Cabeza de detección propia (CellFinder) sobre SAM para prompts automáticos; alto rendimiento |
| CellposeSAM | Microscopía de luz | Segmentación de instancias | Extensión de Cellpose con backbone SAM; modelo de referencia más competitivo hoy |
| Cellpose (clásico) | Microscopía de luz | Segmentación de instancias | Preset "liviano" sin backbone SAM completo |
| StarDist | Microscopía de luz, histopatología | Segmentación de núcleos (formas convexas) | Especialista en núcleos, no basado en SAM, buen baseline complementario |
| SAM / SAM2 / SAM3 (genéricos) | Cualquiera | Segmentación de instancias por prompt | Fallback genérico si no hay modelo de célula específico cargado. **Nota de arquitectura**: SAM y SAM2 generan instancias por grilla de puntos + NMS (AMG); SAM3 predice instancias directamente con enfoque estilo DETR — un cambio de AMG a SAM3 no es solo cambio de pesos, es cambio de arquitectura de inferencia |

### 7. Detección de objetos (arquitectura genérica, reentrenable con datos médicos)

| Modelo | Modalidad | Tarea | Uso recomendado |
|---|---|---|---|
| YOLO (v8+) | Cualquiera | Detección de objetos | Preset "detección de lesión/objeto médico" reentrenado con anotaciones propias |
| Faster R-CNN / Detectron2 | Cualquiera | Detección de objetos | Alternativa cuando se prioriza precisión sobre velocidad |

---

## FASE 1 — Auditoría del estado actual

Revisa el código, la documentación y la configuración del sistema y responde, con evidencia concreta (archivos, funciones, esquemas de datos), a lo siguiente:

1. **Inventario de los 23 tipos de proyecto**: cuáles ya tocan flujo médico (aunque sea parcialmente) y cuáles son puramente generalistas.
2. **Modelo de datos actual**: ¿existe un campo de identificador de sujeto/paciente? ¿es de primer nivel o metadata suelta? ¿cómo se hace hoy el split train/val/test?
3. **Anotación multievaluador**: ¿existe cegamiento entre evaluadores? ¿existe adjudicación de discrepancias? ¿se calcula algún acuerdo (kappa, Dice, límites de acuerdo de Bland-Altman)?
4. **Trazabilidad/procedencia de etiquetas**: qué campos existen hoy (usa como referencia el esquema ya implementado en coordenadas de video: fijada/revisada/interpolada) y en qué otros módulos falta generalizarlo.
5. **Flujo de entrenamiento actual**: cómo se selecciona hoy un modelo y un preset de configuración; qué presets existen; cuáles son genéricos y cuáles (si hay alguno) biomédicos.
6. **Flujo de exportación/despliegue**: qué se exporta hoy (¿solo pesos y etiquetas?) y si existe algo parecido a un "contrato de modelo" o documentación de uso previsto.
7. **Brechas frente a los cuatro pilares** definidos arriba: (a) construcción de patrones de referencia, (b) partición a nivel de sujeto, (c) procedencia generalizada, (d) contrato de modelo hacia despliegue clínico.

**Entrega de la Fase 1**: tabla con columnas `Pilar / Estado actual / Brecha / Archivos o módulos involucrados`.

---

## FASE 2 — Roadmap de biomedicalización

Con base en la Fase 1, propone un roadmap por etapas (por dependencia técnica, no por fecha) que:

- Priorice lo que desbloquea más valor con menos esfuerzo (ej. si el identificador de sujeto ya existe pero no es obligatorio en el split, es más barato que construir el módulo de adjudicación desde cero).
- Indique para cada etapa: qué se construye, qué pilar cierra, qué tipos de proyecto existentes se ven afectados, y qué se necesita validar con datos reales antes de dar la etapa por cerrada.
- Señale explícitamente los **puntos de no retorno**: cambios de esquema de datos que, una vez hechos, son difíciles de revertir sin migración (ej. hacer obligatorio el identificador de sujeto, o migrar un preset de arquitectura AMG a DETR-style como en el salto a SAM3).

**Entrega de la Fase 2**: lista de etapas numeradas, cada una con los cuatro puntos anteriores, más un diagrama de dependencias simple (texto o Mermaid) mostrando qué etapa habilita a cuál.

---

## FASE 3 — Presets de entrenamiento (biomédico + generalista)

Diseña la estructura del flujo "seleccionar modelo → seleccionar preset" de modo que conviva lo biomédico y lo generalista sin que un público estorbe al otro.

1. **Selector de dominio primero**: un primer paso "tipo de dominio" (general / biomédico) que filtra tanto los modelos como los presets disponibles, en vez de mezclar ambos en una sola lista larga. El público generalista no debe ver la complejidad biomédica a menos que la elija explícitamente.

2. **Familia de presets generalistas**: los que ya existen hoy en Annotix, sin modificar (velocidad, precisión, dataset pequeño/grande, etc.), pensados para detección/clasificación de objetos cotidianos.

3. **Familia de presets biomédicos**: nuevos, construidos sobre el catálogo de modelos de la sección de referencia fija. Para cada preset biomédico especifica:
   - Modelo base recomendado (de la tabla)
   - Tarea (clasificación / detección / segmentación)
   - Modalidad objetivo (CT, MRI, rayos X, microscopía, WSI, retina, etc.)
   - Validaciones previas obligatorias antes de poder lanzar el entrenamiento (ej.: si no hay identificador de sujeto cargado, o si el corpus no tiene reporte de acuerdo entre evaluadores calculado, el preset no se habilita)
   - Parámetros de dominio específico a ajustar respecto al preset genérico equivalente (ej.: augmentations que no distorsionen relaciones anatómicas, manejo de clases desbalanceadas típico de patología rara, resolución/color propio de la modalidad)

4. **Generación automática de metadatos de procedencia y contrato de modelo**: indica qué metadatos de procedencia y qué reporte de acuerdo entre evaluadores debe adjuntar automáticamente cada preset biomédico al modelo entrenado, de forma que el contrato de modelo (ver pilar 4) se genere solo, sin trabajo manual del usuario.

**Entrega de la Fase 3**:
- Tabla de presets con columnas: `Nombre / Familia (general o biomédico) / Modelo base / Tarea / Modalidad / Validaciones previas requeridas`.
- Diagrama de flujo simple (texto o Mermaid) del selector: `Tipo de dominio → Modelo → Preset → Validaciones → Entrenamiento → Contrato de modelo`.

---

## Notas de alcance para quien ejecute este prompt

- No renombrar ni modificar los 23 tipos de proyecto existentes en esta fase; solo identificar cuáles se ven afectados por los nuevos pilares.
- No implementar código en esta pasada — el resultado esperado es el diagnóstico (Fase 1), el plan (Fase 2) y el diseño de presets (Fase 3), listos para revisión antes de tocar el código.
- Si algún dato de la Fase 1 no se puede verificar con el código disponible, márcalo explícitamente como "no verificable con la información actual" en vez de asumir.
