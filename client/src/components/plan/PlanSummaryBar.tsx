import { useState, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Activity, AlertTriangle, Layers, Lightbulb, Expand, HardDrive, Code2, FileText, SearchCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { IndexOverviewTab, SizeEstimateTab, DDLTab } from './SuggestionsIndexTab';
import { PlanAnalysisTab } from './PlanAnalysisTab';
import { PlanWarnings } from './PlanWarnings';
import { PlanTree } from './PlanTree';
import { PlanTextView } from './PlanTextView';
import { analyzePlan } from '@/lib/plan-analyzer';
import type { ExecutionPlan } from '@/types/execution-plan';

function countNodes(node: { children: any[] }): number {
  return 1 + node.children.reduce((s: number, c: any) => s + countNodes(c), 0);
}

interface Props {
  plan: ExecutionPlan;
  planXml?: string | null;
}

export function PlanSummaryBar({ plan, planXml }: Props) {
  const { t } = useTranslation();
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [showFullscreen, setShowFullscreen] = useState(false);
  const operatorCount = countNodes(plan.nodes);
  const warningCount = plan.warnings.length;
  const indexCount = plan.missingIndexes.length;
  const insights = useMemo(() => analyzePlan(plan), [plan]);
  const insightCount = insights.length;
  const hasSuggestions = indexCount > 0 || warningCount > 0 || insightCount > 0;

  return (
    <>
      <div className="flex items-center gap-4 border-b bg-muted/30 px-4 py-2 text-xs shrink-0">
        <div className="flex items-center gap-1.5">
          <Activity className="h-3.5 w-3.5 text-muted-foreground" />
          <span className="text-muted-foreground">{t("plan.estimatedCost")}</span>
          <span className="font-medium">{plan.estimatedTotalCost.toFixed(4)}</span>
        </div>

        <div className="flex items-center gap-1.5">
          <Layers className="h-3.5 w-3.5 text-muted-foreground" />
          <span className="text-muted-foreground">{t("plan.operators")}</span>
          <span className="font-medium">{operatorCount}</span>
        </div>

        {warningCount > 0 && (
          <div className="flex items-center gap-1.5 text-yellow-600">
            <AlertTriangle className="h-3.5 w-3.5" />
            <span>{t('plan.warningCount', { count: warningCount })}</span>
          </div>
        )}

        <div className="flex-1 min-w-0">
          <span className="text-muted-foreground truncate block" title={plan.statementText}>
            {plan.statementText}
          </span>
        </div>

        <div className="flex items-center gap-1 shrink-0">
          {hasSuggestions && (
            <Button
              variant="outline"
              size="sm"
              className="h-7 gap-1.5 text-xs"
              onClick={() => setShowSuggestions(true)}
            >
              <Lightbulb className="h-3.5 w-3.5 text-blue-500" />
              Suggestions
              <span className="rounded-full bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300 px-1.5 py-0.5 text-[10px] font-medium leading-none">
                {indexCount + warningCount + insightCount}
              </span>
            </Button>
          )}
          <Button
            variant="outline"
            size="sm"
            className="h-7 gap-1.5 text-xs"
            onClick={() => setShowFullscreen(true)}
          >
            <Expand className="h-3.5 w-3.5" />
            Fullscreen
          </Button>
        </div>
      </div>

      {/* Suggestions Dialog — tabbed */}
      <Dialog open={showSuggestions} onOpenChange={setShowSuggestions}>
        <DialogContent className="max-w-2xl max-h-[80vh] flex flex-col">
          <DialogHeader>
            <DialogTitle className="text-sm">{t("plan.planSuggestionsAndWarnings")}</DialogTitle>
          </DialogHeader>
          <Tabs defaultValue={insightCount > 0 ? 'analysis' : indexCount > 0 ? 'indexes' : 'warnings'} className="flex-1 min-h-0 flex flex-col">
            <TabsList className="h-8 shrink-0">
              {insightCount > 0 && (
                <TabsTrigger value="analysis" className="text-xs gap-1.5 px-3 py-1">
                  <SearchCheck className="h-3 w-3" />
                  Analysis
                  <span className="rounded-full bg-purple-100 dark:bg-purple-900 text-purple-700 dark:text-purple-300 px-1.5 text-[10px] font-medium leading-none">
                    {insightCount}
                  </span>
                </TabsTrigger>
              )}
              {indexCount > 0 && (
                <>
                  <TabsTrigger value="indexes" className="text-xs gap-1.5 px-3 py-1">
                    <Lightbulb className="h-3 w-3" />
                    {t('plan.indexes')}
                    <span className="rounded-full bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300 px-1.5 text-[10px] font-medium leading-none">
                      {indexCount}
                    </span>
                  </TabsTrigger>
                  <TabsTrigger value="size" className="text-xs gap-1.5 px-3 py-1">
                    <HardDrive className="h-3 w-3" />
                    Size Estimate
                  </TabsTrigger>
                  <TabsTrigger value="ddl" className="text-xs gap-1.5 px-3 py-1">
                    <Code2 className="h-3 w-3" />
                    DDL
                  </TabsTrigger>
                </>
              )}
              {warningCount > 0 && (
                <TabsTrigger value="warnings" className="text-xs gap-1.5 px-3 py-1">
                  <AlertTriangle className="h-3 w-3" />
                  {t('plan.warnings')}
                  <span className="rounded-full bg-yellow-100 dark:bg-yellow-900 text-yellow-700 dark:text-yellow-300 px-1.5 text-[10px] font-medium leading-none">
                    {warningCount}
                  </span>
                </TabsTrigger>
              )}
            </TabsList>
            {insightCount > 0 && (
              <TabsContent value="analysis" className="flex-1 overflow-auto mt-3">
                <PlanAnalysisTab plan={plan} />
              </TabsContent>
            )}
            {indexCount > 0 && (
              <>
                <TabsContent value="indexes" className="flex-1 overflow-auto mt-3">
                  <IndexOverviewTab indexes={plan.missingIndexes} />
                </TabsContent>
                <TabsContent value="size" className="flex-1 overflow-auto mt-3">
                  <SizeEstimateTab indexes={plan.missingIndexes} />
                </TabsContent>
                <TabsContent value="ddl" className="flex-1 overflow-auto mt-3">
                  <DDLTab indexes={plan.missingIndexes} />
                </TabsContent>
              </>
            )}
            {warningCount > 0 && (
              <TabsContent value="warnings" className="flex-1 overflow-auto mt-3">
                <PlanWarnings warnings={plan.warnings} />
              </TabsContent>
            )}
          </Tabs>
        </DialogContent>
      </Dialog>

      {/* Fullscreen plan — tabbed: Visual + Text */}
      <Dialog open={showFullscreen} onOpenChange={setShowFullscreen}>
        <DialogContent className="max-w-[calc(100vw-48px)] max-h-[calc(100vh-48px)] w-full h-full flex flex-col p-0 gap-0">
          <Tabs defaultValue="visual" className="flex flex-col h-full">
            <div className="flex items-center border-b px-4 py-2 shrink-0 gap-3">
              <span className="text-sm font-medium">{t('plan.executionPlan')}</span>
              <TabsList className="h-8">
                <TabsTrigger value="visual" className="text-xs gap-1.5 px-3 py-1">
                  <Layers className="h-3 w-3" />
                  Visual
                </TabsTrigger>
                <TabsTrigger value="text" className="text-xs gap-1.5 px-3 py-1">
                  <FileText className="h-3 w-3" />
                  Text
                </TabsTrigger>
              </TabsList>
            </div>
            <TabsContent value="visual" className="flex-1 min-h-0 mt-0">
              <PlanTree node={plan.nodes} totalCost={plan.estimatedTotalCost} />
            </TabsContent>
            <TabsContent value="text" className="flex-1 min-h-0 mt-0">
              <PlanTextView plan={plan} planXml={planXml} />
            </TabsContent>
          </Tabs>
        </DialogContent>
      </Dialog>
    </>
  );
}
