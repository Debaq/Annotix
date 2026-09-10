# Antecedentes de Annotix

Descripción del sistema — versión 2.9.10, estado al 23 de junio de 2026.
Licencia MIT · TecMedHub, Universidad Austral de Chile, Campus Puerto Montt.

Plataforma de escritorio de código abierto para anotación de conjuntos de datos de aprendizaje
automático, entrenamiento integrado y colaboración entre pares, sobre imagen, video, audio,
series temporales y datos tabulares.

---

## 1. Magnitud

| Métrica | Valor |
|---|---|
| Líneas TypeScript / TSX | 45 882 |
| Líneas Rust | 40 858 |
| Comandos IPC registrados | 194 |
| Tipos de proyecto | 23 |
| Backends de entrenamiento | 19 |
| Formatos de exportación / importación | 17 / 8 |
| Idiomas × espacios de nombres | 10 × 47 |
| Pruebas unitarias en Rust | 68 |

La serie 2.5–2.9 acumula 63 confirmaciones sobre la versión 2.4.4 de abril de 2026, distribuidas
en 20 versiones etiquetadas.

---

## 2. Arquitectura

Aplicación monolítica de escritorio construida sobre **Tauri 2**: una interfaz web embebida y un
backend nativo en Rust conviven en un mismo proceso y se comunican mediante llamadas tipadas. No
hay servidor propio ni dependencia de red para operar.

**Interfaz** — React 19 con TypeScript 5.7, empaquetado con Vite 6. Tailwind 3.4 y shadcn/ui
sobre Radix para los componentes; Zustand 5 para estado global persistente; React Router 7 para
navegación.

**Lienzo y gráficos** — Konva 10 para el lienzo de anotación; Chart.js 4 con complementos de zoom
y anotación para las métricas; jsPDF con html2canvas para el informe de entrenamiento; TanStack
Virtual 3 para virtualizar la galería.

**Backend** — Rust edición 2021, mínimo 1.89. Se organiza en 24 módulos de comandos más los
subsistemas de almacenamiento, exportación, importación, entrenamiento, inferencia, red entre
pares, servidor local y automatización de navegador.

**Idiomas** — i18next 24 con carga diferida por espacio de nombres y respaldo en inglés: alemán,
español, francés, inglés, italiano, japonés, coreano, portugués, ruso y chino.

---

## 3. Modelo de almacenamiento

No hay base de datos. El estado completo reside en archivos legibles sobre el disco del usuario,
lo que permite copiar, versionar o inspeccionar un proyecto sin la aplicación.

```
~/.local/share/annotix/
 ├ config.json          configuración global (ruta de proyectos)
 ├ sam_models/          codificadores y decodificadores SAM
 └ p2p/iroh/            blobs y documentos replicados

{projects_dir}/{uuid}/
 ├ project.json         el proyecto completo
 ├ images/  thumbnails/
 ├ videos/  audio/
 ├ models/              modelos de inferencia registrados
 └ training/            datasets y resultados por trabajo
```

`project.json` es un documento único que agrega metadatos, clases, imágenes con sus anotaciones,
series temporales, videos con sus tracks, audio, datos tabulares, trabajos de entrenamiento con su
historial de métricas por época, modelos de inferencia, oraciones de TTS y la configuración de
colaboración. Sobre él operan una caché en memoria con marca de modificación y una escritura por
archivo temporal seguida de renombrado.

Los identificadores son UUID v4 en cadena a lo largo de toda la pila. Los identificadores de clase
se reindexan a su posición al guardar, y el remapeo se propaga a anotaciones de imagen, tracks de
video, audio y series temporales.

---

## 4. Tipos de proyecto

Veintitrés tipos agrupados en cuatro familias, cada una con su propio editor y su ruta de
exportación.

| Familia | N.º | Tipos |
|---|---|---|
| Imagen | 9 | detección, detección orientada, segmentación semántica, segmentación de instancias, polígonos, keypoints, landmarks, clasificación simple, clasificación multietiqueta |
| Series temporales | 9 | clasificación, pronóstico, detección de anomalías, segmentación, reconocimiento de patrones, detección de eventos, regresión, agrupamiento, imputación |
| Audio | 4 | clasificación, reconocimiento del habla, detección de eventos sonoros, grabación para síntesis de voz |
| Tabular | 1 | editor propio con selección de columnas y entrenamiento con scikit-learn |

El video es una vía de captura más que un tipo de proyecto: los fotogramas extraídos se registran
como imágenes del proyecto.

---

## 5. Subsistemas

### Anotación de imagen

Siete herramientas sobre un lienzo Konva: caja, caja orientada, máscara por pincel, polígono,
keypoints con esqueletos predefinidos (COCO, rostro, mano, MediaPipe), landmarks nombrados y
desplazamiento. Incluye zoom, rotación, visibilidad por anotación, paneles flotantes arrastrables
cuya posición persiste por proyecto, historial de cien pasos y selección rápida de hasta veinte
clases por teclado. Admite WebP por proyecto con cinco presets de calidad, e ingesta de documentos
PDF rasterizando sus páginas con pdfium.

### Asistencia SAM

Segment Anything se ejecuta localmente en ONNX, con codificador y decodificador separados. El
flujo principal es la generación automática de máscaras: una grilla de puntos alimenta el
decodificador en lote y produce candidatas que se filtran por los umbrales de la tabla. Cada
candidata conserva las tres salidas multimáscara como logits de 8 bits a 256 píxeles de lado, de
modo que el deslizador de granularidad alterna entre ellas sin reejecutar el decodificador. Un
modo alternativo refina por clics positivos y negativos sobre el *embedding* en caché. Las
candidatas son efímeras: nunca se escriben en `project.json`. Los modelos se almacenan a nivel de
aplicación y se comparten entre proyectos.

| Parámetro | Valor | Función |
|---|---|---|
| `points_per_side` | 16 | grilla de puntos-prompt; 32 en modo alta calidad |
| `pred_iou_thresh` | 0,70 | descarta máscaras de baja confianza del decodificador |
| `stability_score_thresh` | 0,85 | estabilidad ante variación del umbral de logits |
| `box_nms_thresh` | 0,70 | supresión de no-máximos sobre las cajas |
| `min_mask_region_area` | 100 px | área mínima de una máscara admitida |
| `overlap_with_existing_thresh` | 0,50 | solape máximo con anotaciones ya presentes |

### Video

Extracción de fotogramas con FFmpeg a una tasa configurable; los fotogramas quedan registrados
como entradas de imagen con referencia a su video y su índice de muestreo. La anotación se
organiza en tracks con fotogramas clave e interpolación lineal, y la operación de consolidación
materializa las anotaciones fotograma a fotograma.

### Audio

Cada entrada registra duración, frecuencia de muestreo, transcripción, hablante, idioma,
segmentos, clase y eventos. El editor ofrece forma de onda, corte, grabación por micrófono y un
flujo de síntesis de voz con análisis de cobertura fonética y generación de oraciones asistida por
un modelo de lenguaje.

### Entrenamiento integrado

Diecinueve backends cubren detección (YOLO hasta YOLO26, RT-DETR, RF-DETR, MMDetection),
segmentación semántica (SMP, HuggingFace, MMSegmentation), segmentación de instancias
(Detectron2), pose (MMPose), detección orientada (MMRotate), clasificación (timm, HuggingFace),
siete backends de series temporales y scikit-learn para datos tabulares. El entorno de Python se
aísla con micromamba y detecta la GPU disponible.

Cuatro modos de ejecución: local, paquete descargable, nube y automatización de navegador. En la
nube se admiten Vertex AI (personalizado y ajuste), Colab Enterprise, Kaggle, Lightning AI,
HuggingFace y Saturn Cloud. Seis presets por escenario cubren objetos pequeños, industrial,
tránsito, dispositivos móviles, médico y aéreo.

El ejecutor comunica el progreso mediante eventos estructurados en la salida del proceso, conserva
el historial de métricas por época, y ofrece monitor con sugerencias, observaciones libres e
informe en PDF. La exportación del modelo alcanza PyTorch, ONNX, TorchScript, TFLite, CoreML y
TensorRT.

### Inferencia

ONNX Runtime reconoce automáticamente cinco familias de salida: YOLOv8 y posteriores, YOLOv5–v7
con puntaje de objetividad, YOLOv10 y YOLO26 de extremo a extremo sin supresión de no-máximos,
modelos multi-salida (SSD, EfficientDet, Faster R-CNN, DETR) y clasificación. Deduce las clases y
el tamaño de entrada de los metadatos del modelo. Los proveedores de ejecución acelerada
—TensorRT, CUDA, DirectML y CoreML— se activan por elección explícita; la ruta en CPU emplea
redimensionado vectorizado y canalización paralela. Permite inferencia por lotes sobre el
proyecto, con aceptación o rechazo por predicción y conversión a anotaciones.

### Exportación e importación

Diecisiete formatos de salida: YOLO de detección y de segmentación, COCO, Pascal VOC, CSV en
cuatro variantes, carpetas por clase, máscaras U-Net, el formato nativo TIX, vista previa
rasterizada con y sin etiquetas, y cuatro formatos de audio (HuggingFace ASR, LJSpeech, CSV de
clasificación y CSV de eventos). A la entrada, ocho formatos con un detector automático que puntúa
su confianza, más la fusión de varios archivos TIX homogeneizando los conjuntos de clases.

### Colaboración entre pares

Malla QUIC construida con Iroh, sin servidor central, combinando documentos replicados,
transferencia de blobs y difusión por gossip. El descubrimiento mantiene alcanzables a los pares
entre redes distintas mediante registros distribuidos, DNS y retransmisores. Tres roles
—investigador principal, anotador y curador de datos— se combinan con reglas de sesión que ajustan
los permisos de subida, exportación, edición de clases y borrado. Incluye bloqueos de presencia
por imagen con vigencia de tres minutos y renovación automática, latido para el estado en línea,
distribución de lotes de trabajo con estadísticas por par, cola de aprobación de datos, cambio de
rol en vivo y descargas reanudables. El secreto del anfitrión se cifra con ChaCha20-Poly1305. El
documento replicado abarca imágenes, anotaciones y clases.

### Servidor de red local

Servidor HTTP que publica proyectos en la red local con una interfaz web embebida y autenticación
por credencial de portador, de modo que un colaborador anota desde el navegador sin instalar nada.
Expone puntos de acceso para listar proyectos, imágenes, miniaturas y anotaciones, y para recibir
escrituras. Busca un puerto libre, enumera las direcciones locales y verifica su alcanzabilidad
antes de anunciar la dirección.

### Automatización de navegador

Control de navegadores Chromium por el protocolo de herramientas de desarrollo, con detección de
los navegadores instalados. Tiene dos usos: entrenar gratuitamente en Colab sobre una GPU T4 con
progreso en tiempo real, y consultar modelos de lenguaje sin claves de API a través de la sesión
del propio usuario —Kimi, Qwen, DeepSeek y HuggingChat—, con los selectores de cada proveedor
externalizados en archivos de configuración.

---

## 6. Distribución

La integración continua se ejecuta en GitHub Actions sobre Node 24 y pnpm, con verificación de
formato, análisis estático y pruebas en cada envío. Linux se publica como un archivo comprimido
autocontenido con el binario, la biblioteca de pdfium y un lanzador; Windows, como instalador NSIS
y paquete MSI con las bibliotecas de FFmpeg incluidas. macOS se compila desde el código fuente. La
aplicación consulta las publicaciones del repositorio y muestra un aviso de actualización con el
registro de cambios correspondiente.

---

## 7. Procedencia y citación

El trabajo se publicó en Preprints.org en abril de 2026 bajo el título *Annotix: An Open-Source
Desktop Platform for Comprehensive Machine Learning Dataset Annotation*. El repositorio incluye un
archivo `.zenodo.json` con la autoría y los identificadores ORCID, de modo que cada versión
etiquetada obtiene un DOI citable. El código se distribuye bajo licencia MIT.
