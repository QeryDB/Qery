import type { ForeignKeyInfo } from '@/types/schema';
import { useTranslation } from 'react-i18next';

interface Props {
  foreignKeys: ForeignKeyInfo[];
  onNavigate?: (schema: string, table: string) => void;
}

export function ForeignKeysTab({ foreignKeys, onNavigate }: Props) {
  const { t } = useTranslation();
  if (!foreignKeys.length) return <div className="p-4 text-xs text-muted-foreground">{t("inspector.noForeignKeys")}</div>;

  return (
    <table className="w-full text-xs">
      <thead className="bg-muted sticky top-0">
        <tr>
          <th className="px-2 py-1.5 text-left font-medium">{t("common.name")}</th>
          <th className="px-2 py-1.5 text-left font-medium">{t("inspector.column")}</th>
          <th className="px-2 py-1.5 text-left font-medium">{t("inspector.references")}</th>
          <th className="px-2 py-1.5 text-left font-medium">{t("inspector.onDelete")}</th>
          <th className="px-2 py-1.5 text-left font-medium">{t("inspector.onUpdate")}</th>
        </tr>
      </thead>
      <tbody>
        {foreignKeys.map((fk) => (
          <tr key={fk.name} className="border-b hover:bg-accent/50">
            <td className="px-2 py-1 font-mono">{fk.name}</td>
            <td className="px-2 py-1 font-mono">{fk.column}</td>
            <td className="px-2 py-1 font-mono">
              {onNavigate ? (
                <button
                  className="text-blue-500 hover:underline"
                  onClick={() => onNavigate(fk.referenced_schema, fk.referenced_table)}
                >
                  {fk.referenced_schema}.{fk.referenced_table}
                </button>
              ) : (
                `${fk.referenced_schema}.${fk.referenced_table}`
              )}
              .{fk.referenced_column}
            </td>
            <td className="px-2 py-1">{fk.on_delete}</td>
            <td className="px-2 py-1">{fk.on_update}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
