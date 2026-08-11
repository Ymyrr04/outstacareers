import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';
import { useToast } from '@/hooks/use-toast';
import { Loader2, Search, Send, Users } from 'lucide-react';
import { scoreCandidate, type MatchCandidate, type MatchJob } from '@/lib/jobCandidateMatch';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  jobId: string | null;
  job: MatchJob | null;
}

interface Scored extends MatchCandidate {
  matchScore: number;
  reasons: string[];
}

export default function JobBlastTargetingDialog({ open, onOpenChange, jobId, job }: Props) {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [rows, setRows] = useState<Scored[]>([]);
  const [threshold, setThreshold] = useState(30);
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [touched, setTouched] = useState(false);

  useEffect(() => {
    if (!open || !job) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      const all: any[] = [];
      const pageSize = 1000;
      for (let from = 0; ; from += pageSize) {
        const { data, error } = await supabase
          .from('applicants_prescreen')
          .select(
            'id, full_name, email, job_title, original_job_title, tags, suitable_roles, extracted_skills, extracted_tools, ai_assessment_details, total_score'
          )
          .eq('status', 'Talent Pool')
          .not('email', 'is', null)
          .range(from, from + pageSize - 1);
        if (error) {
          toast({ title: 'Error loading Talent Pool', description: error.message, variant: 'destructive' });
          break;
        }
        all.push(...(data || []));
        if (!data || data.length < pageSize) break;
      }
      if (cancelled) return;
      // Dedupe by email
      const seen = new Set<string>();
      const scored: Scored[] = [];
      for (const c of all) {
        const email = (c.email || '').trim().toLowerCase();
        if (!email || seen.has(email)) continue;
        seen.add(email);
        const { score, reasons } = scoreCandidate(c as MatchCandidate, job);
        scored.push({ ...(c as MatchCandidate), email, matchScore: score, reasons });
      }
      scored.sort((a, b) => b.matchScore - a.matchScore);
      setRows(scored);
      setTouched(false);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [open, job, toast]);

  // Auto-select everyone at/above the threshold until the admin edits selection
  useEffect(() => {
    if (touched) return;
    setSelected(new Set(rows.filter((r) => r.matchScore >= threshold).map((r) => r.id)));
  }, [rows, threshold, touched]);

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter(
      (r) =>
        (r.full_name || '').toLowerCase().includes(q) ||
        (r.email || '').toLowerCase().includes(q) ||
        (r.suitable_roles || []).join(' ').toLowerCase().includes(q) ||
        (r.tags || []).join(' ').toLowerCase().includes(q)
    );
  }, [rows, search]);

  const toggle = (id: string) => {
    setTouched(true);
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const selectAllVisible = () => {
    setTouched(true);
    setSelected((prev) => new Set([...prev, ...visible.map((v) => v.id)]));
  };

  const clearAll = () => {
    setTouched(true);
    setSelected(new Set());
  };

  const send = async () => {
    if (!jobId) return;
    const recipients = rows
      .filter((r) => selected.has(r.id))
      .map((r) => ({ email: r.email as string, fullName: r.full_name }));
    if (recipients.length === 0) {
      toast({ title: 'No recipients selected', variant: 'destructive' });
      return;
    }
    setSending(true);
    const { data, error } = await supabase.functions.invoke('blast-new-job', {
      body: { jobId, recipients },
    });
    setSending(false);
    if (error) {
      toast({ title: 'Blast failed', description: error.message, variant: 'destructive' });
      return;
    }
    toast({
      title: 'Blast queued',
      description: `${data?.queued ?? recipients.length} emails sending in the background (~${data?.estimatedMinutes ?? '?'} min).`,
    });
    onOpenChange(false);
  };

  const matchedCount = rows.filter((r) => r.matchScore >= threshold).length;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[820px] max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Target candidates for “{job?.title}”</DialogTitle>
          <DialogDescription>
            Matched from the Talent Pool using existing data (suitable roles, AI recommended roles, tags,
            skills/tools and previously applied roles). No AI credits used.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-4">
            <div className="flex-1 min-w-[240px]">
              <Label className="text-xs text-muted-foreground">
                Minimum match score: {threshold} ({matchedCount} matched)
              </Label>
              <Slider
                value={[threshold]}
                min={0}
                max={100}
                step={5}
                onValueChange={(v) => {
                  setTouched(false);
                  setThreshold(v[0]);
                }}
                className="mt-2"
              />
            </div>
            <div className="relative w-56">
              <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search name, email, tag"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-8"
              />
            </div>
          </div>

          <div className="flex items-center justify-between text-sm">
            <span className="flex items-center gap-2 text-muted-foreground">
              <Users className="h-4 w-4" />
              {selected.size} selected of {rows.length} in Talent Pool
            </span>
            <div className="flex gap-2">
              <Button type="button" variant="outline" size="sm" onClick={selectAllVisible}>
                Select shown
              </Button>
              <Button type="button" variant="outline" size="sm" onClick={clearAll}>
                Clear
              </Button>
            </div>
          </div>

          <div className="border rounded-md h-[380px] overflow-y-auto divide-y">
            {loading ? (
              <div className="flex items-center justify-center h-full text-muted-foreground">
                <Loader2 className="h-5 w-5 animate-spin mr-2" /> Matching candidates…
              </div>
            ) : visible.length === 0 ? (
              <div className="flex items-center justify-center h-full text-muted-foreground text-sm">
                No candidates found.
              </div>
            ) : (
              visible.map((r) => (
                <label
                  key={r.id}
                  className="flex items-start gap-3 p-3 hover:bg-muted/50 cursor-pointer"
                >
                  <Checkbox checked={selected.has(r.id)} onCheckedChange={() => toggle(r.id)} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-medium truncate">{r.full_name || r.email}</span>
                      <Badge
                        variant={r.matchScore >= 60 ? 'default' : r.matchScore >= 30 ? 'secondary' : 'outline'}
                      >
                        {r.matchScore}% match
                      </Badge>
                    </div>
                    <div className="text-xs text-muted-foreground truncate">{r.email}</div>
                    {r.reasons.length > 0 && (
                      <div className="text-xs text-muted-foreground mt-1 space-y-0.5">
                        {r.reasons.map((reason, i) => (
                          <div key={i} className="truncate">
                            • {reason}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </label>
              ))
            )}
          </div>
        </div>

        <DialogFooter className="mt-2">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Skip blast
          </Button>
          <Button type="button" onClick={send} disabled={sending || selected.size === 0}>
            {sending ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Send className="h-4 w-4 mr-2" />
            )}
            Send to {selected.size}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
