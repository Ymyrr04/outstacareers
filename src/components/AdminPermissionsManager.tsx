import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useManageTabPermissions, TAB_IDS, TAB_LABELS, TabId } from '@/hooks/useTabPermissions';
import { getAdminDisplayName } from '@/lib/adminDisplayNames';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Skeleton } from '@/components/ui/skeleton';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { useToast } from '@/hooks/use-toast';
import { Shield, Settings } from 'lucide-react';

interface AdminUser {
  user_id: string;
  email: string;
  role: string;
}

export const AdminPermissionsManager = () => {
  const [adminUsers, setAdminUsers] = useState<AdminUser[]>([]);
  const [loadingAdmins, setLoadingAdmins] = useState(true);
  const { loading: loadingPerms, updatePermission, getPermission, refetch } = useManageTabPermissions();
  const { toast } = useToast();

  useEffect(() => {
    const fetchAdmins = async () => {
      try {
        const { data, error } = await supabase.functions.invoke('get-admin-users');
        if (error) throw error;
        setAdminUsers(data.adminUsers || []);
      } catch (err) {
        console.error('Error fetching admins:', err);
      }
      setLoadingAdmins(false);
    };
    fetchAdmins();
  }, []);

  const handleToggle = async (userId: string, tabId: TabId, currentValue: boolean) => {
    const success = await updatePermission(userId, tabId, !currentValue);
    if (success) {
      toast({
        title: 'Permission updated',
        description: `Tab visibility updated successfully`,
      });
    } else {
      toast({
        title: 'Error',
        description: 'Failed to update permission',
        variant: 'destructive',
      });
    }
  };

  if (loadingAdmins || loadingPerms) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  // Filter out super_admins from the list (they always have full access)
  const editableAdmins = adminUsers.filter(admin => {
    // We need to check the role, but we don't have it from get-admin-users
    // So we'll show all and just note that super_admins have full access
    return true;
  });

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <Shield className="h-5 w-5 text-primary" />
          <CardTitle>Tab Permissions</CardTitle>
        </div>
        <CardDescription>
          Control which tabs each admin can view. Super admins always have full access.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b">
                <th className="text-left py-3 px-2 font-medium">Admin</th>
                {TAB_IDS.map(tabId => (
                  <th key={tabId} className="text-center py-3 px-2 font-medium min-w-[80px]">
                    {TAB_LABELS[tabId]}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {editableAdmins.map(admin => {
                const displayName = getAdminDisplayName(admin.email);
                const initials = displayName.slice(0, 2).toUpperCase();
                
                return (
                  <tr key={admin.user_id} className="border-b hover:bg-muted/50">
                    <td className="py-3 px-2">
                      <div className="flex items-center gap-2">
                        <Avatar className="h-8 w-8">
                          <AvatarFallback className="text-xs bg-primary/10">
                            {initials}
                          </AvatarFallback>
                        </Avatar>
                        <span className="font-medium">{displayName}</span>
                      </div>
                    </td>
                    {TAB_IDS.map(tabId => {
                      const canView = getPermission(admin.user_id, tabId);
                      return (
                        <td key={tabId} className="text-center py-3 px-2">
                          <Switch
                            checked={canView}
                            onCheckedChange={() => handleToggle(admin.user_id, tabId, canView)}
                          />
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
};