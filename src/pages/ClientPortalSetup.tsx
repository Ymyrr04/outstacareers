import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { Loader2, Check, Lock, User, Sparkles } from 'lucide-react';
import { Helmet } from 'react-helmet-async';

type Step = 1 | 2 | 3;

const ClientPortalSetup = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [step, setStep] = useState<Step>(1);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [userId, setUserId] = useState<string>('');

  // Step 1 - password
  const [pw1, setPw1] = useState('');
  const [pw2, setPw2] = useState('');

  // Step 2 - profile
  const [fullName, setFullName] = useState('');
  const [username, setUsername] = useState('');
  const [primaryEmail, setPrimaryEmail] = useState('');
  const [secondaryEmail, setSecondaryEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [companyName, setCompanyName] = useState('');

  useEffect(() => {
    (async () => {
      const { data: session } = await supabase.auth.getSession();
      if (!session.session) { navigate('/client-portal/login'); return; }
      const uid = session.session.user.id;
      setUserId(uid);

      const { data: cpu } = await supabase
        .from('client_portal_users')
        .select('username, email, full_name, primary_email, secondary_email, phone, is_first_login, client_id')
        .eq('user_id', uid)
        .maybeSingle();

      if (!cpu) {
        await supabase.auth.signOut();
        navigate('/client-portal/login');
        return;
      }
      if (!(cpu as any).is_first_login) {
        navigate('/client-portal');
        return;
      }

      const row = cpu as any;
      setUsername(row.username || '');
      setFullName(row.full_name || '');
      // primary_email pre-fill: real email if available, else fall back to admin-provided "email" field
      const synthetic = (row.email || '').endsWith('@portal.outsta.local');
      setPrimaryEmail(row.primary_email || (synthetic ? '' : (row.email || '')));
      setSecondaryEmail(row.secondary_email || '');
      setPhone(row.phone || '');

      if (row.client_id) {
        const { data: cl } = await supabase.from('clients').select('company_name').eq('id', row.client_id).maybeSingle();
        setCompanyName((cl as any)?.company_name || '');
      }

      setLoading(false);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const validatePassword = (p: string) =>
    p.length >= 8 && /[A-Z]/.test(p) && /[0-9]/.test(p);

  const submitPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validatePassword(pw1)) {
      toast({ title: 'Password does not meet requirements', description: 'Min 8 characters, 1 uppercase, 1 number.', variant: 'destructive' });
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
    setSaving(true);
    try {
      const { error } = await supabase.auth.updateUser({ password: pw1 });
      if (error) throw error;
      await supabase
        .from('client_portal_users')
        .update({ password_reset_required: false })
        .eq('user_id', userId);
      setStep(2);
    } catch (err: any) {
      toast({ title: 'Could not set password', description: err.message, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const submitProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!username.trim() || !primaryEmail.trim()) {
      toast({ title: 'Please fill in all required fields', variant: 'destructive' });
      return;
    }
    setSaving(true);
    try {
      const { data, error } = await supabase.functions.invoke('complete-client-portal-setup', {
        body: {
          full_name: fullName.trim() || null,
          username: username.trim().toLowerCase(),
          primary_email: primaryEmail.trim(),
          secondary_email: secondaryEmail.trim() || null,
          phone: phone.trim() || null,
          company_name: companyName.trim() || null,
        },
      });
      if (error || (data as any)?.error) throw new Error((data as any)?.error || error?.message);
      setStep(3);
    } catch (err: any) {
      toast({ title: 'Could not save profile', description: err.message, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };


  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-muted/30">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const StepDot = ({ n, label, icon: Icon }: { n: Step; label: string; icon: any }) => (
    <div className="flex flex-col items-center gap-1 flex-1">
      <div className={`w-9 h-9 rounded-full flex items-center justify-center border-2 ${
        step === n ? 'bg-primary text-primary-foreground border-primary'
        : step > n ? 'bg-primary/10 text-primary border-primary' : 'bg-muted text-muted-foreground border-muted'
      }`}>
        {step > n ? <Check className="w-4 h-4" /> : <Icon className="w-4 h-4" />}
      </div>
      <span className={`text-[11px] ${step === n ? 'text-foreground font-medium' : 'text-muted-foreground'}`}>{label}</span>
    </div>
  );

  return (
    <div className="min-h-screen flex items-center justify-center bg-muted/30 p-4">
      <Helmet><title>Account Setup | OutStaWorkforce</title></Helmet>
      <Card className="w-full max-w-lg">
        <CardHeader>
          <CardTitle>Welcome to OutStaWorkforce</CardTitle>
          <CardDescription>Let's get your account set up. This only takes a minute.</CardDescription>
          <div className="flex items-center gap-2 pt-4">
            <StepDot n={1} label="Password" icon={Lock} />
            <div className="h-px flex-1 bg-border -mt-5" />
            <StepDot n={2} label="Profile" icon={User} />
            <div className="h-px flex-1 bg-border -mt-5" />
            <StepDot n={3} label="Done" icon={Sparkles} />
          </div>
        </CardHeader>

        <CardContent>
          {step === 1 && (
            <form onSubmit={submitPassword} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="pw1">Create your new password</Label>
                <Input id="pw1" type="password" autoComplete="new-password" required value={pw1} onChange={(e) => setPw1(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="pw2">Confirm new password</Label>
                <Input id="pw2" type="password" autoComplete="new-password" required value={pw2} onChange={(e) => setPw2(e.target.value)} />
              </div>
              <ul className="text-xs text-muted-foreground space-y-1 pl-1">
                <li className={pw1.length >= 8 ? 'text-emerald-600' : ''}>• At least 8 characters</li>
                <li className={/[A-Z]/.test(pw1) ? 'text-emerald-600' : ''}>• At least 1 uppercase letter</li>
                <li className={/[0-9]/.test(pw1) ? 'text-emerald-600' : ''}>• At least 1 number</li>
              </ul>
              <Button type="submit" className="w-full" disabled={saving}>
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Continue'}
              </Button>
            </form>
          )}

              <div className="space-y-2">
                <Label htmlFor="fullName">Full name</Label>
                <Input id="fullName" value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="Optional" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="username">Username *</Label>
                <Input
                  id="username"
                  required
                  value={username}
                  onChange={(e) => setUsername(e.target.value.toLowerCase().replace(/[^a-z0-9._-]/g, ''))}
                />
                <p className="text-xs text-muted-foreground">Used to sign in. 3-40 chars, lowercase letters/numbers/._-</p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="primaryEmail">Primary email *</Label>
                <Input id="primaryEmail" type="email" required value={primaryEmail} onChange={(e) => setPrimaryEmail(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="secondaryEmail">Secondary email</Label>
                <Input id="secondaryEmail" type="email" value={secondaryEmail} onChange={(e) => setSecondaryEmail(e.target.value)} placeholder="Optional" />
                <p className="text-xs text-muted-foreground">Used as a backup for account recovery and email notifications.</p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="phone">Phone number</Label>
                <Input id="phone" type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="Optional" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="company">Company</Label>
                <Input id="company" value={companyName} onChange={(e) => setCompanyName(e.target.value)} />
                <p className="text-xs text-muted-foreground">Pre-filled from your account. You can update it if needed.</p>
              </div>

                <p className="text-xs text-muted-foreground">Managed by your account manager.</p>
              </div>
              <Button type="submit" className="w-full" disabled={saving}>
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Save profile'}
              </Button>
            </form>
          )}

          {step === 3 && (
            <div className="text-center py-6 space-y-4">
              <div className="mx-auto w-14 h-14 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center">
                <Check className="w-7 h-7" />
              </div>
              <div>
                <h3 className="text-lg font-semibold">Your account is set up.</h3>
                <p className="text-sm text-muted-foreground mt-1">Welcome to OutStaWorkforce.</p>
              </div>
              <Button onClick={() => navigate('/client-portal')} className="w-full">
                Go to my timesheets
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default ClientPortalSetup;
