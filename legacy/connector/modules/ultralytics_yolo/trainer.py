"""
Trainer para Ultralytics YOLO
Implementa entrenamiento completo con YOLO para detección, segmentación, clasificación y pose.
"""

import os
import yaml
import shutil
from pathlib import Path
from datetime import datetime


def train(config, dataset_path, progress_callback=None):
    """
    Entrena un modelo YOLO con la configuración proporcionada.

    Args:
        config (dict): Configuración de entrenamiento desde la PWA
        dataset_path (str): Ruta al dataset con imágenes y labels
        progress_callback (function): Callback para reportar progreso
    """

    try:
        # Importar Ultralytics (se maneja aquí para lazy loading)
        from ultralytics import YOLO

        if progress_callback:
            progress_callback(progress=5, epoch=0, message="Inicializando...")

        # Extraer configuración
        model_name = config.get('model', 'yolov8n')
        epochs = config.get('epochs', 100)
        batch = config.get('batch', 16)
        imgsz = config.get('imgsz', 640)
        device = config.get('device', 'auto')
        lr = config.get('lr', 0.001)
        optimizer = config.get('optimizer', 'Adam')
        project_name = config.get('projectName', 'annotix_project')
        classes = config.get('classes', [])

        # Determinar tipo de proyecto y sufijo del modelo
        project_type = config.get('projectType', 'bbox')
        model_suffix_map = {
            'bbox': '',  # YOLOv8n para detección
            'mask': '-seg',  # YOLOv8n-seg para segmentación
            'classification': '-cls',  # YOLOv8n-cls para clasificación
            'keypoints': '-pose',  # YOLOv8n-pose para pose
        }

        model_suffix = model_suffix_map.get(project_type, '')
        full_model_name = f"{model_name}{model_suffix}.pt"

        print(f"[TRAIN] Modelo: {full_model_name}")
        print(f"[TRAIN] Dataset: {dataset_path}")
        print(f"[TRAIN] Epochs: {epochs}, Batch: {batch}, ImgSz: {imgsz}")

        if progress_callback:
            progress_callback(progress=10, epoch=0, message="Preparando dataset...")

        # Validar estructura del dataset
        dataset_path = Path(dataset_path)
        if not dataset_path.exists():
            raise Exception(f"Dataset path no existe: {dataset_path}")

        # Crear data.yaml
        data_yaml_path = dataset_path / "data.yaml"

        # Buscar subdirectorios comunes de YOLO
        train_images = dataset_path / "images" / "train"
        val_images = dataset_path / "images" / "val"

        # Si no existen, asumir que images/ está en la raíz
        if not train_images.exists():
            train_images = dataset_path / "images"

        if not val_images.exists():
            val_images = dataset_path / "images"

        # Crear data.yaml
        data_config = {
            'path': str(dataset_path.absolute()),
            'train': 'images/train' if (dataset_path / "images" / "train").exists() else 'images',
            'val': 'images/val' if (dataset_path / "images" / "val").exists() else 'images',
            'names': {i: cls['name'] for i, cls in enumerate(classes)}
        }

        with open(data_yaml_path, 'w') as f:
            yaml.dump(data_config, f, default_flow_style=False)

        print(f"[TRAIN] data.yaml creado: {data_yaml_path}")
        print(f"[TRAIN] Clases: {data_config['names']}")

        if progress_callback:
            progress_callback(progress=15, epoch=0, message="Cargando modelo...")

        # Cargar modelo
        model = YOLO(full_model_name)

        if progress_callback:
            progress_callback(progress=20, epoch=0, message="Iniciando entrenamiento...")

        # Configurar parámetros de entrenamiento
        train_args = {
            'data': str(data_yaml_path),
            'epochs': epochs,
            'batch': batch,
            'imgsz': imgsz,
            'device': device,
            'optimizer': optimizer,
            'lr0': lr,
            'project': 'runs/train',
            'name': f"{project_name}_{datetime.now().strftime('%Y%m%d_%H%M%S')}",
            'exist_ok': True,
            'pretrained': True,
            'verbose': True,
        }

        # Entrenar modelo
        print(f"[TRAIN] Iniciando entrenamiento con {epochs} epochs...")

        # Custom callback para progreso
        def on_train_epoch_end(trainer):
            """Callback ejecutado al final de cada epoch"""
            current_epoch = trainer.epoch + 1
            total_epochs = trainer.epochs
            progress = int((current_epoch / total_epochs) * 80) + 20  # 20-100%

            metrics = trainer.metrics if hasattr(trainer, 'metrics') else {}
            loss = metrics.get('train/box_loss', 0) if 'train/box_loss' in metrics else 0

            message = f"Epoch {current_epoch}/{total_epochs} - Loss: {loss:.4f}"

            if progress_callback:
                progress_callback(
                    progress=progress,
                    epoch=current_epoch,
                    message=message
                )

            print(f"[TRAIN] {message}")

        # Agregar callback
        model.add_callback("on_train_epoch_end", on_train_epoch_end)

        # Entrenar
        results = model.train(**train_args)

        if progress_callback:
            progress_callback(progress=95, epoch=epochs, message="Exportando modelo...")

        # Exportar a ONNX
        try:
            model_path = model.export(format='onnx', simplify=True)
            print(f"[TRAIN] Modelo exportado a ONNX: {model_path}")
        except Exception as e:
            print(f"[WARN] No se pudo exportar a ONNX: {e}")

        if progress_callback:
            progress_callback(progress=100, epoch=epochs, message="Entrenamiento completado")

        print(f"[TRAIN] ✅ Entrenamiento completado exitosamente")
        print(f"[TRAIN] Resultados guardados en: {train_args['project']}/{train_args['name']}")

        return {
            "success": True,
            "model_path": str(model.trainer.save_dir),
            "final_metrics": results.results_dict if hasattr(results, 'results_dict') else {}
        }

    except ImportError as e:
        error_msg = f"Error importando Ultralytics: {e}\nInstala con: pip install ultralytics"
        print(f"[ERROR] {error_msg}")
        if progress_callback:
            progress_callback(progress=0, epoch=0, message=f"Error: {error_msg}")
        raise Exception(error_msg)

    except Exception as e:
        error_msg = f"Error durante entrenamiento: {str(e)}"
        print(f"[ERROR] {error_msg}")
        if progress_callback:
            progress_callback(progress=0, epoch=0, message=f"Error: {error_msg}")
        raise
