import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

interface ClientOption {
  id: string;
  company_name: string;
}

interface JobClientSelectProps {
  value: string;
  onChange: (clientId: string) => void;
  id?: string;
}

/** Internal-only client selector for job postings (never shown on the public site). */
const JobClientSelect = ({ value, onChange, id = 'job-client' }: JobClientSelectProps) => {
  const [clients, setClients] = useState<ClientOption[]>([]);

  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from('clients')
        .select('id, company_name')
        .order('company_name', { ascending: true });
      setClients((data || []) as ClientOption[]);
    })();
  }, []);

  return (
    <div className="space-y-2">
      <Label htmlFor={id}>Client (internal only)</Label>
      <Select value={value || '__none__'} onValueChange={(v) => onChange(v === '__none__' ? '' : v)}>
        <SelectTrigger id={id}>
          <SelectValue placeholder="Select client" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="__none__">No client / internal</SelectItem>
          {clients.map((c) => (
            <SelectItem key={c.id} value={c.id}>
              {c.company_name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <p className="text-xs text-muted-foreground">
        Who this role is for. Visible to the internal team only — not shown on the public job post.
      </p>
    </div>
  );
};

export default JobClientSelect;
