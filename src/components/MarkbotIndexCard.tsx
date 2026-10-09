import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { useToast } from '@/hooks/use-toast';
import { formatDateTime } from '@/lib/dateFormat';
import { Loader2 } from 'lucide-react';

type Stats = {
  pending: number;
  failed: number;
  last_processed_at: string | null;
  chunks: Record<string, number>;
};

const SOURCE_LABELS: Record<string, string> = {
  cv: 'CVs',
  applicant_note: 'Applicant notes',
  additional_profile: 'Additional profiles',
  interview_answer: 'Interview answers',
  hiring_comment: 'Hiring request comments',
  calendar_comment: 'Calendar comments',
};

const GROUPS = [
  { key: 'cvs', label: 'Index all CVs' },
  { key: 'notes', label: 'Index all notes and profiles' },
  { key: 'comments', label: 'Index all comments and interview answers' },
];

async function call(body: Record<string, unknown>) {
  const { data, error } = await supabase.functions.invoke('enqueue-knowledge-backfill', { body });
  if (error) {
    let msg = error.message;
    try { const j = await (error as any).context?.json?.(); if (j?.error) msg = j.error; } catch { /* ignore */ }
    throw new Error(msg);
  }
  if (data?.error) throw new Error(data.error);
  return data;
}

export function MarkbotIndexCard() {
  const { toast } = useToast();
  const [stats, setStats] = useState<Stats | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<{ group: string; count: number } | null>(null);

  const refresh = useCallback(async () => {
    try {
      setStats(await call({ action: 'stats' }));
    } catch (e) {
      toast({ title: 'Could not load Markbot index status', description: (e as Error).message, variant: 'destructive' });
    }
  }, [toast]);

  useEffect(() => {
    refresh();
    const t = setInterval(refresh, 10_000);
    return () => clearInterval(t);
  }, [refresh]);

  const startGroup = async (group: string) => {
    setBusy(group);
    try {
      const { count } = await call({ action: 'count', group });
      setConfirm({ group, count });
    } catch (e) {
      toast({ title: 'Could not count items', description: (e as Error).message, variant: 'destructive' });
    } finally {
      setBusy(null);
    }
  };

  const runGroup = async () => {
    if (!confirm) return;
    const { group } = confirm;
    setConfirm(null);
    setBusy(group);
    try {
      const r = await call({ action: 'enqueue', group });
      toast({
        title: 'Queued for indexing',
        description: `${r.queued.toLocaleString()} queued${r.already_pending ? `, ${r.already_pending.toLocaleString()} already waiting` : ''}.`,
      });
      refresh();
    } catch (e) {
      toast({ title: 'Could not queue items', description: (e as Error).message, variant: 'destructive' });
    } finally {
      setBusy(null);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Markbot index</CardTitle>
        <CardDescription>What the knowledge assistant can search, and what is still waiting.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {!stats ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="w-4 h-4 animate-spin" /> Loading…
          </div>
        ) : (
          <>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-sm">
              <div className="rounded-md border p-3">
                <div className="text-muted-foreground">Pending</div>
                <div className="text-xl font-semibold">{stats.pending.toLocaleString()}</div>
              </div>
              <div className="rounded-md border p-3">
                <div className="text-muted-foreground">Failed</div>
                <div className={`text-xl font-semibold ${stats.failed ? 'text-destructive' : ''}`}>{stats.failed.toLocaleString()}</div>
              </div>
              <div className="rounded-md border p-3 col-span-2 sm:col-span-1">
                <div className="text-muted-foreground">Last processed</div>
                <div className="font-medium">{stats.last_processed_at ? formatDateTime(stats.last_processed_at) : 'Never'}</div>
              </div>
            </div>
            <div>
              <div className="text-sm font-medium mb-2">Chunks indexed</div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1 text-sm">
                {Object.entries(SOURCE_LABELS).map(([k, label]) => (
                  <div key={k} className="flex justify-between border-b border-border/50 py-1">
                    <span className="text-muted-foreground">{label}</span>
                    <span className="font-medium tabular-nums">{(stats.chunks[k] ?? 0).toLocaleString()}</span>
                  </div>
                ))}
              </div>
            </div>
          </>
        )}
        <div className="flex flex-wrap gap-2">
          {GROUPS.map((g) => (
            <Button key={g.key} variant="outline" size="sm" disabled={!!busy} onClick={() => startGroup(g.key)}>
              {busy === g.key && <Loader2 className="w-4 h-4 mr-1 animate-spin" />}
              {g.label}
            </Button>
          ))}
        </div>
      </CardContent>

      <AlertDialog open={!!confirm} onOpenChange={(o) => !o && setConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Queue for indexing</AlertDialogTitle>
            <AlertDialogDescription>
              This queues {confirm?.count.toLocaleString()} items for indexing. Continue?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={runGroup}>Continue</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}
