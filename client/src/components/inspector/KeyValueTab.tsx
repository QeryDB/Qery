import { Badge } from '@/components/ui/badge';

interface Props {
  data: any;
}

/** Generic key-value renderer for object details (sequences, triggers, mat views, etc.) */
export function KeyValueTab({ data }: Props) {
  // Accept array (rows) or single object
  const obj = Array.isArray(data) ? data[0] : data;
  if (!obj || typeof obj !== 'object') {
    return <div className="p-4 text-sm text-muted-foreground">No details available</div>;
  }

  const entries = Object.entries(obj).filter(([key]) => key !== 'name' && key !== 'schema');

  return (
    <div className="p-4 space-y-2">
      {entries.map(([key, value]) => (
        <div key={key} className="flex items-baseline gap-3 text-sm">
          <span className="text-muted-foreground font-medium min-w-[140px] text-right text-xs">
            {formatLabel(key)}
          </span>
          <span className="flex-1 font-mono text-xs">
            {renderValue(value)}
          </span>
        </div>
      ))}
    </div>
  );
}

function formatLabel(key: string): string {
  return key
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function renderValue(value: any): React.ReactNode {
  if (value === null || value === undefined) return <span className="text-muted-foreground">—</span>;
  if (typeof value === 'boolean') return <Badge variant={value ? 'default' : 'secondary'}>{value ? 'Yes' : 'No'}</Badge>;
  if (value === true || value === 'true' || value === 't') return <Badge variant="default">Yes</Badge>;
  if (value === false || value === 'false' || value === 'f') return <Badge variant="secondary">No</Badge>;
  if (typeof value === 'number') return <span>{value.toLocaleString()}</span>;
  return <span>{String(value)}</span>;
}
