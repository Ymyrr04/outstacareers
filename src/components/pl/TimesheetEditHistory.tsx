import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { History, Loader2 } from 'lucide-react';
import { formatDateTime, formatDateWithWeekday } from '@/lib/dateFormat';

interface Version {
  id: string;
  total_hours: number | null;
  overtime_hours: number | null;
  incentive_amount: number | null;
  notes: string | null;
  daily_hours: any;
  status: string | null;
  submitted_at: string | null;
  replaced_at: string;
}

const fmt12 = (t?: string) => {
  if (!t || typeof t !== 'string') return '';
  const [hStr, mStr] = t.split(':');
  const h = parseInt(hStr, 10);
  const m = parseInt(mStr, 10);
  if (Number.isNaN(h) || Number.isNaN(m)) return t;
  const ampm = h >= 12 ? 'PM' : 'AM';
  return `${h % 12 || 12}:${String(m).padStart(2, '0')} ${ampm}`;
};

const renderShiftTimes = (d: any) => {
  if (!d) return <span className="text-muted-foreground">—</span>;
  const parts: JSX.Element[] = [];
  if (d.time_in && d.time_out) parts.push(<span key="main">{fmt12(d.time_in)} – {fmt12(d.time_out)}</span>);
  const extras: any[] = Array.isArray(d.shifts) && d.shifts.length
    ? d.shifts
    : (d.time_in_2 && d.time_out_2 ? [{ time_in: d.time_in_2, time_out: d.time_out_2 }] : []);
  extras.filter((s) => s?.time_in && s?.time_out).forEach((s, i) => {
    parts.push(
      <span key={`x${i}`} className="block text-muted-foreground">
        {fmt12(s.time_in)} – {fmt12(s.time_out)}{s.note ? ` (${s.note})` : ''}
      </span>
    );
  });
  return parts.length ? <>{parts}</> : <span className="text-muted-foreground">—</span>;
};

export function TimesheetEditHistory({ timesheetId }: { timesheetId: string }) {
  const [versions, setVersions] = useState<Version[]>([]);
  const [loading, setLoading] = useState(true);
  const [viewing, setViewing] = useState<Version | null>(null);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      const { data } = await supabase
        .from('contractor_timesheet_versions')
        .select('id, total_hours, overtime_hours, incentive_amount, notes, daily_hours, status, submitted_at, replaced_at')
        .eq('timesheet_id', timesheetId)
        .order('replaced_at', { ascending: false });
      if (!cancelled) {
        setVersions((data as any[]) || []);
        setLoading(false);
      }
    };
    load();
    return () => { cancelled = true; };
  }, [timesheetId]);

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="w-4 h-4 animate-spin" /> Loading edit history…
      </div>
    );
  }

  if (versions.length === 0) {
    return (
      <div>
        <h4 className="font-semibold text-sm mb-1 flex items-center gap-2"><History className="w-4 h-4" />Edit History</h4>
        <p className="text-sm text-muted-foreground">No edits — this is the original submission.</p>
      </div>
    );
  }

  const dayRows = (daily: any): Array<[string, any]> => {
    if (!daily) return [];
    const entries: Array<[string, any]> = Object.entries(daily);
    const dated = entries.filter(([k]) => /^\d{4}-\d{2}-\d{2}$/.test(k)).sort(([a], [b]) => a.localeCompare(b));
    return dated.length ? dated : entries;
  };

  return (
    <div>
      <h4 className="font-semibold text-sm mb-2 flex items-center gap-2">
        <History className="w-4 h-4" />Edit History
        <span className="text-xs font-normal text-muted-foreground">({versions.length} previous {versions.length === 1 ? 'version' : 'versions'})</span>
      </h4>
      <div className="border rounded-md overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Version</TableHead>
              <TableHead>Originally submitted</TableHead>
              <TableHead>Replaced</TableHead>
              <TableHead className="text-right">Hours</TableHead>
              <TableHead className="text-right"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {versions.map((v, i) => (
              <TableRow key={v.id}>
                <TableCell className="font-medium">v{versions.length - i}</TableCell>
                <TableCell className="text-sm">{v.submitted_at ? formatDateTime(v.submitted_at) : '—'}</TableCell>
                <TableCell className="text-sm">{formatDateTime(v.replaced_at)}</TableCell>
                <TableCell className="text-right">{Number(v.total_hours || 0).toFixed(2)}</TableCell>
                <TableCell className="text-right">
                  <Button size="sm" variant="outline" onClick={() => setViewing(v)}>View</Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <Dialog open={!!viewing} onOpenChange={(o) => { if (!o) setViewing(null); }}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Previous Submission</DialogTitle>
            <DialogDescription>
              {viewing ? `Submitted ${viewing.submitted_at ? formatDateTime(viewing.submitted_at) : '—'} · replaced ${formatDateTime(viewing.replaced_at)}` : ''}
            </DialogDescription>
          </DialogHeader>
          {viewing && (
            <div className="space-y-4 text-sm py-2">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-x-6 gap-y-3">
                <div>
                  <div className="text-xs text-muted-foreground">Total hours</div>
                  <div>{Number(viewing.total_hours || 0).toFixed(2)}</div>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground">Overtime</div>
                  <div>{Number(viewing.overtime_hours || 0).toFixed(2)}</div>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground">Bonus</div>
                  <div>${Number(viewing.incentive_amount || 0).toFixed(2)}</div>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground">Status</div>
                  <div>{viewing.status || '—'}</div>
                </div>
              </div>

              <div>
                <h4 className="font-semibold text-sm mb-2">Daily Breakdown</h4>
                {dayRows(viewing.daily_hours).length === 0 ? (
                  <p className="text-sm text-muted-foreground">No daily breakdown recorded.</p>
                ) : (
                  <div className="border rounded-md overflow-hidden">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Day</TableHead>
                          <TableHead className="text-right">Hours</TableHead>
                          <TableHead>Log In / Log Out</TableHead>
                          <TableHead>Reason / Notes</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {dayRows(viewing.daily_hours).map(([k, v]) => (
                          <TableRow key={k}>
                            <TableCell className="font-medium">
                              {/^\d{4}-\d{2}-\d{2}$/.test(k) ? formatDateWithWeekday(k) : k.charAt(0).toUpperCase() + k.slice(1)}
                            </TableCell>
                            <TableCell className="text-right">{Number((v as any)?.hours || 0).toFixed(2)}</TableCell>
                            <TableCell className="text-sm whitespace-nowrap">{renderShiftTimes(v)}</TableCell>
                            <TableCell className="text-sm">{(v as any)?.reason || <span className="text-muted-foreground">—</span>}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </div>

              {viewing.notes && (
                <div>
                  <h4 className="font-semibold text-sm mb-1">Submission Notes</h4>
                  <div className="rounded-md border p-3 text-sm whitespace-pre-wrap break-words">{viewing.notes}</div>
                </div>
              )}
            </div>
          )}
          <DialogFooter>
            <Button variant="ghost" onClick={() => setViewing(null)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
