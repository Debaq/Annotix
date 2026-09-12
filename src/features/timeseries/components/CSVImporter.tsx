import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { invoke } from '@tauri-apps/api/core';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Upload, FileText, Check, AlertTriangle } from 'lucide-react';
import { useCurrentProject } from '../../projects/hooks/useCurrentProject';
import { useTimeSeries } from '../hooks/useTimeSeries';
import { pickCsvFile } from '@/lib/nativeDialogs';

interface CSVParseReport {
  skippedMalformed: number;
  skippedBadTimestamp: number;
  missingValues: number;
  /** 'numeric' | 'datetime' | 'rowIndex' */
  timestampFormat: string;
}

interface CSVParseResult {
  timestamps: number[];
  values: (number | null)[] | (number | null)[][];
  columns?: string[];
  headers: string[];
  rowCount: number;
  columnCount: number;
  report: CSVParseReport;
}

interface CSVValidation {
  valid: boolean;
  error?: string;
  rowCount: number;
  columnCount: number;
}

/** Quita la extensión .csv solo del final del nombre. */
function stripCsvExtension(name: string): string {
  return name.replace(/\.csv$/i, '');
}

export function CSVImporter() {
  const { t } = useTranslation();
  const { project } = useCurrentProject();
  const { addTimeSeries } = useTimeSeries();

  const [filePath, setFilePath] = useState<string | null>(null);
  const [fileName, setFileName] = useState('');
  const [hasHeader, setHasHeader] = useState(true);
  const [timestampColumn, setTimestampColumn] = useState(0);
  const [importing, setImporting] = useState(false);
  const [success, setSuccess] = useState(false);
  const [report, setReport] = useState<(CSVParseReport & { rowCount: number }) | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleSelectFile = async () => {
    const path = await pickCsvFile();
    if (path) {
      setFilePath(path);
      setFileName(path.split('/').pop() || path.split('\\').pop() || path);
      setSuccess(false);
      setError(null);
      setReport(null);
    }
  };

  const handleImport = async () => {
    if (!filePath || !project?.id) return;

    setImporting(true);
    setError(null);
    setReport(null);
    try {
      // Validate CSV via Rust
      const validation = await invoke<CSVValidation>('validate_csv', {
        filePath,
      });
      if (!validation.valid) {
        setError(t('timeseries.invalidCsv', { error: validation.error }));
        setImporting(false);
        return;
      }

      // Parse CSV via Rust
      const result = await invoke<CSVParseResult>('parse_csv', {
        filePath,
        options: {
          hasHeader,
          timestampColumn,
        },
      });

      await addTimeSeries(stripCsvExtension(fileName), {
        timestamps: result.timestamps,
        values: result.values,
        columns: result.columns,
      });

      setSuccess(true);
      setReport({ ...result.report, rowCount: result.rowCount });
      setFilePath(null);
      setFileName('');
    } catch (err) {
      console.error('Failed to import CSV:', err);
      // `alert()` bloquea el webview y deja la aplicación sin responder al
      // resto de eventos; el error se muestra dentro del propio importador.
      setError(String(err));
    } finally {
      setImporting(false);
    }
  };

  if (!project) {
    return (
      <div className="p-4 text-center text-sm text-muted-foreground">
        {t('timeseries.noProjectSelected')}
      </div>
    );
  }

  return (
    <Card className="p-6">
      <div className="space-y-4">
        <div className="flex items-center gap-2">
          <Upload className="w-5 h-5" />
          <h3 className="text-lg font-semibold">{t('timeseries.importCSV')}</h3>
        </div>

        {success && (
          <div className="space-y-1 p-3 bg-green-50 dark:bg-green-950 rounded-lg text-green-900 dark:text-green-100">
            <div className="flex items-center gap-2">
              <Check className="w-4 h-4" />
              <span className="text-sm">{t('timeseries.importSuccess')}</span>
            </div>
            {report && (
              <ul className="text-xs space-y-0.5 pl-6 list-disc">
                <li>
                  {t('timeseries.report.rows', { count: report.rowCount })} ·{' '}
                  {t(`timeseries.report.format.${report.timestampFormat}`)}
                </li>
                {report.skippedBadTimestamp > 0 && (
                  <li>{t('timeseries.report.badTimestamp', { count: report.skippedBadTimestamp })}</li>
                )}
                {report.skippedMalformed > 0 && (
                  <li>{t('timeseries.report.malformed', { count: report.skippedMalformed })}</li>
                )}
                {report.missingValues > 0 && (
                  <li>{t('timeseries.report.missing', { count: report.missingValues })}</li>
                )}
              </ul>
            )}
          </div>
        )}

        {error && (
          <div className="flex items-start gap-2 p-3 bg-red-50 dark:bg-red-950 rounded-lg text-red-900 dark:text-red-100">
            <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
            <span className="text-sm break-words">{error}</span>
          </div>
        )}

        {/* File Select Button */}
        <div className="space-y-2">
          <Label>{t('timeseries.selectCSV')}</Label>
          <Button
            variant="outline"
            onClick={handleSelectFile}
            disabled={importing}
            className="w-full justify-start"
          >
            <Upload className="w-4 h-4 mr-2" />
            {fileName || t('timeseries.selectCSV')}
          </Button>
          {fileName && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <FileText className="w-4 h-4" />
              <span>{fileName}</span>
            </div>
          )}
        </div>

        {/* Options */}
        {filePath && (
          <>
            <div className="flex items-center space-x-2">
              <Checkbox
                id="has-header"
                checked={hasHeader}
                onCheckedChange={(checked) => setHasHeader(checked as boolean)}
              />
              <label htmlFor="has-header" className="text-sm cursor-pointer">
                {t('timeseries.hasHeader')}
              </label>
            </div>

            <div className="space-y-2">
              <Label htmlFor="timestamp-column">
                {t('timeseries.timestampColumn')}
              </Label>
              <Input
                id="timestamp-column"
                type="number"
                min="0"
                value={timestampColumn}
                onChange={(e) => setTimestampColumn(parseInt(e.target.value) || 0)}
              />
              <p className="text-xs text-muted-foreground">
                {t('timeseries.timestampColumnHelp')}
              </p>
            </div>
          </>
        )}

        {/* Import Button */}
        <Button
          onClick={handleImport}
          disabled={!filePath || importing}
          className="w-full"
        >
          {importing ? (
            <>{t('common.importing')}...</>
          ) : (
            <>
              <Upload className="w-4 h-4 mr-2" />
              {t('timeseries.import')}
            </>
          )}
        </Button>

        {/* Info */}
        <div className="p-3 bg-blue-50 dark:bg-blue-950 rounded-lg text-sm">
          <p className="text-blue-900 dark:text-blue-100">
            {t('timeseries.csvFormatInfo')}
          </p>
        </div>
      </div>
    </Card>
  );
}
