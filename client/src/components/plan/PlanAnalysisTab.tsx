import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { AlertOctagon, AlertTriangle, Info } from 'lucide-react';
import { cn } from '@/lib/utils';
import { analyzePlan, type PlanInsight, type InsightSeverity } from '@/lib/plan-analyzer';
import type { ExecutionPlan } from '@/types/execution-plan';

const SEVERITY_CONFIG: Record<InsightSeverity, { icon: typeof AlertOctagon; color: string; bg: string; border: string; labelKey: string }> = {
  critical: {
    icon: AlertOctagon,
    color: 'text-red-600 dark:text-red-400',
    bg: 'bg-red-50 dark:bg-red-950/30',
    border: 'border-red-200 dark:border-red-800',
    labelKey: 'plan.critical',
  },
  warning: {
    icon: AlertTriangle,
    color: 'text-yellow-600 dark:text-yellow-400',
    bg: 'bg-yellow-50 dark:bg-yellow-950/30',
    border: 'border-yellow-200 dark:border-yellow-800',
    labelKey: 'plan.warning',
  },
  info: {
    icon: Info,
    color: 'text-blue-600 dark:text-blue-400',
    bg: 'bg-blue-50 dark:bg-blue-950/30',
    border: 'border-blue-200 dark:border-blue-800',
    labelKey: 'plan.info',
  },
};

function InsightCard({ insight }: { insight: PlanInsight }) {
  const config = SEVERITY_CONFIG[insight.severity];
  const Icon = config.icon;

  return (
    <div className={cn('rounded-lg border p-3 space-y-1.5', config.border, config.bg)}>
      <div className="flex items-start gap-2">
        <Icon className={cn('h-4 w-4 shrink-0 mt-0.5', config.color)} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className={cn('text-xs font-semibold', config.color)}>{insight.title}</span>
            {insight.table && (
              <span className="text-[10px] text-muted-foreground font-mono">{insight.table}</span>
            )}
          </div>
          <p className="text-xs text-muted-foreground mt-1 leading-relaxed">{insight.description}</p>
        </div>
      </div>
    </div>
  );
}

export function PlanAnalysisTab({ plan }: { plan: ExecutionPlan }) {
  const { t } = useTranslation();
  const insights = useMemo(() => analyzePlan(plan), [plan]);

  if (insights.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
        <Info className="h-8 w-8 mb-3 opacity-40" />
        <p className="text-sm font-medium">{t("plan.noIssuesDetected")}</p>
        <p className="text-xs mt-1">{t("plan.queryPlanLooksReasonable")}</p>
      </div>
    );
  }

  const criticalCount = insights.filter((i) => i.severity === 'critical').length;
  const warningCount = insights.filter((i) => i.severity === 'warning').length;
  const infoCount = insights.filter((i) => i.severity === 'info').length;

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3 text-xs">
        {criticalCount > 0 && (
          <span className="flex items-center gap-1 text-red-600 dark:text-red-400 font-medium">
            <AlertOctagon className="h-3 w-3" /> {criticalCount} critical
          </span>
        )}
        {warningCount > 0 && (
          <span className="flex items-center gap-1 text-yellow-600 dark:text-yellow-400 font-medium">
            <AlertTriangle className="h-3 w-3" /> {warningCount} warning
          </span>
        )}
        {infoCount > 0 && (
          <span className="flex items-center gap-1 text-blue-600 dark:text-blue-400 font-medium">
            <Info className="h-3 w-3" /> {infoCount} info
          </span>
        )}
      </div>
      {insights.map((insight, i) => (
        <InsightCard key={i} insight={insight} />
      ))}
    </div>
  );
}
