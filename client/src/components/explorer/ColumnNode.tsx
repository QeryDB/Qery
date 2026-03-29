import { Key, Link } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import type { ColumnInfo, ColumnSummary } from '@/types/schema';

interface Props {
  column: ColumnInfo | ColumnSummary;
}

export function ColumnNode({ column }: Props) {
  return (
    <div className="flex items-center gap-1.5 px-2 py-0.5 text-xs">
      {column.is_primary_key ? (
        <Key className="h-3 w-3 text-yellow-500 shrink-0" />
      ) : column.is_foreign_key ? (
        <Link className="h-3 w-3 text-blue-500 shrink-0" />
      ) : (
        <span className="w-3 shrink-0" />
      )}
      <span className="truncate">{column.name}</span>
      <Badge
        variant="outline"
        className="ml-auto h-4 px-1 text-[9px] font-mono max-w-[100px] truncate shrink-0"
        title={`${column.data_type}${column.max_length && column.max_length > 0 ? `(${column.max_length})` : ''}`}
      >
        {column.data_type}
        {column.max_length && column.max_length > 0 ? `(${column.max_length})` : ''}
      </Badge>
      {column.is_nullable && <span className="text-[9px] text-muted-foreground">NULL</span>}
    </div>
  );
}
