import type { ObjectParameter } from '@/types/schema';
import type { PendingEdit } from '@/components/data-grid/types';
import { SQLDialect, MSSQL, PostgreSQL, MySQL } from '@codemirror/lang-sql';
import { transactsql, postgresql, mysql, type DialectOptions } from 'sql-formatter';

// Custom dialects with case-insensitive identifiers (must match what sql() extension uses)
const MSSQLDialect = SQLDialect.define({ ...MSSQL.spec, caseInsensitiveIdentifiers: true });
const PGDialect = SQLDialect.define({ ...PostgreSQL.spec, caseInsensitiveIdentifiers: true });

/**
 * Abstract base class for all SQL dialect behavior.
 * Adding a new database = create a new subclass. Zero changes to existing code.
 */
export abstract class DialectConfig {
  // === Identity ===
  abstract readonly name: string;             // 'mssql', 'postgres', 'mysql', ...
  abstract readonly displayName: string;
  abstract readonly defaultSchema: string;
  abstract readonly defaultDatabase: string;
  abstract readonly defaultPort: number;

  // === SQL Syntax ===
  abstract escapeId(name: string): string;
  abstract selectTop(schema: string, table: string, limit?: number): string;
  abstract execProcedure(schema: string, name: string, args: string): string;
  abstract paramPlaceholder(index: number, name?: string): string;  // $1 vs @name
  abstract formatBoolean(truthy: boolean): string;

  qualifiedTable(schema: string, table: string): string {
    return `${this.escapeId(schema)}.${this.escapeId(table)}`;
  }

  selectFrom(schema: string, name: string): string {
    return `SELECT * FROM ${this.qualifiedTable(schema, name)}`;
  }

  selectFromFunc(schema: string, name: string, args: string): string {
    return `SELECT * FROM ${this.qualifiedTable(schema, name)}(${args})`;
  }

  selectScalarFunc(schema: string, name: string, args: string): string {
    return `SELECT ${this.qualifiedTable(schema, name)}(${args}) AS "Result"`;
  }

  countRows(schema: string, table: string): string {
    return `SELECT COUNT(*) AS total FROM ${this.qualifiedTable(schema, table)}`;
  }

  createIndex(schema: string, table: string, indexName: string, keyCols: string[], includeCols: string[] = []): string {
    const include = includeCols.length > 0
      ? `\nINCLUDE (${includeCols.map(c => this.escapeId(c)).join(', ')})`
      : '';
    return `CREATE INDEX ${this.escapeId(indexName)}\nON ${this.qualifiedTable(schema, table)} (${keyCols.map(c => this.escapeId(c)).join(', ')})${include};`;
  }

  // === UI Labels & Rendering ===
  abstract readonly selectTopLabel: string;

  /** How the schema tree should group objects: 'by-type' (MSSQL) or 'by-schema' (PG) */
  abstract readonly treeGrouping: 'by-type' | 'by-schema';

  // === Formatter / CodeMirror ===
  abstract readonly formatterLanguage: string;   // 'tsql', 'postgresql', 'mysql', ...
  abstract readonly codeMirrorLang: string;       // key to look up CM dialect
  abstract readonly codeMirrorDialect: SQLDialect;
  abstract readonly formatterDialect: DialectOptions;

  // === Auth / Features ===
  abstract readonly supportsWindowsAuth: boolean;
  abstract readonly supportsDiscovery: boolean;
  abstract readonly supportsDeclareVariables: boolean;

  /** How execution plans are returned: 'xml' (MSSQL SHOWPLAN) or 'json' (PG EXPLAIN) */
  abstract readonly planFormat: 'xml' | 'json' | 'text';

  // === Type Formatting ===

  formatValue(value: any, columnType?: string): string {
    if (value === null || value === undefined) return 'NULL';
    if (value === '') return "''";

    const ct = (columnType || '').toLowerCase();

    if (this.isBooleanType(ct) || typeof value === 'boolean') {
      const truthy = value === true || value === 1 || value === '1' || value === 'true' || value === 't';
      return this.formatBoolean(truthy);
    }

    if (typeof value === 'number' || typeof value === 'bigint') return String(value);

    if (this.isNumericType(ct)) {
      const num = Number(value);
      if (!isNaN(num)) return String(value);
    }

    return `'${String(value).replace(/'/g, "''")}'`;
  }

  quoteValue(val: string, dataType: string): string {
    const dt = dataType.toLowerCase();
    if (this.isNumericType(dt)) return val;
    if (this.isBooleanType(dt)) {
      const truthy = val === '1' || val.toLowerCase() === 'true' || val === 't';
      return this.formatBoolean(truthy);
    }
    return `'${val.replace(/'/g, "''")}'`;
  }

  formatParamType(p: ObjectParameter): string {
    const t = p.data_type;
    const tl = t.toLowerCase();
    if (this.isStringTypeWithLength(tl) && p.max_length != null) {
      return `${t}(${p.max_length === -1 ? 'MAX' : p.max_length})`;
    }
    if ((tl === 'decimal' || tl === 'numeric') && p.precision != null) {
      return p.scale ? `${t}(${p.precision},${p.scale})` : `${t}(${p.precision})`;
    }
    return t;
  }

  protected isBooleanType(ct: string): boolean {
    return ct.startsWith('bool') || ct === 'bit';
  }

  protected isNumericType(ct: string): boolean {
    return /^(int|bigint|smallint|tinyint|float|real|decimal|numeric|money|smallmoney|double|serial|integer|number)/.test(ct);
  }

  protected isStringTypeWithLength(ct: string): boolean {
    return /^(varchar|nvarchar|char|nchar|varbinary|binary|character varying|character)/.test(ct);
  }

  // === Default Parsing ===
  abstract parseDefaults(definition: string | undefined): Record<string, string>;

  protected stripQuotes(val: string): string {
    if (val.startsWith("'") && val.endsWith("'")) return val.slice(1, -1).replace(/''/g, "'");
    return val;
  }

  // === Execution SQL Builder ===

  buildExecSql(
    schema: string, name: string, objectType: string, functionType: string | undefined,
    inputParams: ObjectParameter[], paramValues: Record<string, string>,
    parsedDefaults: Record<string, string>,
  ): string {
    if (objectType === 'view') return this.selectFrom(schema, name);
    if (objectType === 'procedure') return this.buildProcedureCall(schema, name, inputParams, paramValues);

    const isTableValued = functionType === 'IF' || functionType === 'TF' || !functionType;
    const args = this.buildFunctionArgs(inputParams, paramValues, parsedDefaults);
    return isTableValued ? this.selectFromFunc(schema, name, args) : this.selectScalarFunc(schema, name, args);
  }

  protected abstract buildProcedureCall(schema: string, name: string, params: ObjectParameter[], values: Record<string, string>): string;

  protected buildFunctionArgs(params: ObjectParameter[], values: Record<string, string>, parsedDefaults: Record<string, string>): string {
    return params.map((p) => {
      const val = values[p.name];
      if (val !== undefined && val !== '') return this.quoteValue(val, p.data_type);
      const defVal = parsedDefaults[p.name] ?? p.default_value;
      if (defVal != null) return defVal === 'NULL' ? 'NULL' : this.quoteValue(defVal, p.data_type);
      return 'NULL';
    }).join(', ');
  }

  // === Data Grid SQL ===

  generateUpdates(
    table: string, schema: string, primaryKeys: string[],
    edits: Map<string, PendingEdit>, rows: Record<string, any>[],
    columnTypes?: Record<string, string>,
  ): string[] {
    const editsByRow = new Map<number, PendingEdit[]>();
    for (const edit of edits.values()) {
      const existing = editsByRow.get(edit.rowIndex) || [];
      existing.push(edit);
      editsByRow.set(edit.rowIndex, existing);
    }

    const qTable = this.qualifiedTable(schema, table);
    const statements: string[] = [];

    for (const [rowIndex, rowEdits] of editsByRow) {
      const row = rows[rowIndex];
      if (!row) continue;

      const set = rowEdits.map(e => {
        const val = e.newValue === '' && e.oldValue === null ? 'NULL' : this.formatValue(e.newValue, columnTypes?.[e.column]);
        return `${this.escapeId(e.column)} = ${val}`;
      });

      const where = primaryKeys.map(pk => {
        const v = row[pk];
        return v === null || v === undefined
          ? `${this.escapeId(pk)} IS NULL`
          : `${this.escapeId(pk)} = ${this.formatValue(v, columnTypes?.[pk])}`;
      });

      statements.push(`UPDATE ${qTable} SET ${set.join(', ')} WHERE ${where.join(' AND ')};`);
    }
    return statements;
  }

  generateInserts(
    table: string, schema: string,
    newRows: Record<string, any>[],
    columnTypes?: Record<string, string>,
  ): string[] {
    const qTable = this.qualifiedTable(schema, table);
    const statements: string[] = [];

    for (const row of newRows) {
      const entries = Object.entries(row).filter(([_, v]) => v !== null && v !== undefined && v !== '');
      if (entries.length === 0) continue;
      const cols = entries.map(([col]) => this.escapeId(col));
      const vals = entries.map(([col, val]) => this.formatValue(val, columnTypes?.[col]));
      statements.push(`INSERT INTO ${qTable} (${cols.join(', ')}) VALUES (${vals.join(', ')});`);
    }
    return statements;
  }
}


// ============================================================
// MSSQL Dialect
// ============================================================

export class MssqlDialect extends DialectConfig {
  readonly name = 'mssql';
  readonly displayName = 'SQL Server';
  readonly defaultSchema = 'dbo';
  readonly defaultDatabase = 'master';
  readonly defaultPort = 1433;
  readonly formatterLanguage = 'tsql';
  readonly codeMirrorLang = 'mssql';
  readonly codeMirrorDialect = MSSQLDialect;
  readonly formatterDialect = transactsql;
  readonly supportsWindowsAuth = true;
  readonly supportsDiscovery = true;
  readonly supportsDeclareVariables = true;
  readonly planFormat = 'xml' as const;
  readonly treeGrouping = 'by-type' as const;

  escapeId(name: string): string {
    return `"${name.replace(/"/g, '""')}"`;
  }

  selectTop(schema: string, table: string, limit = 100): string {
    return `SELECT TOP ${limit} * FROM ${this.qualifiedTable(schema, table)}`;
  }

  execProcedure(schema: string, name: string, args: string): string {
    return `EXEC ${this.escapeId(schema)}.${this.escapeId(name)} ${args}`.trim();
  }

  paramPlaceholder(_index: number, name?: string): string {
    return `@${name || 'p'}`;
  }

  formatBoolean(truthy: boolean): string {
    return truthy ? '1' : '0';
  }

  get selectTopLabel(): string { return 'SELECT TOP 100'; }

  parseDefaults(definition: string | undefined): Record<string, string> {
    if (!definition) return {};
    const defaults: Record<string, string> = {};
    const re = /(@\w+)\s+[\w()., ]+?\s*=\s*('(?:[^']|'')*'|-?\d+(?:\.\d+)?|NULL)\b/gi;
    let m;
    while ((m = re.exec(definition)) !== null) {
      defaults[m[1]] = this.stripQuotes(m[2]);
    }
    return defaults;
  }

  protected buildProcedureCall(schema: string, name: string, params: ObjectParameter[], values: Record<string, string>): string {
    const args = params.map((p) => {
      const val = values[p.name];
      if (val === undefined || val === '') return p.has_default_value ? null : `${p.name} = NULL`;
      return `${p.name} = ${this.quoteValue(val, p.data_type)}`;
    }).filter(Boolean).join(', ');
    return this.execProcedure(schema, name, args);
  }
}


// ============================================================
// PostgreSQL Dialect
// ============================================================

export class PostgresDialect extends DialectConfig {
  readonly name = 'postgres';
  readonly displayName = 'PostgreSQL';
  readonly defaultSchema = 'public';
  readonly defaultDatabase = 'postgres';
  readonly defaultPort = 5432;
  readonly formatterLanguage = 'postgresql';
  readonly codeMirrorLang = 'postgres';
  readonly codeMirrorDialect = PGDialect;
  readonly formatterDialect = postgresql;
  readonly supportsWindowsAuth = false;
  readonly supportsDiscovery = false;
  readonly supportsDeclareVariables = false;
  readonly planFormat = 'json' as const;
  readonly treeGrouping = 'by-schema' as const;

  escapeId(name: string): string {
    return `"${name.replace(/"/g, '""')}"`;
  }

  selectTop(schema: string, table: string, limit = 100): string {
    return `SELECT * FROM ${this.qualifiedTable(schema, table)} LIMIT ${limit}`;
  }

  execProcedure(schema: string, name: string, args: string): string {
    return `CALL ${this.qualifiedTable(schema, name)}(${args})`;
  }

  paramPlaceholder(index: number): string {
    return `$${index}`;
  }

  formatBoolean(truthy: boolean): string {
    return truthy ? 'true' : 'false';
  }

  get selectTopLabel(): string { return 'SELECT LIMIT 100'; }

  parseDefaults(definition: string | undefined): Record<string, string> {
    if (!definition) return {};
    const defaults: Record<string, string> = {};
    const re = /(\w+)\s+[\w\s().,]+?\s+DEFAULT\s+('(?:[^']|'')*'|-?\d+(?:\.\d+)?|NULL|true|false)\b/gi;
    let m;
    while ((m = re.exec(definition)) !== null) {
      defaults[m[1]] = this.stripQuotes(m[2]);
    }
    return defaults;
  }

  protected buildProcedureCall(schema: string, name: string, params: ObjectParameter[], values: Record<string, string>): string {
    const args = params.map((p) => {
      const val = values[p.name];
      if (val === undefined || val === '') return p.has_default_value ? null : 'NULL';
      return this.quoteValue(val, p.data_type);
    }).filter(Boolean).join(', ');
    return this.execProcedure(schema, name, args);
  }
}


// ============================================================
// SQLite Dialect
// ============================================================

export class SqliteDialect extends DialectConfig {
  readonly name = 'sqlite';
  readonly displayName = 'SQLite';
  readonly defaultSchema = 'main';
  readonly defaultDatabase = '';
  readonly defaultPort = 0;
  readonly formatterLanguage = 'sqlite';
  readonly codeMirrorLang = 'sqlite';
  readonly codeMirrorDialect = SQLDialect.define({ ...MSSQL.spec, caseInsensitiveIdentifiers: true }); // CM has no SQLite spec, use generic
  readonly formatterDialect = transactsql; // sql-formatter has no sqlite, use generic
  readonly supportsWindowsAuth = false;
  readonly supportsDiscovery = false;
  readonly supportsDeclareVariables = false;
  readonly planFormat = 'text' as const;
  readonly treeGrouping = 'by-type' as const;
  readonly selectTopLabel = 'SELECT LIMIT 100';

  escapeId(name: string): string {
    return `"${name.replace(/"/g, '""')}"`;
  }

  selectTop(_schema: string, table: string, limit = 100): string {
    // SQLite has no schemas — just table name
    return `SELECT * FROM ${this.escapeId(table)} LIMIT ${limit}`;
  }

  // SQLite stores booleans as INTEGER 0/1 — recognize BOOLEAN type affinity
  protected isBooleanType(ct: string): boolean {
    return ct.startsWith('bool') || ct === 'bit';
  }

  execProcedure(): string {
    throw new Error('SQLite does not support procedures');
  }

  paramPlaceholder(index: number): string {
    return `?${index}`;
  }

  formatBoolean(truthy: boolean): string {
    return truthy ? '1' : '0';
  }

  parseDefaults(): Record<string, string> {
    return {};
  }

  protected buildProcedureCall(): string {
    throw new Error('SQLite does not support procedures');
  }

  // Override: SQLite has no schemas
  qualifiedTable(_schema: string, table: string): string {
    return this.escapeId(table);
  }

  countRows(_schema: string, table: string): string {
    return `SELECT COUNT(*) AS total FROM ${this.escapeId(table)}`;
  }
}


// ============================================================
// Factory + Registry
// ============================================================

const dialects: Record<string, DialectConfig> = {
  mssql: new MssqlDialect(),
  postgres: new PostgresDialect(),
  sqlite: new SqliteDialect(),
};

/** Get a dialect instance by database type name. Returns MSSQL as fallback. */
export function getDialect(dbType: string): DialectConfig {
  return dialects[dbType] || dialects.mssql;
}

/** Register a new dialect (for plugins/future drivers) */
export function registerDialect(name: string, dialect: DialectConfig): void {
  dialects[name] = dialect;
}
