import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectTrigger, SelectContent, SelectItem, SelectValue } from '@/components/ui/select';
import type { ColumnInfo } from '@/types/schema';
import type { TableInfo } from '@/types/schema';
import { useTableColumns } from '@/hooks/useTableDetails';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  connectionId: string;
  database: string;
  currentTable: string;
  currentSchema: string;
  currentColumns: ColumnInfo[];
  tables: TableInfo[];
  onSave: (data: { from_table: string; from_column: string; to_table: string; to_column: string; description?: string }) => void;
}

export function AddRelationshipDialog({
  open,
  onOpenChange,
  connectionId,
  database,
  currentTable,
  currentSchema,
  currentColumns,
  tables,
  onSave,
}: Props) {
  const { t } = useTranslation();
  const [fromColumn, setFromColumn] = useState('');
  const [toTable, setToTable] = useState('');
  const [toColumn, setToColumn] = useState('');
  const [description, setDescription] = useState('');

  // Fetch columns for selected target table
  const { data: targetColumns } = useTableColumns(
    toTable ? connectionId : null,
    toTable ? database : null,
    toTable || null,
    currentSchema
  );

  const handleSave = () => {
    if (!fromColumn || !toTable || !toColumn) return;
    onSave({
      from_table: currentTable,
      from_column: fromColumn,
      to_table: toTable,
      to_column: toColumn,
      description: description || undefined,
    });
    // Reset form
    setFromColumn('');
    setToTable('');
    setToColumn('');
    setDescription('');
    onOpenChange(false);
  };

  const filteredTables = tables.filter((t) => t.name !== currentTable);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-sm">{t("inspector.addRelationship")}</DialogTitle>
          <DialogDescription className="text-xs">
            {t('inspector.addRelationshipDescription', { schema: currentSchema, table: currentTable })}
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-3">
          {/* From column */}
          <div className="grid gap-1.5">
            <Label className="text-xs">{t('inspector.sourceColumn')} ({currentTable})</Label>
            <Select value={fromColumn} onValueChange={setFromColumn}>
              <SelectTrigger className="h-8 text-xs">
                <SelectValue placeholder={t("inspector.selectColumn")} />
              </SelectTrigger>
              <SelectContent>
                {currentColumns.map((col) => (
                  <SelectItem key={col.name} value={col.name} className="text-xs">
                    {col.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* To table */}
          <div className="grid gap-1.5">
            <Label className="text-xs">{t("inspector.targetTable")}</Label>
            <Select value={toTable} onValueChange={(v) => { setToTable(v); setToColumn(''); }}>
              <SelectTrigger className="h-8 text-xs">
                <SelectValue placeholder={t("inspector.selectTable")} />
              </SelectTrigger>
              <SelectContent>
                {filteredTables.map((t) => (
                  <SelectItem key={t.name} value={t.name} className="text-xs">
                    {t.schema}.{t.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* To column */}
          <div className="grid gap-1.5">
            <Label className="text-xs">{t("inspector.targetColumn")}</Label>
            <Select value={toColumn} onValueChange={setToColumn} disabled={!toTable || !targetColumns}>
              <SelectTrigger className="h-8 text-xs">
                <SelectValue placeholder={toTable ? t('inspector.selectColumn') : t('inspector.selectTableFirst')} />
              </SelectTrigger>
              <SelectContent>
                {(targetColumns || []).map((col) => (
                  <SelectItem key={col.name} value={col.name} className="text-xs">
                    {col.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Description */}
          <div className="grid gap-1.5">
            <Label className="text-xs">{t("inspector.descriptionOptional")}</Label>
            <Input
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder={t("inspector.descriptionPlaceholder")}
              className="h-8 text-xs"
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>
            {t('common.cancel')}
          </Button>
          <Button size="sm" onClick={handleSave} disabled={!fromColumn || !toTable || !toColumn}>
            {t('common.save')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
