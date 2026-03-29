import * as sessionState from './session-state';

// In-memory maps (per object type) — dynamically created for any type
const subTabMaps = new Map<string, Map<string, string>>();

function mapFor(objType: string): Map<string, string> {
  let map = subTabMaps.get(objType);
  if (!map) {
    map = new Map<string, string>();
    subTabMaps.set(objType, map);
  }
  return map;
}

// Keep backward compat type but accept any string
type ObjType = string;

function sessionKey(objType: ObjType, connectionId: string, database: string, schema: string, name: string): string {
  return `${connectionId}:${database}:subtab:${objType}:${schema}.${name}`;
}

export function getSubTab(
  objType: ObjType,
  tabKey: string,
  connectionId: string,
  database: string,
  schema: string,
  name: string,
  defaultValue: string,
): string {
  const map = mapFor(objType);
  const cached = map.get(tabKey);
  if (cached) return cached;

  // Try to hydrate from session state
  if (sessionState.isLoaded()) {
    const sKey = sessionKey(objType, connectionId, database, schema, name);
    const persisted = sessionState.get(sKey);
    if (persisted) {
      map.set(tabKey, persisted);
      return persisted;
    }
  }

  return defaultValue;
}

export function setSubTab(
  objType: ObjType,
  tabKey: string,
  value: string,
  connectionId: string,
  database: string,
  schema: string,
  name: string,
): void {
  const map = mapFor(objType);
  map.set(tabKey, value);

  // Persist via session state (debounced)
  const sKey = sessionKey(objType, connectionId, database, schema, name);
  sessionState.save(sKey, value);
}

/** Signal that session state has loaded — maps hydrate lazily via getSubTab. */
export function hydrateFromSessionState(): void {
  // No-op: maps are populated lazily on getSubTab calls.
  // Don't clear — would wipe user's current session state.
}
