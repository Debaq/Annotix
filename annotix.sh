#!/usr/bin/env bash
#
# annotix.sh - Script de gestión para Annotix
# Uso: ./annotix.sh [comando] [opciones]
# Sin argumentos: abre menú interactivo
#

set -uo pipefail

# ── Colores ──────────────────────────────────────────────────────────────────
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
MAGENTA='\033[0;35m'
WHITE='\033[1;37m'
BOLD='\033[1m'
DIM='\033[2m'
NC='\033[0m'

# ── Variables ────────────────────────────────────────────────────────────────
PROJECT_DIR="$(cd "$(dirname "$0")" && pwd)"
TAURI_DIR="$PROJECT_DIR/src-tauri"
DIST_DIR="$PROJECT_DIR/dist"
OUT_DIR="$PROJECT_DIR/out"
ANDROID_DIR="$TAURI_DIR/gen/android"
KEYSTORE_DIR="$PROJECT_DIR/.keystore"
VERSION=$(cat "$PROJECT_DIR/VERSION" 2>/dev/null | tr -d '[:space:]' || grep '"version"' "$PROJECT_DIR/package.json" | head -1 | sed 's/.*: *"\(.*\)".*/\1/')

# Detectar target dir de Cargo (respeta CARGO_TARGET_DIR y .cargo/config.toml)
_detect_cargo_target() {
    if [[ -n "${CARGO_TARGET_DIR:-}" ]]; then
        echo "$CARGO_TARGET_DIR"
    elif grep -q 'target-dir' ~/.cargo/config.toml 2>/dev/null; then
        grep 'target-dir' ~/.cargo/config.toml | head -1 | sed 's/.*= *"\(.*\)".*/\1/' | sed "s|~|$HOME|"
    else
        echo "$TAURI_DIR/target"
    fi
}
CARGO_TARGET="$(_detect_cargo_target)"
BUNDLE_DIR="$CARGO_TARGET/release/bundle"

# Busca el binario release en las ubicaciones posibles
find_binary() {
    local name="${1:-annotix}"
    for dir in "$CARGO_TARGET/release" "$TAURI_DIR/target/release"; do
        if [[ -f "$dir/$name" ]]; then
            echo "$dir/$name"
            return 0
        fi
    done
    return 1
}

# ── Funciones auxiliares ─────────────────────────────────────────────────────
info()    { echo -e "${BLUE}[INFO]${NC} $*"; }
success() { echo -e "${GREEN}[OK]${NC} $*"; }
warn()    { echo -e "${YELLOW}[WARN]${NC} $*"; }
error()   { echo -e "${RED}[ERROR]${NC} $*" >&2; }
header()  { echo -e "\n${BOLD}${CYAN}═══ $* ═══${NC}\n"; }

elapsed() {
    local start=$1
    local end=$(date +%s)
    local diff=$((end - start))
    echo "$((diff / 60))m $((diff % 60))s"
}

pause_after() {
    echo ""
    echo -e "${DIM}───────────────────────────────────────────${NC}"
    echo -e "${DIM}Presiona ENTER para volver al menú...${NC}"
    read -r
}

# ── Build info (auto-incremento + código único) ─────────────────────────────
generate_build_code() {
    local releases_json="$PROJECT_DIR/releases.json"
    local existing_codes=""
    if [[ -f "$releases_json" ]]; then
        existing_codes=$(python3 -c "
import json
with open('$releases_json') as f:
    releases = json.load(f)
for r in releases:
    print(r.get('code', ''))
" 2>/dev/null || echo "")
    fi

    local code
    while true; do
        code=$(cat /dev/urandom | tr -dc 'a-z' | head -c 5)
        if ! echo "$existing_codes" | grep -qx "$code"; then
            break
        fi
    done
    echo "$code"
}

generate_build_info() {
    local build_json="$PROJECT_DIR/build.json"
    local build_ts="$PROJECT_DIR/src/lib/buildInfo.ts"

    # Leer buildNumber actual
    local build_num=0
    if [[ -f "$build_json" ]]; then
        build_num=$(python3 -c "import json; print(json.load(open('$build_json'))['buildNumber'])" 2>/dev/null || echo 0)
    fi

    # Incrementar
    build_num=$((build_num + 1))
    local build_date
    build_date=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
    local build_code
    build_code=$(generate_build_code)

    # Escribir build.json
    cat > "$build_json" <<BJSON
{
  "buildNumber": $build_num,
  "buildCode": "$build_code",
  "lastBuildDate": "$build_date"
}
BJSON

    # Generar buildInfo.ts
    local build_commit
    build_commit=$(git -C "$PROJECT_DIR" rev-parse --short HEAD 2>/dev/null || echo "")
    cat > "$build_ts" <<BINFO
// Auto-generado por annotix.sh — no editar manualmente
export const BUILD_NUMBER = $build_num;
export const BUILD_CODE = "$build_code";
export const BUILD_DATE = "$build_date";
export const BUILD_COMMIT = "$build_commit";
BINFO

    # changelog.ts ahora se obtiene dinámicamente desde GitHub API (no necesita generarse)

    info "Build info: $build_code (#$build_num) — $build_date"
}

# ── Verificación de dependencias ─────────────────────────────────────────────
check_deps() {
    header "Verificando dependencias"
    local missing=0

    for cmd in node npm cargo rustc; do
        if command -v "$cmd" &>/dev/null; then
            success "$cmd → $(command $cmd --version 2>/dev/null | head -1)"
        else
            error "$cmd no encontrado"
            missing=1
        fi
    done

    if npx tauri --version &>/dev/null; then
        success "tauri-cli → $(npx tauri --version 2>/dev/null)"
    else
        error "tauri-cli no encontrado (npm i -D @tauri-apps/cli)"
        missing=1
    fi

    if command -v ffmpeg &>/dev/null; then
        success "ffmpeg → $(ffmpeg -version 2>/dev/null | head -1)"
    else
        warn "ffmpeg no encontrado (opcional, necesario para anotación de video)"
    fi

    if [[ $missing -eq 1 ]]; then
        error "Faltan dependencias obligatorias"
        return 1
    fi
    success "Todas las dependencias están disponibles"
}

check_android_deps() {
    header "Verificando dependencias Android"
    local missing=0

    # Android SDK
    if [[ -n "${ANDROID_HOME:-}" ]] && [[ -d "$ANDROID_HOME" ]]; then
        success "ANDROID_HOME → $ANDROID_HOME"
    elif [[ -n "${ANDROID_SDK_ROOT:-}" ]] && [[ -d "$ANDROID_SDK_ROOT" ]]; then
        success "ANDROID_SDK_ROOT → $ANDROID_SDK_ROOT"
    else
        error "ANDROID_HOME o ANDROID_SDK_ROOT no configurado"
        echo "  Instala Android Studio o configura el SDK manualmente"
        missing=1
    fi

    # NDK
    if [[ -n "${NDK_HOME:-}" ]] && [[ -d "$NDK_HOME" ]]; then
        success "NDK_HOME → $NDK_HOME"
    elif [[ -n "${ANDROID_HOME:-}" ]] && ls "$ANDROID_HOME"/ndk/*/source.properties &>/dev/null; then
        local ndk_ver
        ndk_ver=$(ls -d "$ANDROID_HOME"/ndk/*/ 2>/dev/null | tail -1)
        success "NDK → $ndk_ver"
    else
        error "Android NDK no encontrado"
        missing=1
    fi

    # Java
    if command -v java &>/dev/null; then
        success "Java → $(java -version 2>&1 | head -1)"
    else
        error "Java no encontrado (necesario JDK 17+)"
        missing=1
    fi

    # keytool
    if command -v keytool &>/dev/null; then
        success "keytool → disponible"
    else
        error "keytool no encontrado (viene con JDK)"
        missing=1
    fi

    # Rust targets
    local targets_installed
    targets_installed=$(rustup target list --installed 2>/dev/null)

    local android_targets=("aarch64-linux-android" "armv7-linux-androideabi" "x86_64-linux-android" "i686-linux-android")
    for target in "${android_targets[@]}"; do
        if echo "$targets_installed" | grep -q "$target"; then
            success "Rust target: $target"
        else
            warn "Rust target falta: $target"
        fi
    done

    # Tauri android init
    if [[ -d "$ANDROID_DIR" ]]; then
        success "Tauri Android inicializado"
    else
        warn "Tauri Android no inicializado (ejecuta 'Android init')"
    fi

    # Keystore
    if ls "$KEYSTORE_DIR"/*.keystore &>/dev/null 2>&1 || ls "$KEYSTORE_DIR"/*.jks &>/dev/null 2>&1; then
        success "Keystore encontrado en $KEYSTORE_DIR/"
    else
        warn "No hay keystore (ejecuta 'Crear keystore')"
    fi

    if [[ $missing -eq 1 ]]; then
        error "Faltan dependencias Android"
        return 1
    fi
    success "Dependencias Android disponibles"
}

# ── Instalar dependencias ────────────────────────────────────────────────────
cmd_install() {
    header "Instalando dependencias"
    info "npm install..."
    cd "$PROJECT_DIR"
    npm install
    success "Dependencias npm instaladas"
}

# ── Desarrollo ───────────────────────────────────────────────────────────────
cmd_dev() {
    header "Modo desarrollo"
    check_deps || return
    cd "$PROJECT_DIR"
    info "Iniciando Tauri en modo dev..."
    info "Cerrando la ventana de Annotix volverás al menú"
    npx tauri dev || true
}

cmd_dev_web() {
    header "Frontend dev (solo navegador)"
    cd "$PROJECT_DIR"
    info "Iniciando Vite dev server... (Ctrl+C para detener)"
    npm run dev || true
}

# ── Build frontend ───────────────────────────────────────────────────────────
cmd_build_frontend() {
    header "Build frontend"
    local start=$(date +%s)
    cd "$PROJECT_DIR"

    info "TypeScript check + Vite build..."
    npm run build

    success "Frontend compilado en $(elapsed $start)"
    info "Output: $DIST_DIR"
}

# ── Build Rust ───────────────────────────────────────────────────────────────
cmd_build_rust() {
    local mode="${1:-release}"
    header "Build Rust ($mode)"
    local start=$(date +%s)
    cd "$TAURI_DIR"

    if [[ "$mode" == "debug" ]]; then
        cargo build
    else
        cargo build --release
    fi

    success "Rust compilado en $(elapsed $start)"
}

# ── Check ────────────────────────────────────────────────────────────────────
cmd_check() {
    header "Verificación rápida"
    local start=$(date +%s)
    local errors=0

    info "TypeScript check..."
    cd "$PROJECT_DIR"
    if npx tsc --noEmit; then
        success "TypeScript OK"
    else
        error "TypeScript tiene errores"
        errors=1
    fi

    info "Cargo check..."
    cd "$TAURI_DIR"
    if cargo check; then
        success "Rust OK"
    else
        error "Rust tiene errores"
        errors=1
    fi

    if [[ $errors -eq 0 ]]; then
        success "Todo OK en $(elapsed $start)"
    else
        error "Hay errores ($(elapsed $start))"
    fi
}

# ── Lint ─────────────────────────────────────────────────────────────────────
cmd_lint() {
    header "Lint"
    local errors=0

    info "ESLint..."
    cd "$PROJECT_DIR"
    if npm run lint 2>/dev/null; then
        success "ESLint OK"
    else
        warn "ESLint reportó problemas"
        errors=1
    fi

    info "Clippy..."
    cd "$TAURI_DIR"
    if cargo clippy -- -D warnings 2>/dev/null; then
        success "Clippy OK"
    else
        warn "Clippy reportó problemas"
        errors=1
    fi

    [[ $errors -eq 0 ]] && success "Lint limpio" || warn "Revisar warnings"
}

# ── Build completo ───────────────────────────────────────────────────────────
cmd_build() {
    local targets="${1:-}"
    header "Build Annotix v$VERSION"
    check_deps || return
    local start=$(date +%s)
    cd "$PROJECT_DIR"

    generate_build_info

    if [[ -n "$targets" ]]; then
        info "Compilando paquete: $targets"
        npx tauri build --bundles "$targets"
    else
        info "Compilando todos los paquetes..."
        npx tauri build
    fi

    success "Build completo en $(elapsed $start)"
    collect_artifacts
    auto_record_release
}

# ── Solo binario (sin empaquetar) ────────────────────────────────────────────
cmd_build_bin() {
    header "Build binario (sin empaquetar)"
    check_deps || return
    local start=$(date +%s)
    cd "$PROJECT_DIR"

    generate_build_info

    info "Compilando binario con frontend embebido..."
    npx tauri build --no-bundle

    local bin="$(find_binary || echo '')"
    if [[ -f "$bin" ]]; then
        success "Binario listo en $(elapsed $start)"
        collect_artifacts
        auto_record_release
    else
        error "No se generó el binario"
    fi
}

cmd_build_deb()      { cmd_build "deb"; }
cmd_build_rpm()      { cmd_build "rpm"; }
cmd_build_appimage() { cmd_build "appimage"; }

cmd_build_debug() {
    header "Build debug"
    cd "$PROJECT_DIR"
    local start=$(date +%s)

    generate_build_info

    info "Compilando en modo debug..."
    npx tauri build --debug
    success "Build debug completo en $(elapsed $start)"
    collect_artifacts
    auto_record_release
}

# ══════════════════════════════════════════════════════════════════════════════
# ── ANDROID ──────────────────────────────────────────────────────────────────
# ══════════════════════════════════════════════════════════════════════════════

cmd_android_init() {
    header "Inicializar proyecto Android"
    cd "$PROJECT_DIR"

    if [[ -d "$ANDROID_DIR" ]]; then
        warn "Android ya está inicializado en $ANDROID_DIR"
        echo -n "  Reinicializar? (s/N): "
        read -r confirm
        if [[ "$confirm" != "s" && "$confirm" != "S" ]]; then
            info "Cancelado"
            return
        fi
    fi

    info "Instalando Rust targets para Android..."
    rustup target add aarch64-linux-android armv7-linux-androideabi x86_64-linux-android i686-linux-android

    info "Inicializando Tauri Android..."
    npx tauri android init

    if [[ -d "$ANDROID_DIR" ]]; then
        success "Proyecto Android inicializado en $ANDROID_DIR"
    else
        error "Fallo al inicializar Android"
    fi
}

cmd_android_dev() {
    header "Android dev mode"

    if [[ ! -d "$ANDROID_DIR" ]]; then
        error "Android no inicializado. Ejecuta 'Android init' primero."
        return 1
    fi

    cd "$PROJECT_DIR"
    info "Iniciando Tauri Android en modo dev..."
    info "Necesitas un emulador corriendo o un dispositivo conectado"
    npx tauri android dev || true
}

cmd_android_build_debug() {
    header "Build Android (debug)"

    if [[ ! -d "$ANDROID_DIR" ]]; then
        error "Android no inicializado. Ejecuta 'Android init' primero."
        return 1
    fi

    local start=$(date +%s)
    cd "$PROJECT_DIR"

    generate_build_info

    info "Compilando APK debug..."
    npx tauri android build --debug

    success "APK debug compilado en $(elapsed $start)"

    # Buscar APK generado
    local apk
    apk=$(find "$ANDROID_DIR" -name "*.apk" -path "*/debug/*" 2>/dev/null | head -1)
    if [[ -n "$apk" ]]; then
        echo -e "  ${BOLD}APK:${NC} $apk"
        echo -e "  ${BOLD}Tamaño:${NC} $(du -h "$apk" | cut -f1)"
    fi
    auto_record_release
}

cmd_android_build_release() {
    header "Build Android (release)"

    if [[ ! -d "$ANDROID_DIR" ]]; then
        error "Android no inicializado. Ejecuta 'Android init' primero."
        return 1
    fi

    local start=$(date +%s)
    cd "$PROJECT_DIR"

    generate_build_info

    info "Compilando APK/AAB release..."
    npx tauri android build

    success "Android release compilado en $(elapsed $start)"

    local apk aab
    apk=$(find "$ANDROID_DIR" -name "*.apk" -path "*/release/*" 2>/dev/null | head -1)
    aab=$(find "$ANDROID_DIR" -name "*.aab" 2>/dev/null | head -1)

    [[ -n "$apk" ]] && echo -e "  ${BOLD}APK:${NC} $apk ($(du -h "$apk" | cut -f1))"
    [[ -n "$aab" ]] && echo -e "  ${BOLD}AAB:${NC} $aab ($(du -h "$aab" | cut -f1))"
    auto_record_release
}

cmd_android_create_keystore() {
    header "Crear keystore para firma Android"

    mkdir -p "$KEYSTORE_DIR"

    # Verificar si ya existe
    if ls "$KEYSTORE_DIR"/*.keystore &>/dev/null 2>&1; then
        warn "Ya existe un keystore:"
        ls -la "$KEYSTORE_DIR"/*.keystore
        echo ""
        echo -n "  Crear uno nuevo? (s/N): "
        read -r confirm
        if [[ "$confirm" != "s" && "$confirm" != "S" ]]; then
            info "Cancelado"
            return
        fi
    fi

    # Datos del keystore
    echo -e "${BOLD}  Datos del certificado:${NC}"
    echo ""

    local ks_alias ks_name ks_pass ks_org ks_validity

    echo -n "  Alias (ej: annotix-release): "
    read -r ks_alias
    ks_alias="${ks_alias:-annotix-release}"

    echo -n "  Nombre completo (CN): "
    read -r ks_name
    ks_name="${ks_name:-TecMedHub}"

    echo -n "  Organización (O): "
    read -r ks_org
    ks_org="${ks_org:-TecMedHub}"

    echo -n "  Contraseña (mínimo 6 caracteres): "
    read -rs ks_pass
    echo ""
    if [[ ${#ks_pass} -lt 6 ]]; then
        error "La contraseña debe tener al menos 6 caracteres"
        return 1
    fi

    echo -n "  Validez en días (default 10000): "
    read -r ks_validity
    ks_validity="${ks_validity:-10000}"

    local ks_file="$KEYSTORE_DIR/${ks_alias}.keystore"

    info "Generando keystore..."
    keytool -genkeypair \
        -v \
        -keystore "$ks_file" \
        -alias "$ks_alias" \
        -keyalg RSA \
        -keysize 2048 \
        -validity "$ks_validity" \
        -storepass "$ks_pass" \
        -keypass "$ks_pass" \
        -dname "CN=$ks_name, O=$ks_org"

    if [[ -f "$ks_file" ]]; then
        success "Keystore creado: $ks_file"

        # Guardar propiedades para Gradle
        local props_file="$KEYSTORE_DIR/keystore.properties"
        cat > "$props_file" <<PROPS
storeFile=$ks_file
storePassword=$ks_pass
keyAlias=$ks_alias
keyPassword=$ks_pass
PROPS
        success "Propiedades guardadas: $props_file"

        echo ""
        warn "IMPORTANTE: No subas estos archivos a git!"

        # Asegurar .gitignore
        if ! grep -q ".keystore" "$PROJECT_DIR/.gitignore" 2>/dev/null; then
            echo -e "\n# Android signing\n.keystore/" >> "$PROJECT_DIR/.gitignore"
            success "Añadido .keystore/ a .gitignore"
        fi
    else
        error "Error al crear el keystore"
    fi
}

cmd_android_sign() {
    header "Firmar APK release"

    # Buscar APK sin firmar
    local apk
    apk=$(find "$ANDROID_DIR" -name "*-unsigned.apk" -o -name "*-release.apk" 2>/dev/null | head -1)

    if [[ -z "$apk" ]]; then
        error "No se encontró APK release para firmar"
        info "Compila primero con 'Build Android release'"
        return 1
    fi

    info "APK encontrado: $apk"

    # Buscar keystore
    local ks_file
    ks_file=$(find "$KEYSTORE_DIR" -name "*.keystore" 2>/dev/null | head -1)

    if [[ -z "$ks_file" ]]; then
        error "No hay keystore. Ejecuta 'Crear keystore' primero."
        return 1
    fi

    # Leer propiedades si existen
    local props_file="$KEYSTORE_DIR/keystore.properties"
    local ks_alias="" ks_pass=""

    if [[ -f "$props_file" ]]; then
        ks_alias=$(grep "keyAlias=" "$props_file" | cut -d= -f2)
        ks_pass=$(grep "storePassword=" "$props_file" | cut -d= -f2)
        info "Usando keystore: $ks_file (alias: $ks_alias)"
    else
        echo -n "  Alias del key: "
        read -r ks_alias
        echo -n "  Contraseña: "
        read -rs ks_pass
        echo ""
    fi

    local signed_apk="${apk%.apk}-signed.apk"

    # Firmar con apksigner si está disponible, sino jarsigner
    if command -v apksigner &>/dev/null; then
        info "Firmando con apksigner..."
        apksigner sign \
            --ks "$ks_file" \
            --ks-key-alias "$ks_alias" \
            --ks-pass "pass:$ks_pass" \
            --out "$signed_apk" \
            "$apk"
    elif command -v jarsigner &>/dev/null; then
        info "Firmando con jarsigner..."
        cp "$apk" "$signed_apk"
        jarsigner \
            -verbose \
            -sigalg SHA256withRSA \
            -digestalg SHA-256 \
            -keystore "$ks_file" \
            -storepass "$ks_pass" \
            "$signed_apk" \
            "$ks_alias"
    else
        error "No se encontró apksigner ni jarsigner"
        return 1
    fi

    if [[ -f "$signed_apk" ]]; then
        success "APK firmado: $signed_apk"
        echo -e "  ${BOLD}Tamaño:${NC} $(du -h "$signed_apk" | cut -f1)"

        # Verificar firma
        if command -v apksigner &>/dev/null; then
            if apksigner verify "$signed_apk" 2>/dev/null; then
                success "Firma verificada correctamente"
            else
                warn "No se pudo verificar la firma"
            fi
        fi
    else
        error "Error al firmar"
    fi
}

cmd_android_verify_sign() {
    header "Verificar firma de APK"

    local apk="${1:-}"
    if [[ -z "$apk" ]]; then
        echo -n "  Ruta al APK: "
        read -r apk
    fi

    if [[ ! -f "$apk" ]]; then
        error "Archivo no encontrado: $apk"
        return 1
    fi

    if command -v apksigner &>/dev/null; then
        info "Verificando con apksigner..."
        apksigner verify --verbose --print-certs "$apk"
    elif command -v jarsigner &>/dev/null; then
        info "Verificando con jarsigner..."
        jarsigner -verify -verbose -certs "$apk"
    elif command -v keytool &>/dev/null; then
        info "Verificando certificado con keytool..."
        keytool -printcert -jarfile "$apk"
    else
        error "No hay herramientas de verificación disponibles"
        return 1
    fi
}

cmd_android_keystore_info() {
    header "Info del keystore"

    local ks_file
    ks_file=$(find "$KEYSTORE_DIR" -name "*.keystore" -o -name "*.jks" 2>/dev/null | head -1)

    if [[ -z "$ks_file" ]]; then
        warn "No hay keystore en $KEYSTORE_DIR/"
        return
    fi

    info "Keystore: $ks_file"

    local ks_pass=""
    local props_file="$KEYSTORE_DIR/keystore.properties"
    if [[ -f "$props_file" ]]; then
        ks_pass=$(grep "storePassword=" "$props_file" | cut -d= -f2)
    else
        echo -n "  Contraseña: "
        read -rs ks_pass
        echo ""
    fi

    keytool -list -v -keystore "$ks_file" -storepass "$ks_pass" 2>/dev/null || error "Contraseña incorrecta o keystore corrupto"
}

cmd_android_list_artifacts() {
    header "Artefactos Android"

    if [[ ! -d "$ANDROID_DIR" ]]; then
        warn "Android no inicializado"
        return
    fi

    local found=0

    echo -e "${BOLD}APKs:${NC}"
    while IFS= read -r f; do
        echo -e "  ${GREEN}$(du -h "$f" | cut -f1)${NC}  $f"
        found=1
    done < <(find "$ANDROID_DIR" -name "*.apk" 2>/dev/null | sort)

    echo ""
    echo -e "${BOLD}AABs (Android App Bundle):${NC}"
    while IFS= read -r f; do
        echo -e "  ${GREEN}$(du -h "$f" | cut -f1)${NC}  $f"
        found=1
    done < <(find "$ANDROID_DIR" -name "*.aab" 2>/dev/null | sort)

    if [[ $found -eq 0 ]]; then
        warn "No hay artefactos Android generados"
    fi

    echo ""
    echo -e "${BOLD}Keystore:${NC}"
    if ls "$KEYSTORE_DIR"/*.keystore &>/dev/null 2>&1 || ls "$KEYSTORE_DIR"/*.jks &>/dev/null 2>&1; then
        ls -lh "$KEYSTORE_DIR"/*.keystore "$KEYSTORE_DIR"/*.jks 2>/dev/null
    else
        warn "No hay keystore"
    fi
}

cmd_android_install_targets() {
    header "Instalar Rust targets Android"

    info "Instalando targets..."
    rustup target add \
        aarch64-linux-android \
        armv7-linux-androideabi \
        x86_64-linux-android \
        i686-linux-android

    success "Targets instalados"
    echo ""
    info "Targets Android disponibles:"
    rustup target list --installed | grep android
}

cmd_android_clean() {
    header "Limpiar build Android"

    if [[ ! -d "$ANDROID_DIR" ]]; then
        warn "No hay proyecto Android para limpiar"
        return
    fi

    local gradle_dir="$ANDROID_DIR"
    if [[ -f "$gradle_dir/gradlew" ]]; then
        info "Ejecutando gradlew clean..."
        cd "$gradle_dir"
        ./gradlew clean
        success "Build Android limpio"
    else
        info "Eliminando carpetas build..."
        find "$ANDROID_DIR" -type d -name "build" -exec rm -rf {} + 2>/dev/null
        success "Carpetas build eliminadas"
    fi
}

# ── Recopilar artefactos en out/ ─────────────────────────────────────────────
collect_artifacts() {
    # Leer código de build actual
    local build_code=""
    if [[ -f "$PROJECT_DIR/build.json" ]]; then
        build_code=$(python3 -c "import json; print(json.load(open('$PROJECT_DIR/build.json')).get('buildCode', ''))" 2>/dev/null || echo "")
    fi
    # Prefijo para los archivos: Annotix_VERSION_CODE
    local prefix="Annotix_${VERSION}"
    if [[ -n "$build_code" ]]; then
        prefix="${prefix}_${build_code}"
    fi

    local tag
    tag="$(date '+%Y-%m-%d_%H-%M')"
    local dest="$OUT_DIR/$tag"

    mkdir -p "$dest"

    local found=0

    # Binario
    local bin="$(find_binary || echo '')"
    if [[ -f "$bin" ]]; then
        cp "$bin" "$dest/${prefix}"
        found=1
    fi

    # Paquetes — renombrar con prefijo
    if [[ -d "$BUNDLE_DIR" ]]; then
        for f in "$BUNDLE_DIR"/deb/*.deb; do
            [[ -f "$f" ]] && cp "$f" "$dest/${prefix}.deb" && found=1
        done
        for f in "$BUNDLE_DIR"/rpm/*.rpm; do
            [[ -f "$f" ]] && cp "$f" "$dest/${prefix}.rpm" && found=1
        done
        for f in "$BUNDLE_DIR"/appimage/*.AppImage; do
            [[ -f "$f" ]] && cp "$f" "$dest/${prefix}.AppImage" && found=1
        done
    fi

    if [[ $found -eq 1 ]]; then
        # Guardar info del build
        {
            echo "Annotix v$VERSION ($build_code)"
            echo "Build: $tag"
            echo "Branch: $(git -C "$PROJECT_DIR" branch --show-current 2>/dev/null || echo 'N/A')"
            echo "Commit: $(git -C "$PROJECT_DIR" log --oneline -1 2>/dev/null || echo 'N/A')"
        } > "$dest/BUILD_INFO.txt"

        success "Artefactos copiados a: $dest"
        echo ""
        ls -lh "$dest" | tail -n +2
    else
        # Carpeta vacía, eliminar
        rmdir "$dest" 2>/dev/null
        warn "No se encontraron artefactos para copiar"
    fi
}

# ── Listar artefactos desktop ────────────────────────────────────────────────
cmd_list_artifacts() {
    header "Artefactos generados"

    local found=0

    # Binario
    local bin="$(find_binary || echo '')"
    if [[ -f "$bin" ]]; then
        echo -e "${GREEN}Binario:${NC} $bin ($(du -h "$bin" | cut -f1))"
        found=1
    fi

    if [[ -d "$BUNDLE_DIR" ]]; then
        if ls "$BUNDLE_DIR"/deb/*.deb 2>/dev/null | head -5; then found=1; fi
        if ls "$BUNDLE_DIR"/rpm/*.rpm 2>/dev/null | head -5; then found=1; fi
        if ls "$BUNDLE_DIR"/appimage/*.AppImage 2>/dev/null | head -5; then found=1; fi
    fi

    if [[ $found -eq 0 ]]; then
        warn "No hay artefactos. Ejecuta 'build' primero."
    fi
}

# ── Limpiar ──────────────────────────────────────────────────────────────────
cmd_clean() {
    local what="${1:-all}"
    header "Limpieza ($what)"

    case "$what" in
        frontend)
            info "Limpiando dist/..."
            rm -rf "$DIST_DIR"
            success "Frontend limpio"
            ;;
        rust)
            info "Limpiando target/ (cargo clean)..."
            cd "$TAURI_DIR"
            cargo clean
            success "Rust limpio"
            ;;
        node)
            info "Limpiando node_modules/..."
            rm -rf "$PROJECT_DIR/node_modules"
            success "node_modules eliminado"
            ;;
        bundles)
            info "Limpiando bundles..."
            rm -rf "$BUNDLE_DIR"
            success "Bundles eliminados"
            ;;
        all)
            info "Limpieza total..."
            rm -rf "$DIST_DIR"
            rm -rf "$BUNDLE_DIR"
            cd "$TAURI_DIR" && cargo clean
            success "Todo limpio (excepto node_modules)"
            ;;
        deep)
            info "Limpieza profunda (todo incluyendo node_modules)..."
            rm -rf "$DIST_DIR"
            rm -rf "$PROJECT_DIR/node_modules"
            cd "$TAURI_DIR" && cargo clean
            success "Limpieza profunda completa"
            ;;
        *)
            error "Opción no válida: $what"
            echo "Opciones: frontend, rust, node, bundles, all, deep"
            ;;
    esac
}

# ── Información del proyecto ─────────────────────────────────────────────────
cmd_info() {
    header "Annotix v$VERSION"

    echo -e "${BOLD}Proyecto:${NC}"
    echo "  Directorio: $PROJECT_DIR"
    echo "  Versión:    $VERSION"
    echo "  Bundle ID:  com.tecmedhub.annotix"
    echo ""

    echo -e "${BOLD}Herramientas:${NC}"
    echo "  Node:    $(node --version 2>/dev/null || echo 'no encontrado')"
    echo "  npm:     $(npm --version 2>/dev/null || echo 'no encontrado')"
    echo "  Rust:    $(rustc --version 2>/dev/null || echo 'no encontrado')"
    echo "  Cargo:   $(cargo --version 2>/dev/null || echo 'no encontrado')"
    echo "  Tauri:   $(npx tauri --version 2>/dev/null || echo 'no encontrado')"
    echo "  ffmpeg:  $(ffmpeg -version 2>/dev/null | head -1 || echo 'no encontrado')"
    echo "  Java:    $(java -version 2>&1 | head -1 || echo 'no encontrado')"
    echo ""

    echo -e "${BOLD}Tamaños:${NC}"
    [[ -d "$PROJECT_DIR/node_modules" ]] && echo "  node_modules: $(du -sh "$PROJECT_DIR/node_modules" 2>/dev/null | cut -f1)"
    [[ -d "$TAURI_DIR/target" ]]         && echo "  target/:      $(du -sh "$TAURI_DIR/target" 2>/dev/null | cut -f1)"
    [[ -d "$DIST_DIR" ]]                 && echo "  dist/:        $(du -sh "$DIST_DIR" 2>/dev/null | cut -f1)"
    echo ""

    echo -e "${BOLD}Android:${NC}"
    if [[ -d "$ANDROID_DIR" ]]; then
        echo "  Estado:   Inicializado"
        [[ -d "$ANDROID_DIR" ]] && echo "  Tamaño:   $(du -sh "$ANDROID_DIR" 2>/dev/null | cut -f1)"
    else
        echo "  Estado:   No inicializado"
    fi
    local ks_count
    ks_count=$(find "$KEYSTORE_DIR" -name "*.keystore" -o -name "*.jks" 2>/dev/null | wc -l)
    echo "  Keystores: $ks_count"
    echo ""

    echo -e "${BOLD}Git:${NC}"
    echo "  Branch: $(git -C "$PROJECT_DIR" branch --show-current 2>/dev/null || echo 'N/A')"
    echo "  Último commit: $(git -C "$PROJECT_DIR" log --oneline -1 2>/dev/null || echo 'N/A')"
}

# ── Bump de versión ──────────────────────────────────────────────────────────
cmd_bump() {
    local new_version="${1:-}"
    if [[ -z "$new_version" ]]; then
        echo -e "  Versión actual: ${BOLD}$VERSION${NC}"
        echo -n "  Nueva versión: "
        read -r new_version
        if [[ -z "$new_version" ]]; then
            warn "Cancelado"
            return
        fi
    fi

    header "Bump versión: $VERSION → $new_version"

    info "Actualizando package.json..."
    sed -i "s/\"version\": \"$VERSION\"/\"version\": \"$new_version\"/" "$PROJECT_DIR/package.json"

    info "Actualizando tauri.conf.json..."
    sed -i "s/\"version\": \"$VERSION\"/\"version\": \"$new_version\"/" "$TAURI_DIR/tauri.conf.json"

    info "Actualizando Cargo.toml..."
    sed -i "s/^version = \"$VERSION\"/version = \"$new_version\"/" "$TAURI_DIR/Cargo.toml"

    VERSION="$new_version"
    success "Versión actualizada a $new_version en los 3 archivos"
    warn "Recuerda hacer commit de los cambios"
}

# ── Generar iconos ───────────────────────────────────────────────────────────
cmd_icons() {
    local source="${1:-}"
    header "Generar iconos"

    if [[ -z "$source" ]]; then
        echo -n "  Ruta a imagen PNG (vacío = icono por defecto): "
        read -r source
    fi

    cd "$PROJECT_DIR"
    if [[ -n "$source" ]]; then
        info "Generando iconos desde: $source"
        npx tauri icon "$source"
    else
        info "Generando iconos desde el icono por defecto..."
        npx tauri icon
    fi

    success "Iconos generados en $TAURI_DIR/icons/"
}

# ── Ejecutar binario release ─────────────────────────────────────────────────
cmd_run() {
    local bin="$(find_binary || echo '')"
    if [[ ! -f "$bin" ]]; then
        error "Binario no encontrado. Ejecuta 'build' primero."
        return 1
    fi
    header "Ejecutando Annotix v$VERSION"
    info "Cerrando la ventana de Annotix volverás al menú"
    "$bin" "$@" || true
}

# ── Tamaño del binario ──────────────────────────────────────────────────────
cmd_size() {
    header "Análisis de tamaño"

    local bin="$(find_binary || echo '')"
    if [[ -f "$bin" ]]; then
        echo -e "${BOLD}Binario release:${NC} $(du -h "$bin" | cut -f1)"
        echo ""
        echo -e "${BOLD}Dependencias dinámicas:${NC}"
        ldd "$bin" 2>/dev/null | head -30 || echo "  (ldd no disponible)"
    else
        warn "Binario release no encontrado"
    fi

    echo ""
    if [[ -d "$BUNDLE_DIR" ]]; then
        echo -e "${BOLD}Paquetes:${NC}"
        find "$BUNDLE_DIR" -type f \( -name "*.deb" -o -name "*.rpm" -o -name "*.AppImage" \) \
            -exec du -h {} \; 2>/dev/null | sort -h
    fi
}

# ── Actualizar dependencias ──────────────────────────────────────────────────
cmd_update() {
    local what="${1:-all}"
    header "Actualizar dependencias ($what)"

    case "$what" in
        npm|node|frontend)
            info "Actualizando npm..."
            cd "$PROJECT_DIR"
            npm update
            success "npm actualizado"
            ;;
        cargo|rust)
            info "Actualizando Cargo..."
            cd "$TAURI_DIR"
            cargo update
            success "Cargo actualizado"
            ;;
        all)
            info "Actualizando npm..."
            cd "$PROJECT_DIR"
            npm update
            info "Actualizando Cargo..."
            cd "$TAURI_DIR"
            cargo update
            success "Todo actualizado"
            ;;
        *)
            error "Opción: npm, cargo, all"
            ;;
    esac
}

# ── Registro de releases ─────────────────────────────────────────────────────

# Llamar después de cada build exitoso para registrar en releases.json
auto_record_release() {
    local build_json="$PROJECT_DIR/build.json"
    if [[ ! -f "$build_json" ]]; then
        return
    fi
    local build_code build_num
    build_code=$(python3 -c "import json; print(json.load(open('$build_json')).get('buildCode', ''))" 2>/dev/null || echo "")
    build_num=$(python3 -c "import json; print(json.load(open('$build_json'))['buildNumber'])" 2>/dev/null || echo 0)
    if [[ -z "$build_code" || "$build_num" == "0" ]]; then
        return
    fi
    local last_tag
    last_tag=$(git -C "$PROJECT_DIR" describe --tags --abbrev=0 2>/dev/null || echo "")
    record_release "$build_code" "$build_num" "$last_tag"
}

record_release() {
    local code="$1"
    local build_num="$2"
    local last_tag="$3"
    local releases_json="$PROJECT_DIR/releases.json"

    # Recopilar commits desde último tag
    local commits_json="[]"
    if [[ -n "$last_tag" ]]; then
        commits_json=$(git -C "$PROJECT_DIR" log "$last_tag"..HEAD --format='{"hash":"%h","message":"%s"}' 2>/dev/null | python3 -c "
import sys, json
lines = [l.strip() for l in sys.stdin if l.strip()]
commits = []
for l in lines:
    try:
        commits.append(json.loads(l))
    except: pass
print(json.dumps(commits))
" 2>/dev/null || echo "[]")
    else
        commits_json=$(git -C "$PROJECT_DIR" log --oneline -30 --format='{"hash":"%h","message":"%s"}' 2>/dev/null | python3 -c "
import sys, json
lines = [l.strip() for l in sys.stdin if l.strip()]
commits = []
for l in lines:
    try:
        commits.append(json.loads(l))
    except: pass
print(json.dumps(commits))
" 2>/dev/null || echo "[]")
    fi

    # Detectar issues cerrados en los commits
    local issues_json
    issues_json=$(echo "$commits_json" | python3 -c "
import sys, json, re
commits = json.load(sys.stdin)
issues = set()
for c in commits:
    found = re.findall(r'(?:close[sd]?|fix(?:e[sd])?|resolve[sd]?)\s+#(\d+)', c['message'], re.IGNORECASE)
    issues.update(found)
    # También capturar #N sueltos
    refs = re.findall(r'#(\d+)', c['message'])
    issues.update(refs)
print(json.dumps(sorted(issues)))
" 2>/dev/null || echo "[]")

    # Agregar al releases.json
    python3 -c "
import json
releases_path = '$releases_json'
try:
    with open(releases_path) as f:
        releases = json.load(f)
except:
    releases = []

entry = {
    'code': '$code',
    'version': '$VERSION',
    'buildNumber': $build_num,
    'date': '$(date -u +"%Y-%m-%dT%H:%M:%SZ")',
    'commits': $commits_json,
    'issues': $issues_json
}
releases.append(entry)

with open(releases_path, 'w') as f:
    json.dump(releases, f, indent=2, ensure_ascii=False)
" 2>/dev/null

    if [[ $? -eq 0 ]]; then
        local n_commits
        n_commits=$(echo "$commits_json" | python3 -c "import sys,json; print(len(json.load(sys.stdin)))" 2>/dev/null || echo "?")
        local n_issues
        n_issues=$(echo "$issues_json" | python3 -c "import sys,json; print(len(json.load(sys.stdin)))" 2>/dev/null || echo "0")
        success "Release $code registrado en releases.json ($n_commits commits, $n_issues issues)"
    else
        warn "No se pudo registrar en releases.json"
    fi
}

# ── Release ──────────────────────────────────────────────────────────────────
cmd_release() {
    header "Release Annotix"

    local branch
    branch=$(git -C "$PROJECT_DIR" branch --show-current 2>/dev/null || echo "unknown")
    local last_tag
    last_tag=$(git -C "$PROJECT_DIR" describe --tags --abbrev=0 2>/dev/null || echo "")
    local build_num=0
    local build_code=""
    if [[ -f "$PROJECT_DIR/build.json" ]]; then
        build_num=$(python3 -c "import json; print(json.load(open('$PROJECT_DIR/build.json'))['buildNumber'])" 2>/dev/null || echo 0)
        build_code=$(python3 -c "import json; print(json.load(open('$PROJECT_DIR/build.json')).get('buildCode', ''))" 2>/dev/null || echo "")
    fi

    # 1. Mostrar estado
    echo -e "${BOLD}Estado actual:${NC}"
    echo -e "  Versión:      ${CYAN}$VERSION${NC}"
    echo -e "  Build:        ${CYAN}${build_code:-sin código} (#$build_num)${NC}"
    echo -e "  Rama:         ${CYAN}$branch${NC}"
    if [[ -n "$last_tag" ]]; then
        local commit_count
        commit_count=$(git -C "$PROJECT_DIR" rev-list "$last_tag"..HEAD --count 2>/dev/null || echo "?")
        echo -e "  Último tag:   ${CYAN}$last_tag${NC} ($commit_count commits desde entonces)"
    else
        echo -e "  Último tag:   ${DIM}(ninguno)${NC}"
    fi
    echo ""

    # 2. Pregunta nueva versión
    echo -ne "  Nueva versión (ENTER para mantener ${BOLD}$VERSION${NC}): "
    read -r new_ver
    if [[ -n "$new_ver" && "$new_ver" != "$VERSION" ]]; then
        cmd_bump "$new_ver"
    fi

    # 3. Generar build info (código único)
    generate_build_info
    build_num=$(python3 -c "import json; print(json.load(open('$PROJECT_DIR/build.json'))['buildNumber'])" 2>/dev/null || echo "$((build_num + 1))")
    build_code=$(python3 -c "import json; print(json.load(open('$PROJECT_DIR/build.json')).get('buildCode', ''))" 2>/dev/null || echo "")

    echo ""
    success "Release: Annotix v$VERSION ($build_code)"
    echo ""

    # 4. ¿Compilar localmente?
    echo -ne "  ¿Compilar localmente (AppImage)? [s/N]: "
    read -r do_build
    if [[ "$do_build" == "s" || "$do_build" == "S" ]]; then
        cmd_build "appimage"
    fi

    # 5. Registrar en releases.json
    record_release "$build_code" "$build_num" "$last_tag"

    # 6. Commit automático
    echo ""
    echo -ne "  ¿Crear commit de release? [S/n]: "
    read -r do_commit
    if [[ "$do_commit" != "n" && "$do_commit" != "N" ]]; then
        cd "$PROJECT_DIR"
        git add build.json releases.json src/lib/buildInfo.ts
        git add -u
        git commit -m "Release Annotix v$VERSION ($build_code)"
        success "Commit creado"
    fi

    # 7. Push
    echo -ne "  ¿Push rama '$branch'? [S/n]: "
    read -r do_push
    if [[ "$do_push" != "n" && "$do_push" != "N" ]]; then
        git push origin "$branch"
        success "Push completado"
    fi

    # 8. ¿Crear PR + merge + tag?
    echo ""
    echo -ne "  ¿Crear PR hacia main? [s/N]: "
    read -r do_pr
    if [[ "$do_pr" == "s" || "$do_pr" == "S" ]]; then
        if ! command -v gh &>/dev/null; then
            error "gh CLI no encontrado. Instala GitHub CLI: https://cli.github.com"
        else
            local pr_title="Release Annotix v$VERSION ($build_code)"
            local changelog=""
            if [[ -n "$last_tag" ]]; then
                changelog=$(git -C "$PROJECT_DIR" log "$last_tag"..HEAD --oneline 2>/dev/null || echo "")
            else
                changelog=$(git -C "$PROJECT_DIR" log --oneline -20 2>/dev/null || echo "")
            fi
            # Issues cerrados
            local issues_text=""
            local closed_issues
            closed_issues=$(echo "$changelog" | grep -oiE '(close[sd]?|fix(e[sd])?|resolve[sd]?) #[0-9]+' | grep -oE '#[0-9]+' | sort -u)
            if [[ -n "$closed_issues" ]]; then
                issues_text="### Issues resueltos
$(echo "$closed_issues" | sed 's/^/- /')
"
            fi
            local pr_body
            pr_body=$(cat <<PRBODY
## Release Annotix v$VERSION ($build_code)

**Build:** $build_code (#$build_num)
**Fecha:** $(date -u +"%Y-%m-%d %H:%M UTC")
**Rama:** $branch

### Changelog
$(echo "$changelog" | sed 's/^/- /')

$issues_text
PRBODY
)
            local pr_url
            pr_url=$(gh pr create --title "$pr_title" --body "$pr_body" --base main 2>&1)
            if [[ $? -eq 0 ]]; then
                success "PR creado: $pr_url"

                # 9. ¿Mergear PR?
                echo ""
                echo -ne "  ¿Mergear PR en main? [S/n]: "
                read -r do_merge
                if [[ "$do_merge" != "n" && "$do_merge" != "N" ]]; then
                    gh pr merge --merge --delete-branch=false
                    if [[ $? -eq 0 ]]; then
                        success "PR mergeado en main"

                        # 10. ¿Crear tag sobre main?
                        echo ""
                        echo -ne "  ¿Crear tag v$VERSION en main? (dispara builds CI) [S/n]: "
                        read -r do_tag
                        if [[ "$do_tag" != "n" && "$do_tag" != "N" ]]; then
                            # Actualizar refs remotas después del merge
                            git fetch origin main --quiet 2>/dev/null

                            # Verificar si el tag ya existe
                            if git tag -l "v$VERSION" | grep -q "v$VERSION"; then
                                warn "El tag v$VERSION ya existe localmente"
                                echo -ne "  ¿Eliminar y recrear sobre main? [S/n]: "
                                read -r do_retag
                                if [[ "$do_retag" != "n" && "$do_retag" != "N" ]]; then
                                    git tag -d "v$VERSION" 2>/dev/null
                                    git push origin --delete "v$VERSION" 2>/dev/null
                                else
                                    info "Tag existente conservado"
                                fi
                            fi

                            # Crear tag sobre main sin cambiar de rama
                            if ! git tag -l "v$VERSION" | grep -q "v$VERSION"; then
                                local main_sha
                                main_sha=$(git rev-parse origin/main 2>/dev/null)
                                if [[ -n "$main_sha" ]]; then
                                    git tag "v$VERSION" "$main_sha"
                                    if git push origin "v$VERSION"; then
                                        success "Tag v$VERSION creado sobre main → CI se disparará"
                                    else
                                        error "No se pudo pushear el tag v$VERSION"
                                    fi
                                else
                                    error "No se pudo resolver origin/main"
                                fi
                            fi
                        fi
                    else
                        error "No se pudo mergear el PR"
                    fi
                fi
            else
                error "No se pudo crear el PR: $pr_url"
            fi
        fi
    fi

    echo ""
    success "Proceso de release completado"
}

# ══════════════════════════════════════════════════════════════════════════════
# ── MENÚ INTERACTIVO ─────────────────────────────────────────────────────────
# ══════════════════════════════════════════════════════════════════════════════

show_banner() {
    clear
    echo -e "${BOLD}${CYAN}"
    echo "    _                    _   _      "
    echo "   / \   _ __  _ __   _| |_(_)_  __"
    echo "  / _ \ | '_ \| '_ \ / _ \| \ \/ /"
    echo " / ___ \| | | | | | | (_) | |>  < "
    echo "/_/   \_\_| |_|_| |_|\___/|_/_/\_\\"
    echo -e "${NC}"
    echo -e "${DIM}  v$VERSION · $(git -C "$PROJECT_DIR" branch --show-current 2>/dev/null || echo '-') · $(git -C "$PROJECT_DIR" log --oneline -1 2>/dev/null | cut -c1-40 || echo '-')${NC}"
    echo ""
}

show_menu() {
    echo -e "${BOLD} DESARROLLO${NC}"
    echo -e "  ${GREEN}1${NC})  Dev mode            ${DIM}Tauri + Vite hot reload${NC}"
    echo -e "  ${GREEN}2${NC})  Dev web              ${DIM}Solo frontend en navegador${NC}"
    echo -e "  ${GREEN}3${NC})  Check                ${DIM}Verificar tsc + cargo sin compilar${NC}"
    echo -e "  ${GREEN}4${NC})  Lint                 ${DIM}ESLint + Clippy${NC}"
    echo ""
    echo -e "${BOLD} BUILD DESKTOP${NC}"
    echo -e "  ${YELLOW}5${NC})  Build completo       ${DIM}App + todos los paquetes${NC}"
    echo -e "  ${YELLOW}6${NC})  Build debug          ${DIM}Sin optimizaciones, más rápido${NC}"
    echo -e "  ${YELLOW}7${NC})  Build binario        ${DIM}Solo binario release (sin empaquetar)${NC}"
    echo -e "  ${YELLOW}8${NC})  Build frontend       ${DIM}Solo tsc + vite build${NC}"
    echo -e "  ${YELLOW}9${NC})  Build Rust           ${DIM}Solo cargo build --release${NC}"
    echo -e " ${YELLOW}10${NC})  Build .deb           ${DIM}Paquete Debian${NC}"
    echo -e " ${YELLOW}11${NC})  Build .rpm           ${DIM}Paquete Red Hat${NC}"
    echo -e " ${YELLOW}12${NC})  Build AppImage       ${DIM}AppImage portable${NC}"
    echo ""
    echo -e "${BOLD} ANDROID${NC}"
    echo -e " ${WHITE}13${NC})  Android init         ${DIM}Inicializar proyecto + Rust targets${NC}"
    echo -e " ${WHITE}14${NC})  Android dev          ${DIM}Dev mode en emulador/dispositivo${NC}"
    echo -e " ${WHITE}15${NC})  Android build debug  ${DIM}APK debug${NC}"
    echo -e " ${WHITE}16${NC})  Android build release${DIM} APK/AAB release${NC}"
    echo -e " ${WHITE}17${NC})  Crear keystore       ${DIM}Generar certificado de firma${NC}"
    echo -e " ${WHITE}18${NC})  Firmar APK           ${DIM}Firmar APK con keystore${NC}"
    echo -e " ${WHITE}19${NC})  Verificar firma      ${DIM}Validar firma de un APK${NC}"
    echo -e " ${WHITE}20${NC})  Info keystore        ${DIM}Ver detalle del certificado${NC}"
    echo -e " ${WHITE}21${NC})  Artefactos Android   ${DIM}Listar APKs/AABs generados${NC}"
    echo -e " ${WHITE}22${NC})  Check deps Android   ${DIM}Verificar SDK, NDK, Java, targets${NC}"
    echo -e " ${WHITE}23${NC})  Instalar targets     ${DIM}rustup add targets Android${NC}"
    echo -e " ${WHITE}24${NC})  Limpiar Android      ${DIM}gradlew clean${NC}"
    echo ""
    echo -e "${BOLD} GESTIÓN${NC}"
    echo -e " ${BLUE}25${NC})  Instalar deps        ${DIM}npm install${NC}"
    echo -e " ${BLUE}26${NC})  Actualizar deps      ${DIM}npm update + cargo update${NC}"
    echo -e " ${BLUE}27${NC})  Bump versión         ${DIM}Cambiar versión en todos los archivos${NC}"
    echo -e " ${BLUE}28${NC})  Generar iconos       ${DIM}Regenerar iconos desde imagen${NC}"
    echo -e " ${BLUE}29${NC})  Info proyecto        ${DIM}Herramientas, tamaños, git${NC}"
    echo -e " ${BLUE}30${NC})  Check deps           ${DIM}Verificar dependencias del sistema${NC}"
    echo ""
    echo -e "${BOLD} ARTEFACTOS${NC}"
    echo -e " ${MAGENTA}31${NC})  Ejecutar app         ${DIM}Lanzar binario release${NC}"
    echo -e " ${MAGENTA}32${NC})  Listar artefactos    ${DIM}Ver paquetes generados${NC}"
    echo -e " ${MAGENTA}33${NC})  Análisis tamaño      ${DIM}Tamaño binario + dependencias${NC}"
    echo ""
    echo -e "${BOLD} RELEASE${NC}"
    echo -e " ${CYAN}40${NC})  Release              ${DIM}Bump + build info + PR + tag CI${NC}"
    echo ""
    echo -e "${BOLD} LIMPIEZA${NC}"
    echo -e " ${RED}34${NC})  Limpiar todo         ${DIM}dist + target + bundles${NC}"
    echo -e " ${RED}35${NC})  Limpiar frontend     ${DIM}Solo dist/${NC}"
    echo -e " ${RED}36${NC})  Limpiar Rust         ${DIM}cargo clean${NC}"
    echo -e " ${RED}37${NC})  Limpiar node         ${DIM}Eliminar node_modules/${NC}"
    echo -e " ${RED}38${NC})  Limpiar bundles      ${DIM}Solo bundles${NC}"
    echo -e " ${RED}39${NC})  Limpieza profunda    ${DIM}Todo incluyendo node_modules${NC}"
    echo ""
    echo -e "  ${BOLD}0${NC})  Salir"
    echo ""
}

menu_loop() {
    while true; do
        show_banner
        show_menu

        echo -ne "${BOLD}  Opción: ${NC}"
        read -r choice

        choice="${choice// /}"

        case "$choice" in
            # Desarrollo
            1)  cmd_dev;              pause_after ;;
            2)  cmd_dev_web;          pause_after ;;
            3)  cmd_check;            pause_after ;;
            4)  cmd_lint;             pause_after ;;

            # Build Desktop
            5)  cmd_build;            pause_after ;;
            6)  cmd_build_debug;      pause_after ;;
            7)  cmd_build_bin;        pause_after ;;
            8)  cmd_build_frontend;   pause_after ;;
            9)  cmd_build_rust;       pause_after ;;
            10) cmd_build_deb;        pause_after ;;
            11) cmd_build_rpm;        pause_after ;;
            12) cmd_build_appimage;   pause_after ;;

            # Android
            13) cmd_android_init;           pause_after ;;
            14) cmd_android_dev;            pause_after ;;
            15) cmd_android_build_debug;    pause_after ;;
            16) cmd_android_build_release;  pause_after ;;
            17) cmd_android_create_keystore; pause_after ;;
            18) cmd_android_sign;           pause_after ;;
            19) cmd_android_verify_sign;    pause_after ;;
            20) cmd_android_keystore_info;  pause_after ;;
            21) cmd_android_list_artifacts; pause_after ;;
            22) check_android_deps;         pause_after ;;
            23) cmd_android_install_targets; pause_after ;;
            24) cmd_android_clean;          pause_after ;;

            # Gestión
            25) cmd_install;          pause_after ;;
            26) cmd_update;           pause_after ;;
            27) cmd_bump;             pause_after ;;
            28) cmd_icons;            pause_after ;;
            29) cmd_info;             pause_after ;;
            30) check_deps;           pause_after ;;

            # Artefactos
            31) cmd_run;              pause_after ;;
            32) cmd_list_artifacts;   pause_after ;;
            33) cmd_size;             pause_after ;;

            # Release
            40) cmd_release;          pause_after ;;

            # Limpieza
            34) cmd_clean "all";      pause_after ;;
            35) cmd_clean "frontend"; pause_after ;;
            36) cmd_clean "rust";     pause_after ;;
            37) cmd_clean "node";     pause_after ;;
            38) cmd_clean "bundles";  pause_after ;;
            39) cmd_clean "deep";     pause_after ;;

            0|q|Q|quit|exit|salir)
                echo ""
                echo -e "${GREEN}Hasta luego${NC}"
                exit 0
                ;;
            "")
                ;;
            *)
                error "Opción no válida: $choice"
                sleep 1
                ;;
        esac
    done
}

# ── Ayuda CLI ────────────────────────────────────────────────────────────────
cmd_help() {
    echo -e "${BOLD}${CYAN}Annotix v$VERSION - Script de gestión${NC}"
    echo ""
    echo -e "${BOLD}Uso:${NC} ./annotix.sh [comando] [opciones]"
    echo -e "     ./annotix.sh              ${DIM}(menú interactivo)${NC}"
    echo ""
    echo -e "${BOLD}Desarrollo:${NC}"
    echo "  dev                  Iniciar en modo desarrollo (Tauri + Vite)"
    echo "  dev:web              Solo frontend en navegador (sin Tauri)"
    echo "  check                Verificar TypeScript + Rust sin compilar"
    echo "  lint                 Ejecutar ESLint + Clippy"
    echo ""
    echo -e "${BOLD}Build Desktop:${NC}"
    echo "  build                Compilar app completa (todos los paquetes)"
    echo "  build:debug          Compilar en modo debug (más rápido)"
    echo "  build:bin            Solo binario release (sin empaquetar)"
    echo "  build:frontend       Solo compilar frontend (tsc + vite)"
    echo "  build:rust           Solo compilar Rust [debug|release]"
    echo "  build:deb            Solo paquete .deb"
    echo "  build:rpm            Solo paquete .rpm"
    echo "  build:appimage       Solo AppImage"
    echo ""
    echo -e "${BOLD}Android:${NC}"
    echo "  android:init         Inicializar proyecto Android"
    echo "  android:dev          Dev mode en emulador/dispositivo"
    echo "  android:debug        Build APK debug"
    echo "  android:release      Build APK/AAB release"
    echo "  android:keystore     Crear keystore de firma"
    echo "  android:sign         Firmar APK con keystore"
    echo "  android:verify       Verificar firma de APK"
    echo "  android:keyinfo      Info del keystore"
    echo "  android:artifacts    Listar APKs/AABs generados"
    echo "  android:deps         Verificar deps Android"
    echo "  android:targets      Instalar Rust targets Android"
    echo "  android:clean        Limpiar build Android"
    echo ""
    echo -e "${BOLD}Gestión:${NC}"
    echo "  install              Instalar dependencias npm"
    echo "  update [target]      Actualizar deps (npm|cargo|all)"
    echo "  bump <version>       Cambiar versión en todos los archivos"
    echo "  icons [imagen]       Generar iconos (opcionalmente desde imagen)"
    echo "  info                 Información del proyecto y herramientas"
    echo "  deps                 Verificar dependencias del sistema"
    echo ""
    echo -e "${BOLD}Release:${NC}"
    echo "  release              Release interactivo (bump + build info + PR + tag)"
    echo ""
    echo -e "${BOLD}Artefactos:${NC}"
    echo "  run                  Ejecutar binario release compilado"
    echo "  artifacts            Listar artefactos generados"
    echo "  size                 Análisis de tamaño del binario y paquetes"
    echo ""
    echo -e "${BOLD}Limpieza:${NC}"
    echo "  clean                Limpiar todo (dist + target + bundles)"
    echo "  clean:frontend       Solo limpiar dist/"
    echo "  clean:rust           Solo cargo clean"
    echo "  clean:node           Solo eliminar node_modules/"
    echo "  clean:bundles        Solo eliminar bundles"
    echo "  clean:deep           Limpieza total (incluye node_modules)"
    echo ""
}

# ── Router de comandos ───────────────────────────────────────────────────────
main() {
    cd "$PROJECT_DIR"

    # Sin argumentos → menú interactivo
    if [[ $# -eq 0 ]]; then
        menu_loop
        exit 0
    fi

    local cmd="$1"
    shift

    case "$cmd" in
        # Desarrollo
        dev)                cmd_dev "$@" ;;
        dev:web)            cmd_dev_web "$@" ;;
        check)              cmd_check "$@" ;;
        lint)               cmd_lint "$@" ;;

        # Build Desktop
        build)              cmd_build "$@" ;;
        build:debug)        cmd_build_debug "$@" ;;
        build:bin)          cmd_build_bin "$@" ;;
        build:frontend)     cmd_build_frontend "$@" ;;
        build:rust)         cmd_build_rust "$@" ;;
        build:deb)          cmd_build_deb "$@" ;;
        build:rpm)          cmd_build_rpm "$@" ;;
        build:appimage)     cmd_build_appimage "$@" ;;

        # Android
        android:init)       cmd_android_init "$@" ;;
        android:dev)        cmd_android_dev "$@" ;;
        android:debug)      cmd_android_build_debug "$@" ;;
        android:release)    cmd_android_build_release "$@" ;;
        android:keystore)   cmd_android_create_keystore "$@" ;;
        android:sign)       cmd_android_sign "$@" ;;
        android:verify)     cmd_android_verify_sign "$@" ;;
        android:keyinfo)    cmd_android_keystore_info "$@" ;;
        android:artifacts)  cmd_android_list_artifacts "$@" ;;
        android:deps)       check_android_deps "$@" ;;
        android:targets)    cmd_android_install_targets "$@" ;;
        android:clean)      cmd_android_clean "$@" ;;

        # Release
        release)            cmd_release "$@" ;;

        # Gestión
        install)            cmd_install "$@" ;;
        update)             cmd_update "$@" ;;
        bump)               cmd_bump "$@" ;;
        icons)              cmd_icons "$@" ;;
        info)               cmd_info "$@" ;;
        deps)               check_deps "$@" ;;

        # Artefactos
        run)                cmd_run "$@" ;;
        artifacts)          cmd_list_artifacts "$@" ;;
        size)               cmd_size "$@" ;;

        # Limpieza
        clean)              cmd_clean "all" ;;
        clean:frontend)     cmd_clean "frontend" ;;
        clean:rust)         cmd_clean "rust" ;;
        clean:node)         cmd_clean "node" ;;
        clean:bundles)      cmd_clean "bundles" ;;
        clean:deep)         cmd_clean "deep" ;;

        # Ayuda
        help|--help|-h)     cmd_help ;;

        *)
            error "Comando desconocido: $cmd"
            echo ""
            cmd_help
            exit 1
            ;;
    esac
}

main "$@"
