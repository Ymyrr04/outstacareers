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

const PortalChangePassword = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [pw1, setPw1] = useState('');
  const [pw2, setPw2] = useState('');
  const [loading, setLoading] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      // Validate session against the server (not just localStorage). A stale
      // token from a previously deleted account would pass getSession but then
      // fail updateUser with "Auth session missing".
      const { data: userData, error } = await supabase.auth.getUser();
      if (error || !userData.user) {
        await supabase.auth.signOut();
        toast({ title: 'Session expired', description: 'Please sign in again.', variant: 'destructive' });
        navigate('/portal/login');
        return;
      }
      setUserId(userData.user.id);
    })();
  }, [navigate, toast]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (pw1.length < 8) {
      toast({ title: 'Password too short', description: 'Use at least 8 characters.', variant: 'destructive' });
      return;
    }
    if (pw1 !== pw2) {
      toast({ title: 'Passwords do not match', variant: 'destructive' });
      return;
    }
    if (pw1 === 'OutSta2026!') {
      toast({ title: 'Choose a different password', description: 'You cannot reuse the default password.', variant: 'destructive' });
      return;
    }
    setLoading(true);
    try {
      const { error: pErr } = await supabase.auth.updateUser({ password: pw1 });
      if (pErr) throw pErr;
      const { error: uErr } = await supabase
        .from('contractor_portal_users')
        .update({ must_change_password: false })
        .eq('user_id', userId!);
      if (uErr) throw uErr;
      toast({ title: 'Password updated' });
      navigate('/portal');
    } catch (err: any) {
      toast({ title: 'Failed', description: err.message, variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-muted/30 p-4">
      <Helmet><title>Set New Password | OutSta PL Portal</title></Helmet>
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>Set a new password</CardTitle>
          <CardDescription>Please change your default password before continuing.</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="pw1">New password</Label>
              <Input id="pw1" type="password" autoComplete="new-password" required value={pw1} onChange={(e) => setPw1(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="pw2">Confirm new password</Label>
              <Input id="pw2" type="password" autoComplete="new-password" required value={pw2} onChange={(e) => setPw2(e.target.value)} />
            </div>
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Update password'}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
};

export default PortalChangePassword;
