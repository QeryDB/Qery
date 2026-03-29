export interface PlanNode {
  nodeId: number;
  physicalOp: string;
  logicalOp: string;
  estimatedRows: number;
  estimatedCost: number;
  operatorCost: number;
  costPercent: number;
  estimatedIO: number;
  estimatedCPU: number;
  outputColumns: string[];
  warnings: string[];
  object?: string;
  indexName?: string;
  seekPredicates?: string;
  predicate?: string;
  isKeyLookup?: boolean;
  estimatedRowsRead?: number;
  tableCardinality?: number;
  children: PlanNode[];
}

export interface MissingIndex {
  impact: number;
  database: string;
  schema: string;
  table: string;
  equalityColumns: string[];
  inequalityColumns: string[];
  includeColumns: string[];
}

export interface StatisticsInfo {
  table: string;
  schema: string;
  statistics: string;
  lastUpdate: string;
  modificationCount: number;
  samplingPercent: number;
}

export interface ExecutionPlan {
  statementText: string;
  estimatedTotalCost: number;
  nodes: PlanNode;
  missingIndexes: MissingIndex[];
  warnings: string[];
  statistics: StatisticsInfo[];
}
