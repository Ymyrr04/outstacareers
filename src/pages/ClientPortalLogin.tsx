import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';

import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { getErrorMessage } from '@/lib/errors';

import { Loader2 } from 'lucide-react';
import { Helmet } from 'react-helmet-async';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';

type RecoveryMode = null | 'username' | 'password';
const ClientPortalLogin = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const setupExpired = searchParams.get('setup_expired') === '1';
  const { toast } = useToast();
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);


  const [mode, setMode] = useState<RecoveryMode>(null);
  const [recoveryInput, setRecoveryInput] = useState('');
  const [recoveryBusy, setRecoveryBusy] = useState(false);
  const [recoverySent, setRecoverySent] = useState<string | null>(null);

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data }) => {
      if (data.session) {
        const { data: cpu } = await supabase
          .from('client_portal_users')
          .select('must_change_password, is_first_login')
          .eq('user_id', data.session.user.id)
          .maybeSingle();
        if (cpu) {
          if ((cpu as any).is_first_login) navigate('/client-portal/setup');
          else if (cpu.must_change_password) navigate('/client-portal/change-password');
          else navigate('/client-portal');
        }
      }
    });
  }, [navigate]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const raw = identifier.trim().toLowerCase();
      const loginEmail = raw.includes('@') ? raw : `${raw}@portal.outsta.local`;

      const { data, error } = await supabase.auth.signInWithPassword({ email: loginEmail, password });
      if (error) throw error;

      const { data: cpu, error: pErr } = await supabase
        .from('client_portal_users')
        .select('must_change_password, is_first_login')
        .eq('user_id', data.user!.id)
        .maybeSingle();

      if (pErr || !cpu) {
        await supabase.auth.signOut();
        throw new Error('This account is not registered as a client portal user. Contact your account manager.');
      }

      if ((cpu as any).is_first_login) navigate('/client-portal/setup');
      else if (cpu.must_change_password) navigate('/client-portal/change-password');
      else navigate('/client-portal');
    } catch (err: any) {
      toast({ title: 'Login failed', description: await getErrorMessage(err, 'Incorrect username or password. Please try again.'), variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  const openRecovery = (m: RecoveryMode) => {
    setMode(m);
    setRecoveryInput('');
    setRecoverySent(null);
  };

  const submitRecovery = async () => {
    if (!recoveryInput.trim()) return;
    setRecoveryBusy(true);
    try {
      const { data, error } = await supabase.functions.invoke('client-portal-recovery', {
        body: {
          action: mode === 'username' ? 'forgot_username' : 'forgot_password',
          identifier: recoveryInput.trim(),
        },
      });
      if (error) throw error;
      setRecoverySent((data as any)?.message || 'If that account exists, an email has been sent.');
    } catch (err: any) {
      // Still show generic message to avoid leaking info
      setRecoverySent(
        mode === 'username'
          ? 'If that email is associated with an account, your username has been sent.'
          : 'If that account exists, a reset link has been sent to your email.'
      );
    } finally {
      setRecoveryBusy(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-muted/30 p-4">
      <Helmet><title>Client Login | OutStaWorkforce</title></Helmet>
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>OutStaWorkforce</CardTitle>
          <CardDescription>Review and approve your contractors' weekly hours.</CardDescription>
        </CardHeader>
        <CardContent>
          {setupExpired && (
            <div className="mb-4 rounded-md border border-amber-300 bg-amber-50 text-amber-900 px-3 py-2 text-sm">
              Your session ended during setup. Please sign in again to continue.
            </div>
          )}

          <form onSubmit={handleLogin} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="identifier">Username or email</Label>
              <Input id="identifier" type="text" autoComplete="username" required value={identifier} onChange={(e) => setIdentifier(e.target.value)} placeholder="yourname" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <Input id="password" type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
            </div>
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Sign in'}
            </Button>
            <div className="flex justify-between text-xs text-muted-foreground pt-1">
              <button type="button" onClick={() => openRecovery('username')} className="hover:underline hover:text-foreground">
                Forgot username?
              </button>
              <button type="button" onClick={() => openRecovery('password')} className="hover:underline hover:text-foreground">
                Forgot password?
              </button>
            </div>
          </form>
        </CardContent>
      </Card>

      <Dialog open={mode !== null} onOpenChange={(o) => !o && setMode(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>{mode === 'username' ? 'Recover your username' : 'Reset your password'}</DialogTitle>
            <DialogDescription>
              {mode === 'username'
                ? 'Enter your primary or secondary email address and we will send your username.'
                : 'Enter your username or email address and we will send you a reset link.'}
            </DialogDescription>
          </DialogHeader>

          {recoverySent ? (
            <div className="text-sm text-muted-foreground py-2">{recoverySent}</div>
          ) : (
            <div className="space-y-3 py-1">
              <Input
                autoFocus
                placeholder={mode === 'username' ? 'you@example.com' : 'username or email'}
                value={recoveryInput}
                onChange={(e) => setRecoveryInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') submitRecovery(); }}
              />
            </div>
          )}

          <DialogFooter>
            {recoverySent ? (
              <Button onClick={() => setMode(null)} className="w-full">Close</Button>
            ) : (
              <Button onClick={submitRecovery} disabled={recoveryBusy || !recoveryInput.trim()} className="w-full">
                {recoveryBusy ? <Loader2 className="w-4 h-4 animate-spin" /> : (mode === 'username' ? 'Send username' : 'Send reset link')}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default ClientPortalLogin;
