import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';

export const TAB_IDS = [
  'jobs',
  'applicants', 
  'recruiter-dash',
  'funnel',
  'pipeline',
  'sales-pipeline',
  'post-hire',
  'clients',
  'contractors',
  'contracts',
  'pl',
  'analytics',
  'calendar',
  'talent-scout',
  'external-scout',
  'workflow',
] as const;

export type TabId = typeof TAB_IDS[number];

export const TAB_LABELS: Record<TabId, string> = {
  'jobs': 'Jobs',
  'applicants': 'Applicants',
  'recruiter-dash': 'Recruiter Dash',
  'pipeline': 'Pipeline',
  'sales-pipeline': 'Sales Pipeline',
  'post-hire': 'Post-Hire',
  'clients': 'Clients',
  'contractors': 'Contractors',
  'contracts': 'Contracts',
  'pl': 'PL',
  'analytics': 'Analytics',
  'calendar': 'Calendar',
  'funnel': 'Funnel',
  'talent-scout': 'Talent Scout',
  'external-scout': 'External Scout',
  'workflow': 'Workflow',
};

interface TabPermission {
  tab_id: TabId;
  can_view: boolean;
}

export const useTabPermissions = () => {
  const { user } = useAuth();
  const [permissions, setPermissions] = useState<TabPermission[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchPermissions = useCallback(async () => {
    if (!user) {
      setLoading(false);
      return;
    }

    const { data, error } = await supabase
      .from('admin_tab_permissions')
      .select('tab_id, can_view')
      .eq('user_id', user.id);

    if (error) {
      console.error('Error fetching tab permissions:', error);
      // Default to all visible if error
      setPermissions(TAB_IDS.map(tab_id => ({ tab_id, can_view: true })));
    } else {
      setPermissions((data || []) as TabPermission[]);
    }
    setLoading(false);
  }, [user]);

  useEffect(() => {
    fetchPermissions();
  }, [fetchPermissions]);

  const canViewTab = useCallback((tabId: TabId): boolean => {
    const permission = permissions.find(p => p.tab_id === tabId);
    // Default to true if no permission record exists
    return permission?.can_view ?? true;
  }, [permissions]);

  const visibleTabs = TAB_IDS.filter(tabId => canViewTab(tabId));

  return {
    permissions,
    loading,
    canViewTab,
    visibleTabs,
    refetch: fetchPermissions,
  };
};

// Hook for super admins to manage all permissions
export const useManageTabPermissions = () => {
  const [allPermissions, setAllPermissions] = useState<Record<string, TabPermission[]>>({});
  const [loading, setLoading] = useState(true);

  const fetchAllPermissions = useCallback(async () => {
    setLoading(true);
    
    const { data, error } = await supabase
      .from('admin_tab_permissions')
      .select('user_id, tab_id, can_view');

    if (error) {
      console.error('Error fetching all permissions:', error);
      setLoading(false);
      return;
    }

    // Group by user_id
    const grouped: Record<string, TabPermission[]> = {};
    for (const row of data || []) {
      if (!grouped[row.user_id]) {
        grouped[row.user_id] = [];
      }
      grouped[row.user_id].push({
        tab_id: row.tab_id as TabId,
        can_view: row.can_view,
      });
    }
    
    setAllPermissions(grouped);
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchAllPermissions();
  }, [fetchAllPermissions]);

  const updatePermission = async (userId: string, tabId: TabId, canView: boolean): Promise<boolean> => {
    const { error } = await supabase
      .from('admin_tab_permissions')
      .upsert({
        user_id: userId,
        tab_id: tabId,
        can_view: canView,
      }, {
        onConflict: 'user_id,tab_id',
      });

    if (error) {
      console.error('Error updating permission:', error);
      return false;
    }

    // Optimistic update
    setAllPermissions(prev => {
      const userPerms = prev[userId] || [];
      const existing = userPerms.findIndex(p => p.tab_id === tabId);
      if (existing >= 0) {
        userPerms[existing].can_view = canView;
      } else {
        userPerms.push({ tab_id: tabId, can_view: canView });
      }
      return { ...prev, [userId]: [...userPerms] };
    });

    return true;
  };

  const getPermission = (userId: string, tabId: TabId): boolean => {
    const userPerms = allPermissions[userId] || [];
    const perm = userPerms.find(p => p.tab_id === tabId);
    return perm?.can_view ?? true;
  };

  return {
    allPermissions,
    loading,
    updatePermission,
    getPermission,
    refetch: fetchAllPermissions,
  };
};