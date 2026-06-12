import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { Loader2 } from 'lucide-react';
import { Helmet } from 'react-helmet-async';

const PortalLogin = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [forgotOpen, setForgotOpen] = useState(false);
  const [forgotEmail, setForgotEmail] = useState('');
  const [forgotLoading, setForgotLoading] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data }) => {
      if (data.session) {
        const { data: portalRows } = await supabase
          .from('contractor_portal_users')
          .select('must_change_password')
          .eq('user_id', data.session.user.id);
        if (portalRows && portalRows.length > 0) {
          const mustChange = portalRows.some((r: any) => r.must_change_password);
          navigate(mustChange ? '/portal/change-password' : '/portal');
        }
      }
    });
  }, [navigate]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      // Clear any stale session (e.g. from a previously deleted account with
      // the same email) before signing in fresh.
      await supabase.auth.signOut();
      const { data, error } = await supabase.auth.signInWithPassword({ email: email.trim().toLowerCase(), password });
      if (error) throw error;

      // Verify this user is a contractor portal user (not an admin). A contractor
      // may be linked to multiple assignments, so use a list query, not .maybeSingle().
      const { data: portalRows, error: pErr } = await supabase
        .from('contractor_portal_users')
        .select('must_change_password')
        .eq('user_id', data.user!.id);

      if (pErr || !portalRows || portalRows.length === 0) {
        await supabase.auth.signOut();
        throw new Error('This account is not registered as a contractor. Contact your admin.');
      }

      const mustChange = portalRows.some((r: any) => r.must_change_password);
      navigate(mustChange ? '/portal/change-password' : '/portal');
    } catch (err: any) {
      toast({ title: 'Login failed', description: err.message, variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  const handleForgot = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleaned = forgotEmail.trim().toLowerCase();
    if (!cleaned) return;
    setForgotLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('contractor-portal-recovery', {
        body: { email: cleaned },
      });
      if (error) throw error;
      toast({ title: 'Check your email', description: data?.message || 'If that account exists, a reset link has been sent.' });
      setForgotOpen(false);
      setForgotEmail('');
    } catch (err: any) {
      toast({ title: 'Failed', description: err.message, variant: 'destructive' });
    } finally {
      setForgotLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-muted/30 p-4">
      <Helmet><title>Contractor Login | OutSta PL Portal</title></Helmet>
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>OutSta PL Portal</CardTitle>
          <CardDescription>Log in to submit your weekly hours.</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleLogin} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input id="email" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
            </div>
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="password">Password</Label>
                <button
                  type="button"
                  className="text-xs text-primary hover:underline"
                  onClick={() => { setForgotEmail(email); setForgotOpen((v) => !v); }}
                >
                  Forgot password?
                </button>
              </div>
              <Input id="password" type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
            </div>
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Sign in'}
            </Button>
            <p className="text-xs text-muted-foreground text-center">First time? Use the default password provided by your admin.</p>
          </form>
          {forgotOpen && (
            <form onSubmit={handleForgot} className="mt-6 space-y-3 border-t pt-4">
              <div className="space-y-2">
                <Label htmlFor="forgot-email">Enter your account email</Label>
                <Input
                  id="forgot-email"
                  type="email"
                  required
                  value={forgotEmail}
                  onChange={(e) => setForgotEmail(e.target.value)}
                  placeholder="you@example.com"
                />
                <p className="text-xs text-muted-foreground">We'll email you a link to reset your password.</p>
              </div>
              <div className="flex gap-2">
                <Button type="submit" className="flex-1" disabled={forgotLoading}>
                  {forgotLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Send reset link'}
                </Button>
                <Button type="button" variant="outline" onClick={() => setForgotOpen(false)}>Cancel</Button>
              </div>
            </form>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default PortalLogin;
