import type { IndexInfo } from '@/types/schema';
import { useTranslation } from 'react-i18next';
import { Badge } from '@/components/ui/badge';

interface Props {
  indexes: IndexInfo[];
}

export function IndexesTab({ indexes }: Props) {
  const { t } = useTranslation();
  if (!indexes.length) return <div className="p-4 text-xs text-muted-foreground">{t("inspector.noIndexes")}</div>;

  return (
    <table className="w-full text-xs">
      <thead className="bg-muted sticky top-0">
        <tr>
          <th className="px-2 py-1.5 text-left font-medium">{t("common.name")}</th>
          <th className="px-2 py-1.5 text-left font-medium">{t("common.type")}</th>
          <th className="px-2 py-1.5 text-left font-medium">Columns</th>
          <th className="px-2 py-1.5 text-left font-medium">{t("inspector.flags")}</th>
        </tr>
      </thead>
      <tbody>
        {indexes.map((idx) => (
          <tr key={idx.name} className="border-b hover:bg-accent/50">
            <td className="px-2 py-1 font-mono">{idx.name}</td>
            <td className="px-2 py-1">{idx.type}</td>
            <td className="px-2 py-1 font-mono">{idx.columns.join(', ')}</td>
            <td className="px-2 py-1 space-x-1">
              {idx.is_primary_key && <Badge className="text-[9px]">PK</Badge>}
              {idx.is_unique && <Badge variant="secondary" className="text-[9px]">UQ</Badge>}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
