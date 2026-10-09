import React, { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

const DOC_TYPES = ['COE', 'Copy of contract', 'Pay Deposit Certificate'];

interface Option { id: string; name: string; company: string; status: string }

interface Props {
  onCancel: () => void;
  onCreated: (id: string) => void;
}

export const NewLegalDocForm: React.FC<Props> = ({ onCancel, onCreated }) => {
  const { toast } = useToast();
  const [options, setOptions] = useState<Option[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<Option | null>(null);
  const [types, setTypes] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    (async () => {
      const { data, error } = await supabase
        .from('contractor_assignments')
        .select('id, status, applicants_prescreen ( full_name ), clients ( company_name )')
        .limit(1000);
      if (error) console.error('Load contractors failed', error);
      const list = ((data || []) as any[]).map((r) => ({
        id: r.id,
        name: r.applicants_prescreen?.full_name || 'Unknown',
        company: r.clients?.company_name || '',
        status: r.status || '',
      }));
      list.sort((a, b) => {
        const aa = a.status === 'active' ? 0 : 1;
        const bb = b.status === 'active' ? 0 : 1;
        return aa - bb || a.name.localeCompare(b.name);
      });
      setOptions(list);
      setLoading(false);
    })();
  }, []);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (q ? options.filter((o) => `${o.name} ${o.company}`.toLowerCase().includes(q)) : options).slice(0, 50);
  }, [options, search]);

  const create = async () => {
    if (!selected || !types.length) return;
    setSaving(true);
    const { data, error } = await supabase
      .from('contractor_legal_doc_requests' as any)
      .insert({
        contractor_assignment_id: selected.id,
        doc_types: types,
        reason: 'Created by admin',
        status: 'In Progress',
      })
      .select('id')
      .single();
    setSaving(false);
    if (error) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
      return;
    }
    toast({ title: `Created for ${selected.name}`, description: 'Generate and review the documents, then send.' });
    onCreated((data as any).id);
  };

  return (
    <div className="space-y-3 border rounded-md p-3 bg-muted/30">
      <div className="space-y-1">
        <Label className="text-xs">Contractor</Label>
        {selected ? (
          <div className="flex items-center justify-between text-sm border rounded-md px-3 py-2 bg-background">
            <span>{selected.name}{selected.company && <span className="text-muted-foreground text-xs"> · {selected.company}</span>}</span>
            <button className="text-xs text-muted-foreground hover:text-foreground" onClick={() => setSelected(null)}>Change</button>
          </div>
        ) : (
          <>
            <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search contractor name or client..." className="h-8 text-xs" />
            <div className="max-h-40 overflow-y-auto border rounded-md bg-background">
              {loading ? (
                <div className="flex justify-center py-3"><Loader2 className="w-4 h-4 animate-spin" /></div>
              ) : filtered.length === 0 ? (
                <p className="text-xs text-muted-foreground p-2">No contractors found.</p>
              ) : filtered.map((o) => (
                <button key={o.id} onClick={() => setSelected(o)} className={cn('w-full text-left px-3 py-1.5 text-xs hover:bg-muted flex justify-between gap-2')}>
                  <span>{o.name} <span className="text-muted-foreground">{o.company}</span></span>
                  <span className="text-[10px] text-muted-foreground capitalize">{o.status}</span>
                </button>
              ))}
            </div>
          </>
        )}
      </div>

      <div className="space-y-1">
        <Label className="text-xs">Documents</Label>
        <div className="flex flex-wrap gap-4">
          {DOC_TYPES.map((t) => (
            <label key={t} className="flex items-center gap-2 text-xs cursor-pointer">
              <Checkbox checked={types.includes(t)} onCheckedChange={(c) => setTypes((p) => (c === true ? [...p, t] : p.filter((x) => x !== t)))} />
              {t}
            </label>
          ))}
        </div>
      </div>

      <div className="flex justify-end gap-2">
        <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={onCancel}>Cancel</Button>
        <Button size="sm" className="h-7 text-xs" disabled={!selected || !types.length || saving} onClick={create}>
          {saving && <Loader2 className="w-3 h-3 mr-1 animate-spin" />}
          Create
        </Button>
      </div>
    </div>
  );
};
