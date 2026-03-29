import { formatDialect } from 'sql-formatter';
import type { TableInfo, ColumnSummary } from '@/types/schema';
import { getDialect } from '@/lib/dialect';

function fmt(raw: string, dialectName: string = 'mssql'): string {
  try {
    const d = getDialect(dialectName);
    return formatDialect(raw, { dialect: d.formatterDialect, tabWidth: 2, keywordCase: 'upper' as const });
  } catch {
    return raw;
  }
}

/** Map a ColumnSummary to a DECLARE-ready type string (MSSQL only) */
function sqlTypeDecl(col: ColumnSummary): string {
  const t = col.data_type.toUpperCase();
  if (['VARCHAR', 'NVARCHAR', 'CHAR', 'NCHAR', 'VARBINARY', 'BINARY'].includes(t)) {
    if (col.max_length === -1) return `${t}(MAX)`;
    if (col.max_length != null) {
      const len = t.startsWith('N') ? col.max_length / 2 : col.max_length;
      return `${t}(${len})`;
    }
    return t;
  }
  if (['DECIMAL', 'NUMERIC'].includes(t)) {
    if (col.precision != null) {
      return col.scale ? `${t}(${col.precision},${col.scale})` : `${t}(${col.precision})`;
    }
    return t;
  }
  if (t === 'DATETIME2' && col.scale != null) return `${t}(${col.scale})`;
  return t;
}

/** Build DECLARE block for a set of columns (MSSQL only) */
function buildDeclares(cols: ColumnSummary[]): string {
  return cols.map((c) => `DECLARE @${c.name} ${sqlTypeDecl(c)};`).join('\n');
}

/** SELECT with explicit columns */
export function generateSelect(table: TableInfo, dialectName: string = 'mssql'): string {
  const d = getDialect(dialectName);
  if (!table.columns || table.columns.length === 0) {
    return fmt(d.selectTop(table.schema, table.name), dialectName);
  }
  const cols = table.columns.map((c) => d.escapeId(c.name)).join(', ');
  const qn = d.qualifiedTable(table.schema, table.name);
  // Use dialect's selectTop pattern but with explicit columns
  const raw = d.selectTop(table.schema, table.name).replace('*', cols);
  return fmt(raw, dialectName);
}

/** INSERT INTO with non-identity columns */
export function generateInsert(table: TableInfo, dialectName: string = 'mssql'): string {
  const d = getDialect(dialectName);
  const qn = d.qualifiedTable(table.schema, table.name);
  if (!table.columns || table.columns.length === 0) {
    return fmt(`INSERT INTO ${qn} (/* columns */) VALUES (/* values */)`, dialectName);
  }
  const insertCols = table.columns.filter((c) => !c.is_identity);
  if (insertCols.length === 0) {
    return `-- All columns are IDENTITY — cannot generate INSERT\nINSERT INTO ${qn} DEFAULT VALUES`;
  }

  const colNames = insertCols.map((c) => d.escapeId(c.name)).join(', ');
  const params = insertCols.map((c, i) => d.paramPlaceholder(i + 1, c.name)).join(', ');
  const insertSql = fmt(`INSERT INTO ${qn} (${colNames}) VALUES (${params})`, dialectName);

  // MSSQL: prepend DECLARE block
  if (d.supportsDeclareVariables) {
    return `${buildDeclares(insertCols)}\n\n${insertSql}`;
  }
  return insertSql;
}

/** UPDATE with non-PK columns in SET, PK in WHERE */
export function generateUpdate(table: TableInfo, dialectName: string = 'mssql'): string {
  const d = getDialect(dialectName);
  const qn = d.qualifiedTable(table.schema, table.name);
  if (!table.columns || table.columns.length === 0) {
    return fmt(`UPDATE ${qn} SET /* col = value */ WHERE /* add your filter */`, dialectName);
  }
  const pkCols = table.columns.filter((c) => c.is_primary_key);
  const setCols = table.columns.filter((c) => !c.is_primary_key && !c.is_identity);

  if (setCols.length === 0) {
    return `-- No updatable columns found\nUPDATE ${qn} SET /* col = value */ WHERE /* add your filter */`;
  }

  const setClause = setCols.map((c, i) => `${d.escapeId(c.name)} = ${d.paramPlaceholder(i + 1, c.name)}`).join(', ');
  const whereClause = pkCols.length > 0
    ? pkCols.map((c, i) => `${d.escapeId(c.name)} = ${d.paramPlaceholder(setCols.length + i + 1, c.name)}`).join(' AND ')
    : '/* add your filter */';

  const updateSql = fmt(`UPDATE ${qn} SET ${setClause} WHERE ${whereClause}`, dialectName);

  if (d.supportsDeclareVariables) {
    const allParamCols = [...setCols, ...pkCols];
    return `${buildDeclares(allParamCols)}\n\n${updateSql}`;
  }
  return updateSql;
}

/** DELETE with PK in WHERE */
export function generateDelete(table: TableInfo, dialectName: string = 'mssql'): string {
  const d = getDialect(dialectName);
  const qn = d.qualifiedTable(table.schema, table.name);
  if (!table.columns || table.columns.length === 0) {
    return fmt(`DELETE FROM ${qn} WHERE /* add your filter */`, dialectName);
  }
  const pkCols = table.columns.filter((c) => c.is_primary_key);
  const whereClause = pkCols.length > 0
    ? pkCols.map((c, i) => `${d.escapeId(c.name)} = ${d.paramPlaceholder(i + 1, c.name)}`).join(' AND ')
    : '/* add your filter */';

  const deleteSql = fmt(`DELETE FROM ${qn} WHERE ${whereClause}`, dialectName);

  if (d.supportsDeclareVariables && pkCols.length > 0) {
    return `${buildDeclares(pkCols)}\n\n${deleteSql}`;
  }
  return deleteSql;
}
