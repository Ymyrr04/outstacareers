import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

// Allowed origins for CORS - add your production domain(s) here
const allowedOrigins = [
  'https://ohxtavjababtrcrkgndq.lovableproject.com',
  'https://lovable.dev',
  // Lovable preview domains
];

// Check if origin is allowed (also allows Lovable preview URLs)
function isAllowedOrigin(origin: string | null): boolean {
  if (!origin) return false;
  
  // Allow exact matches
  if (allowedOrigins.includes(origin)) return true;
  
  // Allow Lovable preview domains (*.lovable.app, *.lovableproject.com)
  if (origin.endsWith('.lovable.app') || origin.endsWith('.lovableproject.com')) {
    return true;
  }
  
  // Allow localhost for development
  if (origin.startsWith('http://localhost:') || origin.startsWith('http://127.0.0.1:')) {
    return true;
  }
  
  return false;
}

function getCorsHeaders(req: Request): Record<string, string> {
  const origin = req.headers.get('origin');
  const allowedOrigin = isAllowedOrigin(origin) ? origin! : allowedOrigins[0];
  
  return {
    'Access-Control-Allow-Origin': allowedOrigin,
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  };
}

serve(async (req) => {
  const corsHeaders = getCorsHeaders(req);
  
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    console.log('Fetching exchange rate from open.er-api.com');
    const response = await fetch('https://open.er-api.com/v6/latest/USD');
    
    if (!response.ok) {
      console.error('Exchange rate API returned error:', response.status);
      throw new Error('Failed to fetch exchange rate');
    }

    const data = await response.json();
    const phpRate = data.rates?.PHP;

    if (!phpRate) {
      console.error('PHP rate not found in response:', data);
      throw new Error('PHP rate not found');
    }

    console.log('Successfully fetched PHP rate:', phpRate);
    return new Response(
      JSON.stringify({ rate: phpRate, success: true }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Exchange rate error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ success: false, error: errorMessage }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    );
  }
});
