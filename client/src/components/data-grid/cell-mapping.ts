import { GridCellKind, type GridCell } from '@glideapps/glide-data-grid';

export { isJsonString } from '@/lib/json-utils';

/** Map SQL column type to grid cell kind — supports MSSQL, PostgreSQL, and SQLite types */
export function sqlTypeToKind(type: string): GridCellKind {
  const t = (type || '').toUpperCase();

  // Boolean types (MSSQL BIT, PG BOOLEAN, SQLite BOOLEAN)
  if (t.includes('BIT') || t.startsWith('BOOL'))
    return GridCellKind.Boolean;

  // Numeric types (all dialects)
  if (['INT', 'BIGINT', 'SMALLINT', 'TINYINT', 'FLOAT', 'REAL', 'DECIMAL', 'NUMERIC',
       'MONEY', 'SMALLMONEY', 'DOUBLE', 'SERIAL', 'INTEGER', 'NUMBER'].some(k => t.includes(k)))
    return GridCellKind.Number;

  // Legacy JS-derived types
  if (t === 'NUMBER') return GridCellKind.Number;
  if (t === 'BOOLEAN') return GridCellKind.Boolean;

  return GridCellKind.Text;
}

// Backward compat alias
export const mssqlTypeToKind = sqlTypeToKind;

export function jsTypeToKind(value: any): GridCellKind {
  if (typeof value === 'number' || typeof value === 'bigint') return GridCellKind.Number;
  if (typeof value === 'boolean') return GridCellKind.Boolean;
  return GridCellKind.Text;
}

export function valueToCellContent(value: any, kind: GridCellKind, editable: boolean): GridCell {
  if (value === null || value === undefined) {
    switch (kind) {
      case GridCellKind.Boolean:
        return {
          kind: GridCellKind.Boolean,
          data: false,
          allowOverlay: false as const,
          readonly: !editable,
          themeOverride: { textMedium: '#9ca3af' },
        };
      case GridCellKind.Number:
        return {
          kind: GridCellKind.Number,
          data: undefined,
          displayData: 'NULL',
          allowOverlay: true,
          readonly: !editable,
          themeOverride: { textMedium: '#9ca3af' },
        };
      default:
        return {
          kind: GridCellKind.Text,
          data: '',
          displayData: 'NULL',
          allowOverlay: true,
          readonly: !editable,
          themeOverride: { textMedium: '#9ca3af' },
        } as GridCell;
    }
  }

  switch (kind) {
    case GridCellKind.Number: {
      const num = typeof value === 'number' ? value : Number(value);
      return {
        kind: GridCellKind.Number,
        data: Number.isNaN(num) ? undefined : num,
        displayData: String(value),
        allowOverlay: true,
        readonly: !editable,
      };
    }
    case GridCellKind.Boolean:
      return {
        kind: GridCellKind.Boolean,
        data: value === true || value === 1 || value === '1' || value === 'true' || value === 't',
        allowOverlay: false as const,
        readonly: !editable,
      };
    default: {
      const isObj = value !== null && typeof value === 'object';
      const str = isObj ? JSON.stringify(value) : String(value);
      return {
        kind: GridCellKind.Text,
        data: str,
        displayData: str,
        allowOverlay: true,
        readonly: !editable,
      };
    }
  }
}

export function cellValueToRaw(cell: GridCell): any {
  switch (cell.kind) {
    case GridCellKind.Number:
      return cell.data;
    case GridCellKind.Boolean:
      return cell.data ? 1 : 0;
    case GridCellKind.Text:
      return cell.data;
    default:
      return undefined;
  }
}

/**
 * Coerce a raw edited value to the column's expected type.
 */
export function coerceToColumnType(
  rawValue: any,
  sqlType: string,
): { valid: boolean; value: any } {
  if (rawValue === null || rawValue === undefined || rawValue === '') {
    return { valid: true, value: null };
  }

  const kind = sqlTypeToKind(sqlType);
  const t = (sqlType || '').toUpperCase();

  if (kind === GridCellKind.Boolean) {
    if (typeof rawValue === 'boolean') return { valid: true, value: rawValue ? 1 : 0 };
    if (rawValue === 0 || rawValue === 1) return { valid: true, value: rawValue };
    const s = String(rawValue).toLowerCase().trim();
    if (s === '1' || s === 'true' || s === 't') return { valid: true, value: 1 };
    if (s === '0' || s === 'false' || s === 'f') return { valid: true, value: 0 };
    return { valid: false, value: rawValue };
  }

  if (kind === GridCellKind.Number) {
    if (typeof rawValue === 'number') {
      if (['INT', 'BIGINT', 'SMALLINT', 'TINYINT', 'INTEGER', 'SERIAL'].some(k => t.includes(k))) {
        if (!Number.isInteger(rawValue)) return { valid: false, value: rawValue };
      }
      return { valid: true, value: rawValue };
    }
    const num = Number(rawValue);
    if (Number.isNaN(num)) return { valid: false, value: rawValue };
    if (['INT', 'BIGINT', 'SMALLINT', 'TINYINT', 'INTEGER', 'SERIAL'].some(k => t.includes(k))) {
      if (!Number.isInteger(num)) return { valid: false, value: rawValue };
    }
    return { valid: true, value: num };
  }

  return { valid: true, value: rawValue };
}
