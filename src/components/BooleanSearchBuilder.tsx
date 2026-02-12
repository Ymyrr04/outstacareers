import { useState, useCallback } from 'react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Plus, X, Search, Trash2 } from 'lucide-react';

type Operator = 'AND' | 'OR' | 'NOT';

interface SearchRow {
  id: string;
  operator: Operator;
  term: string;
}

interface BooleanSearchBuilderProps {
  onSearch: (query: string) => void;
  placeholder?: string;
}

let rowIdCounter = 0;
const nextId = () => `row-${++rowIdCounter}`;

export const BooleanSearchBuilder = ({ onSearch, placeholder }: BooleanSearchBuilderProps) => {
  const [rows, setRows] = useState<SearchRow[]>([
    { id: nextId(), operator: 'AND', term: '' },
  ]);
  const [simpleMode, setSimpleMode] = useState(true);
  const [simpleTerm, setSimpleTerm] = useState('');

  const addRow = useCallback(() => {
    setRows(prev => [...prev, { id: nextId(), operator: 'AND', term: '' }]);
  }, []);

  const removeRow = useCallback((id: string) => {
    setRows(prev => prev.length > 1 ? prev.filter(r => r.id !== id) : prev);
  }, []);

  const updateRow = useCallback((id: string, updates: Partial<SearchRow>) => {
    setRows(prev => prev.map(r => r.id === id ? { ...r, ...updates } : r));
  }, []);

  const buildQuery = useCallback(() => {
    const validRows = rows.filter(r => r.term.trim());
    if (validRows.length === 0) return '';

    return validRows
      .map((row, i) => {
        const term = row.term.includes(' ') ? `"${row.term}"` : row.term;
        if (i === 0) {
          return row.operator === 'NOT' ? `NOT ${term}` : term;
        }
        return `${row.operator} ${term}`;
      })
      .join(' ');
  }, [rows]);

  const handleSearch = useCallback(() => {
    if (simpleMode) {
      onSearch(simpleTerm.trim());
    } else {
      onSearch(buildQuery());
    }
  }, [simpleMode, simpleTerm, buildQuery, onSearch]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleSearch();
    }
  }, [handleSearch]);

  const clearAll = useCallback(() => {
    if (simpleMode) {
      setSimpleTerm('');
      onSearch('');
    } else {
      setRows([{ id: nextId(), operator: 'AND', term: '' }]);
      onSearch('');
    }
  }, [simpleMode, onSearch]);

  const currentQuery = simpleMode ? simpleTerm.trim() : buildQuery();

  return (
    <div className="space-y-3">
      {/* Mode toggle */}
      <div className="flex items-center gap-2">
        <Button
          variant={simpleMode ? 'default' : 'outline'}
          size="sm"
          className="h-7 text-xs"
          onClick={() => { setSimpleMode(true); onSearch(''); }}
        >
          Simple
        </Button>
        <Button
          variant={!simpleMode ? 'default' : 'outline'}
          size="sm"
          className="h-7 text-xs"
          onClick={() => { setSimpleMode(false); onSearch(''); }}
        >
          Advanced (Boolean)
        </Button>
      </div>

      {simpleMode ? (
        /* Simple search mode */
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder={placeholder || "Search by name, email, job title, skills..."}
              value={simpleTerm}
              onChange={(e) => setSimpleTerm(e.target.value)}
              onKeyDown={handleKeyDown}
              className="pl-10"
            />
          </div>
          <Button variant="outline" onClick={handleSearch}>
            <Search className="w-4 h-4 mr-2" />
            Search
          </Button>
          {simpleTerm && (
            <Button variant="ghost" size="icon" onClick={clearAll}>
              <X className="w-4 h-4" />
            </Button>
          )}
        </div>
      ) : (
        /* Advanced Boolean builder */
        <div className="space-y-2">
          {rows.map((row, index) => (
            <div key={row.id} className="flex items-center gap-2">
              {/* Operator selector (hidden for first row unless NOT) */}
              {index === 0 ? (
                <div className="w-[100px] flex-shrink-0">
                  <Select
                    value={row.operator === 'NOT' ? 'NOT' : 'CONTAINS'}
                    onValueChange={(v) => updateRow(row.id, { operator: v === 'NOT' ? 'NOT' : 'AND' })}
                  >
                    <SelectTrigger className="h-9 text-xs bg-background">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="bg-popover z-50">
                      <SelectItem value="CONTAINS">Contains</SelectItem>
                      <SelectItem value="NOT">NOT</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              ) : (
                <div className="w-[100px] flex-shrink-0">
                  <Select
                    value={row.operator}
                    onValueChange={(v) => updateRow(row.id, { operator: v as Operator })}
                  >
                    <SelectTrigger className="h-9 text-xs bg-background">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="bg-popover z-50">
                      <SelectItem value="AND">AND</SelectItem>
                      <SelectItem value="OR">OR</SelectItem>
                      <SelectItem value="NOT">NOT</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              )}

              {/* Term input */}
              <Input
                placeholder={`Enter search term...`}
                value={row.term}
                onChange={(e) => updateRow(row.id, { term: e.target.value })}
                onKeyDown={handleKeyDown}
                className="h-9 flex-1"
              />

              {/* Remove row */}
              {rows.length > 1 && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-9 w-9 flex-shrink-0 text-muted-foreground hover:text-destructive"
                  onClick={() => removeRow(row.id)}
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </Button>
              )}
            </div>
          ))}

          {/* Add row + Search actions */}
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              className="h-8 text-xs"
              onClick={addRow}
            >
              <Plus className="w-3.5 h-3.5 mr-1" />
              Add condition
            </Button>

            <div className="flex-1" />

            {currentQuery && (
              <Button variant="ghost" size="sm" className="h-8 text-xs" onClick={clearAll}>
                <X className="w-3.5 h-3.5 mr-1" />
                Clear
              </Button>
            )}

            <Button size="sm" className="h-8" onClick={handleSearch}>
              <Search className="w-3.5 h-3.5 mr-1" />
              Search
            </Button>
          </div>

          {/* Preview of generated query */}
          {currentQuery && (
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <span>Query:</span>
              <Badge variant="outline" className="font-mono text-xs">
                {currentQuery}
              </Badge>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
