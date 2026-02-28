use std::process::Command;

use super::{GpuDevice, GpuInfo};
use super::python_env;

/// Detecta GPUs disponibles usando Python + torch
pub fn detect_gpu() -> Result<GpuInfo, String> {
    let python = python_env::venv_python()?;

    if !python.exists() {
        return Ok(GpuInfo {
            cuda_available: false,
            cuda_version: None,
            gpus: vec![],
            mps_available: false,
        });
    }

    let script = r#"
import json
result = {"cuda_available": False, "cuda_version": None, "gpus": [], "mps_available": False}
try:
    import torch
    result["cuda_available"] = torch.cuda.is_available()
    if result["cuda_available"]:
        result["cuda_version"] = torch.version.cuda
        for i in range(torch.cuda.device_count()):
            props = torch.cuda.get_device_properties(i)
            result["gpus"].append({
                "index": i,
                "name": props.name,
                "memory_total": props.total_mem,
                "memory_free": props.total_mem
            })
    # Check MPS (Apple Silicon)
    if hasattr(torch.backends, "mps"):
        result["mps_available"] = torch.backends.mps.is_available()
except Exception:
    pass
print(json.dumps(result))
"#;

    let output = Command::new(&python)
        .args(["-c", script])
        .output()
        .map_err(|e| format!("Error detectando GPU: {}", e))?;

    if !output.status.success() {
        return Ok(GpuInfo {
            cuda_available: false,
            cuda_version: None,
            gpus: vec![],
            mps_available: false,
        });
    }

    let stdout = String::from_utf8_lossy(&output.stdout);
    let info: serde_json::Value = serde_json::from_str(stdout.trim())
        .unwrap_or_default();

    let cuda_available = info["cuda_available"].as_bool().unwrap_or(false);
    let cuda_version = info["cuda_version"].as_str().map(|s| s.to_string());
    let mps_available = info["mps_available"].as_bool().unwrap_or(false);

    let gpus = info["gpus"]
        .as_array()
        .map(|arr| {
            arr.iter()
                .filter_map(|g| {
                    Some(GpuDevice {
                        index: g["index"].as_u64()? as u32,
                        name: g["name"].as_str()?.to_string(),
                        memory_total: g["memory_total"].as_u64().unwrap_or(0),
                        memory_free: g["memory_free"].as_u64().unwrap_or(0),
                    })
                })
                .collect()
        })
        .unwrap_or_default();

    Ok(GpuInfo {
        cuda_available,
        cuda_version,
        gpus,
        mps_available,
    })
}
