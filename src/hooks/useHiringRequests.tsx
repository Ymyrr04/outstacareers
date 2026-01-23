import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

export type Priority = 'high' | 'medium' | 'low';
export type ClientStatus = 'new' | 'existing' | 'returning';

export interface HiringRequest {
  id: string;
  client_id: string | null;
  client_name?: string;
  job_title: string;
  priority: Priority;
  industry: string | null;
  client_status: ClientStatus;
  pipeline_stage: string;
  source: string | null;
  start_date: string | null;
  target_end_date: string | null;
  assigned_admin_id: string | null;
  notes: string | null;
  hours_per_week: string | null;
  comment_count: number;
  closed_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface CreateHiringRequest {
  client_id?: string | null;
  job_title: string;
  priority?: Priority;
  industry?: string | null;
  client_status?: ClientStatus;
  pipeline_stage?: string;
  source?: string | null;
  start_date?: string | null;
  target_end_date?: string | null;
  assigned_admin_id?: string | null;
  notes?: string | null;
  hours_per_week?: string | null;
  closed_at?: string | null;
}

// Legacy constant for backwards compatibility - now loaded dynamically
export const PIPELINE_STAGES: { id: string; label: string; emoji?: string }[] = [
  { id: 'backlog', label: 'Backlog' },
  { id: 'sourcing', label: 'Sourcing & Screening', emoji: '⏳' },
  { id: 'pitch', label: 'Pitch', emoji: '🚀' },
  { id: 'scheduled_interview', label: 'Scheduled Interview', emoji: '🤝' },
  { id: 'closed', label: 'Closed' },
];

export const useHiringRequests = () => {
  const [requests, setRequests] = useState<HiringRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const hasInitiallyLoadedRef = useRef(false);
  const pendingUpdatesRef = useRef<Set<string>>(new Set());
  const realtimeDebounceRef = useRef<NodeJS.Timeout | null>(null);
  const { toast } = useToast();

  const fetchRequests = useCallback(async (showLoading = false) => {
    // Only show loading skeleton on initial load
    if (showLoading && !hasInitiallyLoadedRef.current) {
      setLoading(true);
    }
    
    // Fetch hiring requests with client names
    const { data, error } = await supabase
      .from('client_hiring_requests')
      .select(`
        *,
        clients (
          company_name
        )
      `)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error fetching hiring requests:', error);
      toast({
        title: 'Error',
        description: 'Failed to load hiring requests',
        variant: 'destructive',
      });
      setLoading(false);
      return;
    }

    const mappedRequests: HiringRequest[] = (data || []).map((r: any) => ({
      id: r.id,
      client_id: r.client_id,
      client_name: r.clients?.company_name || 'Unknown Client',
      job_title: r.job_title,
      priority: r.priority as Priority,
      industry: r.industry,
      client_status: r.client_status as ClientStatus,
      pipeline_stage: r.pipeline_stage as string,
      source: r.source,
      start_date: r.start_date,
      target_end_date: r.target_end_date,
      assigned_admin_id: r.assigned_admin_id,
      notes: r.notes,
      hours_per_week: r.hours_per_week,
      comment_count: r.comment_count || 0,
      closed_at: r.closed_at,
      created_at: r.created_at,
      updated_at: r.updated_at,
    }));

    setRequests(mappedRequests);
    setLoading(false);
    hasInitiallyLoadedRef.current = true;
  }, [toast]);

  useEffect(() => {
    fetchRequests(true); // Show loading only on initial fetch

    // Subscribe to realtime changes with debounce to prevent overwriting optimistic updates
    const channel = supabase
      .channel('hiring_requests_changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'client_hiring_requests',
        },
        () => {
          // Don't refresh if there are pending updates (to preserve optimistic state)
          if (pendingUpdatesRef.current.size > 0) {
            return;
          }
          
          // Debounce realtime updates to prevent rapid successive fetches
          if (realtimeDebounceRef.current) {
            clearTimeout(realtimeDebounceRef.current);
          }
          realtimeDebounceRef.current = setTimeout(() => {
            fetchRequests(false);
          }, 300);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
      if (realtimeDebounceRef.current) {
        clearTimeout(realtimeDebounceRef.current);
      }
    };
  }, [fetchRequests]);

  const createRequest = async (request: CreateHiringRequest): Promise<boolean> => {
    const { error } = await supabase
      .from('client_hiring_requests')
      .insert(request);

    if (error) {
      console.error('Error creating hiring request:', error);
      toast({
        title: 'Error',
        description: 'Failed to create hiring request',
        variant: 'destructive',
      });
      return false;
    }

    toast({
      title: 'Success',
      description: 'Hiring request created',
    });
    return true;
  };

  const updateRequest = async (id: string, updates: Partial<HiringRequest>): Promise<boolean> => {
    // Remove computed fields
    const { client_name, ...dbUpdates } = updates as any;
    
    // Optimistic update for immediate UI feedback
    setRequests(prev => prev.map(r => 
      r.id === id ? { ...r, ...updates } : r
    ));

    const { error } = await supabase
      .from('client_hiring_requests')
      .update(dbUpdates)
      .eq('id', id);

    if (error) {
      console.error('Error updating hiring request:', error);
      // Revert on error
      fetchRequests();
      toast({
        title: 'Error',
        description: 'Failed to update hiring request',
        variant: 'destructive',
      });
      return false;
    }

    return true;
  };

  const updateStage = async (id: string, newStage: string): Promise<boolean> => {
    // Track this update as pending to prevent realtime from overwriting
    pendingUpdatesRef.current.add(id);
    
    // Set closed_at when moving to closed, clear it when moving out
    const closedAt = newStage === 'closed' ? new Date().toISOString() : null;
    
    // Optimistic update
    setRequests(prev => prev.map(r => 
      r.id === id ? { ...r, pipeline_stage: newStage, closed_at: closedAt } : r
    ));

    const { error } = await supabase
      .from('client_hiring_requests')
      .update({ pipeline_stage: newStage, closed_at: closedAt })
      .eq('id', id);

    // Remove from pending after a short delay to let realtime settle
    setTimeout(() => {
      pendingUpdatesRef.current.delete(id);
    }, 500);

    if (error) {
      console.error('Error updating stage:', error);
      // Revert on error
      pendingUpdatesRef.current.delete(id);
      fetchRequests();
      toast({
        title: 'Error',
        description: 'Failed to move card',
        variant: 'destructive',
      });
      return false;
    }

    return true;
  };

  const deleteRequest = async (id: string): Promise<boolean> => {
    const { error } = await supabase
      .from('client_hiring_requests')
      .delete()
      .eq('id', id);

    if (error) {
      console.error('Error deleting hiring request:', error);
      toast({
        title: 'Error',
        description: 'Failed to delete hiring request',
        variant: 'destructive',
      });
      return false;
    }

    toast({
      title: 'Deleted',
      description: 'Hiring request removed',
    });
    return true;
  };

  // Group requests by pipeline stage
  const requestsByStage = PIPELINE_STAGES.reduce((acc, stage) => {
    acc[stage.id] = requests.filter(r => r.pipeline_stage === stage.id);
    return acc;
  }, {} as Record<string, HiringRequest[]>);

  return {
    requests,
    requestsByStage,
    loading,
    fetchRequests,
    createRequest,
    updateRequest,
    updateStage,
    deleteRequest,
  };
};
