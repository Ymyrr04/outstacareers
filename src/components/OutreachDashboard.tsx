import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import {
  Download, ExternalLink, KeyRound, Loader2, RefreshCw, Search, StickyNote, Trash2, Copy, Check,
} from 'lucide-react';

const STATUSES = ['New', 'Contacted', 'Follow-up', 'Replied', 'Converted', 'Not Interested'] as const;

const STATUS_COLORS: Record<string, string> = {
  New: 'bg-sky-500/15 text-sky-600 dark:text-sky-400 border-sky-500/30',
  Contacted: 'bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/30',
  'Follow-up': 'bg-violet-500/15 text-violet-600 dark:text-violet-400 border-violet-500/30',
  Replied: 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/30',
  Converted: 'bg-primary/15 text-primary border-primary/30',
  'Not Interested': 'bg-muted text-muted-foreground border-border',
};

interface Prospect {
  id: string;
  full_name: string;
  headline: string | null;
  current_title: string | null;
  current_company: string | null;
  location: string | null;
  linkedin_url: string | null;
  about: string | null;
  experience: unknown[];
  education: unknown[];
  skills: unknown[];
  photo_url: string | null;
  status: string;
  notes: string | null;
  source: string;
  created_at: string;
}

export function OutreachDashboard() {
  const { toast } = useToast();
  const [prospects, setProspects] = useState<Prospect[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [notesFor, setNotesFor] = useState<Prospect | null>(null);
  const [notesDraft, setNotesDraft] = useState('');
  const [setupOpen, setSetupOpen] = useState(false);
  const [importKey, setImportKey] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [regenerating, setRegenerating] = useState(false);

  const fetchProspects = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('outreach_prospects' as never)
      .select('*')
      .order('created_at', { ascending: false });
    if (error) {
      toast({ title: 'Failed to load prospects', description: error.message, variant: 'destructive' });
    } else {
      setProspects((data || []) as unknown as Prospect[]);
    }
    setLoading(false);
  }, [toast]);

  const fetchImportKey = useCallback(async () => {
    const { data } = await supabase
      .from('outreach_settings' as never)
      .select('value')
      .eq('key', 'import_key')
      .maybeSingle();
    setImportKey((data as { value?: string } | null)?.value ?? null);
  }, []);

  useEffect(() => {
    fetchProspects();
    fetchImportKey();
  }, [fetchProspects, fetchImportKey]);

  const counts = useMemo(() => {
    const c: Record<string, number> = { all: prospects.length };
    for (const s of STATUSES) c[s] = 0;
    prospects.forEach((p) => { c[p.status] = (c[p.status] ?? 0) + 1; });
    return c;
  }, [prospects]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return prospects.filter((p) => {
      if (statusFilter !== 'all' && p.status !== statusFilter) return false;
      if (!q) return true;
      const hay = [
        p.full_name, p.headline, p.current_title, p.current_company,
        p.location, p.about,
        ...(Array.isArray(p.skills) ? p.skills.map(String) : []),
      ].filter(Boolean).join(' ').toLowerCase();
      return hay.includes(q);
    });
  }, [prospects, search, statusFilter]);

  const updateStatus = async (id: string, status: string) => {
    setProspects((prev) => prev.map((p) => (p.id === id ? { ...p, status } : p)));
    const { error } = await supabase
      .from('outreach_prospects' as never)
      .update({ status } as never)
      .eq('id', id);
    if (error) {
      toast({ title: 'Status update failed', description: error.message, variant: 'destructive' });
      fetchProspects();
    }
  };

  const saveNotes = async () => {
    if (!notesFor) return;
    const { error } = await supabase
      .from('outreach_prospects' as never)
      .update({ notes: notesDraft } as never)
      .eq('id', notesFor.id);
    if (error) {
      toast({ title: 'Failed to save notes', description: error.message, variant: 'destructive' });
    } else {
      setProspects((prev) => prev.map((p) => (p.id === notesFor.id ? { ...p, notes: notesDraft } : p)));
      setNotesFor(null);
    }
  };

  const removeProspect = async (id: string, name: string) => {
    if (!window.confirm(`Remove ${name} from outreach?`)) return;
    const { error } = await supabase
      .from('outreach_prospects' as never)
      .delete()
      .eq('id', id);
    if (error) {
      toast({ title: 'Delete failed', description: error.message, variant: 'destructive' });
    } else {
      setProspects((prev) => prev.filter((p) => p.id !== id));
    }
  };

  const downloadExtension = () => {
    fetch('/outreach-extension.zip')
      .then((res) => {
        if (!res.ok) throw new Error(`Download failed: ${res.status}`);
        return res.blob();
      })
      .then((blob) => {
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = 'outreach-extension.zip';
        a.click();
        URL.revokeObjectURL(a.href);
      })
      .catch((err) => toast({ title: 'Download failed', description: err.message, variant: 'destructive' }));
  };

  const copyKey = () => {
    if (!importKey) return;
    navigator.clipboard.writeText(importKey);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const regenerateKey = async () => {
    if (!window.confirm('Regenerate the import key? All extensions using the old key will stop working until updated.')) return;
    setRegenerating(true);
    const newKey = crypto.randomUUID().replace(/-/g, '') + crypto.randomUUID().replace(/-/g, '').slice(0, 16);
    const { error } = await supabase
      .from('outreach_settings' as never)
      .update({ value: newKey, updated_at: new Date().toISOString() } as never)
      .eq('key', 'import_key');
    setRegenerating(false);
    if (error) {
      toast({ title: 'Failed to regenerate key', description: error.message, variant: 'destructive' });
    } else {
      setImportKey(newKey);
      toast({ title: 'Import key regenerated' });
    }
  };

  return (
    <div className="space-y-4">
      {/* Header row */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="relative w-full sm:w-80">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search name, company, skills…"
            className="pl-9"
          />
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={fetchProspects} disabled={loading}>
            <RefreshCw className={`w-4 h-4 mr-1.5 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
          <Button variant="outline" size="sm" onClick={() => setSetupOpen(true)}>
            <KeyRound className="w-4 h-4 mr-1.5" />
            Extension Setup
          </Button>
          <Button size="sm" onClick={downloadExtension}>
            <Download className="w-4 h-4 mr-1.5" />
            Download Extension
          </Button>
        </div>
      </div>

      {/* Status filter chips */}
      <div className="flex flex-wrap gap-2">
        {['all', ...STATUSES].map((s) => (
          <button
            key={s}
            onClick={() => setStatusFilter(s)}
            className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${
              statusFilter === s
                ? 'bg-primary text-primary-foreground border-primary'
                : 'bg-card text-muted-foreground border-border hover:border-primary/40'
            }`}
          >
            {s === 'all' ? 'All' : s} · {counts[s] ?? 0}
          </button>
        ))}
      </div>

      {/* Table */}
      <div className="rounded-lg border bg-card overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Prospect</TableHead>
              <TableHead>Current Role</TableHead>
              <TableHead>Location</TableHead>
              <TableHead>Skills</TableHead>
              <TableHead className="w-[150px]">Status</TableHead>
              <TableHead className="w-[110px] text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center py-12 text-muted-foreground">
                  <Loader2 className="w-5 h-5 animate-spin inline-block mr-2" />
                  Loading prospects…
                </TableCell>
              </TableRow>
            ) : filtered.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center py-12 text-muted-foreground">
                  {prospects.length === 0
                    ? 'No prospects yet. Install the Chrome extension and import a LinkedIn profile.'
                    : 'No prospects match your filters.'}
                </TableCell>
              </TableRow>
            ) : (
              filtered.map((p) => (
                <TableRow key={p.id}>
                  <TableCell>
                    <div className="flex items-center gap-3 min-w-0">
                      {p.photo_url ? (
                        <img src={p.photo_url} alt={p.full_name} className="w-9 h-9 rounded-full object-cover bg-muted shrink-0" loading="lazy" />
                      ) : (
                        <div className="w-9 h-9 rounded-full bg-muted flex items-center justify-center text-xs font-bold text-muted-foreground shrink-0">
                          {p.full_name.split(' ').map((w) => w[0]).slice(0, 2).join('')}
                        </div>
                      )}
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5">
                          <span className="font-medium text-sm truncate max-w-[200px]">{p.full_name}</span>
                          {p.linkedin_url && (
                            <a href={p.linkedin_url} target="_blank" rel="noopener noreferrer" className="text-primary hover:text-primary/80 shrink-0">
                              <ExternalLink className="w-3.5 h-3.5" />
                            </a>
                          )}
                        </div>
                        {p.headline && (
                          <p className="text-xs text-muted-foreground truncate max-w-[240px]">{p.headline}</p>
                        )}
                      </div>
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="text-sm">
                      {p.current_title && <div className="truncate max-w-[200px]">{p.current_title}</div>}
                      {p.current_company && <div className="text-xs text-muted-foreground truncate max-w-[200px]">{p.current_company}</div>}
                    </div>
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">{p.location || '—'}</TableCell>
                  <TableCell>
                    <div className="flex flex-wrap gap-1 max-w-[220px]">
                      {(Array.isArray(p.skills) ? p.skills.slice(0, 3) : []).map((s, i) => (
                        <Badge key={i} variant="outline" className="text-[10px] px-1.5 py-0">{String(s)}</Badge>
                      ))}
                      {Array.isArray(p.skills) && p.skills.length > 3 && (
                        <span className="text-[10px] text-muted-foreground">+{p.skills.length - 3}</span>
                      )}
                    </div>
                  </TableCell>
                  <TableCell>
                    <Select value={p.status} onValueChange={(v) => updateStatus(p.id, v)}>
                      <SelectTrigger className={`h-8 text-xs border ${STATUS_COLORS[p.status] || ''}`}>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {STATUSES.map((s) => (
                          <SelectItem key={s} value={s} className="text-xs">{s}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1">
                      <Button
                        variant="ghost" size="icon" className="h-8 w-8"
                        title={p.notes ? 'View/edit notes' : 'Add notes'}
                        onClick={() => { setNotesFor(p); setNotesDraft(p.notes || ''); }}
                      >
                        <StickyNote className={`w-4 h-4 ${p.notes ? 'text-primary' : 'text-muted-foreground'}`} />
                      </Button>
                      <Button
                        variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-destructive"
                        title="Remove"
                        onClick={() => removeProspect(p.id, p.full_name)}
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {/* Notes dialog */}
      <Dialog open={!!notesFor} onOpenChange={(o) => !o && setNotesFor(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Notes — {notesFor?.full_name}</DialogTitle>
          </DialogHeader>
          {notesFor?.about && (
            <div className="text-xs text-muted-foreground bg-muted/50 rounded-md p-3 max-h-32 overflow-y-auto">
              {notesFor.about}
            </div>
          )}
          <Textarea
            value={notesDraft}
            onChange={(e) => setNotesDraft(e.target.value)}
            rows={6}
            placeholder="Outreach notes…"
          />
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setNotesFor(null)}>Cancel</Button>
            <Button onClick={saveNotes}>Save notes</Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Extension setup dialog */}
      <Dialog open={setupOpen} onOpenChange={setSetupOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Chrome Extension Setup</DialogTitle>
          </DialogHeader>
          <ol className="text-sm space-y-2 list-decimal list-inside text-muted-foreground">
            <li>Click <strong className="text-foreground">Download Extension</strong> and unzip the file.</li>
            <li>Open <code className="text-xs bg-muted px-1 py-0.5 rounded">chrome://extensions</code> in Chrome (or Edge/Brave).</li>
            <li>Enable <strong className="text-foreground">Developer mode</strong> (top-right toggle).</li>
            <li>Click <strong className="text-foreground">Load unpacked</strong> and select the unzipped folder.</li>
            <li>Click the extension's <strong className="text-foreground">Settings (API key)</strong> button and paste the import key below.</li>
            <li>Open any LinkedIn profile and click the extension icon to import.</li>
          </ol>
          <div className="mt-3">
            <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Import key</label>
            <div className="flex gap-2 mt-1">
              <Input readOnly value={importKey || '…'} className="font-mono text-xs" onFocus={(e) => e.target.select()} />
              <Button variant="outline" size="icon" onClick={copyKey} title="Copy key">
                {copied ? <Check className="w-4 h-4 text-emerald-500" /> : <Copy className="w-4 h-4" />}
              </Button>
              <Button variant="outline" size="icon" onClick={regenerateKey} disabled={regenerating} title="Regenerate key">
                <RefreshCw className={`w-4 h-4 ${regenerating ? 'animate-spin' : ''}`} />
              </Button>
            </div>
            <p className="text-xs text-muted-foreground mt-2">
              Share this key with anyone who should import profiles. Regenerating invalidates the old key.
            </p>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
