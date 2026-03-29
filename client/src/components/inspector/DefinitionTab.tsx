import CodeMirror, { type ReactCodeMirrorRef } from '@uiw/react-codemirror';
import { useTranslation } from 'react-i18next';
import { sql } from '@codemirror/lang-sql';
import { EditorView, Decoration, type DecorationSet, ViewPlugin, type ViewUpdate, hoverTooltip } from '@codemirror/view';
import { type Extension, StateEffect, StateField } from '@codemirror/state';
import { qeryLightTheme } from '@/components/editor/qery-light-theme';
import { qeryDarkTheme } from '@/components/editor/qery-dark-theme';
import { useUIStore } from '@/stores/ui-store';
import { useMemo, useState, useCallback, useRef } from 'react';
import { WrapText, Code2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { formatDialect } from 'sql-formatter';
import { useSchema } from '@/hooks/useSchema';
import { useDialect } from '@/hooks/useDriver';
import type { SchemaTree } from '@/types/schema';

type ObjectEntry = { schema: string; objectType: 'table' | 'view' | 'procedure' | 'function' };
type ObjectLookup = Map<string, ObjectEntry>;

interface Props {
  definition?: string;
  connectionId?: string;
  database?: string;
  onNavigate?: (schema: string, name: string, objectType: 'table' | 'view' | 'procedure' | 'function') => void;
}

function formatSql(raw: string, formatterDialect: any): string {
  return formatDialect(raw, {
    dialect: formatterDialect,
    tabWidth: 2,
    keywordCase: 'upper',
    identifierCase: 'preserve',
    functionCase: 'preserve',
    dataTypeCase: 'preserve',
    logicalOperatorNewline: 'before',
    expressionWidth: 60,
  });
}

function buildObjectLookup(schema: SchemaTree | undefined): ObjectLookup {
  const map = new Map<string, ObjectEntry>();
  if (!schema) return map;
  for (const t of schema.tables) map.set(`${t.schema}.${t.name}`.toLowerCase(), { schema: t.schema, objectType: 'table' });
  for (const v of schema.views) map.set(`${v.schema}.${v.name}`.toLowerCase(), { schema: v.schema, objectType: 'view' });
  for (const p of schema.procedures) map.set(`${p.schema}.${p.name}`.toLowerCase(), { schema: p.schema, objectType: 'procedure' });
  for (const f of schema.functions) map.set(`${f.schema}.${f.name}`.toLowerCase(), { schema: f.schema, objectType: 'function' });
  for (const t of schema.tables) if (!map.has(t.name.toLowerCase())) map.set(t.name.toLowerCase(), { schema: t.schema, objectType: 'table' });
  for (const v of schema.views) if (!map.has(v.name.toLowerCase())) map.set(v.name.toLowerCase(), { schema: v.schema, objectType: 'view' });
  for (const p of schema.procedures) if (!map.has(p.name.toLowerCase())) map.set(p.name.toLowerCase(), { schema: p.schema, objectType: 'procedure' });
  for (const f of schema.functions) if (!map.has(f.name.toLowerCase())) map.set(f.name.toLowerCase(), { schema: f.schema, objectType: 'function' });
  return map;
}

/** Find identifier token range at a given document position */
function findIdentifierRange(doc: { lineAt(pos: number): { text: string; from: number } }, pos: number): { from: number; to: number; token: string } | null {
  const line = doc.lineAt(pos);
  const col = pos - line.from;
  let start = col;
  let end = col;
  const idChars = /[\w.\[\]]/;
  while (start > 0 && idChars.test(line.text[start - 1])) start--;
  while (end < line.text.length && idChars.test(line.text[end])) end++;
  if (start === end) return null;
  const raw = line.text.slice(start, end);
  const token = raw.replace(/\[|\]/g, '');
  if (!token) return null;
  return { from: line.from + start, to: line.from + end, token };
}

// ── CodeMirror extension: Ctrl+hover underline ──

const setHoverRange = StateEffect.define<{ from: number; to: number } | null>();

const hoverLinkField = StateField.define<DecorationSet>({
  create: () => Decoration.none,
  update(decos, tr) {
    for (const e of tr.effects) {
      if (e.is(setHoverRange)) {
        if (e.value) {
          const mark = Decoration.mark({ class: 'cm-def-link' });
          return Decoration.set([mark.range(e.value.from, e.value.to)]);
        }
        return Decoration.none;
      }
    }
    return decos;
  },
  provide: (f) => EditorView.decorations.from(f),
});

const linkTheme = EditorView.baseTheme({
  '.cm-def-link': {
    textDecoration: 'underline',
    textDecorationColor: 'currentColor',
    cursor: 'pointer',
  },
});

function createHoverPlugin(lookupRef: { current: ObjectLookup }) {
  return ViewPlugin.fromClass(
    class {
      ctrlHeld = false;
      currentRange: { from: number; to: number } | null = null;

      update(_update: ViewUpdate) {}

      resolve(view: EditorView, x: number, y: number) {
        const pos = view.posAtCoords({ x, y });
        if (pos == null) return this.clear(view);

        const result = findIdentifierRange(view.state.doc, pos);
        if (!result) return this.clear(view);

        const match = lookupRef.current.get(result.token.toLowerCase());
        if (!match) return this.clear(view);

        if (this.currentRange?.from === result.from && this.currentRange?.to === result.to) return;
        this.currentRange = { from: result.from, to: result.to };
        view.dispatch({ effects: setHoverRange.of(this.currentRange) });
      }

      clear(view: EditorView) {
        if (this.currentRange) {
          this.currentRange = null;
          view.dispatch({ effects: setHoverRange.of(null) });
        }
      }
    },
    {
      eventHandlers: {
        mousemove(event: MouseEvent, view: EditorView) {
          this.ctrlHeld = event.ctrlKey || event.metaKey;
          if (this.ctrlHeld) {
            this.resolve(view, event.clientX, event.clientY);
          } else {
            this.clear(view);
          }
        },
        keydown(event: KeyboardEvent) {
          if (event.key === 'Control' || event.key === 'Meta') {
            this.ctrlHeld = true;
          }
        },
        keyup(event: KeyboardEvent, view: EditorView) {
          if (event.key === 'Control' || event.key === 'Meta') {
            this.ctrlHeld = false;
            this.clear(view);
          }
        },
        mouseleave(_event: MouseEvent, view: EditorView) {
          this.ctrlHeld = false;
          this.clear(view);
        },
      },
    }
  );
}

// ── Hover tooltip: shows object type on regular hover ──

const typeLabels: Record<string, string> = {
  table: 'TABLE',
  view: 'VIEW',
  procedure: 'PROCEDURE',
  function: 'FUNCTION',
};

function createHoverTooltip(lookupRef: { current: ObjectLookup }) {
  return hoverTooltip((view, pos) => {
    const result = findIdentifierRange(view.state.doc, pos);
    if (!result) return null;

    const match = lookupRef.current.get(result.token.toLowerCase());
    if (!match) return null;

    const parts = result.token.split('.');
    const objName = parts[parts.length - 1];
    const label = typeLabels[match.objectType] || match.objectType.toUpperCase();

    return {
      pos: result.from,
      end: result.to,
      above: true,
      create() {
        const dom = document.createElement('div');
        dom.style.cssText = 'padding:2px 6px;font-size:11px;font-family:monospace;display:flex;align-items:center;gap:6px';
        const badge = document.createElement('span');
        badge.textContent = label;
        badge.style.cssText = 'font-size:9px;font-weight:600;padding:1px 4px;border-radius:3px;background:var(--muted);color:var(--muted-foreground)';
        const name = document.createElement('span');
        name.textContent = `${match.schema}.${objName}`;
        dom.appendChild(badge);
        dom.appendChild(name);
        return { dom };
      },
    };
  }, { hoverTime: 300 });
}

// ── Component ──

export function DefinitionTab({ definition, connectionId, database, onNavigate }: Props) {
  const { t } = useTranslation();
  const theme = useUIStore((s) => s.theme);
  const [formatted, setFormatted] = useState(false);
  const editorRef = useRef<ReactCodeMirrorRef>(null);
  const activeDialect = useDialect();

  const { data: schemaTree } = useSchema(
    onNavigate ? connectionId ?? null : null,
    onNavigate ? database ?? null : null,
  );
  const objectLookup = useMemo(() => buildObjectLookup(schemaTree), [schemaTree]);

  // Stable ref so the CM extension always sees latest lookup without recreating
  const lookupRef = useRef(objectLookup);
  lookupRef.current = objectLookup;

  const extensions = useMemo((): Extension[] => {
    const base: Extension[] = [sql({ dialect: activeDialect.codeMirrorDialect })];
    if (onNavigate) {
      base.push(hoverLinkField, linkTheme, createHoverPlugin(lookupRef), createHoverTooltip(lookupRef));
    }
    return base;
  // lookupRef is stable, onNavigate identity doesn't matter for the extension list
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [!!onNavigate]);

  const trimmedDefinition = useMemo(() => definition?.trim(), [definition]);

  const displayValue = useMemo(() => {
    if (!trimmedDefinition) return '';
    if (!formatted) return trimmedDefinition;
    try {
      return formatSql(trimmedDefinition, activeDialect.formatterDialect);
    } catch {
      return trimmedDefinition;
    }
  }, [trimmedDefinition, formatted]);

  const toggleFormat = useCallback(() => setFormatted((f) => !f), []);

  const handleClick = useCallback((e: React.MouseEvent) => {
    if (!onNavigate || !editorRef.current?.view) return;
    if (!e.ctrlKey && !e.metaKey) return;

    const view = editorRef.current.view;
    const pos = view.posAtCoords({ x: e.clientX, y: e.clientY });
    if (pos == null) return;

    const result = findIdentifierRange(view.state.doc, pos);
    if (!result) return;

    const match = objectLookup.get(result.token.toLowerCase());
    if (match) {
      e.preventDefault();
      const parts = result.token.split('.');
      const objName = parts[parts.length - 1];
      onNavigate(match.schema, objName, match.objectType);
    }
  }, [onNavigate, objectLookup]);

  if (!trimmedDefinition) {
    return (
      <div className="p-4 space-y-2">
        <div className="text-xs text-muted-foreground">
          {t('editor.definitionUnavailable')}
        </div>
        <pre className="text-xs font-mono bg-muted rounded-md px-3 py-2 select-all inline-block">
          GRANT VIEW DEFINITION TO [YOUR_USERNAME];
        </pre>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-1 px-2 py-1 border-b shrink-0">
        <Button
          variant={formatted ? 'secondary' : 'ghost'}
          size="sm"
          className="h-6 text-xs gap-1.5"
          onClick={toggleFormat}
        >
          {formatted ? <Code2 className="h-3 w-3" /> : <WrapText className="h-3 w-3" />}
          {formatted ? t('common.original') : t('common.format')}
        </Button>
        {onNavigate && (
          <span className="ml-auto text-[10px] text-muted-foreground">
            Ctrl+Click to navigate to object
          </span>
        )}
      </div>
      {/* eslint-disable-next-line jsx-a11y/click-events-have-key-events,jsx-a11y/no-static-element-interactions */}
      <div className="flex-1 overflow-auto" onClick={handleClick}>
        <CodeMirror
          ref={editorRef}
          value={displayValue}
          extensions={extensions}
          theme={theme === 'dark' ? qeryDarkTheme : qeryLightTheme}
          readOnly
          className="text-xs [&_.cm-content]:cursor-text"
          basicSetup={{
            lineNumbers: true,
            foldGutter: true,
            highlightActiveLine: false,
          }}
        />
      </div>
    </div>
  );
}
