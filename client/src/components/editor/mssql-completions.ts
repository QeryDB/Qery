import { snippet } from '@codemirror/autocomplete';
import type { CompletionContext, CompletionResult, Completion } from '@codemirror/autocomplete';
import type { Extension } from '@codemirror/state';
import { MSSQLDialect } from './schema-completion';

// ─── MSSQL Functions ────────────────────────────────────────────────────────

const mssqlFunctions: Completion[] = [
  // String functions
  { label: 'ISNULL', detail: '(expr, replacement)', type: 'function', section: 'Functions' },
  { label: 'COALESCE', detail: '(expr1, expr2, ...)', type: 'function', section: 'Functions' },
  { label: 'CONVERT', detail: '(data_type, expr [, style])', type: 'function', section: 'Functions' },
  { label: 'CAST', detail: '(expr AS data_type)', type: 'function', section: 'Functions' },
  { label: 'TRY_CONVERT', detail: '(data_type, expr [, style])', type: 'function', section: 'Functions' },
  { label: 'TRY_CAST', detail: '(expr AS data_type)', type: 'function', section: 'Functions' },
  { label: 'LEN', detail: '(string)', type: 'function', section: 'Functions' },
  { label: 'DATALENGTH', detail: '(expr)', type: 'function', section: 'Functions' },
  { label: 'LEFT', detail: '(string, count)', type: 'function', section: 'Functions' },
  { label: 'RIGHT', detail: '(string, count)', type: 'function', section: 'Functions' },
  { label: 'SUBSTRING', detail: '(string, start, length)', type: 'function', section: 'Functions' },
  { label: 'CHARINDEX', detail: '(search, string [, start])', type: 'function', section: 'Functions' },
  { label: 'PATINDEX', detail: '(pattern, string)', type: 'function', section: 'Functions' },
  { label: 'REPLACE', detail: '(string, old, new)', type: 'function', section: 'Functions' },
  { label: 'STUFF', detail: '(string, start, length, insert)', type: 'function', section: 'Functions' },
  { label: 'LTRIM', detail: '(string)', type: 'function', section: 'Functions' },
  { label: 'RTRIM', detail: '(string)', type: 'function', section: 'Functions' },
  { label: 'TRIM', detail: '(string)', type: 'function', section: 'Functions' },
  { label: 'UPPER', detail: '(string)', type: 'function', section: 'Functions' },
  { label: 'LOWER', detail: '(string)', type: 'function', section: 'Functions' },
  { label: 'CONCAT', detail: '(str1, str2, ...)', type: 'function', section: 'Functions' },
  { label: 'CONCAT_WS', detail: '(separator, str1, str2, ...)', type: 'function', section: 'Functions' },
  { label: 'STRING_AGG', detail: '(expr, separator)', type: 'function', section: 'Functions' },
  { label: 'FORMAT', detail: '(value, format [, culture])', type: 'function', section: 'Functions' },
  { label: 'REVERSE', detail: '(string)', type: 'function', section: 'Functions' },
  { label: 'REPLICATE', detail: '(string, count)', type: 'function', section: 'Functions' },
  { label: 'SPACE', detail: '(count)', type: 'function', section: 'Functions' },

  // Date functions
  { label: 'GETDATE', detail: '()', type: 'function', section: 'Functions' },
  { label: 'GETUTCDATE', detail: '()', type: 'function', section: 'Functions' },
  { label: 'SYSDATETIME', detail: '()', type: 'function', section: 'Functions' },
  { label: 'DATEADD', detail: '(datepart, number, date)', type: 'function', section: 'Functions' },
  { label: 'DATEDIFF', detail: '(datepart, startdate, enddate)', type: 'function', section: 'Functions' },
  { label: 'DATEDIFF_BIG', detail: '(datepart, startdate, enddate)', type: 'function', section: 'Functions' },
  { label: 'DATEPART', detail: '(datepart, date)', type: 'function', section: 'Functions' },
  { label: 'DATENAME', detail: '(datepart, date)', type: 'function', section: 'Functions' },
  { label: 'YEAR', detail: '(date)', type: 'function', section: 'Functions' },
  { label: 'MONTH', detail: '(date)', type: 'function', section: 'Functions' },
  { label: 'DAY', detail: '(date)', type: 'function', section: 'Functions' },
  { label: 'EOMONTH', detail: '(date [, months])', type: 'function', section: 'Functions' },

  // Aggregate / window functions
  { label: 'ROW_NUMBER', detail: '() OVER(...)', type: 'function', section: 'Functions' },
  { label: 'RANK', detail: '() OVER(...)', type: 'function', section: 'Functions' },
  { label: 'DENSE_RANK', detail: '() OVER(...)', type: 'function', section: 'Functions' },
  { label: 'NTILE', detail: '(n) OVER(...)', type: 'function', section: 'Functions' },
  { label: 'LAG', detail: '(expr [, offset [, default]]) OVER(...)', type: 'function', section: 'Functions' },
  { label: 'LEAD', detail: '(expr [, offset [, default]]) OVER(...)', type: 'function', section: 'Functions' },
  { label: 'FIRST_VALUE', detail: '(expr) OVER(...)', type: 'function', section: 'Functions' },
  { label: 'LAST_VALUE', detail: '(expr) OVER(...)', type: 'function', section: 'Functions' },

  // Other
  { label: 'NEWID', detail: '()', type: 'function', section: 'Functions' },
  { label: 'SCOPE_IDENTITY', detail: '()', type: 'function', section: 'Functions' },
  { label: 'OBJECT_ID', detail: '(name [, type])', type: 'function', section: 'Functions' },
  { label: 'IIF', detail: '(condition, true_val, false_val)', type: 'function', section: 'Functions' },
  { label: 'CHOOSE', detail: '(index, val1, val2, ...)', type: 'function', section: 'Functions' },
  { label: 'JSON_VALUE', detail: '(expr, path)', type: 'function', section: 'Functions' },
  { label: 'JSON_QUERY', detail: '(expr, path)', type: 'function', section: 'Functions' },
  { label: 'OPENJSON', detail: '(jsonExpr [, path])', type: 'function', section: 'Functions' },
  { label: 'STRING_SPLIT', detail: '(string, separator)', type: 'function', section: 'Functions' },
];

// ─── System Variables ───────────────────────────────────────────────────────

const systemVariables: Completion[] = [
  { label: '@@ROWCOUNT', detail: 'Rows affected by last statement', type: 'variable', section: 'System Variables' },
  { label: '@@IDENTITY', detail: 'Last identity value inserted', type: 'variable', section: 'System Variables' },
  { label: '@@ERROR', detail: 'Error number of last statement', type: 'variable', section: 'System Variables' },
  { label: '@@TRANCOUNT', detail: 'Active transaction count', type: 'variable', section: 'System Variables' },
  { label: '@@VERSION', detail: 'SQL Server version info', type: 'variable', section: 'System Variables' },
  { label: '@@SERVERNAME', detail: 'Local server name', type: 'variable', section: 'System Variables' },
  { label: '@@SPID', detail: 'Current session ID', type: 'variable', section: 'System Variables' },
  { label: '@@FETCH_STATUS', detail: 'Cursor fetch status', type: 'variable', section: 'System Variables' },
  { label: '@@DATEFIRST', detail: 'First day of week setting', type: 'variable', section: 'System Variables' },
  { label: '@@LANGUAGE', detail: 'Current language name', type: 'variable', section: 'System Variables' },
];

// ─── Data Types ─────────────────────────────────────────────────────────────

const dataTypes: Completion[] = [
  { label: 'BIGINT', type: 'type', section: 'Data Types' },
  { label: 'INT', type: 'type', section: 'Data Types' },
  { label: 'SMALLINT', type: 'type', section: 'Data Types' },
  { label: 'TINYINT', type: 'type', section: 'Data Types' },
  { label: 'BIT', type: 'type', section: 'Data Types' },
  { label: 'DECIMAL', detail: '(p, s)', type: 'type', section: 'Data Types' },
  { label: 'NUMERIC', detail: '(p, s)', type: 'type', section: 'Data Types' },
  { label: 'FLOAT', detail: '(n)', type: 'type', section: 'Data Types' },
  { label: 'REAL', type: 'type', section: 'Data Types' },
  { label: 'MONEY', type: 'type', section: 'Data Types' },
  { label: 'SMALLMONEY', type: 'type', section: 'Data Types' },
  { label: 'VARCHAR', detail: '(n|MAX)', type: 'type', section: 'Data Types' },
  { label: 'NVARCHAR', detail: '(n|MAX)', type: 'type', section: 'Data Types' },
  { label: 'CHAR', detail: '(n)', type: 'type', section: 'Data Types' },
  { label: 'NCHAR', detail: '(n)', type: 'type', section: 'Data Types' },
  { label: 'TEXT', type: 'type', section: 'Data Types' },
  { label: 'NTEXT', type: 'type', section: 'Data Types' },
  { label: 'DATE', type: 'type', section: 'Data Types' },
  { label: 'TIME', detail: '(n)', type: 'type', section: 'Data Types' },
  { label: 'DATETIME', type: 'type', section: 'Data Types' },
  { label: 'DATETIME2', detail: '(n)', type: 'type', section: 'Data Types' },
  { label: 'SMALLDATETIME', type: 'type', section: 'Data Types' },
  { label: 'DATETIMEOFFSET', detail: '(n)', type: 'type', section: 'Data Types' },
  { label: 'UNIQUEIDENTIFIER', type: 'type', section: 'Data Types' },
  { label: 'VARBINARY', detail: '(n|MAX)', type: 'type', section: 'Data Types' },
  { label: 'BINARY', detail: '(n)', type: 'type', section: 'Data Types' },
  { label: 'IMAGE', type: 'type', section: 'Data Types' },
  { label: 'XML', type: 'type', section: 'Data Types' },
  { label: 'SQL_VARIANT', type: 'type', section: 'Data Types' },
];

// ─── Snippets ───────────────────────────────────────────────────────────────

const snippetCompletions: Completion[] = [
  {
    label: 'SELECT TOP',
    detail: 'SELECT TOP N ... FROM ...',
    type: 'keyword',
    section: 'Snippets',
    boost: -1,
    apply: snippet('SELECT TOP ${1:100} ${2:*}\nFROM ${3:table}\nWHERE ${4:1=1}'),
  },
  {
    label: 'CTE',
    detail: 'WITH ... AS (...)',
    type: 'keyword',
    section: 'Snippets',
    boost: -1,
    apply: snippet('WITH ${1:cte_name} AS (\n\tSELECT ${2:*}\n\tFROM ${3:table}\n\tWHERE ${4:1=1}\n)\nSELECT *\nFROM ${1:cte_name}'),
  },
  {
    label: 'TRY CATCH',
    detail: 'BEGIN TRY ... END CATCH',
    type: 'keyword',
    section: 'Snippets',
    boost: -1,
    apply: snippet('BEGIN TRY\n\t${1:-- statements}\nEND TRY\nBEGIN CATCH\n\tSELECT ERROR_MESSAGE() AS ErrorMessage;\n\t${2:-- error handling}\nEND CATCH'),
  },
  {
    label: 'MERGE',
    detail: 'MERGE INTO ... USING ...',
    type: 'keyword',
    section: 'Snippets',
    boost: -1,
    apply: snippet('MERGE INTO ${1:target} AS t\nUSING ${2:source} AS s\nON t.${3:id} = s.${3:id}\nWHEN MATCHED THEN\n\tUPDATE SET ${4:col} = s.${4:col}\nWHEN NOT MATCHED THEN\n\tINSERT (${4:col}) VALUES (s.${4:col});'),
  },
  {
    label: 'TEMP TABLE',
    detail: 'CREATE TABLE #temp ...',
    type: 'keyword',
    section: 'Snippets',
    boost: -1,
    apply: snippet('CREATE TABLE #${1:temp} (\n\t${2:id} INT IDENTITY(1,1) PRIMARY KEY,\n\t${3:col} ${4:NVARCHAR(100)}\n);\n\n${5:-- use temp table}\n\nDROP TABLE #${1:temp};'),
  },
  {
    label: 'IF EXISTS',
    detail: 'IF EXISTS (SELECT ...)',
    type: 'keyword',
    section: 'Snippets',
    boost: -1,
    apply: snippet('IF EXISTS (SELECT 1 FROM ${1:table} WHERE ${2:condition})\nBEGIN\n\t${3:-- statements}\nEND'),
  },
  {
    label: 'BEGIN TRANSACTION',
    detail: 'BEGIN TRAN ... COMMIT/ROLLBACK',
    type: 'keyword',
    section: 'Snippets',
    boost: -1,
    apply: snippet('BEGIN TRANSACTION;\nBEGIN TRY\n\t${1:-- statements}\n\tCOMMIT TRANSACTION;\nEND TRY\nBEGIN CATCH\n\tROLLBACK TRANSACTION;\n\tTHROW;\nEND CATCH'),
  },
  {
    label: 'DECLARE',
    detail: 'DECLARE @var TYPE = ...',
    type: 'keyword',
    section: 'Snippets',
    boost: -1,
    apply: snippet('DECLARE @${1:var} ${2:NVARCHAR(100)} = ${3:value};'),
  },
];

// ─── Combined completion source ─────────────────────────────────────────────

const allCompletions: Completion[] = [
  ...mssqlFunctions,
  ...systemVariables,
  ...dataTypes,
  ...snippetCompletions,
];

function mssqlCompletionSource(context: CompletionContext): CompletionResult | null {
  // Match word characters and @@ for system variables
  const word = context.matchBefore(/@@?\w*|\w+/);
  if (!word) return null;
  if (word.from === word.to && !context.explicit) return null;

  return {
    from: word.from,
    options: allCompletions,
    validFor: /^@@?\w*$/,
  };
}

/** Static extension for MSSQL-specific completions (functions, sys vars, types, snippets) */
export const mssqlCompletionsExtension: Extension = MSSQLDialect.language.data.of({
  autocomplete: mssqlCompletionSource,
});
