# Plan de Colaboración y Sincronización — Annotix

## Visión general

Reemplazar el sistema P2P monolítico actual (Iroh, roto) por una **arquitectura modular de transporte** donde el usuario elige cómo compartir sus proyectos. Desde lo más simple (exportar un ZIP) hasta lo más avanzado (relay propio o P2P directo), cada opción es un "provider" intercambiable que se conecta a un único motor de sync.

```
┌─────────────────────────────────────────────────┐
│              UI: Collaboration Panel            │
│  ┌──────┐ ┌──────┐ ┌───────┐ ┌─────┐ ┌──────┐  │
│  │Export │ │Folder│ │ Git   │ │Relay│ │ P2P  │  │
│  │/Import│ │ Sync │ │ Sync  │ │     │ │Direct│  │
│  └──┬───┘ └──┬───┘ └──┬────┘ └──┬──┘ └──┬───┘  │
│     └────────┴────────┴─────────┴───────┘       │
│                      │                          │
│          ┌───────────▼──────────┐               │
│          │   Sync Engine (core) │               │
│          │  • Merge por imagen  │               │
│          │  • Conflict resolver │               │
│          │  • Change tracker    │               │
│          └───────────┬──────────┘               │
│                      │                          │
│          ┌───────────▼──────────┐               │
│          │   Project Storage    │               │
│          │  (estructura actual) │               │
│          └──────────────────────┘               │
└─────────────────────────────────────────────────┘
```

---

## Fase 0 — Refactor del almacenamiento (prerequisito)

### Objetivo
Separar anotaciones por imagen para que los conflictos sean granulares y cualquier método de sync funcione bien.

### Estructura actual
```
{projects_dir}/{uuid}/project.json    ← TODO en un archivo (metadata + clases + imágenes + anotaciones)
{projects_dir}/{uuid}/images/         ← archivos de imagen
```

### Estructura nueva
```
{projects_dir}/{uuid}/
├── project.json                      ← metadata + clases (ligero, ~5KB)
├── annotations/
│   ├── {image_id}.json               ← anotaciones de 1 imagen
│   ├── {image_id}.json
│   └── ...
├── images/                           ← archivos de imagen (sin cambio)
├── thumbnails/                       ← thumbnails (sin cambio)
├── videos/                           ← videos (sin cambio)
└── .sync/                            ← metadata de sincronización (ignorada en export)
    ├── state.json                    ← config del provider activo, timestamps
    └── conflicts/                    ← conflictos pendientes de resolver
```

### Cambios en Rust

1. **`project_file.rs`** — Mantener `ProjectFile` como modelo en memoria (sin cambio en la API interna). Agregar campo `annotations_dir: bool` a la metadata para saber si el proyecto usa el formato nuevo.

2. **`io.rs`** — Modificar `read_project()` y `write_project()`:
   - `read_project()`: si existe `annotations/`, leer de ahí en vez del array en project.json.
   - `write_project()`: escribir anotaciones como archivos individuales. Solo escribir los archivos que cambiaron (comparar hash o timestamp).
   - Migración automática: al abrir un proyecto viejo, mover anotaciones a archivos individuales.

3. **`images.rs`** — `save_annotations(project_id, image_id, annotations)` debe escribir directamente a `annotations/{image_id}.json` sin reescribir todo el project.json.

4. **Nuevo módulo `change_tracker.rs`**:
   - Mantener un registro de qué archivos cambiaron desde último sync.
   - Usar timestamps + hash blake3 para detectar cambios.
   - Estructura: `HashMap<String, ChangeInfo>` donde key = path relativo.

### Migración
- Al abrir proyecto sin `annotations/`, migrar automáticamente.
- Es transparente al usuario.
- El frontend no necesita cambios (misma API de comandos Tauri).

---

## Fase 1 — Export/Import con merge inteligente

### Objetivo
La base mínima: compartir proyectos como archivos `.annotix` con merge automático al importar.

### Flujo de exportación
```
[Exportar para colaborar]
    │
    ├─ Exportar TODO → .annotix (ZIP con proyecto + imágenes + anotaciones)
    │
    └─ Exportar solo CAMBIOS → .annotix-patch (ZIP sin imágenes, solo diffs)
        ├─ annotations/ modificadas desde fecha X
        ├─ project.json (metadata + clases)
        └─ manifest.json { base_project_id, exported_at, changed_files[] }
```

### Flujo de importación con merge
```
[Importar .annotix / .annotix-patch]
    │
    ├─ ¿Proyecto nuevo? → Crear proyecto normal
    │
    └─ ¿Proyecto existente (mismo UUID)?
        │
        ├─ Sin conflictos → merge automático silencioso
        │   (anotaciones nuevas o que no cambiaron local)
        │
        └─ Con conflictos → UI de resolución
            ├─ Vista lado a lado por imagen
            ├─ Opciones: mantener local / aceptar remoto / merge manual
            └─ Resolver todo con: "Aceptar todos remotos" / "Mantener todos locales"
```

### Detección de conflictos
- Por imagen: comparar hash de `annotations/{image_id}.json`.
- Si local no cambió desde el export → aceptar remoto automáticamente.
- Si ambos cambiaron → conflicto.
- Metadata del proyecto (clases, nombre): merge aditivo (clases nuevas se agregan, existentes se actualizan si cambiaron).

### Implementación Rust

- **`sync/merge.rs`** — Motor de merge:
  ```rust
  pub struct MergeResult {
      auto_merged: Vec<String>,       // imágenes mergeadas sin conflicto
      conflicts: Vec<MergeConflict>,  // imágenes con conflicto
  }

  pub struct MergeConflict {
      image_id: String,
      local: Vec<AnnotationEntry>,
      remote: Vec<AnnotationEntry>,
  }

  pub fn merge_project(local: &ProjectFile, patch: &PatchManifest) -> MergeResult;
  ```

- **Comandos Tauri**:
  - `export_collab_full(project_id) → PathBuf` — ZIP completo
  - `export_collab_patch(project_id, since: DateTime) → PathBuf` — solo cambios
  - `import_collab(path) → MergeResult` — importar y devolver resultado
  - `resolve_conflict(project_id, image_id, resolution: "local"|"remote") → ()`

### UI (React)
- Botón "Compartir" en ProjectCard → opciones de exportar.
- Al importar, si hay conflictos → dialog de resolución con preview de anotaciones.

---

## Fase 2 — Folder sync (carpeta compartida)

### Objetivo
Si el usuario tiene su `projects_dir` en Dropbox, Google Drive, Syncthing, OneDrive, o cualquier carpeta sincronizada, Annotix detecta cambios externos y mergea automáticamente.

### Implementación

1. **File watcher** — Usar `notify` crate (ya en el ecosistema Tauri):
   - Vigilar `{project_dir}/annotations/*.json` y `project.json`.
   - Debounce de 2 segundos (evitar notificaciones parciales de Dropbox).
   - Al detectar cambio externo → leer archivo, comparar con cache, mergear.

2. **Conflictos**:
   - Si el usuario estaba editando la misma imagen → notificación toast: "Alguien editó esta imagen. ¿Ver cambios?"
   - Si no estaba editando → merge silencioso + indicador visual en la imagen.

3. **Lock files ligeros** (opcional):
   - Al abrir una imagen para editar: crear `.sync/{image_id}.lock` con `{ user, hostname, timestamp }`.
   - Otros clientes ven el lock y muestran "editando por X".
   - TTL de 5 minutos, renovación automática.
   - Los servicios de sync propagan el archivo de lock.

### Config
```json
// .sync/state.json
{
  "provider": "folder_sync",
  "watch_enabled": true,
  "debounce_ms": 2000,
  "user_name": "Alice"
}
```

### Ventajas
- 0 código de red — todo el transporte lo hace el servicio de sync del usuario.
- Funciona con cualquier servicio (Dropbox, Drive, Syncthing, rsync, NFS, SMB).
- Offline-first por naturaleza.

---

## Fase 3 — Git sync integrado

### Objetivo
Usar git como motor de sync con UI simplificada. El usuario no necesita saber git.

### Flujo UX
```
[Settings → Collaboration → Git Sync]
    │
    ├─ "Conectar repositorio"
    │   ├─ Crear nuevo repo (GitHub/GitLab)  → gh/glab CLI
    │   ├─ Clonar repo existente             → URL
    │   └─ Usar repo local existente         → path
    │
    └─ Botón "Sync" en toolbar (o auto-sync cada N minutos)
        ├─ git add annotations/ project.json
        ├─ git commit -m "sync: {user} @ {timestamp}"
        ├─ git pull --rebase
        ├─ Si conflicto → resolver con merge engine (Fase 1)
        └─ git push
```

### Manejo de imágenes grandes
- `images/` se trackean con Git LFS automáticamente.
- `.gitattributes` generado: `images/** filter=lfs diff=lfs merge=lfs`.
- Alternativa: `.gitignore` en images/ + compartir imágenes por otro medio.
- Opción en UI: "Incluir imágenes en sync" (on/off).

### Implementación Rust

- **`sync/git_provider.rs`**:
  ```rust
  pub struct GitProvider {
      repo_path: PathBuf,
      remote: Option<String>,
      auto_sync: bool,
      sync_interval_secs: u64,
  }

  impl SyncProvider for GitProvider {
      fn init(&self) -> Result<()>;
      fn sync(&self) -> Result<SyncResult>;
      fn status(&self) -> Result<SyncStatus>;
      fn resolve_conflict(&self, image_id: &str, resolution: Resolution) -> Result<()>;
  }
  ```

- Usar `git2` crate (libgit2 bindings) para operaciones git sin necesitar git instalado.
- Alternativamente `gix` (gitoxide, puro Rust, más moderno).

### Config
```json
{
  "provider": "git",
  "remote_url": "https://github.com/user/annotix-project-X.git",
  "auto_sync": true,
  "sync_interval_secs": 300,
  "include_images": false,
  "branch": "main"
}
```

---

## Fase 4 — Relay server (Raspberry Pi / PC viejo / VPS)

### Objetivo
Un servidor ligero que el usuario o equipo puede correr en su propia infra. Zero dependencia de servicios cloud de terceros. Funciona como punto de encuentro y relay de cambios.

### Arquitectura
```
┌──────────────┐     WebSocket      ┌─────────────────┐
│  Annotix A   │◄──────────────────►│                 │
│  (desktop)   │                    │   Relay Server  │
└──────────────┘                    │  (Raspberry Pi, │
                                    │   PC viejo,     │
┌──────────────┐     WebSocket      │   Docker, VPS)  │
│  Annotix B   │◄──────────────────►│                 │
│  (desktop)   │                    │  Puerto: 7654   │
└──────────────┘                    └────────┬────────┘
                                             │
                                    ┌────────▼────────┐
                                    │  Storage local  │
                                    │  relay_data/    │
                                    │  ├── rooms/     │
                                    │  └── blobs/     │
                                    └─────────────────┘
```

### Relay server — Binario independiente

Un binario Rust separado (`annotix-relay`) que se compila para ARM (Raspberry Pi) y x86_64.

```
annotix-relay/
├── Cargo.toml
├── src/
│   ├── main.rs           ← CLI: annotix-relay --port 7654 --data ./relay_data
│   ├── server.rs         ← Servidor WebSocket (tokio + tungstenite)
│   ├── room.rs           ← Sala por proyecto (namespace)
│   ├── auth.rs           ← Tokens simples (create room → token, join → token)
│   ├── storage.rs        ← Persistir estado en disco (JSON)
│   └── protocol.rs       ← Mensajes binarios (MessagePack o JSON)
│
├── Dockerfile            ← Para Docker en cualquier máquina
└── README.md             ← Instrucciones de instalación
```

### Protocolo del relay

```
// Cliente → Server
JoinRoom { room_id, token, user_name }
LeaveRoom { room_id }
PushChanges { room_id, changes: Vec<FileChange> }
PullChanges { room_id, since: u64 }           // since = sequence number
PushBlob { room_id, blob_id, data: Vec<u8> }
PullBlob { room_id, blob_id }
LockImage { room_id, image_id }
UnlockImage { room_id, image_id }

// Server → Cliente
RoomJoined { peers: Vec<PeerInfo>, seq: u64 }
PeerJoined { peer: PeerInfo }
PeerLeft { peer_id }
ChangesAvailable { changes: Vec<FileChange>, seq: u64 }
BlobAvailable { blob_id }
ImageLocked { image_id, by: PeerInfo }
ImageUnlocked { image_id }
Error { code, message }
```

```rust
pub struct FileChange {
    path: String,           // "annotations/abc123.json" o "project.json"
    content: Vec<u8>,       // contenido del archivo
    hash: String,           // blake3
    timestamp: u64,         // epoch ms
    author: String,         // nombre del usuario
    seq: u64,               // número de secuencia (server-assigned)
}
```

### Flujo
1. **Host** crea una sala → recibe `room_id` + `host_token`.
2. **Host** comparte URL: `annotix://relay/192.168.1.50:7654/room_id` (o código corto).
3. **Colaborador** se une con el código → descarga proyecto inicial.
4. Cambios fluyen en tiempo real via WebSocket.
5. Si el relay se apaga → los clientes trabajan offline, re-sync al reconectar.

### Instalación para el usuario
```bash
# Opción 1: binario directo (Raspberry Pi)
curl -L https://github.com/.../annotix-relay-arm64 -o annotix-relay
chmod +x annotix-relay
./annotix-relay --port 7654

# Opción 2: Docker
docker run -d -p 7654:7654 -v ./data:/data annotix/relay

# Opción 3: Docker Compose con auto-start
# docker-compose.yml incluido
```

### Descubrimiento en LAN
- El relay anuncia su presencia con mDNS (`_annotix-relay._tcp`).
- Los clientes Annotix en la misma red lo detectan automáticamente.
- En Settings → Collaboration: "Relay detectado en 192.168.1.50:7654 — ¿Conectar?"

---

## Fase 5 — P2P directo (arreglar lo existente)

### Objetivo
Mantener la opción P2P directo para quienes no quieren ningún servidor. Arreglar los bugs críticos del sistema actual con Iroh.

### Bugs a corregir

1. **`start_doc_watcher()` nunca se llama** — Llamarlo después de `create_session()` y `join_session()`. Sin esto no hay sync en tiempo real.

2. **Validación de permisos en backend** — Agregar checks en cada comando de mutación (`p2p_sync_annotations`, `p2p_upload_image`, etc.) contra las `SessionRules`.

3. **Timeout en `join_session`** — Reemplazar `sleep(3s)` por polling con timeout configurable (30s default). Verificar que las entradas necesarias llegaron.

4. **Lock renewal automático** — Timer en el backend que renueva locks activos cada 10 min sin depender del frontend.

5. **Manejo de desconexión** — Detectar cuando un peer se va, liberar sus locks, actualizar UI.

6. **Gossip messages** — Implementar el sistema de mensajes gossip ya definido en `protocol.rs` para notificaciones ligeras (peer typing, cursor position, etc.) si se quiere en el futuro.

### Integración con el nuevo sync engine
- P2P se convierte en otro provider que implementa `SyncProvider`.
- Usa el mismo merge engine y conflict resolution de la Fase 1.
- Las anotaciones por imagen (Fase 0) hacen que los cambios sean granulares.

---

## Trait SyncProvider (interfaz común)

```rust
#[async_trait]
pub trait SyncProvider: Send + Sync {
    /// Nombre para mostrar en UI
    fn name(&self) -> &str;

    /// Inicializar el provider para un proyecto
    async fn init(&self, project_id: &str) -> Result<()>;

    /// Sincronizar cambios (push local + pull remoto)
    async fn sync(&self, project_id: &str) -> Result<SyncResult>;

    /// Estado actual de conexión/sync
    async fn status(&self) -> Result<SyncStatus>;

    /// Obtener cambios remotos pendientes
    async fn pull(&self, project_id: &str, since: u64) -> Result<Vec<FileChange>>;

    /// Enviar cambios locales
    async fn push(&self, project_id: &str, changes: Vec<FileChange>) -> Result<u64>;

    /// Limpiar recursos al desconectar
    async fn cleanup(&self) -> Result<()>;
}

pub enum SyncStatus {
    Disconnected,
    Connecting,
    Connected { peers: usize },
    Syncing { progress: f32 },
    Error { message: String },
}

pub struct SyncResult {
    pushed: usize,
    pulled: usize,
    conflicts: Vec<MergeConflict>,
}
```

Providers que lo implementan:
- `ExportImportProvider` — (Fase 1, manual)
- `FolderSyncProvider` — (Fase 2, file watcher)
- `GitProvider` — (Fase 3, git)
- `RelayProvider` — (Fase 4, WebSocket)
- `P2pProvider` — (Fase 5, Iroh directo)

---

## UI — Panel de colaboración

### En Settings → Collaboration
```
┌─────────────────────────────────────────────────────┐
│  Collaboration                                      │
│                                                     │
│  Method: [dropdown]                                 │
│    ○ None (local only)                              │
│    ○ Export / Import                                 │
│    ○ Shared folder (Dropbox, Drive, Syncthing...)   │
│    ○ Git sync                                       │
│    ○ Relay server                                   │
│    ○ P2P direct                                     │
│                                                     │
│  ── Relay servers ──────────────────────────         │
│  [+] Add server                                     │
│  • 192.168.1.50:7654 (LAN - auto-detected) ✓       │
│  • relay.myteam.com:7654                   ✓        │
│                                                     │
│  ── Identity ───────────────────────────────         │
│  Display name: [ Alice            ]                 │
│                                                     │
│  ── Conflict resolution ────────────────────        │
│  Default: ○ Ask me  ○ Last write wins  ○ Keep local │
│                                                     │
└─────────────────────────────────────────────────────┘
```

### En cada proyecto (ProjectCard / Toolbar)
```
┌──────────────────────────────────┐
│  [🔄 Sync] [👥 2 peers] [Status]│  ← toolbar
└──────────────────────────────────┘

Sync button:
  - Si export/import → menú: "Export" / "Import"
  - Si folder/git/relay/p2p → trigger sync manual
  - Indicador de último sync: "Synced 2 min ago"

Peers badge:
  - Click → lista de peers conectados
  - Quién está editando qué imagen
```

---

## Orden de implementación sugerido

| Fase | Qué | Esfuerzo | Valor |
|------|------|----------|-------|
| **0** | Refactor almacenamiento (annotations por imagen) | 2-3 días | Prerequisito |
| **1** | Export/Import con merge | 2-3 días | Alto (funciona inmediato) |
| **2** | Folder sync (file watcher) | 2-3 días | Alto (0 infra extra) |
| **5** | Fix P2P existente (bugs críticos) | 2-3 días | Medio (ya existe código) |
| **4** | Relay server | 4-5 días | Alto (opción self-hosted) |
| **3** | Git sync | 3-4 días | Medio (nicho técnico) |

**Total estimado: ~15-20 días de desarrollo.**

Fase 0 + 1 dan valor inmediato con mínimo esfuerzo.
Fase 2 es casi gratis si la Fase 0 está hecha.
Fase 4 (relay) es la más interesante para equipos.
Fase 5 (fix P2P) puede hacerse en paralelo.
Fase 3 (git) es la de menor prioridad — atractiva para técnicos pero nicho.

---

## Notas técnicas adicionales

### Seguridad
- Relay: tokens por sala (UUID random), opcionalmente contraseña.
- Relay: TLS opcional con `rustls` (o reverse proxy nginx/caddy).
- P2P: mantener el esquema de tickets de Iroh.
- Export: opción de ZIP encriptado (AES-256, `zip` crate lo soporta).

### Rendimiento
- Solo sincronizar archivos que cambiaron (change tracker con hashes).
- Imágenes: no re-enviar si ya existen en destino (comparar hash).
- Debounce en file watcher y en sync automático.
- Compresión en WebSocket (permessage-deflate).

### Offline-first
- Todos los providers trabajan offline por defecto.
- Los cambios se acumulan y sincronizan al reconectar.
- Queue de cambios pendientes persistida en `.sync/pending.json`.

### Testing
- El trait `SyncProvider` permite mock providers para tests.
- Relay server testeable con integration tests (spawn server + 2 clientes).
- Merge engine testeable unitariamente con JSON fixtures.
