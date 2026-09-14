# Lectura múltiple y cegada

Leer cada muestra **más de una vez, por personas distintas**, es lo que permite
saber si una etiqueta es reproducible o es la opinión de quien la puso. Sin dos
lecturas independientes no hay nada que comparar, y el acuerdo entre evaluadores
—la pieza que el contrato de modelo necesita— no se puede calcular.

Entrega de la etapa 6 del plan biomédico (`docs/biomedico-fase2-roadmap.md`).

---

## Qué cambia, y qué no

Una sesión normal no ve nada de esto. La lectura múltiple se enciende en las
reglas de la sesión (`replication > 1`); con `replication: 1` —el valor por
defecto y el de todas las sesiones existentes— el comportamiento es exactamente
el de antes, y hay tests que fallan si eso deja de ser cierto.

| | Lectura única (por defecto) | Lectura múltiple |
|---|---|---|
| Reparto | cada ítem a una persona | cada ítem a `replication` personas distintas |
| Lock | por imagen | por **(imagen, evaluador)** |
| Anotaciones | `annotations` | una capa por evaluador en `readings` |
| Sincronización | la última escritura gana | una capa por autor, sin colapsar |

---

## Las capas

`ImageEntry.annotations` pasa a llamarse la **capa consolidada**: es la que usan
la galería, el entrenamiento y la exportación. `ImageEntry.readings` guarda una
capa por evaluador:

```json
{ "authorId": "…", "authorName": "Ana", "annotations": [ … ],
  "status": "in_progress", "submittedAt": null, "updatedAt": 1789… }
```

En la máquina de cada evaluador, la consolidada es **su propia capa** —es sobre lo
que anota, y no puede ser la de otro—. La consolidada de verdad, la que sale de
adjudicar las discrepancias, la escribe la etapa 7 en el proyecto de quien
adjudica.

**Entregar es un acto del evaluador.** Hasta que no lo hace, su capa es
`in_progress`: un borrador. El acuerdo se calculará sólo sobre capas entregadas,
porque comparar contra un trabajo a medias mide prisa, no desacuerdo.

---

## El cegado

`blind: true` significa que un evaluador **no ve las capas de los demás**: no
llegan a la UI ni se escriben en su `project.json`. Sin esto, la segunda lectura
mira la primera y el acuerdo que se mida después no dice nada — dos personas que
ven lo mismo coinciden porque lo vieron.

Es un cegado **de la aplicación**. El documento replicado sigue conteniendo todas
las capas, porque iroh-docs replica el documento entero: quien inspeccione el
sustrato a mano puede leerlas. Está dicho así en la propia regla y aquí para no
prometer lo que no se cumple; un cegado de verdad exigiría cifrar cada capa con
una clave que sólo tenga quien adjudica, y eso no está hecho.

---

## Compatibilidad entre versiones

Una sesión con lectura múltiple o cegado declara `meta/protocol_version = 2` en el
documento. Quien se une comprueba esa versión y **se niega a entrar** si es más
nueva que la que entiende: entrar sería peor que no entrar, porque colapsaría las
capas de los demás y no respetaría el cegado sin que nadie se entere hasta que el
acuerdo salga sospechosamente alto.

Lo que no se puede hacer es al revés: una app anterior no conoce esa clave y no la
mira. Por eso una sesión de lectura múltiple **exige que todos actualicen**, y la
pantalla de creación lo dice antes de empezar.

Una sesión normal (`replication: 1`, sin cegado) declara protocolo 1 y sigue
siendo compatible con las versiones anteriores.

---

## Qué falta

- **Acuerdo y adjudicación** (etapa 7): κ de Cohen y Fleiss, Dice/IoU pareados,
  cola de discrepancias y rol adjudicador. Las capas están; el cálculo no.
- **Validación con gente real.** Nada de esto se ha probado con tres anotadores
  en tres máquinas: las reglas de reparto, cupo de locks y agrupación de capas
  están cubiertas por tests de unidad sobre funciones puras, que es otra cosa.
  Lo que hay que comprobar cuando se pueda:
  - que ninguno vea las capas de los otros ni en la UI ni en su `project.json`;
  - que las tres capas lleguen completas al host;
  - que un par que se cae y vuelve no pierda ni duplique su capa;
  - el caso feo: el host abre el proyecto mientras los tres anotan.
