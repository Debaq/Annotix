# Time Series

Annotix supports annotation of univariate and multivariate time series data for tasks like classification, forecasting, anomaly detection, and more.

## Overview

Time series support in Annotix covers:

1. **CSV Import** with automatic parsing and validation.
2. **Interactive visualization** with zoom and pan.
3. **5 annotation types** for different ML tasks.
4. **Integrated training** with 6 specialized backends.

---

## Data Import

### CSV Format

Time series data is imported from CSV files. The importer handles:

- Automatic column detection (timestamp, numeric values).
- Univariate (single value column) and multivariate (multiple value columns).
- Validation of data types and missing values.
- Preview before import.

### Data Storage

Each time series entry is stored in the project's `project.json`:

```json
{
  "id": "uuid",
  "name": "sensor_data.csv",
  "data": { /* parsed CSV data as JSON */ },
  "annotations": [ /* TsAnnotationEntry[] */ ],
  "uploaded": 1711540800000,
  "annotated": null,
  "status": "pending"
}
```

| Status | Meaning |
|--------|---------|
| `pending` | No annotations yet |
| `annotated` | Has at least one annotation |

---

## Visualization

The time series viewer provides:

- **Line chart** rendering of all data columns.
- **Zoom** — mouse wheel or pinch to zoom into regions.
- **Pan** — drag to navigate along the time axis.
- **Tooltip** — hover to see exact values at any timestamp.
- **Multi-column support** — toggle visibility of individual columns.

---

## Annotation Types

Annotix provides 5 annotation types for time series, each suited to different ML tasks.

### 1. Point

**Shortcut:** `P`

Marks a single timestamp in the series.

**Use cases:** Event markers, peaks, turning points.

### 2. Range

**Shortcut:** `R`

Selects a span between two timestamps.

**Use cases:** Activity segments, anomalous periods, classification regions.

### 3. Classification

Global label for the entire time series.

**Use cases:** Labeling an entire recording (e.g. "normal operation", "fault type A").

### 4. Event

**Shortcut:** `E`

Marks a discrete event with type and confidence.

**Use cases:** Labeled events (e.g. "machine start", "sensor spike").

### 5. Anomaly

**Shortcut:** `A`

Marks an anomalous region with score and threshold.

**Use cases:** Anomaly detection training data, outlier labeling.

---

## Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `V` | Select tool |
| `P` | Point annotation |
| `R` | Range annotation |
| `E` | Event annotation |
| `A` | Anomaly annotation |

---

## Training Backends

Time series data can be trained directly in Annotix with 6 specialized backends:

| Backend | Tasks |
|---------|-------|
| **tsai** | Classification, regression, forecasting, anomaly, segmentation, events |
| **PyTorch Forecasting** | Forecasting (TFT, N-BEATS, N-HiTS, DeepAR) |
| **PyOD** | Anomaly detection (AutoEncoder, VAE, Isolation Forest, LOF) |
| **tslearn** | Temporal clustering (K-Means with DTW, K-Shape) |
| **PyPOTS** | Missing value imputation (SAITS, BRITS, US-GAN) |
| **STUMPY** | Pattern recognition via Matrix Profile |

See [[Integrated ML Training]] for full details on each backend.

---

## Project Types

| Project Type | Description | Best Backend |
|--------------|-------------|--------------|
| `timeseries-classification` | Classify entire series | tsai |
| `timeseries-forecasting` | Predict future values | PyTorch Forecasting, tsai |
| `anomaly-detection` | Find anomalous points/ranges | PyOD, tsai |
| `timeseries-segmentation` | Segment temporal regions | tsai |
| `pattern-recognition` | Find recurring patterns | STUMPY |
| `event-detection` | Detect discrete events | tsai |
| `timeseries-regression` | Continuous value prediction | tsai |
| `clustering` | Group similar series | tslearn |
| `imputation` | Fill missing values | PyPOTS |
