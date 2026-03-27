# Tabular Data

Annotix includes support for structured tabular data, enabling classical ML workflows directly within the application.

## Overview

The tabular data module provides:

1. **Built-in data editor** for viewing and managing structured datasets.
2. **Column selector** for choosing features and target variable.
3. **Data preview** before training.
4. **Integrated training** with scikit-learn, XGBoost, and LightGBM.

---

## Data Import

Upload CSV files containing structured data. The editor displays the data in a table format with:

- Column headers with data types.
- Scrollable rows for large datasets.
- Column selection interface for choosing features and target.

---

## Column Configuration

Before training, you select:

| Setting | Description |
|---------|-------------|
| **Feature columns** | Input variables for the model |
| **Target column** | The variable to predict |
| **Task type** | Classification or regression (auto-detected from target) |

---

## Training

### Classification Models

| Model | Description |
|-------|-------------|
| Random Forest Classifier | Ensemble of decision trees |
| XGBoost Classifier | Gradient boosting (SOTA) |
| LightGBM Classifier | Fast gradient boosting |
| Logistic Regression | Linear baseline |
| SVM Classifier | Support vector machine |
| KNN Classifier | K-nearest neighbors |
| Gradient Boosting Classifier | Sklearn gradient boosting |
| Extra Trees Classifier | Randomized trees |
| MLP Classifier | Neural network |

### Regression Models

| Model | Description |
|-------|-------------|
| Random Forest Regressor | Ensemble regression |
| XGBoost Regressor | Gradient boosting |
| LightGBM Regressor | Fast gradient boosting |
| Linear Regression | Baseline |
| Ridge Regression | L2 regularization |
| Lasso Regression | L1 regularization (feature selection) |
| SVR | Support vector regression |
| KNN Regressor | K-nearest neighbors |
| Gradient Boosting Regressor | Sklearn gradient boosting |
| Extra Trees Regressor | Randomized trees |
| MLP Regressor | Neural network |

### Hyperparameters

| Parameter | Applies To | Default |
|-----------|-----------|---------|
| `n_estimators` | Tree-based models | 100 |
| `max_depth` | Tree-based models | None (unlimited) |
| `n_neighbors` | KNN | 5 |
| `C` | SVM/SVR | 1.0 |
| `alpha` | Ridge/Lasso | 1.0 |
| `target_column` | All | Required |
| `feature_columns` | All | All non-target columns |

### Features

- **Automatic preprocessing** — handles missing values, encoding.
- **Cross-validation** — evaluates model with k-fold CV.
- **ONNX export** — exports trained model to ONNX format for deployment.

### Metrics

| Task | Metrics |
|------|---------|
| Classification | Accuracy, F1 Score, ROC-AUC |
| Regression | R2, MSE, MAE |

### Pip Packages

`scikit-learn`, `xgboost`, `lightgbm`, `pandas`, `skl2onnx`, `onnxmltools`
