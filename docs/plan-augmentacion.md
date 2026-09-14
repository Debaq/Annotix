# Plan: augmentación unificada y teselado

## Por qué, antes que qué

Hoy la augmentación depende del backend que toque:

| Backend | Qué aplica |
|---|---|
| `yolo`, `rt_detr` | La de ultralytics: rica y configurable desde la UI |
| `smp` | Tres transformaciones **fijas en el generador**: `Resize`, `HorizontalFlip(p=0.5)`, `RandomBrightnessContrast(p=0.3)` |
| `timm` | La de timm por defecto, sin configurar |
| `hf_*` | Lo que haga el processor del modelo |
| series, tabular | Ninguna |

Eso tiene una consecuencia que no es de comodidad: **los presets biomédicos de la
etapa 11 no se cumplen fuera de YOLO**. `bio_unet_seg` fija `fliplr: 0` porque la
lateralidad es diagnóstica, y el script de `smp` voltea igual con probabilidad
0.5. La app avisa de la lateralidad y hace lo contrario de lo que dice.

Así que esto no es «más augmentaciones». Es que lo que la interfaz promete sea lo
que ocurre, en los diecisiete backends.

---

## La decisión de fondo: fuera de línea, al preparar el dataset

Dos caminos posibles:

| | En línea (dentro del script) | **Fuera de línea (al preparar)** |
|---|---|---|
| Dónde vive | Cada backend con su librería | `training/dataset.rs`, una vez |
| Cobertura | Hay que escribirlo 17 veces | Los 17 a la vez, sin tocar los generadores |
| Variedad | Distinta en cada época | Fija: la que se materializó |
| Disco | Nada | Multiplica el dataset |
| Reproducible | Depende de la semilla de cada librería | Determinista, y el contrato puede declarar exactamente qué se aplicó |
| Auditable | No se puede mirar | Se pueden **abrir las imágenes** y ver qué se generó |

Se elige **fuera de línea**, y las dos últimas filas son el motivo. Un dataset
aumentado que se puede abrir y mirar es un dataset que se puede defender; una
augmentación que ocurre dentro del bucle de entrenamiento sólo se puede creer.

Además es lo único que arregla el defecto de arriba sin reescribir diecisiete
generadores.

**Lo que se pierde**: la variación por época. Se compensa con el factor de
multiplicación —cada imagen genera N variantes distintas— y se dice claramente en
la UI, porque un usuario que venía de YOLO notará la diferencia.

**La augmentación en línea no se retira.** YOLO sigue con la suya; lo que se
añade es que sus parámetros y los del pipeline nuevo no se pisen — con un aviso
cuando los dos están activos sobre el mismo eje.

---

## El catálogo de transformaciones

Cada una con sus parámetros, su rango y qué le hace a las anotaciones. La última
columna es la que decide la implementación: una transformación que mueve píxeles
tiene que mover las etiquetas con ellos, o el dataset sale roto en silencio.

### Geométricas

| Transformación | Parámetros | Qué le pasa a la anotación |
|---|---|---|
| **flip horizontal** | `p` | Espejo en X. Trivial en bbox, polígono, keypoints y máscara. **Los keypoints con pares izquierda/derecha hay que intercambiarlos**, o el esqueleto queda cruzado |
| **flip vertical** | `p` | Espejo en Y, mismo cuidado |
| **rotación** | `p`, `grados` (rango), `relleno` (borde/constante/reflejo) | Rota puntos. Una bbox rotada deja de ser eje-alineada: se toma su envolvente, y **eso engorda la caja** — hay que decirlo |
| **tilt / perspectiva** | `p`, `intensidad` | Homografía. Igual que la rotación: la bbox se recalcula por envolvente |
| **shear** | `p`, `x_grados`, `y_grados` | Cizalla; mismo tratamiento |
| **zoom** | `p`, `escala` (rango), `centro` (aleatorio/central) | Escala y recorta o rellena. Una anotación que se sale del marco se **recorta**; si queda menos del `min_visibilidad`, se descarta |
| **resize** | `ancho`, `alto`, `modo` (estirar/carta/recortar) | Escala lineal. En modo carta hay que sumar el desplazamiento del relleno |
| **traslación** | `p`, `x`, `y` (fracción) | Desplaza; se recorta como el zoom |

### Fotométricas

No tocan la geometría, así que las anotaciones no cambian. Sí cambian lo que el
modelo puede aprender.

| Transformación | Parámetros | Cuidado |
|---|---|---|
| **brillo / contraste** | `p`, `brillo`, `contraste` | En imagen médica, un cambio de contraste es **un ventaneo distinto**: puede borrar el hallazgo |
| **hue** | `p`, `rango` | **Sin sentido en escala de grises**: un CT no tiene tono. La UI la desactiva cuando la modalidad es monocroma |
| **saturación** | `p`, `rango` | Lo mismo |
| **escala de grises** | `p` | Útil para que el modelo no se agarre al color cuando el color es del teñido, no del tejido |
| **ruido gaussiano** | `p`, `sigma` | Simula ruido de sensor. En CT de baja dosis es realista; en histología, no tanto |
| **desenfoque de movimiento** | `p`, `tamaño_kernel`, `ángulo` | Simula movimiento del paciente o de la platina. **El kernel es configurable** porque su tamaño relativo a la lesión decide si la borra |
| **desenfoque gaussiano** | `p`, `sigma` | Desenfoque de foco |
| **nitidez** | `p`, `intensidad` | El contrario |
| **borrado aleatorio** | `p`, `área`, `proporción` | Oclusión. **Hay que impedir que borre la anotación entera**, o se enseña a no detectar |

Cada una lleva `p` (probabilidad de aplicarse) y sus parámetros son **rangos**, no
valores: se sortea dentro del rango en cada variante.

---

## TILE: el interesante

El caso: una lámina de histopatología o una radiografía de 4000×3000 píxeles
entrando a un modelo de 640×640. Redimensionarla destruye justo lo que hay que
detectar — una mitosis de 30 píxeles se convierte en cinco.

**Configuración: filas × columnas + solape.**

```
filas: 3        columnas: 4        solape: 15 %
```

Una imagen de 4000×3000 sale en 12 teselas de ~1176×1153 con 15 % de solape entre
vecinas. Cada tesela es una imagen del dataset, con las anotaciones que le tocan.

### Por qué el solape no es un detalle

Sin solape, un objeto que cae en la frontera queda partido en dos trozos, y
ninguno de los dos es el objeto: el modelo aprende medias lesiones. Con solape,
ese objeto aparece **entero** en al menos una tesela.

El solape se declara en **porcentaje del lado de la tesela**, que es como se
piensa: «que las teselas se pisen un 15 %». 15–25 % cubre objetos de hasta ese
tamaño relativo.

### Las reglas que deciden si el teselado sirve

1. **Una anotación cortada por el borde se recorta**, y si de ella queda menos del
   `min_visibilidad` (por defecto 0.3), **se descarta en esa tesela**. Dejar un
   fragmento del 5 % de una lesión enseña al modelo que ese fragmento es la
   lesión entera.
2. **Las teselas sin ninguna anotación son negativos**, y hay que decidir qué
   hacer con ellas: `descartar`, `conservar todas` o `conservar una fracción`. Por
   defecto se conserva el 10 %, que es la proporción de fondos que recomienda
   ultralytics. Conservarlas todas inunda el dataset de fondo —en una lámina, el
   95 % es tejido sano— y el modelo aprende a no detectar nada.
3. **La tesela hereda el sujeto de su imagen.** Sin esto, doce teselas del mismo
   paciente se reparten entre train y test y la métrica mide memoria. Es la fuga
   de la etapa 1 a otra escala, y el reparto agrupado ya sabe evitarla **si el
   dato viaja**.
4. **Se registra de qué imagen y de qué posición salió cada tesela.** Es lo que
   permite volver a montar la predicción sobre la imagen completa, y lo que hace
   que el reparto pueda agrupar por imagen de origen aunque no haya sujeto.

### Lo que el teselado no resuelve

La inferencia. Un modelo entrenado por teselas hay que aplicarlo por teselas y
recomponer, con supresión de no-máximos en las zonas de solape. Eso es trabajo
aparte y va en el subsistema de inferencia, no aquí. **Conviene decirlo en la UI
al activar el teselado**, o alguien entrenará un modelo que no sabrá usar.

---

## Interacción con la selección de clases

Aquí es donde esto se vuelve más que una lista de filtros.

`restrict_to_classes` (`training/dataset.rs`) ya deja en el dataset sólo las
clases elegidas, y descarta las imágenes que se quedan sin ninguna. Con la
augmentación fuera de línea se puede ir un paso más allá:

**Multiplicación por clase.** Un corpus con 400 ejemplos de «normal» y 12 de
«lesión rara» entrena un modelo que dice «normal» siempre y acierta el 97 %. Con
un factor por clase —×1 para la mayoritaria, ×20 para la rara— el dataset sale
equilibrado sin tener que anotar más.

Tres modos:

| Modo | Qué hace |
|---|---|
| `uniforme` | El mismo factor para todas. Es el comportamiento simple. |
| `equilibrar` | Calcula el factor por clase para acercar los conteos al de la clase mayoritaria, con un tope (`max_factor`) para que una clase con 2 ejemplos no genere 200 variantes de las mismas 2 imágenes |
| `manual` | El usuario fija el factor de cada clase |

**El aviso que hay que dar**: multiplicar una clase con 2 ejemplos por 20 no crea
22 casos, crea 2 casos vistos 20 veces. El modelo los memoriza. El equilibrado
por augmentación tapa el desbalance en la métrica de entrenamiento sin arreglar la
falta de datos, y eso tiene que estar dicho donde se configura — y bajar el nivel
de evidencia del contrato, como todo lo demás.

**Y sólo sobre train.** Val y test **nunca** se aumentan: medir sobre imágenes
aumentadas mide cómo le va al modelo con las deformaciones que uno mismo eligió,
no con datos nuevos. Es un error fácil de cometer y difícil de detectar después.

---

## Lo que la modalidad decide (y esto se hereda de la etapa 11)

El catálogo de transformaciones no se ofrece igual en todas partes. La modalidad
del corpus —que ya se detecta sola desde el DICOM— gobierna qué tiene sentido:

| | Radiología (CR, DX, CT, MR, MG) | Microscopía e histología |
|---|---|---|
| flip horizontal | **desactivado**: la lateralidad es diagnóstica | libre |
| flip vertical | **desactivado**: el eje cráneo-caudal es fijo | libre |
| rotación | ≤ 10°: el posicionamiento está estandarizado | 0–180°: el campo es arbitrario |
| hue, saturación | **sin sentido**: son monocromas | útiles: compensan variación de tinción |
| escala de grises | redundante | **útil**: quita la dependencia del teñido |
| ruido | realista (dosis baja) | menos realista |
| teselado | útil en mamografía y radiografía digital | **el caso principal** (lámina completa) |

La UI parte de la modalidad detectada y deja cambiarlo: es una recomendación, no
una reja.

---

## Cómo se implementa

### Esquema

Un bloque de augmentación a nivel de proyecto, como `splitPolicy`, para que la
configuración sobreviva entre corridas y el contrato pueda transcribirla:

```rust
pub struct AugmentationPlan {
    pub enabled: bool,
    /// Cuántas variantes por imagen de train. 0 = sólo las originales.
    pub factor: u32,
    pub balance: BalanceMode,
    pub per_class_factor: BTreeMap<i64, u32>,
    /// Semilla: el mismo plan sobre el mismo corpus da el mismo dataset.
    pub seed: Option<u64>,
    pub transforms: Vec<TransformSpec>,
    pub tiling: Option<TilingSpec>,
    /// Fracción mínima de una anotación que tiene que sobrevivir al recorte.
    pub min_visibility: f32,
}

pub struct TilingSpec {
    pub rows: u32,
    pub cols: u32,
    /// Solape entre teselas vecinas, en fracción del lado (0.0–0.5).
    pub overlap: f32,
    pub empty_tiles: EmptyTilePolicy,
    /// Qué fracción de las teselas vacías se conserva.
    pub empty_keep_ratio: f32,
}
```

### Dónde va el código

| Pieza | Dónde | Qué hace |
|---|---|---|
| `augment/transforms.rs` | nuevo | Cada transformación sobre píxeles **y** sobre anotaciones. Funciones puras, probadas una por una |
| `augment/geometry.rs` | nuevo | La matriz afín y cómo se le aplica a bbox, polígono, keypoints, OBB y máscara. Es donde vive la corrección |
| `augment/tiling.rs` | nuevo | Rejilla con solape, recorte de anotaciones, política de vacías |
| `augment/plan.rs` | nuevo | Ejecuta el plan: sortea con la semilla, genera variantes, escribe |
| `training/dataset.rs` | existente | Llama al plan **después** del reparto y **sólo sobre train** |

### El orden importa

```
seleccionar clases → repartir (train/val/test) → [sólo train] teselar → aumentar
```

Repartir **antes** de teselar y aumentar no es un detalle: si se reparte después,
dos teselas de la misma imagen —o dos variantes de la misma foto— caen en train y
en test, y la métrica sale inflada sin que nada lo delate. Es la misma fuga de la
etapa 1 por un camino nuevo, y por eso el orden es parte del diseño y no una
casualidad de implementación.

---

## Qué hay que probar, y con qué criterio

Lo que decide si esto está bien no es que genere imágenes: es que las anotaciones
sigan encima de lo que marcan.

1. **Ida y vuelta geométrica.** Rotar 90° cuatro veces devuelve la anotación a su
   sitio, con tolerancia de un píxel. Lo mismo con flip aplicado dos veces.
2. **La anotación sigue al píxel.** Con una imagen sintética —un cuadrado blanco
   sobre negro— y su bbox exacta: tras cada transformación, la caja tiene que
   seguir conteniendo el cuadrado, y no mucho más.
3. **Teselado sin pérdida.** Un objeto que cae en la frontera aparece **entero**
   en al menos una tesela con el solape configurado.
4. **Visibilidad mínima.** Un objeto que queda al 10 % en una tesela se descarta
   en esa tesela y sigue entero en la vecina.
5. **Keypoints con pares.** Al voltear en horizontal, el punto «hombro izquierdo»
   pasa a ser «hombro derecho». Sin esto el esqueleto queda cruzado y nadie lo ve.
6. **Ni val ni test se aumentan nunca.** Test de regresión explícito.
7. **Determinismo.** El mismo plan y la misma semilla generan el mismo dataset,
   comprobado por hash de la composición.
8. **Las modalidades lateralizadas no pueden activar volteo**, igual que en los
   presets.

---

## Orden de trabajo

1. `augment/geometry.rs` con sus tests — es donde vive la corrección y lo demás
   se apoya en ello.
2. Transformaciones fotométricas: no tocan anotaciones, son baratas.
3. Teselado con filas × columnas + solape.
4. El plan, la semilla y el enganche en `dataset.rs` tras el reparto.
5. Factor por clase y modo equilibrar.
6. UI: catálogo con vista previa sobre una imagen real del proyecto — sin ver el
   resultado, nadie sabe si `shear 15°` es mucho o poco.
7. **Pasar el plan a los generadores que hoy augmentan por su cuenta**, para que
   no se pisen: `smp` deja de tener su `HorizontalFlip` fijo, y YOLO recibe los
   parámetros que no se solapen con lo ya materializado.

El punto 7 es el que arregla el defecto que abre este documento, y conviene no
dejarlo para el final.
