# Instrucciones de Compilación - Annotix Connector

## Motor Acompañante Modular para Entrenamiento de IA

Este documento describe cómo compilar el Motor Acompañante en ejecutables para Windows, Linux y macOS usando PyInstaller.

---

## Requisitos Previos

### 1. Python 3.10 o superior
```bash
python --version  # Debe ser >= 3.10
```

### 2. Instalar PyInstaller
```bash
pip install pyinstaller
```

### 3. Instalar dependencias del motor base
```bash
pip install -r requirements.txt
```

---

## Compilación

### Windows (.exe)

```bash
pyinstaller --onefile \
  --name "AnnotixConnector" \
  --icon=icon.ico \
  --add-data "modules;modules" \
  --hidden-import=flask \
  --hidden-import=flask_cors \
  --hidden-import=tkinter \
  --noconsole \
  motor_server.py
```

**Opciones:**
- `--onefile`: Genera un único ejecutable
- `--name`: Nombre del ejecutable
- `--icon`: Icono (crear icon.ico)
- `--add-data "modules;modules"`: Incluye carpeta modules (manifest.json)
- `--noconsole`: Sin ventana de consola (usar `--console` para debug)

**Resultado:**
```
dist/
└── AnnotixConnector.exe  (~50 MB)
```

---

### Linux (ELF Binary)

```bash
pyinstaller --onefile \
  --name "AnnotixConnector" \
  --add-data "modules:modules" \
  --hidden-import=flask \
  --hidden-import=flask_cors \
  --hidden-import=tkinter \
  motor_server.py
```

**Nota:** En Linux usa `:` en lugar de `;` para `--add-data`

**Resultado:**
```
dist/
└── AnnotixConnector  (~55 MB)
```

---

### macOS (App Bundle)

```bash
pyinstaller --onefile \
  --name "AnnotixConnector" \
  --icon=icon.icns \
  --add-data "modules:modules" \
  --hidden-import=flask \
  --hidden-import=flask_cors \
  --hidden-import=tkinter \
  --osx-bundle-identifier "cl.uach.tecmedhub.annotix" \
  motor_server.py
```

**Resultado:**
```
dist/
└── AnnotixConnector.app/
```

---

## Estructura del Ejecutable

Una vez compilado:

```
AnnotixConnector.exe (o binario equivalente)
├── Motor Base (~50MB)
│   ├── Flask Server
│   ├── Module Manager
│   ├── Tkinter GUI (file dialogs)
│   └── manifest.json (lista de módulos)
└── Al ejecutar, crea:
    ├── modules/ (módulos descargados)
    │   ├── ultralytics_yolo/
    │   ├── pytorch_custom/
    │   └── ...
    └── cache/ (archivos temporales)
```

---

## Módulos de Entrenamiento

Los módulos **NO se incluyen en el .exe base**. Se descargan bajo demanda:

1. Usuario inicia entrenamiento desde PWA
2. Motor verifica si módulo está instalado
3. Si NO → Descarga de `http://tmeduca.org/annotix/modules/`
4. Extrae y ejecuta entrenamiento

### Preparar Módulos para Distribución

Cada módulo debe empaquetarse como ZIP:

```bash
cd modules/
zip -r ultralytics_yolo.zip ultralytics_yolo/
```

Subir a servidor:
```
http://tmeduca.org/annotix/modules/
├── manifest.json
├── ultralytics_yolo.zip (500MB)
├── pytorch_custom.zip (300MB)
└── tensorflow_unet.zip (600MB)
```

---

## Instalación de Dependencias de Módulos

Cada módulo tiene su propio `requirements.txt`:

```
modules/
└── ultralytics_yolo/
    ├── __init__.py
    ├── trainer.py
    ├── module.json
    └── requirements.txt  ← Dependencias del módulo
```

El motor **NO instala dependencias automáticamente**. El usuario debe:

```bash
# Opción 1: Instalar manualmente
pip install ultralytics torch torchvision

# Opción 2: Desde requirements del módulo
pip install -r modules/ultralytics_yolo/requirements.txt
```

**Futuro:** Implementar auto-instalación con `pip` programático.

---

## Testing

### 1. Probar el ejecutable localmente

Windows:
```cmd
dist\AnnotixConnector.exe
```

Linux/macOS:
```bash
./dist/AnnotixConnector
```

### 2. Verificar endpoints

```bash
# Status check
curl http://localhost:5000/status

# Listar módulos
curl http://localhost:5000/modules

# Descargar módulo (requiere servidor remoto funcionando)
curl -X POST http://localhost:5000/modules/ultralytics_yolo/download
```

---

## Distribución

### Subir a servidor

```bash
# Windows
scp dist/AnnotixConnector.exe user@tmeduca.org:/var/www/annotix/download/connector/windows/

# Linux
scp dist/AnnotixConnector user@tmeduca.org:/var/www/annotix/download/connector/linux/

# macOS
scp -r dist/AnnotixConnector.app user@tmeduca.org:/var/www/annotix/download/connector/macos/
```

### Estructura del servidor de descarga

```
http://tmeduca.org/annotix/download/connector/
├── windows/
│   └── AnnotixConnector.exe
├── linux/
│   └── AnnotixConnector
├── macos/
│   └── AnnotixConnector.app.zip
└── modules/
    ├── manifest.json
    ├── ultralytics_yolo.zip
    └── ...
```

---

## Troubleshooting

### Error: "Failed to execute script"
- Usar `--console` para ver errores
- Verificar que `modules/manifest.json` esté incluido

### Error: "No module named 'flask'"
- Agregar `--hidden-import=flask`

### Error: Tkinter no funciona
- Instalar `python3-tk` en Linux
- Verificar que Python tenga Tkinter compilado

### Ejecutable muy grande (>200MB)
- Verificar que NO se estén incluyendo dependencias de módulos
- Usar `--exclude-module=torch --exclude-module=ultralytics`

---

## Notas Importantes

1. **NO incluir torch/ultralytics en el .exe base** → Lo descargan los módulos
2. **Manifest.json debe estar en modules/** → PyInstaller lo incluye con `--add-data`
3. **Iconos opcionales** → Crear `icon.ico` / `icon.icns` para branding
4. **Firmar ejecutables** → Para distribución pública, firmar con certificado

---

## Roadmap

- [ ] Auto-instalación de dependencias de módulos con pip
- [ ] Verificación de checksums SHA256
- [ ] Actualizaciones automáticas del motor base
- [ ] Soporte para módulos con GPU (CUDA)
- [ ] Logging estructurado

---

**Desarrollado por:** TecMedHub - Universidad Austral de Chile
**Licencia:** MIT
**Contacto:** tecmedhub@uach.cl
