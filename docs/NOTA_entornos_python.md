# Nota: los entornos Python que crea Annotix no tienen `pyvenv.cfg`

Fecha: 2026-10-16

Los entornos que Annotix crea (`~/.local/share/annotix/python-env`, hecho con
micromamba) son entornos **conda**, no `venv`: tienen `conda-meta/` y no tienen
`pyvenv.cfg`.

Consecuencia: las herramientas de limpieza que buscan entornos virtuales por
`pyvenv.cfg` (por ejemplo `find -name pyvenv.cfg`) **no los detectan**, y el
entorno puede ocupar más de 7 GB sin aparecer en esa búsqueda.

Para detectarlo hay que buscar `conda-meta/` (o la ruta de `python-env`
directamente). Se regenera solo desde la app (`src-tauri/src/training/python_env.rs`),
así que se puede borrar sin perder datos; el entorno de esta máquina se borró el
2026-10-16.
