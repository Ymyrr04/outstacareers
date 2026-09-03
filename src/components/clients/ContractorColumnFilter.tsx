import { useState, useMemo } from 'react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { ListFilter, Search } from 'lucide-react';

interface ColumnFilterProps {
  /** Distinct values available for this column */
  options: string[];
  /** Currently selected values (empty = no filter) */
  selected: string[];
  onChange: (values: string[]) => void;
}

export const ContractorColumnFilter = ({ options, selected, onChange }: ColumnFilterProps) => {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');

  const visibleOptions = useMemo(() => {
    if (!query.trim()) return options;
    const q = query.toLowerCase();
    return options.filter(o => o.toLowerCase().includes(q));
  }, [options, query]);

  const isActive = selected.length > 0;
  const allSelected = selected.length === 0 || selected.length === options.length;

  const toggleValue = (value: string) => {
    // Start from an implicit "all selected" state when nothing is chosen yet
    const base = selected.length === 0 ? options : selected;
    const next = base.includes(value)
      ? base.filter(v => v !== value)
      : [...base, value];
    // If everything is selected again, clear the filter
    onChange(next.length === options.length ? [] : next);
  };

  const isChecked = (value: string) => selected.length === 0 || selected.includes(value);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          onClick={(e) => e.stopPropagation()}
          className={`p-0.5 rounded hover:bg-muted transition-colors ${
            isActive ? 'text-primary' : 'text-muted-foreground/50'
          }`}
          title="Filter column"
        >
          <ListFilter className="w-3 h-3" />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-56 p-2" align="start" onClick={(e) => e.stopPropagation()}>
        <div className="relative mb-2">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-muted-foreground" />
          <Input
            placeholder="Search values..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="h-7 pl-7 text-xs"
          />
        </div>
        <div className="max-h-56 overflow-y-auto space-y-1">
          {visibleOptions.length === 0 && (
            <p className="text-xs text-muted-foreground py-2 text-center">No values</p>
          )}
          {visibleOptions.map(value => (
            <label
              key={value}
              className="flex items-center gap-2 px-1 py-1 rounded hover:bg-muted cursor-pointer text-xs"
            >
              <Checkbox
                checked={isChecked(value)}
                onCheckedChange={() => toggleValue(value)}
              />
              <span className="truncate">{value}</span>
            </label>
          ))}
        </div>
        <div className="flex gap-2 mt-2 pt-2 border-t">
          <Button
            variant="ghost"
            size="sm"
            className="h-7 text-xs flex-1"
            onClick={() => onChange([])}
            disabled={allSelected && !isActive}
          >
            Select all
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 text-xs flex-1"
            onClick={() => onChange(['__none__'])}
          >
            Clear
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
};
