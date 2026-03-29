import { useState, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import type { ObjectDependency } from '@/types/schema';
import { Table2, Eye, Code2, FunctionSquare, HelpCircle, Search, X, ExternalLink } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

interface Props {
  dependencies: ObjectDependency[];
  label?: string;
  onNavigate?: (schema: string, name: string, type: string | null) => void;
}

const typeConfig: Record<string, { icon: typeof Table2; color: string; bg: string; border: string; label: string }> = {
  USER_TABLE:                       { icon: Table2,         color: 'text-blue-500',   bg: 'bg-blue-500/10',   border: 'border-l-blue-500',   label: 'Table' },
  VIEW:                             { icon: Eye,            color: 'text-purple-500', bg: 'bg-purple-500/10', border: 'border-l-purple-500', label: 'View' },
  SQL_STORED_PROCEDURE:             { icon: Code2,          color: 'text-orange-500', bg: 'bg-orange-500/10', border: 'border-l-orange-500', label: 'Procedure' },
  SQL_SCALAR_FUNCTION:              { icon: FunctionSquare, color: 'text-teal-500',   bg: 'bg-teal-500/10',   border: 'border-l-teal-500',   label: 'Function' },
  SQL_TABLE_VALUED_FUNCTION:        { icon: FunctionSquare, color: 'text-teal-500',   bg: 'bg-teal-500/10',   border: 'border-l-teal-500',   label: 'TVF' },
  SQL_INLINE_TABLE_VALUED_FUNCTION: { icon: FunctionSquare, color: 'text-teal-500',   bg: 'bg-teal-500/10',   border: 'border-l-teal-500',   label: 'ITVF' },
};

function getTypeInfo(type: string | null) {
  if (!type) return { icon: HelpCircle, color: 'text-muted-foreground', bg: 'bg-muted/50', border: 'border-l-muted-foreground', label: 'Unknown' };
  return typeConfig[type] || { icon: HelpCircle, color: 'text-muted-foreground', bg: 'bg-muted/50', border: 'border-l-muted-foreground', label: type.replace(/_/g, ' ').toLowerCase() };
}

// Collapse function types into a single filter category
function getFilterCategory(type: string | null): string {
  if (!type) return 'UNKNOWN';
  if (type.includes('FUNCTION')) return 'FUNCTION';
  return type;
}

const filterCategories: { key: string; label: string; icon: typeof Table2; color: string; activeColor: string }[] = [
  { key: 'USER_TABLE',           label: 'Tables',      icon: Table2,         color: 'text-muted-foreground hover:text-blue-500 hover:bg-blue-500/10 hover:border-blue-500/30',     activeColor: 'text-blue-600 bg-blue-500/15 border-blue-500/40 dark:text-blue-400' },
  { key: 'VIEW',                 label: 'Views',       icon: Eye,            color: 'text-muted-foreground hover:text-purple-500 hover:bg-purple-500/10 hover:border-purple-500/30', activeColor: 'text-purple-600 bg-purple-500/15 border-purple-500/40 dark:text-purple-400' },
  { key: 'SQL_STORED_PROCEDURE', label: 'Procedures',  icon: Code2,          color: 'text-muted-foreground hover:text-orange-500 hover:bg-orange-500/10 hover:border-orange-500/30', activeColor: 'text-orange-600 bg-orange-500/15 border-orange-500/40 dark:text-orange-400' },
  { key: 'FUNCTION',             label: 'Functions',   icon: FunctionSquare, color: 'text-muted-foreground hover:text-teal-500 hover:bg-teal-500/10 hover:border-teal-500/30',       activeColor: 'text-teal-600 bg-teal-500/15 border-teal-500/40 dark:text-teal-400' },
];

export function DependenciesTab({ dependencies, label, onNavigate }: Props) {
  const { t } = useTranslation();
  const [search, setSearch] = useState('');
  const [activeFilters, setActiveFilters] = useState<Set<string>>(new Set());

  // Count items per category for filter badges
  const categoryCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const dep of dependencies) {
      const cat = getFilterCategory(dep.type);
      counts.set(cat, (counts.get(cat) || 0) + 1);
    }
    return counts;
  }, [dependencies]);

  // Only show filter categories that have items
  const availableFilters = useMemo(
    () => filterCategories.filter((f) => categoryCounts.has(f.key)),
    [categoryCounts]
  );

  const toggleFilter = (key: string) => {
    setActiveFilters((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  // Filter and search
  const filtered = useMemo(() => {
    let items = dependencies;
    if (activeFilters.size > 0) {
      items = items.filter((dep) => activeFilters.has(getFilterCategory(dep.type)));
    }
    if (search.trim()) {
      const q = search.toLowerCase();
      items = items.filter(
        (dep) =>
          dep.name.toLowerCase().includes(q) ||
          dep.schema.toLowerCase().includes(q) ||
          (dep.type && getTypeInfo(dep.type).label.toLowerCase().includes(q))
      );
    }
    return items;
  }, [dependencies, activeFilters, search]);

  // Group filtered results by type
  const grouped = useMemo(() => {
    const map = new Map<string, ObjectDependency[]>();
    for (const dep of filtered) {
      const key = dep.type || 'UNKNOWN';
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(dep);
    }
    return map;
  }, [filtered]);

  if (!dependencies.length) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-2 py-12 text-muted-foreground">
        <Search className="h-8 w-8 opacity-30" />
        <p className="text-xs">{t('common.noResults')}</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full gap-2 p-2">
      {/* Search + count header */}
      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={`Search ${dependencies.length} ${(label || 'dependencies').toLowerCase()}...`}
            className={cn(
              'w-full rounded-md border border-input bg-background pl-7 pr-7 text-xs placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring',
              'h-7'
            )}
          />
          {search && (
            <button
              onClick={() => setSearch('')}
              className="absolute right-1.5 top-1/2 -translate-y-1/2 p-0.5 rounded hover:bg-muted text-muted-foreground"
            >
              <X className="h-3 w-3" />
            </button>
          )}
        </div>
        <span className="text-[10px] text-muted-foreground whitespace-nowrap">
          {filtered.length === dependencies.length ? dependencies.length : `${filtered.length}/${dependencies.length}`}
        </span>
      </div>

      {/* Type filter chips */}
      {availableFilters.length > 1 && (
        <div className="flex items-center gap-1 flex-wrap">
          {availableFilters.map((f) => {
            const Icon = f.icon;
            const isActive = activeFilters.has(f.key);
            const count = categoryCounts.get(f.key) || 0;
            return (
              <button
                key={f.key}
                onClick={() => toggleFilter(f.key)}
                className={cn(
                  'inline-flex items-center gap-1 rounded-full border px-2 text-[11px] font-medium transition-colors',
                  'py-0.5',
                  isActive ? f.activeColor : f.color
                )}
              >
                <Icon className="h-3 w-3" />
                {f.label}
                <span className="opacity-60">{count}</span>
              </button>
            );
          })}
          {activeFilters.size > 0 && (
            <button
              onClick={() => setActiveFilters(new Set())}
              className="text-[10px] text-muted-foreground hover:text-foreground px-1"
            >
              Clear
            </button>
          )}
        </div>
      )}

      {/* Results */}
      <div className="flex-1 overflow-auto min-h-0">
        {filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-8 gap-1.5 text-muted-foreground">
            <Search className="h-5 w-5 opacity-30" />
            <p className="text-xs">{t('common.noMatch')}</p>
            <button
              onClick={() => { setSearch(''); setActiveFilters(new Set()); }}
              className="text-[11px] text-primary hover:underline"
            >
              Clear filters
            </button>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {Array.from(grouped.entries()).map(([type, deps]) => {
              const info = getTypeInfo(type);
              const Icon = info.icon;
              return (
                <div key={type}>
                  {/* Group header */}
                  <div className="flex items-center gap-1.5 px-1 pb-1 mb-1">
                    <Icon className={`h-3.5 w-3.5 ${info.color}`} />
                    <span className="text-[11px] font-semibold text-muted-foreground">{info.label}</span>
                    <Badge variant="secondary" className="h-4 px-1.5 text-[10px] font-normal">{deps.length}</Badge>
                  </div>
                  {/* Items */}
                  <div className="flex flex-col gap-0.5">
                    {deps.map((dep) => (
                      <button
                        key={`${dep.schema}.${dep.name}`}
                        className={`group flex items-center gap-2 rounded-md border-l-2 ${info.border} px-2.5 py-1.5 text-left transition-all hover:bg-accent/60 hover:shadow-sm`}
                        onClick={() => onNavigate?.(dep.schema, dep.name, dep.type)}
                      >
                        <Icon className={`h-3.5 w-3.5 shrink-0 ${info.color} opacity-70`} />
                        <div className="flex items-baseline gap-0.5 min-w-0">
                          <span className="text-[11px] text-muted-foreground">{dep.schema}.</span>
                          <span className="text-xs font-semibold font-mono truncate">{dep.name}</span>
                        </div>
                        {onNavigate && (
                          <ExternalLink className="h-3 w-3 ml-auto shrink-0 text-muted-foreground opacity-0 group-hover:opacity-60 transition-opacity" />
                        )}
                      </button>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
