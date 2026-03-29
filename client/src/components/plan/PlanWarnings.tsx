import { AlertTriangle } from 'lucide-react';
import { useTranslation } from 'react-i18next';

const WARNING_MESSAGES: Record<string, string> = {
  NoJoinPredicate: 'plan.noJoinPredicate',
  ColumnsWithNoStatistics: 'plan.columnsNoStatistics',
  SpillToTempDb: 'plan.spillToTempDb',
  ExcessiveMemoryGrant: 'plan.excessiveMemoryGrant',
  UnmatchedIndexes: 'plan.unmatchedIndexes',
};

interface Props {
  warnings: string[];
}

export function PlanWarnings({ warnings }: Props) {
  const { t } = useTranslation();
  return (
    <div className="flex flex-col gap-1.5">
      {warnings.map((w, i) => (
        <div
          key={i}
          className="flex items-start gap-2 rounded-md border border-yellow-200 bg-yellow-50/50 dark:border-yellow-900 dark:bg-yellow-950/30 px-3 py-2 text-xs"
        >
          <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-yellow-500 mt-0.5" />
          <span>{WARNING_MESSAGES[w] ? t(WARNING_MESSAGES[w]) : w}</span>
        </div>
      ))}
    </div>
  );
}
