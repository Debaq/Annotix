use std::path::{Path, PathBuf};

/// Devuelve solo el último componente del path, eliminando separadores y nullbytes.
/// Garantiza que el resultado no contiene `/`, `\`, `..` ni `\0`.
pub fn sanitize_filename(name: &str) -> String {
    let last = Path::new(name)
        .file_name()
        .and_then(|s| s.to_str())
        .unwrap_or("");
    let cleaned: String = last
        .chars()
        .map(|c| match c {
            '/' | '\\' | '\0' => '_',
            _ => c,
        })
        .collect();
    let trimmed = cleaned.trim_start_matches('.').to_string();
    if trimmed.is_empty() || trimmed == "." || trimmed == ".." {
        "file".to_string()
    } else {
        trimmed
    }
}

/// Une `base` + `name` y verifica que el resultado quede dentro de `base`.
/// Falla si `name` intenta escape vía `..` o paths absolutos.
/// El archivo no necesita existir; canonicaliza solo el `base` y el parent del candidato.
pub fn safe_join(base: &Path, name: &str) -> Result<PathBuf, String> {
    let safe = sanitize_filename(name);
    let candidate = base.join(&safe);

    let base_canon = base
        .canonicalize()
        .map_err(|e| format!("base inválida {:?}: {}", base, e))?;

    let parent = candidate.parent().unwrap_or(base);
    let parent_canon = parent
        .canonicalize()
        .map_err(|e| format!("parent inválido: {}", e))?;
    if !parent_canon.starts_with(&base_canon) {
        return Err(format!("path traversal detectado: {:?}", candidate));
    }
    Ok(parent_canon.join(&safe))
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;

    #[test]
    fn sanitize_strips_separators() {
        assert_eq!(sanitize_filename("../../etc/passwd"), "passwd");
        assert_eq!(sanitize_filename("foo/bar.png"), "bar.png");
        assert_eq!(sanitize_filename("foo\\bar.png"), "foo_bar.png");
        assert_eq!(sanitize_filename("a\0b"), "a_b");
        assert_eq!(sanitize_filename(".."), "file");
        assert_eq!(sanitize_filename(""), "file");
        assert_eq!(sanitize_filename("normal.jpg"), "normal.jpg");
    }

    #[test]
    fn safe_join_rejects_traversal() {
        let tmp = tempfile::tempdir().unwrap();
        let base = tmp.path();
        let result = safe_join(base, "../../../etc/passwd").unwrap();
        assert!(result.starts_with(base));
        assert!(result.ends_with("passwd"));
    }

    #[test]
    fn safe_join_normal_name() {
        let tmp = tempfile::tempdir().unwrap();
        let base = tmp.path();
        fs::create_dir_all(base).unwrap();
        let result = safe_join(base, "image.png").unwrap();
        assert_eq!(result, base.canonicalize().unwrap().join("image.png"));
    }
}
