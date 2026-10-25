//! Servidor MCP de Annotix: una capa fina sobre `store`, `audit` y `agreement`.
//!
//! Lo usa un agente de IA (Claude Code, por stdio) para el trabajo administrativo
//! y repetitivo —crear el proyecto, importar imágenes y pre-etiquetas, repartir
//! lecturas, medir el acuerdo, exportar— sin abrir la interfaz. **El agente no es
//! un lector**: no hay herramienta que cree, edite o borre las anotaciones de un
//! lector ni que adjudique, y mientras una sesión ciega no esté resuelta nada de
//! lo que devuelve permite reconstruir lo que anotó cada lector.
//!
//! Estructura: `ops/` tiene una función por herramienta sobre [`AppState`];
//! `server` habla JSON-RPC por stdio y registra cada llamada en `audit.jsonl`.
//! Lo que el formato del proyecto no tiene (reglas de lectura fuera de P2P,
//! asignación local, hashes de importación) vive en el archivo `mcp.json` junto a
//! `project.json`, que el resto de la app ignora.

pub mod meta;
pub mod ops;
pub mod server;

#[cfg(test)]
mod tests;

pub use server::run_stdio;
