import { hoverTooltip, EditorView, Decoration, closeHoverTooltips, type Tooltip, type DecorationSet } from '@codemirror/view';
import { Facet, StateField, StateEffect } from '@codemirror/state';
import type { SchemaTree as SchemaTreeType, TableInfo, ViewInfo, ProcedureInfo, FunctionInfo } from '@/types/schema';

export interface SchemaObject {
  type: 'table' | 'view' | 'procedure' | 'function';
  name: string;
  schema: string;
  info: TableInfo | ViewInfo | ProcedureInfo | FunctionInfo;
  columns?: { name: string; data_type: string; is_primary_key: boolean; is_foreign_key: boolean }[];
}

export interface SchemaTooltipCallbacks {
  onInspectTable: (schema: string, table: string) => void;
  onOpenDefinition: (type: string, name: string, schema: string, definition?: string) => void;
  onOpenDocumentation: (schema: string, table: string) => void;
}

export const schemaDataFacet = Facet.define<Map<string, SchemaObject>, Map<string, SchemaObject>>({
  combine: (values) => values[0] || new Map(),
});

export const schemaCallbacksFacet = Facet.define<SchemaTooltipCallbacks, SchemaTooltipCallbacks>({
  combine: (values) => values[0] || { onInspectTable: () => {}, onOpenDefinition: () => {}, onOpenDocumentation: () => {} },
});

/** Build a case-insensitive lookup map from schema data */
export function buildLookupMap(schema: SchemaTreeType | null | undefined): Map<string, SchemaObject> {
  const map = new Map<string, SchemaObject>();
  if (!schema) return map;

  for (const t of schema.tables) {
    const columns = t.columns?.map((c) => ({
      name: c.name,
      data_type: c.data_type,
      is_primary_key: c.is_primary_key,
      is_foreign_key: c.is_foreign_key,
    }));
    const obj: SchemaObject = { type: 'table', name: t.name, schema: t.schema, info: t, columns };
    map.set(t.name.toLowerCase(), obj);
    map.set(`${t.schema}.${t.name}`.toLowerCase(), obj);
  }
  for (const v of schema.views) {
    const obj: SchemaObject = { type: 'view', name: v.name, schema: v.schema, info: v };
    map.set(v.name.toLowerCase(), obj);
    map.set(`${v.schema}.${v.name}`.toLowerCase(), obj);
  }
  for (const p of schema.procedures) {
    const obj: SchemaObject = { type: 'procedure', name: p.name, schema: p.schema, info: p };
    map.set(p.name.toLowerCase(), obj);
    map.set(`${p.schema}.${p.name}`.toLowerCase(), obj);
  }
  for (const f of schema.functions) {
    const obj: SchemaObject = { type: 'function', name: f.name, schema: f.schema, info: f };
    map.set(f.name.toLowerCase(), obj);
    map.set(`${f.schema}.${f.name}`.toLowerCase(), obj);
  }

  return map;
}

/** Expand the word range to include [bracket].[identifiers] */
function expandIdentifier(doc: string, pos: number): { from: number; to: number; text: string } | null {
  // Find word boundaries, including brackets and dots
  const idChars = /[\w[\].]/;
  let from = pos;
  let to = pos;

  while (from > 0 && idChars.test(doc[from - 1])) from--;
  while (to < doc.length && idChars.test(doc[to])) to++;

  if (from === to) return null;

  let text = doc.slice(from, to);
  // Strip surrounding brackets: [schema].[table] → schema.table
  text = text.replace(/\[([^\]]*)\]/g, '$1');

  if (!text) return null;
  return { from, to, text };
}

/** SVG icon for "open panel right" — inline so no React dependency needed */
const panelRightIcon = `<svg xmlns="http://www.w3.org/2000/svg" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-1px"><rect width="18" height="18" x="3" y="3" rx="2"/><path d="M15 3v18"/></svg>`;

function typeBadge(type: string, clickable: boolean): string {
  const colors: Record<string, string> = {
    table: 'background:#3b82f6;color:white',
    view: 'background:#a855f7;color:white',
    procedure: 'background:#f97316;color:white',
    function: 'background:#14b8a6;color:white',
  };
  const cursor = clickable ? ';cursor:pointer' : '';
  const action = clickable ? ' data-action="dok"' : '';
  const icon = clickable ? ` ${panelRightIcon}` : '';
  return `<span${action} title="${clickable ? 'Documentation' : type}" style="${colors[type] || ''};padding:1px 6px;border-radius:3px;font-size:10px;font-weight:600;text-transform:uppercase;display:inline-flex;align-items:center;gap:3px${cursor}">${type}${icon}</span>`;
}

function renderTooltip(obj: SchemaObject, callbacks: SchemaTooltipCallbacks): HTMLElement {
  const dom = document.createElement('div');
  dom.className = 'schema-tooltip';

  const isTable = obj.type === 'table';
  let html = `<div style="display:flex;align-items:center;gap:6px;margin-bottom:4px">${typeBadge(obj.type, isTable)} <strong style="font-family:monospace">${obj.schema}.${obj.name}</strong></div>`;

  if (isTable) {
    const t = obj.info as TableInfo;
    if (t.row_count != null) {
      html += `<div style="font-size:11px;color:var(--muted-foreground, #888);margin-bottom:4px">${t.row_count.toLocaleString()} rows</div>`;
    }
    if (obj.columns && obj.columns.length > 0) {
      const show = obj.columns.slice(0, 8);
      html += '<div style="font-size:11px;font-family:monospace;line-height:1.6">';
      for (const col of show) {
        const icons = [col.is_primary_key ? '<span title="PK" style="color:#eab308">🔑</span>' : '', col.is_foreign_key ? '<span title="FK" style="color:#3b82f6">🔗</span>' : ''].filter(Boolean).join('');
        html += `<div>${col.name} <span style="color:var(--muted-foreground, #888)">${col.data_type}</span> ${icons}</div>`;
      }
      if (obj.columns.length > 8) {
        html += `<div style="color:var(--muted-foreground, #888)">+${obj.columns.length - 8} more...</div>`;
      }
      html += '</div>';
    }
  } else {
    const info = obj.info as ViewInfo | ProcedureInfo | FunctionInfo;
    if (info.definition) {
      const preview = info.definition.split('\n').slice(0, 4).join('\n');
      html += `<pre style="font-size:11px;margin:4px 0 0;white-space:pre-wrap;max-height:80px;overflow:hidden">${escapeHtml(preview)}</pre>`;
    }
  }

  dom.innerHTML = html;

  // Attach click handler to the type badge for tables
  const dokBadge = dom.querySelector('[data-action="dok"]');
  if (dokBadge) {
    dokBadge.addEventListener('mousedown', (e) => {
      e.preventDefault();
      e.stopPropagation();
      callbacks.onOpenDocumentation(obj.schema, obj.name);
    });
  }

  return dom;
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/** The hover tooltip extension — suppressed when Ctrl/Cmd is held */
const schemaHoverTooltip = hoverTooltip((view, pos): Tooltip | null => {
  // Don't show tooltip when Ctrl/Cmd held — that's click-to-navigate mode
  const s = ctrlHoverState.get(view);
  if (s?.held) return null;

  const lookupMap = view.state.facet(schemaDataFacet);
  if (!lookupMap || lookupMap.size === 0) return null;

  const docStr = view.state.doc.toString();
  const ident = expandIdentifier(docStr, pos);
  if (!ident) return null;

  const obj = lookupMap.get(ident.text.toLowerCase());
  if (!obj) return null;

  const callbacks = view.state.facet(schemaCallbacksFacet);

  return {
    pos: ident.from,
    end: ident.to,
    above: true,
    create: () => ({ dom: renderTooltip(obj, callbacks) }),
  };
}, { hoverTime: 300 });

/** Ctrl+Click handler */
const ctrlClickHandler = EditorView.domEventHandlers({
  click(event: MouseEvent, view: EditorView) {
    if (!(event.ctrlKey || event.metaKey)) return false;

    const pos = view.posAtCoords({ x: event.clientX, y: event.clientY });
    if (pos == null) return false;

    const lookupMap = view.state.facet(schemaDataFacet);
    const callbacks = view.state.facet(schemaCallbacksFacet);
    if (!lookupMap || lookupMap.size === 0) return false;

    const docStr = view.state.doc.toString();
    const ident = expandIdentifier(docStr, pos);
    if (!ident) return false;

    const obj = lookupMap.get(ident.text.toLowerCase());
    if (!obj) return false;

    event.preventDefault();
    if (obj.type === 'table') {
      callbacks.onInspectTable(obj.schema, obj.name);
    } else {
      const info = obj.info as ViewInfo | ProcedureInfo | FunctionInfo;
      callbacks.onOpenDefinition(obj.type.toUpperCase(), obj.name, obj.schema, info.definition);
    }
    return true;
  },
});

/* ── Ctrl/Cmd+hover underline system ── */

const setCtrlHoverDeco = StateEffect.define<DecorationSet>();

/** StateField holding the underline decoration for the hovered schema token */
const ctrlHoverDecoField = StateField.define<DecorationSet>({
  create: () => Decoration.none,
  update: (deco, tr) => {
    for (const e of tr.effects) {
      if (e.is(setCtrlHoverDeco)) return e.value;
    }
    return deco;
  },
  provide: (f) => EditorView.decorations.from(f),
});

/** Per-view Ctrl state tracking */
const ctrlHoverState = new WeakMap<EditorView, { held: boolean; mouseX: number; mouseY: number; raf: boolean }>();

function getCtrlState(view: EditorView) {
  let s = ctrlHoverState.get(view);
  if (!s) { s = { held: false, mouseX: 0, mouseY: 0, raf: false }; ctrlHoverState.set(view, s); }
  return s;
}

function computeUnderline(view: EditorView): DecorationSet {
  const s = getCtrlState(view);
  if (!s.held) return Decoration.none;

  const pos = view.posAtCoords({ x: s.mouseX, y: s.mouseY });
  if (pos == null) return Decoration.none;

  const lookupMap = view.state.facet(schemaDataFacet);
  if (!lookupMap || lookupMap.size === 0) return Decoration.none;

  const docStr = view.state.doc.toString();
  const ident = expandIdentifier(docStr, pos);
  if (!ident) return Decoration.none;

  const obj = lookupMap.get(ident.text.toLowerCase());
  if (!obj) return Decoration.none;

  return Decoration.set([
    Decoration.mark({ class: 'cm-schema-link' }).range(ident.from, ident.to),
  ]);
}

/** DOM event handlers for Ctrl/Cmd+hover underline */
const ctrlHoverHandler = EditorView.domEventHandlers({
  keydown(event: KeyboardEvent, view: EditorView) {
    if (event.key === 'Control' || event.key === 'Meta') {
      const s = getCtrlState(view);
      if (!s.held) {
        s.held = true;
        view.dom.classList.add('cm-ctrl-hover');
        view.dispatch({ effects: [setCtrlHoverDeco.of(computeUnderline(view)), closeHoverTooltips] });
      }
    }
    return false;
  },
  keyup(event: KeyboardEvent, view: EditorView) {
    if (event.key === 'Control' || event.key === 'Meta') {
      const s = getCtrlState(view);
      s.held = false;
      view.dom.classList.remove('cm-ctrl-hover');
      view.dispatch({ effects: setCtrlHoverDeco.of(Decoration.none) });
    }
    return false;
  },
  mousemove(event: MouseEvent, view: EditorView) {
    const s = getCtrlState(view);
    s.mouseX = event.clientX;
    s.mouseY = event.clientY;
    if (s.held && !s.raf) {
      s.raf = true;
      requestAnimationFrame(() => {
        s.raf = false;
        if (s.held) {
          view.dispatch({ effects: setCtrlHoverDeco.of(computeUnderline(view)) });
        }
      });
    }
    return false;
  },
  blur(_event: FocusEvent, view: EditorView) {
    const s = getCtrlState(view);
    if (s.held) {
      s.held = false;
      view.dom.classList.remove('cm-ctrl-hover');
      view.dispatch({ effects: setCtrlHoverDeco.of(Decoration.none) });
    }
    return false;
  },
});

/** Extract all referenced schema objects from SQL text */
export function extractReferencedObjects(sql: string, lookupMap: Map<string, SchemaObject>): SchemaObject[] {
  if (!sql || lookupMap.size === 0) return [];

  const seen = new Set<string>();
  const results: SchemaObject[] = [];

  // Match: word identifiers, bracketed identifiers, optional schema.name patterns
  const regex = /(?:\[([^\]]+)\]|\b(\w+)\b)(?:\.(?:\[([^\]]+)\]|\b(\w+)\b))?/g;
  let match;

  while ((match = regex.exec(sql)) !== null) {
    const part1 = match[1] || match[2];
    const part2 = match[3] || match[4];

    const candidates: string[] = [];
    if (part2) candidates.push(`${part1}.${part2}`);
    candidates.push(part2 || part1);

    for (const candidate of candidates) {
      const obj = lookupMap.get(candidate.toLowerCase());
      if (obj) {
        const key = `${obj.type}:${obj.schema}.${obj.name}`.toLowerCase();
        if (!seen.has(key)) {
          seen.add(key);
          results.push(obj);
        }
        break;
      }
    }
  }

  return results;
}

export function schemaTooltipExtension() {
  return [schemaHoverTooltip, ctrlClickHandler, ctrlHoverDecoField, ctrlHoverHandler];
}
