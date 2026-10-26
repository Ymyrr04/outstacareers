import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { Clock, Loader2, Save } from 'lucide-react';

const days = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
const slots = Array.from({length:48}, (_,i) => {
  const hour = Math.floor(i/2); const minute = i%2 ? '30' : '00';
  return {value:`${String(hour).padStart(2,'0')}:${minute}`, label:`${hour%12 || 12}:${minute} ${hour<12?'AM':'PM'}`};
});
export function ClientTimesheetEmailSettings({clientId}:{clientId:string}) {
  const {toast} = useToast();
  const [mode,setMode] = useState('immediate');
  const [day,setDay] = useState('1');
  const [time,setTime] = useState('09:00');
  const [loading,setLoading] = useState(true);
  const [saving,setSaving] = useState(false);
  useEffect(() => {
    let active = true;
    setLoading(true);
    supabase.from('client_timesheet_email_settings').select('enabled,day_of_week,send_time').eq('client_id',clientId).maybeSingle().then(({data,error}) => {
      if (!active) return;
      if (error) toast({title:'Could not load email schedule',description:error.message,variant:'destructive'});
      setMode(data?.enabled ? 'weekly' : 'immediate'); setDay(String(data?.day_of_week ?? 1)); setTime(data?.send_time?.slice(0,5) || '09:00'); setLoading(false);
    });
    return () => {active=false;};
  },[clientId,toast]);
  const save = async () => {
    setSaving(true);
    const {error} = await supabase.from('client_timesheet_email_settings').upsert({client_id:clientId,enabled:mode==='weekly',day_of_week:Number(day),send_time:time},{onConflict:'client_id'});
    setSaving(false);
    toast(error ? {title:'Could not save email schedule',description:error.message,variant:'destructive'} : {title:'Timesheet email schedule saved'});
  };
  return <section className="space-y-3 border-b pb-4" aria-label="Timesheet email schedule">
    <h3 className="text-sm font-medium flex items-center gap-2"><Clock className="h-4 w-4"/>Timesheet emails</h3>
    {loading ? <Loader2 className="h-4 w-4 animate-spin"/> : <>
      <div className="space-y-1"><Label htmlFor="timesheet-delivery">Delivery</Label><Select value={mode} onValueChange={setMode}><SelectTrigger id="timesheet-delivery"><SelectValue/></SelectTrigger><SelectContent><SelectItem value="immediate">Immediately on submission</SelectItem><SelectItem value="weekly">Weekly combined email</SelectItem></SelectContent></Select></div>
      {mode==='weekly' && <div className="grid grid-cols-1 sm:grid-cols-2 gap-3"><div className="space-y-1"><Label htmlFor="timesheet-day">Day</Label><Select value={day} onValueChange={setDay}><SelectTrigger id="timesheet-day"><SelectValue/></SelectTrigger><SelectContent>{days.map((d,i)=><SelectItem key={d} value={String(i)}>{d}</SelectItem>)}</SelectContent></Select></div><div className="space-y-1"><Label htmlFor="timesheet-time">Time (Eastern Time)</Label><Select value={time} onValueChange={setTime}><SelectTrigger id="timesheet-time"><SelectValue/></SelectTrigger><SelectContent>{slots.map(s=><SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}</SelectContent></Select></div></div>}
      <Button size="sm" onClick={save} disabled={saving}>{saving ? <Loader2 className="h-4 w-4 mr-2 animate-spin"/> : <Save className="h-4 w-4 mr-2"/>}Save email schedule</Button>
    </>}
  </section>;
}