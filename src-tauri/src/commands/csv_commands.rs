use serde::{Deserialize, Serialize};

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
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CSVValidation {
    pub valid: bool,
    pub error: Option<String>,
    pub row_count: usize,
    pub column_count: usize,
}

#[tauri::command]
pub fn parse_csv(file_path: String, options: CSVParseOptions) -> Result<CSVParseResult, String> {
    let text = std::fs::read_to_string(&file_path)
        .map_err(|e| format!("Error leyendo archivo CSV: {}", e))?;

    let has_header = options.has_header.unwrap_or(true);
    let timestamp_column = options.timestamp_column.unwrap_or(0);
    let delimiter = options.delimiter.as_deref().unwrap_or(",");

    let lines: Vec<&str> = text
        .lines()
        .map(|l| l.trim())
        .filter(|l| !l.is_empty())
        .collect();

    if lines.is_empty() {
        return Err("CSV file is empty".to_string());
    }

    // Parse header
    let (headers, start_row) = if has_header {
        let hdrs: Vec<String> = lines[0].split(delimiter).map(|h| h.trim().to_string()).collect();
        (hdrs, 1)
    } else {
        let col_count = lines[0].split(delimiter).count();
        let hdrs: Vec<String> = (0..col_count).map(|i| format!("Column {}", i + 1)).collect();
        (hdrs, 0)
    };

    let column_count = headers.len();

    // Determine value columns
    let value_columns: Vec<usize> = options.value_columns.unwrap_or_else(|| {
        (0..column_count).filter(|&i| i != timestamp_column).collect()
    });

    if value_columns.is_empty() {
        return Err("No value columns selected".to_string());
    }

    // Parse data
    let mut timestamps: Vec<f64> = Vec::new();
    let mut values: Vec<Vec<f64>> = vec![Vec::new(); value_columns.len()];
    let columns: Vec<String> = value_columns.iter().map(|&i| headers.get(i).cloned().unwrap_or_default()).collect();

    for line in &lines[start_row..] {
        let cells: Vec<&str> = line.split(delimiter).map(|c| c.trim()).collect();

        if cells.len() != column_count {
            continue;
        }

        let ts: f64 = match cells.get(timestamp_column).and_then(|c| c.parse().ok()) {
            Some(v) => v,
            None => continue,
        };
        timestamps.push(ts);

        for (vi, &col_idx) in value_columns.iter().enumerate() {
            let val: f64 = cells.get(col_idx).and_then(|c| c.parse().ok()).unwrap_or(0.0);
            values[vi].push(val);
        }
    }

    if timestamps.is_empty() {
        return Err("No valid data rows found in CSV".to_string());
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
    })
}

#[tauri::command]
pub fn validate_csv(file_path: String, delimiter: Option<String>) -> Result<CSVValidation, String> {
    let text = std::fs::read_to_string(&file_path)
        .map_err(|e| format!("Error leyendo archivo CSV: {}", e))?;

    let delim = delimiter.as_deref().unwrap_or(",");

    let lines: Vec<&str> = text
        .lines()
        .map(|l| l.trim())
        .filter(|l| !l.is_empty())
        .collect();

    if lines.is_empty() {
        return Ok(CSVValidation {
            valid: false,
            error: Some("CSV file is empty".to_string()),
            row_count: 0,
            column_count: 0,
        });
    }

    let first_col_count = lines[0].split(delim).count();

    for (i, line) in lines.iter().enumerate().skip(1) {
        let cols = line.split(delim).count();
        if cols != first_col_count {
            return Ok(CSVValidation {
                valid: false,
                error: Some(format!(
                    "Inconsistent column count at row {}: expected {}, got {}",
                    i + 1, first_col_count, cols
                )),
                row_count: lines.len(),
                column_count: first_col_count,
            });
        }
    }

    Ok(CSVValidation {
        valid: true,
        error: None,
        row_count: lines.len(),
        column_count: first_col_count,
    })
}
