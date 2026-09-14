# Estado del plan biomédico

> **Este es el documento que hay que leer primero para continuar.** Los otros
> cinco (`biomedico-fase1` … `fase4`) son el plan; éste dice qué está hecho, qué
> falta, y qué decisiones ya se tomaron para no volver a discutirlas.
>
> Última actualización: 2026-09-14, sobre `a28f454`.

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
| 10a · MedSAM / μSAM | **a medias**: segunda firma de decodificador hecha, sin probar con pesos; μSAM bloqueado (no hay ONNX) | (esta tanda) |
| 10b · Pesos biomédicos | **empezado**: 5 modelos | `135553f` |
| 10c · nnU-Net, MONAI, Cellpose, StarDist | pendiente | — |
| 11 · Selector de dominio + presets | **a medias**: eje y catálogo sí, presets no | `beebdc5`, `fb43624` |
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

**Etapa 10b.** Quedan fuera los modelos que no se pueden descargar sin token:
UNI (gated, CC-BY-NC-ND), RETFound (gated, `.pth` suelto sin metadatos de
librería) y hibou (gated y con `trust_remote_code`, que el generador no pasa).
Entran cuando haya soporte de token del Hub.

**Etapa 11.** El eje `domains` existe y ordena, pero sólo marca arquitecturas
generalistas usables en biomedicina. No hay presets biomédicos: la tabla de la
Fase 3 sigue siendo diseño.

**Traducciones.** Todo lo nuevo está en `es` y `en`. Los otros ocho locales caen
a inglés por `fallbackLng`. Son unas 200 frases nuevas
(`training.families.*`, `training.splitReport.*`, `training.splitPolicy.*`,
`annotations.provenance.*`, `subjects.*`).

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
- Galería → «Importar DICOM / NIfTI»: que al terminar salga el informe de
  deidentificación, y que el sujeto de las imágenes quede como `SUJ-…`.
- Imagen médica abierta: el control de ventana arriba a la derecha, con los
  presets. Cambiar a ventana de hueso y comprobar que la imagen cambia.
- Lista de entrenamientos → informe de reparto de una corrida terminada: debajo
  aparece el contrato con su nivel de evidencia y sus limitaciones; «Emitir
  contrato» escribe `model_contract.json` junto al modelo.

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

`project.json` va por la **versión 9**. Migraciones en `store/io.rs`:

| | Cambio | Migración |
|---|---|---|
| v3 → v4 | `subjectId` opcional en imagen, video, serie y tabular | sólo sube la versión: `serde(default)` lee lo viejo |
| v4 → v5 | procedencia por etiqueta | rellena `origin` desde `source` sólo donde no hay ambigüedad |
| v5 → v6 | `splitPolicy` opcional en el proyecto | sólo sube la versión: declarar la política es decisión del usuario, y rellenarla sería declarar por él |
| v6 → v7 | capas de lectura por evaluador (`readings`) | sólo sube la versión: la única lectura de un proyecto viejo ya es la capa consolidada, y ponerle un autor sería inventarlo |
| v7 → v8 | protocolo de estudio (`studyProtocol`) | sólo sube la versión: un criterio de inclusión no se deduce del corpus, así que no se rellena — el contrato nota la ausencia y la declara |
| v8 → v9 | metadatos de imagen médica (`medical`) | sólo sube la versión: lo que se perdió al convertir un DICOM a PNG a mano no se puede deducir del PNG |

---

## Lo siguiente, si hay que elegir

La **cadena de validez está cerrada**: de la etapa 1 a la 8, un modelo entrenado
aquí sale con su contrato y su nivel de evidencia. Lo que queda son dos caminos
independientes.

La **etapa 12** (cifrado en reposo, opcional por proyecto) es la que decidiste
meter y no estaba en el plan. Es la que hace falta antes de que un corpus clínico
real entre en la app: hoy el proyecto está en claro en disco. Lleva su propio
punto de no retorno —una frase de paso perdida es un proyecto perdido— y una
advertencia sobre lo que no promete: cifrar en reposo no es cumplimiento
normativo.

La **etapa 11** (presets biomédicos) es la que vuelve visible todo lo anterior
para quien no leyó el plan: un primer paso «tipo de dominio» y presets que ya
pueden rellenar la política de partición recomendada y el protocolo del estudio.

La **etapa 10a** (MedSAM / μSAM) es barata: entra por el camino SAM que ya existe,
es cambio de pesos y no de arquitectura, y combinada con la procedencia deja cada
máscara marcada como sugerida por modelo y revisada por una persona.

La **etapa 10c** (nnU-Net, MONAI, Cellpose, StarDist) es cara y hay que hacerla de
a uno: rige la regla dura del repo — ninguno se publica sin smoke test de
entrenamiento real en CPU (`docs/roadmap_train.md`).

---

## Dónde quedó la etapa 10a (sesión del 2026-09-14)

**Estado: a medias, compila, sin probar con pesos reales.** Lo que hay committeado
es soporte para una **segunda firma de decodificador SAM**; lo que falta es el
catálogo y la descarga.

### Lo que se descubrió, y contradice al roadmap

El roadmap dice que la 10a es «cambio de pesos, no de arquitectura». **No lo es.**
Verificado contra Hugging Face, no de memoria:

- **MedSAM** sólo existe en ONNX como `Xenova/medsam-vit-base`, exportado con
  Transformers.js. Su firma no es la del export oficial de SAM, que es la que
  hablaba el decodificador de Annotix:

  | | Annotix esperaba | MedSAM trae |
  |---|---|---|
  | Encoder | 1 salida (`image_embeddings`) | 2: `image_embeddings` + `image_positional_embeddings` |
  | Decoder | `point_coords`, `point_labels`, `mask_input`, `has_mask_input`, `orig_im_size` | `input_points`, `input_labels`, `image_positional_embeddings` |
  | Salida | máscaras rango 4, ya escaladas | máscaras rango 5, a 256×256 sin escalar |

  Comprobado leyendo los primeros 300 KB del `.onnx` con un range request y
  extrayendo los nombres: no hace falta descargar 400 MB para saberlo.

- **μSAM** no tiene ONNX en ninguna parte. Se distribuye como checkpoints PyTorch
  por BioImage.IO. `computational-cell-analytics/medico-sam` en HF sólo tiene el
  README. Exportarlo exige una tubería Python que aquí no existe: **bloqueado**,
  no pendiente.

### Lo que quedó escrito

- `inference/sam/decoder.rs`: `DecoderVariant` (`Oficial` | `Transformers`),
  `detectar_variante()` por nombres de entrada —quien sube un `.onnx` no tiene por
  qué saber con qué lo exportaron— y `run_decoder_transformers()`.
- `inference/sam/encoder.rs`: `EncoderOutput` con `embedding` + `positional`. El
  posicional se identifica **por nombre**, no por posición: tiene la misma forma
  que el embedding y por posición serían indistinguibles.
- `SamEmbeddingCache.positional`, y el dato hilado por `sam_predict` y AMG.
- Si el decodificador pide el posicional y el encoder no lo produce, se falla con
  un mensaje que dice el porqué: los dos modelos tienen que venir del mismo
  export.

### Lo que falta

1. **Probarlo con MedSAM de verdad.** Nada de esto se ha ejecutado contra los
   pesos: sólo compila. Es lo primero que hay que hacer, y puede que aparezcan
   diferencias de preprocesado (el `preprocessor_config.json` de Xenova hay que
   compararlo con `preprocess.rs`, que hoy hace 1024 lado largo + normalización
   ImageNet).
2. **Catálogo de modelos SAM biomédicos** con licencia, dominio (radiología,
   microscopía) y para qué sirve cada uno.
3. **Descarga desde la app** con verificación de hash y licencia a la vista antes
   de bajar nada. Es la «PR8» que el roadmap de SAM dejó aparcada.
4. **μSAM**: decidir si se monta una exportación a ONNX o se declara fuera de
   alcance.

### Aviso para quien siga

No publicar MedSAM en un catálogo hasta haberlo ejecutado. Vale aquí la misma
regla que en entrenamiento (`docs/roadmap_train.md`): un modelo que no funciona de
verdad cuesta más retirarlo que no haberlo agregado.
