import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import JSZip from "https://esm.sh/jszip@3.10.1";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Get user from auth header
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: userError } = await supabase.auth.getUser(token);
    
    if (userError || !user) {
      return new Response(JSON.stringify({ error: 'Invalid token' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Check if admin
    const { data: isAdmin } = await supabase.rpc('is_admin', { _user_id: user.id });
    if (!isAdmin) {
      return new Response(JSON.stringify({ error: 'Not authorized' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { action, jobId } = await req.json();

    if (action === 'start') {
      // Create export job
      const { data: job, error: jobError } = await supabase
        .from('export_jobs')
        .insert({ user_id: user.id, status: 'processing' })
        .select()
        .single();

      if (jobError) throw jobError;

      // Process export in background (don't await)
      processExport(supabase, job.id).catch(console.error);

      return new Response(JSON.stringify({ jobId: job.id }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (action === 'status') {
      const { data: job, error } = await supabase
        .from('export_jobs')
        .select('*')
        .eq('id', jobId)
        .single();

      if (error) throw error;

      return new Response(JSON.stringify(job), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (action === 'download') {
      const { data: job } = await supabase
        .from('export_jobs')
        .select('file_url')
        .eq('id', jobId)
        .single();

      if (!job?.file_url) {
        return new Response(JSON.stringify({ error: 'Export not ready' }), {
          status: 404,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      const { data: signedUrl } = await supabase.storage
        .from('exports')
        .createSignedUrl(job.file_url, 3600); // 1 hour expiry

      return new Response(JSON.stringify({ url: signedUrl?.signedUrl }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({ error: 'Invalid action' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error: unknown) {
    console.error('Export error:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});

async function processExport(supabase: any, jobId: string) {
  try {
    // Fetch all applicants
    const { data: applicants, error: fetchError } = await supabase
      .from('applicants_prescreen')
      .select('*')
      .order('submitted_at', { ascending: false });

    if (fetchError) throw fetchError;

    const applicantsWithCVs = applicants.filter((a: any) => a.cv_file_url);
    
    // Update job with total count
    await supabase
      .from('export_jobs')
      .update({ total_items: applicantsWithCVs.length })
      .eq('id', jobId);

    const zip = new JSZip();
    const dateStr = new Date().toISOString().split('T')[0];

    // Generate CSV
    const csvHeaders = [
      'Full Name', 'Email', 'Phone', 'WhatsApp', 'Location', 'Job Title', 
      'Status', 'Total Score', 'Years Experience', 'Submitted At', 'CV URL'
    ];
    
    const csvRows = applicants.map((a: any) => [
      a.full_name || '',
      a.email || '',
      a.phone || '',
      a.whatsapp || '',
      a.location || '',
      a.job_title || '',
      a.status || '',
      a.total_score?.toString() || '',
      a.years_of_experience?.toString() || '',
      a.submitted_at || '',
      a.cv_file_url || ''
    ]);

    const csvContent = [csvHeaders, ...csvRows]
      .map(row => row.map((cell: string) => `"${cell.replace(/"/g, '""')}"`).join(','))
      .join('\n');

    zip.file(`applicants_${dateStr}.csv`, csvContent);

    // Download CVs
    const cvFolder = zip.folder('CVs');
    let processed = 0;

    for (const applicant of applicantsWithCVs) {
      if (!applicant.cv_file_url) continue;

      try {
        let cvPath = applicant.cv_file_url;
        if (cvPath.includes('/cv-uploads/')) {
          cvPath = cvPath.split('/cv-uploads/').pop()!;
        }

        const { data: fileData, error: downloadError } = await supabase.storage
          .from('cv-uploads')
          .download(cvPath);

        if (!downloadError && fileData) {
          const safeName = (applicant.full_name || 'Unknown').replace(/[^a-zA-Z0-9\s-]/g, '').trim();
          const safeTitle = (applicant.job_title || 'No-Title').replace(/[^a-zA-Z0-9\s-]/g, '').trim();
          const ext = cvPath.split('.').pop() || 'pdf';
          const filename = `${safeName} - ${safeTitle}.${ext}`;
          
          const arrayBuffer = await fileData.arrayBuffer();
          cvFolder?.file(filename, arrayBuffer);
        }
      } catch (e) {
        console.error(`Failed to download CV for ${applicant.full_name}:`, e);
      }

      processed++;
      
      // Update progress every 10 items
      if (processed % 10 === 0) {
        await supabase
          .from('export_jobs')
          .update({ processed_items: processed })
          .eq('id', jobId);
      }
    }

    // Generate final ZIP
    const zipBlob = await zip.generateAsync({ type: 'arraybuffer' });
    const fileName = `export_${dateStr}_${jobId}.zip`;

    // Upload to storage
    const { error: uploadError } = await supabase.storage
      .from('exports')
      .upload(fileName, zipBlob, {
        contentType: 'application/zip',
        upsert: true
      });

    if (uploadError) throw uploadError;

    // Mark job as complete
    await supabase
      .from('export_jobs')
      .update({ 
        status: 'completed',
        processed_items: applicantsWithCVs.length,
        file_url: fileName,
        completed_at: new Date().toISOString()
      })
      .eq('id', jobId);

  } catch (error: unknown) {
    console.error('Process export error:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    await supabase
      .from('export_jobs')
      .update({ 
        status: 'failed',
        error_message: message,
        completed_at: new Date().toISOString()
      })
      .eq('id', jobId);
  }
}
