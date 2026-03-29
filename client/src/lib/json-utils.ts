export function isJsonString(value: any): boolean {
  if (typeof value !== 'string') return false;
  const trimmed = value.trimStart();
  if (trimmed[0] !== '{' && trimmed[0] !== '[') return false;
  try {
    JSON.parse(value);
    return true;
  } catch {
    return false;
  }
}
