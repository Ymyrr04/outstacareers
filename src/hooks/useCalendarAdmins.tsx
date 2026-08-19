import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { getAdminDisplayName } from '@/lib/adminDisplayNames';
import { colorForIndex } from '@/lib/calendarTime';

export interface CalendarAdmin {
  user_id: string;
  email: string;
  name: string;
  initial: string;
  colorIndex: number;
  color: { main: string; bg: string; text: string; name: string };
}

export const useCalendarAdmins = () => {
  const [admins, setAdmins] = useState<CalendarAdmin[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('get-admin-users');
      if (error) throw error;
      const rawList: Array<{ user_id: string; email: string }> = data?.adminUsers || [];
      // Admins excluded from the team calendar
      const EXCLUDED = ['sean@outsta.io', 'test-admin'];
      const list = rawList.filter((a) => {
        const email = (a.email || '').toLowerCase();
        return !EXCLUDED.some((x) => email.includes(x));
      });

      const { data: colorRows } = await supabase
        .from('calendar_admin_colors')
        .select('user_id, color_index');

      const assigned = new Map<string, number>(
        (colorRows || []).map((r: any) => [r.user_id, r.color_index])
      );
      const used = new Set<number>(assigned.values());

      const newRows: Array<{ user_id: string; color_index: number }> = [];
      let next = 0;
      for (const a of list) {
        if (assigned.has(a.user_id)) continue;
        while (used.has(next) && next < 9) next++;
        const idx = next < 9 ? next : 99; // 99 => gray
        if (next < 9) used.add(next);
        assigned.set(a.user_id, idx);
        newRows.push({ user_id: a.user_id, color_index: idx });
      }
      if (newRows.length) {
        await supabase.from('calendar_admin_colors').upsert(newRows, { onConflict: 'user_id' });
      }

      setAdmins(
        list.map((a) => {
          const name = getAdminDisplayName(a.email, a.email);
          const idx = assigned.get(a.user_id) ?? 99;
          return {
            user_id: a.user_id,
            email: a.email,
            name,
            initial: (name[0] || '?').toUpperCase(),
            colorIndex: idx,
            color: colorForIndex(idx),
          };
        })
      );
    } catch (e) {
      console.error('Error loading calendar admins:', e);
      setAdmins([]);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const getAdmin = useCallback(
    (userId?: string | null) => admins.find((a) => a.user_id === userId),
    [admins]
  );

  return { admins, loading, getAdmin, refetch: load };
};
