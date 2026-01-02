/**
 * CSV PARSER
 * Robust CSV parser with automatic delimiter and header detection
 */

class CSVParser {
    constructor() {
        this.commonDelimiters = [',', ';', '\t', '|'];
    }

    /**
     * Parse CSV text into structured data
     * @param {string} csvText - Raw CSV text
     * @param {Object} options - Parsing options
     * @returns {Object} Parsed data with metadata
     */
    async parse(csvText, options = {}) {
        const {
            delimiter = null,
            hasHeaders = null,
            encoding = 'utf-8'
        } = options;

        // Normalize line endings
        csvText = csvText.replace(/\r\n/g, '\n').replace(/\r/g, '\n');

        // Detect delimiter if not provided
        const detectedDelimiter = delimiter || this.detectDelimiter(csvText);

        // Parse all rows
        const allRows = this.parseRows(csvText, detectedDelimiter);

        if (allRows.length === 0) {
            throw new Error('CSV vacío o inválido');
        }

        // Detect headers if not specified
        const detectedHasHeaders = hasHeaders !== null ? hasHeaders : this.detectHeaders(allRows);

        // Extract headers and data rows
        let headers, dataRows;
        if (detectedHasHeaders) {
            headers = allRows[0];
            dataRows = allRows.slice(1);
        } else {
            // Generate column names: col_0, col_1, col_2, ...
            headers = allRows[0].map((_, i) => `col_${i}`);
            dataRows = allRows;
        }

        // Detect column types
        const columnTypes = this.detectColumnTypes(dataRows, headers);

        // Convert to objects
        const data = this.rowsToObjects(dataRows, headers, columnTypes);

        return {
            headers,
            data,
            rowCount: dataRows.length,
            columnCount: headers.length,
            delimiter: detectedDelimiter,
            hasHeaders: detectedHasHeaders,
            columnTypes,
            rawData: dataRows // Keep raw data for preview
        };
    }

    /**
     * Detect the most likely delimiter
     */
    detectDelimiter(csvText) {
        const firstLines = csvText.split('\n').slice(0, 5).join('\n');

        const counts = this.commonDelimiters.map(delim => {
            const lines = firstLines.split('\n');
            const countsPerLine = lines.map(line => {
                // Don't count delimiters inside quotes
                return (line.match(new RegExp(`(?![^"]*"[^"]*(?:"[^"]*"[^"]*)*$)\\${delim}`, 'g')) || []).length;
            });

            // Check consistency across lines
            const avgCount = countsPerLine.reduce((a, b) => a + b, 0) / countsPerLine.length;
            const variance = countsPerLine.reduce((sum, count) => sum + Math.pow(count - avgCount, 2), 0) / countsPerLine.length;

            return {
                delimiter: delim,
                avgCount,
                variance
            };
        });

        // Select delimiter with highest average count and lowest variance
        counts.sort((a, b) => {
            if (a.avgCount === 0) return 1;
            if (b.avgCount === 0) return -1;
            // Prefer higher count with lower variance
            return (b.avgCount / (b.variance + 1)) - (a.avgCount / (a.variance + 1));
        });

        return counts[0].delimiter;
    }

    /**
     * Detect if first row contains headers
     */
    detectHeaders(rows) {
        if (rows.length < 2) return false;

        const firstRow = rows[0];
        const secondRow = rows[1];

        // If first row has non-numeric values and second row has numeric values
        // it's likely headers
        let firstRowNonNumeric = 0;
        let secondRowNumeric = 0;

        for (let i = 0; i < Math.min(firstRow.length, secondRow.length); i++) {
            const first = firstRow[i];
            const second = secondRow[i];

            // Check if first value is non-numeric string
            if (first && isNaN(first) && first.trim() !== '') {
                firstRowNonNumeric++;
            }

            // Check if second value is numeric
            if (second && !isNaN(second) && second.trim() !== '') {
                secondRowNumeric++;
            }
        }

        // If majority of first row is non-numeric and second row is numeric
        return firstRowNonNumeric > firstRow.length / 2;
    }

    /**
     * Parse CSV text into rows (handling quoted values)
     */
    parseRows(csvText, delimiter) {
        const rows = [];
        const lines = csvText.split('\n');

        for (let line of lines) {
            line = line.trim();
            if (!line) continue; // Skip empty lines

            const row = this.parseLine(line, delimiter);
            rows.push(row);
        }

        return rows;
    }

    /**
     * Parse a single CSV line (handling quotes and escapes)
     */
    parseLine(line, delimiter) {
        const values = [];
        let current = '';
        let inQuotes = false;

        for (let i = 0; i < line.length; i++) {
            const char = line[i];
            const nextChar = line[i + 1];

            if (char === '"') {
                if (inQuotes && nextChar === '"') {
                    // Escaped quote
                    current += '"';
                    i++; // Skip next quote
                } else {
                    // Toggle quote state
                    inQuotes = !inQuotes;
                }
            } else if (char === delimiter && !inQuotes) {
                // End of value
                values.push(current.trim());
                current = '';
            } else {
                current += char;
            }
        }

        // Add last value
        values.push(current.trim());

        return values;
    }

    /**
     * Detect column types (number, date, string)
     */
    detectColumnTypes(rows, headers) {
        const types = {};
        const sampleSize = Math.min(100, rows.length);

        for (let colIdx = 0; colIdx < headers.length; colIdx++) {
            const header = headers[colIdx];
            const samples = [];

            for (let i = 0; i < sampleSize && i < rows.length; i++) {
                const value = rows[i][colIdx];
                if (value && value.trim() !== '') {
                    samples.push(value);
                }
            }

            types[header] = this.detectColumnType(samples);
        }

        return types;
    }

    /**
     * Detect type of a single column
     */
    detectColumnType(samples) {
        if (samples.length === 0) return 'string';

        let numericCount = 0;
        let dateCount = 0;

        for (const value of samples) {
            // Check if numeric
            if (!isNaN(value) && value.trim() !== '') {
                numericCount++;
            }
            // Check if date (basic check)
            else if (this.isDateLike(value)) {
                dateCount++;
            }
        }

        const numericRatio = numericCount / samples.length;
        const dateRatio = dateCount / samples.length;

        if (numericRatio > 0.8) return 'number';
        if (dateRatio > 0.8) return 'date';
        return 'string';
    }

    /**
     * Check if string looks like a date
     */
    isDateLike(value) {
        // Common date patterns
        const datePatterns = [
            /^\d{4}-\d{2}-\d{2}/, // ISO: 2024-01-01
            /^\d{2}\/\d{2}\/\d{4}/, // US: 01/01/2024
            /^\d{2}-\d{2}-\d{4}/, // EU: 01-01-2024
            /^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}/, // ISO DateTime
        ];

        return datePatterns.some(pattern => pattern.test(value));
    }

    /**
     * Convert rows to array of objects
     */
    rowsToObjects(rows, headers, columnTypes) {
        return rows.map(row => {
            const obj = {};
            headers.forEach((header, i) => {
                let value = row[i] || '';

                // Convert to appropriate type
                if (columnTypes[header] === 'number' && value !== '') {
                    value = parseFloat(value);
                } else if (columnTypes[header] === 'date' && value !== '') {
                    value = new Date(value);
                }

                obj[header] = value;
            });
            return obj;
        });
    }

    /**
     * Read file as text
     */
    async readFileAsText(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = (e) => resolve(e.target.result);
            reader.onerror = (e) => reject(e);
            reader.readAsText(file);
        });
    }

    /**
     * Parse CSV file
     */
    async parseFile(file, options = {}) {
        const text = await this.readFileAsText(file);
        const result = await this.parse(text, options);
        result.filename = file.name;
        result.filesize = file.size;
        result.lastModified = file.lastModified;
        return result;
    }

    /**
     * Get preview data (first N rows)
     */
    getPreviewData(parsedData, rowCount = 10) {
        return {
            headers: parsedData.headers,
            rows: parsedData.rawData.slice(0, rowCount),
            totalRows: parsedData.rowCount
        };
    }
}

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = CSVParser;
}
