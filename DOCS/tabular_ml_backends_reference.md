# Documento de Referencia #4: ML Clásico con Datos Tabulares

**Nuevo tipo de anotación: `tabular`**

## Filosofía

Este tipo es diferente a todos los demás. No hay anotación visual — el usuario sube un CSV/Excel,
selecciona qué columna predecir (target), qué columnas usar (features), elige un modelo,
y presiona "Entrenar". Todo el preprocesamiento es automático.

```
┌─────────────────────────────────────────────────────────────────┐
│  Vista Tabular en tu App Rust                                   │
│                                                                 │
│  1. Usuario sube CSV/XLSX                                       │
│  2. App muestra tabla con preview de datos                      │
│  3. Usuario selecciona:                                         │
│     - Columna target (qué predecir)                             │
│     - Columnas features (con qué predecir) [default: todas]     │
│     - Tipo de tarea (clasificación / regresión) [auto-detect]   │
│     - Modelo (Random Forest / XGBoost / LightGBM / SVM / KNN)  │
│  4. Click "Entrenar"                                            │
│  5. Backend Python hace TODO automáticamente:                   │
│     - Detecta tipos de columna (numérica vs categórica)         │
│     - Imputa valores faltantes                                  │
│     - Escala numéricas, one-hot encode categóricas              │
│     - Split train/val                                           │
│     - Entrena modelo                                            │
│     - Calcula métricas                                          │
│     - Exporta ONNX                                              │
│  6. App muestra resultados + modelo listo para inferencia       │
└─────────────────────────────────────────────────────────────────┘
```

---

## 1. Formato de Datos de Entrada

### 1.1 Formato Universal: CSV

```csv
edad,peso_kg,presion,colesterol,fumador,genero,diabetes
45,82.3,140,220,si,M,1
32,65.1,120,180,no,F,0
58,95.0,155,260,si,M,1
28,70.2,118,190,no,F,0
```

Tu app Rust lee CSV/XLSX y lo pasa al backend Python como:

```json
{
  "data_path": "/path/to/datos.csv",
  "target_column": "diabetes",
  "feature_columns": ["edad", "peso_kg", "presion", "colesterol", "fumador", "genero"],
  "task_type": "classification",
  "model": "random_forest",
  "hyperparams": {}
}
```

### 1.2 Auto-Detección del Tipo de Tarea

El backend puede detectar automáticamente si es clasificación o regresión:

```python
import pandas as pd

def detect_task_type(df, target_col):
    y = df[target_col]
    
    # Si es string/object → clasificación siempre
    if y.dtype == 'object' or y.dtype.name == 'category':
        return "classification"
    
    # Si es numérico con pocos valores únicos → clasificación
    n_unique = y.nunique()
    if n_unique <= 20 and n_unique / len(y) < 0.05:
        return "classification"
    
    # Si no → regresión
    return "regression"
```

### 1.3 Auto-Detección de Tipos de Columna

```python
def detect_column_types(df, feature_columns):
    numeric_cols = []
    categorical_cols = []
    
    for col in feature_columns:
        if df[col].dtype in ['int64', 'float64', 'int32', 'float32']:
            # Numérica con pocos valores únicos → tratar como categórica
            if df[col].nunique() <= 10:
                categorical_cols.append(col)
            else:
                numeric_cols.append(col)
        else:
            categorical_cols.append(col)
    
    return numeric_cols, categorical_cols
```

---

## 2. Preprocesamiento Automático

### 2.1 Pipeline Completo con scikit-learn

La clave es `Pipeline` + `ColumnTransformer`. Esto encapsula TODO el preprocesamiento
junto con el modelo, así el ONNX exportado incluye la transformación de datos.

```python
import pandas as pd
import numpy as np
from sklearn.compose import ColumnTransformer
from sklearn.pipeline import Pipeline
from sklearn.impute import SimpleImputer
from sklearn.preprocessing import StandardScaler, OneHotEncoder, LabelEncoder
from sklearn.model_selection import train_test_split

def build_preprocessing_pipeline(numeric_cols, categorical_cols):
    """Construye pipeline de preprocesamiento automático."""
    
    # Pipeline para columnas numéricas
    numeric_transformer = Pipeline(steps=[
        ('imputer', SimpleImputer(strategy='median')),  # NaN → mediana
        ('scaler', StandardScaler())                     # Normalizar a media=0, std=1
    ])
    
    # Pipeline para columnas categóricas
    categorical_transformer = Pipeline(steps=[
        ('imputer', SimpleImputer(strategy='most_frequent')),  # NaN → moda
        ('onehot', OneHotEncoder(handle_unknown='ignore',      # Categorías → binario
                                  sparse_output=False))
    ])
    
    # Combinar ambos
    preprocessor = ColumnTransformer(
        transformers=[
            ('num', numeric_transformer, numeric_cols),
            ('cat', categorical_transformer, categorical_cols),
        ],
        remainder='drop'  # Descartar columnas no seleccionadas
    )
    
    return preprocessor
```

### 2.2 Qué hace cada paso

| Paso | Qué resuelve | Ejemplo |
|------|-------------|---------|
| `SimpleImputer(median)` | Valores faltantes numéricos | `NaN` → `82.3` (mediana) |
| `StandardScaler` | Diferentes escalas | edad(0-100) y peso(40-150) → ambas ~(-2,+2) |
| `SimpleImputer(most_frequent)` | Valores faltantes categóricos | `NaN` → `"M"` (más frecuente) |
| `OneHotEncoder` | Texto → números | `"M"` → `[1,0]`, `"F"` → `[0,1]` |

### 2.3 Opciones de Imputación para UI

Tu app puede ofrecer al usuario opciones avanzadas (pero con defaults sensibles):

```
Valores Faltantes (numéricos):  [● Mediana  ○ Media  ○ Cero  ○ Eliminar filas]
Valores Faltantes (categóricos): [● Más frecuente  ○ Valor "desconocido"  ○ Eliminar filas]
Escalado numérico:               [● StandardScaler  ○ MinMaxScaler  ○ Ninguno]
Encoding categórico:             [● OneHot  ○ Ordinal  ○ Target Encoding]
```

Default: mediana + más frecuente + StandardScaler + OneHot. Funciona bien el 90% de las veces.

---

## 3. Modelos Disponibles

### 3.1 Catálogo de Modelos para tu App

#### CLASIFICACIÓN

| Modelo | Cuándo usarlo | Complejidad | Velocidad |
|--------|--------------|-------------|-----------|
| **Random Forest** | Default. Funciona bien casi siempre | Media | Rápido |
| **XGBoost** | Cuando RF no es suficiente. SOTA en tabular | Alta | Medio |
| **LightGBM** | Datasets grandes (>100K filas) | Alta | Muy rápido |
| **Logistic Regression** | Datos linealmente separables, interpretable | Baja | Muy rápido |
| **SVM (SVC)** | Datasets pequeños (<10K), alta dimensionalidad | Media | Lento en datos grandes |
| **KNN** | Simple, sin entrenamiento real | Baja | Rápido train, lento inference |
| **Gradient Boosting** | Similar a XGBoost, versión sklearn pura | Alta | Lento |
| **Extra Trees** | Similar a RF, más aleatorio | Media | Rápido |
| **AdaBoost** | Datos simples, evitar overfitting | Media | Medio |

#### REGRESIÓN

Los mismos modelos pero versiones de regresión:

| Modelo sklearn | Clase |
|---------------|-------|
| Random Forest | `RandomForestRegressor` |
| XGBoost | `XGBRegressor` |
| LightGBM | `LGBMRegressor` |
| Linear Regression | `LinearRegression` |
| Ridge | `Ridge` |
| Lasso | `Lasso` |
| ElasticNet | `ElasticNet` |
| SVR | `SVR` |
| KNN | `KNeighborsRegressor` |
| Gradient Boosting | `GradientBoostingRegressor` |
| Extra Trees | `ExtraTreesRegressor` |

### 3.2 Recomendación por Default

```
¿Dataset > 100K filas?
  ├─ Sí → LightGBM (más rápido en datos grandes)
  └─ No → ¿Necesitas interpretabilidad?
       ├─ Sí → Random Forest (feature importances claras)
       └─ No → XGBoost (mejor rendimiento general)
```

Para tu app, el default debería ser **Random Forest** porque:
- Funciona bien sin tuning
- No overfittea fácilmente
- Feature importances entendibles
- Exporta bien a ONNX
- Entrena rápido

---

## 4. Instalación

```bash
# Core
pip install scikit-learn pandas numpy

# Modelos adicionales
pip install xgboost lightgbm

# Exportación ONNX
pip install skl2onnx onnxmltools onnxruntime

# Opcional: auto-ML
pip install auto-sklearn  # Linux only
```

Versiones recomendadas (compatibilidad ONNX verificada):
```
scikit-learn>=1.4
xgboost>=2.0
lightgbm>=4.0
skl2onnx>=1.16
onnxmltools>=1.12
onnxruntime>=1.17
```

---

## 5. Código Completo del Backend

### 5.1 Pipeline Completo: Carga → Entrena → Métricas → ONNX

```python
"""
tabular_trainer.py — Backend completo para ML tabular
Tu app Rust llama esto vía subprocess o pyo3
"""

import json
import sys
import pandas as pd
import numpy as np
from pathlib import Path

from sklearn.compose import ColumnTransformer
from sklearn.pipeline import Pipeline
from sklearn.impute import SimpleImputer
from sklearn.preprocessing import StandardScaler, OneHotEncoder, LabelEncoder
from sklearn.model_selection import train_test_split, cross_val_score
from sklearn.metrics import (
    accuracy_score, precision_score, recall_score, f1_score,
    confusion_matrix, classification_report,
    mean_squared_error, mean_absolute_error, r2_score
)

# ============================================================
# Modelos disponibles
# ============================================================
from sklearn.ensemble import (
    RandomForestClassifier, RandomForestRegressor,
    GradientBoostingClassifier, GradientBoostingRegressor,
    ExtraTreesClassifier, ExtraTreesRegressor,
    AdaBoostClassifier, AdaBoostRegressor,
)
from sklearn.linear_model import (
    LogisticRegression, LinearRegression,
    Ridge, Lasso, ElasticNet,
)
from sklearn.svm import SVC, SVR
from sklearn.neighbors import KNeighborsClassifier, KNeighborsRegressor

# Modelos externos (instalar aparte)
try:
    from xgboost import XGBClassifier, XGBRegressor
    HAS_XGBOOST = True
except ImportError:
    HAS_XGBOOST = False

try:
    from lightgbm import LGBMClassifier, LGBMRegressor
    HAS_LIGHTGBM = True
except ImportError:
    HAS_LIGHTGBM = False


# ============================================================
# Catálogo de modelos
# ============================================================
CLASSIFIERS = {
    "random_forest": lambda hp: RandomForestClassifier(
        n_estimators=hp.get("n_estimators", 100),
        max_depth=hp.get("max_depth", None),
        min_samples_split=hp.get("min_samples_split", 2),
        min_samples_leaf=hp.get("min_samples_leaf", 1),
        random_state=42,
        n_jobs=-1,
    ),
    "extra_trees": lambda hp: ExtraTreesClassifier(
        n_estimators=hp.get("n_estimators", 100),
        max_depth=hp.get("max_depth", None),
        random_state=42,
        n_jobs=-1,
    ),
    "gradient_boosting": lambda hp: GradientBoostingClassifier(
        n_estimators=hp.get("n_estimators", 100),
        learning_rate=hp.get("learning_rate", 0.1),
        max_depth=hp.get("max_depth", 3),
        random_state=42,
    ),
    "adaboost": lambda hp: AdaBoostClassifier(
        n_estimators=hp.get("n_estimators", 100),
        learning_rate=hp.get("learning_rate", 1.0),
        random_state=42,
    ),
    "logistic_regression": lambda hp: LogisticRegression(
        C=hp.get("C", 1.0),
        max_iter=hp.get("max_iter", 1000),
        random_state=42,
    ),
    "svm": lambda hp: SVC(
        C=hp.get("C", 1.0),
        kernel=hp.get("kernel", "rbf"),
        probability=True,  # Necesario para predict_proba y ONNX
        random_state=42,
    ),
    "knn": lambda hp: KNeighborsClassifier(
        n_neighbors=hp.get("n_neighbors", 5),
        weights=hp.get("weights", "uniform"),
        n_jobs=-1,
    ),
}

REGRESSORS = {
    "random_forest": lambda hp: RandomForestRegressor(
        n_estimators=hp.get("n_estimators", 100),
        max_depth=hp.get("max_depth", None),
        random_state=42,
        n_jobs=-1,
    ),
    "extra_trees": lambda hp: ExtraTreesRegressor(
        n_estimators=hp.get("n_estimators", 100),
        max_depth=hp.get("max_depth", None),
        random_state=42,
        n_jobs=-1,
    ),
    "gradient_boosting": lambda hp: GradientBoostingRegressor(
        n_estimators=hp.get("n_estimators", 100),
        learning_rate=hp.get("learning_rate", 0.1),
        max_depth=hp.get("max_depth", 3),
        random_state=42,
    ),
    "adaboost": lambda hp: AdaBoostRegressor(
        n_estimators=hp.get("n_estimators", 100),
        learning_rate=hp.get("learning_rate", 1.0),
        random_state=42,
    ),
    "linear_regression": lambda hp: LinearRegression(),
    "ridge": lambda hp: Ridge(
        alpha=hp.get("alpha", 1.0),
    ),
    "lasso": lambda hp: Lasso(
        alpha=hp.get("alpha", 1.0),
        max_iter=hp.get("max_iter", 1000),
    ),
    "elasticnet": lambda hp: ElasticNet(
        alpha=hp.get("alpha", 1.0),
        l1_ratio=hp.get("l1_ratio", 0.5),
        max_iter=hp.get("max_iter", 1000),
    ),
    "svr": lambda hp: SVR(
        C=hp.get("C", 1.0),
        kernel=hp.get("kernel", "rbf"),
    ),
    "knn": lambda hp: KNeighborsRegressor(
        n_neighbors=hp.get("n_neighbors", 5),
        weights=hp.get("weights", "uniform"),
        n_jobs=-1,
    ),
}

# Agregar XGBoost y LightGBM si están disponibles
if HAS_XGBOOST:
    CLASSIFIERS["xgboost"] = lambda hp: XGBClassifier(
        n_estimators=hp.get("n_estimators", 100),
        learning_rate=hp.get("learning_rate", 0.1),
        max_depth=hp.get("max_depth", 6),
        use_label_encoder=False,
        eval_metric="logloss",
        random_state=42,
        n_jobs=-1,
    )
    REGRESSORS["xgboost"] = lambda hp: XGBRegressor(
        n_estimators=hp.get("n_estimators", 100),
        learning_rate=hp.get("learning_rate", 0.1),
        max_depth=hp.get("max_depth", 6),
        random_state=42,
        n_jobs=-1,
    )

if HAS_LIGHTGBM:
    CLASSIFIERS["lightgbm"] = lambda hp: LGBMClassifier(
        n_estimators=hp.get("n_estimators", 100),
        learning_rate=hp.get("learning_rate", 0.1),
        max_depth=hp.get("max_depth", -1),
        random_state=42,
        n_jobs=-1,
        verbose=-1,
    )
    REGRESSORS["lightgbm"] = lambda hp: LGBMRegressor(
        n_estimators=hp.get("n_estimators", 100),
        learning_rate=hp.get("learning_rate", 0.1),
        max_depth=hp.get("max_depth", -1),
        random_state=42,
        n_jobs=-1,
        verbose=-1,
    )


# ============================================================
# Funciones principales
# ============================================================

def detect_task_type(df, target_col):
    """Auto-detectar si es clasificación o regresión."""
    y = df[target_col]
    if y.dtype == 'object' or y.dtype.name == 'category':
        return "classification"
    n_unique = y.nunique()
    if n_unique <= 20 and n_unique / len(y) < 0.05:
        return "classification"
    return "regression"


def detect_column_types(df, feature_columns):
    """Separar columnas numéricas y categóricas automáticamente."""
    numeric_cols = []
    categorical_cols = []
    for col in feature_columns:
        if df[col].dtype in ['int64', 'float64', 'int32', 'float32']:
            if df[col].nunique() <= 10:
                categorical_cols.append(col)
            else:
                numeric_cols.append(col)
        else:
            categorical_cols.append(col)
    return numeric_cols, categorical_cols


def build_full_pipeline(model, numeric_cols, categorical_cols):
    """Pipeline completo: preprocesamiento + modelo."""
    
    transformers = []
    
    if numeric_cols:
        numeric_transformer = Pipeline(steps=[
            ('imputer', SimpleImputer(strategy='median')),
            ('scaler', StandardScaler()),
        ])
        transformers.append(('num', numeric_transformer, numeric_cols))
    
    if categorical_cols:
        categorical_transformer = Pipeline(steps=[
            ('imputer', SimpleImputer(strategy='most_frequent')),
            ('onehot', OneHotEncoder(handle_unknown='ignore', sparse_output=False)),
        ])
        transformers.append(('cat', categorical_transformer, categorical_cols))
    
    preprocessor = ColumnTransformer(
        transformers=transformers,
        remainder='drop',
    )
    
    full_pipeline = Pipeline(steps=[
        ('preprocessor', preprocessor),
        ('model', model),
    ])
    
    return full_pipeline


def compute_classification_metrics(y_true, y_pred, y_proba=None):
    """Métricas para clasificación."""
    n_classes = len(np.unique(y_true))
    average = 'binary' if n_classes == 2 else 'weighted'
    
    metrics = {
        "accuracy": float(accuracy_score(y_true, y_pred)),
        "precision": float(precision_score(y_true, y_pred, average=average, zero_division=0)),
        "recall": float(recall_score(y_true, y_pred, average=average, zero_division=0)),
        "f1": float(f1_score(y_true, y_pred, average=average, zero_division=0)),
        "confusion_matrix": confusion_matrix(y_true, y_pred).tolist(),
        "classification_report": classification_report(y_true, y_pred, output_dict=True),
    }
    return metrics


def compute_regression_metrics(y_true, y_pred):
    """Métricas para regresión."""
    metrics = {
        "mse": float(mean_squared_error(y_true, y_pred)),
        "rmse": float(np.sqrt(mean_squared_error(y_true, y_pred))),
        "mae": float(mean_absolute_error(y_true, y_pred)),
        "r2": float(r2_score(y_true, y_pred)),
    }
    return metrics


def get_feature_importances(pipeline, feature_names, numeric_cols, categorical_cols):
    """Extraer importancia de features (si el modelo lo soporta)."""
    model = pipeline.named_steps['model']
    
    if not hasattr(model, 'feature_importances_'):
        return None
    
    importances = model.feature_importances_
    
    # Reconstruir nombres de features post-preprocessing
    preprocessor = pipeline.named_steps['preprocessor']
    transformed_names = []
    
    for name, transformer, cols in preprocessor.transformers_:
        if name == 'num':
            transformed_names.extend(cols)
        elif name == 'cat':
            # OneHotEncoder genera nombres como "columna_valor"
            ohe = transformer.named_steps['onehot']
            if hasattr(ohe, 'get_feature_names_out'):
                cat_names = ohe.get_feature_names_out(cols).tolist()
            else:
                cat_names = [f"{col}_{cat}" for col, cats in zip(cols, ohe.categories_) 
                            for cat in cats]
            transformed_names.extend(cat_names)
    
    # Emparejar nombres con importancias
    if len(transformed_names) == len(importances):
        importance_dict = dict(zip(transformed_names, importances.tolist()))
        # Ordenar por importancia descendente
        importance_dict = dict(sorted(importance_dict.items(), 
                                       key=lambda x: abs(x[1]), reverse=True))
        return importance_dict
    
    return dict(zip(range(len(importances)), importances.tolist()))


# ============================================================
# Exportación ONNX
# ============================================================

def export_to_onnx(pipeline, X_sample, output_path, task_type):
    """
    Exportar pipeline completo (preprocesamiento + modelo) a ONNX.
    
    IMPORTANTE: El pipeline de sklearn incluye el preprocesamiento,
    así que el ONNX resultante acepta datos crudos directamente.
    No necesitas preprocesar en Rust.
    """
    from skl2onnx import to_onnx
    from skl2onnx.common.data_types import (
        FloatTensorType, Int64TensorType, StringTensorType, DoubleTensorType
    )
    
    # Definir tipos de input basados en los datos
    # Para sklearn pipelines con ColumnTransformer, necesitamos
    # pasar un DataFrame sample para que infiera los tipos
    
    # Método simple: convertir todo a float32
    X_float = X_sample.astype(np.float32) if X_sample.select_dtypes(include='number').shape[1] == X_sample.shape[1] else None
    
    if X_float is not None:
        # Datos puramente numéricos → simple
        initial_types = [('float_input', FloatTensorType([None, X_float.shape[1]]))]
        onx = to_onnx(pipeline, X_float[:1], initial_types=initial_types)
    else:
        # Datos mixtos → usar to_onnx con DataFrame
        # skl2onnx puede manejar DataFrames directamente
        onx = to_onnx(pipeline, X_sample[:1])
    
    with open(output_path, "wb") as f:
        f.write(onx.SerializeToString())
    
    return output_path


def export_xgboost_onnx(pipeline, X_sample, output_path):
    """Exportar pipeline con XGBoost a ONNX."""
    from skl2onnx import convert_sklearn, update_registered_converter
    from skl2onnx.common.data_types import FloatTensorType
    from skl2onnx.common.shape_calculator import (
        calculate_linear_classifier_output_shapes,
        calculate_linear_regressor_output_shapes,
    )
    
    # Registrar conversor XGBoost con skl2onnx
    if HAS_XGBOOST:
        from onnxmltools.convert.xgboost.operator_converters.XGBoost import (
            convert_xgboost,
        )
        from xgboost import XGBClassifier, XGBRegressor
        
        update_registered_converter(
            XGBClassifier,
            'XGBoostXGBClassifier',
            calculate_linear_classifier_output_shapes,
            convert_xgboost,
            options={'nocl': [True, False], 'zipmap': [True, False, 'columns']},
        )
        update_registered_converter(
            XGBRegressor,
            'XGBoostXGBRegressor',
            calculate_linear_regressor_output_shapes,
            convert_xgboost,
        )
    
    initial_types = [('float_input', FloatTensorType([None, X_sample.shape[1]]))]
    onx = convert_sklearn(pipeline, initial_types=initial_types)
    
    with open(output_path, "wb") as f:
        f.write(onx.SerializeToString())
    
    return output_path


def export_lightgbm_onnx(pipeline, X_sample, output_path):
    """Exportar pipeline con LightGBM a ONNX."""
    from skl2onnx import convert_sklearn, update_registered_converter
    from skl2onnx.common.data_types import FloatTensorType
    from skl2onnx.common.shape_calculator import (
        calculate_linear_classifier_output_shapes,
        calculate_linear_regressor_output_shapes,
    )
    
    if HAS_LIGHTGBM:
        from onnxmltools.convert.lightgbm.operator_converters.LightGbm import (
            convert_lightgbm,
        )
        from lightgbm import LGBMClassifier, LGBMRegressor
        
        update_registered_converter(
            LGBMClassifier,
            'LightGbmLGBMClassifier',
            calculate_linear_classifier_output_shapes,
            convert_lightgbm,
            options={'nocl': [True, False], 'zipmap': [True, False, 'columns']},
        )
        update_registered_converter(
            LGBMRegressor,
            'LightGbmLGBMRegressor',
            calculate_linear_regressor_output_shapes,
            convert_lightgbm,
        )
    
    initial_types = [('float_input', FloatTensorType([None, X_sample.shape[1]]))]
    onx = convert_sklearn(pipeline, initial_types=initial_types)
    
    with open(output_path, "wb") as f:
        f.write(onx.SerializeToString())
    
    return output_path


# ============================================================
# Función principal (llamada desde Rust)
# ============================================================

def train_tabular_model(config):
    """
    Función principal. Recibe config dict, devuelve resultados dict.
    
    config = {
        "data_path": str,
        "target_column": str,
        "feature_columns": list[str] | None,  # None = todas excepto target
        "task_type": str | None,               # None = auto-detect
        "model": str,                          # "random_forest", "xgboost", etc.
        "hyperparams": dict,                   # {} para defaults
        "output_dir": str,
        "test_size": float,                    # default 0.2
        "cross_val_folds": int,                # default 5, 0 = desactivar
    }
    """
    
    # 1. Cargar datos
    data_path = config["data_path"]
    if data_path.endswith('.csv'):
        df = pd.read_csv(data_path)
    elif data_path.endswith(('.xlsx', '.xls')):
        df = pd.read_excel(data_path)
    elif data_path.endswith('.tsv'):
        df = pd.read_csv(data_path, sep='\t')
    elif data_path.endswith('.parquet'):
        df = pd.read_parquet(data_path)
    else:
        raise ValueError(f"Formato no soportado: {data_path}")
    
    target_col = config["target_column"]
    feature_cols = config.get("feature_columns") or [c for c in df.columns if c != target_col]
    test_size = config.get("test_size", 0.2)
    cv_folds = config.get("cross_val_folds", 5)
    
    # 2. Auto-detectar tipo de tarea
    task_type = config.get("task_type") or detect_task_type(df, target_col)
    
    # 3. Detectar tipos de columna
    numeric_cols, categorical_cols = detect_column_types(df, feature_cols)
    
    # 4. Preparar X, y
    X = df[feature_cols].copy()
    y = df[target_col].copy()
    
    # Para clasificación con labels string, encodear
    label_encoder = None
    class_names = None
    if task_type == "classification" and y.dtype == 'object':
        label_encoder = LabelEncoder()
        y = pd.Series(label_encoder.fit_transform(y), name=target_col)
        class_names = label_encoder.classes_.tolist()
    elif task_type == "classification":
        class_names = sorted(y.unique().tolist())
    
    # 5. Split train/test
    X_train, X_test, y_train, y_test = train_test_split(
        X, y, test_size=test_size, random_state=42,
        stratify=y if task_type == "classification" else None
    )
    
    # 6. Construir modelo
    model_name = config.get("model", "random_forest")
    hp = config.get("hyperparams", {})
    
    if task_type == "classification":
        if model_name not in CLASSIFIERS:
            raise ValueError(f"Modelo '{model_name}' no disponible. Opciones: {list(CLASSIFIERS.keys())}")
        model = CLASSIFIERS[model_name](hp)
    else:
        if model_name not in REGRESSORS:
            raise ValueError(f"Modelo '{model_name}' no disponible. Opciones: {list(REGRESSORS.keys())}")
        model = REGRESSORS[model_name](hp)
    
    # 7. Construir pipeline completo
    # PROBLEMA: ColumnTransformer no maneja bien datos mixtos str+float con ONNX
    # SOLUCIÓN: Convertir categóricas a string explícitamente
    for col in categorical_cols:
        X_train[col] = X_train[col].astype(str)
        X_test[col] = X_test[col].astype(str)
    
    pipeline = build_full_pipeline(model, numeric_cols, categorical_cols)
    
    # 8. Entrenar
    pipeline.fit(X_train, y_train)
    
    # 9. Predecir y evaluar
    y_pred = pipeline.predict(X_test)
    
    if task_type == "classification":
        y_proba = None
        if hasattr(pipeline, 'predict_proba'):
            try:
                y_proba = pipeline.predict_proba(X_test)
            except Exception:
                pass
        metrics = compute_classification_metrics(y_test, y_pred, y_proba)
    else:
        metrics = compute_regression_metrics(y_test, y_pred)
    
    # 10. Cross-validation (opcional)
    cv_scores = None
    if cv_folds > 0:
        scoring = 'accuracy' if task_type == "classification" else 'r2'
        try:
            # Reconstruir X completo con tipos correctos
            X_full = X.copy()
            for col in categorical_cols:
                X_full[col] = X_full[col].astype(str)
            cv_scores_array = cross_val_score(pipeline, X_full, y, cv=cv_folds, scoring=scoring)
            cv_scores = {
                "scores": cv_scores_array.tolist(),
                "mean": float(cv_scores_array.mean()),
                "std": float(cv_scores_array.std()),
                "metric": scoring,
            }
        except Exception as e:
            cv_scores = {"error": str(e)}
    
    # 11. Feature importances
    importances = get_feature_importances(pipeline, feature_cols, numeric_cols, categorical_cols)
    
    # 12. Exportar ONNX
    output_dir = Path(config.get("output_dir", "."))
    output_dir.mkdir(parents=True, exist_ok=True)
    onnx_path = str(output_dir / "model.onnx")
    
    try:
        # Para datos mixtos, necesitamos convertir todo a numérico primero
        # El pipeline ya lo hace internamente, pero para ONNX necesitamos
        # que el input sea numérico
        
        # Crear versión numérica de X para ONNX
        # Preprocesar manualmente para obtener input float
        X_preprocessed = pipeline.named_steps['preprocessor'].transform(X_test[:5])
        
        if model_name in ["xgboost"]:
            export_xgboost_onnx(pipeline, X_preprocessed, onnx_path)
        elif model_name in ["lightgbm"]:
            export_lightgbm_onnx(pipeline, X_preprocessed, onnx_path)
        else:
            export_to_onnx(pipeline, X_test, onnx_path, task_type)
        
        onnx_exported = True
    except Exception as e:
        onnx_exported = False
        onnx_path = None
        print(f"Warning: ONNX export failed: {e}", file=sys.stderr)
    
    # 13. Guardar metadatos del modelo
    metadata = {
        "task_type": task_type,
        "model": model_name,
        "hyperparams": hp,
        "feature_columns": feature_cols,
        "numeric_columns": numeric_cols,
        "categorical_columns": categorical_cols,
        "target_column": target_col,
        "class_names": class_names,
        "n_train_samples": len(X_train),
        "n_test_samples": len(X_test),
        "n_features_original": len(feature_cols),
    }
    
    metadata_path = str(output_dir / "model_metadata.json")
    with open(metadata_path, 'w') as f:
        json.dump(metadata, f, indent=2)
    
    # 14. Resultado
    result = {
        "status": "success",
        "task_type": task_type,
        "model": model_name,
        "metrics": metrics,
        "cross_validation": cv_scores,
        "feature_importances": importances,
        "onnx_exported": onnx_exported,
        "onnx_path": onnx_path,
        "metadata_path": metadata_path,
        "dataset_info": {
            "total_rows": len(df),
            "total_features": len(feature_cols),
            "numeric_features": len(numeric_cols),
            "categorical_features": len(categorical_cols),
            "missing_values": int(X.isnull().sum().sum()),
            "class_distribution": y.value_counts().to_dict() if task_type == "classification" else None,
        },
    }
    
    return result


# ============================================================
# Entry point: llamada desde Rust vía subprocess
# ============================================================
if __name__ == "__main__":
    config_path = sys.argv[1]
    with open(config_path) as f:
        config = json.load(f)
    
    result = train_tabular_model(config)
    
    # Output JSON para que Rust lo parsee
    output_path = config.get("output_dir", ".") + "/training_result.json"
    with open(output_path, 'w') as f:
        json.dump(result, f, indent=2, default=str)
    
    print(json.dumps(result, indent=2, default=str))
```

### 5.2 Ejemplo de Uso desde CLI

```bash
# Crear config
cat > config.json << 'EOF'
{
  "data_path": "pacientes.csv",
  "target_column": "diabetes",
  "feature_columns": null,
  "task_type": null,
  "model": "random_forest",
  "hyperparams": {"n_estimators": 200},
  "output_dir": "./output",
  "test_size": 0.2,
  "cross_val_folds": 5
}
EOF

# Entrenar
python tabular_trainer.py config.json
```

Output:
```json
{
  "status": "success",
  "task_type": "classification",
  "model": "random_forest",
  "metrics": {
    "accuracy": 0.87,
    "precision": 0.85,
    "recall": 0.82,
    "f1": 0.83,
    "confusion_matrix": [[45, 5], [8, 42]]
  },
  "cross_validation": {
    "mean": 0.85,
    "std": 0.03,
    "metric": "accuracy"
  },
  "feature_importances": {
    "colesterol": 0.28,
    "edad": 0.22,
    "presion": 0.18,
    "peso_kg": 0.15,
    "fumador_si": 0.12,
    "genero_M": 0.05
  },
  "onnx_exported": true,
  "onnx_path": "./output/model.onnx"
}
```

---

## 6. Exportación ONNX — Detalles por Modelo

### 6.1 Compatibilidad ONNX

| Modelo | Conversor | Incluye preprocesamiento | Notas |
|--------|----------|--------------------------|-------|
| **sklearn (RF, SVM, KNN, etc.)** | `skl2onnx.to_onnx()` | ✅ Sí, pipeline completo | 133/194 modelos soportados |
| **XGBoost** | `onnxmltools` + registro en `skl2onnx` | ✅ Sí, vía Pipeline | Registrar conversor primero |
| **LightGBM** | `onnxmltools` + registro en `skl2onnx` | ✅ Sí, vía Pipeline | Registrar conversor primero |

### 6.2 Exportación Simple (sklearn puro)

```python
from skl2onnx import to_onnx

# pipeline = Pipeline([preprocessor, model]) ya entrenado
onx = to_onnx(pipeline, X_train[:1])  # Pasar 1 sample para inferir tipos

with open("model.onnx", "wb") as f:
    f.write(onx.SerializeToString())
```

### 6.3 Verificación ONNX

```python
import onnxruntime as rt
import numpy as np

sess = rt.InferenceSession("model.onnx", providers=["CPUExecutionProvider"])

# Ver inputs/outputs
for inp in sess.get_inputs():
    print(f"Input: {inp.name}, shape: {inp.shape}, type: {inp.type}")
for out in sess.get_outputs():
    print(f"Output: {out.name}, shape: {out.shape}, type: {out.type}")

# Inferencia
input_name = sess.get_inputs()[0].name
X_sample = np.array([[45, 82.3, 140, 220, 1, 0]], dtype=np.float32)
pred = sess.run(None, {input_name: X_sample})
print(f"Predicción: {pred[0]}")    # Clase predicha
print(f"Probabilidades: {pred[1]}") # Probabilidades por clase (si aplica)
```

### 6.4 Inferencia en Rust con `ort`

```rust
use ort::{Session, Value};
use ndarray::Array2;

fn predict_tabular(model_path: &str, features: Vec<f32>, n_features: usize) -> Result<Vec<f32>> {
    let session = Session::builder()?.commit_from_file(model_path)?;
    
    let n_samples = features.len() / n_features;
    let input = Array2::from_shape_vec((n_samples, n_features), features)?;
    
    let outputs = session.run(
        ort::inputs!["float_input" => Value::from_array(input)?]?
    )?;
    
    // Output[0] = predicción (clase o valor)
    // Output[1] = probabilidades (solo clasificación)
    let predictions = outputs[0].extract_tensor::<i64>()?;
    
    Ok(predictions.view().iter().map(|&x| x as f32).collect())
}
```

**NOTA IMPORTANTE sobre ONNX con datos mixtos:**

Si el dataset tiene columnas categóricas (strings), hay dos estrategias:

**Estrategia A (Recomendada): Preprocesar en Rust, exportar solo el modelo**
```
Rust: CSV → detectar tipos → OneHot manual → array float32 → ONNX inference
```
Tu app Rust hace el OneHot encoding y pasa solo números al ONNX.

**Estrategia B: Exportar pipeline completo a ONNX**
```
ONNX acepta strings directamente (StringTensorType)
```
Más complejo pero más autocontenido. skl2onnx lo soporta pero puede fallar
con combinaciones exóticas.

**Recomendación para tu app:** Estrategia A. Guarda el `model_metadata.json`
que incluye qué columnas son numéricas, cuáles categóricas, y los valores
de OneHot. Tu app Rust usa esos metadatos para preprocesar y luego
llama al ONNX con un array de floats puro.

---

## 7. Hiperparámetros Expuestos en la UI

### 7.1 Parámetros por Modelo (para controles en tu app)

#### Random Forest / Extra Trees
```
┌──────────────────────────────────────────────────┐
│ Random Forest                                     │
│                                                   │
│ Número de árboles (n_estimators):  [100] ←slider  │
│   Rango: 10 - 1000, default: 100                  │
│                                                   │
│ Profundidad máxima (max_depth):    [Auto] ←select  │
│   Opciones: Auto, 3, 5, 10, 20, 50, None          │
│                                                   │
│ Min muestras por hoja:             [1]   ←slider   │
│   Rango: 1 - 20, default: 1                       │
└──────────────────────────────────────────────────┘
```

#### XGBoost / LightGBM / Gradient Boosting
```
┌──────────────────────────────────────────────────┐
│ XGBoost                                           │
│                                                   │
│ Número de árboles (n_estimators):  [100] ←slider  │
│   Rango: 10 - 1000, default: 100                  │
│                                                   │
│ Learning rate:                     [0.1] ←slider   │
│   Rango: 0.001 - 1.0, default: 0.1                │
│                                                   │
│ Profundidad máxima (max_depth):    [6]   ←slider   │
│   Rango: 1 - 15, default: 6                       │
└──────────────────────────────────────────────────┘
```

#### Logistic Regression / SVM
```
┌──────────────────────────────────────────────────┐
│ Logistic Regression                               │
│                                                   │
│ Regularización (C):               [1.0] ←slider   │
│   Rango: 0.001 - 100, default: 1.0 (log scale)   │
└──────────────────────────────────────────────────┘
```

#### KNN
```
┌──────────────────────────────────────────────────┐
│ K-Nearest Neighbors                               │
│                                                   │
│ Número de vecinos (K):            [5]   ←slider   │
│   Rango: 1 - 50, default: 5 (impar recomendado)  │
│                                                   │
│ Peso:                             [Uniforme] ←sel  │
│   Opciones: Uniforme, Por distancia               │
└──────────────────────────────────────────────────┘
```

### 7.2 Parámetros Globales (para todos los modelos)

```
┌──────────────────────────────────────────────────┐
│ Configuración General                             │
│                                                   │
│ Porcentaje test (%):              [20]  ←slider   │
│   Rango: 10 - 40, default: 20                    │
│                                                   │
│ Cross-validation folds:           [5]   ←select   │
│   Opciones: Ninguno, 3, 5, 10                     │
│                                                   │
│ Random seed:                      [42]  ←input    │
│   Para reproducibilidad                           │
└──────────────────────────────────────────────────┘
```

---

## 8. Métricas Mostradas en la UI

### 8.1 Clasificación

| Métrica | Qué significa (para el usuario no-programador) | Rango |
|---------|------------------------------------------------|-------|
| **Accuracy** | % de predicciones correctas | 0-100% |
| **Precision** | De los que predijo positivos, % realmente positivos | 0-100% |
| **Recall** | De los realmente positivos, % que detectó | 0-100% |
| **F1 Score** | Balance entre precision y recall | 0-100% |
| **Confusion Matrix** | Tabla visual de aciertos/errores por clase | Tabla NxN |

Mostrar en la UI:
```
┌────────────────────────────────────────────────────────────┐
│  Resultados del Entrenamiento                              │
│                                                            │
│  ✅ Accuracy: 87.0%    Precision: 85.2%                    │
│     Recall:   82.4%    F1 Score:  83.8%                    │
│                                                            │
│  Matriz de Confusión:          │  Features más importantes: │
│  ┌──────┬─────┬─────┐         │  1. colesterol    (28%)    │
│  │      │Pred0│Pred1│         │  2. edad          (22%)    │
│  ├──────┼─────┼─────┤         │  3. presion       (18%)    │
│  │Real 0│  45 │   5 │         │  4. peso_kg       (15%)    │
│  │Real 1│   8 │  42 │         │  5. fumador       (12%)    │
│  └──────┴─────┴─────┘         │                            │
│                                                            │
│  Cross-Validation: 85.0% ± 3.0% (5 folds)                 │
│                                                            │
│  [📥 Descargar ONNX]  [📊 Ver detalles]                    │
└────────────────────────────────────────────────────────────┘
```

### 8.2 Regresión

| Métrica | Qué significa | Mejor si... |
|---------|--------------|-------------|
| **R²** | % de variación explicada por el modelo | Más cercano a 1.0 |
| **RMSE** | Error promedio (mismas unidades que target) | Más bajo |
| **MAE** | Error absoluto promedio | Más bajo |

```
┌────────────────────────────────────────────────────────────┐
│  Resultados del Entrenamiento                              │
│                                                            │
│  R² Score: 0.92       (el modelo explica 92% de variación) │
│  RMSE:     3.45 kg    (error promedio: ±3.45 kg)           │
│  MAE:      2.81 kg    (error absoluto medio: 2.81 kg)      │
│                                                            │
│  Cross-Validation R²: 0.89 ± 0.04 (5 folds)               │
└────────────────────────────────────────────────────────────┘
```

---

## 9. Feature Importante: Auto-Compare

Una función muy útil para usuarios no-programadores: entrenar múltiples modelos
automáticamente y mostrar cuál es mejor.

```python
def auto_compare(config):
    """
    Entrenar todos los modelos disponibles y comparar.
    El usuario solo elige sus datos y target, y la app
    prueba todo y recomienda el mejor.
    """
    results = {}
    
    models_to_try = {
        "classification": ["random_forest", "extra_trees", "gradient_boosting",
                           "logistic_regression", "knn"],
        "regression": ["random_forest", "extra_trees", "gradient_boosting",
                       "ridge", "knn"],
    }
    
    if HAS_XGBOOST:
        for task in models_to_try:
            models_to_try[task].append("xgboost")
    if HAS_LIGHTGBM:
        for task in models_to_try:
            models_to_try[task].append("lightgbm")
    
    task_type = config.get("task_type") or detect_task_type(
        pd.read_csv(config["data_path"]), config["target_column"]
    )
    
    for model_name in models_to_try[task_type]:
        try:
            model_config = {**config, "model": model_name, "cross_val_folds": 5}
            result = train_tabular_model(model_config)
            
            if task_type == "classification":
                score = result["metrics"]["accuracy"]
            else:
                score = result["metrics"]["r2"]
            
            results[model_name] = {
                "score": score,
                "cv_mean": result.get("cross_validation", {}).get("mean"),
                "cv_std": result.get("cross_validation", {}).get("std"),
                "metrics": result["metrics"],
            }
        except Exception as e:
            results[model_name] = {"error": str(e)}
    
    # Ordenar por score
    ranked = sorted(
        [(name, data) for name, data in results.items() if "score" in data],
        key=lambda x: x[1]["score"],
        reverse=True
    )
    
    return {
        "task_type": task_type,
        "ranking": [{"model": name, **data} for name, data in ranked],
        "best_model": ranked[0][0] if ranked else None,
        "recommendation": f"Mejor modelo: {ranked[0][0]} con score {ranked[0][1]['score']:.3f}" if ranked else "No se pudo entrenar ningún modelo",
    }
```

UI:
```
┌────────────────────────────────────────────────────────────┐
│  Comparación Automática de Modelos                         │
│                                                            │
│  Ranking (por accuracy):                                   │
│                                                            │
│  🥇 XGBoost          92.3% ± 2.1%  ← RECOMENDADO          │
│  🥈 LightGBM         91.8% ± 1.9%                         │
│  🥉 Random Forest     89.5% ± 3.0%                         │
│  4. Gradient Boosting 88.2% ± 2.5%                         │
│  5. Extra Trees       87.9% ± 2.8%                         │
│  6. Logistic Reg.     78.4% ± 1.2%                         │
│  7. KNN               76.1% ± 4.3%                         │
│                                                            │
│  [🏆 Usar XGBoost]  [📊 Ver detalles de cada uno]          │
└────────────────────────────────────────────────────────────┘
```

---

## 10. Integración con tu Arquitectura Rust

### 10.1 Flujo Completo

```
Rust App (UI)
  │
  ├─ 1. Lee CSV/XLSX con crate `csv` o `calamine`
  │     → Muestra tabla preview en UI
  │
  ├─ 2. Usuario configura:
  │     - target_column
  │     - feature_columns (checkbox por columna)
  │     - model (dropdown)
  │     - hyperparams (sliders)
  │
  ├─ 3. Genera config.json
  │
  ├─ 4. Llama Python:
  │     subprocess::Command::new("python")
  │         .args(["tabular_trainer.py", "config.json"])
  │         .output()
  │
  ├─ 5. Lee training_result.json
  │     → Muestra métricas en UI
  │     → Muestra feature importances como barras
  │     → Muestra confusion matrix como heatmap
  │
  └─ 6. Inferencia con ONNX:
        - Lee model_metadata.json para saber columnas y tipos
        - Preprocesa nuevos datos según metadata
        - Carga model.onnx con crate `ort`
        - Predice
```

### 10.2 Crates Rust Relevantes

```toml
[dependencies]
csv = "1.3"               # Leer CSV
calamine = "0.26"          # Leer Excel (.xlsx, .xls)
serde = { version = "1", features = ["derive"] }
serde_json = "1"           # Config y resultados JSON
ort = "2"                  # ONNX Runtime inference
ndarray = "0.16"           # Arrays numéricos
```

### 10.3 Struct de Config en Rust

```rust
use serde::{Serialize, Deserialize};

#[derive(Serialize, Deserialize)]
pub struct TabularTrainConfig {
    pub data_path: String,
    pub target_column: String,
    pub feature_columns: Option<Vec<String>>,
    pub task_type: Option<String>,  // "classification" | "regression" | null (auto)
    pub model: String,
    pub hyperparams: serde_json::Value,
    pub output_dir: String,
    pub test_size: f64,
    pub cross_val_folds: u32,
}

#[derive(Deserialize)]
pub struct TrainingResult {
    pub status: String,
    pub task_type: String,
    pub model: String,
    pub metrics: serde_json::Value,
    pub cross_validation: Option<serde_json::Value>,
    pub feature_importances: Option<serde_json::Value>,
    pub onnx_exported: bool,
    pub onnx_path: Option<String>,
}
```

---

## 11. Consideraciones Especiales

### 11.1 Datasets Desbalanceados

Muy común en biomedicina (ej: 95% sanos, 5% enfermos).

Agregar opción en UI: `☐ Balancear clases`

```python
# Opción 1: Pesos automáticos (recomendado)
RandomForestClassifier(class_weight='balanced')
XGBClassifier(scale_pos_weight=ratio_negatives/ratio_positives)

# Opción 2: SMOTE (oversampling)
from imblearn.over_sampling import SMOTE
smote = SMOTE(random_state=42)
X_train_balanced, y_train_balanced = smote.fit_resample(X_train, y_train)
```

### 11.2 Datos con Muchas Columnas

Si el usuario sube un CSV con 500+ columnas:

```python
# Feature selection automática
from sklearn.feature_selection import SelectKBest, f_classif, f_regression

def auto_feature_selection(X, y, task_type, max_features=50):
    """Reducir features automáticamente si son demasiadas."""
    if X.shape[1] <= max_features:
        return X, list(X.columns)
    
    score_func = f_classif if task_type == "classification" else f_regression
    selector = SelectKBest(score_func=score_func, k=max_features)
    X_selected = selector.fit_transform(X, y)
    selected_cols = X.columns[selector.get_support()].tolist()
    return pd.DataFrame(X_selected, columns=selected_cols), selected_cols
```

### 11.3 Validación de Datos

Antes de entrenar, tu app debería verificar:

```python
def validate_data(df, target_col, feature_cols, task_type):
    """Validaciones antes de entrenar."""
    warnings = []
    errors = []
    
    # ¿Target tiene valores?
    if df[target_col].isnull().all():
        errors.append("La columna target está completamente vacía")
    
    # ¿Suficientes filas?
    if len(df) < 20:
        errors.append(f"Solo {len(df)} filas. Mínimo recomendado: 20")
    elif len(df) < 100:
        warnings.append(f"Solo {len(df)} filas. Resultados pueden ser poco confiables")
    
    # ¿Target con una sola clase?
    if task_type == "classification" and df[target_col].nunique() < 2:
        errors.append("El target tiene una sola clase. No hay nada que predecir")
    
    # ¿Demasiados valores faltantes?
    for col in feature_cols:
        missing_pct = df[col].isnull().mean() * 100
        if missing_pct > 90:
            warnings.append(f"Columna '{col}' tiene {missing_pct:.0f}% valores faltantes")
        if missing_pct == 100:
            errors.append(f"Columna '{col}' está completamente vacía")
    
    # ¿Columnas con un solo valor? (no aportan información)
    for col in feature_cols:
        if df[col].nunique() <= 1:
            warnings.append(f"Columna '{col}' tiene un solo valor único. No aporta información")
    
    # ¿Columnas categóricas con demasiadas categorías? (OneHot explota)
    for col in feature_cols:
        if df[col].dtype == 'object' and df[col].nunique() > 50:
            warnings.append(f"Columna '{col}' tiene {df[col].nunique()} categorías únicas. Considerar agrupar")
    
    return {"errors": errors, "warnings": warnings, "valid": len(errors) == 0}
```

### 11.4 Bioingeniería — Casos de Uso Típicos

| Caso | Target | Features típicas | Modelo recomendado |
|------|--------|-------------------|-------------------|
| Diagnóstico enfermedad | enfermo/sano (binario) | Edad, peso, labs, signos vitales | XGBoost + class_weight='balanced' |
| Severidad | leve/moderado/severo | Biomarcadores, historial | Random Forest |
| Pronóstico | días hospitalización (continuo) | Diagnóstico, edad, comorbilidades | Gradient Boosting Regressor |
| Clasificar señales | tipo_señal | Features extraídas de EMG/ECG/EEG | Random Forest o XGBoost |
| Predicción de outcomes | readmisión sí/no | Variables clínicas | LightGBM (datasets grandes) |

---

## 12. Resumen Rápido

```
FORMATOS ACEPTADOS:  CSV, TSV, XLSX, XLS, Parquet
PREPROCESAMIENTO:    100% automático (imputer + scaler + encoder)
MODELOS:             9 clasificadores + 11 regressores
EXPORTACIÓN:         ONNX (pipeline completo o solo modelo)
MÉTRICAS:            Accuracy, F1, Precision, Recall, R², RMSE, MAE
EXTRAS:              Feature importances, cross-validation, auto-compare
ONNX EXPORT:         skl2onnx (sklearn), onnxmltools (XGBoost, LightGBM)

Conversor ONNX por modelo:
  sklearn nativo  → skl2onnx.to_onnx(pipeline, X_sample)
  XGBoost         → onnxmltools + update_registered_converter + convert_sklearn
  LightGBM        → onnxmltools + update_registered_converter + convert_sklearn

Dependencias Python:
  pip install scikit-learn pandas numpy xgboost lightgbm skl2onnx onnxmltools onnxruntime

Crates Rust:
  csv, calamine, serde_json, ort, ndarray
```
