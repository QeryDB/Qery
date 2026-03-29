import { invoke } from '@tauri-apps/api/core';

function isTauri(): boolean {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
}

function getApiBase(): string {
  if (isTauri()) {
    return 'http://localhost:4789/api';
  }
  return '/api';
}

const API_BASE = getApiBase();
const IS_TAURI = isTauri();

// ---------------------------------------------------------------------------
// Route → Tauri command mapping
// ---------------------------------------------------------------------------

type RouteEntry = {
  method: string;
  pattern: RegExp;
  command: string;
  extract: (match: RegExpExecArray, body?: any, query?: URLSearchParams) => Record<string, any>;
};

const ROUTES: RouteEntry[] = [
  // ── Connections (9) ──────────────────────────────────────────────────
  { method: 'GET',    pattern: /^\/connections$/,
    command: 'list_connections',
    extract: () => ({}) },

  { method: 'POST',   pattern: /^\/connections$/,
    command: 'create_connection',
    extract: (_m, body) => ({ input: body }) },

  { method: 'PUT',    pattern: /^\/connections\/reorder$/,
    command: 'reorder_connections',
    extract: (_m, body) => ({ ids: body?.ids || body }) },

  { method: 'PUT',    pattern: /^\/connections\/([^/]+)$/,
    command: 'update_connection',
    extract: (m, body) => ({ id: m[1], input: body }) },

  { method: 'DELETE',  pattern: /^\/connections\/([^/]+)$/,
    command: 'delete_connection',
    extract: (m) => ({ id: m[1] }) },

  { method: 'POST',   pattern: /^\/connections\/test$/,
    command: 'test_connection',
    extract: (_m, body) => ({ input: body }) },

  { method: 'POST',   pattern: /^\/connections\/discover$/,
    command: 'discover_servers_simple',
    extract: () => ({}) },

  { method: 'GET',    pattern: /^\/connections\/([^/]+)\/ping$/,
    command: 'ping_connection',
    extract: (m) => ({ id: m[1] }) },

  { method: 'GET',    pattern: /^\/connections\/([^/]+)\/databases$/,
    command: 'list_databases',
    extract: (m) => ({ id: m[1] }) },

  // ── Schema (2) ──────────────────────────────────────────────────────
  { method: 'GET',    pattern: /^\/connections\/([^/]+)\/databases\/([^/]+)\/schema$/,
    command: 'get_schema',
    extract: (m) => ({ connectionId: m[1], databaseName: decodeURIComponent(m[2]) }) },

  { method: 'POST',   pattern: /^\/connections\/([^/]+)\/databases\/([^/]+)\/schema\/refresh$/,
    command: 'refresh_schema',
    extract: (m) => ({ connectionId: m[1], databaseName: decodeURIComponent(m[2]) }) },

  // ── Query (9) ───────────────────────────────────────────────────────
  { method: 'POST',   pattern: /^\/connections\/([^/]+)\/databases\/([^/]+)\/query$/,
    command: 'execute_query',
    extract: (m, body) => ({
      connectionId: m[1],
      databaseName: decodeURIComponent(m[2]),
      sql: body?.sql,
      params: body?.params,
      queryId: body?.queryId,
    }) },

  { method: 'POST',   pattern: /^\/query\/cancel$/,
    command: 'cancel_query',
    extract: (_m, body) => ({ queryId: body?.queryId }) },

  { method: 'POST',   pattern: /^\/connections\/([^/]+)\/databases\/([^/]+)\/explain$/,
    command: 'explain_query',
    extract: (m, body) => ({
      connectionId: m[1],
      databaseName: decodeURIComponent(m[2]),
      sql: body?.sql,
    }) },

  { method: 'POST',   pattern: /^\/connections\/([^/]+)\/databases\/([^/]+)\/estimate-index$/,
    command: 'estimate_index_size',
    extract: (m, body) => ({
      connectionId: m[1],
      databaseName: decodeURIComponent(m[2]),
      schema: body?.schema,
      table: body?.table,
      columns: body?.columns,
    }) },

  { method: 'GET',    pattern: /^\/connections\/([^/]+)\/(?:databases\/[^/]+\/)?query-history$/,
    command: 'get_query_history',
    extract: (m, _body, query) => ({
      connectionId: m[1],
      limit: query?.get('limit') ? Number(query.get('limit')) : undefined,
      offset: query?.get('offset') ? Number(query.get('offset')) : undefined,
    }) },

  { method: 'DELETE',  pattern: /^\/connections\/([^/]+)\/query-history$/,
    command: 'clear_query_history',
    extract: (m) => ({ connectionId: m[1] }) },

  { method: 'GET',    pattern: /^\/saved-queries$/,
    command: 'list_saved_queries',
    extract: (_m, _body, query) => ({
      connectionId: query?.get('connection_id') || undefined,
    }) },

  { method: 'POST',   pattern: /^\/saved-queries$/,
    command: 'create_saved_query',
    extract: (_m, body) => ({ input: body }) },

  { method: 'PUT',    pattern: /^\/saved-queries\/([^/]+)$/,
    command: 'update_saved_query',
    extract: (m, body) => ({ id: m[1], input: body }) },

  { method: 'DELETE',  pattern: /^\/saved-queries\/([^/]+)$/,
    command: 'delete_saved_query',
    extract: (m) => ({ id: m[1] }) },

  // ── Tables (6) ─────────────────────────────────────────────────────
  { method: 'GET',    pattern: /^\/connections\/([^/]+)\/databases\/([^/]+)\/tables\/([^/]+)\/columns$/,
    command: 'get_table_columns',
    extract: (m, _body, query) => ({
      connectionId: m[1],
      databaseName: decodeURIComponent(m[2]),
      tableName: decodeURIComponent(m[3]),
      schemaName: query?.get('schema') || undefined,
    }) },

  { method: 'GET',    pattern: /^\/connections\/([^/]+)\/databases\/([^/]+)\/tables\/([^/]+)\/indexes$/,
    command: 'get_table_indexes',
    extract: (m, _body, query) => ({
      connectionId: m[1],
      databaseName: decodeURIComponent(m[2]),
      tableName: decodeURIComponent(m[3]),
      schemaName: query?.get('schema') || undefined,
    }) },

  { method: 'GET',    pattern: /^\/connections\/([^/]+)\/databases\/([^/]+)\/tables\/([^/]+)\/foreign-keys$/,
    command: 'get_table_foreign_keys',
    extract: (m, _body, query) => ({
      connectionId: m[1],
      databaseName: decodeURIComponent(m[2]),
      tableName: decodeURIComponent(m[3]),
      schemaName: query?.get('schema') || undefined,
    }) },

  { method: 'GET',    pattern: /^\/connections\/([^/]+)\/databases\/([^/]+)\/tables\/([^/]+)\/referenced-by$/,
    command: 'get_table_referenced_by',
    extract: (m, _body, query) => ({
      connectionId: m[1],
      databaseName: decodeURIComponent(m[2]),
      tableName: decodeURIComponent(m[3]),
      schemaName: query?.get('schema') || undefined,
    }) },

  { method: 'GET',    pattern: /^\/connections\/([^/]+)\/databases\/([^/]+)\/tables\/([^/]+)\/preview$/,
    command: 'get_table_preview',
    extract: (m, _body, query) => ({
      connectionId: m[1],
      databaseName: decodeURIComponent(m[2]),
      tableName: decodeURIComponent(m[3]),
      schemaName: query?.get('schema') || undefined,
      limit: query?.get('limit') ? Number(query.get('limit')) : undefined,
      offset: query?.get('offset') ? Number(query.get('offset')) : undefined,
    }) },

  { method: 'GET',    pattern: /^\/connections\/([^/]+)\/databases\/([^/]+)\/tables\/([^/]+)$/,
    command: 'get_table_details',
    extract: (m, _body, query) => ({
      connectionId: m[1],
      databaseName: decodeURIComponent(m[2]),
      tableName: decodeURIComponent(m[3]),
      schemaName: query?.get('schema') || undefined,
    }) },

  // ── Ghost FKs & Relationships (6) ──────────────────────────────────
  { method: 'GET',    pattern: /^\/connections\/([^/]+)\/databases\/([^/]+)\/tables\/([^/]+)\/ghost-fks$/,
    command: 'get_ghost_fks',
    extract: (m, _body, query) => ({
      connectionId: m[1],
      databaseName: decodeURIComponent(m[2]),
      tableName: decodeURIComponent(m[3]),
      schemaName: query?.get('schema') || undefined,
    }) },

  { method: 'POST',   pattern: /^\/connections\/([^/]+)\/databases\/([^/]+)\/tables\/([^/]+)\/ghost-fks\/invalidate$/,
    command: 'invalidate_ghost_fks',
    extract: (m, body) => ({
      connectionId: m[1],
      databaseName: decodeURIComponent(m[2]),
      tableName: decodeURIComponent(m[3]),
      schemaName: body?.schema || undefined,
    }) },

  { method: 'GET',    pattern: /^\/connections\/([^/]+)\/databases\/([^/]+)\/relationships$/,
    command: 'get_relationships',
    extract: (m) => ({
      connectionId: m[1],
      databaseName: decodeURIComponent(m[2]),
    }) },

  { method: 'POST',   pattern: /^\/connections\/([^/]+)\/databases\/([^/]+)\/relationships\/dismiss$/,
    command: 'dismiss_relationship',
    extract: (m, body) => ({
      connectionId: m[1],
      databaseName: decodeURIComponent(m[2]),
      input: body,
    }) },

  { method: 'POST',   pattern: /^\/connections\/([^/]+)\/databases\/([^/]+)\/relationships\/([^/]+)\/undismiss$/,
    command: 'undismiss_relationship',
    extract: (m) => ({
      connectionId: m[1],
      databaseName: decodeURIComponent(m[2]),
      relId: m[3],
    }) },

  { method: 'POST',   pattern: /^\/connections\/([^/]+)\/databases\/([^/]+)\/relationships$/,
    command: 'create_relationship',
    extract: (m, body) => ({
      connectionId: m[1],
      databaseName: decodeURIComponent(m[2]),
      input: body,
    }) },

  { method: 'DELETE',  pattern: /^\/connections\/([^/]+)\/databases\/([^/]+)\/relationships\/([^/]+)$/,
    command: 'delete_relationship',
    extract: (m) => ({
      connectionId: m[1],
      databaseName: decodeURIComponent(m[2]),
      relId: m[3],
    }) },

  // ── Objects (6) ────────────────────────────────────────────────────
  { method: 'GET',    pattern: /^\/connections\/([^/]+)\/databases\/([^/]+)\/views\/([^/]+)\/columns$/,
    command: 'get_view_columns',
    extract: (m, _body, query) => ({
      connectionId: m[1],
      databaseName: decodeURIComponent(m[2]),
      name: decodeURIComponent(m[3]),
      schemaName: query?.get('schema') || undefined,
    }) },

  { method: 'GET',    pattern: /^\/connections\/([^/]+)\/databases\/([^/]+)\/objects\/([^/]+)\/parameters$/,
    command: 'get_object_parameters',
    extract: (m, _body, query) => ({
      connectionId: m[1],
      databaseName: decodeURIComponent(m[2]),
      name: decodeURIComponent(m[3]),
      schemaName: query?.get('schema') || undefined,
    }) },

  { method: 'GET',    pattern: /^\/connections\/([^/]+)\/databases\/([^/]+)\/objects\/([^/]+)\/dependencies$/,
    command: 'get_object_dependencies',
    extract: (m, _body, query) => ({
      connectionId: m[1],
      databaseName: decodeURIComponent(m[2]),
      name: decodeURIComponent(m[3]),
      schemaName: query?.get('schema') || undefined,
    }) },

  { method: 'GET',    pattern: /^\/connections\/([^/]+)\/databases\/([^/]+)\/objects\/([^/]+)\/used-by$/,
    command: 'get_object_used_by',
    extract: (m, _body, query) => ({
      connectionId: m[1],
      databaseName: decodeURIComponent(m[2]),
      name: decodeURIComponent(m[3]),
      schemaName: query?.get('schema') || undefined,
    }) },

  { method: 'GET',    pattern: /^\/connections\/([^/]+)\/databases\/([^/]+)\/objects\/([^/]+)\/definition$/,
    command: 'get_object_definition',
    extract: (m, _body, query) => ({
      connectionId: m[1],
      databaseName: decodeURIComponent(m[2]),
      name: decodeURIComponent(m[3]),
      schemaName: query?.get('schema') || undefined,
    }) },

  { method: 'GET',    pattern: /^\/connections\/([^/]+)\/databases\/([^/]+)\/objects\/([^/]+)\/analyze-safety$/,
    command: 'analyze_safety',
    extract: (m, _body, query) => ({
      connectionId: m[1],
      databaseName: decodeURIComponent(m[2]),
      name: decodeURIComponent(m[3]),
      schemaName: query?.get('schema') || undefined,
    }) },

  // ── Annotations (3) ────────────────────────────────────────────────
  { method: 'GET',    pattern: /^\/connections\/([^/]+)\/databases\/([^/]+)\/tables\/([^/]+)\/annotations$/,
    command: 'get_annotations',
    extract: (m) => ({
      connectionId: m[1],
      databaseName: decodeURIComponent(m[2]),
      tableName: decodeURIComponent(m[3]),
    }) },

  { method: 'PUT',    pattern: /^\/connections\/([^/]+)\/databases\/([^/]+)\/tables\/([^/]+)\/annotations$/,
    command: 'upsert_annotation',
    extract: (m, body) => ({
      connectionId: m[1],
      databaseName: decodeURIComponent(m[2]),
      tableName: decodeURIComponent(m[3]),
      input: body,
    }) },

  { method: 'DELETE',  pattern: /^\/connections\/([^/]+)\/databases\/([^/]+)\/annotations\/([^/]+)$/,
    command: 'delete_annotation',
    extract: (m) => ({ id: m[3] }) },

  // ── Descriptions (6) ──────────────────────────────────────────────
  { method: 'POST',   pattern: /^\/connections\/([^/]+)\/databases\/([^/]+)\/descriptions\/parse$/,
    command: 'parse_descriptions',
    extract: (m) => ({
      connectionId: m[1],
      databaseName: decodeURIComponent(m[2]),
    }) },

  { method: 'GET',    pattern: /^\/connections\/([^/]+)\/databases\/([^/]+)\/descriptions\/stats$/,
    command: 'get_description_stats',
    extract: (m) => ({
      connectionId: m[1],
      databaseName: decodeURIComponent(m[2]),
    }) },

  { method: 'GET',    pattern: /^\/connections\/([^/]+)\/databases\/([^/]+)\/descriptions\/objects$/,
    command: 'get_description_objects',
    extract: (m) => ({
      connectionId: m[1],
      databaseName: decodeURIComponent(m[2]),
    }) },

  { method: 'PUT',    pattern: /^\/connections\/([^/]+)\/databases\/([^/]+)\/descriptions\/(\d+)$/,
    command: 'update_description_status',
    extract: (m, body) => ({
      connectionId: m[1],
      databaseName: decodeURIComponent(m[2]),
      descId: Number(m[3]),
      input: body,
    }) },

  { method: 'PUT',    pattern: /^\/connections\/([^/]+)\/databases\/([^/]+)\/descriptions$/,
    command: 'bulk_update_description_status',
    extract: (_m, body) => ({ input: body }) },

  { method: 'GET',    pattern: /^\/connections\/([^/]+)\/databases\/([^/]+)\/descriptions$/,
    command: 'get_descriptions',
    extract: (m, _body, query) => ({
      connectionId: m[1],
      databaseName: decodeURIComponent(m[2]),
      status: query?.get('status') || undefined,
      search: query?.get('search') || undefined,
      object: query?.get('object') || undefined,
    }) },

  // ── Favorites (3) ─────────────────────────────────────────────────
  { method: 'GET',    pattern: /^\/connections\/([^/]+)\/databases\/([^/]+)\/favorites$/,
    command: 'get_favorites',
    extract: (m) => ({
      connectionId: m[1],
      databaseName: decodeURIComponent(m[2]),
    }) },

  { method: 'POST',   pattern: /^\/connections\/([^/]+)\/databases\/([^/]+)\/favorites$/,
    command: 'add_favorite',
    extract: (m, body) => ({
      connectionId: m[1],
      databaseName: decodeURIComponent(m[2]),
      input: body,
    }) },

  { method: 'DELETE',  pattern: /^\/connections\/([^/]+)\/databases\/([^/]+)\/favorites\/([^/]+)\/([^/]+)$/,
    command: 'remove_favorite',
    extract: (m) => ({
      connectionId: m[1],
      databaseName: decodeURIComponent(m[2]),
      schemaName: decodeURIComponent(m[3]),
      tableName: decodeURIComponent(m[4]),
    }) },

  // ── Discovery (4) ─────────────────────────────────────────────────
  { method: 'POST',   pattern: /^\/discovery\/progressive$/,
    command: 'progressive_discovery',
    extract: (_m, body) => ({ input: body }) },

  { method: 'POST',   pattern: /^\/discovery\/full$/,
    command: 'full_discovery',
    extract: (_m, body) => ({ input: body }) },

  { method: 'POST',   pattern: /^\/discovery\/databases$/,
    command: 'discover_databases',
    extract: (_m, body) => ({ input: body }) },

  { method: 'POST',   pattern: /^\/discovery\/manual$/,
    command: 'manual_discovery',
    extract: (_m, body) => ({ input: body }) },

  // ── Export (2) ────────────────────────────────────────────────────
  { method: 'POST',   pattern: /^\/export\/csv$/,
    command: 'export_csv',
    extract: (_m, body) => ({ input: body }) },

  { method: 'POST',   pattern: /^\/export\/json$/,
    command: 'export_json',
    extract: (_m, body) => ({ input: body }) },

  // ── Session State (4) ─────────────────────────────────────────────
  { method: 'GET',    pattern: /^\/session-state$/,
    command: 'get_session_state',
    extract: (_m, _body, query) => ({ prefix: query?.get('prefix') || '' }) },

  { method: 'PUT',    pattern: /^\/session-state$/,
    command: 'set_session_state',
    extract: (_m, body) => ({ key: body?.key, value: body?.value }) },

  { method: 'DELETE',  pattern: /^\/session-state\/(.+)$/,
    command: 'delete_session_state',
    extract: (m) => ({ key: decodeURIComponent(m[1]) }) },

  { method: 'DELETE',  pattern: /^\/session-state$/,
    command: 'delete_session_state_prefix',
    extract: (_m, _body, query) => ({ prefix: query?.get('prefix') || '' }) },

  // ── Health (1) ────────────────────────────────────────────────────
  { method: 'GET',    pattern: /^\/health$/,
    command: 'health_check',
    extract: () => ({}) },

  // ── Drivers (1) ──────────────────────────────────────────────────
  { method: 'GET',    pattern: /^\/drivers$/,
    command: 'list_available_drivers',
    extract: () => ({}) },

  // ── Generic Object Data (2) ───────────────────────────────────
  { method: 'GET',    pattern: /^\/connections\/([^/]+)\/databases\/([^/]+)\/object-data\/([^/]+)\/([^/]+)$/,
    command: 'get_object_data',
    extract: (m, _body, query) => ({
      connectionId: m[1],
      databaseName: decodeURIComponent(m[2]),
      objectType: decodeURIComponent(m[3]),
      name: decodeURIComponent(m[4]),
      schemaName: query?.get('schema') || undefined,
      dataKey: query?.get('key') || undefined,
    }) },

  { method: 'POST',   pattern: /^\/connections\/([^/]+)\/databases\/([^/]+)\/object-action\/([^/]+)\/([^/]+)$/,
    command: 'execute_object_action',
    extract: (m, body, query) => ({
      connectionId: m[1],
      databaseName: decodeURIComponent(m[2]),
      objectType: decodeURIComponent(m[3]),
      name: decodeURIComponent(m[4]),
      schemaName: query?.get('schema') || undefined,
      action: body?.action || query?.get('action') || '',
    }) },
];

// ---------------------------------------------------------------------------
// Tauri invoke routing
// ---------------------------------------------------------------------------

function matchRoute(method: string, path: string, body?: any): { command: string; args: Record<string, any> } | null {
  // Split path from query string
  const [pathname, queryString] = path.split('?');
  const query = queryString ? new URLSearchParams(queryString) : undefined;

  for (const route of ROUTES) {
    if (route.method !== method) continue;
    const match = route.pattern.exec(pathname);
    if (match) {
      return {
        command: route.command,
        args: route.extract(match, body, query),
      };
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// Dual-mode request function
// ---------------------------------------------------------------------------

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const method = (options?.method || 'GET').toUpperCase();
  const body = options?.body ? JSON.parse(options.body as string) : undefined;

  // In Tauri mode, route to invoke()
  if (IS_TAURI) {
    const matched = matchRoute(method, path, body);
    if (matched) {
      return invoke<T>(matched.command, matched.args);
    }
    // Fallback to fetch if no route matched (shouldn't happen in practice)
    console.warn(`[api] No Tauri command matched for ${method} ${path}, falling back to fetch`);
  }

  // Browser mode: use fetch()
  const res = await fetch(`${API_BASE}${path}`, {
    headers: { 'Content-Type': 'application/json', ...options?.headers },
    ...options,
  });

  if (!res.ok) {
    const error = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(error.error?.message || error.error || error.message || 'Request failed');
  }

  return res.json();
}

// ---------------------------------------------------------------------------
// Public API (unchanged interface)
// ---------------------------------------------------------------------------

export const api = {
  get: <T>(path: string) => request<T>(path),
  post: <T>(path: string, body?: any) => request<T>(path, { method: 'POST', body: body ? JSON.stringify(body) : undefined }),
  put: <T>(path: string, body?: any) => request<T>(path, { method: 'PUT', body: JSON.stringify(body) }),
  delete: <T>(path: string) => request<T>(path, { method: 'DELETE' }),
};
