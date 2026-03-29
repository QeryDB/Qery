import { Download } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem } from '@/components/ui/dropdown-menu';
import type { QueryResult } from '@/types/query';

interface Props {
  result: QueryResult;
}

export function ExportButton({ result }: Props) {
  const { t } = useTranslation();
  const downloadCSV = () => {
    const header = result.columns.map((c) => c.name).join(',');
    const rows = result.rows.map((row) =>
      result.columns.map((c) => {
        const val = String(row[c.name] ?? '');
        return val.includes(',') || val.includes('"') || val.includes('\n')
          ? `"${val.replace(/"/g, '""')}"`
          : val;
      }).join(',')
    );
    const csv = [header, ...rows].join('\n');
    download(csv, 'export.csv', 'text/csv');
  };

  const downloadJSON = () => {
    const json = JSON.stringify(result.rows, null, 2);
    download(json, 'export.json', 'application/json');
  };

  const download = (content: string, filename: string, type: string) => {
    const blob = new Blob([content], { type });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="sm" className="h-6 text-xs gap-1">
          <Download className="h-3 w-3" />
          {t('export.export')}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent>
        <DropdownMenuItem onClick={downloadCSV}>{t('export.exportCsv')}</DropdownMenuItem>
        <DropdownMenuItem onClick={downloadJSON}>{t('export.exportJson')}</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
