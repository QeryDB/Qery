// Parses SQL SELECT definitions to extract column alias → human-readable name mappings.
//
// Views/procs/functions may use internal aliases like [#msg_S_0088] or [msg_S_1032]
// but place the real column description in adjacent block comments:
//
//   cari_kod AS [msg_S_1032],    /* CARI KODU */
//   ISNULL(t.col, '-') AS [msg_S_0472], /* CARİ GRUP İSMİ */
//   CariBaglantiIsim AS [#msg_S_0077] /* BAĞLANTI TİPİ  */ ,
//
// Priority: comment text > simplified source expression > raw alias

export interface ColumnDetail {
  alias: string;
  comment: string | null;
  sourceExpr: string | null;
  sourceField: string | null;
  sourceTable: string | null;
  sourceSchema: string | null;
}

export function parseColumnDetails(definition: string | undefined): ColumnDetail[] {
  if (!definition) return [];

  const detailMap = new Map<string, ColumnDetail>();

  // --- Pass 1: extract aliases with comments ---
  const aliasWithBlockComment =
    /AS\s+\[([^\]]+)\]\s*,?\s*\/\*\s*([^*]*?)\s*\*\//gi;
  const aliasWithLineComment =
    /AS\s+\[([^\]]+)\]\s*,?\s*--\s*(.+)/gi;

  let match;
  while ((match = aliasWithBlockComment.exec(definition)) !== null) {
    const alias = match[1].trim();
    const comment = match[2].trim();
    if (comment) {
      const existing = detailMap.get(alias);
      if (existing) {
        existing.comment = comment;
      } else {
        detailMap.set(alias, { alias, comment, sourceExpr: null, sourceField: null, sourceTable: null, sourceSchema: null });
      }
    }
  }

  while ((match = aliasWithLineComment.exec(definition)) !== null) {
    const alias = match[1].trim();
    const comment = match[2].trim();
    if (comment) {
      const existing = detailMap.get(alias);
      if (existing) {
        if (!existing.comment) existing.comment = comment;
      } else {
        detailMap.set(alias, { alias, comment, sourceExpr: null, sourceField: null, sourceTable: null, sourceSchema: null });
      }
    }
  }

  // --- Pass 2: extract source expressions ---
  const stripped = definition.replace(/--[^\n]*/g, ' ');
  const noComments = stripped.replace(/\/\*[\s\S]*?\*\//g, ' ');

  const selectColumns = extractSelectColumns(noComments);
  if (selectColumns) {
    const columns = splitColumns(selectColumns);
    for (const col of columns) {
      const trimmed = col.trim();
      if (!trimmed) continue;

      const asMatch = trimmed.match(/^(.+?)\s+AS\s+\[?([^\]\s]+)\]?\s*$/i);
      if (asMatch) {
        const sourceExpr = asMatch[1].trim();
        const alias = asMatch[2].trim();
        const sourceField = simplifyExpression(sourceExpr);
        const existing = detailMap.get(alias);
        if (existing) {
          existing.sourceExpr = sourceExpr;
          existing.sourceField = sourceField;
        } else {
          detailMap.set(alias, { alias, comment: null, sourceExpr, sourceField, sourceTable: null, sourceSchema: null });
        }
      }
    }
  }

  // --- Pass 3: FROM/JOIN alias resolution ---
  const aliasToTable = parseFromAliases(noComments);

  for (const detail of detailMap.values()) {
    if (!detail.sourceExpr) continue;
    // Check if sourceExpr starts with an alias prefix like "t.column" or "[t].[column]"
    const prefixMatch = detail.sourceExpr.match(/^\[?(\w+)\]?\.\[?(\w+)\]?$/);
    if (prefixMatch) {
      const tableAlias = prefixMatch[1];
      const resolved = aliasToTable.get(tableAlias.toLowerCase());
      if (resolved) {
        detail.sourceTable = resolved.table;
        detail.sourceSchema = resolved.schema;
      }
    } else {
      // Try to extract alias prefix from inside wrapped expressions (ISNULL(t.col, ...) etc.)
      const innerRef = extractInnerReference(detail.sourceExpr);
      if (innerRef) {
        const resolved = aliasToTable.get(innerRef.alias.toLowerCase());
        if (resolved) {
          detail.sourceTable = resolved.table;
          detail.sourceSchema = resolved.schema;
        }
      }
    }
  }

  return Array.from(detailMap.values());
}

export function parseColumnAliases(definition: string | undefined): Record<string, string> {
  const details = parseColumnDetails(definition);
  const mapping: Record<string, string> = {};
  for (const d of details) {
    const display = d.comment || d.sourceField;
    if (display) mapping[d.alias] = display;
  }
  return mapping;
}

/**
 * Parse FROM and JOIN clauses to build an alias → { table, schema } map.
 * Handles: FROM [dbo].[table] t, JOIN [dbo].[table] AS t, FROM table t
 */
function parseFromAliases(sql: string): Map<string, { table: string; schema: string }> {
  const map = new Map<string, { table: string; schema: string }>();
  const re = /(?:FROM|JOIN)\s+(?:\[?(\w+)\]?\.)?\[?(\w+)\]?\s+(?:AS\s+)?(\w+)/gi;
  let m;
  while ((m = re.exec(sql)) !== null) {
    const schema = m[1] || 'dbo';
    const table = m[2];
    const alias = m[3].toLowerCase();
    // Skip SQL keywords that look like aliases
    const kw = alias.toUpperCase();
    if (kw === 'ON' || kw === 'WHERE' || kw === 'SET' || kw === 'INNER' || kw === 'LEFT' || kw === 'RIGHT' || kw === 'OUTER' || kw === 'CROSS' || kw === 'FULL' || kw === 'GROUP' || kw === 'ORDER' || kw === 'HAVING' || kw === 'UNION') continue;
    map.set(alias, { table, schema });
  }
  return map;
}

/**
 * Try to extract the first alias.column reference from inside a wrapped expression
 * like ISNULL(t.col, '-') or CAST(t.col AS int)
 */
function extractInnerReference(expr: string): { alias: string; column: string } | null {
  const m = expr.match(/\b(\w+)\.(\w+)\b/);
  if (m) {
    // Exclude function names and SQL keywords
    const candidate = m[1].toUpperCase();
    if (candidate === 'ISNULL' || candidate === 'COALESCE' || candidate === 'CAST' || candidate === 'CONVERT' || candidate === 'CASE' || candidate === 'DBO') return null;
    return { alias: m[1], column: m[2] };
  }
  return null;
}

/**
 * Extract the column list from the first SELECT ... FROM in the definition.
 */
function extractSelectColumns(sql: string): string | null {
  const selectMatch = sql.match(/\bSELECT\b\s+(?:TOP\s+\(?\s*\d+\s*\)?\s+)?(?:DISTINCT\s+)?/i);
  if (!selectMatch) return null;

  const startIdx = selectMatch.index! + selectMatch[0].length;

  let depth = 0;
  let caseDepth = 0;
  let i = startIdx;
  const upper = sql.toUpperCase();

  while (i < sql.length) {
    if (sql[i] === "'") {
      i++;
      while (i < sql.length && sql[i] !== "'") {
        if (sql[i] === "'" && sql[i + 1] === "'") i++;
        i++;
      }
      i++;
      continue;
    }

    if (sql[i] === '(') { depth++; i++; continue; }
    if (sql[i] === ')') { depth--; i++; continue; }

    if (depth === 0 && upper.substring(i, i + 4) === 'CASE' && /\W/.test(sql[i + 4] || ' ')) {
      caseDepth++;
      i += 4;
      continue;
    }
    if (depth === 0 && caseDepth > 0 && upper.substring(i, i + 3) === 'END' && /\W/.test(sql[i + 3] || ' ')) {
      caseDepth--;
      i += 3;
      continue;
    }

    if (depth === 0 && caseDepth === 0 && upper.substring(i, i + 4) === 'FROM' && /\W/.test(sql[i + 4] || ' ')) {
      if (i === 0 || /\s/.test(sql[i - 1])) {
        return sql.substring(startIdx, i).trim();
      }
    }

    i++;
  }

  return sql.substring(startIdx).trim();
}

/**
 * Split comma-separated column expressions, respecting parentheses and CASE..END.
 */
function splitColumns(columnList: string): string[] {
  const columns: string[] = [];
  let depth = 0;
  let caseDepth = 0;
  let current = '';
  const upper = columnList.toUpperCase();

  for (let i = 0; i < columnList.length; i++) {
    const ch = columnList[i];

    if (ch === "'") {
      current += ch;
      i++;
      while (i < columnList.length && columnList[i] !== "'") {
        if (columnList[i] === "'" && columnList[i + 1] === "'") {
          current += "''";
          i++;
        } else {
          current += columnList[i];
        }
        i++;
      }
      if (i < columnList.length) current += columnList[i];
      continue;
    }

    if (ch === '(') { depth++; current += ch; continue; }
    if (ch === ')') { depth--; current += ch; continue; }

    if (depth === 0 && upper.substring(i, i + 4) === 'CASE' && (i === 0 || /\W/.test(columnList[i - 1])) && /\W/.test(columnList[i + 4] || ' ')) {
      caseDepth++;
    }
    if (depth === 0 && caseDepth > 0 && upper.substring(i, i + 3) === 'END' && (i === 0 || /\W/.test(columnList[i - 1])) && /\W/.test(columnList[i + 3] || ' ')) {
      caseDepth--;
    }

    if (ch === ',' && depth === 0 && caseDepth === 0) {
      columns.push(current);
      current = '';
      continue;
    }

    current += ch;
  }

  if (current.trim()) columns.push(current);
  return columns;
}

/**
 * Simplify a source expression to a readable column name.
 */
function simplifyExpression(expr: string): string {
  const trimmed = expr.trim();

  const simpleRef = trimmed.match(/^(?:\[?[\w]+\]?\.)*\[?([\w]+)\]?$/);
  if (simpleRef) return simpleRef[1];

  const isnullMatch = trimmed.match(/^ISNULL\s*\(\s*(.+?)\s*,\s*.+\)$/i);
  if (isnullMatch) return simplifyExpression(isnullMatch[1]);

  const coalesceMatch = trimmed.match(/^COALESCE\s*\(\s*(.+?)\s*,/i);
  if (coalesceMatch) return simplifyExpression(coalesceMatch[1]);

  const castMatch = trimmed.match(/^CAST\s*\(\s*(.+?)\s+AS\s+\w+.*\)$/i);
  if (castMatch) return simplifyExpression(castMatch[1]);

  const convertMatch = trimmed.match(/^CONVERT\s*\(\s*\w+(?:\([^)]*\))?\s*,\s*(.+?)\s*(?:,\s*\d+\s*)?\)$/i);
  if (convertMatch) return simplifyExpression(convertMatch[1]);

  if (trimmed.length <= 40) return trimmed;
  return trimmed.substring(0, 37) + '...';
}
