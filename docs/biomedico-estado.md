# Estado del plan biomédico

> **Este es el documento que hay que leer primero para continuar.** Los otros
> cinco (`biomedico-fase1` … `fase4`) son el plan; éste dice qué está hecho, qué
> falta, y qué decisiones ya se tomaron para no volver a discutirlas.
>
> Última actualización: 2026-09-14, sobre `d0d3604` (etapa 11b terminada).

---

## Punto de retomada

**La 11b está hecha.** Lo siguiente es la **etapa 12 (cifrado en reposo)**, y
después los huecos de 1-11.

### Lo que hay que decidir antes de empezar la 12

Sigue en pie, y ahora con un dato más: la augmentación escribe un dataset
preparado que normalmente es **varias veces el corpus**, y lo escribe en el
directorio del trabajo de entrenamiento. Si el cifrado cubre sólo `project.json`
e `images/`, ese dataset queda en claro al lado, con las mismas imágenes dentro
—y ahora también con sus variantes—. O se cubre, o se dice explícitamente que no
se cubre.

(Las imágenes generadas ya no se guardan dos veces: viven en un temporal que
muere al terminar la preparación, y lo que queda es lo que el preparador copió a
`images/train` más el manifiesto.)

### Lo que quedó fuera de la 11b

En `docs/plan-augmentacion.md` §Lo que queda fuera. En corto: la perspectiva
(es una homografía y la geometría sólo sabe de afines), RF-DETR (su `train()`
valida con pydantic y no acepta parámetros nuevos), recomponer la inferencia por
teselas, y que el **contrato de modelo transcriba el plan** — el informe del
reparto ya lo lleva, el contrato todavía no.

### Documentos de esta tanda

- `docs/auditoria-etapas-1-11.md` — qué **no** está, leído del código y no del
  roadmap. Origen de la 11b.
- `docs/plan-augmentacion.md` — el plan de la 11b, con lo hecho y lo que queda
  fuera al final.

---

## Resumen

| Etapa (Fase 2) | Estado | Commits |
|---|---|---|
| 1 · Split agrupado por unidad natural | **hecho** | `f61c7e5` |
| 2 · `subjectId` de primer nivel | **hecho** | `7cc466a`, `958359e` |
| 3 · Política de partición + informe | **hecho** | `2558bb9`, `7a98ab8` |
| 4 · Procedencia por etiqueta | **hecho** | `26261c2`, `f1b95eb`, `7b5d021` |
| 5 · Auditoría encadenada | **hecho** | `93722b3` |
| 6 · Lectura múltiple cegada | **hecho**, sin probar con gente real | (esta tanda) |
| 7 · Acuerdo + adjudicación | **hecho** | (esta tanda) |
| 8 · Contrato de modelo | **hecho** | (esta tanda) |
| 9a · Ingesta DICOM / NIfTI 2D | **hecho** | (esta tanda) |
| 9b · Whole-slide imaging | pendiente | — |
| 9c · Volumetría 3D | pendiente, **fuera de alcance** hasta tener demanda | — |
| 10a · MedSAM / μSAM | **hecho** para MedSAM, ejecutado contra los pesos reales; μSAM bloqueado (no hay ONNX) | (esta tanda) |
| 10b · Pesos biomédicos | **empezado**: 5 modelos | `135553f` |
| 10c · nnU-Net, MONAI, Cellpose, StarDist | pendiente | — |
| 11 · Selector de dominio + presets | **hecho** con los backends que existen | `beebdc5`, `fb43624`, (esta tanda) |
| 11b · Augmentación unificada + teselado | **hecho** | `72b9e5f` … `d0d3604` |
| 12 · Cifrado en reposo, opcional | pendiente (etapa nueva, no estaba en el plan) | — |

Fuera del plan original, pedido sobre la marcha:

| Trabajo | Commits |
|---|---|
| Continuar el ajuste desde un modelo propio (11 de 17 backends) | `253d2ba`, `2121709` |
| Catálogo de familias con información para decidir | `beebdc5` |
| Una sola verdad: Configuración lee el catálogo de Rust | `fb43624` |

---

## Lo que quedó abierto, por si parece hecho y no lo está

**Etapa 3.** El `testSplit` por defecto del formulario sigue en 0
(`presets.ts → getDefaultConfig`). Ya no es el hueco que era: el proyecto declara
su propia fracción recomendada en `splitPolicy` y la pantalla de entrenamiento
avisa cuando la corrida no la usa. Falta que el dominio biomédico (etapa 11)
rellene esa recomendación solo, en vez de que la ponga el usuario a mano.

**Etapa 4.** Cerrada. El rechazo se guarda en `ImageEntry.rejected` —sin
geometría— y la barra de anotaciones tiene la ficha de procedencia de una
etiqueta. Queda fuera, y a propósito: `review: "rejected"` no se escribe sobre
una etiqueta viva, porque una etiqueta rechazada deja de estar en el corpus.

Lo que sigue sin cubrir: el par que borra una etiqueta en una sesión P2P deja
constancia en **su** proyecto y en el del que recibe el cambio, pero el resto de
los pares no se entera hasta que les llega esa imagen. Deshacer eso de verdad es
la etapa 6, que reescribe cómo viajan las anotaciones.

**Etapa 6.** El código está: capas por evaluador, locks por (imagen, evaluador),
reparto replicado, sincronización sin colapso y cegado. Lo que **no** está es la
prueba con tres anotadores en tres máquinas; lo verificado son funciones puras con
tests de unidad, que es otra cosa. Ver `docs/lectura-multiple.md` §Qué falta.

El cegado es de la aplicación, no del sustrato: el documento replicado sigue
llevando todas las capas y quien lo inspeccione a mano puede leerlas. Cegarlo de
verdad exigiría cifrar cada capa con una clave que sólo tenga quien adjudica.

**Etapa 7.** Los estadísticos están probados contra valores publicados (κ de
Fleiss = 0.2099 del ejemplo canónico, κ de Cohen = 0.4 de la tabla 2×2), no contra
una salida de R sobre datos propios — que es lo que pide el roadmap y sigue
pendiente. Quedan fuera: el Dice real sobre píxeles de máscara (hoy se compara por
la envolvente) y el acuerdo por clase (el informe da un global, y una clase rara
con acuerdo pésimo puede esconderse detrás). Ver `docs/acuerdo-evaluadores.md`.

**Etapa 8.** El contrato sale solo y declara su nivel de evidencia y sus
limitaciones. Lo que **no** lleva son intervalos de confianza en las métricas:
calcularlos exige los resultados por muestra del conjunto de test y los backends
informan sólo el agregado. El contrato lo dice en vez de omitirlo. La maquinaria
de bootstrap agrupado ya existe (`agreement::kappa::ic_bootstrap`); falta el dato
por muestra. Tampoco está incrustado todavía en el informe PDF. Ver
`docs/contrato-de-modelo.md`.

**Etapa 9a.** Hecha, con tres cosas fuera a propósito: las series multi-frame se
leen sólo en su primer fotograma, los UID se eliminan en vez de reescribirse con
un mapa consistente, y no se inspeccionan los píxeles —un nombre quemado en la
imagen sigue ahí—. Los tests usan DICOM sintéticos construidos en la propia
prueba; **falta validar con series reales de dos fabricantes distintos y verificar
la deidentificación con una herramienta externa**. Ver `docs/ingesta-medica.md`.

**Etapa 11.** Hecha con **los backends que existen de verdad**: seis presets
biomédicos sobre `smp`, `yolo`, `timm` y `hf_classification`, con un test que
comprueba contra el catálogo real que su backend y su modelo existen. Los de la
tabla de la Fase 3 que dependen de backends nuevos —nnU-Net, TotalSegmentator,
MONAI, StarDist, Cellpose— **no están**, y no se ofrecen: un preset que no se
puede lanzar es peor que ninguno, porque se descubre al final.

Lo que aporta de verdad no son los hiperparámetros sino dos cosas:

1. **Augmentaciones por modalidad.** Sin volteo ni giros grandes donde la
   orientación anatómica es información; con volteos y giros libres en
   microscopía e histología, donde el campo es arbitrario. Hay tests que fallan
   si alguien mete volteo horizontal en una modalidad lateralizada o mixup en
   cualquiera.
2. **La previsión antes de entrenar** (`contract/readiness.rs`): qué nivel de
   evidencia saldría si se lanzara ahora y qué falta para el siguiente. El
   contrato se emite después, cuando ya no se puede hacer nada; esto avisa
   cuando todavía sirve. Un test ata la previsión al contrato: si dieran niveles
   distintos, el aviso previo mentiría.

El aviso de **lateralidad** es de corrección, no de evidencia: un corpus de
radiografías con volteo horizontal no está peor documentado, está mal entrenado.
Se detecta solo, desde la modalidad que trajo el DICOM.

**Etapa 10b.** Quedan fuera los modelos que no se pueden descargar sin token:
UNI (gated, CC-BY-NC-ND), RETFound (gated, `.pth` suelto sin metadatos de
librería) y hibou (gated y con `trust_remote_code`, que el generador no pasa).
Entran cuando haya soporte de token del Hub.

**Etapa 11b.** Hecha. La augmentación se materializa al preparar el dataset
—fuera del bucle de entrenamiento— y por eso vale para los diecisiete backends a
la vez, se puede abrir y mirar, y sale igual con la misma semilla. El orden es
parte del diseño: seleccionar clases → repartir → **sólo train** teselar y
aumentar; `materializar()` ni siquiera recibe val y test.

Lo que arregla el defecto que la motivó son los tres generadores que augmentaban
por su cuenta, y sólo uno de los tres estaba a la vista:

- `smp` tenía `HorizontalFlip(p=0.5)` fijo en el script.
- `rt_detr` no pasaba **ningún** parámetro, así que ultralytics aplicaba los
  suyos por defecto —`fliplr: 0.5` entre ellos—. El generador no dice nada, y
  nadie mira lo que un script no dice.
- `timm` voltea dentro de `create_transform(is_training=True)`: tampoco había una
  línea culpable en el script generado.

Queda fuera, a propósito, lo que está en `docs/plan-augmentacion.md` §Lo que
queda fuera. El hueco que más pesa: **el contrato de modelo todavía no
transcribe el plan** ni baja el nivel de evidencia cuando una clase con dos
ejemplos se multiplica por veinte. El informe del reparto ya lleva el bloque y
los avisos; falta el último salto.

**Traducciones.** Todo lo nuevo está en `es` y `en`. Los otros ocho locales caen
a inglés por `fallbackLng`. La auditoría las contó: **4104 claves**, no ~200, y
cinco archivos de namespace (`subjects`, `agreement`, `contract`, `medical`,
`sam`) que no existen en ninguno de los ocho.

**Verificación en la app real.** Nada de la UI de esta tanda se vio corriendo
dentro de Annotix: los componentes se verificaron en el dev server con datos
simulados. La app corre bajo Wayland y no se puede manejar su ventana desde la
sesión de trabajo. **Qué mirar al abrirla**:

- Configuración → Modelos de entrenamiento: el contador debe decir **132**, no
  196, y el visor de script debe mostrar código real en los 17 backends.
- Galería → botón «Gestionar sujetos»: debe abrir «Estado del corpus» con
  sujetos y procedencia.
- Lista de entrenamientos: el botón del informe de reparto, con el número de
  avisos encima cuando los hay, y debajo la semilla del reparto.
- Entrenamiento → «Política de partición», debajo del visor del reparto: cambiar
  la unidad o la semilla y comprobar que el informe del entrenamiento siguiente
  las transcribe.
- Barra de anotaciones: el botón de información de cada tarjeta abre la ficha de
  procedencia. Borrar una caja aceptada de un modelo y comprobar que «Estado del
  corpus» cuenta el rechazo.
- Estado del corpus → «Registro de auditoría»: verificar y ver la cadena íntegra
  con los últimos eventos.
- Compartir por P2P con «Lecturas por muestra» en 2: que aparezca el contador de
  lecturas en la barra de anotaciones y que el botón de entregar funcione.
- Estado del corpus → «Acuerdo entre evaluadores»: con dos lecturas entregadas,
  que salga el número con su intervalo y la cola de discrepancias ordenada.
- Estado del corpus → «Protocolo del estudio»: rellenar inclusión y uso previsto.
- Entrenamiento → «Dominio del proyecto» en biomédico: que aparezcan los presets
  de la tarea del proyecto y que aplicar uno cambie backend, modelo, reparto y
  augmentaciones.
- Entrenamiento → «Si entrenas ahora, el contrato saldrá»: que el nivel cambie al
  poner test, y que con un corpus de radiografías y volteo horizontal salga el
  aviso rojo de corrección.
- Galería → «Importar DICOM / NIfTI»: que al terminar salga el informe de
  deidentificación, y que el sujeto de las imágenes quede como `SUJ-…`.
- Imagen médica abierta: el control de ventana arriba a la derecha, con los
  presets. Cambiar a ventana de hueso y comprobar que la imagen cambia.
- Lista de entrenamientos → informe de reparto de una corrida terminada: debajo
  aparece el contrato con su nivel de evidencia y sus limitaciones; «Emitir
  contrato» escribe `model_contract.json` junto al modelo.
- Entrenamiento → «Augmentación»: encenderla, marcar un par de
  transformaciones y pulsar «Ver una variante» — la imagen tiene que salir con
  sus anotaciones encima y en su sitio. Con un corpus de radiografías, el volteo
  horizontal tiene que salir en rojo; con una modalidad monocroma, el tono y la
  saturación tienen que salir deshabilitados.
- Entrenar con la augmentación encendida y comprobar en el directorio del
  trabajo: `images/train` trae las variantes (`…__aug1.png`), `images/val` no
  trae ninguna, y `augmentation_manifest.json` dice de qué imagen salió cada una.

---

## Decisiones tomadas (no volver a discutirlas sin motivo nuevo)

1. **Las mejoras son opcionales, no bloqueantes.** Nada impide entrenar. Lo que
   baja cuando falta algo es el nivel de evidencia que declara el contrato de
   modelo. Ver `biomedico-fase3-presets.md` §1.
2. **Biomédico primero, generalista después** — en orden, defaults y redacción;
   lo generalista no se esconde ni se retira.
3. **Una sola verdad.** El dato vive en Rust y el front lo pide. Si algo tiene
   que existir en los dos lados, va con un test que falle cuando divergen.
4. **La migración no adivina procedencia.** Lo que era `source: "user"` quedó
   `unknown`, no `manual`: ese valor mezclaba lo trazado a mano con lo aceptado
   de un modelo.
5. **El sujeto lo seudonimiza quien lo carga.** El campo se exporta y viaja con
   el proyecto; el sistema no transforma nada porque no sabe qué vínculo necesita
   conservar el estudio.
6. **La semilla del reparto viaja como texto.** Es un entero de 64 bits y la
   derivada del id del proyecto pasa de 2^53: como número, `JSON.parse` la
   redondea y el informe enseñaría para reproducir el reparto una semilla que no
   es la que se usó. No se acorta la semilla para que quepa: eso cambiaría el
   reparto de todos los proyectos existentes.
7. **Lo que se publica al P2P es lo que quedó escrito.** El payload del cliente
   no trae los campos de procedencia y el par que lo recibe escribe lo que le
   llega: publicar el payload borraba origen, modelo y revisión en el otro lado.
   El receptor fusiona con la misma regla del guardado local, no reemplaza.
8. **La etapa 9 no bloquea todo lo biomédico.** Teselas de histopatología, fondo
   de ojo y radiografías en PNG son imágenes 2D normales. Sólo la volumetría y la
   lámina completa dependen de ella. (Corrección al roadmap original.)

---

## Formato de datos

`project.json` va por la **versión 11**. Migraciones en `store/io.rs`:

| | Cambio | Migración |
|---|---|---|
| v3 → v4 | `subjectId` opcional en imagen, video, serie y tabular | sólo sube la versión: `serde(default)` lee lo viejo |
| v4 → v5 | procedencia por etiqueta | rellena `origin` desde `source` sólo donde no hay ambigüedad |
| v5 → v6 | `splitPolicy` opcional en el proyecto | sólo sube la versión: declarar la política es decisión del usuario, y rellenarla sería declarar por él |
| v6 → v7 | capas de lectura por evaluador (`readings`) | sólo sube la versión: la única lectura de un proyecto viejo ya es la capa consolidada, y ponerle un autor sería inventarlo |
| v7 → v8 | protocolo de estudio (`studyProtocol`) | sólo sube la versión: un criterio de inclusión no se deduce del corpus, así que no se rellena — el contrato nota la ausencia y la declara |
| v8 → v9 | metadatos de imagen médica (`medical`) | sólo sube la versión: lo que se perdió al convertir un DICOM a PNG a mano no se puede deducir del PNG |
| v9 → v10 | dominio del proyecto (`domain`) | sólo sube la versión: ausente significa `general`, y marcar biomédico un proyecto por su contenido sería decidir por el usuario |
| v10 → v11 | plan de augmentación (`augmentation`) | sólo sube la versión: ausente significa que no se aumenta, y encenderla sola multiplicaría el dataset de alguien sin que lo hubiera pedido |

---

## Lo siguiente, si hay que elegir

La **cadena de validez está cerrada**: de la etapa 1 a la 8, un modelo entrenado
aquí sale con su contrato y su nivel de evidencia. Lo que queda son dos caminos
independientes.

La **etapa 11b** (augmentación unificada y teselado) está hecha: era la única de
la lista que arreglaba algo que hacía que la app mintiera, y trajo además el
teselado por filas × columnas con solape, que es lo que permite entrenar sobre
imágenes de alta resolución sin destruir al redimensionar lo que hay que
detectar.

La **etapa 12** (cifrado en reposo, opcional por proyecto) es la que decidiste
meter y no estaba en el plan. Es la que hace falta antes de que un corpus clínico
real entre en la app: hoy el proyecto está en claro en disco. Lleva su propio
punto de no retorno —una frase de paso perdida es un proyecto perdido— y una
advertencia sobre lo que no promete: cifrar en reposo no es cumplimiento
normativo.

La **etapa 9b** (whole-slide imaging) desbloquea histopatología de lámina
completa. Es cara y bastante autónoma: lectura piramidal, navegación por teselas
y entrenamiento por teselas agrupando por lámina —que el reparto de la etapa 1 ya
sabría respetar—.

La **etapa 10c** (nnU-Net, MONAI, Cellpose, StarDist) es cara y hay que hacerla de
a uno: rige la regla dura del repo — ninguno se publica sin smoke test de
entrenamiento real en CPU (`docs/roadmap_train.md`).

---

## Etapa 10a: qué se hizo y qué quedó fuera

**MedSAM entra y funciona.** No es una suposición: el smoke test lo ejecutó
contra los pesos reales y segmentó.

```
variante detectada: Transformers
máscaras: 3 de 256×256; puntuaciones: [1.007, 0.988, 0.866]
logit en el punto marcado: 14.58
logit en una esquina:      -12.73
```

### Lo que contradice al roadmap

El roadmap decía que la 10a es «cambio de pesos, no de arquitectura». **No lo
es.** MedSAM sólo existe en ONNX como `Xenova/medsam-vit-base`, exportado con
Transformers.js, y su firma no es la del export oficial de SAM:

| | Annotix esperaba | MedSAM trae |
|---|---|---|
| Encoder | 1 salida (`image_embeddings`) | 2: `image_embeddings` + `image_positional_embeddings` |
| Decoder | `point_coords`, `point_labels`, `mask_input`, `has_mask_input`, `orig_im_size` | `input_points`, `input_labels`, `image_positional_embeddings` |
| Máscaras | rango 4, ya escaladas | rango 5, a 256×256 sin escalar |

Se detecta por los nombres de las entradas: quien sube un `.onnx` no tiene por
qué saber con qué lo exportaron. Esto no desbloquea sólo MedSAM — entran todos
los exports SAM de Transformers.js.

### Lo que hay

- Segunda firma de decodificador (`DecoderVariant`, `detectar_variante`).
- Encoder que devuelve también el embedding posicional, identificado **por
  nombre**: tiene la misma forma que el embedding y por posición serían
  indistinguibles.
- Catálogo con licencia, dominio y advertencias, servido desde Rust para que no
  haya dos listas. **Regla: no entra un modelo que no se haya ejecutado**, y hay
  un test que obliga a declararlo cuando `verified: false`.
- Descarga desde la app con avance, a archivo temporal y renombrado al final: un
  corte de red no deja un `.onnx` truncado que cargue con un error
  incomprensible.
- Smoke test `sam::smoke_tests`, con `#[ignore]` porque necesita los pesos. Se
  corre así:

  ```sh
  ANNOTIX_SAM_ENCODER=/ruta/vision_encoder_quantized.onnx \
  ANNOTIX_SAM_DECODER=/ruta/prompt_encoder_mask_decoder.onnx \
    cargo test --lib sam::smoke -- --ignored --nocapture
  ```

### Lo que queda fuera

- **μSAM está bloqueado, no pendiente**: no hay ONNX en ninguna parte, se
  distribuye como checkpoints PyTorch por BioImage.IO.
  `computational-cell-analytics/medico-sam` en HF sólo tiene el README. Entraría
  montando una exportación a ONNX, que es otro trabajo.
- **MedSAM responde mejor a cajas que a puntos**: está entrenado así. El camino
  AMG de Annotix usa puntos en grilla, así que sus máscaras automáticas serán
  peores que marcando la región a mano. Queda declarado en las advertencias del
  catálogo.
- **El encoder del catálogo es el cuantizado** (96 MB en vez de 342). Corre en
  CPU a cambio de algo de precisión en el borde.
- **Sin probar dentro de la app**: el smoke test corre el par por fuera de la UI.
  Falta descargar desde Configuración y segmentar una imagen de verdad.
