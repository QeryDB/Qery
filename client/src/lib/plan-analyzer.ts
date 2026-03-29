import i18n from '@/i18n';
import type { ExecutionPlan, PlanNode, StatisticsInfo } from '../types/execution-plan';

export type InsightSeverity = 'critical' | 'warning' | 'info';

export interface PlanInsight {
  severity: InsightSeverity;
  title: string;
  description: string;
  nodeId?: number;
  operator?: string;
  table?: string;
}

function flattenNodes(node: PlanNode): PlanNode[] {
  return [node, ...node.children.flatMap(flattenNodes)];
}

function detectKeyLookups(nodes: PlanNode[]): PlanInsight[] {
  return nodes
    .filter((n) => n.isKeyLookup)
    .map((n) => ({
      severity: n.costPercent > 15 ? 'critical' as const : 'warning' as const,
      title: 'Key Lookup',
      description: i18n.t('planAnalyzer.keyLookup', { table: n.object ?? 'Table', cost: n.costPercent.toFixed(1) }),
      nodeId: n.nodeId,
      operator: n.physicalOp,
      table: n.object,
    }));
}

function detectExpensiveOperators(nodes: PlanNode[]): PlanInsight[] {
  return nodes
    .filter((n) => n.costPercent > 30)
    .sort((a, b) => b.costPercent - a.costPercent)
    .map((n) => {
      let hint = '';
      const op = n.physicalOp;
      if (op.includes('Scan') && !op.includes('Seek')) {
        hint = i18n.t('planAnalyzer.tableScan');
      } else if (op.includes('Sort')) {
        hint = i18n.t('planAnalyzer.sortHint');
      } else if (op.includes('Hash Match')) {
        hint = i18n.t('planAnalyzer.hashMatchHint');
      } else if (op.includes('Parallelism')) {
        hint = i18n.t('planAnalyzer.parallelismHint');
      } else {
        hint = i18n.t('planAnalyzer.genericExpensiveHint');
      }
      return {
        severity: n.costPercent > 60 ? 'critical' as const : 'warning' as const,
        title: i18n.t('planAnalyzer.expensiveOperator', { op }),
        description: i18n.t('planAnalyzer.expensiveOperatorDescription', { op, cost: n.costPercent.toFixed(1), hint }),
        nodeId: n.nodeId,
        operator: op,
        table: n.object,
      };
    });
}

function detectImplicitConversions(nodes: PlanNode[]): PlanInsight[] {
  const results: PlanInsight[] = [];
  for (const n of nodes) {
    const pred = n.predicate ?? '';
    const seek = n.seekPredicates ?? '';
    const combined = pred + ' ' + seek;
    const matches = combined.match(/CONVERT_IMPLICIT\([^)]+\)/g);
    if (matches && matches.length > 0) {
      results.push({
        severity: 'warning',
        title: i18n.t('planAnalyzer.implicitConversion'),
        description: i18n.t('planAnalyzer.implicitConversionDescription', { object: n.object ?? n.physicalOp, count: matches.length, example: matches[0] }),
        nodeId: n.nodeId,
        operator: n.physicalOp,
        table: n.object,
      });
    }
  }
  return results;
}

function detectLargeScans(nodes: PlanNode[]): PlanInsight[] {
  return nodes
    .filter((n) => {
      const isScan = n.physicalOp.includes('Scan') && !n.physicalOp.includes('Seek');
      const isLarge = (n.tableCardinality ?? 0) > 10000 || n.estimatedRows > 10000;
      return isScan && isLarge && n.object;
    })
    .map((n) => ({
      severity: (n.tableCardinality ?? n.estimatedRows) > 100000 ? 'critical' as const : 'warning' as const,
      title: i18n.t('planAnalyzer.largeScan', { op: n.physicalOp }),
      description: i18n.t('planAnalyzer.largeScanDescription', { table: n.object, rows: formatNum(n.estimatedRows), cardinalityNote: n.tableCardinality ? i18n.t('planAnalyzer.largeScanCardinality', { count: formatNum(n.tableCardinality) }) : '' }),
      nodeId: n.nodeId,
      operator: n.physicalOp,
      table: n.object,
    }));
}

function detectStaleStatistics(statistics: StatisticsInfo[]): PlanInsight[] {
  return statistics
    .filter((s) => s.modificationCount > 1000 || s.samplingPercent < 50)
    .map((s) => {
      const parts: string[] = [];
      if (s.modificationCount > 1000) {
        parts.push(i18n.t('planAnalyzer.staleModifications', { count: formatNum(s.modificationCount) }));
      }
      if (s.samplingPercent < 50 && s.samplingPercent > 0) {
        parts.push(i18n.t('planAnalyzer.staleSampling', { percent: s.samplingPercent.toFixed(1) }));
      }
      return {
        severity: s.modificationCount > 10000 ? 'critical' as const : 'info' as const,
        title: i18n.t('planAnalyzer.staleStatistic', { name: s.statistics }),
        description: i18n.t('planAnalyzer.staleStatisticDescription', { table: `${s.schema}.${s.table}`, name: s.statistics, details: parts.join(', '), schema: s.schema }),
        table: `${s.schema}.${s.table}`,
      };
    });
}

function detectRowEstimateMismatch(nodes: PlanNode[]): PlanInsight[] {
  return nodes
    .filter((n) => {
      if (!n.estimatedRowsRead || n.estimatedRowsRead < 100) return false;
      const ratio = n.estimatedRowsRead / Math.max(1, n.estimatedRows);
      return ratio > 10;
    })
    .map((n) => ({
      severity: 'warning' as const,
      title: i18n.t('planAnalyzer.rowEstimateMismatch'),
      description: i18n.t('planAnalyzer.rowEstimateMismatchDescription', { object: n.object ?? n.physicalOp, read: formatNum(n.estimatedRowsRead!), returned: formatNum(n.estimatedRows) }),
      nodeId: n.nodeId,
      operator: n.physicalOp,
      table: n.object,
    }));
}

function formatNum(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return Math.round(n).toString();
}

export function analyzePlan(plan: ExecutionPlan): PlanInsight[] {
  const allNodes = flattenNodes(plan.nodes);
  const insights: PlanInsight[] = [];

  insights.push(...detectKeyLookups(allNodes));
  insights.push(...detectExpensiveOperators(allNodes));
  insights.push(...detectImplicitConversions(allNodes));
  insights.push(...detectLargeScans(allNodes));
  insights.push(...detectRowEstimateMismatch(allNodes));
  insights.push(...detectStaleStatistics(plan.statistics));

  // Sort: critical first, then warning, then info
  const order: Record<InsightSeverity, number> = { critical: 0, warning: 1, info: 2 };
  insights.sort((a, b) => order[a.severity] - order[b.severity]);

  return insights;
}

export function insightsToText(insights: PlanInsight[]): string {
  if (insights.length === 0) return '';
  const lines = ['--- Performance Analysis ---'];
  for (const insight of insights) {
    const badge = insight.severity === 'critical' ? '[!!!]' : insight.severity === 'warning' ? '[!!]' : '[i]';
    lines.push(`\n${badge} ${insight.title}`);
    if (insight.table) lines.push(`  Table: ${insight.table}`);
    lines.push(`  ${insight.description}`);
  }
  return lines.join('\n');
}
