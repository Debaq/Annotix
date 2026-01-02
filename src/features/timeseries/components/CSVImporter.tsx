import { useState, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Upload, FileText, Check } from 'lucide-react';
import { useCurrentProject } from '../../projects/hooks/useCurrentProject';
import { useTimeSeries } from '../hooks/useTimeSeries';
import { parseCSV, validateCSV } from '../services/csvParser';

export function CSVImporter() {
  const { t } = useTranslation();
  const { project } = useCurrentProject();
  const { addTimeSeries, reload } = useTimeSeries();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [file, setFile] = useState<File | null>(null);
  const [hasHeader, setHasHeader] = useState(true);
  const [timestampColumn, setTimestampColumn] = useState(0);
  const [importing, setImporting] = useState(false);
  const [success, setSuccess] = useState(false);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (selectedFile && selectedFile.name.endsWith('.csv')) {
      setFile(selectedFile);
      setSuccess(false);
    }
  };

  const handleImport = async () => {
    if (!file || !project?.id) return;

    setImporting(true);
    try {
      // Validate CSV
      const text = await file.text();
      const validation = validateCSV(text);
      if (!validation.valid) {
        alert(`Invalid CSV: ${validation.error}`);
        setImporting(false);
        return;
      }

      // Parse CSV
      const result = await parseCSV(file, {
        hasHeader,
        timestampColumn,
      });

      // Create time series
      await addTimeSeries({
        projectId: project.id,
        name: file.name.replace('.csv', ''),
        data: result.data,
        annotations: [],
        metadata: {
          uploaded: Date.now(),
          status: 'pending',
        },
      });

      setSuccess(true);
      setFile(null);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
      await reload();
    } catch (error) {
      console.error('Failed to import CSV:', error);
      alert(`Failed to import CSV: ${error}`);
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
          <div className="flex items-center gap-2 p-3 bg-green-50 dark:bg-green-950 rounded-lg text-green-900 dark:text-green-100">
            <Check className="w-4 h-4" />
            <span className="text-sm">{t('timeseries.importSuccess')}</span>
          </div>
        )}

        {/* File Input */}
        <div className="space-y-2">
          <Label>{t('timeseries.selectCSV')}</Label>
          <Input
            ref={fileInputRef}
            type="file"
            accept=".csv"
            onChange={handleFileSelect}
            disabled={importing}
          />
          {file && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <FileText className="w-4 h-4" />
              <span>{file.name}</span>
            </div>
          )}
        </div>

        {/* Options */}
        {file && (
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
          disabled={!file || importing}
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
