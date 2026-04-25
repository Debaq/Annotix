#!/usr/bin/env bash
# Descarga binarios de pdfium (bblanchon/pdfium-binaries) y los coloca en
# src-tauri/resources/pdfium/ para que Tauri los bundlee en el build final.
#
# Uso:
#   ./scripts/download-pdfium.sh           # detecta plataforma actual
#   ./scripts/download-pdfium.sh win       # fuerza windows x64
#   ./scripts/download-pdfium.sh linux     # fuerza linux x64
#   ./scripts/download-pdfium.sh all       # descarga ambos
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
DEST="$ROOT_DIR/src-tauri/resources/pdfium"
mkdir -p "$DEST"

VERSION="chromium/7202"
BASE_URL="https://github.com/bblanchon/pdfium-binaries/releases/download/$VERSION"

download_linux() {
    echo ">> Descargando pdfium linux x64..."
    local tmp; tmp="$(mktemp -d)"
    curl -fL "$BASE_URL/pdfium-linux-x64.tgz" -o "$tmp/pdfium.tgz"
    tar -xzf "$tmp/pdfium.tgz" -C "$tmp"
    cp "$tmp/lib/libpdfium.so" "$DEST/libpdfium.so"
    rm -rf "$tmp"
    echo ">> $DEST/libpdfium.so"
}

download_win() {
    echo ">> Descargando pdfium win x64..."
    local tmp; tmp="$(mktemp -d)"
    curl -fL "$BASE_URL/pdfium-win-x64.tgz" -o "$tmp/pdfium.tgz"
    tar -xzf "$tmp/pdfium.tgz" -C "$tmp"
    cp "$tmp/bin/pdfium.dll" "$DEST/pdfium.dll"
    rm -rf "$tmp"
    echo ">> $DEST/pdfium.dll"
}

target="${1:-auto}"
if [ "$target" = "auto" ]; then
    case "$(uname -s)" in
        Linux*)   target="linux" ;;
        MINGW*|MSYS*|CYGWIN*) target="win" ;;
        *)        echo "Plataforma no soportada"; exit 1 ;;
    esac
fi

case "$target" in
    linux) download_linux ;;
    win)   download_win ;;
    all)   download_linux; download_win ;;
    *)     echo "Target desconocido: $target"; exit 1 ;;
esac

echo "Listo. Binarios en $DEST"
