import { useState, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { Search, X } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { useSchemaStore } from '@/stores/schema-store';

export function TreeSearch() {
  const { t } = useTranslation();
  const searchQuery = useSchemaStore((s) => s.searchQuery);
  const setSearchQuery = useSchemaStore((s) => s.setSearchQuery);
  const [local, setLocal] = useState(searchQuery);
  const timerRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  // Sync local state when store is cleared externally (e.g. refresh)
  useEffect(() => {
    if (searchQuery === '') setLocal('');
  }, [searchQuery]);

  const handleChange = (value: string) => {
    setLocal(value);
    clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => setSearchQuery(value), 150);
  };

  useEffect(() => () => clearTimeout(timerRef.current), []);

  return (
    <div className="relative px-4 py-3">
      <Search className="absolute left-6 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
      <Input
        value={local}
        onChange={(e) => handleChange(e.target.value)}
        placeholder={t("schema.searchTablesAndColumns")}
        className="h-8 pl-8 text-xs rounded-lg"
      />
      {local && (
        <button
          onClick={() => { setLocal(''); setSearchQuery(''); }}
          className="absolute right-6 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  );
}
