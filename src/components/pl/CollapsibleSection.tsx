import { useState, useEffect, ReactNode, CSSProperties } from 'react';
import { ChevronDown } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { cn } from '@/lib/utils';

interface CollapsibleSectionProps {
  storageKey: string;
  title: ReactNode;
  badge?: ReactNode;
  rightSlot?: ReactNode;
  collapsedSummary?: ReactNode;
  defaultOpen?: boolean;
  className?: string;
  style?: CSSProperties;
  children: ReactNode;
}

/**
 * Collapsible section card with localStorage persistence.
 * - Multiple sections can be open at once (not accordion).
 * - Default to open on first visit.
 */
export const CollapsibleSection = ({
  storageKey,
  title,
  badge,
  rightSlot,
  collapsedSummary,
  defaultOpen = true,
  className,
  style,
  children,
}: CollapsibleSectionProps) => {
  const [open, setOpen] = useState<boolean>(() => {
    try {
      const v = localStorage.getItem(storageKey);
      if (v === null) return defaultOpen;
      return v === '1';
    } catch {
      return defaultOpen;
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem(storageKey, open ? '1' : '0');
    } catch {}
  }, [open, storageKey]);

  return (
    <Card className={cn('overflow-hidden', className)} style={style}>
      <div
        role="button"
        tabIndex={0}
        onClick={() => setOpen((o) => !o)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            setOpen((o) => !o);
          }
        }}
        className={cn(
          'w-full flex items-center justify-between gap-3 px-4 py-2.5 bg-muted/40 hover:bg-muted/70 transition-colors cursor-pointer select-none',
          open && 'border-b'
        )}
      >
        <div className="flex items-center gap-2 min-w-0 flex-1">
          <ChevronDown
            className={cn(
              'w-4 h-4 text-muted-foreground transition-transform shrink-0',
              open ? 'rotate-0' : '-rotate-90'
            )}
          />
          <span className="text-sm font-medium truncate">{title}</span>
          {badge}
          {!open && collapsedSummary && (
            <span className="text-xs text-muted-foreground ml-2 truncate">
              {collapsedSummary}
            </span>
          )}
        </div>
        {rightSlot && open && (
          <div
            onClick={(e) => e.stopPropagation()}
            onKeyDown={(e) => e.stopPropagation()}
            className="flex items-center gap-2 shrink-0"
          >
            {rightSlot}
          </div>
        )}
      </div>
      {open && <div>{children}</div>}
    </Card>
  );
};
