import { useState, useRef, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useAnnotations, useUpsertAnnotation, useDeleteAnnotation } from '@/hooks/useAnnotations';
import { Trash2, MessageSquarePlus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { ColumnInfo } from '@/types/schema';

interface Props {
  connectionId: string;
  database: string;
  table: string;
  columns: ColumnInfo[];
}

export function AnnotationsTab({ connectionId, database, table, columns }: Props) {
  const { t } = useTranslation();
  const { data: annotations = [] } = useAnnotations(connectionId, database, table);
  const upsertMutation = useUpsertAnnotation();
  const deleteMutation = useDeleteAnnotation();

  const tableAnnotation = annotations.find((a) => !a.column_name);
  const columnAnnotations = new Map(
    annotations.filter((a) => a.column_name).map((a) => [a.column_name!, a])
  );

  const handleSave = (note: string, columnName?: string) => {
    if (!note.trim()) return;
    upsertMutation.mutate({
      connectionId, database, table,
      body: { column_name: columnName || null, note: note.trim() },
    });
  };

  const handleDelete = (annotId: string) => {
    deleteMutation.mutate({ connectionId, database, annotId });
  };

  return (
    <div className="space-y-4 p-2">
      <div>
        <h4 className="mb-1 text-xs font-medium text-muted-foreground uppercase tracking-wide">{t("inspector.tableNote")}</h4>
        <InlineEditor
          value={tableAnnotation?.note || ''}
          placeholder={t("inspector.addTableNote")}
          onSave={(note) => handleSave(note)}
          onDelete={tableAnnotation ? () => handleDelete(tableAnnotation.id) : undefined}
        />
      </div>

      <div>
        <h4 className="mb-1 text-xs font-medium text-muted-foreground uppercase tracking-wide">{t("inspector.columnNotes")}</h4>
        <div className="space-y-1">
          {columns.map((col) => {
            const annotation = columnAnnotations.get(col.name);
            return (
              <div key={col.name} className="flex items-start gap-2 rounded px-2 py-1 hover:bg-accent/50">
                <span className="mt-0.5 text-xs font-mono shrink-0 w-32 truncate" title={col.name}>
                  {col.name}
                </span>
                <div className="flex-1 min-w-0">
                  <InlineEditor
                    value={annotation?.note || ''}
                    placeholder={t("inspector.addNote")}
                    compact
                    onSave={(note) => handleSave(note, col.name)}
                    onDelete={annotation ? () => handleDelete(annotation.id) : undefined}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function InlineEditor({ value, placeholder, compact, onSave, onDelete }: {
  value: string;
  placeholder: string;
  compact?: boolean;
  onSave: (note: string) => void;
  onDelete?: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => { setDraft(value); }, [value]);

  useEffect(() => {
    if (editing && textareaRef.current) {
      textareaRef.current.focus();
      textareaRef.current.setSelectionRange(draft.length, draft.length);
    }
  }, [editing]);

  const handleBlur = () => {
    setEditing(false);
    if (draft.trim() && draft.trim() !== value) {
      onSave(draft);
    } else {
      setDraft(value);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      (e.target as HTMLTextAreaElement).blur();
    }
    if (e.key === 'Escape') {
      setDraft(value);
      setEditing(false);
    }
  };

  if (editing) {
    return (
      <textarea
        ref={textareaRef}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={handleBlur}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        rows={compact ? 1 : 2}
        className="w-full rounded border bg-background px-2 py-1 text-xs resize-none focus:outline-none focus:ring-1 focus:ring-ring"
      />
    );
  }

  if (value) {
    return (
      <div className="group flex items-start gap-1">
        <button
          onClick={() => setEditing(true)}
          className="flex-1 text-left text-xs whitespace-pre-wrap cursor-text hover:bg-accent/50 rounded px-1"
        >
          {value}
        </button>
        {onDelete && (
          <Button
            variant="ghost"
            size="sm"
            className={cn('h-5 w-5 p-0', 'opacity-0 group-hover:opacity-100')}
            onClick={onDelete}
          >
            <Trash2 className="h-3 w-3 text-destructive" />
          </Button>
        )}
      </div>
    );
  }

  return (
    <button
      onClick={() => setEditing(true)}
      className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
    >
      <MessageSquarePlus className="h-3 w-3" />
      {compact ? '' : placeholder}
    </button>
  );
}
