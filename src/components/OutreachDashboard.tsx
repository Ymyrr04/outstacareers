import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
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
  Building2, Globe, ArrowRightCircle, Pencil,
} from 'lucide-react';

const STATUSES = ['New', 'Contacted', 'Follow-up', 'Replied', 'Meeting Booked', 'Converted', 'Not Interested'] as const;

const STATUS_COLORS: Record<string, string> = {
  New: 'bg-sky-500/15 text-sky-600 dark:text-sky-400 border-sky-500/30',
  Contacted: 'bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/30',
  'Follow-up': 'bg-violet-500/15 text-violet-600 dark:text-violet-400 border-violet-500/30',
  Replied: 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/30',
  'Meeting Booked': 'bg-teal-500/15 text-teal-600 dark:text-teal-400 border-teal-500/30',
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
  website: string | null;
  industry: string | null;
  about: string | null;
  experience: unknown[];
  education: unknown[];
  skills: unknown[];
  photo_url: string | null;
  status: string;
  notes: string | null;
  source: string;
  converted_lead_id: string | null;
  created_at: string;
}

export function OutreachDashboard() {
  const { toast } = useToast();
  const [prospects, setProspects] = useState<Prospect[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [editFor, setEditFor] = useState<Prospect | null>(null);
  const [editDraft, setEditDraft] = useState({ company: '', industry: '', website: '', notes: '' });
  const [setupOpen, setSetupOpen] = useState(false);
  const [importKey, setImportKey] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [regenerating, setRegenerating] = useState(false);
  const [converting, setConverting] = useState<string | null>(null);

  const fetchProspects = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('outreach_prospects')
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
      .from('outreach_settings')
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
        p.location, p.about, p.industry, p.website,
      ].filter(Boolean).join(' ').toLowerCase();
      return hay.includes(q);
    });
  }, [prospects, search, statusFilter]);

  const updateStatus = async (id: string, status: string) => {
    setProspects((prev) => prev.map((p) => (p.id === id ? { ...p, status } : p)));
    const { error } = await supabase
      .from('outreach_prospects')
      .update({ status })
      .eq('id', id);
    if (error) {
      toast({ title: 'Status update failed', description: error.message, variant: 'destructive' });
      fetchProspects();
    }
  };

  const openEdit = (p: Prospect) => {
    setEditFor(p);
    setEditDraft({
      company: p.current_company || '',
      industry: p.industry || '',
      website: p.website || '',
      notes: p.notes || '',
    });
  };

  const saveEdit = async () => {
    if (!editFor) return;
    const updates = {
      current_company: editDraft.company.trim() || null,
      industry: editDraft.industry.trim() || null,
      website: editDraft.website.trim() || null,
      notes: editDraft.notes,
    };
    const { error } = await supabase
      .from('outreach_prospects')
      .update(updates)
      .eq('id', editFor.id);
    if (error) {
      toast({ title: 'Failed to save', description: error.message, variant: 'destructive' });
    } else {
      setProspects((prev) => prev.map((p) => (p.id === editFor.id ? { ...p, ...updates } : p)));
      setEditFor(null);
    }
  };

  const convertToLead = async (p: Prospect) => {
    if (p.converted_lead_id) return;
    const company = p.current_company?.trim() || p.full_name;
    if (!window.confirm(`Add ${company} to the Sales Pipeline as a new lead?`)) return;
    setConverting(p.id);
    const { data: { user } } = await supabase.auth.getUser();
    const { data: lead, error } = await supabase
      .from('sales_leads')
      .insert({
        company_name: company,
        contact_name: p.full_name,
        role_title: p.current_title,
        industry: p.industry,
        original_message: p.linkedin_url ? `LinkedIn: ${p.linkedin_url}` : null,
        source: 'linkedin-outreach',
        stage: 'OutSta Lead',
        temperature: 'cold',
        estimated_hires: 0,
        likelihood_to_close: 0,
        hiring_type: [],
        created_by: user?.id ?? null,
      })
      .select('id')
      .single();
    if (error || !lead) {
      setConverting(null);
      toast({ title: 'Failed to create sales lead', description: error?.message, variant: 'destructive' });
      return;
    }
    const { error: linkError } = await supabase
      .from('outreach_prospects')
      .update({ converted_lead_id: lead.id, status: 'Converted' })
      .eq('id', p.id);
    setConverting(null);
    if (linkError) {
      toast({ title: 'Lead created but link failed', description: linkError.message, variant: 'destructive' });
    } else {
      setProspects((prev) => prev.map((x) => (x.id === p.id ? { ...x, converted_lead_id: lead.id, status: 'Converted' } : x)));
      toast({ title: 'Added to Sales Pipeline', description: `${company} is now an OutSta Lead.` });
    }
  };

  const removeProspect = async (id: string, name: string) => {
    if (!window.confirm(`Remove ${name} from outreach?`)) return;
    const { error } = await supabase
      .from('outreach_prospects')
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
      .from('outreach_settings')
      .update({ value: newKey, updated_at: new Date().toISOString() })
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
            placeholder="Search company, contact, industry…"
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
              <TableHead>Target Company</TableHead>
              <TableHead>Decision Maker</TableHead>
              <TableHead>Industry</TableHead>
              <TableHead>Location</TableHead>
              <TableHead className="w-[150px]">Status</TableHead>
              <TableHead className="w-[140px] text-right">Actions</TableHead>
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
                    ? 'No prospects yet. Install the Chrome extension and import a LinkedIn profile of a potential client.'
                    : 'No prospects match your filters.'}
                </TableCell>
              </TableRow>
            ) : (
              filtered.map((p) => (
                <TableRow key={p.id}>
                  <TableCell>
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5">
                        <Building2 className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                        <span className="font-medium text-sm truncate max-w-[200px]">
                          {p.current_company || '—'}
                        </span>
                        {p.website && (
                          <a href={p.website} target="_blank" rel="noopener noreferrer" className="text-primary hover:text-primary/80 shrink-0" title="Website">
                            <Globe className="w-3.5 h-3.5" />
                          </a>
                        )}
                      </div>
                      {p.headline && (
                        <p className="text-xs text-muted-foreground truncate max-w-[240px] mt-0.5">{p.headline}</p>
                      )}
                    </div>
                  </TableCell>
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
                          <span className="font-medium text-sm truncate max-w-[180px]">{p.full_name}</span>
                          {p.linkedin_url && (
                            <a href={p.linkedin_url} target="_blank" rel="noopener noreferrer" className="text-primary hover:text-primary/80 shrink-0" title="LinkedIn profile">
                              <ExternalLink className="w-3.5 h-3.5" />
                            </a>
                          )}
                        </div>
                        {p.current_title && (
                          <p className="text-xs text-muted-foreground truncate max-w-[200px]">{p.current_title}</p>
                        )}
                      </div>
                    </div>
                  </TableCell>
                  <TableCell>
                    {p.industry ? <Badge variant="outline" className="text-[10px] px-1.5 py-0">{p.industry}</Badge> : <span className="text-muted-foreground text-sm">—</span>}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">{p.location || '—'}</TableCell>
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
                        title={p.converted_lead_id ? 'Already in Sales Pipeline' : 'Convert to Sales Lead'}
                        disabled={!!p.converted_lead_id || converting === p.id}
                        onClick={() => convertToLead(p)}
                      >
                        {converting === p.id
                          ? <Loader2 className="w-4 h-4 animate-spin" />
                          : <ArrowRightCircle className={`w-4 h-4 ${p.converted_lead_id ? 'text-primary' : 'text-muted-foreground'}`} />}
                      </Button>
                      <Button
                        variant="ghost" size="icon" className="h-8 w-8"
                        title="Edit details & notes"
                        onClick={() => openEdit(p)}
                      >
                        {p.notes
                          ? <StickyNote className="w-4 h-4 text-primary" />
                          : <Pencil className="w-4 h-4 text-muted-foreground" />}
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

      {/* Details & notes dialog */}
      <Dialog open={!!editFor} onOpenChange={(o) => !o && setEditFor(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Prospect — {editFor?.full_name}</DialogTitle>
          </DialogHeader>
          {editFor?.about && (
            <div className="text-xs text-muted-foreground bg-muted/50 rounded-md p-3 max-h-32 overflow-y-auto">
              {editFor.about}
            </div>
          )}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="outreach-company" className="text-xs">Company</Label>
              <Input
                id="outreach-company"
                value={editDraft.company}
                onChange={(e) => setEditDraft((d) => ({ ...d, company: e.target.value }))}
                placeholder="Target company"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="outreach-industry" className="text-xs">Industry</Label>
              <Input
                id="outreach-industry"
                value={editDraft.industry}
                onChange={(e) => setEditDraft((d) => ({ ...d, industry: e.target.value }))}
                placeholder="e.g. Healthcare, SaaS"
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="outreach-website" className="text-xs">Website</Label>
            <Input
              id="outreach-website"
              value={editDraft.website}
              onChange={(e) => setEditDraft((d) => ({ ...d, website: e.target.value }))}
              placeholder="https://…"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="outreach-notes" className="text-xs">Outreach notes</Label>
            <Textarea
              id="outreach-notes"
              value={editDraft.notes}
              onChange={(e) => setEditDraft((d) => ({ ...d, notes: e.target.value }))}
              rows={5}
              placeholder="Contact attempts, pain points, next steps…"
            />
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setEditFor(null)}>Cancel</Button>
            <Button onClick={saveEdit}>Save</Button>
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
            <li>Open a LinkedIn profile of a potential client and click the extension icon to import.</li>
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
