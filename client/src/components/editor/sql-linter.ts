import { linter, lintGutter, type Diagnostic } from '@codemirror/lint';
import type { Extension } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { astField } from './sql-ast-extension';
import { schemaDataFacet } from './schema-tooltip-extension';
import { parseSql } from './sql-ast-service';

/** Standard Levenshtein distance */
function levenshteinDistance(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  const dp: number[][] = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0));
  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] = a[i - 1] === b[j - 1]
        ? dp[i - 1][j - 1]
        : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
    }
  }
  return dp[m][n];
}

/** Find closest table name within Levenshtein threshold */
function findClosestMatch(name: string, lookupMap: Map<string, unknown>): string | null {
  const nameLower = name.toLowerCase();
  const threshold = Math.max(2, Math.floor(nameLower.length * 0.3));
  let bestMatch: string | null = null;
  let bestDist = threshold + 1;

  for (const key of lookupMap.keys()) {
    // Only compare bare table names (skip schema.table keys)
    if (key.includes('.')) continue;
    const dist = levenshteinDistance(nameLower, key);
    if (dist < bestDist) {
      bestDist = dist;
      bestMatch = key;
    }
  }

  if (bestMatch === null) return null;

  // Return the original-cased name from the lookup map
  const obj = lookupMap.get(bestMatch) as { name?: string } | undefined;
  return obj?.name ?? bestMatch.toUpperCase();
}

/** Render a compact lint message with prominent fix button (VSCode-style) */
function renderLintMessage(tableName: string, suggestion: string | null): Node {
  const wrapper = document.createElement('span');
  wrapper.style.cssText = 'display:inline-flex;align-items:center;gap:6px;font-size:12px';

  const text = document.createElement('span');
  if (suggestion) {
    text.textContent = `Unknown table: `;
    const code = document.createElement('code');
    code.textContent = tableName;
    code.style.cssText = 'text-decoration:line-through;opacity:0.7';
    text.appendChild(code);

    const arrow = document.createTextNode(` → `);
    text.appendChild(arrow);

    const fix = document.createElement('code');
    fix.textContent = suggestion;
    fix.style.cssText = 'font-weight:600;color:#4ade80';
    text.appendChild(fix);
  } else {
    text.textContent = `Unknown table: ${tableName}`;
  }

  wrapper.appendChild(text);
  return wrapper;
}

/** Lint extension that warns about unknown table names in FROM/JOIN clauses */
export function createSqlLinter(): Extension {
  return [
    lintGutter(),
    linter(
      (view) => {
        const diagnostics: Diagnostic[] = [];

        const lookupMap = view.state.facet(schemaDataFacet);
        if (!lookupMap || lookupMap.size === 0) return diagnostics;

        // Try AST field first, fall back to direct parsing
        let astResult = view.state.field(astField, false);
        if (!astResult || astResult.tables.length === 0) {
          const doc = view.state.doc.toString();
          if (!doc.trim()) return diagnostics;
          astResult = parseSql(doc);
        }
        if (astResult.tables.length === 0) return diagnostics;

        const cteNamesLower = new Set(astResult.ctes.map((c) => c.toLowerCase()));
        const doc = view.state.doc.toString();

        for (const ref of astResult.tables) {
          const tableName = ref.name;

          // Skip if it's a CTE name
          if (cteNamesLower.has(tableName.toLowerCase())) continue;

          // Check if table exists in schema (try bare name and with schema prefix)
          const exists =
            lookupMap.has(tableName.toLowerCase()) ||
            (ref.schema && lookupMap.has(`${ref.schema}.${tableName}`.toLowerCase()));

          if (exists) continue;

          // Find closest match for "Did you mean?" suggestion
          const suggestion = findClosestMatch(tableName, lookupMap);
          const message = suggestion
            ? `Unknown table: ${tableName}. Did you mean ${suggestion}?`
            : `Unknown table: ${tableName}`;

          // Find positions of this table name in the document (only after FROM/JOIN keywords)
          const regex = new RegExp(
            `\\b(?:FROM|JOIN)\\s+(?:\\[?\\w+\\]?\\.)?\\[?${escapeRegex(tableName)}\\]?\\b`,
            'gi'
          );
          let match;
          while ((match = regex.exec(doc)) !== null) {
            // Calculate the position of just the table name within the match
            const tableStart = match.index + match[0].length - tableName.length;
            // Adjust if there are trailing brackets
            const actualMatch = match[0];
            const tableIdx = actualMatch.lastIndexOf(tableName);
            const from = match.index + tableIdx;
            diagnostics.push({
              from,
              to: from + tableName.length,
              severity: 'warning',
              message,
              renderMessage: () => renderLintMessage(tableName, suggestion),
              ...(suggestion && {
                actions: [{
                  name: `Fix`,
                  apply(view, from, to) {
                    view.dispatch({ changes: { from, to, insert: suggestion } });
                  },
                }],
              }),
            });
          }
        }

        return diagnostics;
      },
      { delay: 500 }
    ),
  ];
}

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
