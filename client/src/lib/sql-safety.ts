/**
 * Client-side SQL mutation detector.
 * Mirrors the Rust patterns in src-tauri/src/commands/objects.rs:build_mutation_patterns()
 */

export interface SqlSafetyResult {
  isSafe: boolean;
  mutations: string[];
}

const MUTATION_PATTERNS: RegExp[] = [
  /\bINSERT\s+INTO\b/i,
  /\bINSERT\s+\[/i,
  /\bUPDATE\s+\[/i,
  /\bUPDATE\s+\w+\.\w+/i,
  /\bDELETE\s+FROM\b/i,
  /\bDELETE\s+\[/i,
  /\bTRUNCATE\s+TABLE\b/i,
  /\bDROP\s+(TABLE|VIEW|PROCEDURE|FUNCTION|INDEX|TRIGGER)\b/i,
  /\bALTER\s+(TABLE|VIEW|PROCEDURE|FUNCTION|TRIGGER)\b/i,
  /\bCREATE\s+(TABLE|INDEX|TRIGGER)\b/i,
  /\bMERGE\s+INTO\b/i,
  /\bMERGE\s+\[/i,
  /\bEXEC(UTE)?\s+sp_rename\b/i,
  /\bDBCC\b/i,
  /\bBULK\s+INSERT\b/i,
  /\bWRITETEXT\b/i,
  /\bUPDATETEXT\b/i,
];

/** Known read-only system procs — skip flagging these */
const READONLY_PROCS = new Set([
  'sp_help', 'sp_helptext', 'sp_columns', 'sp_stored_procedures',
  'sp_tables', 'sp_fkeys', 'sp_pkeys', 'sp_statistics',
  'sp_helpindex', 'sp_helpconstraint', 'sp_depends',
  'sp_who', 'sp_who2', 'sp_lock', 'sp_spaceused',
]);

/** EXEC/EXECUTE of unknown procs */
const EXEC_PATTERN = /\bEXEC(UTE)?\s+(?:\[?(\w+)\]?\.)?(\[?\w+\]?)\b/gi;

/**
 * Check if the text immediately after a mutation match targets a temp table (#name or [#name]).
 * Mirrors Rust `targets_temp_table` logic.
 */
function targetsTempTable(cleaned: string, matchEnd: number): boolean {
  const rest = cleaned.slice(matchEnd).trimStart();
  return rest.startsWith('#') || rest.startsWith('[#');
}

/**
 * Strip comments and string literals to reduce false positives.
 * Same approach as the Rust detect_mutations function.
 */
function stripNoise(sql: string): string {
  let s = sql;
  // Remove line comments
  s = s.replace(/--[^\n]*/g, '');
  // Remove block comments
  s = s.replace(/\/\*[\s\S]*?\*\//g, '');
  // Neutralize string literals
  s = s.replace(/'[^']*'/g, "''");
  return s;
}

export function checkSqlSafety(sql: string): SqlSafetyResult {
  const cleaned = stripNoise(sql);
  const mutations: string[] = [];

  for (const pattern of MUTATION_PATTERNS) {
    // Reset lastIndex for patterns that aren't global
    const match = pattern.exec(cleaned);
    if (match) {
      // Skip if targets a temp table
      if (targetsTempTable(cleaned, match.index + match[0].length)) continue;
      mutations.push(match[0].toUpperCase().replace(/\s+/g, ' '));
    }
  }

  // Check EXEC/EXECUTE of unknown procs
  let execMatch: RegExpExecArray | null;
  EXEC_PATTERN.lastIndex = 0;
  while ((execMatch = EXEC_PATTERN.exec(cleaned)) !== null) {
    const procName = execMatch[3].replace(/\[|\]/g, '').toLowerCase();
    if (!READONLY_PROCS.has(procName)) {
      // Skip if it's already captured by sp_rename pattern
      if (procName === 'sp_rename') continue;
      mutations.push(`EXEC ${execMatch[3].replace(/\[|\]/g, '')}`);
    }
  }

  return {
    isSafe: mutations.length === 0,
    mutations: [...new Set(mutations)], // deduplicate
  };
}
