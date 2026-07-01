import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

export interface ContractorPipelineStage {
  id: string;
  name: string;
  slug: string;
  emoji: string | null;
  stage_order: number;
  trigger_days: number;
  is_system: boolean;
  checkin_email_subject: string | null;
  checkin_email_body: string | null;
  contractor_email_subject: string | null;
  contractor_email_body: string | null;
  email_recipient: string;
  checkin_sections?: any[] | null;
  created_at: string;
  updated_at: string;
}

export interface ContractorPipelineTracking {
  id: string;
  contractor_assignment_id: string;
  current_stage_id: string;
  moved_at: string;
  auto_moved: boolean;
  notes: string | null;
  created_at: string;
  updated_at: string;
  // Joined data
  contractor?: {
    id: string;
    applicant_id: string;
    client_id: string;
    job_title: string | null;
    start_date: string | null;
    status: string | null;
    hourly_rate: number | null;
    hours_per_week: number | null;
    applicant: {
      full_name: string;
      email: string;
      location: string;
    } | null;
    client: {
      id: string;
      company_name: string;
    } | null;
  };
}

export const useContractorPipeline = () => {
  const [stages, setStages] = useState<ContractorPipelineStage[]>([]);
  const [tracking, setTracking] = useState<ContractorPipelineTracking[]>([]);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();

  const fetchStages = useCallback(async () => {
    const { data, error } = await supabase
      .from('contractor_pipeline_stages')
      .select('*')
      .order('stage_order', { ascending: true });

    if (error) {
      console.error('Error fetching pipeline stages:', error);
      return;
    }
    setStages((data as unknown as ContractorPipelineStage[]) || []);
  }, []);

  const fetchTracking = useCallback(async () => {
    const { data, error } = await supabase
      .from('contractor_pipeline_tracking')
      .select(`
        *,
        contractor:contractor_assignments(
          id,
          applicant_id,
          client_id,
          job_title,
          start_date,
          status,
          hourly_rate,
          hours_per_week,
          applicant:applicants_prescreen(full_name, email, location),
          client:clients(id, company_name)
        )
      `);

    if (error) {
      console.error('Error fetching pipeline tracking:', error);
      return;
    }
    setTracking((data as unknown as ContractorPipelineTracking[]) || []);
  }, []);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    await Promise.all([fetchStages(), fetchTracking()]);
    setLoading(false);
  }, [fetchStages, fetchTracking]);

  useEffect(() => {
    fetchAll();

    const channel = supabase
      .channel('contractor_pipeline_tracking_changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'contractor_pipeline_tracking' }, () => {
        fetchTracking();
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [fetchAll, fetchTracking]);

  const moveToStage = async (trackingId: string, newStageId: string): Promise<boolean> => {
    const { error } = await supabase
      .from('contractor_pipeline_tracking')
      .update({ current_stage_id: newStageId, moved_at: new Date().toISOString(), auto_moved: false })
      .eq('id', trackingId);

    if (error) {
      console.error('Error moving contractor:', error);
      toast({ title: 'Error', description: 'Failed to move contractor', variant: 'destructive' });
      return false;
    }
    return true;
  };

  const addContractorToTracking = async (contractorAssignmentId: string, stageId: string): Promise<boolean> => {
    const { error } = await supabase
      .from('contractor_pipeline_tracking')
      .insert({ contractor_assignment_id: contractorAssignmentId, current_stage_id: stageId });

    if (error) {
      if (error.message.includes('duplicate')) {
        toast({ title: 'Already tracked', description: 'This contractor is already in the pipeline', variant: 'destructive' });
      } else {
        console.error('Error adding to tracking:', error);
        toast({ title: 'Error', description: 'Failed to add contractor to pipeline', variant: 'destructive' });
      }
      return false;
    }
    toast({ title: 'Added', description: 'Contractor added to post-hire pipeline' });
    return true;
  };

  return {
    stages,
    tracking,
    loading,
    fetchAll,
    moveToStage,
    addContractorToTracking,
  };
};
