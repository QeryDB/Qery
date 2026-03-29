import { hexToRgba } from '@/lib/utils';

interface Props {
  name: string;
  connectionId: string;
  database: string;
  typeBadge: { label: string; color: string };
}

export function InspectorHeader({ name, typeBadge }: Props) {
  return (
    <div className="px-4 pt-4 pb-3 border-b">
      <div className="flex items-center gap-2">
        <h3 className="text-[15px] font-bold tracking-tight truncate min-w-0">{name}</h3>
        <span
          className="shrink-0 rounded-md px-2 py-0.5 text-[10px] font-bold"
          style={{
            color: typeBadge.color,
            backgroundColor: hexToRgba(typeBadge.color, 0.12),
          }}
        >
          • {typeBadge.label}
        </span>
      </div>
    </div>
  );
}
