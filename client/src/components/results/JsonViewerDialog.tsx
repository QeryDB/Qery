import { useState, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import CodeMirror from '@uiw/react-codemirror';
import { json } from '@codemirror/lang-json';
import { oneDark } from '@codemirror/theme-one-dark';
import { EditorView } from '@codemirror/view';
import { useUIStore } from '@/stores/ui-store';
import { Copy, Check, WrapText, Minimize2 } from 'lucide-react';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  value: string;
  columnName?: string;
}

export function JsonViewerDialog({ open, onOpenChange, value, columnName }: Props) {
  const { t } = useTranslation();
  const [compact, setCompact] = useState(false);
  const [copied, setCopied] = useState(false);
  const isDark = useUIStore((s) => s.theme === 'dark');

  const formatted = useMemo(() => {
    try {
      const parsed = JSON.parse(value);
      return compact ? JSON.stringify(parsed) : JSON.stringify(parsed, null, 2);
    } catch {
      return value;
    }
  }, [value, compact]);

  const lineCount = useMemo(() => formatted.split('\n').length, [formatted]);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(formatted);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const extensions = useMemo(
    () => [
      json(),
      EditorView.lineWrapping,
      EditorView.editable.of(false),
      ...(isDark ? [oneDark] : []),
    ],
    [isDark]
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[640px] max-h-[80vh] flex flex-col gap-2">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-sm">
            <span className="font-mono text-muted-foreground">{'{}'}</span>
            {columnName ? `JSON — ${columnName}` : t('results.jsonViewer')}
          </DialogTitle>
        </DialogHeader>

        <div className="flex items-center gap-1">
          <Button
            variant="outline"
            size="sm"
            className="h-7 text-xs gap-1"
            onClick={() => setCompact((c) => !c)}
          >
            {compact ? <WrapText className="h-3 w-3" /> : <Minimize2 className="h-3 w-3" />}
            {compact ? t('common.format') : t('common.minify')}
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="h-7 text-xs gap-1"
            onClick={handleCopy}
          >
            {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
            {copied ? t('common.copied') : t('common.copy')}
          </Button>
          <span className="ml-auto text-[10px] text-muted-foreground">
            {t('common.lines', { count: lineCount })}
          </span>
        </div>

        <div className="flex-1 overflow-hidden border rounded-md min-h-0">
          <CodeMirror
            value={formatted}
            extensions={extensions}
            readOnly
            basicSetup={{
              lineNumbers: true,
              foldGutter: true,
              highlightActiveLine: false,
            }}
            maxHeight="60vh"
          />
        </div>
      </DialogContent>
    </Dialog>
  );
}
