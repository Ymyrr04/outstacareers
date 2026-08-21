import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Link2, X } from 'lucide-react';
import { PipelineLink, pipelineLinkStyle } from '@/lib/calendarTime';

interface Option extends PipelineLink {}

export const PipelineLinkSelect = ({
  value,
  onChange,
}: {
  value: PipelineLink | null;
  onChange: (v: PipelineLink | null) => void;
}) => {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [options, setOptions] = useState<Option[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open || options.length) return;
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      const [applicants, clients, jobs] = await Promise.all([
        supabase
          .from('applicants_prescreen')
          .select('id, full_name')
          .order('created_at', { ascending: false })
          .limit(500),
        supabase.from('clients').select('id, company_name').order('company_name').limit(500),
        supabase.from('jobs').select('id, title').order('created_at', { ascending: false }).limit(500),
      ]);
      if (cancelled) return;
      const opts: Option[] = [
        ...((applicants.data || []) as { id: string; full_name: string | null }[])
          .filter((a) => a.full_name)
          .map((a) => ({ type: 'applicant' as const, id: a.id, name: a.full_name as string })),
        ...((clients.data || []) as { id: string; company_name: string | null }[])
          .filter((c) => c.company_name)
          .map((c) => ({ type: 'client' as const, id: c.id, name: c.company_name as string })),
        ...((jobs.data || []) as { id: string; title: string | null }[])
          .filter((j) => j.title)
          .map((j) => ({ type: 'job' as const, id: j.id, name: j.title as string })),
      ];
      setOptions(opts);
      setLoading(false);
    };
    load();
    return () => {
      cancelled = true;
    };
  }, [open, options.length]);

  const groups = useMemo(() => {
    const q = query.trim().toLowerCase();
    const match = (o: Option) => !q || o.name.toLowerCase().includes(q);
    return [
      { key: 'applicant', label: 'Applicants', items: options.filter((o) => o.type === 'applicant' && match(o)).slice(0, 40) },
      { key: 'client', label: 'Clients', items: options.filter((o) => o.type === 'client' && match(o)).slice(0, 40) },
      { key: 'job', label: 'Jobs', items: options.filter((o) => o.type === 'job' && match(o)).slice(0, 40) },
    ];
  }, [options, query]);

  const style = value ? pipelineLinkStyle(value.type) : null;

  return (
    <div className="flex items-center gap-2">
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button variant="outline" size="sm" className="h-9 flex-1 justify-start font-normal">
            <Link2 className="h-3.5 w-3.5 mr-2 shrink-0" />
            {value ? (
              <span className="truncate" style={{ color: style?.text }}>
                {value.name}
              </span>
            ) : (
              <span className="text-muted-foreground">Link to pipeline (optional)</span>
            )}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-[320px] p-2" align="start">
          <Input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search applicants, clients, jobs…"
            className="h-8 text-sm mb-2"
          />
          <ScrollArea className="h-64 pr-2">
            {loading && <p className="text-xs text-muted-foreground p-2">Loading…</p>}
            {!loading &&
              groups.map((g) =>
                g.items.length ? (
                  <div key={g.key} className="mb-2">
                    <p className="px-2 py-1 text-[11px] uppercase tracking-wide text-muted-foreground">{g.label}</p>
                    {g.items.map((o) => (
                      <button
                        key={`${o.type}-${o.id}`}
                        type="button"
                        onClick={() => {
                          onChange(o);
                          setOpen(false);
                        }}
                        className="block w-full truncate rounded px-2 py-1.5 text-left text-sm hover:bg-muted"
                      >
                        {o.name}
                      </button>
                    ))}
                  </div>
                ) : null
              )}
            {!loading && groups.every((g) => !g.items.length) && (
              <p className="text-xs text-muted-foreground p-2">No matches.</p>
            )}
          </ScrollArea>
        </PopoverContent>
      </Popover>
      {value && (
        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => onChange(null)} title="Clear link">
          <X className="h-3.5 w-3.5" />
        </Button>
      )}
    </div>
  );
};

export default PipelineLinkSelect;
