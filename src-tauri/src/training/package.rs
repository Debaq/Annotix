use std::io::Write;
use std::path::Path;

use crate::store::project_file::{ProjectFile, ImageEntry};
use super::{TrainingRequest, TrainingBackend};
use super::dataset;
use super::scripts;
use super::notebook;

/// Generates a ZIP training package at output_path.
/// El ZIP es relocatable: todas las rutas al dataset son relativas al propio paquete
/// (Colab, otra PC, etc.), usando el directorio del script como anclaje.
pub fn generate_training_package(
    images_dir: &Path,
    project: &ProjectFile,
    images: &[ImageEntry],
    request: &TrainingRequest,
    output_path: &str,
) -> Result<String, String> {
    let temp_dir = tempfile::tempdir()
        .map_err(|e| format!("Error creando directorio temporal: {}", e))?;
    let pkg_dir = temp_dir.path().join("package");
    let dataset_dir = pkg_dir.join("dataset");
    std::fs::create_dir_all(&dataset_dir)
        .map_err(|e| format!("Error creando dataset dir: {}", e))?;

    // 1. Prepare dataset (escribe imágenes, labels, data.yaml con rutas absolutas)
    let dataset_path = dataset::prepare_dataset_for_backend(
        images_dir, project, images, &dataset_dir,
        request.val_split, request.test_split, &request.task, &request.backend,
    )?;

    // Absolute prefix usado por scripts/yamls generados; lo sustituimos por
    // una expresión Python resuelta en runtime a partir de `__file__`.
    let abs_ds = dataset_dir.to_string_lossy().replace('\\', "/");

    // 2. Generate scripts (con rutas absolutas del tmp) y reescribirlas relativas
    let num_classes = project.classes.len();
    let script_files = scripts::generate_train_script_for_backend(request, &dataset_path, num_classes);

    let mut train_script_rewritten = String::new();
    for (filename, content) in &script_files {
        let rewritten = if filename.ends_with(".py") {
            make_script_relative(content, &abs_ds)
        } else if filename.ends_with(".yaml") || filename.ends_with(".yml") {
            content.replace(&abs_ds, ".")
        } else {
            content.clone()
        };
        if filename == "train.py" {
            train_script_rewritten = rewritten.clone();
        }
        let path = pkg_dir.join(filename);
        std::fs::write(&path, rewritten)
            .map_err(|e| format!("Error escribiendo {}: {}", filename, e))?;
    }

    // 3. Reescribir data.yaml: remover `path:` absoluto. Ultralytics cae a
    //    `Path(yaml_file).parent` cuando falta `path:`, que es justo el
    //    dataset dir extraído. Entradas `train: images/train` etc. son
    //    relativas a ese parent — funciona en Colab y local sin tocar nada.
    let data_yaml_path = dataset_dir.join("data.yaml");
    if data_yaml_path.exists() {
        if let Ok(content) = std::fs::read_to_string(&data_yaml_path) {
            let cleaned: String = content
                .lines()
                .filter(|l| !l.trim_start().starts_with("path:"))
                .collect::<Vec<_>>()
                .join("\n");
            std::fs::write(&data_yaml_path, cleaned)
                .map_err(|e| format!("Error reescribiendo data.yaml: {}", e))?;
        }
    }

    // 4. Generate requirements.txt
    let requirements = scripts::get_requirements_for_backend(&request.backend);
    let req_content = requirements.join("\n") + "\n";
    std::fs::write(pkg_dir.join("requirements.txt"), &req_content)
        .map_err(|e| format!("Error escribiendo requirements.txt: {}", e))?;

    // 5. Nombre del ZIP y backend legible
    let zip_filename = Path::new(output_path)
        .file_name()
        .map(|s| s.to_string_lossy().to_string())
        .unwrap_or_else(|| "training_package.zip".to_string());

    let backend_name = match request.backend {
        TrainingBackend::Yolo => "YOLO",
        TrainingBackend::RtDetr => "RT-DETR",
        TrainingBackend::RfDetr => "RF-DETR",
        TrainingBackend::MmDetection => "MMDetection",
        TrainingBackend::Smp => "SMP",
        TrainingBackend::HfSegmentation => "HuggingFace Segmentation",
        TrainingBackend::MmSegmentation => "MMSegmentation",
        TrainingBackend::Detectron2 => "Detectron2",
        TrainingBackend::MmPose => "MMPose",
        TrainingBackend::MmRotate => "MMRotate",
        TrainingBackend::Timm => "timm",
        TrainingBackend::HfClassification => "HuggingFace Classification",
        TrainingBackend::Tsai => "tsai",
        TrainingBackend::PytorchForecasting => "PyTorch Forecasting",
        TrainingBackend::Pyod => "PyOD",
        TrainingBackend::Tslearn => "tslearn",
        TrainingBackend::Pypots => "PyPOTS",
        TrainingBackend::Stumpy => "STUMPY",
        TrainingBackend::Sklearn => "Scikit-learn",
    };

    // 6. Generate notebooks — uno por plataforma (Colab, Kaggle, HF, local)
    for platform in notebook::Platform::all() {
        let nb_content = notebook::script_to_notebook(
            platform,
            &format!("{} Training — {}", backend_name, request.model_id),
            &project.name,
            backend_name,
            &request.model_id,
            &request.task,
            &zip_filename,
            &requirements,
            &train_script_rewritten,
        );
        std::fs::write(pkg_dir.join(platform.filename()), &nb_content)
            .map_err(|e| format!("Error escribiendo {}: {}", platform.filename(), e))?;
    }

    // 7. Generate README
    let readme = generate_readme(
        &project.name,
        backend_name,
        &request.model_id,
        &request.task,
        &zip_filename,
        &requirements,
    );
    std::fs::write(pkg_dir.join("README.md"), &readme)
        .map_err(|e| format!("Error escribiendo README.md: {}", e))?;

    // 8. Create ZIP
    let zip_path = Path::new(output_path);
    let zip_file = std::fs::File::create(zip_path)
        .map_err(|e| format!("Error creando ZIP: {}", e))?;
    let mut zip_writer = zip::ZipWriter::new(zip_file);
    let options = zip::write::SimpleFileOptions::default()
        .compression_method(zip::CompressionMethod::Deflated);

    add_dir_to_zip(&mut zip_writer, &pkg_dir, &pkg_dir, options)?;

    zip_writer.finish()
        .map_err(|e| format!("Error finalizando ZIP: {}", e))?;

    Ok(output_path.to_string())
}

/// Inyecta un prólogo al script Python que resuelve `_ANNOTIX_DATASET_DIR`
/// relativo al propio archivo, y reescribe los literales absolutos del dataset
/// para que apunten a esa ruta. Resultado: funciona tras descomprimir el ZIP
/// en cualquier sistema (Colab incluido) sin editar nada.
fn make_script_relative(script: &str, abs_ds: &str) -> String {
    let preamble = r#"# ─────────────────────────────────────────────────────────────
# Annotix training package — relocatable path bootstrap
# Resuelve la carpeta del dataset relativa a este script para que
# el paquete funcione tras un `unzip` en cualquier máquina o en Colab.
# ─────────────────────────────────────────────────────────────
import os as _annotix_os
_ANNOTIX_PKG_DIR = _annotix_os.path.dirname(_annotix_os.path.abspath(__file__)) \
    if "__file__" in globals() else _annotix_os.getcwd()
_ANNOTIX_DATASET_DIR = _annotix_os.path.join(_ANNOTIX_PKG_DIR, "dataset")
# ─────────────────────────────────────────────────────────────

"#;
    let raw_pat = format!("r\"{}", abs_ds);
    let plain_pat = format!("\"{}", abs_ds);
    let s = script
        .replace(&raw_pat, "_ANNOTIX_DATASET_DIR + r\"")
        .replace(&plain_pat, "_ANNOTIX_DATASET_DIR + \"");
    format!("{preamble}{s}")
}

fn add_dir_to_zip(
    zip: &mut zip::ZipWriter<std::fs::File>,
    base: &Path,
    dir: &Path,
    options: zip::write::SimpleFileOptions,
) -> Result<(), String> {
    for entry in std::fs::read_dir(dir).map_err(|e| e.to_string())? {
        let entry = entry.map_err(|e| e.to_string())?;
        let path = entry.path();
        let relative = path.strip_prefix(base).map_err(|e| e.to_string())?;
        let name = relative.to_string_lossy().replace('\\', "/");

        if path.is_dir() {
            zip.add_directory(&format!("{}/", name), options)
                .map_err(|e| format!("Error adding dir to zip: {}", e))?;
            add_dir_to_zip(zip, base, &path, options)?;
        } else {
            zip.start_file(&name, options)
                .map_err(|e| format!("Error adding file to zip: {}", e))?;
            let data = std::fs::read(&path)
                .map_err(|e| format!("Error reading file {}: {}", name, e))?;
            zip.write_all(&data)
                .map_err(|e| format!("Error writing file to zip: {}", e))?;
        }
    }
    Ok(())
}

fn generate_readme(
    project_name: &str,
    backend: &str,
    model_id: &str,
    task: &str,
    zip_filename: &str,
    requirements: &[&str],
) -> String {
    let req_list = requirements.iter()
        .map(|r| format!("- `{}`", r))
        .collect::<Vec<_>>()
        .join("\n");

    format!(
r#"# {project_name} — Training Package

> Generated by **[Annotix](https://github.com/)** — professional annotation & training tool.
> Exported on-demand from the Annotix desktop app; reproducible, portable, offline-friendly.

| Field    | Value |
|----------|-------|
| Project  | **{project_name}** |
| Backend  | **{backend}** |
| Model    | `{model_id}` |
| Task     | `{task}` |
| Archive  | `{zip_filename}` |

---

## Contents

```
{zip_filename}
├── dataset/           # Training data (images, labels, data.yaml)
├── train.py           # Entry point (relocatable — uses relative paths)
├── colab_train.ipynb  # Notebook for Google Colab
├── kaggle_train.ipynb # Notebook for Kaggle Notebooks
├── hf_train.ipynb     # Notebook for HuggingFace (login + Hub upload)
├── local_train.ipynb  # Generic / local notebook
├── requirements.txt   # Python dependencies
└── README.md          # This file
```

Paths inside `train.py` and the notebook resolve **relative to the script itself**, so the package runs identically on your laptop, a server, or Google Colab — no path editing needed.

---

## Option A · Google Colab (recommended for GPU)

1. Open a fresh notebook at [colab.research.google.com](https://colab.research.google.com).
2. Upload `{zip_filename}` using the sidebar **Files** tab (or drag-and-drop).
3. Run the following in a cell (replace nothing — `{zip_filename}` is literal):

   ```python
   !unzip -o "{zip_filename}"
   %cd /content
   !pip install -r requirements.txt
   !python train.py
   ```

   Or — easier — upload the included **`colab_train.ipynb`** to Colab (`File → Upload notebook`); its first cell asks for the zip and extracts it.

4. Enable GPU: **Runtime → Change runtime type → T4 GPU** (or better).

---

## Option B · Local machine

```bash
unzip "{zip_filename}"
cd "{pkg_name}"
python -m venv .venv
source .venv/bin/activate           # Windows: .venv\Scripts\activate
pip install -r requirements.txt
python train.py
```

Or open the local notebook:

```bash
jupyter notebook local_train.ipynb
```

For Kaggle, upload the zip as a *Dataset* and open `kaggle_train.ipynb`.
For HuggingFace, use `hf_train.ipynb` (handles login and optionally pushes the weights to the Hub).

---

## Requirements

{req_list}

---

## Output

Training artifacts (weights, metrics, plots) are written **inside `dataset/`** next to the training script. Look for `dataset/train/weights/best.pt` (or backend equivalent) when training finishes.

---

*Built with [Annotix](https://github.com/). Annotate → Train → Export, all in one place.*
"#,
        project_name = project_name,
        backend = backend,
        model_id = model_id,
        task = task,
        zip_filename = zip_filename,
        pkg_name = zip_filename.trim_end_matches(".zip"),
        req_list = req_list,
    )
}
