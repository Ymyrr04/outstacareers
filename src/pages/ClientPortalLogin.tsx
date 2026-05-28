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

const ClientPortalLogin = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data }) => {
      if (data.session) {
        const { data: cpu } = await supabase
          .from('client_portal_users')
          .select('must_change_password')
          .eq('user_id', data.session.user.id)
          .maybeSingle();
        if (cpu) {
          navigate(cpu.must_change_password ? '/client-portal/change-password' : '/client-portal');
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
        .select('must_change_password')
        .eq('user_id', data.user!.id)
        .maybeSingle();

      if (pErr || !cpu) {
        await supabase.auth.signOut();
        throw new Error('This account is not registered as a client portal user. Contact your account manager.');
      }

      navigate(cpu.must_change_password ? '/client-portal/change-password' : '/client-portal');
    } catch (err: any) {
      toast({ title: 'Login failed', description: err.message, variant: 'destructive' });
    } finally {
      setLoading(false);
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
          </form>
        </CardContent>
      </Card>
    </div>
  );
};

export default ClientPortalLogin;
