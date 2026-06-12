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
              <Label htmlFor="password">Password</Label>
              <Input id="password" type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
            </div>
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Sign in'}
            </Button>
            <p className="text-xs text-muted-foreground text-center">First time? Use the default password provided by your admin.</p>
          </form>
        </CardContent>
      </Card>
    </div>
  );
};

export default PortalLogin;
