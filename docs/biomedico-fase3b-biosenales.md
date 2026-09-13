# Fase 3b — Modelos para señales biosanitarias (ECG, EEG, PPG, sueño)

> Addendum a `docs/biomedico-fase3-presets.md`, cuyo §8 declaraba este hueco.
> El catálogo fijo del prompt original era solo de imagen; esta ampliación la
> pidió el usuario porque Annotix ya tiene nueve tipos de proyecto de serie
> temporal y sus propios textos de ayuda hablan de ECG, EEG y estadificación del
> sueño (`es/project.json:249`, `es/projectDetail.json:104-139`).
>
> Todos los modelos listados se verificaron contra fuente en septiembre de 2026
> (enlaces al final). No se implementó código.

---

## El hallazgo que cambia el costo del asunto

**`braindecode` es a EEG lo que `smp` es a segmentación**: una librería única,
instalable por pip, que expone una familia entera de modelos preentrenados con
una API uniforme al estilo HuggingFace.

```python
from braindecode.models import BENDR
model = BENDR.from_pretrained("braindecode/braindecode-bendr", n_outputs=2)
model.reset_head(n_outputs=5)          # cambiar de tarea
```

`from_pretrained()` baja pesos y configuración del Hub; `reset_head()` cambia la
cabeza para otra tarea; `return_features=True` extrae embeddings del encoder;
`get_config()` / `from_config()` reconstruyen la arquitectura. Requiere
`pip install braindecode[hub]` (documentado en 1.8.1) y, para los modelos con
acceso restringido, un token de HuggingFace.

Esto importa para el costo: un solo backend nuevo entrega **once modelos
fundacionales de EEG**, igual que el backend `smp` ya entrega trece
arquitecturas de segmentación con un solo preparador y un solo generador de
script. Es el mismo patrón que el proyecto ya sabe ejecutar.

---

## 1. Catálogo por señal

### 1.1 EEG — todos vía el backend `braindecode`

| Modelo | Qué es | Tamaño | Notas de acceso |
|---|---|---|---|
| **CBraMod** | Criss-Cross Brain Foundation Model, ICLR 2025. Checkpoint publicado por la propia organización `braindecode` en el Hub | — | Abierto |
| **LaBraM** | Large Brain Model: predice tokens neuronales de parches de EEG enmascarados. El más citado de la familia | — | **Solo los pesos de LaBraM-Base son públicos** |
| **EEGPT** | Transformer preentrenado para extracción universal de características de EEG, doble auto-supervisión con máscaras | — | Abierto |
| **BIOT** | Biosignal Transformer: transformer lineal con tokenización uniforme de EEG, aprendizaje cruzado entre datasets. Variantes 1D/2D/6D | 3.2 M | Abierto. El más liviano de todos — candidato natural para el preset de CPU |
| **BENDR** | Preentrenamiento auto-supervisado estilo wav2vec sobre EEG | — | Abierto |
| **SignalJEPA** | Predicción en espacio latente (JEPA) sobre señales | — | Abierto |
| **CodeBrain**, **STEEGFormer** | Otras dos familias servidas por la misma organización | — | Abierto |
| **REVE** (base / large) | Alojado por `brain-bzh` | hasta 390 M | Externo a la organización braindecode |
| **LUNA** (base / large / huge) | Alojado por `PulpBio` | — | Requiere pasar `filename` para elegir checkpoint |

Comparación entre ellos: existe `EEG-FM-Benchmark` y `AdaBrain-Bench`, dos
benchmarks independientes publicados en 2025 precisamente porque cada paper
reportaba sobre su propio protocolo. Antes de recomendar un modelo por defecto en
un preset, el número que vale es el de esos benchmarks, no el del paper.

### 1.2 ECG — modelos individuales en HuggingFace, sin librería paraguas

No hay un `braindecode` del ECG: cada modelo se integra por separado.

| Modelo | Qué es | Pesos | Licencia / traba |
|---|---|---|---|
| **ECG-FM** (bowang-lab) | Arquitectura wav2vec 2.0, 90.9 M parámetros, preentrenado con auto-supervisión híbrida (reconstrucción enmascarada + contrastivo) sobre 1.5 M de ECG de 12 derivaciones (MIMIC-IV-ECG, PhysioNet 2021). Publicado en JAMIA Open 2025 con benchmark público. AUROC 0.996 en fibrilación auricular, 0.929 en FEVI ≤40 % | En HuggingFace | Abierto. **Es el candidato por defecto**: pesos abiertos, benchmark propio y buen desempeño con poco dato etiquetado |
| **ECGFounder** (PKUDigitalHealth) | NEJM AI 2025, construido sobre más de 10 M de registros. Trae evaluación lista sobre PTB-XL (150 clases) | En HuggingFace | Verificar términos antes de usar en producto |
| **HuBERT-ECG** (Edoardo-BS) | Predicción de clusters enmascarados, preentrenado sobre 9.1 M de ECG y 164 condiciones cardiovasculares | En HuggingFace | **CC BY-NC 4.0 — no comercial.** Traba real si Annotix se usa en un contexto comercial; hay que decirlo en la UI, no en un README |

Advertencia que vale más que el catálogo: existe *Benchmarking ECG FMs: A Reality
Check Across Clinical Tasks* (2025), cuyo resultado es que la ventaja de los
modelos fundacionales sobre líneas base bien entrenadas se estrecha mucho según
la tarea. Traducción para el preset: **la línea base de `tsai` no es un
placeholder, es el control**. Un preset que recomiende ECG-FM debe poder
compararse contra InceptionTime/PatchTST en el mismo corpus, y si no gana, el
preset está mal recomendado.

### 1.3 PPG y señales ópticas

**PaPaGei** (Nokia Bell Labs, ICLR 2025) — primer modelo fundacional abierto de
PPG. Preentrenado sobre 20 M de segmentos sin etiquetar (>57 000 horas), solo con
datasets públicos. Mejora clasificación 6.3 % y regresión 2.9 % de media contra
otros modelos fundacionales de series temporales, y es más eficiente en datos y
parámetros que modelos hasta 70× más grandes. Relevante para pulsioximetría y
wearables.

### 1.4 Sueño (multimodal: EEG + EOG + EMG + respiración)

| Modelo | Qué es |
|---|---|
| **YASA** | Estadificación automática clásica, eLife 2021, sobre scikit-learn. Liviano, interpretable, corre en CPU sin esfuerzo. Es la línea base honesta |
| **U-Sleep** | Estadificación robusta, entrada de sensores arbitraria. La referencia del campo |
| **SleepGPT** | Modelo fundacional tiempo-frecuencia unificado, Nature Communications 2025. Estadificación, patología del sueño, generación de datos y detección de husos |
| **Modelo fundacional multimodal de sueño** | Nature Medicine 2025. Compite con U-Sleep y YASA (F1 medio 0.70-0.78 en estadificación) y además predice enfermedad: apnea (exactitud 0.69 en severidad, 0.87 en presencia) |

### 1.5 EMG y otras

Sin modelo fundacional abierto consolidado equivalente a los anteriores.
Corresponde la ruta generalista (`tsai`) o los modelos multimodales de sueño
cuando el EMG entra como canal accesorio.

### 1.6 Modelos fundacionales de series temporales genéricas

Aplicables a cualquier señal, sin conocimiento fisiológico: son el control
externo con el que comparar, y el camino cuando no hay modelo específico (EMG,
señales de sensor propias). PaPaGei los usa como referencia para medir su propia
ventaja. Annotix ya cubre este terreno parcialmente con `tsai` (PatchTST,
InceptionTime, ROCKET, TST) y `pytorch_forecasting` (TFT, N-BEATS, NHiTS,
DeepAR).

---

## 2. Lo que falta en el esquema antes de que nada de esto funcione

Esta es la parte que no se puede saltar. `TimeSeriesEntry`
(`store/project_file.rs:175-208`) tiene: `id`, `name`, `data`, `pointCount`,
`seriesCount`, `columns`, `annotations`, `uploaded`, `annotated`, `status`.

**No tiene frecuencia de muestreo.** Ni unidades, ni montaje de canales. Y todos
los modelos de arriba la necesitan como entrada obligatoria: un ECG a 500 Hz y
otro a 250 Hz son tensores distintos para el mismo modelo, y un EEG sin montaje
10-20 no se puede alinear con los canales que el modelo preentrenado espera.

Requisitos mínimos de esquema, todos **opcionales y retrocompatibles** — un
proyecto de serie temporal genérico nunca los ve:

| Campo | Para qué |
|---|---|
| `sampleRate` (Hz) | Remuestreo al que el modelo fue preentrenado. Sin esto, ningún preset de biosañal puede correr sin adivinar |
| `channels: [{ name, unit, type }]` | Montaje. `name` con nomenclatura 10-20 en EEG (`Fp1`, `C3`…) o derivación en ECG (`I`, `II`, `V1`…); `type` distingue eeg/ecg/eog/emg/resp/ppg en un registro polisomnográfico |
| `signalType` | `ecg` \| `eeg` \| `ppg` \| `emg` \| `eog` \| `resp` \| `other`. Es lo que permite filtrar el catálogo por señal, igual que la modalidad filtra el catálogo de imagen |
| `subjectId` | Ya previsto en la etapa 2 del roadmap. En señales es más crítico que en imagen: un registro Holter de 24 h del mismo paciente produce miles de ventanas y sin agrupar por sujeto la fuga es masiva |
| `recordedAt`, `deviceModel` | Población y subgrupos del contrato de modelo |

Dos notas de implementación:

- La **ventana** (longitud del segmento que entra al modelo, con su solape) es
  parámetro del preset, no del dato. Los modelos de EEG suelen esperar épocas de
  30 s; los de ECG, 10 s de 12 derivaciones.
- El agrupamiento del split debe ser **por registro y por sujeto**, no por
  ventana. Este es el mismo defecto que la etapa 1 del roadmap corrige para
  fotogramas de video, y en señales es más grave: ventanas solapadas del mismo
  registro en train y test hacen que cualquier métrica sea ficción.

---

## 3. Presets propuestos

Nomenclatura `bio_sig_*`. Las validaciones son **avisos, no bloqueos**, igual que
en la Fase 3: lo que cae si no se cumplen es el nivel de evidencia del contrato.

| Nombre | Modelo base | Tarea (ProjectType) | Señal | Validaciones (avisos) |
|---|---|---|---|---|
| **ECG — clasificación diagnóstica** | ECG-FM · ECGFounder · línea base `tsai` | `timeseries-classification` (`ts_classify`) | ECG 12 derivaciones | sujeto · split por registro · test · `sampleRate` · derivaciones declaradas · acuerdo |
| **ECG — detección de eventos** | ECG-FM con cabeza de eventos · línea base `tsai` | `event-detection` (`ts_event`) | ECG | idem + longitud de ventana declarada |
| **ECG — regresión clínica** (edad-ECG, FEVI) | ECG-FM | `timeseries-regression` (`ts_regress`) | ECG | idem + Bland-Altman contra el patrón de referencia |
| **EEG — clasificación** (normal/anormal, BCI) | CBraMod · LaBraM-Base · EEGPT · **BIOT (preset liviano, 3.2 M)** | `timeseries-classification` | EEG | sujeto · split por registro · test · `sampleRate` · montaje declarado · acuerdo |
| **EEG — segmentación temporal** (estadificación de sueño, crisis) | SleepGPT · U-Sleep · **YASA (línea base CPU)** | `timeseries-segmentation` (`ts_segment`) | EEG, PSG multicanal | idem + época de 30 s · acuerdo entre puntuadores |
| **EEG — detección de eventos** (husos, complejos K, inicio de crisis) | CBraMod · BIOT | `event-detection` | EEG | idem + tolerancia temporal del acierto declarada |
| **PPG — clasificación y regresión** | PaPaGei | `timeseries-classification` / `timeseries-regression` | PPG | sujeto · split por registro · test · `sampleRate` |
| **Señal genérica** (EMG, sensor propio) | `tsai` · `pytorch_forecasting` actuales | los 9 tipos de serie | cualquiera | sujeto · split por registro · test |

Un detalle que no es cosmético: en estadificación de sueño y en lectura de EEG el
**acuerdo entre puntuadores humanos es el techo del modelo**, no un adorno del
informe. El propio modelo multimodal de Nature Medicine reporta F1 de 0.70-0.78,
que está en el rango del acuerdo entre expertos humanos. Un preset que reporte
0.85 sin haber medido el acuerdo del corpus está reportando sobreajuste, y el
contrato de la etapa 8 es el lugar donde eso queda a la vista.

---

## 4. Costo de integración, de menor a mayor

1. **Líneas base (casi gratis).** YASA es scikit-learn: entra por el backend
   `sklearn` que ya existe. Es la comparación honesta contra la que medir todo lo
   demás, y sirve desde el primer día.
2. **Campos de esquema** (`sampleRate`, `channels`, `signalType`). Migración
   pequeña, opcional, retrocompatible — y **precondición de todo lo que sigue**.
3. **Backend `braindecode` (una vez, once modelos).** El mejor retorno del
   addendum. Mismo patrón que `smp`: un preparador declarando rutas por el
   contrato `training/contract.rs`, un generador de script, un smoke test en CPU
   real. Empezar por **BIOT**, que con 3.2 M de parámetros entrena en CPU y hace
   verificable el camino completo antes de tocar modelos de 390 M.
4. **Backend ECG (modelo por modelo).** Sin librería paraguas: ECG-FM primero
   (pesos abiertos, benchmark propio), los demás según licencia.
5. **PaPaGei y modelos de sueño.** Repositorios individuales, cada uno con su
   formato de entrada. Lo último.

**Riesgo a verificar antes de prometer nada**, y no es teórico: que
`braindecode[hub]` y las dependencias de ECG-FM instalen sobre el entorno
micromamba actual con torch 2.x. Es exactamente donde murieron OpenMMLab y
Detectron2 (`docs/roadmap_train.md`: mmcv y detectron2 no son instalables sobre
torch 2.x + numpy 2, y sus backends nunca entrenaron). La regla que salió de ese
episodio se aplica igual aquí: **ningún backend se publica sin un entrenamiento
real en CPU de punta a punta** (`scripts/train_smoke.sh`), no un `import` que no
falla. Esto queda marcado como **no verificado con la información actual**: no se
instaló ninguna de estas librerías en esta pasada.

**Trabas de licencia y acceso, para resolver en la UI y no con un error de red:**
HuBERT-ECG es CC BY-NC 4.0 (no comercial); de LaBraM solo hay pesos Base; LUNA
exige elegir `filename`; algunos checkpoints del Hub están restringidos y piden
token de HuggingFace. El preset debe declarar licencia y vía de acceso de su
modelo base, y el contrato de modelo debe heredarlo — un modelo entrenado a
partir de pesos no comerciales arrastra esa condición al despliegue.

---

## 5. Qué entra al selector de dominio

En la Fase 3 el paso posterior a "biomédico" era **modalidad** (CT, MRI, RX,
microscopía, WSI, retina, OCT, ultrasonido). Con este addendum ese paso admite
también las señales: **ECG, EEG, PSG, PPG, EMG**. El tipo de proyecto ya
distingue imagen de serie temporal, así que la lista de modalidades se filtra
sola: un proyecto `timeseries-classification` nunca ve "WSI", y un proyecto
`bbox` nunca ve "ECG". El resto del flujo —chequeos no bloqueantes, nivel de
evidencia, contrato autogenerado— es idéntico al de imagen.

---

## Fuentes

- [ECG-FM: an open electrocardiogram foundation model (JAMIA Open 2025)](https://academic.oup.com/jamiaopen/article/8/5/ooaf122/8287827) · [arXiv](https://arxiv.org/abs/2408.05178) · [repo](https://github.com/bowang-lab/ecg-fm)
- [ECGFounder (NEJM AI 2025)](https://github.com/PKUDigitalHealth/ECGFounder) · [pesos en HuggingFace](https://huggingface.co/PKUDigitalHealth/ECGFounder)
- [HuBERT-ECG](https://github.com/Edoar-do/HuBERT-ECG) · [pesos, CC BY-NC 4.0](https://huggingface.co/Edoardo-BS)
- [Benchmarking ECG FMs: A Reality Check Across Clinical Tasks (2025)](https://arxiv.org/pdf/2509.25095)
- [Braindecode — carga de modelos fundacionales preentrenados](https://braindecode.org/dev/auto_examples/model_building/plot_load_pretrained_models.html) · [API](https://braindecode.org/stable/api.html)
- [CBraMod (ICLR 2025)](https://proceedings.iclr.cc/paper_files/paper/2025/file/bbbd6d915cb90be21c1254a82d45cedd-Paper-Conference.pdf) · [repo](https://github.com/wjq-learning/cbramod) · [checkpoint](https://huggingface.co/braindecode/CBraMod)
- [EEG-FM-Benchmark](https://github.com/Dingkun0817/EEG-FM-Benchmark) · [AdaBrain-Bench (2025)](https://arxiv.org/pdf/2507.09882)
- [PaPaGei: Open Foundation Models for Optical Physiological Signals (ICLR 2025)](https://github.com/nokia-bell-labs/papagei-foundation-model) · [arXiv](https://arxiv.org/html/2410.20542v1)
- [A multimodal sleep foundation model for disease prediction (Nature Medicine 2025)](https://www.nature.com/articles/s41591-025-04133-4)
- [SleepGPT: a unified time-frequency foundation model for sleep decoding (Nature Communications 2025)](https://www.nature.com/articles/s41467-025-67970-4)
- [YASA: an open-source, high-performance tool for automated sleep staging (eLife 2021)](https://elifesciences.org/articles/70092)
