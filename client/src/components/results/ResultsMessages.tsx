import { AlertCircle } from 'lucide-react';
import { useTranslation } from 'react-i18next';

interface Props {
  error: string;
}

export function ResultsMessages({ error }: Props) {
  const { t } = useTranslation();
  return (
    <div className="flex h-full flex-col">
      <div className="border-b px-2 py-1 text-xs text-muted-foreground">{t("results.messages")}</div>
      <div className="flex items-start gap-2 p-4 text-sm text-red-500">
        <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
        <pre className="whitespace-pre-wrap font-mono text-xs">{error}</pre>
      </div>
    </div>
  );
}
