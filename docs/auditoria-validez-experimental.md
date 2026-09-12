# Auditoría — validez experimental

Revisión del 2026-09-10. Hallazgos que afectan los números que produce el pipeline de datos y
entrenamiento. Ordenados por impacto.

---

## A1. Las imágenes sin anotar entran al entrenamiento como negativos

> **Resuelto** el 2026-09-10. Ver «Corrección aplicada» al final de esta sección.

**Dónde.** `runner.rs:66-71` toma `pf.images` completo. `dataset.rs:150` (`copy_image_and_label`)
escribe un `.txt` vacío para cada imagen sin anotaciones. No hay filtro por `status` ni por
`!annotations.is_empty()` en ninguna parte del pipeline.

**Qué implica.** En YOLO, una imagen con archivo de etiquetas vacío es una imagen de fondo, un
negativo puro. Ultralytics recomienda alrededor de un 10 % de negativos; un proyecto con 200 de
1000 imágenes anotadas entrena con un 80 % de negativos, lo que empuja al modelo a no detectar
nada. El conjunto de validación también se llena de imágenes sin verdad de referencia, lo que
distorsiona el mAP.

**Discrepancia con la interfaz.** `count_annotated_images` (`training_commands.rs:436`) filtra
`video_id.is_none() && !annotations.is_empty()`, y ese número alimenta `DatasetSplitVisualizer`.
La interfaz anuncia una partición sobre las imágenes anotadas y el backend entrena sobre todas.

**Corrección aplicada.**

`dataset::select_trainable_images(images, classes)` centraliza el criterio: descarta anotaciones
huérfanas y luego las imágenes que quedan sin ninguna. Se aplica en las cuatro rutas que arman un
dataset, que antes filtraban solo las huérfanas:

| Ruta | Archivo |
|---|---|
| Entrenamiento local YOLO | `runner.rs::start_training` |
| Entrenamiento local multi-backend | `runner.rs::start_training_v2` |
| Entrenamiento en la nube | `training_commands.rs::start_training_v2` |
| Paquete descargable | `training_commands.rs::generate_training_package` |

Si tras el filtro no queda ninguna imagen, el trabajo se marca `failed` y devuelve un mensaje que
dice cuántas imágenes tenía el proyecto y que ninguna está anotada. Cada arranque registra en el
log cuántas de cuántas entraron al dataset.

`count_annotated_images` pasa a aplicar el mismo criterio, para que el visualizador de partición
muestre el reparto real. Antes excluía además los fotogramas de video, que tras el bake son
imágenes anotadas y sí se entrenan.

`backend_uses_images` distingue los backends que trabajan sobre imágenes de los de series
temporales y tabular, que leen su propio CSV. De paso corrige que un proyecto de series temporales
exigiera imágenes para arrancar.

Cubierto por cinco pruebas en `tests.rs`: descarte de no anotadas, descarte de huérfanas antes de
evaluar si la imagen queda vacía, conservación de fotogramas de video anotados, caso de proyecto
sin nada anotado, y la clasificación de backends por uso de imágenes.

Esto resuelve también **A4**: al no llegar imágenes sin clase, la carpeta `unknown` deja de
crearse.

---

## A2. No hay partición por grupo: fuga de datos en proyectos de video

**Dónde.** `ImageEntry` guarda `video_id` y `frame_index` (`project_file.rs:99-102`), pero
`prepare_dataset` (`dataset.rs:59-66`) baraja y corta por imagen individual.

**Qué implica.** Fotogramas consecutivos del mismo video son casi idénticos. Al repartirlos entre
entrenamiento y validación, el modelo valida sobre imágenes que prácticamente vio entrenando, y
las métricas quedan infladas de forma sistemática. Es la fuga de datos clásica en visión por
computador con video.

**Corrección.** Agrupar por `video_id` al particionar, de modo que todos los fotogramas de un
video caigan del mismo lado. El dato necesario ya está registrado. Para datos clínicos convendría
además permitir agrupar por sujeto.

---

## A3. El entrenamiento OBB pierde la rotación

**Dónde.** `dataset.rs:274-292`: para `task == "obb"` convierte la caja orientada a su caja
alineada al eje con `obb_to_aabbox` y emite 5 campos (`class cx cy w h`).

**Qué implica.** YOLO-OBB y MMRotate esperan 9 campos (los cuatro vértices, formato DOTA).
`scripts.rs:426` sí carga el modelo con sufijo `-obb`, y `dataset.rs:729-731` rutea tanto YOLO
como MMRotate a la misma función. Ambos caminos de detección orientada reciben etiquetas sin
ángulo, y la caja alineada al eje de una caja rotada es además mayor que la original.

**Corrección.** Emitir los cuatro vértices normalizados para la tarea `obb`. El mismo cambio
aplica al camino de MMRotate, que además espera el campo de dificultad del formato DOTA.

---

## A4. En clasificación, las imágenes sin anotar crean una clase espuria

> **Resuelto** el 2026-09-10 como efecto de la corrección de A1: el filtro deja fuera las imágenes
> sin clase antes de llegar aquí. El respaldo `unknown` sigue en el código como red de seguridad.

**Dónde.** `dataset.rs:188-195` (`copy_classification_image`) manda toda imagen sin anotación a la
carpeta `unknown`.

**Qué implica.** En el diseño ImageFolder cada carpeta es una clase, así que el entrenamiento
ocurre con N+1 clases y un `nc` que no coincide con el del proyecto.

**Corrección.** Excluir las imágenes sin clase asignada, o exigir que estén clasificadas antes de
permitir el entrenamiento.

---

## A5. La inferencia no usa letterbox

**Dónde.** `preprocess_image` (`ort_runner.rs:302`) llama a `fast_resize_to_rgb8`
(`ort_runner.rs:56`), que redimensiona directo a `size × size`. No hay ninguna ocurrencia de
letterbox ni de relleno en el módulo de inferencia.

**Qué implica.** Ultralytics entrena e infiere con letterbox: escala preservando la relación de
aspecto y rellena con gris. Al inferir con la imagen deformada, el modelo recibe una entrada con
distinta distribución a la del entrenamiento, y la precisión cae, sobre todo en imágenes no
cuadradas. Las coordenadas se desnormalizan de forma coherente con el redimensionado, así que las
cajas caen donde corresponde; lo que se degrada es la calidad de la predicción.

**Corrección.** Implementar letterbox con relleno 114 y deshacer la escala y el desplazamiento al
convertir las coordenadas de vuelta.

---

## Detalle relacionado: coordenadas fuera de rango

`normalize_coordinates` (`converters.rs:2-4`) divide por el tamaño de la imagen sin recortar a
`[0, 1]`. Una anotación que sobresale del borde genera etiquetas fuera de rango, que ultralytics
descarta con una advertencia. El caso de polígono sí recorta (`dataset.rs:300`); el de caja no.
