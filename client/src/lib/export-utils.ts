/** Shared export utilities for CSV, JSON, and XLSX. */

export interface ExportableData {
  columns: { name: string }[];
  rows: Record<string, any>[];
}

function isTauri(): boolean {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
}

export function buildCsv(data: ExportableData): string {
  const header = data.columns.map((c) => c.name).join(',');
  const rows = data.rows.map((row) =>
    data.columns
      .map((c) => {
        const val = String(row[c.name] ?? '');
        return val.includes(',') || val.includes('"') || val.includes('\n')
          ? `"${val.replace(/"/g, '""')}"`
          : val;
      })
      .join(','),
  );
  return [header, ...rows].join('\n');
}

export function buildJson(data: ExportableData): string {
  return JSON.stringify(data.rows, null, 2);
}

export async function buildXlsx(data: ExportableData): Promise<Uint8Array> {
  const XLSX = await import('xlsx');
  const ws = XLSX.utils.json_to_sheet(data.rows, {
    header: data.columns.map((c) => c.name),
  });
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Results');
  const buf = XLSX.write(wb, { type: 'array', bookType: 'xlsx' });
  return new Uint8Array(buf);
}

function browserDownload(content: string | Uint8Array, filename: string, type: string) {
  const blob =
    content instanceof Uint8Array
      ? new Blob([new Uint8Array(content)], { type })
      : new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

async function tauriSave(content: string | Uint8Array, defaultName: string, filterName: string, extensions: string[]) {
  const { save } = await import('@tauri-apps/plugin-dialog');
  const { writeFile, writeTextFile } = await import('@tauri-apps/plugin-fs');

  const path = await save({
    defaultPath: defaultName,
    filters: [{ name: filterName, extensions }],
  });
  if (!path) return;

  if (content instanceof Uint8Array) {
    await writeFile(path, content);
  } else {
    await writeTextFile(path, content);
  }
}

export async function exportFile(content: string | Uint8Array, filename: string, mimeType: string, filterName: string, extensions: string[]) {
  if (isTauri()) {
    await tauriSave(content, filename, filterName, extensions);
  } else {
    browserDownload(content, filename, mimeType);
  }
}

export function makeFilename(name: string, ext: string): string {
  const d = new Date();
  const date = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
  const safe = name.replace(/[^a-zA-Z0-9_\-]/g, '_').replace(/_+/g, '_').replace(/^_|_$/g, '') || 'query';
  return `${safe}_${date}.${ext}`;
}
