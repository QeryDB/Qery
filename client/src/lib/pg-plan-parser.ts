import type { ExecutionPlan, PlanNode } from '../types/execution-plan';

interface PgPlanNode {
  'Node Type': string;
  'Relation Name'?: string;
  'Schema'?: string;
  'Alias'?: string;
  'Startup Cost': number;
  'Total Cost': number;
  'Plan Rows': number;
  'Plan Width': number;
  'Filter'?: string;
  'Index Name'?: string;
  'Index Cond'?: string;
  'Join Type'?: string;
  'Hash Cond'?: string;
  'Merge Cond'?: string;
  'Sort Key'?: string[];
  'Output'?: string[];
  Plans?: PgPlanNode[];
}

interface PgExplainResult {
  Plan: PgPlanNode;
  'Planning Time'?: number;
  'Execution Time'?: number;
}

let nodeCounter = 0;

function parsePgNode(node: PgPlanNode, rootCost: number): PlanNode {
  const cost = node['Total Cost'] || 0;
  const children = (node.Plans || []).map(child => parsePgNode(child, rootCost));

  const objectParts = [node['Schema'], node['Relation Name']].filter(Boolean);
  const object = objectParts.length > 0 ? objectParts.join('.') : undefined;

  const predicate = node['Filter'] || node['Index Cond'] || node['Hash Cond'] || node['Merge Cond'] || undefined;

  return {
    nodeId: nodeCounter++,
    physicalOp: node['Node Type'],
    logicalOp: node['Node Type'],
    estimatedRows: node['Plan Rows'] || 0,
    estimatedCost: cost,
    operatorCost: cost - children.reduce((sum, c) => sum + c.estimatedCost, 0),
    costPercent: rootCost > 0 ? ((cost - children.reduce((sum, c) => sum + c.estimatedCost, 0)) / rootCost) * 100 : 0,
    estimatedIO: 0,
    estimatedCPU: 0,
    outputColumns: node['Output'] || [],
    warnings: [],
    object,
    indexName: node['Index Name'],
    predicate,
    children,
  };
}

/** Parse PostgreSQL EXPLAIN (FORMAT JSON) output into our ExecutionPlan type */
export function parsePgPlan(jsonRows: any[]): ExecutionPlan {
  nodeCounter = 0;

  // The explain result comes as array of rows, each with a "QUERY PLAN" string column
  // which contains the JSON array
  let planData: PgExplainResult[];

  if (jsonRows.length === 1 && typeof jsonRows[0]['QUERY PLAN'] === 'string') {
    try {
      planData = JSON.parse(jsonRows[0]['QUERY PLAN']);
    } catch {
      return { statementText: '', estimatedTotalCost: 0, nodes: emptyNode(), missingIndexes: [], warnings: [], statistics: [] };
    }
  } else if (Array.isArray(jsonRows) && jsonRows[0]?.Plan) {
    planData = jsonRows;
  } else {
    return { statementText: '', estimatedTotalCost: 0, nodes: emptyNode(), missingIndexes: [], warnings: [], statistics: [] };
  }

  const first = planData[0];
  if (!first?.Plan) {
    return { statementText: '', estimatedTotalCost: 0, nodes: emptyNode(), missingIndexes: [], warnings: [], statistics: [] };
  }

  const rootCost = first.Plan['Total Cost'] || 0;
  const nodes = parsePgNode(first.Plan, rootCost);

  return {
    statementText: '',
    estimatedTotalCost: rootCost,
    nodes,
    missingIndexes: [],
    warnings: [],
    statistics: [],
  };
}

function emptyNode(): PlanNode {
  return {
    nodeId: 0, physicalOp: 'Unknown', logicalOp: 'Unknown',
    estimatedRows: 0, estimatedCost: 0, operatorCost: 0, costPercent: 0,
    estimatedIO: 0, estimatedCPU: 0, outputColumns: [], warnings: [], children: [],
  };
}
