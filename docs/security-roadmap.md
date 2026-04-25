# Roadmap Seguridad — Annotix

Auditoría 2026-04-25. 3 bloqueadores release + 2 defensa-en-profundidad.

## Estado

| # | Vuln | Sev | Conf | Estado |
|---|------|-----|------|--------|
| 1 | HTTP serve LAN sin auth | HIGH | 10/10 | ✅ Resuelto |
| 2 | Path traversal TIX/P2P | HIGH | 9/10 | ✅ Resuelto |
| 3 | Python script injection | HIGH | 7/10 | Pendiente |
| 4 | CSP `null` | MED | 8/10 | Pendiente |
| 5 | `fs:scope` `$HOME/**` | MED | 7/10 | Pendiente |

## Cambios aplicados

### Vuln 1 (commit pendiente)
- `src-tauri/Cargo.toml`: `rand 0.8` + `subtle 2`
- `src-tauri/src/serve/server.rs`: `generate_token()` 256 bits hex con `OsRng`, almacenado en `ServeSession`, propagado a `ServeInfo` y URLs (`?token=`)
- `src-tauri/src/serve/routes.rs`: middleware axum `auth_middleware` con `subtle::ConstantTimeEq`. Acepta `Authorization: Bearer <t>` o `?token=<t>`. Aplicado vía `from_fn_with_state` a router `protected` (todas las rutas `/api/projects/...`). `/` y `/api/health` quedan abiertos.
- `src-tauri/src/serve/web_ui.html`: extrae token de URL/sessionStorage, prepende `Authorization` header en fetch, `?token=` en `<img src>`.
- `src/features/serve/components/{ServeButton,ServeDialog}.tsx`: campo `token` en interfaz `ServeInfo`.

### Vuln 2 (commit pendiente)
- `src-tauri/src/store/safe_path.rs`: nuevo módulo con `sanitize_filename()` y `safe_join()` + tests unitarios
- `src-tauri/src/store/mod.rs`: expone `safe_path`
- `src-tauri/src/store/images.rs`: `sanitize_filename` en `prepare_image_entry`, `upload_images_with_progress`, `upload_image_bytes` antes de cualquier `format!("{}_{}", id, file_name)`
- `src-tauri/src/p2p/sync.rs`: `sanitize_filename` en `download_single_image`, en loop de `pending_images`, y en construcción de `ImageEntry` (líneas 365 y 1102) — bloquea persistencia de `file` malicioso desde peer
- `src-tauri/src/store/projects.rs`: `get_image_file_path` usa `safe_join` (defensa lectura)

---

## Vuln 1 — HTTP serve LAN sin autenticación

**Archivos:** `src-tauri/src/serve/server.rs:156`, `src-tauri/src/serve/routes.rs`

**Problema:** `TcpListener::bind(0.0.0.0:port)` + router axum sin middleware auth. Endpoints abiertos en LAN:
- `GET /api/projects` enumera proyectos compartidos
- `GET /api/projects/{id}/images/{id}/file` exfiltra bytes
- `POST /api/projects/{id}/images/{id}/annotations` corrompe sin CSRF

**Plan fix:**
1. Generar `share_token` 256 bits con `OsRng` al iniciar share
2. Middleware axum `from_fn` que valide `Authorization: Bearer <token>` (comparación constant-time vía `subtle::ConstantTimeEq`)
3. URL share incluye token: `http://ip:port/?token=...`
4. Validar header `Origin` en POSTs (anti-CSRF) o exigir header custom no-simple
5. Considerar binding interfaz específica vs `0.0.0.0`

**Tests:** request sin token → 401. Token incorrecto → 401. Token válido → 200. POST sin Origin permitido → 403.

---

## Vuln 2 — Path traversal en imports TIX y P2P sync

**Archivos:** `src-tauri/src/store/images.rs:182,284,375`, `src-tauri/src/p2p/sync.rs:548,936`, `src-tauri/src/store/projects.rs:445`

**Problema:** `images_dir.join(file_name)` con `file_name` del JSON `.tix` o doc iroh. `Path::join` resuelve `..`. P2P sync además sin prefijo UUID. `get_image_file_path` lee `file` del `ImageEntry` sin canonicalize.

**Plan fix:**
1. Helper central `sanitize_filename(&str) -> String` que extrae solo `file_name()` y reemplaza `/\\\0`
2. Helper `safe_join(base, name) -> Result<PathBuf>` que canonicaliza y verifica `starts_with(base)`
3. Aplicar en:
   - `upload_image_bytes` (images.rs:182)
   - `prepare_image_entry` (images.rs:284)
   - `download_single_image` (p2p/sync.rs:548, 936)
   - `get_image_file_path` (projects.rs:445)
4. Extender a `videos/audio/tabular` con mismo patrón
5. Test unitario con nombres maliciosos (`../`, `/etc/`, nullbyte, separadores Windows)

---

## Vuln 3 — Python script injection en training

**Archivo:** `src-tauri/src/training/scripts.rs:8-100`

**Problema:** `format!` interpola `optimizer`, `task`, `base_model_path` en source Python. Quote literal cierra string → AST injection → RCE.

**Plan fix:**
1. Whitelist enums:
   - `optimizer`: `AdamW|Adam|SGD|RMSprop|auto`
   - `task`: `detect|segment|classify|pose|obb`
   - `cache`: `ram|disk|false`
   - `device`: regex `^(auto|cpu|mps|cuda(:\d+)?)$`
2. `base_model_path`: validar dentro de directorio gestionado, pasar vía `sys.argv`
3. Refactor: template Python fijo + `params.json` que script lee con `json.load`
4. Validación en boundary `#[tauri::command]` antes de tocar `scripts.rs`

---

## Vuln 4 — CSP deshabilitada

**Archivo:** `src-tauri/tauri.conf.json:28`

**Plan fix:**
```json
"csp": "default-src 'self'; img-src 'self' asset: data: blob:; media-src 'self' asset: blob:; connect-src 'self' ipc: http://ipc.localhost; style-src 'self' 'unsafe-inline'; script-src 'self'"
```
Validar dev URL `http://localhost:5173` con `devCsp` separado si necesario. Smoke test: cargar imágenes, audio, video.

---

## Vuln 5 — Scopes `fs:` y `assetProtocol` excesivos

**Archivos:** `src-tauri/tauri.conf.json:33-43`, `src-tauri/capabilities/default.json:33-43`

**Plan fix:**
1. Reducir scope a `$APPLOCALDATA/annotix/**` y `$APPCONFIG/annotix/**`
2. Para `projects_dir` elegido por user: NO exponer `fs:*` al frontend
3. Comandos Rust dedicados (`#[tauri::command] read_project_image`, etc.) que canonicalicen y validen
4. Eliminar `$HOME/**` del scope global; lectura `$DOCUMENT/$DOWNLOAD/$PICTURE` solo via dialog (ya pickeado por user)

---

## Orden ejecución

**Sprint 1 (release blocker):**
- [ ] Vuln 1 — HTTP serve auth
- [ ] Vuln 2 — Path traversal sanitize

**Sprint 2:**
- [ ] Vuln 3 — Python script whitelist
- [ ] Vuln 4 — CSP estricta

**Sprint 3:**
- [ ] Vuln 5 — Scopes Tauri reducidos
