import { api } from './api';

// In-memory mirror — reads are instant, writes are debounced
const cache = new Map<string, string>();
let loaded = false;
let loadedPrefix = '';

// Per-key debounce timers
const saveTimers = new Map<string, ReturnType<typeof setTimeout>>();
const DEBOUNCE_MS = 300;

// Reactive load tracking (for useSyncExternalStore)
let loadVersion = 0;
const listeners = new Set<() => void>();

/** Subscribe to load events (for useSyncExternalStore). */
export function subscribe(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/** Snapshot of load version (for useSyncExternalStore). */
export function getSnapshot(): number {
  return loadVersion;
}

function notifyListeners() {
  loadVersion++;
  for (const fn of listeners) fn();
}

/** Load all session state for a specific connection+database. Clears previous cache. */
export async function loadForDatabase(connectionId: string, database: string): Promise<void> {
  const prefix = `${connectionId}:${database}:`;
  if (loaded && loadedPrefix === prefix) return;

  cache.clear();
  loadedPrefix = prefix;
  loaded = false;

  try {
    const data = await api.get<Record<string, string>>(
      `/session-state?prefix=${encodeURIComponent(prefix)}`
    );
    // Only apply if prefix hasn't changed while we were loading
    if (loadedPrefix === prefix) {
      for (const [key, value] of Object.entries(data)) {
        cache.set(key, value);
      }
      loaded = true;
      notifyListeners();
    }
  } catch (err) {
    console.warn('[session-state] Failed to load:', err);
  }
}

/** Sync read from in-memory cache (no IPC). */
export function get(key: string): string | undefined {
  return cache.get(key);
}

/** Debounced write — coalesces rapid changes per-key. */
export function save(key: string, value: string): void {
  cache.set(key, value);

  const existing = saveTimers.get(key);
  if (existing) clearTimeout(existing);

  saveTimers.set(
    key,
    setTimeout(() => {
      saveTimers.delete(key);
      api.put('/session-state', { key, value }).catch((err) => {
        console.warn('[session-state] Failed to save:', key, err);
      });
    }, DEBOUNCE_MS)
  );
}

/** Immediate delete of a single key. */
export function remove(key: string): void {
  cache.delete(key);

  const existing = saveTimers.get(key);
  if (existing) {
    clearTimeout(existing);
    saveTimers.delete(key);
  }

  api.delete(`/session-state/${encodeURIComponent(key)}`).catch((err) => {
    console.warn('[session-state] Failed to remove:', key, err);
  });
}

/** Bulk delete by prefix and clear matching entries from cache. */
export function removeByPrefix(prefix: string): void {
  for (const key of cache.keys()) {
    if (key.startsWith(prefix)) {
      cache.delete(key);
      const timer = saveTimers.get(key);
      if (timer) {
        clearTimeout(timer);
        saveTimers.delete(key);
      }
    }
  }

  api.delete(`/session-state?prefix=${encodeURIComponent(prefix)}`).catch((err) => {
    console.warn('[session-state] Failed to removeByPrefix:', prefix, err);
  });
}

/** Check if session state has been loaded. */
export function isLoaded(): boolean {
  return loaded;
}

/** Reset loaded state (for database switches). */
export function reset(): void {
  cache.clear();
  loaded = false;
  loadedPrefix = '';
  for (const timer of saveTimers.values()) {
    clearTimeout(timer);
  }
  saveTimers.clear();
  notifyListeners();
}
