# Contrato de modelo

Un `model_contract.json` junto al modelo con **qué se puede afirmar sobre él**. Se
arma sin intervención del usuario a partir de lo que las etapas anteriores
dejaron en el dato.

Entrega de la etapa 8 del plan biomédico (`docs/biomedico-fase2-roadmap.md`).

---

## Qué hace distinto

No intenta que el modelo se vea bien. Intenta que **lo que no se puede afirmar
quede escrito**.

Un modelo entrenado sin conjunto de test, sobre un corpus de procedencia
desconocida y leído una sola vez, sale con su contrato igual que cualquier otro:
lo que cambia es que el contrato lo dice, con su nivel de evidencia y la lista de
lo que faltó. Esa lista va **arriba del documento**, antes que las métricas: un
contrato que empiece por el mAP invita a leer sólo eso.

**Ningún campo se inventa.** Donde no hay dato va `null` y una línea en
`limitations` explicando por qué. Un marcador de relleno sería peor que el hueco,
porque se lee como un dato.

---

## Nivel de evidencia

Cuatro niveles acumulativos. No son una nota: son una descripción de qué preguntas
tienen respuesta.

| Nivel | Qué hace falta | Qué significa |
|---|---|---|
| **declarativo** | — | Hay un modelo y poco más. Sirve para probar una idea, no para decidir nada sobre nadie. |
| **trazable** | conjunto de test + procedencia conocida en la mayoría del corpus | Se midió sobre datos que el modelo no vio y se sabe de dónde salieron las etiquetas. |
| **reproducible** | + reparto declarado (unidad y semilla) + sujetos cargados | El experimento se puede repetir fuera de la app y no hay fuga entre particiones. |
| **verificable** | + acuerdo entre evaluadores medido | Se sabe cuánto de la etiqueta es criterio reproducible y cuánto es la persona que lo aplicó. |

El nivel se calcula sobre **hechos del dato**, no sobre intenciones: da igual lo
que se quisiera declarar, cuenta lo que quedó escrito. Un informe de acuerdo sin
valor —porque no había dos lecturas— no sube el nivel: la ausencia del dato no es
el dato.

---

## Secciones

| Sección | De dónde sale |
|---|---|
| Población: sujetos, ítems y clases por partición, con avisos | Informe de reparto del entrenamiento (etapa 3) |
| Unidad de agrupación y semilla | Política de partición declarada (etapa 3) |
| Criterios de inclusión y exclusión, modalidad, población, uso previsto | `studyProtocol` del proyecto, declarado una vez |
| Procedencia del ground truth: manual, modelo, aceptado, corregido, rechazado | `get_provenance_summary` (etapa 4) |
| Acuerdo entre evaluadores con intervalo | Etapa 7 |
| Métricas | Lo que informó la corrida |
| Versión del pipeline | App, backend, configuración entera de la corrida |
| Integridad | Hashes (abajo) |

### El protocolo del estudio

Texto libre y opcional a propósito: nadie puede validar por el usuario si un
criterio de inclusión está bien escrito, y un formulario rígido acabaría
rellenándose con lo que quepa. Lo que sí hace el sistema es notar la ausencia.

Se declara en **Galería → Gestionar sujetos → Estado del corpus → Protocolo del
estudio**.

---

## Integridad

| Campo | Qué es |
|---|---|
| `modelSha256` | Hash de contenido del archivo del modelo. |
| `datasetCompositionSha256` | Hash de **la composición**: qué ítem cayó en qué partición. No es el contenido de las imágenes —hashear diez mil archivos en cada informe no sería viable— y por eso no se llama así: lo que ancla es el reparto, que es lo que hay que poder repetir. |
| `auditHeadSha256` | Cabeza de la cadena de auditoría al emitir: ancla el modelo al estado del registro. |
| `auditChainValid` | Si la cadena verificaba al emitir. Un `false` es un dato del contrato, no un error de la app. |

---

## Lo que falta

**Intervalos de confianza en las métricas.** Calcularlos exige los resultados
**por muestra** del conjunto de test, y los backends informan sólo el agregado.
Un intervalo calculado sobre el agregado sería inventado, así que el contrato
dice por qué no lo lleva en vez de omitirlo en silencio.

Cuando se recojan los resultados por muestra, el intervalo debe salir de un
bootstrap **agrupado por sujeto**: remuestrear imágenes de los mismos doce
pacientes produce intervalos artificialmente estrechos, y es el error estadístico
más común en este tipo de informe. La maquinaria de remuestreo agrupado ya existe
(`agreement::kappa::ic_bootstrap`); lo que falta es el dato por muestra.

**Límites de uso derivados de la población.** Hoy el contrato transcribe el uso
previsto que el usuario declara. Derivar una plantilla de límites a partir de la
modalidad y la población —«no evaluado en menores de 18», «una sola marca de
equipo»— está pendiente.

**El contrato en el informe PDF.** Existe como JSON y como panel en la app; falta
incrustarlo en `trainingReportService.ts`.
