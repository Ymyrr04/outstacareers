import { useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';

export interface StageSetting {
  id: string;
  stage_key: string;
  display_name: string | null;
  color: string | null;
  sort_order: number | null;
}

const QUERY_KEY = ['stage_settings'];

export function useStageSettings() {
  const query = useQuery({
    queryKey: QUERY_KEY,
    queryFn: async (): Promise<StageSetting[]> => {
      const { data, error } = await supabase
        .from('stage_settings' as any)
        .select('id, stage_key, display_name, color, sort_order');
      if (error) throw error;
      return (data ?? []) as any;
    },
    staleTime: 60_000,
  });

  const map = useMemo(() => {
    const m = new Map<string, StageSetting>();
    (query.data ?? []).forEach((s) => m.set(s.stage_key, s));
    return m;
  }, [query.data]);

  const getDisplayName = (stage: string): string => {
    const s = map.get(stage);
    if (s?.display_name && s.display_name.trim()) return s.display_name;
    // legacy fallback (preserves prior swap behaviour until overridden)
    if (stage === 'Talent Pool') return 'Bench';
    if (stage === 'Bench') return 'Talent Pipeline';
    return stage;
  };

  const getColor = (stage: string): string | undefined => {
    return map.get(stage)?.color ?? undefined;
  };

  const orderStages = <T extends string>(stages: readonly T[]): T[] => {
    return [...stages].sort((a, b) => {
      const oa = map.get(a)?.sort_order;
      const ob = map.get(b)?.sort_order;
      const ai = oa ?? stages.indexOf(a) + 1000;
      const bi = ob ?? stages.indexOf(b) + 1000;
      return ai - bi;
    });
  };

  return { settings: query.data ?? [], map, getDisplayName, getColor, orderStages, isLoading: query.isLoading };
}

export const STAGE_QUERY_KEY = QUERY_KEY;
