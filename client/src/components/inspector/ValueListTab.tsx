interface Props {
  data: any;
}

/** Generic ordered value list renderer (for enum values, etc.) */
export function ValueListTab({ data }: Props) {
  const items: { value: string; ordinal?: number }[] = Array.isArray(data)
    ? data.map((item: any) => ({
        value: item.value || item.label || String(item),
        ordinal: item.ordinal ?? item.ordinal_position,
      }))
    : [];

  if (items.length === 0) {
    return <div className="p-4 text-sm text-muted-foreground">No values</div>;
  }

  return (
    <div className="p-4">
      <div className="rounded-lg border divide-y">
        {items.map((item, i) => (
          <div key={i} className="flex items-center gap-3 px-3 py-2 text-sm">
            <span className="text-muted-foreground text-xs font-mono w-6 text-right shrink-0">
              {item.ordinal ?? i + 1}
            </span>
            <span className="font-mono">{item.value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
