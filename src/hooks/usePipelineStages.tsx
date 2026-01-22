import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

export interface PipelineStage {
  id: string;
  name: string;
  slug: string;
  emoji: string | null;
  stage_order: number;
  is_system: boolean;
  created_at: string;
  updated_at: string;
}

export interface CreatePipelineStage {
  name: string;
  emoji?: string | null;
}

export const usePipelineStages = () => {
  const [stages, setStages] = useState<PipelineStage[]>([]);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();

  const fetchStages = useCallback(async () => {
    const { data, error } = await supabase
      .from('pipeline_stages')
      .select('*')
      .order('stage_order', { ascending: true });

    if (error) {
      console.error('Error fetching pipeline stages:', error);
      toast({
        title: 'Error',
        description: 'Failed to load pipeline stages',
        variant: 'destructive',
      });
      setLoading(false);
      return;
    }

    setStages(data || []);
    setLoading(false);
  }, [toast]);

  useEffect(() => {
    fetchStages();

    // Subscribe to realtime changes
    const channel = supabase
      .channel('pipeline_stages_changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'pipeline_stages',
        },
        () => {
          fetchStages();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [fetchStages]);

  const generateSlug = (name: string): string => {
    return name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_|_$/g, '');
  };

  const createStage = async (stage: CreatePipelineStage): Promise<boolean> => {
    const slug = generateSlug(stage.name);
    const maxOrder = Math.max(...stages.map(s => s.stage_order), -1);

    const { error } = await supabase
      .from('pipeline_stages')
      .insert({
        name: stage.name,
        slug: slug,
        emoji: stage.emoji || null,
        stage_order: maxOrder + 1,
        is_system: false,
      });

    if (error) {
      console.error('Error creating pipeline stage:', error);
      toast({
        title: 'Error',
        description: error.message.includes('duplicate') 
          ? 'A stage with this name already exists' 
          : 'Failed to create pipeline stage',
        variant: 'destructive',
      });
      return false;
    }

    toast({
      title: 'Success',
      description: 'Pipeline stage created',
    });
    return true;
  };

  const updateStage = async (id: string, updates: Partial<PipelineStage>): Promise<boolean> => {
    const { error } = await supabase
      .from('pipeline_stages')
      .update(updates)
      .eq('id', id);

    if (error) {
      console.error('Error updating pipeline stage:', error);
      toast({
        title: 'Error',
        description: 'Failed to update pipeline stage',
        variant: 'destructive',
      });
      return false;
    }

    return true;
  };

  const deleteStage = async (id: string): Promise<boolean> => {
    const stage = stages.find(s => s.id === id);
    if (stage?.is_system) {
      toast({
        title: 'Cannot delete',
        description: 'System stages cannot be deleted',
        variant: 'destructive',
      });
      return false;
    }

    const { error } = await supabase
      .from('pipeline_stages')
      .delete()
      .eq('id', id);

    if (error) {
      console.error('Error deleting pipeline stage:', error);
      toast({
        title: 'Error',
        description: 'Failed to delete pipeline stage',
        variant: 'destructive',
      });
      return false;
    }

    toast({
      title: 'Deleted',
      description: 'Pipeline stage removed',
    });
    return true;
  };

  const reorderStages = async (reorderedStages: PipelineStage[]): Promise<boolean> => {
    const updates = reorderedStages.map((stage, index) => ({
      id: stage.id,
      stage_order: index,
    }));

    for (const update of updates) {
      const { error } = await supabase
        .from('pipeline_stages')
        .update({ stage_order: update.stage_order })
        .eq('id', update.id);

      if (error) {
        console.error('Error reordering stages:', error);
        toast({
          title: 'Error',
          description: 'Failed to reorder stages',
          variant: 'destructive',
        });
        return false;
      }
    }

    return true;
  };

  return {
    stages,
    loading,
    fetchStages,
    createStage,
    updateStage,
    deleteStage,
    reorderStages,
  };
};
