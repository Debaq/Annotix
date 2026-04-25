use std::net::SocketAddr;

use rand::RngCore;
use serde::Serialize;
use tokio::sync::RwLock;
use tokio::task::JoinHandle;

use super::routes;

/// Info devuelta al frontend desktop
#[derive(Debug, Clone, Serialize)]
pub struct ServeInfo {
    #[serde(rename = "projectIds")]
    pub project_ids: Vec<String>,
    pub port: u16,
    pub urls: Vec<String>,
    pub active: bool,
    pub reachable: bool,
    #[serde(rename = "firewallHelp")]
    pub firewall_help: String,
    #[serde(rename = "autoSave")]
    pub auto_save: bool,
    pub token: String,
}

struct ServeSession {
    project_ids: Vec<String>,
    port: u16,
    local_ips: Vec<String>,
    auto_save: bool,
    token: String,
    shutdown_tx: tokio::sync::watch::Sender<bool>,
    handle: JoinHandle<()>,
}

fn generate_token() -> String {
    let mut bytes = [0u8; 32];
    rand::rngs::OsRng.fill_bytes(&mut bytes);
    bytes.iter().map(|b| format!("{:02x}", b)).collect()
}

fn urls_with_token(ips: &[String], port: u16, token: &str) -> Vec<String> {
    ips.iter()
        .map(|ip| format!("http://{}:{}/?token={}", ip, port, token))
        .collect()
}

/// Estado gestionado por Tauri para el servidor HTTP
pub struct ServeState {
    inner: RwLock<Option<ServeSession>>,
}

impl ServeState {
    pub fn new() -> Self {
        Self { inner: RwLock::new(None) }
    }

    pub async fn get_auto_save(&self) -> bool {
        self.inner.read().await.as_ref().map_or(false, |s| s.auto_save)
    }

    pub async fn set_auto_save(&self, value: bool) {
        if let Some(s) = self.inner.write().await.as_mut() {
            s.auto_save = value;
        }
    }

    pub async fn start(
        &self,
        app_handle: tauri::AppHandle,
        project_ids: Vec<String>,
        port: u16,
        auto_save: bool,
    ) -> Result<ServeInfo, String> {
        if project_ids.is_empty() {
            return Err("Debes seleccionar al menos un proyecto".to_string());
        }

        self.stop().await?;

        let local_ips = get_local_ips();
        let (shutdown_tx, shutdown_rx) = tokio::sync::watch::channel(false);
        let token = generate_token();

        let router = routes::build_router(project_ids.clone(), app_handle, token.clone());

        // Intentar el puerto solicitado; si está ocupado, buscar uno libre
        let listener = find_available_port(port).await
            .map_err(|e| format!("No se encontró un puerto disponible: {}", e))?;

        let actual_port = listener.local_addr()
            .map_err(|e| e.to_string())?
            .port();

        let handle = tokio::spawn(async move {
            let server = axum::serve(listener, router)
                .with_graceful_shutdown(async move {
                    let mut rx = shutdown_rx;
                    while !*rx.borrow() {
                        if rx.changed().await.is_err() { break; }
                    }
                });
            let _ = server.await;
        });

        let urls = urls_with_token(&local_ips, actual_port, &token);

        tokio::time::sleep(std::time::Duration::from_millis(200)).await;
        let reachable = self_check_tcp(&local_ips, actual_port).await;
        let firewall_help = get_firewall_help(actual_port);

        let info = ServeInfo {
            project_ids: project_ids.clone(),
            port: actual_port,
            urls: urls.clone(),
            active: true,
            reachable,
            firewall_help,
            auto_save,
            token: token.clone(),
        };

        *self.inner.write().await = Some(ServeSession {
            project_ids,
            port: actual_port,
            local_ips,
            auto_save,
            token,
            shutdown_tx,
            handle,
        });

        log::info!("Servidor de anotación iniciado en {:?}", urls);
        Ok(info)
    }

    pub async fn stop(&self) -> Result<(), String> {
        let session = self.inner.write().await.take();
        if let Some(session) = session {
            let _ = session.shutdown_tx.send(true);
            let _ = tokio::time::timeout(
                std::time::Duration::from_secs(5),
                session.handle,
            ).await;
            log::info!("Servidor de anotación detenido");
        }
        Ok(())
    }

    pub async fn status(&self) -> Option<ServeInfo> {
        let guard = self.inner.read().await;
        let session = guard.as_ref()?;
        let reachable = self_check_tcp(&session.local_ips, session.port).await;
        Some(ServeInfo {
            project_ids: session.project_ids.clone(),
            port: session.port,
            urls: urls_with_token(&session.local_ips, session.port, &session.token),
            active: true,
            reachable,
            firewall_help: get_firewall_help(session.port),
            auto_save: session.auto_save,
            token: session.token.clone(),
        })
    }
}

// ─── Puerto disponible ─────────────────────────────────────────────────────

/// Intenta abrir el puerto solicitado; si está ocupado prueba hasta 10 puertos consecutivos
async fn find_available_port(preferred: u16) -> Result<tokio::net::TcpListener, String> {
    for offset in 0..10u16 {
        let port = preferred.saturating_add(offset);
        let addr = SocketAddr::from(([0, 0, 0, 0], port));
        match tokio::net::TcpListener::bind(addr).await {
            Ok(listener) => {
                if offset > 0 {
                    log::info!("Puerto {} ocupado, usando {} en su lugar", preferred, port);
                }
                return Ok(listener);
            }
            Err(_) if offset < 9 => continue,
            Err(e) => return Err(format!("Puertos {}-{} ocupados: {}", preferred, port, e)),
        }
    }
    unreachable!()
}

// ─── Self-check TCP (best-effort) ──────────────────────────────────────────

async fn self_check_tcp(ips: &[String], port: u16) -> bool {
    for ip in ips {
        if ip == "127.0.0.1" { continue; }
        let addr: SocketAddr = match format!("{}:{}", ip, port).parse() {
            Ok(a) => a, Err(_) => continue,
        };
        match tokio::time::timeout(
            std::time::Duration::from_secs(2),
            tokio::net::TcpStream::connect(addr),
        ).await {
            Ok(Ok(_)) => return true,
            _ => return false,
        }
    }
    false
}

// ─── Firewall help por SO ───────────────────────────────────────────────────

fn get_firewall_help(port: u16) -> String {
    #[cfg(target_os = "linux")]
    { get_firewall_help_linux(port) }

    #[cfg(target_os = "windows")]
    { get_firewall_help_windows(port) }

    #[cfg(target_os = "macos")]
    { get_firewall_help_macos(port) }

    #[cfg(not(any(target_os = "linux", target_os = "windows", target_os = "macos")))]
    { format!("Si los dispositivos no pueden conectarse, verifica que el puerto {} no esté bloqueado por el firewall.", port) }
}

#[cfg(target_os = "linux")]
fn get_firewall_help_linux(port: u16) -> String {
    let fw = detect_active_firewall_linux();
    match fw.as_deref() {
        Some("firewalld") => format!(
            "Se detectó firewalld activo. Si los dispositivos no pueden conectarse, ejecuta:\n\
             sudo firewall-cmd --add-port={}/tcp\n\n\
             Para que sea permanente:\n\
             sudo firewall-cmd --add-port={}/tcp --permanent && sudo firewall-cmd --reload",
            port, port
        ),
        Some("ufw") => format!("Se detectó ufw activo. Si los dispositivos no pueden conectarse, ejecuta:\nsudo ufw allow {}/tcp", port),
        Some("nftables") => format!("Se detectó nftables activo. Si los dispositivos no pueden conectarse, ejecuta:\nsudo nft add rule inet filter input tcp dport {} accept", port),
        Some("iptables") => format!("Se detectó iptables activo. Si los dispositivos no pueden conectarse, ejecuta:\nsudo iptables -A INPUT -p tcp --dport {} -j ACCEPT", port),
        _ => format!(
            "Si los dispositivos no pueden conectarse, el firewall puede estar bloqueando el puerto {}. Según tu firewall:\n\
             • firewalld: sudo firewall-cmd --add-port={}/tcp\n\
             • ufw: sudo ufw allow {}/tcp\n\
             • iptables: sudo iptables -A INPUT -p tcp --dport {} -j ACCEPT",
            port, port, port, port
        ),
    }
}

#[cfg(target_os = "linux")]
fn detect_active_firewall_linux() -> Option<String> {
    for name in &["firewalld", "ufw", "nftables", "iptables"] {
        if let Ok(output) = std::process::Command::new("systemctl").args(["is-active", name]).output() {
            if String::from_utf8_lossy(&output.stdout).trim() == "active" {
                return Some(name.to_string());
            }
        }
    }
    None
}

#[cfg(target_os = "windows")]
fn get_firewall_help_windows(port: u16) -> String {
    format!(
        "Si los dispositivos no pueden conectarse, Windows Firewall puede estar bloqueando el puerto. Opciones:\n\n\
         1. Cuando aparezca el diálogo de Windows Firewall, haz click en \"Permitir acceso\"\n\n\
         2. O abre PowerShell como Administrador y ejecuta:\n\
         New-NetFirewallRule -DisplayName \"Annotix\" -Direction Inbound -Protocol TCP -LocalPort {} -Action Allow\n\n\
         3. O desde Panel de Control → Firewall de Windows → Configuración avanzada → Reglas de entrada → Nueva regla → Puerto → TCP {} → Permitir",
        port, port
    )
}

#[cfg(target_os = "macos")]
fn get_firewall_help_macos(port: u16) -> String {
    format!(
        "Si los dispositivos no pueden conectarse, el firewall de macOS puede estar bloqueando el puerto.\n\n\
         1. Si aparece un diálogo pidiendo permiso de red, haz click en \"Permitir\"\n\n\
         2. O ve a Configuración del Sistema → Red → Firewall → Opciones → agrega Annotix como app permitida\n\n\
         Puerto usado: {}",
        port
    )
}

// ─── Detectar IP local ─────────────────────────────────────────────────────

fn get_local_ips() -> Vec<String> {
    let mut ips = Vec::new();
    if let Ok(socket) = std::net::UdpSocket::bind("0.0.0.0:0") {
        if socket.connect("8.8.8.8:80").is_ok() {
            if let Ok(addr) = socket.local_addr() {
                let ip = addr.ip().to_string();
                if ip != "0.0.0.0" { ips.push(ip); }
            }
        }
    }
    if ips.is_empty() { ips.push("127.0.0.1".to_string()); }
    ips
}
