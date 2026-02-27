/// Comandos de filesystem para operaciones que el frontend necesita
/// (complementa el plugin tauri-plugin-fs que maneja diálogos desde JS)

#[tauri::command]
pub fn read_text_file(path: String) -> Result<String, String> {
    std::fs::read_to_string(&path)
        .map_err(|e| format!("Error leyendo archivo: {}", e))
}

#[tauri::command]
pub fn read_binary_file(path: String) -> Result<Vec<u8>, String> {
    std::fs::read(&path)
        .map_err(|e| format!("Error leyendo archivo: {}", e))
}

#[tauri::command]
pub fn write_binary_file(path: String, data: Vec<u8>) -> Result<(), String> {
    // Crear directorio padre si no existe
    if let Some(parent) = std::path::Path::new(&path).parent() {
        std::fs::create_dir_all(parent)
            .map_err(|e| format!("Error creando directorio: {}", e))?;
    }

    std::fs::write(&path, &data)
        .map_err(|e| format!("Error escribiendo archivo: {}", e))
}
