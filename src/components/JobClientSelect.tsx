import { useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';
import { Search, Check } from 'lucide-react';

interface ClientOption {
  id: string;
  company_name: string;
}

interface JobClientSelectProps {
  value: string;
  onChange: (clientId: string) => void;
  id?: string;
}

/** Internal-only, searchable client selector for job postings (never shown on the public site). */
const JobClientSelect = ({ value, onChange, id = 'job-client' }: JobClientSelectProps) => {
  const [clients, setClients] = useState<ClientOption[]>([]);
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from('clients')
        .select('id, company_name')
        .order('company_name', { ascending: true });
      setClients((data || []) as ClientOption[]);
    })();
  }, []);

  useEffect(() => {
    const onDocClick = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, []);

  const selectedName = useMemo(
    () => clients.find((c) => c.id === value)?.company_name || '',
    [clients, value]
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return clients;
    return clients.filter((c) => c.company_name.toLowerCase().includes(q));
  }, [clients, search]);

  return (
    <div className="space-y-2">
      <Label htmlFor={id}>Client (internal only)</Label>
      <div className="relative" ref={wrapRef}>
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input
          id={id}
          className="pl-8 pr-8"
          placeholder="Search or select client..."
          value={open ? search : selectedName}
          onChange={(e) => {
            setSearch(e.target.value);
            setOpen(true);
          }}
          onFocus={() => {
            setOpen(true);
            setSearch('');
          }}
          autoComplete="off"
        />
        {value && !open && (
          <button
            type="button"
            className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground text-xs"
            onClick={() => {
              onChange('');
              setSearch('');
            }}
          >
            ✕
          </button>
        )}
        {open && (
          <div className="absolute z-50 mt-1 w-full rounded-md border bg-popover shadow-md overflow-hidden">
            <ScrollArea className="max-h-[260px] overflow-y-auto">
              <div className="p-1">
                <button
                  type="button"
                  className={cn(
                    'w-full text-left px-3 py-1.5 text-sm rounded-sm hover:bg-accent hover:text-accent-foreground transition-colors',
                    !value && 'bg-accent/50 font-medium'
                  )}
                  onClick={() => {
                    onChange('');
                    setOpen(false);
                    setSearch('');
                  }}
                >
                  No client / internal
                </button>
                {filtered.map((c) => (
                  <button
                    type="button"
                    key={c.id}
                    className={cn(
                      'w-full text-left px-3 py-1.5 text-sm rounded-sm hover:bg-accent hover:text-accent-foreground transition-colors flex items-center gap-2',
                      value === c.id && 'bg-accent/50 font-medium'
                    )}
                    onClick={() => {
                      onChange(c.id);
                      setOpen(false);
                      setSearch('');
                    }}
                  >
                    {value === c.id && <Check className="w-3.5 h-3.5 shrink-0" />}
                    <span className="truncate">{c.company_name}</span>
                  </button>
                ))}
                {filtered.length === 0 && (
                  <p className="px-3 py-2 text-sm text-muted-foreground">No clients found.</p>
                )}
              </div>
            </ScrollArea>
          </div>
        )}
      </div>
      <p className="text-xs text-muted-foreground">
        Who this role is for. Visible to the internal team only — not shown on the public job post.
      </p>
    </div>
  );
};

export default JobClientSelect;
