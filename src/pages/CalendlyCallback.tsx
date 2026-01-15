import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';
import { Loader2, CheckCircle, XCircle } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

export default function CalendlyCallback() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading');
  const [message, setMessage] = useState('Processing Calendly authorization...');

  useEffect(() => {
    const code = searchParams.get('code');
    const error = searchParams.get('error');

    if (error) {
      setStatus('error');
      setMessage('Authorization was denied or cancelled.');
      return;
    }

    if (!code) {
      setStatus('error');
      setMessage('No authorization code received.');
      return;
    }

    exchangeCode(code);
  }, [searchParams]);

  const exchangeCode = async (code: string) => {
    try {
      const { data, error } = await supabase.functions.invoke('calendly-auth', {
        body: { action: 'exchange-code', code },
      });

      if (error) throw error;

      // Store tokens in localStorage (in production, store securely in database)
      localStorage.setItem('calendly_access_token', data.access_token);
      localStorage.setItem('calendly_refresh_token', data.refresh_token);
      localStorage.setItem('calendly_token_expiry', String(Date.now() + data.expires_in * 1000));

      // Get user info
      const userResponse = await supabase.functions.invoke('calendly-auth', {
        body: { action: 'get-user', accessToken: data.access_token },
      });

      if (userResponse.data?.resource) {
        localStorage.setItem('calendly_user_uri', userResponse.data.resource.uri);
        localStorage.setItem('calendly_user_name', userResponse.data.resource.name);
      }

      setStatus('success');
      setMessage('Calendly connected successfully!');
      
      toast({
        title: 'Calendly Connected',
        description: 'Your Calendly account has been linked successfully.',
      });

      // Redirect back to admin after a short delay
      setTimeout(() => navigate('/admin'), 2000);
    } catch (error: any) {
      console.error('Calendly exchange error:', error);
      setStatus('error');
      setMessage(error.message || 'Failed to complete authorization.');
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <CardTitle className="flex items-center justify-center gap-2">
            {status === 'loading' && <Loader2 className="h-6 w-6 animate-spin text-primary" />}
            {status === 'success' && <CheckCircle className="h-6 w-6 text-green-500" />}
            {status === 'error' && <XCircle className="h-6 w-6 text-destructive" />}
            Calendly Authorization
          </CardTitle>
        </CardHeader>
        <CardContent className="text-center space-y-4">
          <p className="text-muted-foreground">{message}</p>
          
          {status === 'error' && (
            <Button onClick={() => navigate('/admin')} variant="outline">
              Return to Admin
            </Button>
          )}
          
          {status === 'success' && (
            <p className="text-sm text-muted-foreground">Redirecting to admin panel...</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
