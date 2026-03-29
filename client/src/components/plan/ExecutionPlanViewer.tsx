import { PlanSummaryBar } from './PlanSummaryBar';
import { PlanTree } from './PlanTree';
import type { ExecutionPlan } from '@/types/execution-plan';

interface Props {
  plan: ExecutionPlan;
  planXml?: string | null;
}

export function ExecutionPlanViewer({ plan, planXml }: Props) {
  return (
    <div className="flex flex-1 min-h-0 flex-col overflow-hidden">
      <PlanSummaryBar plan={plan} planXml={planXml} />
      <div className="flex-1 min-h-0">
        <PlanTree node={plan.nodes} totalCost={plan.estimatedTotalCost} />
      </div>
    </div>
  );
}
