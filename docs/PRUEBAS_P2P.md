# Plan de pruebas P2P

Pruebas manuales para validar los fixes del sistema P2P. No hay tests automáticos
que las cubran (los de `src-tauri/tests/p2p_transfer.rs` corren 2 endpoints en
loopback, no ejercitan discovery cross-network ni permisos por rol).

Contexto de los fixes a validar:
- **Discovery + endpoint online** (`p2p/node.rs`): `preset(N0)` + `endpoint.online()`
  antes de compartir tickets. Sin esto el ticket salía con direcciones vacías y el
  joiner nunca conectaba ("host offline").
- **Permiso en sync de anotaciones** (`commands/p2p_commands.rs`):
  `p2p_sync_annotations` exige permiso `Annotate`.
- **host_secret cifrado en reposo** (`p2p/crypto.rs`): secreto cifrado en
  `project.json`, clave en `~/.local/share/annotix/p2p/secret.key`.

---

## Prueba 1 — Conexión P2P entre dos redes distintas

**Objetivo:** confirmar que el discovery n0 + relay permiten conectar peers que NO
están en la misma LAN (NAT distinto). Es el escenario que estaba roto.

### Requisitos
- 2 máquinas en **redes distintas** (ej: una en casa, otra en datos móviles /
  hotspot, o una en VPN distinta). NO sirve misma LAN ni dos ventanas en el mismo PC.
- Build de la app con los fixes en ambas (`cargo tauri build` o dev).
- Acceso a internet en ambas (el relay de n0 debe ser alcanzable).

### Pasos
1. **Máquina A (host):**
   - Crear proyecto con al menos 3 imágenes y 2 clases.
   - Iniciar sesión P2P (rol Lead Researcher).
   - Copiar el **share code** (`ANN-...`) y el **host key** (`ANN-HOST-...`).
2. **Máquina B (colaborador):**
   - Unirse con el **share code**.
   - Verificar que aparece el estado: `connecting` → `syncing` → `connected`.
   - Confirmar que el proyecto aparece y las imágenes descargan (barra de progreso
     `p2p:download-progress` → `p2p:download-complete`).
3. **Presencia:** en A, abrir lista de peers → B debe aparecer **online**. En B, A
   debe aparecer online.

### Criterios de éxito
- [ ] B conecta en < 30s (no aparece "Timeout / host offline").
- [ ] Todas las imágenes llegan a B con `download_status: completed`.
- [ ] Ambos se ven mutuamente online en la lista de peers.
- [ ] Repetir uniéndose con **host key**: B obtiene rol Lead Researcher (verificación
      de secreto OK).

### Si falla
- Revisar logs (`RUST_LOG=info`): buscar `Nodo iroh iniciado. EndpointId:` y errores
  de relay/connect.
- Confirmar que `endpoint.online().await` no se cuelga (relay inalcanzable por
  firewall corporativo → probar otra red).
- Verificar que el ticket lleva relay URL: decodificar el share code y mirar el
  `AddrInfo` (debe traer al menos un relay).
- Caso borde: host detrás de NAT simétrico estricto → debe caer a relay, no a
  conexión directa. Confirmar que aun así transfiere.

### Variantes a cubrir
- [ ] **Resume tras reinicio:** cerrar la app del host, reabrir → auto-resume. B
      (que sigue abierto) debe re-sincronizar sin re-pegar código (valida discovery
      por NodeId con direcciones nuevas).
- [ ] **3 peers:** un tercer colaborador C descarga blobs desde A y B.

---

## Prueba 2 — Permisos por rol al sincronizar anotaciones

**Objetivo:** confirmar que `p2p_sync_annotations` respeta el permiso `Annotate`:
quien no puede anotar recibe error y NO escribe en el doc; quien sí puede, anota
normal y la anotación se propaga.

### Requisitos
- 2 instancias conectadas (puede ser misma LAN para esta prueba; el foco son
  permisos, no la red).
- Host (A) define reglas de sesión. Roles disponibles: Lead Researcher, Annotator,
  Data Curator.

### Pasos
1. **A (host):** crear sesión. Anotar una imagen y guardar → debe propagarse a B
   (host siempre tiene permiso, `LeadResearcher` retorna `Ok` directo).
2. **B como Annotator:**
   - B se une como Annotator (rol por defecto al usar share code).
   - B abre una imagen, dibuja una caja, guarda.
   - **Esperado:** la anotación se guarda y A la recibe (`p2p:annotation-received`).
3. **B sin permiso de anotar:**
   - Asignar a B un rol / regla que NO permita anotar. Opciones:
     - Cambiar rol de B a Data Curator (revisar `PeerRole::can_annotate()` en
       `p2p/mod.rs`: confirmar que devuelve `false` para ese rol).
   - B intenta guardar una anotación.
   - **Esperado:** error `"No tienes permiso para anotar en esta sesión"` y la
     anotación NO aparece en A.

### Criterios de éxito
- [ ] Host anota y propaga.
- [ ] Annotator anota y propaga.
- [ ] Rol sin permiso recibe el error exacto y el doc no cambia (verificar en A que
      no llegó `p2p:annotation-received` de esa imagen).
- [ ] Modo local (sin sesión P2P activa): anotar sigue funcionando sin restricción
      (`check_permission` retorna `Ok` si no hay sesión).

### Notas de implementación a verificar
- `commands/p2p_commands.rs` → `p2p_sync_annotations` llama
  `check_permission(Annotate)` ANTES de `sync_annotations_to_doc`.
- Revisar qué roles devuelven `can_annotate() == true` en `p2p/mod.rs` para elegir
  bien el rol "sin permiso" en el paso 3.

---

## Prueba extra (rápida) — Cifrado de host_secret en reposo

Validación de que el secreto no queda en texto plano. No requiere red.

1. Crear sesión P2P como host en un proyecto.
2. Abrir `{projects_dir}/{uuid}/project.json` y mirar `p2p.hostSecret`.
   - [ ] Debe empezar con `enc:` (no el hex de 64 chars en plano).
3. Confirmar que existe `~/.local/share/annotix/p2p/secret.key` con permisos `600`
   (unix: `ls -l` → `-rw-------`).
4. Reiniciar la app → auto-resume debe descifrar y reconectar sin pedir código.
   - [ ] La sesión se restaura (host key válido, secreto descifrado correctamente).
5. **Migración legacy:** con un `project.json` viejo cuyo `hostSecret` esté en texto
   plano (sin `enc:`), el resume debe seguir funcionando (pass-through).
