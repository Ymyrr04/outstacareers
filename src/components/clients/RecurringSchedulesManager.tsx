import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { RefreshCw, Trash2, Building2, Users, Loader2, CalendarClock } from 'lucide-react';

const FREQUENCY_LABELS: Record<string, string> = {
  'weekly-friday': 'Every Friday',
  'weekly-monday': 'Every Monday',
  'biweekly-friday': 'Every other Friday',
  'monthly-first': '1st of every month',
  'monthly-last': 'Last day of every month',
};

interface RecurringSchedule {
  id: string;
  template_id: string;
  client_id: string | null;
  frequency: string;
  is_enabled: boolean;
  last_sent_at: string | null;
  next_run_at: string | null;
  created_at: string;
  template?: { name: string; subject: string } | null;
  client?: { company_name: string } | null;
}

const EASTERN_DATETIME_FORMATTER = new Intl.DateTimeFormat('en-US', {
  timeZone: 'America/New_York',
  month: 'short',
  day: 'numeric',
  year: 'numeric',
  hour: 'numeric',
  minute: '2-digit',
  hour12: true,
  timeZoneName: 'short',
});

export const RecurringSchedulesManager = () => {
  const { toast } = useToast();
  const [schedules, setSchedules] = useState<RecurringSchedule[]>([]);
  const [loading, setLoading] = useState(true);
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const fetchSchedules = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('recurring_contractor_email_schedules' as any)
        .select('*, template:contractor_email_templates(name, subject), client:clients(company_name)')
        .order('created_at', { ascending: false });
      if (error) throw error;
      setSchedules((data as any[]) || []);
    } catch (err: any) {
      console.error('Failed to fetch recurring schedules:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchSchedules();
  }, [fetchSchedules]);

  const handleToggle = async (id: string, enabled: boolean) => {
    setTogglingId(id);
    try {
      const { error } = await supabase
        .from('recurring_contractor_email_schedules' as any)
        .update({ is_enabled: enabled } as any)
        .eq('id', id);
      if (error) throw error;
      setSchedules(prev => prev.map(s => s.id === id ? { ...s, is_enabled: enabled } : s));
      toast({ title: enabled ? 'Schedule enabled' : 'Schedule paused' });
    } catch (err: any) {
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
    } finally {
      setTogglingId(null);
    }
  };

  const handleDelete = async (id: string) => {
    setDeletingId(id);
    try {
      const { error } = await supabase
        .from('recurring_contractor_email_schedules' as any)
        .delete()
        .eq('id', id);
      if (error) throw error;
      setSchedules(prev => prev.filter(s => s.id !== id));
      toast({ title: 'Schedule deleted' });
    } catch (err: any) {
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
    } finally {
      setDeletingId(null);
    }
  };

  if (loading) {
    return (
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm flex items-center gap-2">
            <RefreshCw className="w-4 h-4" />
            Recurring Schedules
          </CardTitle>
        </CardHeader>
        <CardContent className="flex items-center justify-center py-4">
          <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  if (schedules.length === 0) return null;

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm flex items-center gap-2">
          <RefreshCw className="w-4 h-4 text-teal-600" />
          Recurring Schedules ({schedules.length})
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {schedules.map((schedule) => {
          const tpl = schedule.template as any;
          const client = schedule.client as any;
          return (
            <div
              key={schedule.id}
              className="flex items-center justify-between rounded-md border p-3 text-sm"
            >
              <div className="flex-1 min-w-0 space-y-1">
                <div className="flex items-center gap-2">
                  <span className="font-medium truncate">
                    {tpl?.name || 'Unknown template'}
                  </span>
                  <Badge variant={schedule.is_enabled ? 'default' : 'secondary'} className="text-[10px] px-1.5 py-0">
                    {schedule.is_enabled ? 'Active' : 'Paused'}
                  </Badge>
                </div>
                <div className="flex items-center gap-3 text-xs text-muted-foreground">
                  <span className="flex items-center gap-1">
                    <CalendarClock className="w-3 h-3" />
                    {FREQUENCY_LABELS[schedule.frequency] || schedule.frequency}
                  </span>
                  <span className="flex items-center gap-1">
                    {client ? (
                      <><Building2 className="w-3 h-3" />{client.company_name}</>
                    ) : (
                      <><Users className="w-3 h-3" />All companies</>
                    )}
                  </span>
                  {schedule.last_sent_at && (
                    <span>
                      Last: {EASTERN_DATETIME_FORMATTER.format(new Date(schedule.last_sent_at))}
                    </span>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-2 ml-3">
                <Switch
                  checked={schedule.is_enabled}
                  onCheckedChange={(checked) => handleToggle(schedule.id, checked)}
                  disabled={togglingId === schedule.id}
                />
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:text-destructive">
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Delete recurring schedule?</AlertDialogTitle>
                      <AlertDialogDescription>
                        This will permanently remove this recurring email schedule for "{tpl?.name}".
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancel</AlertDialogCancel>
                      <AlertDialogAction
                        onClick={() => handleDelete(schedule.id)}
                        disabled={deletingId === schedule.id}
                      >
                        {deletingId === schedule.id ? 'Deleting...' : 'Delete'}
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </div>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
};
