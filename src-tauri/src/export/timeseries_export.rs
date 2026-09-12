//! Exportación de proyectos de series temporales.
//!
//! Hasta ahora los nueve tipos de proyecto de serie temporal no tenían ninguna
//! salida: se podía importar un CSV y anotarlo, y las anotaciones no salían del
//! `project.json`. Estos dos formatos cubren las dos formas de consumirlas:
//!
//! - `timeseries-csv`: un CSV por serie con los datos y una columna `label`
//!   por punto, más `annotations.csv` con las anotaciones en bruto. Es lo que
//!   espera pandas y lo que consumen los backends de entrenamiento.
//! - `timeseries-json`: un JSON por serie con datos y anotaciones juntos,
//!   para quien prefiera tratarlas como documentos.

use std::io::{Seek, Write};
use std::path::Path;

use zip::write::SimpleFileOptions;
use zip::ZipWriter;

use crate::store::project_file::{ProjectFile, TimeSeriesEntry, TsAnnotationEntry};

/// Lee los datos de una serie: del archivo propio, o del campo incrustado si el
/// proyecto aún no se ha migrado.
fn read_series_data(project_dir: &Path, ts: &TimeSeriesEntry) -> Option<serde_json::Value> {
    if let Some(data) = &ts.data {
        return Some(data.clone());
    }
    let path = project_dir.join("timeseries").join(format!("{}.json", ts.id));
    let content = std::fs::read(path).ok()?;
    serde_json::from_slice(&content).ok()
}

fn class_name(project: &ProjectFile, class_id: Option<i64>) -> String {
    class_id
        .and_then(|cid| project.classes.iter().find(|c| c.id == cid))
        .map(|c| c.name.clone())
        .unwrap_or_default()
}

/// Escapa un campo para CSV (comillas y separadores dentro del valor).
fn csv_field(value: &str) -> String {
    if value.contains(',') || value.contains('"') || value.contains('\n') {
        format!("\"{}\"", value.replace('"', "\"\""))
    } else {
        value.to_string()
    }
}

/// Etiqueta de un punto según las anotaciones de la serie. Un rango cubre su
/// intervalo; punto, evento y anomalía marcan su propia marca de tiempo; la
/// clasificación global etiqueta la serie entera.
fn label_at(ts: &TimeSeriesEntry, project: &ProjectFile, timestamp: f64) -> String {
    for ann in &ts.annotations {
        let hit = match ann.annotation_type.as_str() {
            "range" => {
                let start = ann.data.get("startTimestamp").and_then(|v| v.as_f64());
                let end = ann.data.get("endTimestamp").and_then(|v| v.as_f64());
                matches!((start, end), (Some(s), Some(e))
                    if timestamp >= s.min(e) && timestamp <= s.max(e))
            }
            "classification" => true,
            _ => ann
                .data
                .get("timestamp")
                .and_then(|v| v.as_f64())
                .map(|t| (t - timestamp).abs() < f64::EPSILON)
                .unwrap_or(false),
        };
        if hit {
            let name = class_name(project, ann.class_id);
            return if name.is_empty() {
                ann.annotation_type.clone()
            } else {
                name
            };
        }
    }
    String::new()
}

/// Serializa una celda de valor. `null` (hueco declarado al importar) sale como
/// celda vacía, que pandas lee como NaN, en vez de como un cero inventado.
fn value_cell(v: Option<&serde_json::Value>) -> String {
    match v.and_then(|v| v.as_f64()) {
        Some(f) => f.to_string(),
        None => String::new(),
    }
}

struct SeriesShape<'a> {
    timestamps: &'a Vec<serde_json::Value>,
    values: Option<&'a Vec<serde_json::Value>>,
    multivariate: bool,
    column_names: Vec<String>,
}

fn shape_of<'a>(data: &'a serde_json::Value, ts: &TimeSeriesEntry) -> Option<SeriesShape<'a>> {
    let timestamps = data.get("timestamps")?.as_array()?;
    let values = data.get("values").and_then(|v| v.as_array());
    let multivariate = values
        .and_then(|v| v.first())
        .map(|f| f.is_array())
        .unwrap_or(false);

    let column_names: Vec<String> = match data.get("columns").and_then(|c| c.as_array()) {
        Some(cols) => cols
            .iter()
            .map(|c| c.as_str().unwrap_or("value").to_string())
            .collect(),
        None if multivariate => (0..values.map(|v| v.len()).unwrap_or(0))
            .map(|i| format!("value_{}", i + 1))
            .collect(),
        None => vec![ts
            .columns
            .as_ref()
            .and_then(|c| c.first().cloned())
            .unwrap_or_else(|| "value".to_string())],
    };

    Some(SeriesShape {
        timestamps,
        values,
        multivariate,
        column_names,
    })
}

fn series_csv(data: &serde_json::Value, ts: &TimeSeriesEntry, project: &ProjectFile) -> String {
    let Some(shape) = shape_of(data, ts) else {
        return String::new();
    };

    let mut header = vec!["timestamp".to_string()];
    header.extend(shape.column_names.iter().map(|c| csv_field(c)));
    header.push("label".to_string());
    let mut lines = vec![header.join(",")];

    for (i, ts_value) in shape.timestamps.iter().enumerate() {
        let timestamp = ts_value.as_f64().unwrap_or(i as f64);
        let mut row = vec![timestamp.to_string()];

        if shape.multivariate {
            if let Some(series_arrays) = shape.values {
                for serie in series_arrays {
                    row.push(value_cell(serie.as_array().and_then(|a| a.get(i))));
                }
            }
        } else {
            row.push(value_cell(shape.values.and_then(|a| a.get(i))));
        }

        row.push(csv_field(&label_at(ts, project, timestamp)));
        lines.push(row.join(","));
    }

    lines.join("\n")
}

/// Una fila por anotación, con las columnas de todos los tipos. Las que no
/// aplican a un tipo quedan vacías.
fn annotations_csv(project: &ProjectFile) -> String {
    let mut lines = vec![
        "series_id,series_name,annotation_id,type,class_id,class_name,timestamp,value,start_timestamp,end_timestamp,event_type,score,label"
            .to_string(),
    ];

    for ts in &project.timeseries {
        for ann in &ts.annotations {
            let get = |k: &str| -> String {
                ann.data
                    .get(k)
                    .map(|v| match v {
                        serde_json::Value::String(s) => s.clone(),
                        serde_json::Value::Null => String::new(),
                        other => other.to_string(),
                    })
                    .unwrap_or_default()
            };

            let row = vec![
                csv_field(&ts.id),
                csv_field(&ts.name),
                csv_field(&ann.id),
                csv_field(&ann.annotation_type),
                ann.class_id.map(|c| c.to_string()).unwrap_or_default(),
                csv_field(&class_name(project, ann.class_id)),
                get("timestamp"),
                get("value"),
                get("startTimestamp"),
                get("endTimestamp"),
                csv_field(&get("eventType")),
                get("score"),
                csv_field(&get("label")),
            ];
            lines.push(row.join(","));
        }
    }

    lines.join("\n")
}

fn series_json(
    data: &serde_json::Value,
    ts: &TimeSeriesEntry,
    project: &ProjectFile,
) -> serde_json::Value {
    let annotations: Vec<serde_json::Value> = ts
        .annotations
        .iter()
        .map(|a: &TsAnnotationEntry| {
            serde_json::json!({
                "id": a.id,
                "type": a.annotation_type,
                "classId": a.class_id,
                "className": class_name(project, a.class_id),
                "data": a.data,
            })
        })
        .collect();

    serde_json::json!({
        "id": ts.id,
        "name": ts.name,
        "status": ts.status,
        "pointCount": ts.point_count,
        "seriesCount": ts.series_count,
        "columns": ts.columns,
        "data": data,
        "annotations": annotations,
    })
}

pub fn export<W: Write + Seek, F: Fn(f64)>(
    project: &ProjectFile,
    project_dir: &Path,
    writer: W,
    format: &str,
    emit_progress: F,
) -> Result<(), String> {
    if project.timeseries.is_empty() {
        return Err("No hay series temporales en el proyecto".to_string());
    }

    let mut zip = ZipWriter::new(writer);
    let options = SimpleFileOptions::default().compression_method(zip::CompressionMethod::Deflated);

    let total = project.timeseries.len();
    let mut exported = 0usize;

    for (idx, ts) in project.timeseries.iter().enumerate() {
        let Some(data) = read_series_data(project_dir, ts) else {
            log::warn!("Serie {} sin datos legibles, se omite de la exportación", ts.id);
            continue;
        };

        // El nombre puede repetirse entre series; el id las desambigua.
        let safe_name = crate::store::safe_path::sanitize_filename(&ts.name);
        let stem = if safe_name.is_empty() {
            ts.id.clone()
        } else {
            format!("{}_{}", safe_name, ts.id)
        };

        match format {
            "timeseries-csv" => {
                zip.start_file(format!("series/{}.csv", stem), options)
                    .map_err(|e| e.to_string())?;
                zip.write_all(series_csv(&data, ts, project).as_bytes())
                    .map_err(|e| e.to_string())?;
            }
            "timeseries-json" => {
                zip.start_file(format!("series/{}.json", stem), options)
                    .map_err(|e| e.to_string())?;
                let json = serde_json::to_string_pretty(&series_json(&data, ts, project))
                    .map_err(|e| e.to_string())?;
                zip.write_all(json.as_bytes()).map_err(|e| e.to_string())?;
            }
            other => return Err(format!("Formato de serie temporal no soportado: {}", other)),
        }

        exported += 1;
        emit_progress((idx + 1) as f64 / total as f64 * 90.0);
    }

    if exported == 0 {
        return Err("Ninguna serie temporal del proyecto tiene datos legibles".to_string());
    }

    // annotations.csv: todas las anotaciones en bruto, también en el export JSON
    zip.start_file("annotations.csv", options)
        .map_err(|e| e.to_string())?;
    zip.write_all(annotations_csv(project).as_bytes())
        .map_err(|e| e.to_string())?;

    // classes.csv
    let mut classes_csv = "id,name,color\n".to_string();
    for c in &project.classes {
        classes_csv.push_str(&format!(
            "{},{},{}\n",
            c.id,
            csv_field(&c.name),
            csv_field(&c.color)
        ));
    }
    zip.start_file("classes.csv", options)
        .map_err(|e| e.to_string())?;
    zip.write_all(classes_csv.as_bytes())
        .map_err(|e| e.to_string())?;

    // metadata.json
    let metadata = serde_json::json!({
        "project": project.name,
        "type": project.project_type,
        "format": format,
        "seriesCount": exported,
        "annotationCount": project.timeseries.iter().map(|t| t.annotations.len()).sum::<usize>(),
    });
    zip.start_file("metadata.json", options)
        .map_err(|e| e.to_string())?;
    zip.write_all(
        serde_json::to_string_pretty(&metadata)
            .unwrap_or_default()
            .as_bytes(),
    )
    .map_err(|e| e.to_string())?;

    zip.finish().map_err(|e| e.to_string())?;
    emit_progress(100.0);
    Ok(())
}
