import { ChevronRight } from 'lucide-react';
import { useEditorStore, type InspectorTarget } from '@/stores/editor-store';

interface Props {
  breadcrumb: InspectorTarget[];
  current: InspectorTarget;
}

export function InspectorBreadcrumb({ breadcrumb, current }: Props) {
  const addInspectorTab = useEditorStore((s) => s.addInspectorTab);

  if (breadcrumb.length === 0) return null;

  const label = (t: InspectorTarget) => `${t.schema}.${t.table}`;

  return (
    <div className="flex items-center gap-0.5 overflow-x-auto px-2 py-1 text-xs font-mono">
      {breadcrumb.map((item, i) => (
        <span key={i} className="flex items-center gap-0.5 shrink-0">
          <button
            className="text-blue-500 hover:underline cursor-pointer"
            onClick={() => addInspectorTab(item, breadcrumb.slice(0, i))}
          >
            {label(item)}
          </button>
          <ChevronRight className="h-3 w-3 text-muted-foreground" />
        </span>
      ))}
      <span className="font-semibold shrink-0">{label(current)}</span>
    </div>
  );
}
