import { Children, cloneElement, isValidElement, ReactElement, ReactNode, useState } from 'react';

interface Props {
  order: string[];
  /** When provided, cells become draggable headers that reorder columns. */
  onMove?: (from: string, to: string) => void;
  /** Column keys to omit entirely. */
  hidden?: string[];
  children: ReactNode;
}

/** Reorders children that carry a `data-col` prop according to `order`; other children keep their slots. */
export const ColumnOrder = ({ order, onMove, hidden, children }: Props) => {
  const [dragOver, setDragOver] = useState<string | null>(null);
  const items = Children.toArray(children).filter(c => { const k = isValidElement(c) ? (c.props as any)['data-col'] : undefined; return !k || !hidden?.includes(k); });
  const colOf = (c: unknown) => (isValidElement(c) ? (c.props as any)['data-col'] as string | undefined : undefined);
  const cols = items.filter(c => colOf(c));
  const rank = (k: string) => { const i = order.indexOf(k); return i === -1 ? 999 : i; };
  const sorted = [...cols].sort((a, b) => rank(colOf(a)!) - rank(colOf(b)!));
  let ci = 0;
  return (
    <>
      {items.map(c => {
        const key = colOf(c);
        if (!key) return c;
        const el = sorted[ci++] as ReactElement<any>;
        if (!onMove) return el;
        const k = colOf(el)!;
        return cloneElement(el, {
          draggable: true,
          onDragStart: (e: React.DragEvent) => { e.dataTransfer.setData('text/col', k); e.dataTransfer.effectAllowed = 'move'; },
          onDragOver: (e: React.DragEvent) => { if (e.dataTransfer.types.includes('text/col')) { e.preventDefault(); setDragOver(k); } },
          onDragLeave: () => setDragOver(d => (d === k ? null : d)),
          onDrop: (e: React.DragEvent) => { e.preventDefault(); setDragOver(null); const from = e.dataTransfer.getData('text/col'); if (from && from !== k) onMove(from, k); },
          className: `${el.props.className ?? ''} cursor-grab ${dragOver === k ? 'bg-primary/10' : ''}`,
        });
      })}
    </>
  );
};
