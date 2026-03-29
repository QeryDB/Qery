export interface TableReference {
  name: string;
  schema?: string;
  alias?: string;
}

export interface ASTParseResult {
  tables: TableReference[];
  ctes: string[];
  aliases: Map<string, string>; // alias → real table name
  success: boolean;
}

// Lazy-loaded parser — imports only the ~200-300KB dialect build, not the 3.3MB monolith
let cachedParser: any = null;

async function getParser(): Promise<any> {
  if (cachedParser) return cachedParser;
  // Default to TransactSQL — covers MSSQL and is a good general parser
  const mod = await import('node-sql-parser/build/transactsql');
  cachedParser = new mod.Parser();
  return cachedParser;
}

const EMPTY_RESULT: ASTParseResult = {
  tables: [],
  ctes: [],
  aliases: new Map(),
  success: false,
};

// Memoize: avoid re-parsing identical SQL
let lastSql = '';
let lastResult: ASTParseResult = EMPTY_RESULT;

/** Sync: returns cached AST result or regex fallback (for CodeMirror state field) */
export function parseSql(sql: string): ASTParseResult {
  if (!sql.trim()) return EMPTY_RESULT;
  if (sql === lastSql) return lastResult;

  // If parser is already loaded, use it synchronously
  if (cachedParser) {
    try {
      const result = parseWithAST(cachedParser, sql);
      lastSql = sql; lastResult = result;
      return result;
    } catch { /* fall through to regex */ }
  }

  // Regex fallback (always available, no async needed)
  const result = parseWithRegex(sql);
  lastSql = sql; lastResult = result;
  return result;
}

/** Async: ensures parser is loaded, then parses */
export async function parseSqlAsync(sql: string): Promise<ASTParseResult> {
  if (!sql.trim()) return EMPTY_RESULT;
  if (sql === lastSql) return lastResult;
  const parser = await getParser();
  try {
    const result = parseWithAST(parser, sql);
    lastSql = sql; lastResult = result;
    return result;
  } catch {
    const result = parseWithRegex(sql);
    lastSql = sql; lastResult = result;
    return result;
  }
}

/** Pre-warm the parser in the background */
export function preloadParser(): void {
  getParser().catch(() => {});
}

function parseWithAST(parser: any, sql: string): ASTParseResult {
  const ast = parser.astify(sql, { database: 'TransactSQL' });

  const tables: TableReference[] = [];
  const ctes: string[] = [];
  const aliases = new Map<string, string>();
  const seen = new Set<string>();

  const stmts: any[] = Array.isArray(ast) ? ast : [ast];

  for (const stmt of stmts) {
    if (!stmt) continue;

    // Extract CTEs
    if (stmt.with) {
      const withItems = Array.isArray(stmt.with) ? stmt.with : [stmt.with];
      for (const w of withItems) {
        if (w.name?.value) {
          ctes.push(w.name.value);
        }
      }
    }

    // Extract table references
    extractTablesFromNode(stmt, tables, aliases, seen, ctes);
  }

  return { tables, ctes, aliases, success: true };
}

function extractTablesFromNode(
  node: any,
  tables: TableReference[],
  aliases: Map<string, string>,
  seen: Set<string>,
  cteNames: string[],
): void {
  if (!node || typeof node !== 'object') return;

  // Handle FROM clause (can be array of table refs)
  if (node.from) {
    const fromItems = Array.isArray(node.from) ? node.from : [node.from];
    for (const item of fromItems) {
      processTableRef(item, tables, aliases, seen, cteNames);
    }
  }

  // Handle JOINs in the table array
  if (node.table && typeof node.table === 'string') {
    processTableRef(node, tables, aliases, seen, cteNames);
  }

  // Recurse into subqueries and unions
  for (const key of ['where', 'having', 'select', 'columns', 'left', 'right', 'expr', 'args', 'set', 'values', 'union', '_next']) {
    const child = node[key];
    if (child) {
      if (Array.isArray(child)) {
        for (const c of child) {
          if (c && typeof c === 'object') extractTablesFromNode(c, tables, aliases, seen, cteNames);
        }
      } else if (typeof child === 'object') {
        extractTablesFromNode(child, tables, aliases, seen, cteNames);
      }
    }
  }
}

function processTableRef(
  item: any,
  tables: TableReference[],
  aliases: Map<string, string>,
  seen: Set<string>,
  cteNames: string[],
): void {
  if (!item || typeof item !== 'object') return;

  if (item.table && typeof item.table === 'string') {
    const tableName = item.table;
    const schemaName = item.db || item.schema || undefined;
    const alias = item.as || undefined;

    // Skip CTE self-references
    if (cteNames.some((c) => c.toLowerCase() === tableName.toLowerCase())) return;

    const key = `${(schemaName || '').toLowerCase()}.${tableName.toLowerCase()}`;
    if (!seen.has(key)) {
      seen.add(key);
      tables.push({ name: tableName, schema: schemaName, alias });
    }

    if (alias) {
      aliases.set(alias.toLowerCase(), tableName);
    }
  }

  // Handle joins within FROM items
  if (item.join) {
    processTableRef(item.join, tables, aliases, seen, cteNames);
  }

  // Recurse into the item for nested structures
  extractTablesFromNode(item, tables, aliases, seen, cteNames);
}

/** Regex fallback for when AST parsing fails (partial SQL, typing in progress) */
function parseWithRegex(sql: string): ASTParseResult {
  const tables: TableReference[] = [];
  const aliases = new Map<string, string>();
  const seen = new Set<string>();

  // Extract CTEs: WITH name AS (
  const ctes: string[] = [];
  const cteRegex = /\bWITH\s+([\s\S]*?)(?=\bSELECT\b)/gi;
  let cteMatch;
  while ((cteMatch = cteRegex.exec(sql)) !== null) {
    const cteBlock = cteMatch[1];
    const nameRegex = /(\w+)\s+AS\s*\(/gi;
    let nameMatch;
    while ((nameMatch = nameRegex.exec(cteBlock)) !== null) {
      ctes.push(nameMatch[1]);
    }
  }

  const cteNamesLower = new Set(ctes.map((c) => c.toLowerCase()));

  // Match FROM/JOIN followed by optional [schema]. then tablename (with optional alias)
  const regex = /\b(?:FROM|JOIN)\s+(?:\[?\w+\]?\.)?\[?(\w+)\]?(?:\s+(?:AS\s+)?(\w+))?/gi;
  let match;
  while ((match = regex.exec(sql)) !== null) {
    const tableName = match[1];
    const alias = match[2];

    if (cteNamesLower.has(tableName.toLowerCase())) continue;

    // Skip SQL keywords that could follow FROM/JOIN
    if (/^(?:WHERE|ON|SET|VALUES|SELECT|INTO|ORDER|GROUP|HAVING|UNION|EXCEPT|INTERSECT)$/i.test(tableName)) continue;

    const key = tableName.toLowerCase();
    if (!seen.has(key)) {
      seen.add(key);
      tables.push({ name: tableName, alias });
    }

    if (alias && !/^(?:WHERE|ON|SET|INNER|LEFT|RIGHT|FULL|CROSS|OUTER|ORDER|GROUP|HAVING)$/i.test(alias)) {
      aliases.set(alias.toLowerCase(), tableName);
    }
  }

  return { tables, ctes, aliases, success: false };
}
