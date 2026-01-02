import { TimeSeriesData } from '@/lib/db';

export interface CSVParseOptions {
  hasHeader?: boolean;
  timestampColumn?: number;  // Column index for timestamps (default: 0)
  valueColumns?: number[];   // Column indices for values (default: all except timestamp)
  delimiter?: string;        // Default: ','
}

export interface CSVParseResult {
  data: TimeSeriesData;
  headers: string[];
  rowCount: number;
  columnCount: number;
}

/**
 * Parse CSV file to TimeSeriesData
 */
export async function parseCSV(
  file: File,
  options: CSVParseOptions = {}
): Promise<CSVParseResult> {
  const {
    hasHeader = true,
    timestampColumn = 0,
    valueColumns,
    delimiter = ',',
  } = options;

  const text = await file.text();
  const lines = text
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  if (lines.length === 0) {
    throw new Error('CSV file is empty');
  }

  // Parse header
  let headers: string[] = [];
  let startRow = 0;

  if (hasHeader) {
    headers = lines[0].split(delimiter).map((h) => h.trim());
    startRow = 1;
  } else {
    // Generate default headers
    const columnCount = lines[0].split(delimiter).length;
    headers = Array.from({ length: columnCount }, (_, i) => `Column ${i + 1}`);
  }

  const columnCount = headers.length;

  // Determine value columns
  const selectedValueColumns =
    valueColumns ||
    Array.from({ length: columnCount }, (_, i) => i).filter(
      (i) => i !== timestampColumn
    );

  if (selectedValueColumns.length === 0) {
    throw new Error('No value columns selected');
  }

  // Parse data
  const timestamps: number[] = [];
  const values: number[][] = Array.from({ length: selectedValueColumns.length }, () => []);
  const columns = selectedValueColumns.map((i) => headers[i]);

  for (let i = startRow; i < lines.length; i++) {
    const cells = lines[i].split(delimiter).map((c) => c.trim());

    if (cells.length !== columnCount) {
      console.warn(`Row ${i + 1} has ${cells.length} columns, expected ${columnCount}. Skipping.`);
      continue;
    }

    // Parse timestamp
    const timestampValue = parseFloat(cells[timestampColumn]);
    if (isNaN(timestampValue)) {
      console.warn(`Row ${i + 1}: Invalid timestamp value "${cells[timestampColumn]}". Skipping.`);
      continue;
    }
    timestamps.push(timestampValue);

    // Parse values
    selectedValueColumns.forEach((colIndex, valueIndex) => {
      const value = parseFloat(cells[colIndex]);
      if (isNaN(value)) {
        console.warn(`Row ${i + 1}, Column ${colIndex + 1}: Invalid numeric value "${cells[colIndex]}". Using 0.`);
        values[valueIndex].push(0);
      } else {
        values[valueIndex].push(value);
      }
    });
  }

  if (timestamps.length === 0) {
    throw new Error('No valid data rows found in CSV');
  }

  // Create TimeSeriesData
  const data: TimeSeriesData = {
    timestamps,
    values: values.length === 1 ? values[0] : values,
    columns: values.length > 1 ? columns : undefined,
  };

  return {
    data,
    headers,
    rowCount: timestamps.length,
    columnCount,
  };
}

/**
 * Validate CSV format
 */
export function validateCSV(text: string, delimiter: string = ','): {
  valid: boolean;
  error?: string;
  rowCount: number;
  columnCount: number;
} {
  const lines = text
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  if (lines.length === 0) {
    return { valid: false, error: 'CSV file is empty', rowCount: 0, columnCount: 0 };
  }

  const firstLineCols = lines[0].split(delimiter).length;

  // Check all rows have same column count
  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split(delimiter).length;
    if (cols !== firstLineCols) {
      return {
        valid: false,
        error: `Inconsistent column count at row ${i + 1}: expected ${firstLineCols}, got ${cols}`,
        rowCount: lines.length,
        columnCount: firstLineCols,
      };
    }
  }

  return {
    valid: true,
    rowCount: lines.length,
    columnCount: firstLineCols,
  };
}
