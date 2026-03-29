import type { ReferencedByInfo } from '@/types/schema';
import { useTranslation } from 'react-i18next';

interface Props {
  referencedBy: ReferencedByInfo[];
  onNavigate?: (schema: string, table: string) => void;
}

export function ReferencedByTab({ referencedBy, onNavigate }: Props) {
  const { t } = useTranslation();
  if (!referencedBy.length) return <div className="p-4 text-xs text-muted-foreground">{t("inspector.noReferencingTables")}</div>;

  return (
    <table className="w-full text-xs">
      <thead className="bg-muted sticky top-0">
        <tr>
          <th className="px-2 py-1.5 text-left font-medium">{t("common.name")}</th>
          <th className="px-2 py-1.5 text-left font-medium">{t("inspector.column")}</th>
          <th className="px-2 py-1.5 text-left font-medium">{t("inspector.referencingTable")}</th>
          <th className="px-2 py-1.5 text-left font-medium">{t("inspector.referencedColumn")}</th>
          <th className="px-2 py-1.5 text-left font-medium">{t("inspector.onDelete")}</th>
          <th className="px-2 py-1.5 text-left font-medium">{t("inspector.onUpdate")}</th>
        </tr>
      </thead>
      <tbody>
        {referencedBy.map((ref, i) => (
          <tr key={`${ref.name}-${i}`} className="border-b hover:bg-accent/50">
            <td className="px-2 py-1 font-mono">{ref.name}</td>
            <td className="px-2 py-1 font-mono">{ref.column}</td>
            <td className="px-2 py-1 font-mono">
              {onNavigate ? (
                <button
                  className="text-blue-500 hover:underline"
                  onClick={() => onNavigate(ref.referencing_schema, ref.referencing_table)}
                >
                  {ref.referencing_schema}.{ref.referencing_table}
                </button>
              ) : (
                `${ref.referencing_schema}.${ref.referencing_table}`
              )}
            </td>
            <td className="px-2 py-1 font-mono">{ref.referenced_column}</td>
            <td className="px-2 py-1">{ref.on_delete}</td>
            <td className="px-2 py-1">{ref.on_update}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
