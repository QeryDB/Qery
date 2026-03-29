import { StateField, StateEffect, type Extension } from '@codemirror/state';
import { ViewPlugin, type ViewUpdate } from '@codemirror/view';
import { parseSql, parseSqlAsync, type ASTParseResult } from './sql-ast-service';

const EMPTY_RESULT: ASTParseResult = {
  tables: [],
  ctes: [],
  aliases: new Map(),
  success: false,
};

const astUpdateEffect = StateEffect.define<ASTParseResult>();

/** StateField that holds the latest AST parse result */
export const astField = StateField.define<ASTParseResult>({
  create(state) {
    const doc = state.doc.toString();
    // Sync: returns regex fallback until parser loads
    return doc.trim() ? parseSql(doc) : EMPTY_RESULT;
  },
  update(value, tr) {
    for (const e of tr.effects) {
      if (e.is(astUpdateEffect)) return e.value;
    }
    return value;
  },
});

/** ViewPlugin that debounces re-parsing on document changes */
const astParserPlugin = ViewPlugin.fromClass(
  class {
    private timer: ReturnType<typeof setTimeout> | null = null;

    update(update: ViewUpdate) {
      if (!update.docChanged) return;

      if (this.timer) clearTimeout(this.timer);
      this.timer = setTimeout(async () => {
        const doc = update.view.state.doc.toString();
        // Async: loads parser on first call, uses AST after that
        const result = await parseSqlAsync(doc);

        update.view.dispatch({
          effects: astUpdateEffect.of(result),
        });
      }, 300);
    }

    destroy() {
      if (this.timer) clearTimeout(this.timer);
    }
  }
);

/** Combined extension: field + debounced parser plugin */
export const astExtension: Extension = [astField, astParserPlugin];
