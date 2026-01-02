"""
Annotix Connector - Motor Acompañante
Servidor local para entrenamiento de modelos de IA con arquitectura modular.

Desarrollado por: TecMedHub - Universidad Austral de Chile
"""

import os
import sys
import json
import time
import shutil
import zipfile
import threading
import tkinter as tk
from tkinter import filedialog
from pathlib import Path
from flask import Flask, jsonify, request
from flask_cors import CORS
import requests

# Configuración
BASE_DIR = Path(__file__).parent
MODULES_DIR = BASE_DIR / "modules"
CACHE_DIR = BASE_DIR / "cache"
CONFIG_FILE = BASE_DIR / "config.json"
MODULES_REPO = "http://tmeduca.org/annotix/modules/"

# Crear directorios necesarios
MODULES_DIR.mkdir(exist_ok=True)
CACHE_DIR.mkdir(exist_ok=True)

# Flask app
app = Flask(__name__)
CORS(app, resources={r"/*": {"origins": "*"}})

# Estado global
training_status = {
    "active": False,
    "progress": 0,
    "current_epoch": 0,
    "total_epochs": 0,
    "message": ""
}


class ModuleManager:
    """Gestiona descarga, instalación y actualización de módulos de entrenamiento"""

    def __init__(self):
        self.modules_dir = MODULES_DIR
        self.cache_dir = CACHE_DIR
        self.manifest_url = MODULES_REPO + "manifest.json"
        self.installed_modules = self.load_installed_modules()

    def load_installed_modules(self):
        """Carga lista de módulos instalados localmente"""
        installed = {}
        if not self.modules_dir.exists():
            return installed

        for module_path in self.modules_dir.iterdir():
            if module_path.is_dir() and (module_path / "__init__.py").exists():
                info_file = module_path / "module.json"
                if info_file.exists():
                    with open(info_file, 'r') as f:
                        module_info = json.load(f)
                        installed[module_path.name] = module_info

        return installed

    def get_remote_manifest(self):
        """Descarga manifest.json del servidor remoto"""
        try:
            response = requests.get(self.manifest_url, timeout=10)
            response.raise_for_status()
            return response.json()
        except Exception as e:
            print(f"Error descargando manifest: {e}")
            # Fallback a manifest local si existe
            local_manifest = self.modules_dir / "manifest.json"
            if local_manifest.exists():
                with open(local_manifest, 'r') as f:
                    return json.load(f)
            return {"modules": []}

    def check_module_available(self, module_id):
        """Verifica si un módulo está instalado o puede descargarse"""
        # Primero revisar si está instalado
        if module_id in self.installed_modules:
            return {
                "installed": True,
                "version": self.installed_modules[module_id].get("version", "unknown"),
                "update_available": False
            }

        # Si no está instalado, buscar en manifest remoto
        manifest = self.get_remote_manifest()
        for module in manifest.get("modules", []):
            if module["id"] == module_id:
                return {
                    "installed": False,
                    "available": True,
                    "version": module.get("version", "1.0.0"),
                    "download_url": module.get("download_url", "")
                }

        return {"installed": False, "available": False}

    def download_module(self, module_id, progress_callback=None):
        """Descarga e instala un módulo desde el servidor"""
        manifest = self.get_remote_manifest()
        module_info = None

        for module in manifest.get("modules", []):
            if module["id"] == module_id:
                module_info = module
                break

        if not module_info:
            raise Exception(f"Módulo {module_id} no encontrado en manifest")

        download_url = MODULES_REPO + module_info["download_url"]

        print(f"Descargando módulo: {module_id} desde {download_url}")

        # Descargar archivo ZIP
        zip_path = self.cache_dir / f"{module_id}.zip"

        try:
            response = requests.get(download_url, stream=True, timeout=30)
            response.raise_for_status()

            total_size = int(response.headers.get('content-length', 0))
            downloaded = 0

            with open(zip_path, 'wb') as f:
                for chunk in response.iter_content(chunk_size=8192):
                    if chunk:
                        f.write(chunk)
                        downloaded += len(chunk)
                        if progress_callback and total_size > 0:
                            progress = (downloaded / total_size) * 100
                            progress_callback(progress)

            # Extraer módulo
            module_path = self.modules_dir / module_id
            if module_path.exists():
                shutil.rmtree(module_path)

            with zipfile.ZipFile(zip_path, 'r') as zip_ref:
                zip_ref.extractall(self.modules_dir)

            # Limpiar ZIP
            zip_path.unlink()

            # Recargar módulos instalados
            self.installed_modules = self.load_installed_modules()

            print(f"Módulo {module_id} instalado correctamente")
            return True

        except Exception as e:
            print(f"Error descargando módulo: {e}")
            if zip_path.exists():
                zip_path.unlink()
            raise

    def load_module_trainer(self, module_id):
        """Carga dinámicamente el trainer de un módulo"""
        module_path = self.modules_dir / module_id

        if not module_path.exists():
            raise Exception(f"Módulo {module_id} no instalado")

        # Agregar módulo al path de Python
        if str(self.modules_dir) not in sys.path:
            sys.path.insert(0, str(self.modules_dir))

        # Importar módulo dinámicamente
        try:
            module = __import__(module_id)
            if hasattr(module, 'train'):
                return module.train
            else:
                raise Exception(f"Módulo {module_id} no tiene función 'train'")
        except ImportError as e:
            raise Exception(f"Error importando módulo {module_id}: {e}")


# Instancia global del ModuleManager
module_manager = ModuleManager()


def select_dataset_folder():
    """Abre diálogo nativo para seleccionar carpeta de dataset"""
    root = tk.Tk()
    root.withdraw()
    root.attributes('-topmost', True)

    print("Esperando selección de carpeta...")
    dataset_path = filedialog.askdirectory(
        title="Selecciona la carpeta de dataset con imágenes y labels"
    )
    root.destroy()

    return dataset_path


@app.route('/status', methods=['GET'])
def status():
    """Health check endpoint"""
    return jsonify({
        "online": True,
        "version": "2.0.0",
        "modules": list(module_manager.installed_modules.keys())
    })


@app.route('/modules', methods=['GET'])
def list_modules():
    """Lista módulos instalados y disponibles"""
    manifest = module_manager.get_remote_manifest()

    return jsonify({
        "installed": module_manager.installed_modules,
        "available": manifest.get("modules", [])
    })


@app.route('/modules/<module_id>/download', methods=['POST'])
def download_module(module_id):
    """Descarga e instala un módulo"""
    try:
        module_manager.download_module(module_id)
        return jsonify({
            "success": True,
            "message": f"Módulo {module_id} instalado correctamente"
        })
    except Exception as e:
        return jsonify({
            "success": False,
            "error": str(e)
        }), 500


@app.route('/entrenar', methods=['POST'])
def entrenar():
    """
    Endpoint principal de entrenamiento
    1. Recibe configuración
    2. Verifica/descarga módulo necesario
    3. Selecciona carpeta de dataset
    4. Inicia entrenamiento en background
    """
    global training_status

    try:
        config = request.json
        if not config:
            return jsonify({"error": "No configuration provided"}), 400

        # Identificar módulo necesario
        framework = config.get('framework', 'ultralytics')
        project_type = config.get('projectType', 'bbox')

        # Mapear framework a module_id
        module_map = {
            'ultralytics': 'ultralytics_yolo',
            'pytorch': 'pytorch_custom',
            'tensorflow': 'tensorflow_unet'
        }

        module_id = module_map.get(framework, 'ultralytics_yolo')

        # Verificar si módulo está instalado
        module_status = module_manager.check_module_available(module_id)

        if not module_status.get("installed"):
            # Intentar descargar módulo
            print(f"Módulo {module_id} no instalado. Descargando...")
            try:
                module_manager.download_module(module_id)
                print(f"Módulo {module_id} descargado e instalado")
            except Exception as e:
                return jsonify({
                    "error": f"Módulo {module_id} no disponible: {str(e)}",
                    "module_required": module_id,
                    "download_failed": True
                }), 400

        # Seleccionar carpeta de dataset
        dataset_path = select_dataset_folder()

        if not dataset_path:
            return jsonify({"error": "No directory selected"}), 400

        # Cargar trainer del módulo
        train_function = module_manager.load_module_trainer(module_id)

        # Iniciar entrenamiento en background
        training_status = {
            "active": True,
            "progress": 0,
            "current_epoch": 0,
            "total_epochs": config.get('epochs', 100),
            "message": "Iniciando entrenamiento..."
        }

        thread = threading.Thread(
            target=train_function,
            args=(config, dataset_path, update_training_status)
        )
        thread.daemon = True
        thread.start()

        return jsonify({
            "success": True,
            "message": "Entrenamiento iniciado en segundo plano",
            "dataset": dataset_path,
            "module": module_id,
            "config": config
        })

    except Exception as e:
        training_status["active"] = False
        return jsonify({"error": str(e)}), 500


@app.route('/training/status', methods=['GET'])
def get_training_status():
    """Obtiene el estado actual del entrenamiento"""
    return jsonify(training_status)


def update_training_status(progress=0, epoch=0, message=""):
    """Callback para actualizar estado del entrenamiento desde módulos"""
    global training_status
    training_status["progress"] = progress
    training_status["current_epoch"] = epoch
    training_status["message"] = message

    if progress >= 100:
        training_status["active"] = False


if __name__ == '__main__':
    print("=" * 60)
    print("  Annotix Connector - Motor Acompañante")
    print("  TecMedHub - Universidad Austral de Chile")
    print("=" * 60)
    print(f"\n[INFO] Módulos instalados: {list(module_manager.installed_modules.keys())}")
    print(f"[INFO] Directorio de módulos: {MODULES_DIR}")
    print(f"[INFO] Iniciando servidor en puerto 5000...")
    print(f"[INFO] Presiona Ctrl+C para detener\n")

    app.run(host='0.0.0.0', port=5000, debug=False)
