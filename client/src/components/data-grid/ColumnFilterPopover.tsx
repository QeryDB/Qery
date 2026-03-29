import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Filter, X } from 'lucide-react';
import type { FilterItem } from './types';

interface Props {
  columnName: string;
  activeFilter?: FilterItem;
  onApply: (filter: FilterItem) => void;
  onClear: () => void;
  onClose: () => void;
}

const OPERATORS: { value: FilterItem['operator']; label: string }[] = [
  { value: 'eq', label: 'grid.equals' },
  { value: 'neq', label: 'grid.notEquals' },
  { value: 'gt', label: 'grid.greaterThan' },
  { value: 'lt', label: 'grid.lessThan' },
  { value: 'gte', label: 'grid.greaterOrEqual' },
  { value: 'lte', label: 'grid.lessOrEqual' },
  { value: 'contains', label: 'grid.contains' },
  { value: 'is_null', label: 'grid.isNull' },
  { value: 'is_not_null', label: 'grid.isNotNull' },
];

const NO_VALUE_OPS = new Set<string>(['is_null', 'is_not_null']);

export function ColumnFilterPopover({ columnName, activeFilter, onApply, onClear, onClose }: Props) {
  const { t } = useTranslation();
  const [operator, setOperator] = useState<FilterItem['operator']>(activeFilter?.operator || 'eq');
  const [value, setValue] = useState(activeFilter?.value || '');

  const handleApply = () => {
    onApply({
      column: columnName,
      operator,
      value: NO_VALUE_OPS.has(operator) ? undefined : value,
    });
    onClose();
  };

  const handleClear = () => {
    onClear();
    onClose();
  };

  return (
    <div className="flex flex-col gap-2 rounded-md border bg-popover p-3 shadow-md" style={{ minWidth: 220 }}>
      <div className="flex items-center gap-1.5 text-xs font-medium">
        <Filter className="h-3 w-3" />
        {t('grid.filter', { column: columnName })}
      </div>
      <Select value={operator} onValueChange={(v) => setOperator(v as FilterItem['operator'])}>
        <SelectTrigger className="h-7 text-xs">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {OPERATORS.map((op) => (
            <SelectItem key={op.value} value={op.value} className="text-xs">
              {t(op.label)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {!NO_VALUE_OPS.has(operator) && (
        <Input
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder={t("grid.valuePlaceholder")}
          className="h-7 text-xs"
          onKeyDown={(e) => e.key === 'Enter' && handleApply()}
        />
      )}
      <div className="flex gap-1.5">
        <Button size="sm" className="h-6 flex-1 text-xs" onClick={handleApply}>
          {t('common.apply')}
        </Button>
        <Button size="sm" variant="ghost" className="h-6 text-xs gap-0.5" onClick={handleClear}>
          <X className="h-3 w-3" />
          {t('common.clear')}
        </Button>
      </div>
    </div>
  );
}
