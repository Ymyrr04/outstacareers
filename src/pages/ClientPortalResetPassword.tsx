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

// Landing page for the password recovery email link.
// Supabase's recovery link authenticates the session, then this page lets
// the user set a new password.
const ClientPortalResetPassword = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [pw1, setPw1] = useState('');
  const [pw2, setPw2] = useState('');
  const [loading, setLoading] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    (async () => {
      // Wait for Supabase to process the recovery token from the URL hash.
      await new Promise((r) => setTimeout(r, 200));
      const { data } = await supabase.auth.getSession();
      if (!data.session) {
        toast({ title: 'Reset link expired or invalid', description: 'Please request a new password reset.', variant: 'destructive' });
        navigate('/client-portal/login');
        return;
      }
      // Make sure this user is a client portal user
      const { data: cpu } = await supabase
        .from('client_portal_users')
        .select('id')
        .eq('user_id', data.session.user.id)
        .maybeSingle();
      if (!cpu) {
        await supabase.auth.signOut();
        navigate('/client-portal/login');
        return;
      }
      setReady(true);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (pw1.length < 8 || !/[A-Z]/.test(pw1) || !/[0-9]/.test(pw1)) {
      toast({ title: 'Password does not meet requirements', description: 'Min 8 characters, 1 uppercase, 1 number.', variant: 'destructive' });
      return;
    }
    if (pw1 !== pw2) {
      toast({ title: 'Passwords do not match', variant: 'destructive' });
      return;
    }
    setLoading(true);
    try {
      const { error } = await supabase.auth.updateUser({ password: pw1 });
      if (error) throw error;
      const { data: s } = await supabase.auth.getSession();
      if (s.session) {
        await supabase
          .from('client_portal_users')
          .update({ password_reset_required: false, must_change_password: false })
          .eq('user_id', s.session.user.id);
      }
      toast({ title: 'Password updated', description: 'You can now sign in with your new password.' });
      navigate('/client-portal');
    } catch (err: any) {
      toast({ title: 'Failed', description: err.message, variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  if (!ready) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-muted/30">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-muted/30 p-4">
      <Helmet><title>Reset Password | OutStaWorkforce</title></Helmet>
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>Reset your password</CardTitle>
          <CardDescription>Choose a new password for your client portal account.</CardDescription>
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
            <ul className="text-xs text-muted-foreground space-y-1 pl-1">
              <li>• At least 8 characters</li>
              <li>• At least 1 uppercase letter</li>
              <li>• At least 1 number</li>
            </ul>
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Update password'}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
};

export default ClientPortalResetPassword;
