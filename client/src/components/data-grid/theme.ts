import type { Theme } from '@glideapps/glide-data-grid';

function hslToHex(h: number, s: number, l: number): string {
  s /= 100;
  l /= 100;
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => {
    const k = (n + h / 30) % 12;
    const color = l - a * Math.max(Math.min(k - 3, 9 - k, 1), -1);
    return Math.round(255 * color).toString(16).padStart(2, '0');
  };
  return `#${f(0)}${f(8)}${f(4)}`;
}

function cssVarToHex(varName: string): string {
  const style = getComputedStyle(document.documentElement);
  const raw = style.getPropertyValue(varName).trim();
  if (!raw) return '#888888';
  const parts = raw.split(/\s+/);
  if (parts.length >= 3) {
    const h = parseFloat(parts[0]);
    const s = parseFloat(parts[1]);
    const l = parseFloat(parts[2]);
    return hslToHex(h, s, l);
  }
  return '#888888';
}

export function buildGridTheme(isDark: boolean, compact = false): Partial<Theme> {
  const bg = cssVarToHex('--background');
  const fg = cssVarToHex('--foreground');
  const border = cssVarToHex('--border');
  const accent = cssVarToHex('--accent');
  const muted = cssVarToHex('--muted');
  const mutedFg = cssVarToHex('--muted-foreground');
  const primary = cssVarToHex('--primary');

  return {
    accentColor: primary,
    accentLight: isDark ? 'rgba(18, 113, 91, 0.12)' : 'rgba(18, 113, 91, 0.08)',
    textDark: fg,
    textMedium: mutedFg,
    textLight: mutedFg,
    textBubble: fg,
    bgIconHeader: mutedFg,
    fgIconHeader: bg,
    textHeader: mutedFg,
    textHeaderSelected: fg,
    bgCell: bg,
    bgCellMedium: isDark ? '#18181b' : '#f8f9fa',
    cellHorizontalPadding: compact ? 10 : 20,
    bgHeader: isDark ? '#111112' : '#f8fafc',
    bgHeaderHasFocus: accent,
    bgHeaderHovered: accent,
    bgBubble: muted,
    bgBubbleSelected: accent,
    bgSearchResult: isDark ? 'rgba(18, 113, 91, 0.15)' : 'rgba(18, 113, 91, 0.1)',
    borderColor: border,
    horizontalBorderColor: border,
    drilldownBorder: border,
    linkColor: isDark ? '#6EC9A5' : '#2D7D5F',
    headerFontStyle: compact ? "600 10px" : "600 11px",
    baseFontStyle: compact ? "11px" : "13px",
    fontFamily: "'Inter', -apple-system, system-ui, sans-serif",
    editorFontSize: compact ? '10px' : '12px',
    lineHeight: compact ? 1.3 : 1.5,
  };
}
