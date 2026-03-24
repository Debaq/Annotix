#!/usr/bin/env bash
# bump-version.sh - Sincroniza la versión desde VERSION a todos los archivos
#
# Uso:
#   ./scripts/bump-version.sh           # Lee VERSION actual y sincroniza
#   ./scripts/bump-version.sh 2.1.1     # Actualiza VERSION y sincroniza
#   ./scripts/bump-version.sh patch     # Incrementa patch: 2.1.0 → 2.1.1
#   ./scripts/bump-version.sh minor     # Incrementa minor: 2.1.0 → 2.2.0
#   ./scripts/bump-version.sh major     # Incrementa major: 2.1.0 → 3.0.0

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
VERSION_FILE="$ROOT/VERSION"

if [ ! -f "$VERSION_FILE" ]; then
  echo "ERROR: No se encontró $VERSION_FILE"
  exit 1
fi

CURRENT=$(tr -d '[:space:]' < "$VERSION_FILE")

if [ $# -ge 1 ]; then
  case "$1" in
    patch)
      IFS='.' read -r major minor patch <<< "$CURRENT"
      NEW="$major.$minor.$((patch + 1))"
      ;;
    minor)
      IFS='.' read -r major minor patch <<< "$CURRENT"
      NEW="$major.$((minor + 1)).0"
      ;;
    major)
      IFS='.' read -r major minor patch <<< "$CURRENT"
      NEW="$((major + 1)).0.0"
      ;;
    *)
      # Versión explícita
      if [[ "$1" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
        NEW="$1"
      else
        echo "ERROR: Versión inválida '$1'. Usa X.Y.Z, patch, minor o major"
        exit 1
      fi
      ;;
  esac
  echo "$NEW" > "$VERSION_FILE"
  echo "VERSION: $CURRENT → $NEW"
  CURRENT="$NEW"
else
  echo "VERSION: $CURRENT (sincronizando)"
fi

# --- Sincronizar en todos los archivos ---

# 1. package.json
if [ -f "$ROOT/package.json" ]; then
  sed -i "s/\"version\": \"[^\"]*\"/\"version\": \"$CURRENT\"/" "$ROOT/package.json"
  echo "  ✓ package.json"
fi

# 2. src-tauri/Cargo.toml
if [ -f "$ROOT/src-tauri/Cargo.toml" ]; then
  sed -i "0,/^version = \".*\"/s/^version = \".*\"/version = \"$CURRENT\"/" "$ROOT/src-tauri/Cargo.toml"
  echo "  ✓ src-tauri/Cargo.toml"
fi

# 3. src-tauri/tauri.conf.json
if [ -f "$ROOT/src-tauri/tauri.conf.json" ]; then
  sed -i "s/\"version\": \"[^\"]*\"/\"version\": \"$CURRENT\"/" "$ROOT/src-tauri/tauri.conf.json"
  echo "  ✓ src-tauri/tauri.conf.json"
fi

echo ""
echo "Versión $CURRENT sincronizada en todos los archivos."
echo "Para hacer release: git add -A && git commit -m 'chore: bump version to $CURRENT' && git tag v$CURRENT && git push --tags"
