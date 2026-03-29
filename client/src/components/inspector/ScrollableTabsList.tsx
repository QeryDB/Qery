import { useRef, useState, useEffect, type ReactNode } from 'react';
import { TabsList } from '@/components/ui/tabs';
import { ChevronLeft, ChevronRight } from 'lucide-react';

interface Props {
  className?: string;
  children: ReactNode;
}

export function ScrollableTabsList({ className, children }: Props) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);

  const updateScrollState = () => {
    const el = scrollRef.current;
    if (!el) return;
    setCanScrollLeft(el.scrollLeft > 0);
    setCanScrollRight(el.scrollLeft + el.clientWidth < el.scrollWidth - 1);
  };

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    updateScrollState();
    el.addEventListener('scroll', updateScrollState);
    const ro = new ResizeObserver(updateScrollState);
    ro.observe(el);
    return () => {
      el.removeEventListener('scroll', updateScrollState);
      ro.disconnect();
    };
  }, []);

  const scrollBy = (dir: number) => {
    scrollRef.current?.scrollBy({ left: dir * 150, behavior: 'smooth' });
  };

  return (
    <div className="relative flex items-stretch">
      {canScrollLeft && (
        <button
          className="flex items-center px-0.5 text-muted-foreground hover:text-foreground hover:bg-accent border-r shrink-0 z-10"
          onClick={() => scrollBy(-1)}
        >
          <ChevronLeft className="h-3.5 w-3.5" />
        </button>
      )}
      <div ref={scrollRef} className="overflow-x-auto overflow-y-hidden scrollbar-none flex-1 min-w-0">
        <TabsList className={className}>
          {children}
        </TabsList>
      </div>
      {canScrollRight && (
        <button
          className="flex items-center px-0.5 text-muted-foreground hover:text-foreground hover:bg-accent border-l shrink-0 z-10"
          onClick={() => scrollBy(1)}
        >
          <ChevronRight className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  );
}
