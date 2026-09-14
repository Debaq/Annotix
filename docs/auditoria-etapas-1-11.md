# Auditoría de las etapas 1–11

Revisión del 2026-09-14 sobre `9613e06`, hecha leyendo el código y no el
roadmap. Lo que sigue es lo que **no** está, ordenado por lo que más duele.

---

## 1. Defecto: los presets biomédicos no se cumplen fuera de YOLO

**Lo más grave de esta lista.** La etapa 11 promete que un preset de radiología
no voltea la imagen, porque la lateralidad es diagnóstica. Esa promesa sólo se
cumple en YOLO y RT-DETR.

| Backend | Qué augmentación aplica |
|---|---|
| `yolo`, `rt_detr` | La de ultralytics, configurable desde la UI |
| `smp` | **Fija en el generador**: `Resize`, `HorizontalFlip(p=0.5)`, `RandomBrightnessContrast(p=0.3)` (`scripts.rs:1896-1901`) |
| `timm` | `create_transform(is_training=True)` de timm, sin configurar |
| `hf_*` | Lo que haga el processor del modelo |
| series y tabular | Ninguna |

El preset `bio_unet_seg` fija `fliplr: 0` y el script de `smp` voltea igual, con
probabilidad 0.5. **Un corpus de radiografías entrenado con ese preset sale
volteado la mitad de las veces**, y el aviso de lateralidad que la app enseña
dice lo contrario de lo que pasa.

Es además la razón de fondo para el plan de augmentación: no es una mejora, es
la única forma de que lo que la UI promete sea lo que ocurre.

---

## 2. Traducciones: **4104 claves** faltan

No ~200 como decía el estado. Repartidas en los ocho locales que no son `es` ni
`en`, y con cinco archivos que **no existen** en ninguno de ellos:
`subjects`, `agreement`, `contract`, `medical`, `sam`.

| Namespace | Claves en `es` | Faltan por locale |
|---|---|---|
| `training` | 701 | 295 |
| `p2p` | 137 | 12 |
| `sam` | 46 | 46 (archivo ausente) |
| `subjects` | 45 | 45 (ausente) |
| `contract` | 38 | 38 (ausente) |
| `medical` | 33 | 33 (ausente) |
| `annotations` | 30 | 23 |
| `agreement` | 21 | 21 (ausente) |

No rompe nada —`fallbackLng` las sirve en inglés— pero un usuario en japonés ve
media app en su idioma y la otra media en inglés, justo en las partes nuevas.

---

## 3. Lo que quedó declarado y no hecho

### Métricas sin intervalo de confianza (etapa 8)

El contrato dice por qué no las lleva, que es lo honesto, pero la causa sigue
ahí: **los backends informan sólo el agregado**, no los resultados por muestra.
Sin ellos no hay bootstrap agrupado por sujeto que valga.

Arreglarlo es tocar los 17 generadores para que emitan un CSV de predicciones
por muestra del conjunto de test. La maquinaria de remuestreo ya existe
(`agreement::kappa::ic_bootstrap`).

### El contrato no está en el informe PDF (etapa 8)

Existe como JSON y como panel en la app. `trainingReportService.ts` no lo
menciona. El PDF es lo que la gente adjunta a un correo.

### Acuerdo: sin desglose por clase, y máscaras por envolvente (etapa 7)

- El informe da **un número global**. Una clase rara con acuerdo pésimo se
  esconde detrás de un global bueno.
- Las máscaras y polígonos se comparan por su **caja envolvente**. Dos polígonos
  muy distintos con la misma envolvente puntúan igual. El Dice real sobre
  píxeles está pendiente.

### Lectura múltiple sin probar con gente (etapa 6)

Reparto replicado, cupo de locks y agrupación de capas están cubiertos por tests
de unidad sobre funciones puras. **Nadie lo ha corrido con tres anotadores en
tres máquinas**, que es lo que pide el roadmap.

El cegado es de la aplicación: el documento replicado lleva todas las capas y
quien inspeccione el sustrato puede leerlas.

### P2P no sincroniza lo médico (etapa 9a)

El par que recibe una imagen recibe el PNG renderizado, no la copia de 16 bits.
No puede volver a ventanear, y `medical` va a `None` a propósito para no
prometer una capacidad que no tiene.

### MedSAM sin probar dentro de la app (etapa 10a)

El smoke test corre el par por fuera de la UI y funciona. Falta descargarlo desde
Configuración y segmentar una imagen de verdad.

---

## 4. Lo que nunca se ha visto correr

**Nada de la UI de estas siete etapas se ha visto dentro de Annotix.** La app
corre bajo Wayland y no se puede manejar su ventana desde la sesión de trabajo.
La lista de qué mirar está en `docs/biomedico-estado.md`; a día de hoy tiene diez
puntos sin comprobar.

---

## 5. Lo que está bien y conviene no tocar

Para que la lista no parezca peor de lo que es:

- Las **migraciones** de la v3 a la v10 no reescriben datos y hay tests que lo
  fijan. Ninguna inventa un dato que el usuario no declaró.
- Los **estadísticos de acuerdo** están probados contra valores publicados
  (κ de Fleiss = 0.2099 del ejemplo canónico, κ de Cohen = 0.4 de la tabla 2×2).
- La **deidentificación** tiene un test que falla si el nombre del paciente llega
  al proyecto, y el informe declara lo que no cubre.
- **MedSAM** se verificó contra los pesos reales, no sólo compilando.
- Cada **catálogo** —modelos SAM, presets biomédicos— tiene un test que comprueba
  que lo que ofrece existe de verdad.

---

## 6. Orden sugerido

1. **Augmentación unificada** (`docs/plan-augmentacion.md`) — arregla el punto 1,
   que es el único que hace que la app mienta.
2. **Resultados por muestra en el test** — desbloquea los intervalos del
   contrato, que es el hueco más visible de la etapa 8.
3. **Traducciones** — mecánico, y hoy son 4104 claves.
4. **Contrato en el PDF** — barato.
5. **Acuerdo por clase y Dice real** — mejora la etapa 7 donde hoy engaña.
