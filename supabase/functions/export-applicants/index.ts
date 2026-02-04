import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import JSZip from "https://esm.sh/jszip@3.10.1";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Process a batch of CVs in each function call to avoid timeout
const BATCH_SIZE = 25;

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
        .insert({ user_id: user.id, status: 'pending' })
        .select()
        .single();

      if (jobError) throw jobError;

      // Get count of applicants with CVs
      const { count } = await supabase
        .from('applicants_prescreen')
        .select('*', { count: 'exact', head: true })
        .not('cv_file_url', 'is', null);

      // Update job with total count and set to processing
      await supabase
        .from('export_jobs')
        .update({ 
          total_items: count || 0,
          processed_items: 0,
          status: 'processing'
        })
        .eq('id', job.id);

      return new Response(JSON.stringify({ jobId: job.id, totalItems: count }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (action === 'process-batch') {
      // Process next batch of CVs
      const { data: job, error: jobError } = await supabase
        .from('export_jobs')
        .select('*')
        .eq('id', jobId)
        .single();

      if (jobError || !job) {
        return new Response(JSON.stringify({ error: 'Job not found' }), {
          status: 404,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      if (job.status === 'completed' || job.status === 'failed') {
        return new Response(JSON.stringify(job), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      const currentOffset = job.processed_items || 0;

      // Fetch next batch of applicants with CVs
      const { data: applicants, error: fetchError } = await supabase
        .from('applicants_prescreen')
        .select('*')
        .not('cv_file_url', 'is', null)
        .order('submitted_at', { ascending: false })
        .range(currentOffset, currentOffset + BATCH_SIZE - 1);

      if (fetchError) throw fetchError;

      if (!applicants || applicants.length === 0) {
        // All batches processed, now create the final ZIP
        return await createFinalZip(supabase, jobId);
      }

      // Download this batch of CVs and store temporarily
      let successCount = 0;
      const batchResults: { applicantId: string; fileName: string; data: string }[] = [];

      for (const applicant of applicants) {
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
            const filename = `${safeName} - ${safeTitle} - ${applicant.id.slice(0, 8)}.${ext}`;
            
            const arrayBuffer = await fileData.arrayBuffer();
            // Convert to base64 for storage
            const base64 = btoa(
              new Uint8Array(arrayBuffer).reduce((data, byte) => data + String.fromCharCode(byte), '')
            );
            
            batchResults.push({
              applicantId: applicant.id,
              fileName: filename,
              data: base64
            });
            successCount++;
          }
        } catch (e) {
          console.error(`Failed to download CV for ${applicant.full_name}:`, e);
        }
      }

      // Store batch results in a temporary table or directly in the job
      // For simplicity, we'll store batch file references and build ZIP at the end
      const existingData = job.file_url ? JSON.parse(job.file_url) : [];
      const updatedData = [...existingData, ...batchResults];

      // Update progress
      const newProcessedCount = currentOffset + applicants.length;
      await supabase
        .from('export_jobs')
        .update({ 
          processed_items: newProcessedCount,
          file_url: JSON.stringify(updatedData)
        })
        .eq('id', jobId);

      // Check if we've processed all items
      if (newProcessedCount >= job.total_items) {
        return await createFinalZip(supabase, jobId);
      }

      return new Response(JSON.stringify({ 
        status: 'processing',
        processed_items: newProcessedCount,
        total_items: job.total_items,
        batch_success: successCount,
        continue: true
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (action === 'status') {
      const { data: job, error } = await supabase
        .from('export_jobs')
        .select('id, status, total_items, processed_items, error_message, created_at, completed_at')
        .eq('id', jobId)
        .single();

      if (error) throw error;

      // Return status without file_url (it contains temp data)
      return new Response(JSON.stringify({
        ...job,
        file_url: job.status === 'completed' ? 'ready' : null
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (action === 'download') {
      const { data: job } = await supabase
        .from('export_jobs')
        .select('file_url, status')
        .eq('id', jobId)
        .single();

      if (!job || job.status !== 'completed') {
        return new Response(JSON.stringify({ error: 'Export not ready' }), {
          status: 404,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // The file_url now contains the actual storage path
      const storagePath = job.file_url;
      if (!storagePath || storagePath === 'ready') {
        return new Response(JSON.stringify({ error: 'Export file not found' }), {
          status: 404,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      const { data: signedUrl } = await supabase.storage
        .from('exports')
        .createSignedUrl(storagePath, 3600); // 1 hour expiry

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

async function createFinalZip(supabase: any, jobId: string) {
  try {
    // Fetch the job with accumulated CV data
    const { data: job, error: jobError } = await supabase
      .from('export_jobs')
      .select('*')
      .eq('id', jobId)
      .single();

    if (jobError || !job) throw new Error('Job not found');

    const cvData: { applicantId: string; fileName: string; data: string }[] = 
      job.file_url ? JSON.parse(job.file_url) : [];

    // Fetch all applicants for CSV
    const { data: applicants, error: fetchError } = await supabase
      .from('applicants_prescreen')
      .select('*')
      .order('submitted_at', { ascending: false });

    if (fetchError) throw fetchError;

    const zip = new JSZip();
    const dateStr = new Date().toISOString().split('T')[0];

    // Generate CSV
    const csvHeaders = [
      'Full Name', 'Email', 'Phone', 'WhatsApp', 'Location', 'Job Title', 
      'Status', 'Total Score', 'Years Experience', 'Submitted At', 'CV URL'
    ];
    
    const csvRows = (applicants || []).map((a: any) => [
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
      .map((row: string[]) => row.map((cell: string) => `"${cell.replace(/"/g, '""')}"`).join(','))
      .join('\n');

    zip.file(`applicants_${dateStr}.csv`, csvContent);

    // Add CVs from accumulated data
    const cvFolder = zip.folder('CVs');
    for (const cv of cvData) {
      try {
        // Decode base64 back to binary
        const binaryString = atob(cv.data);
        const bytes = new Uint8Array(binaryString.length);
        for (let i = 0; i < binaryString.length; i++) {
          bytes[i] = binaryString.charCodeAt(i);
        }
        cvFolder?.file(cv.fileName, bytes);
      } catch (e) {
        console.error(`Failed to add CV ${cv.fileName} to ZIP:`, e);
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

    // Mark job as complete with storage path
    await supabase
      .from('export_jobs')
      .update({ 
        status: 'completed',
        file_url: fileName,
        completed_at: new Date().toISOString()
      })
      .eq('id', jobId);

    return new Response(JSON.stringify({ 
      status: 'completed',
      message: 'Export complete'
    }), {
      headers: { 
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
        'Content-Type': 'application/json' 
      },
    });

  } catch (error: unknown) {
    console.error('Create ZIP error:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    
    await supabase
      .from('export_jobs')
      .update({ 
        status: 'failed',
        error_message: message,
        completed_at: new Date().toISOString()
      })
      .eq('id', jobId);

    return new Response(JSON.stringify({ 
      status: 'failed',
      error: message
    }), {
      status: 500,
      headers: { 
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
        'Content-Type': 'application/json' 
      },
    });
  }
}
