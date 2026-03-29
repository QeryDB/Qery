import type { SchemaTree, TableInfo, ViewInfo } from '@/types/schema';

export interface RelationshipEdge {
  table: string;
  schema: string;
  fromColumn: string;
  toColumn: string;
  matchType: 'exact' | 'convention' | 'suffix';
}

export interface ManualRelationship {
  from_table: string;
  from_column: string;
  to_table: string;
  to_column: string;
}

const BLACKLIST_SUFFIXES = [
  '_guid', '_dbcno', '_specrecno', '_fileid',
  '_create_date', '_lastup_date', '_create_user', '_lastup_user',
  '_iptal', '_hidden', '_kilitli', '_degisti', '_checksum',
  '_special1', '_special2', '_special3',
];

function isBlacklisted(col: string): boolean {
  const lower = col.toLowerCase();
  return BLACKLIST_SUFFIXES.some((s) => lower.endsWith(s));
}

function stripShortPrefix(col: string): string {
  const idx = col.indexOf('_');
  if (idx >= 2 && idx <= 4 && idx + 1 < col.length) return col.slice(idx + 1);
  return col;
}

/** Generic PK names that match every table — skip for exact-name matching */
const GENERIC_PK_NAMES = new Set(['id', 'pk', 'key', 'uuid', 'guid', 'oid']);

/**
 * Build a relationship map from SchemaTree using PK-anchored strategies.
 * All lookups are O(1) via indexes — safe for 1000+ table schemas.
 *
 * Phase 0: Real FKs from DB metadata
 * Phase 1: Exact name on PK — column matches another table's PK name (index lookup)
 * Phase 2: Convention — `user_id` → `users.id` (index lookup)
 * Phase 3: Suffix on PK — strip short prefix, match against PK index
 * Phase 4: Remove dismissed, merge manual
 */
export function buildRelationshipMap(
  schema: SchemaTree,
  manualRelationships?: ManualRelationship[],
  dismissedKeys?: string[],
): Map<string, RelationshipEdge[]> {
  const relMap = new Map<string, RelationshipEdge[]>();
  const seen = new Set<string>();

  function addEdge(fromTable: string, fromSchema: string, fromCol: string, toTable: string, toSchema: string, toCol: string, matchType: RelationshipEdge['matchType']) {
    const key = `${fromTable.toLowerCase()}|${fromCol.toLowerCase()}|${toTable.toLowerCase()}|${toCol.toLowerCase()}`;
    if (seen.has(key)) return;
    seen.add(key);
    const k = fromTable.toLowerCase();
    let edges = relMap.get(k);
    if (!edges) { edges = []; relMap.set(k, edges); }
    edges.push({ table: toTable, schema: toSchema, fromColumn: fromCol, toColumn: toCol, matchType });
  }

  // ── Build indexes (all O(n)) — include both tables and views ──

  const allObjects: (TableInfo | ViewInfo)[] = [...schema.tables, ...(schema.views?.filter(v => v.columns) || [])];
  const tableSchemaMap = new Map<string, string>();
  // PK name index: pkNameLower → [{ table, schema, pkName }]
  const pkNameIndex = new Map<string, { table: string; schema: string; pkName: string }[]>();
  // Table name lookup for convention matching (includes depluralization)
  const tableNameLookup = new Map<string, TableInfo>();
  // Table → PK names for convention strategy
  const pkByTable = new Map<string, string[]>();

  for (const t of allObjects) {
    const tLower = t.name.toLowerCase();
    tableSchemaMap.set(tLower, t.schema);
    tableNameLookup.set(tLower, t);
    if (tLower.endsWith('s') && tLower.length > 3) {
      tableNameLookup.set(tLower.slice(0, -1), t);
    }
    if (!t.columns) continue;
    for (const col of t.columns) {
      if (col.is_primary_key) {
        const pkLower = col.name.toLowerCase();
        let arr = pkNameIndex.get(pkLower);
        if (!arr) { arr = []; pkNameIndex.set(pkLower, arr); }
        arr.push({ table: t.name, schema: t.schema, pkName: col.name });
        let pks = pkByTable.get(tLower);
        if (!pks) { pks = []; pkByTable.set(tLower, pks); }
        pks.push(col.name);
      }
    }
  }

  // ── Phase 0: Real FKs from DB metadata ──
  for (const t of allObjects) {
    if (!t.columns) continue;
    for (const col of t.columns) {
      if (!col.fk_table || !col.fk_column) continue;
      const fkSchema = tableSchemaMap.get(col.fk_table.toLowerCase()) || t.schema;
      addEdge(t.name, t.schema, col.name, col.fk_table, fkSchema, col.fk_column, 'exact');
      addEdge(col.fk_table, fkSchema, col.fk_column, t.name, t.schema, col.name, 'exact');
    }
  }

  // ── Phase 1-3: PK-anchored ghost FK detection (all index lookups) ──
  for (const t of allObjects) {
    if (!t.columns) continue;
    const tLower = t.name.toLowerCase();

    for (const col of t.columns) {
      if (isBlacklisted(col.name) || col.is_primary_key) continue;
      const colLower = col.name.toLowerCase();
      if (GENERIC_PK_NAMES.has(colLower)) continue;

      // Strategy 1: Exact name on PK — O(1) lookup
      const pkMatches = pkNameIndex.get(colLower);
      if (pkMatches) {
        for (const pk of pkMatches) {
          if (pk.table.toLowerCase() === tLower) continue;
          addEdge(t.name, t.schema, col.name, pk.table, pk.schema, pk.pkName, 'exact');
          addEdge(pk.table, pk.schema, pk.pkName, t.name, t.schema, col.name, 'exact');
        }
      }

      // Strategy 2: Convention — `user_id` → `users.id` — O(1) lookup
      // Always runs (no short-circuit from Strategy 1 — a column can match both)
      const lastUnderscore = colLower.lastIndexOf('_');
      if (lastUnderscore > 1) {
        const tablePart = colLower.slice(0, lastUnderscore);
        const pkPart = colLower.slice(lastUnderscore + 1);
        if (pkPart.length >= 1) {
          const matchedTable = tableNameLookup.get(tablePart);
          if (matchedTable && matchedTable.name.toLowerCase() !== tLower) {
            const pks = pkByTable.get(matchedTable.name.toLowerCase());
            if (pks?.some((pk) => pk.toLowerCase() === pkPart)) {
              const pkName = pks.find((pk) => pk.toLowerCase() === pkPart)!;
              addEdge(t.name, t.schema, col.name, matchedTable.name, matchedTable.schema, pkName, 'convention');
              addEdge(matchedTable.name, matchedTable.schema, pkName, t.name, t.schema, col.name, 'convention');
            }
          }
        }
      }

      // Strategy 3: Suffix on PK — strip short prefix, O(1) lookup
      const core = stripShortPrefix(col.name).toLowerCase();
      if (core !== colLower && core.length >= 3) {
        const suffixMatches = pkNameIndex.get(core);
        if (suffixMatches) {
          for (const pk of suffixMatches) {
            if (pk.table.toLowerCase() === tLower) continue;
            addEdge(t.name, t.schema, col.name, pk.table, pk.schema, pk.pkName, 'suffix');
            addEdge(pk.table, pk.schema, pk.pkName, t.name, t.schema, col.name, 'suffix');
          }
        }
      }
    }
  }

  // ── Phase 4a: Remove dismissed ghost FKs ──
  if (dismissedKeys && dismissedKeys.length > 0) {
    const dismissedSet = new Set(dismissedKeys.map((k) => k.toLowerCase()));
    for (const [tableKey, edges] of relMap) {
      const filtered = edges.filter((e) => {
        const fwd = `${tableKey}|${e.fromColumn}|${e.table}|${e.toColumn}`.toLowerCase();
        const rev = `${e.table}|${e.toColumn}|${tableKey}|${e.fromColumn}`.toLowerCase();
        return !dismissedSet.has(fwd) && !dismissedSet.has(rev);
      });
      if (filtered.length === 0) relMap.delete(tableKey);
      else relMap.set(tableKey, filtered);
    }
  }

  // ── Phase 4b: Merge manual relationships ──
  if (manualRelationships && manualRelationships.length > 0) {
    for (const mr of manualRelationships) {
      const toSchema = tableSchemaMap.get(mr.to_table.toLowerCase()) || 'dbo';
      const fromSchema = tableSchemaMap.get(mr.from_table.toLowerCase()) || 'dbo';
      addEdge(mr.from_table, fromSchema, mr.from_column, mr.to_table, toSchema, mr.to_column, 'exact');
      addEdge(mr.to_table, toSchema, mr.to_column, mr.from_table, fromSchema, mr.from_column, 'exact');
    }
  }

  return relMap;
}
