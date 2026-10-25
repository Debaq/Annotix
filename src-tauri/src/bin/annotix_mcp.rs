//! Servidor MCP de Annotix (stdio). Ver `annotix_lib::mcp`.
fn main() {
    if let Err(e) = annotix_lib::mcp::run_stdio() {
        eprintln!("annotix-mcp: {}", e);
        std::process::exit(1);
    }
}
