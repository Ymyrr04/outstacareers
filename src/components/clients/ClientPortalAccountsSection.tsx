import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { Loader2, Plus, Trash2, KeyRound, User as UserIcon, Copy, Mail, Phone, ChevronDown, ChevronUp } from 'lucide-react';
import { format } from 'date-fns';

interface PortalUser {
  id: string;
  username: string | null;
  email: string | null;
  must_change_password: boolean;
  created_at: string;
  full_name: string | null;
  primary_email: string | null;
  secondary_email: string | null;
  phone: string | null;
  is_first_login: boolean | null;
}

const DEFAULT_PASSWORD = 'OutSta2026!';

export function ClientPortalAccountsSection({ clientId }: { clientId: string }) {
  const { toast } = useToast();
  const [accounts, setAccounts] = useState<PortalUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState(DEFAULT_PASSWORD);
  const [busy, setBusy] = useState(false);
  const [resetFor, setResetFor] = useState<string | null>(null);
  const [resetPwd, setResetPwd] = useState(DEFAULT_PASSWORD);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  const fetchAccounts = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('client_portal_users')
      .select('id, username, email, must_change_password, created_at, full_name, primary_email, secondary_email, phone, is_first_login')
      .eq('client_id', clientId)
      .order('created_at', { ascending: false });
    if (error) toast({ title: 'Failed to load accounts', description: error.message, variant: 'destructive' });
    setAccounts((data || []) as PortalUser[]);
    setLoading(false);
  };

  useEffect(() => { fetchAccounts(); /* eslint-disable-next-line */ }, [clientId]);

  const handleCreate = async () => {
    if (!username.trim() || !password) {
      toast({ title: 'Username and password are required', variant: 'destructive' });
      return;
    }
    setBusy(true);
    const { data, error } = await supabase.functions.invoke('create-client-portal-account', {
      body: { action: 'create', clientId, username: username.trim(), password },
    });
    setBusy(false);
    if (error || (data as any)?.error) {
      toast({ title: 'Could not create account', description: (data as any)?.error || error?.message, variant: 'destructive' });
      return;
    }
    toast({ title: 'Account created', description: `Login: ${username.trim()}  /  Password: ${password}` });
    setUsername('');
    setPassword(DEFAULT_PASSWORD);
    setShowCreate(false);
    fetchAccounts();
  };

  const handleReset = async (portalUserId: string) => {
    if (!resetPwd || resetPwd.length < 6) {
      toast({ title: 'Password must be at least 6 characters', variant: 'destructive' });
      return;
    }
    setBusy(true);
    const { data, error } = await supabase.functions.invoke('create-client-portal-account', {
      body: { action: 'reset_password', portalUserId, password: resetPwd },
    });
    setBusy(false);
    if (error || (data as any)?.error) {
      toast({ title: 'Reset failed', description: (data as any)?.error || error?.message, variant: 'destructive' });
      return;
    }
    toast({ title: 'Password reset', description: `New password: ${resetPwd}` });
    setResetFor(null);
    setResetPwd(DEFAULT_PASSWORD);
    fetchAccounts();
  };

  const handleDelete = async (portalUserId: string) => {
    if (!confirm('Delete this portal account? The client will no longer be able to log in.')) return;
    setBusy(true);
    const { data, error } = await supabase.functions.invoke('create-client-portal-account', {
      body: { action: 'delete', portalUserId },
    });
    setBusy(false);
    if (error || (data as any)?.error) {
      toast({ title: 'Delete failed', description: (data as any)?.error || error?.message, variant: 'destructive' });
      return;
    }
    toast({ title: 'Account deleted' });
    fetchAccounts();
  };

  const displayLogin = (a: PortalUser) =>
    a.username || (a.email && !a.email.endsWith('@portal.outsta.local') ? a.email : '—');

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          Create login accounts so this client can review and approve timesheets at <code className="text-xs">/client-portal</code>.
        </p>
        <Button size="sm" onClick={() => setShowCreate(v => !v)}>
          <Plus className="w-4 h-4 mr-1" /> New account
        </Button>
      </div>

      {showCreate && (
        <Card className="p-4 space-y-3 border-primary/30">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label htmlFor="new-username">Username</Label>
              <Input
                id="new-username"
                placeholder="e.g. alsea"
                value={username}
                onChange={(e) => setUsername(e.target.value.toLowerCase().replace(/[^a-z0-9._-]/g, ''))}
              />
              <p className="text-xs text-muted-foreground">3-40 chars, lowercase letters/numbers/._-</p>
            </div>
            <div className="space-y-1">
              <Label htmlFor="new-password">Initial password</Label>
              <Input
                id="new-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">Client will be asked to change on first login.</p>
            </div>
          </div>
          <div className="flex gap-2 justify-end">
            <Button size="sm" variant="ghost" onClick={() => { setShowCreate(false); setUsername(''); setPassword(DEFAULT_PASSWORD); }}>Cancel</Button>
            <Button size="sm" onClick={handleCreate} disabled={busy}>
              {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Create account'}
            </Button>
          </div>
        </Card>
      )}

      {loading ? (
        <div className="flex justify-center py-6"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /></div>
      ) : accounts.length === 0 ? (
        <Card className="p-6 text-center text-sm text-muted-foreground">No portal accounts yet.</Card>
      ) : (
        <div className="space-y-2">
          {accounts.map((a) => (
            <Card key={a.id} className="p-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <UserIcon className="w-4 h-4 text-muted-foreground shrink-0" />
                    <span className="font-medium truncate">{displayLogin(a)}</span>
                    {a.must_change_password && (
                      <span className="text-[10px] uppercase tracking-wide bg-amber-100 text-amber-800 px-1.5 py-0.5 rounded">
                        Password not changed
                      </span>
                    )}
                    <button
                      type="button"
                      onClick={() => { navigator.clipboard.writeText(displayLogin(a)); toast({ title: 'Copied' }); }}
                      className="text-muted-foreground hover:text-foreground"
                      title="Copy login"
                    >
                      <Copy className="w-3 h-3" />
                    </button>
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Created {format(new Date(a.created_at), 'MMM d, yyyy')}
                  </p>

                  {resetFor === a.id && (
                    <div className="mt-3 flex items-end gap-2">
                      <div className="flex-1 space-y-1">
                        <Label htmlFor={`reset-${a.id}`} className="text-xs">New password</Label>
                        <Input id={`reset-${a.id}`} value={resetPwd} onChange={(e) => setResetPwd(e.target.value)} />
                      </div>
                      <Button size="sm" onClick={() => handleReset(a.id)} disabled={busy}>
                        {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Save'}
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => { setResetFor(null); setResetPwd(DEFAULT_PASSWORD); }}>Cancel</Button>
                    </div>
                  )}
                </div>
                {resetFor !== a.id && (
                  <div className="flex gap-1 shrink-0">
                    <Button size="sm" variant="outline" onClick={() => { setResetFor(a.id); setResetPwd(DEFAULT_PASSWORD); }}>
                      <KeyRound className="w-3 h-3 mr-1" /> Reset password
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => handleDelete(a.id)} className="text-destructive hover:text-destructive">
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                )}
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
