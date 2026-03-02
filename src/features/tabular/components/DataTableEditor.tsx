import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

interface DataTableEditorProps {
  columns: string[];
  initialRows: string[][];
  onSave: (rows: string[][]) => Promise<void>;
}

export function DataTableEditor({ columns, initialRows, onSave }: DataTableEditorProps) {
  const { t } = useTranslation();
  const [rows, setRows] = useState<string[][]>(initialRows);
  const [rowIds, setRowIds] = useState<string[]>(() => initialRows.map(() => crypto.randomUUID()));
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setRows(initialRows);
    setRowIds(initialRows.map(() => crypto.randomUUID()));
  }, [initialRows]);

  const handleCellChange = (rowIndex: number, colIndex: number, value: string) => {
    setRows(rows.map((row, i) =>
      i === rowIndex ? row.map((cell, j) => j === colIndex ? value : cell) : row
    ));
  };

  const addRow = () => {
    setRows([...rows, new Array(columns.length).fill('')]);
    setRowIds(ids => [...ids, crypto.randomUUID()]);
  };

  const removeRow = (index: number) => {
    setRows(rows.filter((_, i) => i !== index));
    setRowIds(ids => ids.filter((_, i) => i !== index));
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await onSave(rows);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h3 className="text-sm font-medium">{t('tabular.editor.title', 'Edit Data')}</h3>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={addRow}>
            <i className="fas fa-plus mr-1"></i>
            {t('tabular.editor.addRow', 'Add Row')}
          </Button>
          <Button size="sm" onClick={handleSave} disabled={saving}>
            {saving ? <i className="fas fa-spinner fa-spin mr-1"></i> : <i className="fas fa-save mr-1"></i>}
            {t('common.save')}
          </Button>
        </div>
      </div>

      <div className="rounded-md border overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-10">#</TableHead>
              {columns.map((col) => (
                <TableHead key={col}>{col}</TableHead>
              ))}
              <TableHead className="w-10"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row, rowIndex) => (
              <TableRow key={rowIds[rowIndex]}>
                <TableCell className="text-xs text-muted-foreground">{rowIndex + 1}</TableCell>
                {row.map((cell, colIndex) => (
                  <TableCell key={colIndex} className="p-1">
                    <Input
                      value={cell}
                      onChange={(e) => handleCellChange(rowIndex, colIndex, e.target.value)}
                      className="h-8 text-xs border-transparent focus:border-input"
                    />
                  </TableCell>
                ))}
                <TableCell className="p-1">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 text-destructive"
                    onClick={() => removeRow(rowIndex)}
                  >
                    <i className="fas fa-times text-xs"></i>
                  </Button>
                </TableCell>
              </TableRow>
            ))}
            {rows.length === 0 && (
              <TableRow>
                <TableCell colSpan={columns.length + 2} className="text-center py-8 text-muted-foreground">
                  {t('tabular.editor.noRows', 'No rows yet. Click "Add Row" to start.')}
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
