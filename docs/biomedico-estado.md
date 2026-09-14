# Estado del plan biomédico

> **Este es el documento que hay que leer primero para continuar.** Los otros
> cinco (`biomedico-fase1` … `fase4`) son el plan; éste dice qué está hecho, qué
> falta, y qué decisiones ya se tomaron para no volver a discutirlas.
>
> Última actualización: 2026-09-13, sobre `7b5d021`.

---

## Resumen

| Etapa (Fase 2) | Estado | Commits |
|---|---|---|
| 1 · Split agrupado por unidad natural | **hecho** | `f61c7e5` |
| 2 · `subjectId` de primer nivel | **hecho** | `7cc466a`, `958359e` |
| 3 · Política de partición + informe | **hecho** | `2558bb9`, `7a98ab8` |
| 4 · Procedencia por etiqueta | **hecho** | `26261c2`, `f1b95eb`, `7b5d021` |
| 5 · Auditoría encadenada | pendiente | — |
| 6 · Lectura múltiple cegada | pendiente | — |
| 7 · Acuerdo + adjudicación | pendiente | — |
| 8 · Contrato de modelo | pendiente | — |
| 9 · Ingesta DICOM / NIfTI / WSI / 3D | pendiente | — |
| 10a · MedSAM / μSAM | pendiente | — |
| 10b · Pesos biomédicos | **empezado**: 5 modelos | `135553f` |
| 10c · nnU-Net, MONAI, Cellpose, StarDist | pendiente | — |
| 11 · Selector de dominio + presets | **a medias**: eje y catálogo sí, presets no | `beebdc5`, `fb43624` |

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
6. **La etapa 9 no bloquea todo lo biomédico.** Teselas de histopatología, fondo
   de ojo y radiografías en PNG son imágenes 2D normales. Sólo la volumetría y la
   lámina completa dependen de ella. (Corrección al roadmap original.)

---

## Formato de datos

`project.json` va por la **versión 6**. Migraciones en `store/io.rs`:

| | Cambio | Migración |
|---|---|---|
| v3 → v4 | `subjectId` opcional en imagen, video, serie y tabular | sólo sube la versión: `serde(default)` lee lo viejo |
| v4 → v5 | procedencia por etiqueta | rellena `origin` desde `source` sólo donde no hay ambigüedad |
| v5 → v6 | `splitPolicy` opcional en el proyecto | sólo sube la versión: declarar la política es decisión del usuario, y rellenarla sería declarar por él |

---

## Lo siguiente, si hay que elegir

La **etapa 5** (auditoría encadenada) es la más barata de las que quedan y ya
tiene la maquinaria escrita: `study/log.rs` sabe encadenar con `prev_hash`,
verificar y recuperarse de un cierre sucio. Lo que falta es un registro paralelo
con ids en claro dentro del proyecto — el modo estudio es anónimo por diseño y no
sirve como procedencia.

La **etapa 8** (contrato de modelo) es la que más valor visible da, y ya tiene
cuatro de sus insumos: informe de reparto con semilla y unidad (etapa 3),
política de partición declarada (`splitPolicy`), procedencia con tasa de rechazo
(`get_provenance_summary`, etapa 4) y población por sujeto (etapa 2). Le falta
el acuerdo entre evaluadores (etapa 7) y los intervalos de confianza por
bootstrap agrupado por sujeto.
