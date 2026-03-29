import type { ColumnInfo } from '@/types/schema';
import type { ColumnDetail } from '@/lib/column-alias-parser';
import { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider } from '@/components/ui/tooltip';
import { Key, Link, StickyNote } from 'lucide-react';
import { cn } from '@/lib/utils';

interface Props {
  columns: ColumnInfo[];
  columnNotes?: Map<string, string>;
  columnDetails?: ColumnDetail[];
  defaultSchema?: string;
  onNavigate?: (schema: string, name: string, objectType: 'table' | 'view') => void;
}

export function ColumnsTab({ columns, columnNotes, columnDetails, defaultSchema = 'dbo', onNavigate }: Props) {
  const detailMap = new Map<string, ColumnDetail>();
  if (columnDetails) {
    for (const d of columnDetails) {
      detailMap.set(d.alias, d);
    }
  }
  const hasDetails = detailMap.size > 0;

  return (
    <table className="w-full text-xs border-collapse">
      <thead className="bg-muted/60 sticky top-0">
        <tr>
          <th className="px-4 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Name</th>
          {hasDetails && (
            <th className="px-4 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Description</th>
          )}
          <th className="px-4 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Type</th>
          <th className="px-4 py-2.5 text-right text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Nullable</th>
          {hasDetails && (
            <th className="px-4 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Source</th>
          )}
        </tr>
      </thead>
      <tbody>
        {columns.map((col) => {
          const detail = detailMap.get(col.name);
          return (
            <tr key={col.name} className="border-b border-border/50 hover:bg-accent/40 transition-colors">
              <td className="px-4 py-2.5">
                <span className="inline-flex items-center gap-1.5">
                  {!!col.is_primary_key && <Key className={cn('inline shrink-0 text-yellow-500', 'h-3 w-3')} />}
                  {!!col.is_foreign_key && <Link className={cn('inline shrink-0 text-blue-500', 'h-3 w-3')} />}
                  <span className={col.is_primary_key ? 'font-semibold' : ''}>{col.name}</span>
                </span>
                {columnNotes?.get(col.name) && (
                  <TooltipProvider delayDuration={200}>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <span className="ml-1.5 inline-flex items-center text-amber-600 cursor-help">
                          <StickyNote className={cn('inline', 'h-2.5 w-2.5')} />
                        </span>
                      </TooltipTrigger>
                      <TooltipContent side="right" className="max-w-xs text-xs whitespace-pre-wrap">
                        {columnNotes.get(col.name)}
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                )}
              </td>
              {hasDetails && (
                <td className="px-4 py-2.5 text-muted-foreground">
                  {detail?.comment || <span className="text-muted-foreground/40">-</span>}
                </td>
              )}
              <td className="px-4 py-2.5 font-mono text-[11px] text-muted-foreground">
                {col.data_type}{col.max_length && col.max_length > 0 ? `(${col.max_length})` : ''}
              </td>
              <td className="px-4 py-2.5 text-right">
                <span className={col.is_nullable ? 'text-green-600 dark:text-green-400 font-semibold' : 'text-red-500 font-semibold'}>
                  {col.is_nullable ? 'YES' : 'NO'}
                </span>
              </td>
              {hasDetails && (
                <td className="px-4 py-2.5 font-mono text-[11px]">
                  {detail?.sourceTable && onNavigate ? (
                    <button
                      className="text-blue-500 hover:text-blue-400 hover:underline cursor-pointer"
                      onClick={() => onNavigate(detail.sourceSchema || defaultSchema, detail.sourceTable!, 'table')}
                    >
                      {detail.sourceTable}.{detail.sourceField}
                    </button>
                  ) : detail?.sourceField ? (
                    <span className="text-muted-foreground">{detail.sourceField}</span>
                  ) : (
                    <span className="text-muted-foreground/40">-</span>
                  )}
                </td>
              )}
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
