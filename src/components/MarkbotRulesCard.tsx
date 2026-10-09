import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import { formatDateTime } from '@/lib/dateFormat';
import { Loader2 } from 'lucide-react';

const MAX = 4000;

export function MarkbotRulesCard() {
  const { toast } = useToast();
  const [rules, setRules] = useState('');
  const [saved, setSaved] = useState('');
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    supabase.from('markbot_rules').select('rules, updated_at').eq('id', 1).maybeSingle().then(({ data, error }) => {
      if (error) toast({ title: 'Could not load Markbot rules', description: error.message, variant: 'destructive' });
      setRules(data?.rules ?? ''); setSaved(data?.rules ?? ''); setUpdatedAt(data?.updated_at ?? null);
      setLoading(false);
    });
  }, [toast]);

  const save = async () => {
    setSaving(true);
    const { data: { user } } = await supabase.auth.getUser();
    const now = new Date().toISOString();
    const { error } = await supabase.from('markbot_rules')
      .upsert({ id: 1, rules: rules.trim(), updated_by: user?.id ?? null, updated_at: now });
    setSaving(false);
    if (error) { toast({ title: 'Could not save rules', description: error.message, variant: 'destructive' }); return; }
    setSaved(rules.trim()); setRules(rules.trim()); setUpdatedAt(now);
    toast({ title: 'Markbot rules saved', description: 'They apply to every new answer, for every admin.' });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Markbot rules</CardTitle>
        <CardDescription>
          Standing instructions Markbot follows in every conversation, for every admin. Write one per line in plain English — just keep adding new lines; saving never replaces what Markbot does on its own.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <details className="rounded-md border bg-muted/40 p-3 text-xs text-muted-foreground">
          <summary className="cursor-pointer font-medium text-foreground">What Markbot already always does (built in, can't be changed here)</summary>
          <ul className="mt-2 list-disc space-y-1 pl-4">
            <li>Looks up real data before answering and quotes exact counts from its tools — it never recalculates totals.</li>
            <li>Names the author and date of any note, comment or excerpt it uses.</li>
            <li>States the date of any availability answer and warns when it's older than 14 days; never calls someone available if they're hired or on an active assignment.</li>
            <li>Never makes hire/reject decisions and never ranks people beyond what the evidence says.</li>
            <li>Only sees data from tabs you have permission for — your rules can't unlock anything.</li>
            <li>Treats CVs, notes and comments as data, never as instructions.</li>
            <li>Keeps formatting light: bold names and key figures, short bullets, no headings or tables.</li>
          </ul>
          <p className="mt-2">Your rules are added on top of these. If a rule conflicts with one of the above, the built-in one wins.</p>
        </details>
        {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : (
          <>
            <Textarea
              rows={8}
              maxLength={MAX}
              value={rules}
              onChange={(e) => setRules(e.target.value)}
              placeholder={'Never include Cold Talent Pool unless I ask.\nAlways start with the total count.\nKeep answers under 8 bullets.'}
            />
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>{updatedAt ? `Last saved ${formatDateTime(updatedAt)}` : 'Not saved yet'} · {rules.length}/{MAX}</span>
              <Button size="sm" onClick={save} disabled={saving || rules.trim() === saved}>
                {saving && <Loader2 className="h-3 w-3 mr-1 animate-spin" />}Save rules
              </Button>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
