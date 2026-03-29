import { useState, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Copy, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { analyzePlan, insightsToText } from '@/lib/plan-analyzer';
import type { ExecutionPlan, PlanNode, MissingIndex } from '@/types/execution-plan';

function formatRows(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return Math.round(n).toString();
}

function nodeToText(node: PlanNode, depth: number): string[] {
  const indent = '  '.repeat(depth);
  const arrow = depth > 0 ? '└─ ' : '';
  const costStr = node.costPercent > 0.1 ? ` [${node.costPercent.toFixed(1)}%]` : '';
  const rowStr = ` (${formatRows(node.estimatedRows)} rows)`;

  let line = `${indent}${arrow}${node.physicalOp}${costStr}${rowStr}`;

  if (node.logicalOp && node.logicalOp !== node.physicalOp) {
    line += ` — ${node.logicalOp}`;
  }

  const lines: string[] = [line];
  const detail = indent + '  '.repeat(arrow.length > 0 ? 1 : 0) + '  ';

  if (node.isKeyLookup) lines.push(`${detail}⚠ KEY LOOKUP`);
  if (node.object) lines.push(`${detail}Table: ${node.object}`);
  if (node.indexName) lines.push(`${detail}Index: ${node.indexName}`);
  if (node.seekPredicates) lines.push(`${detail}Seek: ${node.seekPredicates}`);
  if (node.predicate) lines.push(`${detail}Filter: ${node.predicate}`);
  if (node.warnings.length > 0) lines.push(`${detail}⚠ ${node.warnings.join(', ')}`);

  for (const child of node.children) {
    lines.push(...nodeToText(child, depth + 1));
  }

  return lines;
}

function missingIndexToText(idx: MissingIndex): string {
  const parts = [`  Table: ${idx.schema}.${idx.table} (improvement: ${idx.impact.toFixed(1)}%)`];
  if (idx.equalityColumns.length > 0) parts.push(`  Equality: ${idx.equalityColumns.join(', ')}`);
  if (idx.inequalityColumns.length > 0) parts.push(`  Inequality: ${idx.inequalityColumns.join(', ')}`);
  if (idx.includeColumns.length > 0) parts.push(`  Include: ${idx.includeColumns.join(', ')}`);
  return parts.join('\n');
}

function planToText(plan: ExecutionPlan): string {
  const sections: string[] = [];

  // Header
  sections.push(`=== SQL Server Execution Plan ===`);
  sections.push(`Estimated Cost: ${plan.estimatedTotalCost.toFixed(4)}`);
  if (plan.statementText) {
    sections.push(`\nStatement:\n${plan.statementText}`);
  }

  // Tree
  sections.push(`\n--- Operator Tree ---`);
  sections.push(nodeToText(plan.nodes, 0).join('\n'));

  // Missing indexes
  if (plan.missingIndexes.length > 0) {
    sections.push(`\n--- Missing Index Suggestions ---`);
    plan.missingIndexes.forEach((idx, i) => {
      sections.push(`\n#${i + 1}:`);
      sections.push(missingIndexToText(idx));
    });
  }

  // Warnings
  if (plan.warnings.length > 0) {
    sections.push(`\n--- Warnings ---`);
    plan.warnings.forEach((w) => sections.push(`  ⚠ ${w}`));
  }

  // Performance analysis
  const insights = analyzePlan(plan);
  const analysisText = insightsToText(insights);
  if (analysisText) {
    sections.push(`\n${analysisText}`);
  }

  return sections.join('\n');
}

interface Props {
  plan: ExecutionPlan;
  planXml?: string | null;
}

export function PlanTextView({ plan, planXml }: Props) {
  const { t } = useTranslation();
  const [copied, setCopied] = useState<'text' | 'xml' | null>(null);
  const [view, setView] = useState<'text' | 'xml'>('text');

  const textVersion = useMemo(() => planToText(plan), [plan]);

  const handleCopy = async (content: string, type: 'text' | 'xml') => {
    await navigator.clipboard.writeText(content);
    setCopied(type);
    setTimeout(() => setCopied(null), 2000);
  };

  const currentContent = view === 'text' ? textVersion : (planXml ?? '');

  return (
    <div className="flex flex-col h-full">
      {/* Toggle + copy bar */}
      <div className="flex items-center gap-2 px-4 py-2 border-b shrink-0">
        <div className="flex rounded-md border overflow-hidden text-xs">
          <button
            className={`px-3 py-1 ${view === 'text' ? 'bg-primary text-primary-foreground' : 'bg-muted/50 hover:bg-muted'}`}
            onClick={() => setView('text')}
          >
            {t('plan.textViewLabel')}
          </button>
          <button
            className={`px-3 py-1 ${view === 'xml' ? 'bg-primary text-primary-foreground' : 'bg-muted/50 hover:bg-muted'}`}
            onClick={() => setView('xml')}
            disabled={!planXml}
          >
            {t('plan.xmlViewLabel')}
          </button>
        </div>
        <div className="flex-1" />
        <span className="text-[10px] text-muted-foreground">
          {view === 'text' ? t('plan.textFormatNote') : t('plan.xmlFormatNote')}
        </span>
        <Button
          variant="outline"
          size="sm"
          className="h-7 gap-1.5 text-xs"
          onClick={() => handleCopy(currentContent, view)}
        >
          {copied === view ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
          {copied === view ? t('common.copied') : t('common.copy')}
        </Button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto min-h-0">
        <pre className="p-4 text-xs font-mono whitespace-pre-wrap select-all leading-relaxed">
          {currentContent}
        </pre>
      </div>
    </div>
  );
}
