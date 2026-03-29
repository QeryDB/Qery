import type { ObjectParameter } from '@/types/schema';
import { useTranslation } from 'react-i18next';
import type { ParsedVariable } from '@/lib/parse-definition-params';
import { Badge } from '@/components/ui/badge';

interface Props {
  parameters: ObjectParameter[];
  variables?: ParsedVariable[];
}

function formatType(p: ObjectParameter): string {
  let t = p.data_type;
  if (['varchar', 'nvarchar', 'char', 'nchar', 'varbinary'].includes(t)) {
    t += `(${p.max_length === -1 ? 'MAX' : p.max_length})`;
  } else if (['decimal', 'numeric'].includes(t)) {
    t += `(${p.precision}, ${p.scale})`;
  }
  return t;
}

export function ParametersTab({ parameters, variables }: Props) {
  const { t } = useTranslation();
  if (!parameters.length && !variables?.length) {
    return <div className="p-4 text-xs text-muted-foreground">{t("inspector.noParameters")}</div>;
  }

  // parameter_id = 0 is the return value for functions
  const returnParam = parameters.find((p) => p.ordinal_position === 0);
  const inputParams = parameters.filter((p) => p.ordinal_position > 0);

  return (
    <div className="overflow-auto">
      {returnParam && (
        <div className="px-4 py-2 text-xs border-b">
          <span className="text-muted-foreground">{t('inspector.returns')}</span>
          <code className="font-semibold">{formatType(returnParam)}</code>
        </div>
      )}

      {inputParams.length > 0 && (
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b text-muted-foreground">
              <th className="px-4 py-1.5 text-left font-medium">#</th>
              <th className="px-4 py-1.5 text-left font-medium">{t("common.name")}</th>
              <th className="px-4 py-1.5 text-left font-medium">Type</th>
              <th className="px-4 py-1.5 text-left font-medium">{t("inspector.direction")}</th>
              <th className="px-4 py-1.5 text-left font-medium">{t("inspector.defaultValue")}</th>
            </tr>
          </thead>
          <tbody>
            {inputParams.map((p) => (
              <tr key={p.name} className="border-b hover:bg-muted/50">
                <td className="px-4 py-1.5 text-muted-foreground">{p.ordinal_position}</td>
                <td className="px-4 py-1.5 font-mono font-semibold">{p.name}</td>
                <td className="px-4 py-1.5 font-mono text-muted-foreground">{formatType(p)}</td>
                <td className="px-4 py-1.5">
                  {p.is_output ? (
                    <Badge variant="outline" className="text-[10px] px-1.5 py-0">{t("inspector.output")}</Badge>
                  ) : (
                    <span className="text-muted-foreground">{t("inspector.input")}</span>
                  )}
                </td>
                <td className="px-4 py-1.5 text-muted-foreground">
                  {p.has_default_value ? (p.default_value ?? 'NULL') : '-'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {variables && variables.length > 0 && (
        <>
          <div className="px-4 py-2 text-xs font-semibold text-muted-foreground border-b bg-muted/30">
            Local Variables ({variables.length})
          </div>
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b text-muted-foreground">
                <th className="px-4 py-1.5 text-left font-medium">#</th>
                <th className="px-4 py-1.5 text-left font-medium">{t("common.name")}</th>
                <th className="px-4 py-1.5 text-left font-medium">Type</th>
                <th className="px-4 py-1.5 text-left font-medium">{t("inspector.initialValue")}</th>
              </tr>
            </thead>
            <tbody>
              {variables.map((v, i) => (
                <tr key={v.name} className="border-b hover:bg-muted/50">
                  <td className="px-4 py-1.5 text-muted-foreground">{i + 1}</td>
                  <td className="px-4 py-1.5 font-mono font-semibold text-muted-foreground">{v.name}</td>
                  <td className="px-4 py-1.5 font-mono text-muted-foreground">{v.data_type}</td>
                  <td className="px-4 py-1.5 text-muted-foreground">{v.default_value ?? '-'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
    </div>
  );
}
