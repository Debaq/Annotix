#!/usr/bin/env bash
# Smoke tests de entrenamiento: corre de verdad el train.py generado de cada backend
# sobre un proyecto sintético (4 imágenes de 64×64, 2 épocas, CPU) y verifica que
# emite métricas por época y deja pesos en disco.
#
# Uso:
#   scripts/train_smoke.sh              # todos los backends
#   scripts/train_smoke.sh yolo         # sólo los que contengan "yolo" en el nombre
#   ANNOTIX_TEST_PYTHON=/ruta/python scripts/train_smoke.sh
#
# El criterio de éxito está en src-tauri/src/training/smoke_tests.rs.
set -uo pipefail

cd "$(dirname "$0")/.." || exit 1

FILTRO="${1:-smoke_}"

if [[ -z "${ANNOTIX_TEST_PYTHON:-}" ]]; then
  CANDIDATO="$HOME/.local/share/annotix/python-env/bin/python"
  if [[ -x "$CANDIDATO" ]]; then
    export ANNOTIX_TEST_PYTHON="$CANDIDATO"
  else
    echo "No se encontró el entorno Python de Annotix."
    echo "Configúralo desde la app o exporta ANNOTIX_TEST_PYTHON=/ruta/al/python"
    exit 1
  fi
fi

echo "Python: $ANNOTIX_TEST_PYTHON"
"$ANNOTIX_TEST_PYTHON" -c "import sys, torch; print(f'torch {torch.__version__} · python {sys.version.split()[0]} · cuda={torch.cuda.is_available()}')" 2>/dev/null \
  || echo "(torch no disponible: los backends que lo requieran fallarán)"
echo

cd src-tauri || exit 1

# --test-threads=1: dos entrenamientos a la vez en CPU se pelean por los núcleos
# y disparan timeouts que no son fallos reales.
cargo test --lib "$FILTRO" -- --ignored --test-threads=1 --nocapture
ESTADO=$?

echo
if [[ $ESTADO -eq 0 ]]; then
  echo "Smoke tests OK."
else
  echo "Smoke tests con fallos (estado $ESTADO). Arriba está la salida de cada backend."
fi
exit $ESTADO
