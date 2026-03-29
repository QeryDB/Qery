import { useRef, useEffect } from 'react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { X, ChevronUp, ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';

interface Props {
  searchTerm: string;
  onSearchChange: (term: string) => void;
  matchCount: number;
  currentMatchIdx: number;
  onNext: () => void;
  onPrev: () => void;
  onClose: () => void;
  caseSensitive: boolean;
  onToggleCaseSensitive: () => void;
  wholeWord: boolean;
  onToggleWholeWord: () => void;
  normalize: boolean;
  onToggleNormalize: () => void;
}

function ToggleBtn({
  active,
  onClick,
  tooltip,
  children,
}: {
  active: boolean;
  onClick: () => void;
  tooltip: string;
  children: React.ReactNode;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          onClick={onClick}
          className={cn(
            'h-5 min-w-[22px] px-1 rounded text-[10px] font-semibold leading-none border transition-colors select-none',
            active
              ? 'bg-primary text-primary-foreground border-primary'
              : 'bg-transparent text-muted-foreground border-transparent hover:border-border hover:text-foreground',
          )}
        >
          {children}
        </button>
      </TooltipTrigger>
      <TooltipContent side="bottom" className="text-xs">
        {tooltip}
      </TooltipContent>
    </Tooltip>
  );
}

export function SearchBar({
  searchTerm,
  onSearchChange,
  matchCount,
  currentMatchIdx,
  onNext,
  onPrev,
  onClose,
  caseSensitive,
  onToggleCaseSensitive,
  wholeWord,
  onToggleWholeWord,
  normalize,
  onToggleNormalize,
}: Props) {
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      onClose();
    } else if (e.key === 'Enter') {
      if (e.shiftKey) onPrev();
      else onNext();
    }
  };

  return (
    <div className="flex items-center gap-1.5 border-b bg-muted/30 px-2 py-1">
      <Input
        ref={inputRef}
        value={searchTerm}
        onChange={(e) => onSearchChange(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder="Ara..."
        className="h-6 w-48 text-xs"
      />

      {/* VS Code-style toggle buttons */}
      <ToggleBtn
        active={caseSensitive}
        onClick={onToggleCaseSensitive}
        tooltip="Case sensitive (Aa)"
      >
        Aa
      </ToggleBtn>
      <ToggleBtn
        active={wholeWord}
        onClick={onToggleWholeWord}
        tooltip="Match whole word"
      >
        <span className="border-b border-current pb-px">ab</span>
      </ToggleBtn>
      <ToggleBtn
        active={normalize}
        onClick={onToggleNormalize}
        tooltip="Turkish character normalization (ı↔i, ö↔o, ş↔s ...)"
      >
        ıi
      </ToggleBtn>

      <span className="text-xs text-muted-foreground whitespace-nowrap min-w-[60px] text-center">
        {searchTerm ? `${matchCount > 0 ? currentMatchIdx + 1 : 0} / ${matchCount}` : ''}
      </span>
      <Button size="icon-sm" variant="ghost" className="h-5 w-5" onClick={onPrev} disabled={matchCount === 0}>
        <ChevronUp className="h-3 w-3" />
      </Button>
      <Button size="icon-sm" variant="ghost" className="h-5 w-5" onClick={onNext} disabled={matchCount === 0}>
        <ChevronDown className="h-3 w-3" />
      </Button>
      <Button size="icon-sm" variant="ghost" className="h-5 w-5" onClick={onClose}>
        <X className="h-3 w-3" />
      </Button>
    </div>
  );
}
