import type { ExecutionPlan, PlanNode, MissingIndex, StatisticsInfo } from '../types/execution-plan';

const NS = 'http://schemas.microsoft.com/sqlserver/2004/07/showplan';

function attr(el: Element, name: string, fallback = ''): string {
  return el.getAttribute(name) ?? fallback;
}

function numAttr(el: Element, name: string, fallback = 0): number {
  const v = parseFloat(el.getAttribute(name) ?? '');
  return isNaN(v) ? fallback : v;
}

function directChildren(el: Element, tag: string): Element[] {
  return Array.from(el.children).filter(
    (c) => c.localName === tag && c.namespaceURI === NS,
  );
}

/**
 * Recursively find all descendant RelOp elements, but stop
 * descending into nested RelOps (those will be processed by their own parseRelOp call).
 */
function findChildRelOps(parentRelOp: Element): Element[] {
  const result: Element[] = [];

  function walk(el: Element) {
    for (const child of Array.from(el.children)) {
      if (child.localName === 'RelOp' && child.namespaceURI === NS) {
        result.push(child);
        // Don't descend — this RelOp will be parsed recursively
      } else {
        walk(child);
      }
    }
  }

  // Walk all non-RelOp children of the parent RelOp
  for (const child of Array.from(parentRelOp.children)) {
    if (child.localName === 'RelOp' && child.namespaceURI === NS) {
      result.push(child);
    } else {
      walk(child);
    }
  }

  return result;
}

/**
 * Find the first operation-specific element (the direct child of RelOp
 * that is NOT OutputList, RunTimeInformation, Warnings, etc.)
 */
const NON_OP_TAGS = new Set([
  'OutputList', 'RunTimeInformation', 'Warnings', 'MemoryFractions',
  'MemoryGrant', 'RelOp', 'ComputeScalar', 'DefinedValues',
]);

function findOperationElement(relOp: Element): Element | null {
  for (const child of Array.from(relOp.children)) {
    if (child.namespaceURI === NS && !NON_OP_TAGS.has(child.localName)) {
      return child;
    }
  }
  // Fallback: check inside ComputeScalar or other wrapper elements
  for (const child of Array.from(relOp.children)) {
    if (child.namespaceURI === NS && child.localName !== 'RelOp') {
      for (const grandchild of Array.from(child.children)) {
        if (grandchild.namespaceURI === NS && !NON_OP_TAGS.has(grandchild.localName)) {
          return grandchild;
        }
      }
    }
  }
  return null;
}

let nodeCounter = 0;

function parseRelOp(el: Element, rootCost: number): PlanNode {
  const subtreeCost = numAttr(el, 'EstimatedTotalSubtreeCost');
  const physicalOp = attr(el, 'PhysicalOp');
  const logicalOp = attr(el, 'LogicalOp');
  const estimatedRows = numAttr(el, 'EstimateRows');
  const estimatedRowsRead = numAttr(el, 'EstimatedRowsRead') || undefined;
  const tableCardinality = numAttr(el, 'TableCardinality') || undefined;
  const estimatedIO = numAttr(el, 'EstimatedIO');
  const estimatedCPU = numAttr(el, 'EstimateCPU');
  const nodeId = numAttr(el, 'NodeId', nodeCounter++);

  // Parse output columns (only from direct OutputList, not nested ones)
  const outputColumns: string[] = [];
  const outputList = directChildren(el, 'OutputList')[0];
  if (outputList) {
    for (const colRef of Array.from(outputList.getElementsByTagNameNS(NS, 'ColumnReference'))) {
      const col = attr(colRef, 'Column');
      const table = attr(colRef, 'Table');
      const schema = attr(colRef, 'Schema');
      outputColumns.push([schema, table, col].filter(Boolean).join('.'));
    }
  }

  // Parse warnings (only direct Warnings child)
  const warnings: string[] = [];
  const warningsEl = directChildren(el, 'Warnings')[0];
  if (warningsEl) {
    for (const child of Array.from(warningsEl.children)) {
      warnings.push(child.localName);
    }
  }

  // Find the operation-specific element and extract details
  let object: string | undefined;
  let indexName: string | undefined;
  let seekPredicates: string | undefined;
  let predicate: string | undefined;
  let isKeyLookup = false;

  const opEl = findOperationElement(el);
  if (opEl) {
    // Key Lookup detection (IndexScan with Lookup="1" or physicalOp contains "Key Lookup")
    if (attr(opEl, 'Lookup') === '1' || physicalOp.includes('Key Lookup')) {
      isKeyLookup = true;
    }

    // Object reference (table/index)
    const objRefs = opEl.getElementsByTagNameNS(NS, 'Object');
    if (objRefs.length > 0) {
      const objRef = objRefs[0];
      const tbl = attr(objRef, 'Table').replace(/[\[\]]/g, '');
      const idx = attr(objRef, 'Index').replace(/[\[\]]/g, '');
      const sch = attr(objRef, 'Schema').replace(/[\[\]]/g, '');
      object = [sch, tbl].filter(Boolean).join('.');
      if (idx) indexName = idx;
    }

    // Seek predicates
    const seekPreds = opEl.getElementsByTagNameNS(NS, 'SeekPredicates');
    if (seekPreds.length > 0) {
      // Build a readable representation from SeekPredicate > Prefix > RangeColumns
      const parts: string[] = [];
      for (const sp of Array.from(seekPreds[0].getElementsByTagNameNS(NS, 'SeekPredicate'))) {
        for (const colRef of Array.from(sp.getElementsByTagNameNS(NS, 'ColumnReference'))) {
          parts.push(attr(colRef, 'Column'));
        }
      }
      seekPredicates = parts.length > 0 ? parts.join(', ') : seekPreds[0].textContent?.trim();
    }

    // Predicate (filter)
    const predEls = directChildren(opEl, 'Predicate');
    if (predEls.length > 0) {
      const scalarOps = predEls[0].getElementsByTagNameNS(NS, 'ScalarOperator');
      if (scalarOps.length > 0) {
        predicate = attr(scalarOps[0], 'ScalarString');
      }
    }

    // Also check for ProbeResidual, BuildResidual, etc. (HashMatch)
    if (!predicate) {
      for (const tag of ['ProbeResidual', 'BuildResidual', 'Residual', 'PassThru']) {
        const residual = opEl.getElementsByTagNameNS(NS, tag);
        if (residual.length > 0) {
          const scalarOps = residual[0].getElementsByTagNameNS(NS, 'ScalarOperator');
          if (scalarOps.length > 0) {
            predicate = attr(scalarOps[0], 'ScalarString');
            break;
          }
        }
      }
    }
  }

  // Find all child RelOps by walking the tree (stops at RelOp boundaries)
  const childRelOps = findChildRelOps(el);
  const children = childRelOps.map((c) => parseRelOp(c, rootCost));

  const childrenCostSum = children.reduce((s, c) => s + c.estimatedCost, 0);
  const operatorCost = Math.max(0, subtreeCost - childrenCostSum);
  const costPercent = rootCost > 0 ? (operatorCost / rootCost) * 100 : 0;

  return {
    nodeId,
    physicalOp,
    logicalOp,
    estimatedRows,
    estimatedRowsRead,
    tableCardinality,
    estimatedCost: subtreeCost,
    operatorCost,
    costPercent,
    estimatedIO,
    estimatedCPU,
    outputColumns,
    warnings,
    object,
    indexName,
    seekPredicates,
    predicate,
    isKeyLookup: isKeyLookup || undefined,
    children,
  };
}

function parseMissingIndexes(doc: Document): MissingIndex[] {
  const result: MissingIndex[] = [];

  for (const group of Array.from(doc.getElementsByTagNameNS(NS, 'MissingIndexGroup'))) {
    const impact = numAttr(group, 'Impact');

    for (const mi of Array.from(group.getElementsByTagNameNS(NS, 'MissingIndex'))) {
      const database = attr(mi, 'Database').replace(/[\[\]]/g, '');
      const schema = attr(mi, 'Schema').replace(/[\[\]]/g, '');
      const table = attr(mi, 'Table').replace(/[\[\]]/g, '');

      const equalityColumns: string[] = [];
      const inequalityColumns: string[] = [];
      const includeColumns: string[] = [];

      for (const colGroup of directChildren(mi, 'ColumnGroup')) {
        const usage = attr(colGroup, 'Usage');
        const cols = Array.from(colGroup.getElementsByTagNameNS(NS, 'Column')).map((c) =>
          attr(c, 'Name').replace(/[\[\]]/g, ''),
        );

        if (usage === 'EQUALITY') equalityColumns.push(...cols);
        else if (usage === 'INEQUALITY') inequalityColumns.push(...cols);
        else if (usage === 'INCLUDE') includeColumns.push(...cols);
      }

      result.push({ impact, database, schema, table, equalityColumns, inequalityColumns, includeColumns });
    }
  }

  return result;
}

function parseStatistics(doc: Document): StatisticsInfo[] {
  const result: StatisticsInfo[] = [];
  for (const su of Array.from(doc.getElementsByTagNameNS(NS, 'StatisticsInfo'))) {
    const table = attr(su, 'Table').replace(/[\[\]]/g, '');
    const schema = attr(su, 'Schema').replace(/[\[\]]/g, '');
    const statistics = attr(su, 'Statistics').replace(/[\[\]]/g, '');
    const lastUpdate = attr(su, 'LastUpdate');
    const modificationCount = numAttr(su, 'ModificationCount');
    const samplingPercent = numAttr(su, 'SamplingPercent');
    result.push({ table, schema, statistics, lastUpdate, modificationCount, samplingPercent });
  }
  return result;
}

export function parsePlanXml(xml: string): ExecutionPlan {
  nodeCounter = 0;
  const parser = new DOMParser();
  const doc = parser.parseFromString(xml, 'application/xml');

  // Find first StmtSimple
  const stmts = doc.getElementsByTagNameNS(NS, 'StmtSimple');
  const stmt = stmts.length > 0 ? stmts[0] : null;
  const statementText = stmt ? attr(stmt, 'StatementText') : '';
  const rootCost = stmt ? numAttr(stmt, 'StatementSubTreeCost') : 0;

  // Find root RelOp — first RelOp inside QueryPlan
  const queryPlans = doc.getElementsByTagNameNS(NS, 'QueryPlan');
  let rootRelOp: Element | null = null;
  if (queryPlans.length > 0) {
    const relOps = directChildren(queryPlans[0], 'RelOp');
    rootRelOp = relOps.length > 0 ? relOps[0] : null;
  }
  if (!rootRelOp) {
    const allRelOps = doc.getElementsByTagNameNS(NS, 'RelOp');
    rootRelOp = allRelOps.length > 0 ? allRelOps[0] : null;
  }

  if (!rootRelOp) {
    return {
      statementText,
      estimatedTotalCost: rootCost,
      nodes: {
        nodeId: 0, physicalOp: 'Unknown', logicalOp: 'Unknown',
        estimatedRows: 0, estimatedCost: 0, operatorCost: 0, costPercent: 100,
        estimatedIO: 0, estimatedCPU: 0, outputColumns: [], warnings: [], children: [],
      },
      missingIndexes: [],
      warnings: [],
      statistics: [],
    };
  }

  const nodes = parseRelOp(rootRelOp, rootCost);
  const missingIndexes = parseMissingIndexes(doc);
  const statistics = parseStatistics(doc);

  // Collect global warnings
  const globalWarnings: string[] = [];
  if (stmt) {
    const stmtWarnings = directChildren(stmt, 'Warnings')[0];
    if (stmtWarnings) {
      for (const child of Array.from(stmtWarnings.children)) {
        globalWarnings.push(child.localName);
      }
    }
  }

  return {
    statementText,
    estimatedTotalCost: rootCost,
    nodes,
    missingIndexes,
    warnings: globalWarnings,
    statistics,
  };
}
