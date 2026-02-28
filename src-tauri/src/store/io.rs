use std::path::Path;

use super::project_file::ProjectFile;

pub fn read_project(dir: &Path) -> Result<ProjectFile, String> {
    let path = dir.join("project.json");
    if !path.exists() {
        return Err(format!("project.json no encontrado en {:?}", dir));
    }
    let content = std::fs::read_to_string(&path)
        .map_err(|e| format!("Error leyendo project.json: {}", e))?;
    let project: ProjectFile = serde_json::from_str(&content)
        .map_err(|e| format!("Error parseando project.json: {}", e))?;
    Ok(project)
}

pub fn write_project(dir: &Path, data: &ProjectFile) -> Result<(), String> {
    let path = dir.join("project.json");
    let tmp_path = dir.join("project.json.tmp");

    let content = serde_json::to_string_pretty(data)
        .map_err(|e| format!("Error serializando project.json: {}", e))?;

    // Escritura atómica: escribir a .tmp y luego renombrar
    std::fs::write(&tmp_path, &content)
        .map_err(|e| format!("Error escribiendo project.json.tmp: {}", e))?;

    std::fs::rename(&tmp_path, &path)
        .map_err(|e| format!("Error renombrando project.json.tmp: {}", e))?;

    Ok(())
}
