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
          Standing instructions Markbot follows in every conversation, for every admin. Write one per line in plain English.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
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
