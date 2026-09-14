# Estado del plan biomédico

> **Este es el documento que hay que leer primero para continuar.** Los otros
> cinco (`biomedico-fase1` … `fase4`) son el plan; éste dice qué está hecho, qué
> falta, y qué decisiones ya se tomaron para no volver a discutirlas.
>
> Última actualización: 2026-09-13, sobre `93722b3`.

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

`project.json` va por la **versión 7**. Migraciones en `store/io.rs`:

| | Cambio | Migración |
|---|---|---|
| v3 → v4 | `subjectId` opcional en imagen, video, serie y tabular | sólo sube la versión: `serde(default)` lee lo viejo |
| v4 → v5 | procedencia por etiqueta | rellena `origin` desde `source` sólo donde no hay ambigüedad |
| v5 → v6 | `splitPolicy` opcional en el proyecto | sólo sube la versión: declarar la política es decisión del usuario, y rellenarla sería declarar por él |
| v6 → v7 | capas de lectura por evaluador (`readings`) | sólo sube la versión: la única lectura de un proyecto viejo ya es la capa consolidada, y ponerle un autor sería inventarlo |

---

## Lo siguiente, si hay que elegir

La **etapa 7** (acuerdo + adjudicación) es la que sigue por dependencia: las capas
de la etapa 6 ya están y no sirven de nada hasta que alguien las compare. Es
trabajo de cálculo —κ de Cohen y Fleiss, Dice/IoU pareados, Bland-Altman— más una
cola de discrepancias y el rol adjudicador. Lo caro es que cada tipo de anotación
necesita su métrica.

La **etapa 8** (contrato de modelo) es la que más valor visible da, y ya tiene
cinco de sus insumos: informe de reparto con semilla y unidad (etapa 3), política
de partición declarada (`splitPolicy`), procedencia con tasa de rechazo
(`get_provenance_summary`, etapa 4), población por sujeto (etapa 2) y el registro
de auditoría con su hash (etapa 5). Le falta el acuerdo entre evaluadores
(etapa 7) y los intervalos de confianza por bootstrap agrupado por sujeto.
