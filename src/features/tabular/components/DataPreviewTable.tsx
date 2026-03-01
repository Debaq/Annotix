import { useTranslation } from 'react-i18next';

interface DataPreviewTableProps {
  columns: string[];
  rows: string[][];
  totalRows: number;
  targetColumn: string | null;
  featureColumns: string[];
}

export function DataPreviewTable({ columns, rows, totalRows, targetColumn, featureColumns }: DataPreviewTableProps) {
  const { t } = useTranslation();

  const getColumnStyle = (col: string) => {
    if (col === targetColumn) return 'bg-emerald-50 text-emerald-800 font-semibold';
    if (featureColumns.length > 0 && featureColumns.includes(col)) return 'bg-blue-50 text-blue-800';
    if (featureColumns.length > 0 && !featureColumns.includes(col)) return 'opacity-40';
    return '';
  };

  return (
    <div className="overflow-auto max-h-[400px] rounded border">
      <table className="w-full text-xs">
        <thead className="bg-muted/50 sticky top-0">
          <tr>
            <th className="px-2 py-1.5 text-left font-medium text-muted-foreground border-r">#</th>
            {columns.map(col => (
              <th key={col} className={`px-2 py-1.5 text-left font-medium border-r whitespace-nowrap ${getColumnStyle(col)}`}>
                {col}
                {col === targetColumn && (
                  <i className="fas fa-bullseye ml-1 text-emerald-600 text-[10px]"></i>
                )}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i} className="border-t hover:bg-muted/30">
              <td className="px-2 py-1 text-muted-foreground border-r">{i + 1}</td>
              {row.map((cell, j) => (
                <td key={j} className={`px-2 py-1 border-r truncate max-w-[200px] ${getColumnStyle(columns[j])}`}>
                  {cell || <span className="text-muted-foreground/50 italic">null</span>}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      {rows.length < totalRows && (
        <div className="px-3 py-2 text-xs text-muted-foreground bg-muted/30 border-t">
          {t('tabular.showingRows', { shown: rows.length, total: totalRows.toLocaleString() })}
        </div>
      )}
    </div>
  );
}
