import { useEffect, useMemo, useState } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { ArrowLeft, GripVertical, Save, RotateCcw } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { useStageSettings, STAGE_QUERY_KEY } from '@/hooks/useStageSettings';
import { supabase } from '@/integrations/supabase/client';
import { useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card } from '@/components/ui/card';
import { toast } from 'sonner';

// Canonical superset of pipeline stages used across admin.
const ALL_STAGES = [
  'For Review',
  'Qualified',
  'For Interview',
  'SIV',
  'Pitch',
  'Client Interview',
  'Hired',
  'Bench',
  'Reject',
  'Talent Pool',
  'Cold Talent Pool',
  'Archive',
  'Archived',
] as const;

const DEFAULT_COLORS: Record<string, string> = {
  'For Review': '#3b82f6',
  'Qualified': '#0891b2',
  'For Interview': '#6366f1',
  'SIV': '#8b5cf6',
  'Pitch': '#d946ef',
  'Client Interview': '#a855f7',
  'Hired': '#10b981',
  'Bench': '#f59e0b',
  'Reject': '#ef4444',
  'Talent Pool': '#14b8a6',
  'Cold Talent Pool': '#0ea5e9',
  'Archive': '#6b7280',
  'Archived': '#6b7280',
};


const DEFAULT_DISPLAY: Record<string, string> = {
  'Talent Pool': 'Bench',
  'Bench': 'Talent Pipeline',
};

interface Row {
  stage_key: string;
  display_name: string;
  color: string;
  sort_order: number;
}

export default function StageSettings() {
  const { isSuperAdmin, loading } = useAuth();
  const { settings, isLoading } = useStageSettings();
  const qc = useQueryClient();
  const [rows, setRows] = useState<Row[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (isLoading) return;
    const map = new Map(settings.map((s) => [s.stage_key, s]));
    const initial: Row[] = ALL_STAGES.map((key, i) => {
      const s = map.get(key);
      return {
        stage_key: key,
        display_name: s?.display_name ?? DEFAULT_DISPLAY[key] ?? key,
        color: s?.color ?? DEFAULT_COLORS[key] ?? '#64748b',
        sort_order: s?.sort_order ?? i + 1,
      };
    }).sort((a, b) => a.sort_order - b.sort_order);
    setRows(initial);
  }, [settings, isLoading]);

  const move = (index: number, dir: -1 | 1) => {
    setRows((prev) => {
      const next = [...prev];
      const j = index + dir;
      if (j < 0 || j >= next.length) return prev;
      [next[index], next[j]] = [next[j], next[index]];
      return next.map((r, i) => ({ ...r, sort_order: i + 1 }));
    });
  };

  const update = (i: number, patch: Partial<Row>) =>
    setRows((prev) => prev.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));

  const resetToDefaults = () => {
    setRows(
      ALL_STAGES.map((key, i) => ({
        stage_key: key,
        display_name: DEFAULT_DISPLAY[key] ?? key,
        color: DEFAULT_COLORS[key] ?? '#64748b',
        sort_order: i + 1,
      })),
    );
  };

  const save = async () => {
    setSaving(true);
    try {
      const payload = rows.map((r) => ({
        stage_key: r.stage_key,
        display_name: r.display_name,
        color: r.color,
        sort_order: r.sort_order,
      }));
      const { error } = await supabase
        .from('stage_settings' as any)
        .upsert(payload, { onConflict: 'stage_key' });
      if (error) throw error;
      await qc.invalidateQueries({ queryKey: STAGE_QUERY_KEY });
      toast.success('Stage settings saved');
    } catch (e: any) {
      toast.error(e?.message ?? 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <div className="p-8">Loading…</div>;
  if (!isSuperAdmin) return <Navigate to="/admin" replace />;

  return (
    <div className="min-h-screen bg-background p-6">
      <div className="mx-auto max-w-4xl">
        <div className="mb-6 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="sm" asChild>
              <Link to="/admin"><ArrowLeft className="h-4 w-4 mr-1" /> Back</Link>
            </Button>
            <div>
              <h1 className="text-2xl font-bold">Stage Settings</h1>
              <p className="text-sm text-muted-foreground">Rename, recolor, and reorder pipeline stages. Applies everywhere.</p>
            </div>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={resetToDefaults}>
              <RotateCcw className="h-4 w-4 mr-1" /> Reset
            </Button>
            <Button size="sm" onClick={save} disabled={saving}>
              <Save className="h-4 w-4 mr-1" /> {saving ? 'Saving…' : 'Save changes'}
            </Button>
          </div>
        </div>

        <Card className="divide-y">
          {rows.map((row, i) => (
            <div key={row.stage_key} className="flex items-center gap-3 p-3">
              <div className="flex flex-col">
                <button
                  className="p-1 text-muted-foreground hover:text-foreground disabled:opacity-30"
                  onClick={() => move(i, -1)}
                  disabled={i === 0}
                  aria-label="Move up"
                >▲</button>
                <button
                  className="p-1 text-muted-foreground hover:text-foreground disabled:opacity-30"
                  onClick={() => move(i, 1)}
                  disabled={i === rows.length - 1}
                  aria-label="Move down"
                >▼</button>
              </div>
              <GripVertical className="h-4 w-4 text-muted-foreground" />
              <div className="w-40 shrink-0">
                <div className="text-xs text-muted-foreground">Internal key</div>
                <div className="font-mono text-sm">{row.stage_key}</div>
              </div>
              <div className="flex-1">
                <div className="text-xs text-muted-foreground">Display name</div>
                <Input
                  value={row.display_name}
                  onChange={(e) => update(i, { display_name: e.target.value })}
                />
              </div>
              <div className="w-36">
                <div className="text-xs text-muted-foreground">Color</div>
                <div className="flex items-center gap-2">
                  <input
                    type="color"
                    value={row.color}
                    onChange={(e) => update(i, { color: e.target.value })}
                    className="h-9 w-12 rounded border bg-transparent"
                  />
                  <Input
                    value={row.color}
                    onChange={(e) => update(i, { color: e.target.value })}
                    className="font-mono text-xs"
                  />
                </div>
              </div>
            </div>
          ))}
        </Card>
      </div>
    </div>
  );
}
