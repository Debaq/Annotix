use serde::{Deserialize, Serialize};

/// Tope de tamaño de CSV. La serie entera acaba en memoria y se envía al
/// frontend, así que un archivo arbitrariamente grande tumba la aplicación.
const MAX_CSV_BYTES: u64 = 256 * 1024 * 1024;

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CSVParseOptions {
    pub has_header: Option<bool>,
    pub timestamp_column: Option<usize>,
    pub value_columns: Option<Vec<usize>>,
    pub delimiter: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CSVParseResult {
    pub timestamps: Vec<f64>,
    pub values: serde_json::Value, // Single array or array of arrays
    pub columns: Option<Vec<String>>,
    pub headers: Vec<String>,
    pub row_count: usize,
    pub column_count: usize,
    /// Informe de lo que el parseo tuvo que descartar o rellenar. Antes todo
    /// esto pasaba en silencio: filas saltadas sin avisar y celdas no numéricas
    /// convertidas en 0.0, que en una serie entra como un cero real.
    pub report: CSVParseReport,
}

#[derive(Debug, Default, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CSVParseReport {
    /// Filas descartadas por tener un número de columnas distinto al de la cabecera
    pub skipped_malformed: usize,
    /// Filas descartadas porque su marca de tiempo no se pudo interpretar
    pub skipped_bad_timestamp: usize,
    /// Celdas de valor vacías o no numéricas, que quedan como hueco (null)
    pub missing_values: usize,
    /// Formato con el que se interpretaron las marcas de tiempo
    pub timestamp_format: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CSVValidation {
    pub valid: bool,
    pub error: Option<String>,
    pub row_count: usize,
    pub column_count: usize,
}

fn delimiter_byte(delimiter: Option<&str>) -> Result<u8, String> {
    let d = delimiter.unwrap_or(",");
    let bytes = d.as_bytes();
    match bytes.len() {
        1 => Ok(bytes[0]),
        // "\t" puede llegar escapado desde el frontend
        2 if d == "\\t" => Ok(b'\t'),
        _ => Err(format!("Delimitador no soportado: {:?}", d)),
    }
}

fn check_size(file_path: &str) -> Result<(), String> {
    let meta = std::fs::metadata(file_path)
        .map_err(|e| format!("Error leyendo archivo CSV: {}", e))?;
    if meta.len() > MAX_CSV_BYTES {
        return Err(format!(
            "El CSV pesa {:.1} MB y el máximo admitido es {} MB",
            meta.len() as f64 / (1024.0 * 1024.0),
            MAX_CSV_BYTES / (1024 * 1024)
        ));
    }
    Ok(())
}

fn reader(
    file_path: &str,
    delimiter: u8,
) -> Result<csv::Reader<std::io::BufReader<std::fs::File>>, String> {
    let file = std::fs::File::open(file_path)
        .map_err(|e| format!("Error leyendo archivo CSV: {}", e))?;
    Ok(csv::ReaderBuilder::new()
        .delimiter(delimiter)
        .has_headers(false) // la cabecera se gestiona a mano
        .flexible(true) // las filas irregulares se cuentan, no abortan el parseo
        .from_reader(std::io::BufReader::new(file)))
}

/// Cómo se interpretó la columna de marcas de tiempo.
#[derive(Debug, Clone, Copy, PartialEq)]
enum TimestampKind {
    /// Ya es un número (epoch, índice, segundos…)
    Numeric,
    /// Fecha u hora ISO-8601 o similar, convertida a milisegundos epoch
    DateTime,
    /// Sin columna de tiempo utilizable: se usa el número de fila
    RowIndex,
}

impl TimestampKind {
    fn label(self) -> &'static str {
        match self {
            TimestampKind::Numeric => "numeric",
            TimestampKind::DateTime => "datetime",
            TimestampKind::RowIndex => "rowIndex",
        }
    }
}

/// Formatos de fecha aceptados, en orden de preferencia. Cubren lo que
/// producen pandas, Excel y la mayoría de exportadores de series.
const DATE_FORMATS: &[&str] = &[
    "%Y-%m-%d %H:%M:%S%.f",
    "%Y-%m-%dT%H:%M:%S%.f",
    "%Y-%m-%d %H:%M:%S",
    "%Y-%m-%dT%H:%M:%S",
    "%Y-%m-%d %H:%M",
    "%Y-%m-%dT%H:%M",
    "%Y-%m-%d",
    "%d/%m/%Y %H:%M:%S",
    "%d/%m/%Y %H:%M",
    "%d/%m/%Y",
    "%m/%d/%Y %H:%M:%S",
    "%m/%d/%Y",
    "%Y/%m/%d",
];

/// Convierte una marca de tiempo a milisegundos epoch. Acepta RFC-3339 (con
/// zona horaria) y los formatos de `DATE_FORMATS` (interpretados como UTC).
fn parse_datetime_ms(raw: &str) -> Option<f64> {
    use chrono::{NaiveDate, NaiveDateTime, TimeZone, Utc};

    if let Ok(dt) = chrono::DateTime::parse_from_rfc3339(raw) {
        return Some(dt.timestamp_millis() as f64);
    }

    for fmt in DATE_FORMATS {
        if let Ok(dt) = NaiveDateTime::parse_from_str(raw, fmt) {
            return Some(Utc.from_utc_datetime(&dt).timestamp_millis() as f64);
        }
        if let Ok(d) = NaiveDate::parse_from_str(raw, fmt) {
            return Some(
                Utc.from_utc_datetime(&d.and_hms_opt(0, 0, 0)?)
                    .timestamp_millis() as f64,
            );
        }
    }

    None
}

/// Interpreta una celda de tiempo según el tipo detectado.
fn parse_timestamp(raw: &str, kind: TimestampKind) -> Option<f64> {
    match kind {
        TimestampKind::Numeric => raw.parse::<f64>().ok().filter(|v| v.is_finite()),
        TimestampKind::DateTime => parse_datetime_ms(raw),
        TimestampKind::RowIndex => None,
    }
}

/// Decide cómo leer la columna de tiempo mirando las primeras filas de datos.
fn detect_timestamp_kind(samples: &[String]) -> TimestampKind {
    let mut numeric = 0usize;
    let mut datetime = 0usize;

    for raw in samples {
        let raw = raw.trim();
        if raw.is_empty() {
            continue;
        }
        if raw.parse::<f64>().map(|v| v.is_finite()).unwrap_or(false) {
            numeric += 1;
        } else if parse_datetime_ms(raw).is_some() {
            datetime += 1;
        }
    }

    if numeric == 0 && datetime == 0 {
        TimestampKind::RowIndex
    } else if datetime > numeric {
        TimestampKind::DateTime
    } else {
        TimestampKind::Numeric
    }
}

#[tauri::command]
pub fn parse_csv(file_path: String, options: CSVParseOptions) -> Result<CSVParseResult, String> {
    check_size(&file_path)?;
    let delimiter = delimiter_byte(options.delimiter.as_deref())?;
    let has_header = options.has_header.unwrap_or(true);
    let timestamp_column = options.timestamp_column.unwrap_or(0);

    // Primera pasada: cabecera y muestra de la columna de tiempo
    let mut rdr = reader(&file_path, delimiter)?;
    let mut records = rdr.records();

    let first = loop {
        match records.next() {
            Some(Ok(r)) if r.iter().all(|c| c.trim().is_empty()) => continue,
            Some(Ok(r)) => break Some(r),
            Some(Err(e)) => return Err(format!("Error leyendo CSV: {}", e)),
            None => break None,
        }
    };

    let Some(first) = first else {
        return Err("CSV file is empty".to_string());
    };

    let headers: Vec<String> = if has_header {
        first.iter().map(|h| h.trim().to_string()).collect()
    } else {
        (0..first.len()).map(|i| format!("Column {}", i + 1)).collect()
    };

    let column_count = headers.len();

    let value_columns: Vec<usize> = options.value_columns.unwrap_or_else(|| {
        (0..column_count).filter(|&i| i != timestamp_column).collect()
    });

    if value_columns.is_empty() {
        return Err("No value columns selected".to_string());
    }

    // Muestra de la columna de tiempo para detectar su formato
    let mut samples: Vec<String> = Vec::new();
    if !has_header {
        if let Some(cell) = first.get(timestamp_column) {
            samples.push(cell.to_string());
        }
    }
    {
        let mut rdr = reader(&file_path, delimiter)?;
        let skip = if has_header { 1 } else { 0 };
        for (i, rec) in rdr.records().enumerate() {
            if i < skip {
                continue;
            }
            let Ok(rec) = rec else { continue };
            if let Some(cell) = rec.get(timestamp_column) {
                samples.push(cell.to_string());
            }
            if samples.len() >= 20 {
                break;
            }
        }
    }

    let ts_kind = detect_timestamp_kind(&samples);

    // Segunda pasada: datos
    let mut timestamps: Vec<f64> = Vec::new();
    let mut values: Vec<Vec<Option<f64>>> = vec![Vec::new(); value_columns.len()];
    let columns: Vec<String> = value_columns
        .iter()
        .map(|&i| headers.get(i).cloned().unwrap_or_default())
        .collect();
    let mut report = CSVParseReport {
        timestamp_format: ts_kind.label().to_string(),
        ..Default::default()
    };

    let mut rdr = reader(&file_path, delimiter)?;
    let skip = if has_header { 1 } else { 0 };

    for (row_idx, rec) in rdr.records().enumerate() {
        if row_idx < skip {
            continue;
        }
        let rec = match rec {
            Ok(r) => r,
            Err(_) => {
                report.skipped_malformed += 1;
                continue;
            }
        };
        if rec.iter().all(|c| c.trim().is_empty()) {
            continue;
        }
        if rec.len() != column_count {
            report.skipped_malformed += 1;
            continue;
        }

        let ts = match ts_kind {
            TimestampKind::RowIndex => timestamps.len() as f64,
            kind => {
                let raw = rec.get(timestamp_column).unwrap_or("").trim();
                match parse_timestamp(raw, kind) {
                    Some(v) => v,
                    None => {
                        report.skipped_bad_timestamp += 1;
                        continue;
                    }
                }
            }
        };
        timestamps.push(ts);

        for (vi, &col_idx) in value_columns.iter().enumerate() {
            let raw = rec.get(col_idx).unwrap_or("").trim();
            // Hueco explícito en vez de 0.0: un cero inventado sesga cualquier
            // estadística posterior y es indistinguible de un dato real.
            let parsed = raw
                .parse::<f64>()
                .ok()
                .filter(|v| v.is_finite());
            if parsed.is_none() {
                report.missing_values += 1;
            }
            values[vi].push(parsed);
        }
    }

    if timestamps.is_empty() {
        let detail = if report.skipped_bad_timestamp > 0 {
            format!(
                " ({} filas con marca de tiempo ilegible en la columna {})",
                report.skipped_bad_timestamp, timestamp_column
            )
        } else {
            String::new()
        };
        return Err(format!("No valid data rows found in CSV{}", detail));
    }

    let row_count = timestamps.len();

    // Build values JSON: single array if 1 column, array of arrays if multiple
    let values_json = if values.len() == 1 {
        serde_json::to_value(&values[0]).unwrap_or_default()
    } else {
        serde_json::to_value(&values).unwrap_or_default()
    };

    let columns_result = if values.len() > 1 { Some(columns) } else { None };

    Ok(CSVParseResult {
        timestamps,
        values: values_json,
        columns: columns_result,
        headers,
        row_count,
        column_count,
        report,
    })
}

#[tauri::command]
pub fn validate_csv(file_path: String, delimiter: Option<String>) -> Result<CSVValidation, String> {
    check_size(&file_path)?;
    let delim = delimiter_byte(delimiter.as_deref())?;

    let mut rdr = reader(&file_path, delim)?;
    let mut first_col_count: Option<usize> = None;
    let mut row_count = 0usize;
    let mut irregular: Option<(usize, usize)> = None;

    for (i, rec) in rdr.records().enumerate() {
        let rec = match rec {
            Ok(r) => r,
            Err(e) => {
                return Ok(CSVValidation {
                    valid: false,
                    error: Some(format!("Error de formato en la fila {}: {}", i + 1, e)),
                    row_count,
                    column_count: first_col_count.unwrap_or(0),
                })
            }
        };
        if rec.iter().all(|c| c.trim().is_empty()) {
            continue;
        }
        row_count += 1;
        match first_col_count {
            None => first_col_count = Some(rec.len()),
            Some(expected) if rec.len() != expected && irregular.is_none() => {
                irregular = Some((i + 1, rec.len()));
            }
            _ => {}
        }
    }

    let Some(column_count) = first_col_count else {
        return Ok(CSVValidation {
            valid: false,
            error: Some("CSV file is empty".to_string()),
            row_count: 0,
            column_count: 0,
        });
    };

    // Una fila irregular no invalida el archivo: se descarta al parsear y el
    // informe lo dice. Antes esto abortaba la importación entera, y con campos
    // entre comillas pasaba en CSV perfectamente válidos.
    if let Some((row, got)) = irregular {
        log::info!(
            "CSV con filas irregulares: fila {} tiene {} columnas, se esperaban {}",
            row,
            got,
            column_count
        );
    }

    Ok(CSVValidation {
        valid: true,
        error: None,
        row_count,
        column_count,
    })
}
