# Acuerdo entre evaluadores y adjudicación

Con dos lecturas independientes de la misma muestra (etapa 6) se puede responder
la pregunta que ninguna cantidad de anotación resuelve por sí sola: **¿esta
etiqueta es reproducible, o es la opinión de quien la puso?**

Entrega de la etapa 7 del plan biomédico (`docs/biomedico-fase2-roadmap.md`).

---

## Qué se calcula, y por qué esa métrica

Cada tipo de anotación necesita la suya. Usar una sola para todas daría números
que no significan nada.

| Familia | Tipos | Métrica | Por qué |
|---|---|---|---|
| `categorica` | clasificación, multietiqueta, clases de series | κ de Cohen (2 evaluadores), κ de Fleiss (3+) | un porcentaje de coincidencias engaña: con una clase que sale el 95 % de las veces, dos personas que siempre digan esa clase coinciden el 95 % sin haber mirado |
| `solape_caja` | bbox, obb | IoU pareado | dos personas no dibujan la misma caja igual; lo que importa es cuánto se solapan |
| `solape_area` | máscara, polígono, segmentación de instancias | Dice pareado | lo mismo, en la convención de ese campo |
| `continua` | landmarks, keypoints, regresión | Bland-Altman | no hay categorías; una correlación escondería un sesgo constante — dos personas cuyas marcas están siempre 10 px a la derecha correlacionan perfectamente y no coinciden en nada |

La elección vive en un solo sitio (`agreement::familia_de_metrica`) con espejo en
`src/features/agreement/metricFamily.ts` y un test que falla si divergen: dos
métricas distintas para la misma pregunta darían dos respuestas.

### Sólo cuentan las lecturas entregadas

Una capa en curso es un borrador. Compararla mide prisa, no desacuerdo. Una
muestra entra en el cálculo cuando tiene **dos lecturas entregadas o más**.

### Emparejar antes de comparar

Con geometría hay un paso previo que no viene dado: decidir qué marca de una
persona corresponde a cuál de la otra. Se empareja por mayor solape, de forma
codiciosa y determinista, con un umbral de 0.3.

El umbral no está midiendo calidad de detección sino decidiendo si dos personas
apuntaban a la misma cosa: con 0.5, dos cajas sobre el mismo objeto trazadas con
criterios distintos —una ceñida y otra holgada— contarían como dos objetos y el
desacuerdo saldría por partida doble.

**Lo que vio una y la otra no cuenta como desacuerdo total**, no se queda fuera de
la media: es el desacuerdo más grande que hay. Y un solape perfecto con clases
distintas cuenta como cero: contarlo como acuerdo escondería justo el problema.

---

## El intervalo de confianza

Todo valor se informa con su intervalo al 95 %, por remuestreo con semilla fija.

Se remuestrean **ítems**, no decisiones sueltas. Las decisiones sobre la misma
muestra no son independientes entre sí, y tratarlas como si lo fueran produce
intervalos artificialmente estrechos — el mismo error que remuestrear imágenes de
los mismos doce pacientes para calcular el intervalo de un mAP.

La semilla es fija porque el mismo corpus tiene que dar el mismo intervalo dos
veces: si no, el informe no se puede comparar consigo mismo.

**Un acuerdo que no se puede calcular no es un acuerdo de cero.** Cuando κ no está
definida —porque todas las lecturas dijeron lo mismo y el azar habría acertado
igual—, el informe lo dice con palabras en vez de enseñar un número.

---

## La cola de discrepancias

Ordenada por desacuerdo, lo peor arriba. El orden es lo que decide si la cola
sirve: quien adjudica mira las primeras y se fía de que lo de abajo no importa. A
igualdad de desacuerdo manda cuántas marcas vio una sola persona, porque ver algo
que el otro no vio es más grave que dibujarlo distinto.

Las muestras en las que las lecturas coinciden del todo no entran: no hay nada que
resolver.

---

## Adjudicación

El rol `Adjudicator` resuelve. Es un rol aparte de `LeadResearcher` porque
adjudicar y dirigir la sesión son cosas distintas: quien decide qué etiqueta queda
debería poder ser alguien con criterio clínico sobre el dominio, no
necesariamente quien administra el reparto. El lead researcher también puede, o
una sesión sin adjudicador designado no tendría forma de cerrar sus discrepancias.

Lo resuelto pasa a la capa consolidada (`ImageEntry.annotations`) con
`origin: "adjudicated"`, y el registro de auditoría anota quién decidió y **sobre
qué capas** (`annotations.adjudicated`). Sin eso, una etiqueta adjudicada sería
una etiqueta más y no se podría reconstruir de dónde salió.

---

## Qué falta

- **Comparación fina de máscaras**: hoy se comparan por su envolvente, que es una
  aproximación — dos polígonos muy distintos pueden tener la misma envolvente. El
  Dice real sobre píxeles está pendiente.
- **Acuerdo por clase**: el informe da un número global. Una clase rara con
  acuerdo pésimo puede quedar escondida tras un global bueno.
- **Validación cruzada contra R/scipy sobre un corpus real**: los estadísticos
  están probados contra valores publicados (κ de Fleiss = 0.2099 del ejemplo
  canónico, κ de Cohen = 0.4 de la tabla 2×2), pero no contra una salida de R
  sobre datos propios, que es lo que pide el roadmap.
