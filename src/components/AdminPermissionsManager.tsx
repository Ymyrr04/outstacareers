import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useManageTabPermissions, TAB_IDS, TAB_LABELS, TabId } from '@/hooks/useTabPermissions';
import { getAdminDisplayName } from '@/lib/adminDisplayNames';
import { useAuth } from '@/hooks/useAuth';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Skeleton } from '@/components/ui/skeleton';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { Shield, UserPlus, UserMinus, Clock } from 'lucide-react';

interface AdminUser {
  user_id: string;
  email: string;
  role?: string;
}

interface PendingUser {
  user_id: string;
  email: string;
  created_at: string;
}

export const AdminPermissionsManager = () => {
  const [adminUsers, setAdminUsers] = useState<AdminUser[]>([]);
  const [pendingUsers, setPendingUsers] = useState<PendingUser[]>([]);
  const [loadingAdmins, setLoadingAdmins] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const { loading: loadingPerms, updatePermission, getPermission } = useManageTabPermissions();
  const { toast } = useToast();

  const fetchAdmins = async () => {
    try {
      const { data, error } = await supabase.functions.invoke('get-admin-users');
      if (error) throw error;
      setAdminUsers(data.adminUsers || []);
      setPendingUsers(data.pendingUsers || []);
    } catch (err) {
      console.error('Error fetching admins:', err);
    }
    setLoadingAdmins(false);
  };

  useEffect(() => {
    fetchAdmins();
  }, []);

  const handleToggle = async (userId: string, tabId: TabId, currentValue: boolean) => {
    const success = await updatePermission(userId, tabId, !currentValue);
    toast({
      title: success ? 'Permission updated' : 'Error',
      description: success ? 'Tab visibility updated successfully' : 'Failed to update permission',
      variant: success ? 'default' : 'destructive',
    });
  };

  const handleApproveUser = async (userId: string, email: string) => {
    setActionLoading(userId);
    try {
      const { error } = await supabase.from('user_roles').insert({ user_id: userId, role: 'admin' as any });
      if (error) throw error;
      toast({ title: 'Admin approved', description: `${email} is now an admin` });
      await fetchAdmins();
    } catch (err: any) {
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
    }
    setActionLoading(null);
  };

  const handleRemoveAdmin = async (userId: string, email: string) => {
    setActionLoading(userId);
    try {
      const { error } = await supabase.from('user_roles').delete().eq('user_id', userId);
      if (error) throw error;
      toast({ title: 'Admin removed', description: `${email} has been removed from admins` });
      await fetchAdmins();
    } catch (err: any) {
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
    }
    setActionLoading(null);
  };

  if (loadingAdmins || loadingPerms) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Pending Users */}
      {pendingUsers.length > 0 && (
        <Card className="border-amber-500/30 bg-amber-50/50 dark:bg-amber-950/20">
          <CardHeader>
            <div className="flex items-center gap-2">
              <Clock className="h-5 w-5 text-amber-600" />
              <CardTitle className="text-base">Pending Approval</CardTitle>
            </div>
            <CardDescription>
              These users have created accounts but haven't been assigned a role yet.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {pendingUsers.map(user => (
                <div key={user.user_id} className="flex items-center justify-between p-3 rounded-lg bg-background border">
                  <div className="flex items-center gap-3">
                    <Avatar className="h-8 w-8">
                      <AvatarFallback className="text-xs bg-amber-100 text-amber-700">
                        {user.email.slice(0, 2).toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                    <div>
                      <p className="font-medium text-sm">{user.email}</p>
                      <p className="text-xs text-muted-foreground">
                        Signed up {new Date(user.created_at).toLocaleDateString()}
                      </p>
                    </div>
                    <Badge variant="outline" className="text-amber-600 border-amber-300">Pending</Badge>
                  </div>
                  <Button
                    size="sm"
                    onClick={() => handleApproveUser(user.user_id, user.email)}
                    disabled={actionLoading === user.user_id}
                  >
                    <UserPlus className="h-4 w-4 mr-1" />
                    {actionLoading === user.user_id ? 'Approving...' : 'Approve as Admin'}
                  </Button>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Tab Permissions */}
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
                  <th className="text-center py-3 px-2 font-medium min-w-[80px]">Actions</th>
                </tr>
              </thead>
              <tbody>
                {adminUsers.map(admin => {
                  const displayName = getAdminDisplayName(admin.email);
                  const initials = displayName.slice(0, 2).toUpperCase();
                  const isSuperAdmin = admin.role === 'super_admin';

                  return (
                    <tr key={admin.user_id} className="border-b hover:bg-muted/50">
                      <td className="py-3 px-2">
                        <div className="flex items-center gap-2">
                          <Avatar className="h-8 w-8">
                            <AvatarFallback className="text-xs bg-primary/10">
                              {initials}
                            </AvatarFallback>
                          </Avatar>
                          <div>
                            <span className="font-medium">{displayName}</span>
                            {isSuperAdmin && (
                              <Badge variant="secondary" className="ml-2 text-[10px] py-0">Super</Badge>
                            )}
                          </div>
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
                      <td className="text-center py-3 px-2">
                        {!isSuperAdmin && (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-destructive hover:text-destructive hover:bg-destructive/10"
                            onClick={() => handleRemoveAdmin(admin.user_id, admin.email)}
                            disabled={actionLoading === admin.user_id}
                          >
                            <UserMinus className="h-4 w-4" />
                          </Button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};
