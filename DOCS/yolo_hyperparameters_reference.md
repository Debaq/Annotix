# 📘 Guía Completa de Hiperparámetros YOLO (Ultralytics)

> Referencia exhaustiva de todos los hiperparámetros disponibles en modelos YOLO de Ultralytics (YOLOv5, YOLOv8, YOLO11, YOLO26).  
> Incluye valores por defecto, rangos válidos, y guía práctica de uso.

---

## 1. CONFIGURACIÓN DE ENTRENAMIENTO (Train Settings)

### 1.1 Estructura del Modelo y Dataset

| Parámetro | Tipo | Default | Rango / Opciones | Descripción |
|-----------|------|---------|-------------------|-------------|
| `model` | `str` | `None` | Ruta a `.pt` o `.yaml` | Archivo del modelo. Usar `.pt` para transfer learning desde pesos preentrenados, `.yaml` para entrenar desde cero. Ej: `yolo26n.pt` |
| `data` | `str` | `None` | Ruta a `.yaml` | Archivo de configuración del dataset con rutas a train/val, nombres de clases y número de clases. |
| `task` | `str` | `'detect'` | `detect`, `segment`, `classify`, `pose`, `obb` | Tarea de visión por computadora a realizar. |
| `single_cls` | `bool` | `False` | `True` / `False` | Trata todas las clases como una sola. Útil para tareas binarias (hay objeto / no hay objeto). |
| `classes` | `list[int]` | `None` | Lista de IDs | Filtra el entrenamiento solo a las clases especificadas. Ej: `[0, 2, 5]` |

### 1.2 Duración y Control del Entrenamiento

| Parámetro | Tipo | Default | Rango / Opciones | Descripción |
|-----------|------|---------|-------------------|-------------|
| `epochs` | `int` | `100` | 1 — 10000+ | Número total de pasadas completas sobre el dataset. Más epochs = más tiempo pero potencialmente mejor convergencia. Modelos nano con datasets pequeños suelen necesitar 150-300. |
| `time` | `float` | `None` | Horas (ej: `2.5`) | Tiempo máximo de entrenamiento en horas. Si se define, sobreescribe `epochs`. Útil cuando hay límite de tiempo (ej: GPU alquilada). |
| `patience` | `int` | `100` | 1 — 1000 | Epochs sin mejora antes de activar early stopping. Valores bajos (30-50) previenen sobreentrenamiento. Valores altos (100+) dan más oportunidades de mejora tardía. |
| `resume` | `bool` | `False` | `True` / `False` | Reanuda entrenamiento desde el último checkpoint guardado. Carga pesos, estado del optimizador y número de epoch automáticamente. |
| `save` | `bool` | `True` | `True` / `False` | Habilita guardar checkpoints y pesos finales del modelo. |
| `save_period` | `int` | `-1` | -1 (desactivado) o 1+ | Frecuencia en epochs para guardar checkpoints intermedios. Ej: `save_period=10` guarda cada 10 epochs. |
| `exist_ok` | `bool` | `False` | `True` / `False` | Permite sobreescribir el directorio de salida existente. |
| `project` | `str` | `None` | Nombre de carpeta | Directorio padre donde se guardan los resultados del entrenamiento. |
| `name` | `str` | `None` | Nombre de subcarpeta | Nombre del run, crea subdirectorio dentro de `project`. |

### 1.3 Batch, Imagen y Dispositivo

| Parámetro | Tipo | Default | Rango / Opciones | Descripción |
|-----------|------|---------|-------------------|-------------|
| `imgsz` | `int` | `640` | 32 — 1280+ (múltiplo de 32) | Tamaño de imagen de entrada. Las imágenes se redimensionan a cuadrados de este tamaño (si `rect=False`). **Impacto enorme en velocidad**: el cómputo escala cuadráticamente (640→320 = 4x menos cómputo). Elegir según el tamaño real de los objetos. |
| `batch` | `int/float` | `16` | `-1`, `0.0-1.0`, o `1-1024+` | Tamaño del batch. `-1` = auto (60% GPU mem). `0.70` = auto al 70% GPU mem. Entero = tamaño fijo. Batch más grande = entrenamiento más estable pero más memoria. |
| `cache` | `bool/str` | `False` | `False`, `True`/`'ram'`, `'disk'` | Cachear imágenes del dataset. `'ram'` = en memoria (rápido, consume RAM). `'disk'` = en disco. `False` = leer desde disco cada vez. |
| `device` | `int/str/list` | `None` | `0`, `'cpu'`, `'mps'`, `[0,1]`, `-1` | Dispositivo de cómputo. `0` = primera GPU, `'cpu'` = CPU, `'mps'` = Apple Silicon, `[0,1]` = multi-GPU, `-1` = GPU más libre automáticamente. |
| `workers` | `int` | `8` | 0 — 32 | Hilos de carga de datos por cada RANK. Más workers = carga más rápida pero más CPU/RAM. En Windows a veces conviene `workers=0`. |
| `rect` | `bool` | `False` | `True` / `False` | Padding mínimo respetando aspect ratio en vez de forzar cuadrado. Más eficiente si las imágenes no son cuadradas. Puede afectar precisión ligeramente. |
| `multi_scale` | `float` | `0.0` | 0.0 — 1.0 | Varía `imgsz` aleatoriamente en cada batch ±este valor. Ej: `0.25` con `imgsz=640` varía entre 480-800. `0.0` desactiva. Mejora robustez a diferentes escalas. |
| `fraction` | `float` | `1.0` | 0.0 — 1.0 | Fracción del dataset a usar. `0.5` = usar solo el 50%. Útil para experimentos rápidos o recursos limitados. |
| `amp` | `bool` | `True` | `True` / `False` | Mixed Precision (FP16/FP32). Reduce memoria y acelera entrenamiento con mínimo impacto en precisión. Desactivar solo si hay errores de NaN. |
| `profile` | `bool` | `False` | `True` / `False` | Perfila velocidades ONNX y TensorRT durante entrenamiento. Para optimización de despliegue. |

### 1.4 Optimizador y Learning Rate

| Parámetro | Tipo | Default | Rango / Opciones | Descripción |
|-----------|------|---------|-------------------|-------------|
| `optimizer` | `str` | `'auto'` | `'SGD'`, `'MuSGD'`, `'Adam'`, `'Adamax'`, `'AdamW'`, `'NAdam'`, `'RAdam'`, `'RMSProp'`, `'auto'` | Optimizador. `'auto'` selecciona según el modelo (YOLO26 usa MuSGD). `SGD` = clásico, estable. `Adam/AdamW` = converge rápido, más memoria. `MuSGD` = híbrido SGD+Muon, nuevo en YOLO26. |
| `lr0` | `float` | `0.01` | 1e-5 — 1e-1 | Learning rate inicial. `SGD` suele usar ~0.01. `Adam` suele usar ~0.001. Muy alto = inestable. Muy bajo = convergencia lenta. |
| `lrf` | `float` | `0.01` | 0.0001 — 1.0 | LR final como fracción del inicial: `lr_final = lr0 × lrf`. Con `lr0=0.01` y `lrf=0.01`, el LR final es 0.0001. Valores más bajos = ajuste más fino al final. |
| `momentum` | `float` | `0.937` | 0.6 — 0.98 | Factor de momentum para SGD o beta1 para Adam. Valores altos (~0.95) = más inercia, entrenamiento más suave. Valores bajos = más reactivo a gradientes recientes. |
| `weight_decay` | `float` | `0.0005` | 0.0 — 0.01 | Regularización L2. Penaliza pesos grandes para prevenir sobreajuste. `0.0` = sin regularización. `0.001+` = fuerte regularización. |
| `cos_lr` | `bool` | `False` | `True` / `False` | Scheduler coseno en vez de lineal. El LR sigue una curva coseno suave, bajando lentamente al principio, rápido al medio, y suave al final. Mejora convergencia fina. |
| `warmup_epochs` | `float` | `3.0` | 0.0 — 10.0 | Epochs de warmup donde el LR sube gradualmente desde un valor bajo al LR inicial. Estabiliza el inicio del entrenamiento. Acepta decimales (ej: 2.5). |
| `warmup_momentum` | `float` | `0.8` | 0.0 — 0.95 | Momentum inicial durante warmup. Sube gradualmente al valor de `momentum` configurado. |
| `warmup_bias_lr` | `float` | `0.1` | 0.0 — 0.2 | LR para los parámetros de bias durante warmup. Ayuda a estabilizar las primeras epochs. |
| `nbs` | `int` | `64` | 1 — 128 | Batch nominal para normalización del loss. Si `batch < nbs`, el loss se escala proporcionalmente. No suele necesitar ajuste. |

### 1.5 Pesos del Loss

| Parámetro | Tipo | Default | Rango / Opciones | Descripción |
|-----------|------|---------|-------------------|-------------|
| `box` | `float` | `7.5` | 0.0 — 20.0 | Peso del loss de bounding box (localización). **Subir** si necesitas localización muy precisa. **Bajar** si te importa más la clasificación. |
| `cls` | `float` | `0.5` | 0.0 — 5.0 | Peso del loss de clasificación. **Subir** con pocas clases donde la distinción entre clases es importante. **Bajar** con muchas clases similares. |
| `dfl` | `float` | `1.5` | 0.0 — 5.0 | Peso del Distribution Focal Loss. Usado en YOLOv8/YOLO11 para clasificación fina. **YOLO26 no usa DFL** (poner 0.0). |
| `pose` | `float` | `12.0` | 0.0 — 20.0 | Peso del loss de pose (solo para modelos de estimación de pose). Afecta la precisión de predicción de keypoints. |
| `kobj` | `float` | `1.0` | 0.0 — 5.0 | Peso del objectness de keypoints en modelos de pose. Balancea confianza de detección con precisión de pose. |
| `rle` | `float` | `1.0` | 0.0 — 5.0 | Peso del Residual Log-Likelihood Estimation en modelos de pose. Afecta precisión de localización de keypoints. |
| `angle` | `float` | `1.0` | 0.0 — 5.0 | Peso del loss de ángulo en modelos OBB (bounding boxes orientados). Afecta la precisión del ángulo de rotación. |

### 1.6 Transfer Learning y Reproducibilidad

| Parámetro | Tipo | Default | Rango / Opciones | Descripción |
|-----------|------|---------|-------------------|-------------|
| `pretrained` | `bool/str` | `True` | `True`, `False`, o ruta a `.pt` | Usar pesos preentrenados. `True` = cargar desde el modelo base. Ruta = cargar pesos específicos. `False` = entrenar desde cero (no recomendado salvo datasets enormes). |
| `freeze` | `int/list` | `None` | `None`, entero, o lista de índices | Congela las primeras N capas o capas específicas. `freeze=10` = congela capas 0-9 (backbone). Útil para fine-tuning con pocos datos. `None` = entrenar todo. |
| `seed` | `int` | `0` | 0 — 2³² | Semilla para reproducibilidad. Mismo seed + misma configuración = mismos resultados. |
| `deterministic` | `bool` | `True` | `True` / `False` | Fuerza algoritmos deterministas. Garantiza reproducibilidad pero puede ser ligeramente más lento. |
| `dropout` | `float` | `0.0` | 0.0 — 1.0 | Tasa de dropout (solo clasificación). No se usa normalmente en detección. `0.3-0.5` para clasificación con sobreajuste. |

### 1.7 Otros

| Parámetro | Tipo | Default | Rango / Opciones | Descripción |
|-----------|------|---------|-------------------|-------------|
| `close_mosaic` | `int` | `10` | 0 — 50 | Desactiva augmentación mosaic las últimas N epochs. `0` = no desactivar nunca. Valores altos (20-30) estabilizan la fase final del entrenamiento. |
| `overlap_mask` | `bool` | `True` | `True` / `False` | Solo segmentación. Si las máscaras de objetos se fusionan o se mantienen separadas. |
| `mask_ratio` | `int` | `4` | 1 — 8 | Solo segmentación. Factor de reducción de resolución de máscaras durante entrenamiento. |
| `max_det` | `int` | `300` | 1 — 3000 | Número máximo de detecciones por imagen en validación durante entrenamiento. Reducir si sabes que hay pocos objetos (ahorra cómputo). |
| `val` | `bool` | `True` | `True` / `False` | Ejecutar validación después de cada epoch. Desactivar solo para acelerar entrenamiento puro. |
| `plots` | `bool` | `True` | `True` / `False` | Generar gráficos de métricas de entrenamiento y predicciones ejemplo. |
| `verbose` | `bool` | `True` | `True` / `False` | Mostrar salida detallada en consola durante entrenamiento. |
| `compile` | `bool/str` | `False` | `False`, `True`/`'default'`, `'reduce-overhead'`, `'max-autotune-no-cudagraphs'` | Habilita `torch.compile` de PyTorch 2.x para compilación de grafos. Puede acelerar entrenamiento en GPUs compatibles pero aumenta el tiempo de compilación inicial. |

---

## 2. AUGMENTACIONES (Data Augmentation)

Las augmentaciones se aplican durante el entrenamiento para aumentar la variedad del dataset y mejorar la generalización del modelo.

### 2.1 Augmentaciones Geométricas

| Parámetro | Tipo | Default | Rango | Descripción |
|-----------|------|---------|-------|-------------|
| `scale` | `float` | `0.5` | 0.0 — 1.0 | Variación de escala (zoom in/out). `0.5` = la imagen puede escalar entre 50%-150% de su tamaño. `0.0` = sin variación. **Reducir** si los objetos tienen tamaño consistente (cámara fija). **Subir** si hay gran variación de distancia. |
| `translate` | `float` | `0.1` | 0.0 — 0.9 | Desplazamiento horizontal/vertical como fracción del tamaño de imagen. `0.1` = ±10% de desplazamiento. **Subir** si el objeto puede aparecer en cualquier parte. **Bajar** si siempre está centrado. |
| `fliplr` | `float` | `0.5` | 0.0 — 1.0 | Probabilidad de voltear horizontalmente (espejo). `0.5` = 50% de probabilidad. `0.0` = nunca voltear. **Desactivar** si la lateralidad importa (ej: texto, dirección del tráfico). |
| `flipud` | `float` | `0.0` | 0.0 — 1.0 | Probabilidad de voltear verticalmente. `0.0` = desactivado por defecto. **Activar** (0.5) si los objetos pueden aparecer invertidos (ej: imágenes aéreas, microscopía). |
| `degrees` | `float` | `0.0` | -180.0 — 180.0 | Rango de rotación aleatoria en grados. `0.0` = sin rotación. `±10` = rotación ligera. **Usar** para objetos que pueden rotar (ej: piezas en cinta transportadora). |
| `shear` | `float` | `0.0` | -180.0 — 180.0 | Rango de cizallamiento en grados. Deforma la imagen paralelamente. `0.0` = sin cizallamiento. Usar con precaución, valores altos distorsionan mucho. |
| `perspective` | `float` | `0.0` | 0.0 — 0.001 | Transformación de perspectiva. Valores muy pequeños (0.0001). Simula diferentes ángulos de cámara. Puede distorsionar bounding boxes. |

### 2.2 Augmentaciones de Color

| Parámetro | Tipo | Default | Rango | Descripción |
|-----------|------|---------|-------|-------------|
| `hsv_h` | `float` | `0.015` | 0.0 — 1.0 | Variación del tono (hue). Cambia los colores de la imagen. `0.015` = ligera variación. **Subir** si la iluminación varía mucho (exterior). **Bajar** si es ambiente controlado. |
| `hsv_s` | `float` | `0.7` | 0.0 — 1.0 | Variación de la saturación. `0.7` = variación significativa. **Reducir** si los colores son clave para distinguir clases. |
| `hsv_v` | `float` | `0.4` | 0.0 — 1.0 | Variación del brillo (value). `0.4` = variación moderada. **Subir** para condiciones de iluminación variable. **Bajar** para iluminación controlada. |

### 2.3 Augmentaciones de Composición

| Parámetro | Tipo | Default | Rango | Descripción |
|-----------|------|---------|-------|-------------|
| `mosaic` | `float` | `1.0` | 0.0 — 1.0 | Probabilidad de aplicar mosaic (combina 4 imágenes en una). Aumenta la variedad de contexto y escala. `1.0` = siempre. `0.0` = nunca. **Reducir** si los objetos son pequeños (pueden quedar muy reducidos). Siempre se desactiva las últimas `close_mosaic` epochs. |
| `mixup` | `float` | `0.0` | 0.0 — 1.0 | Probabilidad de aplicar mixup (mezcla transparente de dos imágenes). Bueno para regularización. `0.0` = desactivado. `0.1-0.3` = uso ligero recomendado. Valores altos confunden al modelo. |
| `copy_paste` | `float` | `0.0` | 0.0 — 1.0 | Solo segmentación. Probabilidad de copiar/pegar objetos de una imagen a otra. Aumenta variedad de posiciones y fondos. |
| `copy_paste_mode` | `str` | `'flip'` | `'flip'`, `'mixup'` | Modo de copy-paste. `'flip'` = copia y voltea. `'mixup'` = copia con transparencia. |
| `erasing` | `float` | `0.4` | 0.0 — 0.9 | Probabilidad de borrado aleatorio (random erasing). Pone un rectángulo gris sobre parte de la imagen. Simula oclusión parcial. **Reducir** con objetos pequeños (pueden borrarse completamente). |
| `crop_fraction` | `float` | `1.0` | 0.1 — 1.0 | Solo clasificación. Fracción de recorte de la imagen. `1.0` = imagen completa. |
| `auto_augment` | `str` | `'randaugment'` | `'randaugment'`, `'autoaugment'`, `'augmix'` | Solo clasificación. Política de augmentación automática. |
| `bgr` | `float` | `0.0` | 0.0 — 1.0 | Probabilidad de invertir canales RGB→BGR. Simula diferentes formatos de imagen. |

---

## 3. CONFIGURACIÓN DE PREDICCIÓN / INFERENCIA

### 3.1 Parámetros de Inferencia

| Parámetro | Tipo | Default | Rango / Opciones | Descripción |
|-----------|------|---------|-------------------|-------------|
| `source` | `str` | `'ultralytics/assets'` | Ruta, URL, device ID | Fuente de datos. Puede ser: imagen, video, directorio, URL, cámara (`source=0`), stream RTSP. |
| `conf` | `float` | `0.25` | 0.0 — 1.0 | Umbral mínimo de confianza. Detecciones por debajo se descartan. **Subir** (0.4-0.6) para reducir falsos positivos. **Bajar** (0.1-0.2) para mayor recall. |
| `iou` | `float` | `0.7` | 0.0 — 1.0 | Umbral IoU para NMS. Menor = menos detecciones duplicadas (más agresivo). Mayor = más permisivo con solapamientos. **YOLO26 no usa NMS** pero el parámetro existe por compatibilidad. |
| `imgsz` | `int/tuple` | `640` | 32+ (múltiplo de 32) | Tamaño de imagen para inferencia. **Debe coincidir** con el usado en entrenamiento para mejores resultados. Acepta tupla `(alto, ancho)`. |
| `half` | `bool` | `False` | `True` / `False` | Inferencia en FP16. Reduce memoria y puede acelerar en GPUs compatibles. Mínimo impacto en precisión. |
| `device` | `str` | `None` | `'cpu'`, `'cuda:0'`, `'mps'` | Dispositivo para inferencia. |
| `batch` | `int` | `1` | 1 — 128 | Tamaño del batch de inferencia. Mayor = más throughput pero más latencia individual y memoria. |
| `max_det` | `int` | `300` | 1 — 3000 | Máximo de detecciones por imagen. **Reducir** si sabes el número máximo de objetos (ahorra cómputo post-procesado). |
| `vid_stride` | `int` | `1` | 1 — 100 | Stride para video. `1` = cada frame. `2` = cada 2 frames. `10` = cada 10 frames. Acelera procesamiento de video sacrificando resolución temporal. |
| `stream_buffer` | `bool` | `False` | `True` / `False` | Encolar frames de streams de video. `False` = descarta frames viejos (óptimo para real-time). `True` = encola todo (puede causar latencia). |
| `augment` | `bool` | `False` | `True` / `False` | Test-Time Augmentation (TTA). Ejecuta inferencia en múltiples versiones transformadas de la imagen. Mejora precisión a costa de velocidad (3-5x más lento). |
| `agnostic_nms` | `bool` | `False` | `True` / `False` | NMS agnóstico a clase. Fusiona cajas solapadas sin importar la clase. Útil cuando hay clases que se solapan. |
| `classes` | `list[int]` | `None` | Lista de IDs | Filtra detecciones a solo estas clases. Ej: `classes=[0, 2]` solo muestra las clases 0 y 2. |
| `retina_masks` | `bool` | `False` | `True` / `False` | Solo segmentación. Devuelve máscaras a resolución original de la imagen en vez de la resolución de inferencia. |
| `embed` | `list[int]` | `None` | Lista de índices de capa | Extrae feature vectors de capas específicas. Útil para clustering, búsqueda por similitud. |
| `stream` | `bool` | `False` | `True` / `False` | Modo generador para procesamiento eficiente de videos largos o muchas imágenes. No carga todo en memoria. |
| `visualize` | `bool` | `False` | `True` / `False` | Visualiza features intermedios del modelo. Para debugging y análisis. |
| `end2end` | `bool` | `None` | `True`, `False`, `None` | Sobreescribe el modo end-to-end en modelos NMS-free (YOLO26, YOLOv10). `False` = usar pipeline NMS tradicional. `None` = usar el modo nativo del modelo. |
| `compile` | `bool/str` | `False` | `False`, `True`, modo string | Habilita torch.compile para inferencia. Puede acelerar después de la compilación inicial. |

### 3.2 Visualización

| Parámetro | Tipo | Default | Rango / Opciones | Descripción |
|-----------|------|---------|-------------------|-------------|
| `show` | `bool` | `False` | `True` / `False` | Muestra resultados en ventana. |
| `save` | `bool` | Var. | `True` / `False` | Guarda imágenes/videos anotados. Default True en CLI, False en Python. |
| `save_frames` | `bool` | `False` | `True` / `False` | Guarda frames individuales de videos. |
| `save_txt` | `bool` | `False` | `True` / `False` | Guarda detecciones en archivos de texto formato YOLO. |
| `save_conf` | `bool` | `False` | `True` / `False` | Incluye confianza en archivos de texto guardados. |
| `save_crop` | `bool` | `False` | `True` / `False` | Guarda recortes de cada detección como imágenes individuales. |
| `show_labels` | `bool` | `True` | `True` / `False` | Muestra etiquetas de clase en la visualización. |
| `show_conf` | `bool` | `True` | `True` / `False` | Muestra confianza junto a la etiqueta. |
| `show_boxes` | `bool` | `True` | `True` / `False` | Dibuja bounding boxes. |
| `line_width` | `int/None` | `None` | `None` o 1+ | Grosor de línea de bounding boxes. `None` = ajuste automático según tamaño de imagen. |

---

## 4. CONFIGURACIÓN DE VALIDACIÓN

| Parámetro | Tipo | Default | Rango / Opciones | Descripción |
|-----------|------|---------|-------------------|-------------|
| `data` | `str` | `None` | Ruta a `.yaml` | Archivo del dataset con ruta a datos de validación. |
| `imgsz` | `int` | `640` | 32+ | Tamaño de imagen para validación. Idealmente igual al de entrenamiento. |
| `batch` | `int` | `16` | 1 — 128 | Batch para validación. Mayor = más rápido pero más VRAM. |
| `conf` | `float` | `0.001` | 0.0 — 1.0 | Umbral de confianza para validación. Mucho más bajo que inferencia para calcular curvas PR completas. |
| `iou` | `float` | `0.7` | 0.0 — 1.0 | Umbral IoU para NMS en validación. |
| `max_det` | `int` | `300` | 1 — 3000 | Máximo detecciones por imagen en validación. |
| `half` | `bool` | `False` | `True` / `False` | Validación en FP16. |
| `save_json` | `bool` | `False` | `True` / `False` | Guarda resultados en JSON (formato COCO). Para envío a servidores de evaluación. |
| `save_txt` | `bool` | `False` | `True` / `False` | Guarda detecciones en formato texto. |
| `save_conf` | `bool` | `False` | `True` / `False` | Incluye confianza en texto guardado. |
| `dnn` | `bool` | `False` | `True` / `False` | Usa OpenCV DNN para inferencia de modelos ONNX (alternativa a PyTorch). |
| `plots` | `bool` | `True` | `True` / `False` | Genera gráficos de predicciones vs ground truth, matrices de confusión, curvas PR. |
| `rect` | `bool` | `True` | `True` / `False` | Inferencia rectangular con padding mínimo para más velocidad. |
| `split` | `str` | `'val'` | `'val'`, `'test'`, `'train'` | Split del dataset para validación. |
| `augment` | `bool` | `False` | `True` / `False` | TTA durante validación. Más preciso pero más lento. |
| `agnostic_nms` | `bool` | `False` | `True` / `False` | NMS agnóstico a clase en validación. |
| `single_cls` | `bool` | `False` | `True` / `False` | Evalúa todas las clases como una sola. |
| `visualize` | `bool` | `False` | `True` / `False` | Visualiza TP, FP, FN por imagen. |
| `end2end` | `bool` | `None` | `True`, `False`, `None` | Sobreescribe modo end-to-end. |

---

## 5. CONFIGURACIÓN DE EXPORTACIÓN

| Parámetro | Tipo | Default | Rango / Opciones | Descripción |
|-----------|------|---------|-------------------|-------------|
| `format` | `str` | `'torchscript'` | `'onnx'`, `'torchscript'`, `'engine'`, `'openvino'`, `'coreml'`, `'tflite'`, `'saved_model'`, `'pb'`, `'paddle'`, `'ncnn'`, `'mnn'` | Formato de exportación. **`onnx`** = más versátil, multiplataforma. **`engine`** = TensorRT (máx velocidad NVIDIA). **`openvino`** = Intel optimizado. **`coreml`** = Apple. |
| `imgsz` | `int/tuple` | `640` | 32+ | Tamaño de imagen para el modelo exportado. **Debe coincidir** con el de entrenamiento. |
| `half` | `bool` | `False` | `True` / `False` | Cuantización FP16. Reduce tamaño del modelo ~50%. No compatible con INT8 o exportación solo CPU. Soportado en ONNX, TensorRT, OpenVINO. |
| `int8` | `bool` | `False` | `True` / `False` | Cuantización INT8. Reduce tamaño ~75% y acelera inferencia CPU significativamente. Requiere datos de calibración. En TensorRT hace quantización post-training (PTQ). |
| `dynamic` | `bool` | `False` | `True` / `False` | Tamaños de entrada dinámicos. `True` = acepta diferentes tamaños. `False` = tamaño fijo (más rápido). Auto `True` con TensorRT+INT8. |
| `simplify` | `bool` | `True` | `True` / `False` | Simplifica grafo ONNX con onnxslim. Mejora rendimiento y compatibilidad. Recomendado siempre `True`. |
| `opset` | `int` | `None` | 7 — 21 | Versión de opset ONNX. `None` = última soportada. Opsets más recientes soportan más operaciones pero pueden no ser compatibles con runtimes antiguos. |
| `workspace` | `float/None` | `None` | GiB (ej: `4.0`) | Espacio de trabajo máximo para TensorRT. `None` = auto-asignar hasta el máximo del dispositivo. |
| `nms` | `bool` | `False` | `True` / `False` | Añade NMS al modelo exportado. No disponible para modelos end-to-end (YOLO26). |
| `batch` | `int` | `1` | 1 — 128 | Batch del modelo exportado. `1` = óptimo para inferencia single-stream (real-time). Mayor para throughput. |
| `device` | `str` | `None` | `'cpu'`, `0`, `'mps'`, `'dla:0'` | Dispositivo destino de la exportación. TensorRT usa GPU automáticamente. |
| `data` | `str` | `'coco8.yaml'` | Ruta a `.yaml` | Dataset para calibración INT8. Si no se especifica con INT8, usa coco8 como fallback. |
| `fraction` | `float` | `1.0` | 0.0 — 1.0 | Fracción del dataset para calibración INT8. |
| `end2end` | `bool` | `None` | `True`, `False`, `None` | Sobreescribe modo end-to-end en YOLO26/YOLOv10. `False` = exportar con pipeline NMS tradicional. |
| `keras` | `bool` | `False` | `True` / `False` | Exportar a formato Keras para TensorFlow SavedModel. |
| `optimize` | `bool` | `False` | `True` / `False` | Optimización para móviles (TorchScript). No compatible con NCNN o CUDA. |

---

## 6. LOGGING Y CHECKPOINTS

| Parámetro | Tipo | Default | Rango / Opciones | Descripción |
|-----------|------|---------|-------------------|-------------|
| `project` | `str` | `'runs'` | Nombre de carpeta | Directorio raíz para almacenar los resultados. |
| `name` | `str` | `'train'` | Nombre de subcarpeta | Nombre del experimento dentro de `project`. |
| `exist_ok` | `bool` | `False` | `True` / `False` | Sobreescribir directorio existente. |
| `plots` | `bool` | `True` | `True` / `False` | Guardar gráficos de métricas. |
| `save` | `bool` | `True` | `True` / `False` | Guardar checkpoints del modelo. |
| `save_period` | `int` | `-1` | -1 o 1+ | Frecuencia de guardado de checkpoints en epochs. |
| `verbose` | `bool` | `True` | `True` / `False` | Output detallado en consola. |

---

## 7. RANGOS DE BÚSQUEDA PARA HYPERPARAMETER TUNING

Rangos por defecto usados por `model.tune()` con algoritmo genético:

| Parámetro | Rango Min | Rango Max | Descripción |
|-----------|-----------|-----------|-------------|
| `lr0` | 1e-5 | 1e-1 | Learning rate inicial |
| `lrf` | 0.01 | 1.0 | Fracción de LR final |
| `momentum` | 0.6 | 0.98 | Momentum |
| `weight_decay` | 0.0 | 0.001 | Regularización L2 |
| `warmup_epochs` | 0.0 | 5.0 | Epochs de warmup |
| `warmup_momentum` | 0.0 | 0.95 | Momentum de warmup |
| `box` | 0.02 | 0.2 | Peso box loss (relativo) |
| `cls` | 0.2 | 4.0 | Peso clasificación loss |
| `hsv_h` | 0.0 | 0.1 | Variación de tono |
| `hsv_s` | 0.0 | 0.9 | Variación de saturación |
| `hsv_v` | 0.0 | 0.9 | Variación de brillo |
| `degrees` | 0.0 | 45.0 | Rotación |
| `translate` | 0.0 | 0.9 | Traslación |
| `scale` | 0.0 | 0.9 | Escala |
| `shear` | 0.0 | 10.0 | Cizallamiento |
| `perspective` | 0.0 | 0.001 | Perspectiva |
| `flipud` | 0.0 | 1.0 | Probabilidad flip vertical |
| `fliplr` | 0.0 | 1.0 | Probabilidad flip horizontal |
| `mosaic` | 0.0 | 1.0 | Probabilidad mosaic |
| `mixup` | 0.0 | 1.0 | Probabilidad mixup |
| `copy_paste` | 0.0 | 1.0 | Probabilidad copy-paste |

---

## 8. GUÍA RÁPIDA POR ESCENARIO

### 🎯 Pocas clases (1-5), objetos pequeños
```
imgsz=320, box=10.0, cls=1.5, scale=0.2, mosaic=0.5, close_mosaic=25, erasing=0.2
```

### 🏭 Inspección industrial (cámara fija, iluminación controlada)
```
fliplr=0.0, flipud=0.0, degrees=0.0, hsv_h=0.005, hsv_s=0.2, hsv_v=0.15, scale=0.15
```

### 🚗 Vehículos / tráfico (muchos objetos, variación de escala)
```
imgsz=640, scale=0.5, mosaic=1.0, mixup=0.15, multi_scale=0.3, max_det=500
```

### 📱 Edge / Mobile (priorizar velocidad)
```
imgsz=256-320, batch=1, half=True, dynamic=False, simplify=True
```

### 🏥 Médico (alta precisión, pocas imágenes)
```
freeze=10, epochs=300, patience=50, lr0=0.005, cos_lr=True, augment variado
```

### 🛰️ Aéreo / satélite (objetos multidireccionales)
```
flipud=0.5, fliplr=0.5, degrees=180.0, scale=0.5, perspective=0.0005
```

---

> **Nota**: Todos los valores por defecto corresponden a la configuración oficial de Ultralytics.
> Los rangos son recomendaciones basadas en la práctica común; algunos parámetros aceptan valores fuera de estos rangos.
> Referencia oficial: https://docs.ultralytics.com/usage/cfg/
