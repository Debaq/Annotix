# Fase 4 — Acceso, reentrenamiento y portabilidad de los modelos entrenados

> Cuarta fase, pedida por el usuario después de la Fase 3: los modelos
> entrenados deben quedar **accesibles** para reentrenar encima de ellos o
> copiarlos con su framework nativo.
> Se apoya en las fases 1-3b. No se implementó código.

---

## El punto de partida es mejor de lo esperado

Dos cosas ya existen y no hay que inventarlas.

**1. El reentrenamiento sobre un modelo propio ya funciona — para dos backends.**
El campo `baseModelPath` recorre el stack completo: estado en el front
(`useTrainingRequest.ts:258`), viaje en la petición
(`training/mod.rs:131-132` y `469-470`), y consumo en el generador de script
(`scripts.rs:416-422` para YOLO, `scripts.rs:474` para RT-DETR). La UI lo ofrece
desde una tarjeta de trabajo terminado: toma `job.bestModelPath`, arma una
etiqueta legible con modelo y fecha, y cambia el backend
(`TrainingPanel.tsx:384-391`). Hay incluso un `resume` de verdad para YOLO/RT-DETR,
que reanuda desde `last.pt` conservando el estado del optimizador
(`runner.rs:342-381`, `scripts.rs:271-364`).

Pero en la línea 385 de `TrainingPanel.tsx` hay una guarda explícita:

```ts
// Solo soportado para YOLO y RT-DETR
if (jobBackend !== 'yolo' && jobBackend !== 'rt_detr') return;
```

Los otros **15 backends ignoran `base_model_path`**: el campo llega al
generador y ningún otro lo lee.

**2. Cada backend ya guarda un artefacto nativo en disco.** Nada de esto hay que
construirlo, solo exponerlo:

| Backend | Artefacto que ya escribe | Línea |
|---|---|---|
| `yolo`, `rt_detr` | `best.pt` / `last.pt` de ultralytics | `scripts.rs:315` + runs de ultralytics |
| `hf_detection`, `hf_instance`, `hf_segmentation`, `hf_classification` | directorio `best/` y `last/` con `save_pretrained()` del modelo **y del processor** | `scripts.rs:961-964`, `1136-1139`, `2192`, `2725` |
| `hf_pose` | `best.pth` / `last.pth` (`state_dict`). **No es un modelo de HuggingFace** pese al nombre: es un backbone de timm con una cabeza de heatmaps propia (`scripts.rs:1272`), así que va con `smp` y `timm`, no con los de `from_pretrained` | `scripts.rs:1345-1358` |
| `smp` | `best.pth` / `last.pth` (`state_dict`) + ONNX | `scripts.rs:1918-1934` |
| `timm` | `best.pth` / `last.pth` (`state_dict`) + ONNX | `scripts.rs:2453-2469` |
| `tsai` | `learner.pkl` (export de fastai) + `state_dict` | `scripts.rs:2877-2878` |
| `pytorch_forecasting` | checkpoint de Lightning + ONNX | `scripts.rs:1345-1358` |
| `pyod`, `tslearn`, `pypots` | pickle del estimador | `scripts.rs:3278`, `3424` |
| `sklearn` | `joblib.dump(pipeline)` — pipeline completo, no solo el estimador | `scripts.rs:4107` |
| `rf_detr` | checkpoint propio de rfdetr | runs de rfdetr |

El artefacto está ahí, con el formato correcto de cada framework. Lo que falta es
**el camino desde la app hasta él**: hoy la UI ofrece exportar a otro formato y
descargar *lo exportado* (`TrainingModelExport.tsx:28-53`), y la exportación real
solo cubre ultralytics más un ONNX de rescate
(`model_export.rs:17-42`). El `best.pth`, el directorio `save_pretrained` y el
`.joblib` no se pueden copiar desde la interfaz.

---

## 1. Registro de modelos del proyecto

Una entidad nueva en `project.json`: `trained_models`, paralela a la
`inference_models` que ya existe (`store/project_file.rs:441-465`). La diferencia
entre las dos es el origen — `inference_models` son modelos **que el usuario
sube**; `trained_models` son los **que el proyecto produjo** — y conviene que no
se confundan, aunque un modelo entrenado deba poder registrarse como modelo de
inferencia con un click.

Cada entrada guarda:

| Campo | Para qué |
|---|---|
| `id`, `name`, `jobId` | Identidad y vuelta al trabajo que lo produjo |
| `backend`, `modelId`, `task` | Con qué se entrenó; determina cómo se recarga |
| `artifacts: [{ kind, path, framework, sizeBytes }]` | Cada archivo real en disco: `weights_native`, `weights_state_dict`, `hf_dir`, `onnx`, `joblib`, `learner_pkl`… |
| `parentModelId` | **Linaje**: de qué modelo del registro salió este, si salió de uno |
| `classNames`, `classCount` | Para detectar deriva de clases al reentrenar |
| `splitFingerprint` | Huella del reparto usado (unidad de agrupación + semilla + ids por partición). Es la pieza que evita la contaminación descrita en §4 |
| `contractPath`, `evidenceLevel` | Contrato de modelo (Fase 3 §6) y su nivel de evidencia |
| `baseWeightsOrigin`, `license` | De dónde salieron los pesos iniciales y bajo qué licencia. Se hereda hacia abajo |
| `metricsRef` | Métricas, sin duplicarlas: apuntan al `TrainingJobEntry` |

El registro es lo que convierte "un archivo en una carpeta de trabajo" en algo
con nombre, historia y linaje — y es también lo que permite que el contrato de un
modelo hijo declare de qué padre viene sin que el usuario lo escriba.

---

## 2. Los tres accesos

### 2.1 Reentrenar encima

Tres operaciones distintas que hoy se confunden bajo una palabra:

| Operación | Qué hace | Cuándo sirve | Estado |
|---|---|---|---|
| **Reanudar** (`resume`) | Sigue el *mismo* entrenamiento: mismo dataset, mismo split, estado del optimizador intacto | Se cortó la luz, se cerró la app | Real en YOLO/RT-DETR (`runner.rs:342`); ausente en los otros 15 |
| **Continuar ajuste** (fine-tune) | Entrenamiento **nuevo** partiendo de los pesos del modelo anterior, con optimizador reiniciado. Puede cambiar dataset, clases y preset | Llegaron 200 imágenes nuevas; se quiere especializar en un sitio o equipo | Existe en YOLO/RT-DETR vía `baseModelPath`; ausente en los otros 15 |
| **Reinicializar** | Ignora el modelo previo y parte de los pesos base del catálogo | Cambió el problema | Es el comportamiento actual por defecto |

Lo que falta es que `base_model_path` se respete en los 15 backends restantes.
Por familia, el cambio es distinto y en un caso es casi gratis:

- **Backends HuggingFace (4): prácticamente resuelto.** Los scripts ya llaman
  `AutoModelFor*.from_pretrained("{model_id}")` con un id del Hub
  (`scripts.rs:846`, `888`, `1023`, `1095`) y ya guardan con `save_pretrained()`.
  `from_pretrained` acepta un **directorio local** con la misma firma: basta pasar
  la ruta del `best/` anterior en lugar del id. Es el caso más barato de todo el
  documento y el que más usuarios de HF va a servir. Cuidado con el
  `processor`: hay que recargar el del padre, no el del id del Hub, o el
  preprocesamiento deja de coincidir con los pesos.
- **`smp`, `timm`, `hf_pose` (3): resuelto.** Se crea el modelo como antes y, si
  hay modelo base, se carga el `state_dict` antes de mover a device. La cabeza se
  maneja con `strict=False` y se informa qué no encajó.
- **`rf_detr` (1)**: el constructor de `rfdetr` acepta pesos de partida; hoy solo
  se le pasan `resolution` y `gradient_checkpointing` (`scripts.rs:670-673`).
- **`tsai` (1): resuelto.** Los pesos entran por `learner.model`, que es el
  módulo de torch que el propio script guarda al terminar.
- **`pytorch_forecasting` (1): resuelto.** El checkpoint de Lightning guarda los
  pesos bajo `state_dict` y el cargador lo desenvuelve. `from_dataset` arma el
  modelo según las covariables, así que un proyecto que cambió de forma produce
  carga parcial informada en vez de un fallo mudo.
- **`pyod`, `tslearn`, `pypots`, `stumpy`, `sklearn` (5)**: aquí hay que ser
  honesto — "reentrenar encima" mayormente **no existe** en estos estimadores.
  Un k-means de `tslearn` se reajusta desde cero, `stumpy` no entrena nada. Lo que
  sí aplica es `warm_start` donde el estimador lo soporta (varios de sklearn) y,
  en el resto, ofrecer copiar y reutilizar en vez de prometer un reentrenamiento
  que el framework no hace. Un botón que dice "continuar ajuste" y por debajo
  reentrena desde cero es peor que no tenerlo.

Y quitar la guarda de `TrainingPanel.tsx:385`, que es lo que hoy oculta la
opción incluso cuando el backend podría soportarla.

### 2.2 Copiar con su framework nativo

Una acción de copia sobre **cada artefacto del registro**, no solo sobre lo
exportado. El artefacto nativo es lo único que permite abrir el modelo fuera de
Annotix con el framework que lo produjo, y hoy es justamente lo que no se puede
sacar por la UI.

Lo que se copia, según el caso:

| Artefacto | Qué se entrega | Cómo se recarga fuera |
|---|---|---|
| Directorio HF (`best/`) | El directorio completo, **modelo + processor** | `AutoModelFor*.from_pretrained("./best")` |
| `best.pt` de ultralytics | El archivo | `YOLO("best.pt")` |
| `best.pth` (`state_dict`) de `smp`/`timm` | El archivo **más la receta de construcción** (arch, encoder, nº de clases, `encoder_depth`) | `smp.create_model(...)` / `timm.create_model(...)` y luego `load_state_dict` |
| `learner.pkl` | El archivo | `load_learner()` de fastai |
| `.joblib` | El archivo (es el pipeline completo, incluido el preprocesamiento) | `joblib.load()` |
| ONNX | El archivo | Cualquier runtime ONNX |

El detalle que decide si esto sirve o no: **un `state_dict` sin la receta es
inútil**. `torch.load` devuelve un diccionario de tensores y no dice qué
arquitectura los aceptaba. Por eso la copia debe llevar al lado un pequeño
`load_me.md` o `model_config.json` generado con los parámetros exactos de
construcción y el fragmento de código de recarga. Es barato de generar —esos
valores ya están en `TrainingJobEntry.config`— y es la diferencia entre entregar
un modelo y entregar un archivo binario.

Y la copia debe arrastrar el **contrato de modelo** (Fase 3 §6) junto al
artefacto. Un modelo que sale del sistema sin su contrato pierde exactamente lo
que las cuatro fases construyeron.

### 2.3 Usarlo dentro de la app

Un modelo entrenado debe poder registrarse como modelo de inferencia del proyecto
con un click, en vez de exportarlo y volverlo a subir a mano. El camino existe
(`upload_inference_model`, `store/inference.rs:59`) y el `InferenceModelEntry`
pide `task`, `class_names`, `input_size`, `output_format` y `model_hash`
(`project_file.rs:441-465`) — datos que el registro de modelos ya tiene, así que
el mapeo de clases se puede rellenar solo en lugar de hacérselo declarar al
usuario.

Cierra el círculo que las fases anteriores dejaron abierto: entrenar →
pre-anotar con el propio modelo → revisar (con la procedencia de la etapa 4
registrando que la sugerencia fue del modelo X) → reentrenar encima. Con una
advertencia que no es menor y se trata en §4.

---

## 3. Linaje y contrato heredado

Cuando un modelo nace de otro, el contrato del hijo debe heredar lo que no puede
recalcular:

- **Licencia y procedencia de los pesos.** Si el padre partió de HuBERT-ECG
  (CC BY-NC 4.0, Fase 3b) o de un backbone con términos de acceso, el hijo
  arrastra la condición. Esto se propaga por la cadena `parentModelId` y debe
  aparecer en el contrato del hijo, no solo del padre.
- **La población acumulada.** El hijo se entrenó con su dataset *más* todo lo que
  el padre vio. Declarar solo el dataset del hijo describe mal el modelo: la
  cadena de sujetos es la unión, y es lo que un revisor necesita saber.
- **La cadena completa**, legible: "ECG-FM → ajuste sobre 1 240 registros de 310
  sujetos (sitio A) → ajuste sobre 180 registros de 45 sujetos (sitio B)".

---

## 4. El riesgo que este acceso introduce

Tres contaminaciones que aparecen justamente porque se puede reentrenar encima.
Van documentadas porque son fáciles de no ver y caras de descubrir después.

**4.1 El test del hijo contaminado por el train del padre.** Si el hijo se
entrena sobre el mismo proyecto con un split nuevo, imágenes que el padre vio en
train pueden caer en el test del hijo. El modelo ya las conoce, y la métrica del
hijo es ficción. No lo arregla el agrupamiento por sujeto de la etapa 1 —es
transitivo, viene del modelo, no del dato—. La solución es el
`splitFingerprint` del registro: al continuar el ajuste, **se hereda el reparto
del padre por defecto**. Si el usuario lo cambia, se entrena igual (nada bloquea)
y el contrato lo dice: *"el conjunto de test contiene N muestras que el modelo
padre vio durante su entrenamiento"*.

**4.2 Realimentación del propio modelo.** Pre-anotar con el modelo del proyecto,
aceptar sus sugerencias y reentrenar encima es un bucle que amplifica los
sesgos del modelo y estrecha la variabilidad del corpus. No es una razón para
prohibirlo —es un flujo legítimo y útil—, sino para medirlo: la procedencia de la
etapa 4 ya permite calcular qué fracción del corpus fue sugerida por el modelo y
aceptada sin cambios, y el contrato debe reportarlo. Un modelo entrenado sobre un
corpus 80 % autogenerado es una cosa distinta de uno entrenado sobre 80 %
trazado a mano, y hoy no hay forma de distinguirlos.

**4.3 Deriva de clases.** Si el proyecto agregó o renombró clases entre padre e
hijo, los índices se desplazan y la cabeza cargada deja de corresponder. Por eso
`classNames` va en el registro: comparar la lista del padre con la del proyecto
actual y avisar de la diferencia, cargando con `strict=False` a conciencia en
lugar de reventar con un error de tamaño de tensor que no le dice nada a nadie.

---

## 5. Orden de implementación

1. **Registro `trained_models`** con artefactos, linaje, `splitFingerprint` y
   licencia heredada. Es la base de todo lo demás.
2. **Copiar artefacto nativo** desde la UI, con su receta de recarga y su
   contrato al lado. Cierra la mitad del pedido y no depende de ningún backend.
3. ~~**Quitar la guarda de `TrainingPanel.tsx:385`** y aceptar `base_model_path`
   en los **4 backends HuggingFace**~~ — **hecho**. La capacidad la declara el
   catálogo (`supportsFineTune` en `training/backends.rs`) en vez de una lista
   quemada en la UI, y un test comprueba que lo declarado coincide con lo que el
   generador de script usa de verdad: un botón que no hace nada es justo el
   defecto que esto venía a cerrar.
4. ~~**`smp`, `timm`, `hf_pose`, `tsai`, `pytorch_forecasting`**: carga de
   `state_dict`/checkpoint con manejo explícito del cambio de cabeza~~ —
   **hecho**. Se carga con `strict=False` y se informa qué tensores quedaron
   reinicializados; si no se cargó ninguno el script aborta, porque un "fine-tune"
   que no heredó nada es un entrenamiento desde cero disfrazado. Partiendo de un
   modelo propio ya no se descargan los pesos del catálogo que se iban a
   sobrescribir. Y la UI restituye el modelo del trabajo padre al cambiar de
   backend: sin eso, un checkpoint de `UnetPlusPlus-resnet50` caía en el
   `Unet-resnet34` recomendado y abortaba.

   **`rf_detr` queda pendiente**: su constructor acepta pesos de partida según la
   librería, pero no se verificó contra la versión que el proyecto fija y rfdetr
   aborta con un `ValidationError` de pydantic ante un argumento que no conoce.
   Entra cuando se compruebe con un entrenamiento real.
5. **Registrar modelo entrenado como modelo de inferencia** con un click,
   rellenando el mapeo de clases desde el registro.
6. **Avisos de contaminación** (§4) en el contrato: split heredado por defecto,
   fracción de corpus autogenerado, deriva de clases.
7. **Familia de estimadores clásicos**: `warm_start` donde exista y, donde no,
   decir que no existe en lugar de simularlo.

Qué validar con datos reales, para cada paso: una cadena de **tres**
reentrenamientos sucesivos sobre el mismo proyecto, comprobando que el linaje se
mantiene completo, que el split heredado se respeta, que el contrato del nieto
declara la población acumulada y la licencia del bisabuelo, y que el artefacto
copiado se abre fuera de Annotix con el framework que lo produjo —abrirlo de
verdad en un intérprete limpio, no confiar en que el archivo existe.

---

## Estado marcado como no verificado

- Que `rfdetr` acepte pesos de partida por constructor en la versión que el
  proyecto fija: el parámetro existe en la librería, pero no se comprobó contra
  la versión instalada.
- Qué estimadores concretos de los backends `pyod`/`pypots` admiten continuar
  entrenamiento: requiere revisar cada uno, y la respuesta probablemente sea
  distinta por modelo dentro del mismo backend.
