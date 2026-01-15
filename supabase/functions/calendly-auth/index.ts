import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const CALENDLY_CLIENT_ID = Deno.env.get('CALENDLY_CLIENT_ID');
const CALENDLY_CLIENT_SECRET = Deno.env.get('CALENDLY_CLIENT_SECRET');
const REDIRECT_URI = 'https://outstacareers.lovable.app/auth/calendly/callback';

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { action, code } = await req.json();

    if (action === 'get-auth-url') {
      // Generate OAuth authorization URL
      const authUrl = new URL('https://auth.calendly.com/oauth/authorize');
      authUrl.searchParams.set('client_id', CALENDLY_CLIENT_ID!);
      authUrl.searchParams.set('response_type', 'code');
      authUrl.searchParams.set('redirect_uri', REDIRECT_URI);

      return new Response(JSON.stringify({ authUrl: authUrl.toString() }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (action === 'exchange-code') {
      // Exchange authorization code for access token
      const tokenResponse = await fetch('https://auth.calendly.com/oauth/token', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
          grant_type: 'authorization_code',
          client_id: CALENDLY_CLIENT_ID!,
          client_secret: CALENDLY_CLIENT_SECRET!,
          code: code,
          redirect_uri: REDIRECT_URI,
        }),
      });

      const tokenData = await tokenResponse.json();

      if (!tokenResponse.ok) {
        console.error('Calendly token error:', tokenData);
        throw new Error(tokenData.error_description || 'Failed to exchange code');
      }

      return new Response(JSON.stringify(tokenData), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (action === 'get-user') {
      const { accessToken } = await req.json();
      
      const userResponse = await fetch('https://api.calendly.com/users/me', {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
      });

      const userData = await userResponse.json();

      if (!userResponse.ok) {
        throw new Error('Failed to get user info');
      }

      return new Response(JSON.stringify(userData), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (action === 'get-event-types') {
      const { accessToken, userUri } = await req.json();
      
      const eventTypesResponse = await fetch(`https://api.calendly.com/event_types?user=${userUri}`, {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
      });

      const eventTypesData = await eventTypesResponse.json();

      if (!eventTypesResponse.ok) {
        throw new Error('Failed to get event types');
      }

      return new Response(JSON.stringify(eventTypesData), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (action === 'create-scheduling-link') {
      const { accessToken, eventTypeUri, inviteeName, inviteeEmail } = await req.json();
      
      const schedulingLinkResponse = await fetch('https://api.calendly.com/scheduling_links', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          max_event_count: 1,
          owner: eventTypeUri,
          owner_type: 'EventType',
        }),
      });

      const schedulingLinkData = await schedulingLinkResponse.json();

      if (!schedulingLinkResponse.ok) {
        console.error('Calendly scheduling link error:', schedulingLinkData);
        throw new Error('Failed to create scheduling link');
      }

      return new Response(JSON.stringify(schedulingLinkData), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({ error: 'Invalid action' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error: unknown) {
    console.error('Calendly auth error:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
