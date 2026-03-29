import { schemaCompletionSource, SQLDialect, type SQLNamespace } from '@codemirror/lang-sql';
import { snippet } from '@codemirror/autocomplete';
import type { Completion, CompletionContext, CompletionResult } from '@codemirror/autocomplete';
import type { Extension } from '@codemirror/state';
import type { SchemaTree, TableInfo, ColumnSummary } from '@/types/schema';
import { astField } from './sql-ast-extension';
import { buildRelationshipMap, type RelationshipEdge, type ManualRelationship } from '@/lib/relationship-map';
import { getDialect } from '@/lib/dialect';

// Re-export for backward compat — these are the SAME instances used by DialectConfig
export const MSSQLDialect = getDialect('mssql').codeMirrorDialect;
export const PostgreSQLDialect = getDialect('postgres').codeMirrorDialect;

function formatColumnDetail(col: {
  data_type: string;
  max_length?: number | null;
  precision?: number | null;
  scale?: number | null;
  is_nullable?: boolean;
  is_primary_key?: boolean;
  is_foreign_key?: boolean;
  is_identity?: boolean;
}): string {
  let typeStr = col.data_type;

  // Add length/precision info
  if (['varchar', 'nvarchar', 'char', 'nchar', 'varbinary', 'binary'].includes(col.data_type.toLowerCase())) {
    if (col.max_length === -1) {
      typeStr += '(MAX)';
    } else if (col.max_length != null) {
      // nvarchar/nchar store 2 bytes per char
      const displayLen = col.data_type.toLowerCase().startsWith('n') ? col.max_length! / 2 : col.max_length;
      typeStr += `(${displayLen})`;
    }
  } else if (['decimal', 'numeric'].includes(col.data_type.toLowerCase())) {
    if (col.precision != null) {
      typeStr += col.scale ? `(${col.precision},${col.scale})` : `(${col.precision})`;
    }
  } else if (col.data_type.toLowerCase() === 'datetime2' && col.scale != null) {
    typeStr += `(${col.scale})`;
  }

  const flags: string[] = [];
  if (col.is_primary_key) flags.push('PK');
  if (col.is_foreign_key) flags.push('FK');
  if (col.is_identity) flags.push('IDENTITY');
  if (col.is_nullable === false) flags.push('NOT NULL');

  return flags.length > 0 ? `${typeStr} ${flags.join(' ')}` : typeStr;
}

/** Transform SchemaTree into SQLNamespace for CodeMirror schema completions */
export function buildSQLNamespace(schema: SchemaTree | null | undefined): SQLNamespace {
  if (!schema) return {};

  const namespace: Record<string, SQLNamespace> = {};

  // Group by schema
  const bySchema = new Map<string, Record<string, SQLNamespace>>();

  for (const table of schema.tables) {
    if (!bySchema.has(table.schema)) bySchema.set(table.schema, {});
    const schemaObj = bySchema.get(table.schema)!;

    if (table.columns && table.columns.length > 0) {
      const columns: Completion[] = table.columns.map((col) => ({
        label: col.name,
        type: 'property',
        detail: formatColumnDetail(col),
        boost: col.is_primary_key ? 2 : col.is_foreign_key ? 1 : 0,
      }));
      schemaObj[table.name] = columns;
    } else {
      schemaObj[table.name] = [];
    }
  }

  for (const view of schema.views) {
    if (!bySchema.has(view.schema)) bySchema.set(view.schema, {});
    bySchema.get(view.schema)![view.name] = {
      self: { label: view.name, type: 'type', detail: 'view' },
      children: [],
    } as unknown as SQLNamespace;
  }

  for (const proc of schema.procedures) {
    if (!bySchema.has(proc.schema)) bySchema.set(proc.schema, {});
    bySchema.get(proc.schema)![proc.name] = {
      self: { label: proc.name, type: 'function', detail: 'procedure' },
      children: [],
    } as unknown as SQLNamespace;
  }

  for (const fn of schema.functions) {
    if (!bySchema.has(fn.schema)) bySchema.set(fn.schema, {});
    bySchema.get(fn.schema)![fn.name] = {
      self: { label: fn.name, type: 'function', detail: `function (${fn.type})` },
      children: [],
    } as unknown as SQLNamespace;
  }

  for (const [schemaName, objects] of bySchema) {
    namespace[schemaName] = objects;
  }

  return namespace;
}

/** Extract table names referenced in FROM / JOIN clauses */
function extractTableReferences(sql: string): string[] {
  const tables: string[] = [];
  // Match FROM/JOIN followed by optional [schema]. then tablename (with optional brackets)
  const regex = /\b(?:FROM|JOIN)\s+(?:\[?\w+\]?\.)?\[?(\w+)\]?/gi;
  let match;
  while ((match = regex.exec(sql)) !== null) {
    tables.push(match[1]);
  }
  return [...new Set(tables)];
}

/** Build a lookup map: lowercase table name → TableInfo (with columns) */
function buildTableLookup(schema: SchemaTree): Map<string, TableInfo> {
  const map = new Map<string, TableInfo>();
  for (const t of schema.tables) {
    if (t.columns && t.columns.length > 0) {
      map.set(t.name.toLowerCase(), t);
    }
  }
  return map;
}

/**
 * Custom completion source that offers columns from tables found in FROM/JOIN clauses.
 * Uses AST state field when available, falls back to regex extraction.
 * Supports alias.column dot-completion.
 */
function fromClauseColumnSource(schema: SchemaTree): (context: CompletionContext) => CompletionResult | null {
  const tableLookup = buildTableLookup(schema);

  return (context: CompletionContext) => {
    // Check for alias dot-completion: e.g. "c." where c is an alias
    const dotMatch = context.matchBefore(/(\w+)\.\w*/);
    if (dotMatch) {
      const prefix = dotMatch.text.split('.')[0];
      const astResult = context.state.field(astField, false);
      if (astResult) {
        const realTable = astResult.aliases.get(prefix.toLowerCase());
        if (realTable) {
          const table = tableLookup.get(realTable.toLowerCase());
          if (table?.columns) {
            const dotPos = dotMatch.from + prefix.length + 1;
            return {
              from: dotPos,
              options: table.columns.map((col) => ({
                label: col.name,
                type: 'property',
                detail: formatColumnDetail(col),
                boost: col.is_primary_key ? 2 : col.is_foreign_key ? 1 : 0,
              })),
              validFor: /^\w*$/,
            };
          }
        }
      }
      return null;
    }

    // Match word characters (including empty — triggers on space after keyword)
    const word = context.matchBefore(/\w*/);
    if (!word) return null;

    // Skip if preceded by a dot (dot-completion handled above)
    const charBefore = word.from > 0 ? context.state.doc.sliceString(word.from - 1, word.from) : '';
    if (charBefore === '.') return null;

    const textBefore = context.state.doc.sliceString(
      Math.max(0, word.from - 200), word.from
    );

    // Don't suggest columns in table-name positions (right after FROM, JOIN, INTO, UPDATE, TABLE)
    if (/\b(?:FROM|JOIN|INTO|UPDATE|TABLE)\s*$/i.test(textBefore.trimEnd())) return null;

    // For zero-length matches (nothing typed yet), only trigger in column-appropriate positions
    if (word.from === word.to && !context.explicit) {
      if (!/(?:\bSELECT\s+|,\s*|\bWHERE\s+|\bAND\s+|\bOR\s+|\bON\s+|\bSET\s+|\bHAVING\s+|\bBY\s+)$/i.test(textBefore)) return null;
    }

    // Try AST first, fall back to regex
    let tableNames: string[];
    const astResult = context.state.field(astField, false);
    if (astResult && astResult.tables.length > 0) {
      tableNames = astResult.tables.map((t) => t.name);
    } else {
      const doc = context.state.doc.toString();
      tableNames = extractTableReferences(doc);
    }
    if (tableNames.length === 0) return null;

    // Collect columns from all referenced tables
    const columns: Completion[] = [];
    const seen = new Set<string>();
    const multiTable = tableNames.length > 1;

    for (const name of tableNames) {
      const table = tableLookup.get(name.toLowerCase());
      if (!table?.columns) continue;

      for (const col of table.columns) {
        const key = col.name.toLowerCase();
        if (seen.has(key)) continue;
        seen.add(key);
        columns.push({
          label: col.name,
          type: 'property',
          detail: multiTable
            ? `${formatColumnDetail(col)} — ${table.name}`
            : formatColumnDetail(col),
          boost: col.is_primary_key ? 1 : col.is_foreign_key ? 0.5 : 0,
        });
      }
    }

    if (columns.length === 0) return null;

    return {
      from: word.from,
      options: columns,
      validFor: /^\w*$/,
    };
  };
}

/**
 * Completion source for JOIN suggestions with ON clause from relationship map.
 * After typing "JOIN ", suggests related tables with auto-filled ON clause.
 */
function joinCompletionSource(
  schema: SchemaTree,
  relMap: Map<string, RelationshipEdge[]>,
  defaultSchema = 'dbo',
): (context: CompletionContext) => CompletionResult | null {
  return (context: CompletionContext) => {
    // Detect cursor after JOIN keyword
    const word = context.matchBefore(/\w*/);
    if (!word) return null;

    const textBefore = context.state.doc.sliceString(
      Math.max(0, word.from - 200), word.from
    );
    // Only activate after JOIN keyword
    if (!/\bJOIN\s+$/i.test(textBefore)) return null;

    // Find FROM table(s) from AST or regex
    let fromTables: string[] = [];
    const astResult = context.state.field(astField, false);
    if (astResult && astResult.tables.length > 0) {
      fromTables = astResult.tables.map((t) => t.name);
    } else {
      const doc = context.state.doc.toString();
      fromTables = extractTableReferences(doc);
    }
    if (fromTables.length === 0) return null;

    // Gather all relationship edges from all FROM tables
    const options: Completion[] = [];
    const seen = new Set<string>();

    // Also get aliases so we can use alias in ON clause
    const aliasMap = astResult?.aliases;

    for (const fromTable of fromTables) {
      const edges = relMap.get(fromTable.toLowerCase());
      if (!edges) continue;

      // Figure out the alias or name to use for the FROM table in ON clause
      let fromAlias = fromTable;
      if (aliasMap) {
        for (const [alias, tableName] of aliasMap) {
          if (tableName.toLowerCase() === fromTable.toLowerCase()) {
            fromAlias = alias;
            break;
          }
        }
      }

      for (const edge of edges) {
        const tableKey = edge.table.toLowerCase();
        // Don't suggest tables already in the query
        if (fromTables.some((ft) => ft.toLowerCase() === tableKey)) continue;
        // Dedup by full edge (table + columns) — same table can appear via different relationships
        const edgeKey = `${tableKey}|${edge.fromColumn}|${edge.toColumn}`.toLowerCase();
        if (seen.has(edgeKey)) continue;
        seen.add(edgeKey);

        const boost = edge.matchType === 'exact' ? 5 : 3;
        // Schema-qualify target table if not in default schema
        const qualifiedTable = edge.schema && edge.schema.toLowerCase() !== defaultSchema.toLowerCase()
          ? `${edge.schema}.${edge.table}` : edge.table;
        // Use alias if detected, otherwise FROM table name
        const hasAlias = fromAlias.toLowerCase() !== fromTable.toLowerCase();
        const fromRef = hasAlias ? fromAlias : fromTable;
        const detail = `${fromRef}.${edge.fromColumn} → ${qualifiedTable}.${edge.toColumn}`;
        const snippetStr = `${qualifiedTable} ON ${fromRef}.${edge.fromColumn} = ${qualifiedTable}.${edge.toColumn}`;

        options.push({
          label: qualifiedTable,
          type: 'class',
          detail,
          boost,
          apply: snippet(snippetStr),
        });
      }
    }

    if (options.length === 0) return null;

    return {
      from: word.from,
      options,
      validFor: /^\w*$/,
    };
  };
}

// ─── WHERE Clause Snippet Source ──────────────────────────────────────────────

type ColumnCategory = 'date' | 'code' | 'name' | 'numeric' | 'boolean' | 'generic';

function categorizeColumn(col: ColumnSummary): ColumnCategory {
  const nameLower = col.name.toLowerCase();
  const typeLower = col.data_type.toLowerCase();

  // Date types or _tarih naming convention
  if (nameLower.includes('_tarih') || nameLower.endsWith('_date') ||
      ['datetime', 'datetime2', 'date', 'smalldatetime', 'datetimeoffset'].includes(typeLower)) {
    return 'date';
  }

  // Boolean
  if (typeLower === 'bit') return 'boolean';

  // Code columns: _kod suffix or short varchar
  if (nameLower.includes('_kod') || nameLower.endsWith('_kodu') || nameLower.endsWith('_code')) {
    return 'code';
  }

  // Name/description columns
  if (nameLower.includes('_unvan') || nameLower.includes('_adi') || nameLower.includes('_adi') ||
      nameLower.includes('_aciklama') || nameLower.includes('_ad') || nameLower.endsWith('_name') ||
      nameLower.endsWith('_description')) {
    return 'name';
  }

  // Numeric types
  if (['int', 'bigint', 'smallint', 'tinyint', 'decimal', 'numeric', 'float', 'real', 'money', 'smallmoney'].includes(typeLower)) {
    return 'numeric';
  }

  return 'generic';
}

function getSnippetsForCategory(category: ColumnCategory): Completion[] {
  switch (category) {
    case 'date':
      return [
        { label: '>= DATEADD(DAY, -30, GETDATE())', detail: 'Last 30 days', type: 'keyword', section: 'WHERE Snippets', apply: snippet(">= DATEADD(DAY, -${1:30}, GETDATE())") },
        { label: "BETWEEN '...' AND '...'", detail: 'Date range', type: 'keyword', section: 'WHERE Snippets', apply: snippet("BETWEEN '${1:2024-01-01}' AND '${2:2024-12-31}'") },
        { label: '= CAST(GETDATE() AS DATE)', detail: 'Today', type: 'keyword', section: 'WHERE Snippets', apply: snippet("= CAST(GETDATE() AS DATE)") },
        { label: '>= DATEADD(MONTH, -1, GETDATE())', detail: 'Last month', type: 'keyword', section: 'WHERE Snippets', apply: snippet(">= DATEADD(MONTH, -${1:1}, GETDATE())") },
        { label: 'IS NULL', detail: 'Null check', type: 'keyword', section: 'WHERE Snippets', apply: snippet("IS NULL") },
      ];
    case 'code':
      return [
        { label: "= '...'", detail: 'Exact match', type: 'keyword', section: 'WHERE Snippets', apply: snippet("= '${1:value}'") },
        { label: "IN ('...', '...')", detail: 'Multiple values', type: 'keyword', section: 'WHERE Snippets', apply: snippet("IN ('${1:val1}', '${2:val2}')") },
        { label: "LIKE '%...%'", detail: 'Contains', type: 'keyword', section: 'WHERE Snippets', apply: snippet("LIKE '%${1:value}%'") },
        { label: 'IS NULL', detail: 'Null check', type: 'keyword', section: 'WHERE Snippets', apply: snippet("IS NULL") },
        { label: 'IS NOT NULL', detail: 'Not null', type: 'keyword', section: 'WHERE Snippets', apply: snippet("IS NOT NULL") },
      ];
    case 'name':
      return [
        { label: "LIKE '%...%'", detail: 'Contains', type: 'keyword', section: 'WHERE Snippets', apply: snippet("LIKE '%${1:value}%'") },
        { label: "LIKE '...%'", detail: 'Starts with', type: 'keyword', section: 'WHERE Snippets', apply: snippet("LIKE '${1:value}%'") },
        { label: "= '...'", detail: 'Exact match', type: 'keyword', section: 'WHERE Snippets', apply: snippet("= '${1:value}'") },
        { label: 'IS NOT NULL', detail: 'Not null', type: 'keyword', section: 'WHERE Snippets', apply: snippet("IS NOT NULL") },
      ];
    case 'numeric':
      return [
        { label: '= 0', detail: 'Equals', type: 'keyword', section: 'WHERE Snippets', apply: snippet("= ${1:0}") },
        { label: 'BETWEEN 0 AND 1000', detail: 'Range', type: 'keyword', section: 'WHERE Snippets', apply: snippet("BETWEEN ${1:0} AND ${2:1000}") },
        { label: '> 0', detail: 'Greater than', type: 'keyword', section: 'WHERE Snippets', apply: snippet("> ${1:0}") },
        { label: 'IS NULL', detail: 'Null check', type: 'keyword', section: 'WHERE Snippets', apply: snippet("IS NULL") },
        { label: 'IS NOT NULL', detail: 'Not null', type: 'keyword', section: 'WHERE Snippets', apply: snippet("IS NOT NULL") },
      ];
    case 'boolean':
      return [
        { label: '= 1', detail: 'True', type: 'keyword', section: 'WHERE Snippets', apply: snippet("= 1") },
        { label: '= 0', detail: 'False', type: 'keyword', section: 'WHERE Snippets', apply: snippet("= 0") },
      ];
    case 'generic':
    default:
      return [
        { label: "= '...'", detail: 'Equals', type: 'keyword', section: 'WHERE Snippets', apply: snippet("= '${1:value}'") },
        { label: 'IS NULL', detail: 'Null check', type: 'keyword', section: 'WHERE Snippets', apply: snippet("IS NULL") },
        { label: 'IS NOT NULL', detail: 'Not null', type: 'keyword', section: 'WHERE Snippets', apply: snippet("IS NOT NULL") },
        { label: "IN ('...', '...')", detail: 'Multiple values', type: 'keyword', section: 'WHERE Snippets', apply: snippet("IN ('${1:val1}', '${2:val2}')") },
      ];
  }
}

/**
 * WHERE clause snippet source.
 * After typing "WHERE column_name " or "AND column_name ", suggests type-aware operators.
 */
function whereClauseSnippetSource(schema: SchemaTree): (context: CompletionContext) => CompletionResult | null {
  const tableLookup = buildTableLookup(schema);

  return (context: CompletionContext) => {
    // Match empty position (0 chars typed) or partial operator
    const word = context.matchBefore(/\w*/);
    if (!word) return null;

    // Check text before for WHERE/AND/OR + column pattern
    const textBefore = context.state.doc.sliceString(
      Math.max(0, word.from - 300), word.from
    );

    // Match: WHERE/AND/OR followed by optional alias.column or just column, then space
    const whereMatch = textBefore.match(
      /\b(?:WHERE|AND|OR)\s+(\w+(?:\.\w+)?)\s+$/i
    );
    if (!whereMatch) return null;

    const columnRef = whereMatch[1];
    let columnName: string;
    let tableName: string | null = null;

    // Resolve alias.column
    if (columnRef.includes('.')) {
      const [aliasOrTable, col] = columnRef.split('.');
      columnName = col;
      // Try to resolve alias via AST
      const astResult = context.state.field(astField, false);
      if (astResult) {
        const resolved = astResult.aliases.get(aliasOrTable.toLowerCase());
        if (resolved) tableName = resolved;
      }
      if (!tableName) tableName = aliasOrTable;
    } else {
      columnName = columnRef;
    }

    // Find the column in schema tables
    let matchedCol: ColumnSummary | null = null;

    if (tableName) {
      const table = tableLookup.get(tableName.toLowerCase());
      if (table?.columns) {
        matchedCol = table.columns.find((c) => c.name.toLowerCase() === columnName.toLowerCase()) || null;
      }
    }

    // If no specific table, search all tables in the query context
    if (!matchedCol) {
      let tableNames: string[] = [];
      const astResult = context.state.field(astField, false);
      if (astResult && astResult.tables.length > 0) {
        tableNames = astResult.tables.map((t) => t.name);
      } else {
        const doc = context.state.doc.toString();
        tableNames = extractTableReferences(doc);
      }

      for (const tName of tableNames) {
        const table = tableLookup.get(tName.toLowerCase());
        if (!table?.columns) continue;
        const found = table.columns.find((c) => c.name.toLowerCase() === columnName.toLowerCase());
        if (found) {
          matchedCol = found;
          break;
        }
      }
    }

    if (!matchedCol) return null;

    const category = categorizeColumn(matchedCol);
    const options = getSnippetsForCategory(category);

    return {
      from: word.from,
      options,
      validFor: /^[\w><=!]*$/,
    };
  };
}

// ─── Global Cache ────────────────────────────────────────────────────────────
// Built once per schema reference, shared across all CodeMirror instances.
// With keepalive pattern, only the first editor pays the build cost.
const _empty: Extension = [];
let _cachedSchemaRef: SchemaTree | null | undefined;
let _cachedManualRels: ManualRelationship[] | undefined;
let _cachedDismissedKeys: string[] | undefined;
let _cachedDialect: ReturnType<typeof SQLDialect.define> | undefined;
let _cachedExt: Extension = _empty;

/** Check if schema completion is already cached for this schema (instant load, no indicator needed) */
export function isSchemaCompletionCached(
  schema: SchemaTree | null | undefined,
): boolean {
  return schema != null && schema === _cachedSchemaRef && _cachedExt !== _empty;
}

/** Return cached schema completion extension, rebuilding only when schema changes */
export function getOrBuildSchemaCompletion(
  schema: SchemaTree | null | undefined,
  manualRelationships?: ManualRelationship[],
  dismissedKeys?: string[],
  cmDialect?: SQLDialect,
  defaultSchema?: string,
): Extension {
  if (
    schema === _cachedSchemaRef &&
    manualRelationships === _cachedManualRels &&
    dismissedKeys === _cachedDismissedKeys &&
    cmDialect === _cachedDialect
  ) {
    return _cachedExt;
  }
  _cachedSchemaRef = schema;
  _cachedManualRels = manualRelationships;
  _cachedDismissedKeys = dismissedKeys;
  _cachedDialect = cmDialect;
  _cachedExt = createSchemaCompletionExtension(schema, manualRelationships, dismissedKeys, cmDialect, defaultSchema);
  return _cachedExt;
}

/** Invalidate the global cache (call on manual refresh) */
export function invalidateSchemaCompletionCache(): void {
  _cachedSchemaRef = undefined;
  _cachedManualRels = undefined;
  _cachedDismissedKeys = undefined;
  _cachedExt = _empty;
}

/** Create a schema completion extension from SchemaTree data */
export function createSchemaCompletionExtension(
  schema: SchemaTree | null | undefined,
  manualRelationships?: ManualRelationship[],
  dismissedKeys?: string[],
  cmDialect: SQLDialect = MSSQLDialect,
  defaultSchema = 'dbo',
): Extension {
  const namespace = buildSQLNamespace(schema);

  // Build schema name completions (public, auth, analytics, etc.)
  const schemaNames: Completion[] = Array.from(new Set(
    [...(schema?.tables || []).map(t => t.schema),
     ...(schema?.views || []).map(v => v.schema),
     ...(schema?.procedures || []).map(p => p.schema),
     ...(schema?.functions || []).map(f => f.schema),
    ].filter(Boolean)
  )).map(name => ({ label: name, type: 'keyword', detail: 'schema', boost: -1 }));

  const extensions: Extension[] = [
    cmDialect.language.data.of({
      autocomplete: schemaCompletionSource({
        dialect: cmDialect,
        schema: namespace,
        defaultSchema,
        upperCaseKeywords: true,
      }),
    }),
  ];

  // Add schema name completions so typing "pub" suggests "public"
  if (schemaNames.length > 1) {
    extensions.push(
      cmDialect.language.data.of({
        autocomplete: (context: CompletionContext): CompletionResult | null => {
          const word = context.matchBefore(/\w+/);
          if (!word || word.from === word.to) return null;
          return { from: word.from, options: schemaNames, validFor: /^\w*$/ };
        },
      })
    );
  }

  // Add column-from-FROM-clause completions when schema has table data
  if (schema && schema.tables.some(t => t.columns && t.columns.length > 0)) {
    extensions.push(
      cmDialect.language.data.of({
        autocomplete: fromClauseColumnSource(schema),
      })
    );

    // 4A-2: JOIN suggestions from relationship map (ghost FKs + manual - dismissed)
    const relMap = buildRelationshipMap(schema, manualRelationships, dismissedKeys);
    if (relMap.size > 0) {
      extensions.push(
        cmDialect.language.data.of({
          autocomplete: joinCompletionSource(schema, relMap, defaultSchema),
        })
      );
    }

    // 4A-4: WHERE clause snippets by column type
    extensions.push(
      cmDialect.language.data.of({
        autocomplete: whereClauseSnippetSource(schema),
      })
    );
  }

  return extensions;
}
