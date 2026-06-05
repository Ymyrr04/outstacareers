import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

export const SALES_STAGES = [
  'Lead',
  'Contact 1',
  'Contact 2',
  'Contact 3',
  'Converted',
  'Follow Up',
] as const;
export type SalesStage = typeof SALES_STAGES[number];

export type Temperature = 'warm' | 'cold' | 'hot';
export type ContactType = 'Email' | 'Text' | 'Call' | 'Other';
export const CONTACT_TYPES: ContactType[] = ['Email', 'Text', 'Call', 'Other'];

export interface SalesLead {
  id: string;
  company_name: string;
  contact_name: string | null;
  role_title: string | null;
  email: string | null;
  phone: string | null;
  phone_2: string | null;
  industry: string | null;
  team_size: string | null;
  hiring_urgency: string | null;
  temperature: Temperature;
  source: string;
  original_message: string | null;
  stage: SalesStage;
  converted_client_id: string | null;
  converted_at: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  contact_1_type: ContactType | null;
  contact_2_type: ContactType | null;
  contact_3_type: ContactType | null;
  contact_1_at: string | null;
  contact_2_at: string | null;
  contact_3_at: string | null;
  contact_1_notes: string | null;
  contact_2_notes: string | null;
  contact_3_notes: string | null;
}

export interface SalesLeadNote {
  id: string;
  lead_id: string;
  note: string;
  created_by_email: string | null;
  created_at: string;
}

export const useSalesLeads = () => {
  const [leads, setLeads] = useState<SalesLead[]>([]);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();

  const fetchLeads = useCallback(async () => {
    const { data, error } = await supabase
      .from('sales_leads' as any)
      .select('*')
      .order('created_at', { ascending: false });
    if (error) {
      console.error(error);
      toast({ title: 'Error', description: 'Failed to load leads', variant: 'destructive' });
    } else {
      setLeads((data || []) as any);
    }
    setLoading(false);
  }, [toast]);

  useEffect(() => {
    fetchLeads();
    const channel = supabase
      .channel('sales_leads_changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'sales_leads' }, () => fetchLeads())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [fetchLeads]);

  const createLead = async (lead: Partial<SalesLead>): Promise<boolean> => {
    const { data: userData } = await supabase.auth.getUser();
    const { error } = await supabase.from('sales_leads' as any).insert({
      ...lead,
      created_by: userData.user?.id,
    });
    if (error) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
      return false;
    }
    toast({ title: 'Lead added' });
    return true;
  };

  const updateLead = async (id: string, updates: Partial<SalesLead>): Promise<boolean> => {
    setLeads(prev => prev.map(l => l.id === id ? { ...l, ...updates } as SalesLead : l));
    const { error } = await supabase.from('sales_leads' as any).update(updates).eq('id', id);
    if (error) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
      fetchLeads();
      return false;
    }
    return true;
  };

  const deleteLead = async (id: string): Promise<boolean> => {
    const { error } = await supabase.from('sales_leads' as any).delete().eq('id', id);
    if (error) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
      return false;
    }
    toast({ title: 'Lead deleted' });
    return true;
  };

  const bulkInsert = async (rows: Partial<SalesLead>[]): Promise<number> => {
    if (!rows.length) return 0;
    const { data: userData } = await supabase.auth.getUser();
    const payload = rows.map(r => ({ source: 'csv-import', stage: 'Lead' as SalesStage, temperature: 'warm' as Temperature, ...r, created_by: userData.user?.id }));
    const { error, count } = await supabase.from('sales_leads' as any).insert(payload, { count: 'exact' });
    if (error) {
      toast({ title: 'Import failed', description: error.message, variant: 'destructive' });
      return 0;
    }
    return count || payload.length;
  };

  const convertToClient = async (lead: SalesLead): Promise<boolean> => {
    if (lead.converted_client_id) {
      toast({ title: 'Already converted' });
      return true;
    }
    const { data: client, error } = await supabase
      .from('clients')
      .insert({
        company_name: lead.company_name,
        industry: lead.industry,
        leads_from: lead.source || 'sales-pipeline',
        notes: lead.original_message,
      })
      .select()
      .single();
    if (error || !client) {
      toast({ title: 'Error', description: error?.message || 'Failed to create client', variant: 'destructive' });
      return false;
    }
    if (lead.contact_name || lead.email || lead.phone) {
      await supabase.from('client_contacts').insert({
        client_id: client.id,
        full_name: lead.contact_name || lead.company_name,
        email: lead.email,
        phone: lead.phone,
        role: lead.role_title,
        is_primary: true,
      });
    }
    await updateLead(lead.id, {
      stage: 'Converted',
      converted_client_id: client.id,
      converted_at: new Date().toISOString(),
    });
    toast({ title: 'Converted to client', description: lead.company_name });
    return true;
  };

  return { leads, loading, fetchLeads, createLead, updateLead, deleteLead, bulkInsert, convertToClient };
};

export const useSalesLeadNotes = (leadId: string | null) => {
  const [notes, setNotes] = useState<SalesLeadNote[]>([]);
  const { toast } = useToast();

  const fetchNotes = useCallback(async () => {
    if (!leadId) { setNotes([]); return; }
    const { data, error } = await supabase
      .from('sales_lead_notes' as any)
      .select('*')
      .eq('lead_id', leadId)
      .order('created_at', { ascending: false });
    if (!error) setNotes((data || []) as any);
  }, [leadId]);

  useEffect(() => { fetchNotes(); }, [fetchNotes]);

  const addNote = async (note: string): Promise<boolean> => {
    if (!leadId || !note.trim()) return false;
    const { data: userData } = await supabase.auth.getUser();
    const { error } = await supabase.from('sales_lead_notes' as any).insert({
      lead_id: leadId,
      note: note.trim(),
      created_by: userData.user?.id,
      created_by_email: userData.user?.email,
    });
    if (error) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
      return false;
    }
    fetchNotes();
    return true;
  };

  return { notes, addNote, fetchNotes };
};
