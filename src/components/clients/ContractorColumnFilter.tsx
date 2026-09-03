import { useState, useMemo } from 'react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { ListFilter, Search } from 'lucide-react';

interface ColumnFilterProps {
  /** Distinct values available for this column */
  options: string[];
  /** undefined = no filter (show all); otherwise only these values show */
  selected: string[] | undefined;
  onChange: (values: string[] | undefined) => void;
}

export const ContractorColumnFilter = ({ options, selected, onChange }: ColumnFilterProps) => {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');

  const visibleOptions = useMemo(() => {
    if (!query.trim()) return options;
    const q = query.toLowerCase();
    return options.filter(o => o.toLowerCase().includes(q));
  }, [options, query]);

  const isActive = selected !== undefined && selected.length !== options.length;
  const effective = selected === undefined ? options : selected;

  const toggleValue = (value: string) => {
    const next = effective.includes(value)
      ? effective.filter(v => v !== value)
      : [...effective, value];
    onChange(next.length === options.length ? undefined : next);
  };

  const isChecked = (value: string) => effective.includes(value);

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
            onClick={() => onChange(undefined)}
          >
            Select all
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 text-xs flex-1"
            onClick={() => onChange([])}
          >
            Select none
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
};
