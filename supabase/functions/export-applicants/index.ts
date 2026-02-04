import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import JSZip from "https://esm.sh/jszip@3.10.1";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Process a batch of CVs in each function call to avoid timeout
const BATCH_SIZE = 20;

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
      // file_url stores temp folder path during processing
      await supabase
        .from('export_jobs')
        .update({ 
          total_items: count || 0,
          processed_items: 0,
          status: 'processing',
          file_url: `temp/${job.id}` // Temp folder path
        })
        .eq('id', job.id);

      return new Response(JSON.stringify({ jobId: job.id, totalItems: count }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (action === 'process-batch') {
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
      const tempFolder = `temp/${jobId}`;

      // Fetch next batch of applicants with CVs
      const { data: applicants, error: fetchError } = await supabase
        .from('applicants_prescreen')
        .select('id, full_name, job_title, cv_file_url')
        .not('cv_file_url', 'is', null)
        .order('submitted_at', { ascending: false })
        .range(currentOffset, currentOffset + BATCH_SIZE - 1);

      if (fetchError) throw fetchError;

      if (!applicants || applicants.length === 0) {
        // All batches processed, now create the final ZIP
        return await createFinalZip(supabase, jobId, tempFolder);
      }

      // Process this batch - copy CVs to temp folder
      let successCount = 0;

      for (const applicant of applicants) {
        if (!applicant.cv_file_url) continue;

        try {
          let cvPath = applicant.cv_file_url;
          if (cvPath.includes('/cv-uploads/')) {
            cvPath = cvPath.split('/cv-uploads/').pop()!;
          }

          // Download CV
          const { data: fileData, error: downloadError } = await supabase.storage
            .from('cv-uploads')
            .download(cvPath);

          if (!downloadError && fileData) {
            const safeName = (applicant.full_name || 'Unknown').replace(/[^a-zA-Z0-9\s-]/g, '').trim();
            const safeTitle = (applicant.job_title || 'No-Title').replace(/[^a-zA-Z0-9\s-]/g, '').trim();
            const ext = cvPath.split('.').pop() || 'pdf';
            const filename = `${safeName} - ${safeTitle} - ${applicant.id.slice(0, 8)}.${ext}`;
            
            // Upload to temp folder in exports bucket
            const arrayBuffer = await fileData.arrayBuffer();
            await supabase.storage
              .from('exports')
              .upload(`${tempFolder}/${filename}`, arrayBuffer, {
                contentType: fileData.type || 'application/pdf',
                upsert: true
              });
            
            successCount++;
          }
        } catch (e) {
          console.error(`Failed to process CV for ${applicant.full_name}:`, e);
        }
      }

      // Update progress
      const newProcessedCount = currentOffset + applicants.length;
      await supabase
        .from('export_jobs')
        .update({ processed_items: newProcessedCount })
        .eq('id', jobId);

      // Check if we've processed all items
      if (newProcessedCount >= job.total_items) {
        return await createFinalZip(supabase, jobId, tempFolder);
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

    if (action === 'finalize') {
      // Manual finalize if needed
      const { data: job } = await supabase
        .from('export_jobs')
        .select('*')
        .eq('id', jobId)
        .single();
      
      if (job && job.status === 'processing') {
        return await createFinalZip(supabase, jobId, `temp/${jobId}`);
      }
      return new Response(JSON.stringify({ status: job?.status || 'not_found' }), {
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

      const storagePath = job.file_url;
      if (!storagePath || storagePath.startsWith('temp/')) {
        return new Response(JSON.stringify({ error: 'Export file not found' }), {
          status: 404,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      const { data: signedUrl } = await supabase.storage
        .from('exports')
        .createSignedUrl(storagePath, 3600);

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

async function createFinalZip(supabase: any, jobId: string, tempFolder: string) {
  try {
    console.log(`Creating final ZIP for job ${jobId} from ${tempFolder}`);
    
    // List ALL files in temp folder using pagination (default limit is 100)
    let allTempFiles: any[] = [];
    let offset = 0;
    const pageSize = 1000; // Max allowed by Supabase Storage
    
    while (true) {
      const { data: tempFiles, error: listError } = await supabase.storage
        .from('exports')
        .list(tempFolder, {
          limit: pageSize,
          offset: offset
        });

      if (listError) {
        console.error('Error listing temp files:', listError);
        throw listError;
      }
      
      if (!tempFiles || tempFiles.length === 0) break;
      
      allTempFiles = [...allTempFiles, ...tempFiles];
      
      // If we got fewer than pageSize, we've reached the end
      if (tempFiles.length < pageSize) break;
      
      offset += pageSize;
    }

    console.log(`Found ${allTempFiles.length} files in temp folder`);

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

    // Download temp files and add to ZIP
    const cvFolder = zip.folder('CVs');
    
    for (const file of allTempFiles) {
      if (file.name === '.emptyFolderPlaceholder') continue;
      
      try {
        const { data: fileData, error: downloadError } = await supabase.storage
          .from('exports')
          .download(`${tempFolder}/${file.name}`);

        if (!downloadError && fileData) {
          const arrayBuffer = await fileData.arrayBuffer();
          cvFolder?.file(file.name, arrayBuffer);
        }
      } catch (e) {
        console.error(`Failed to add ${file.name} to ZIP:`, e);
      }
    }

    // Generate final ZIP
    const zipBlob = await zip.generateAsync({ type: 'arraybuffer' });
    const fileName = `export_${dateStr}_${jobId}.zip`;

    console.log(`Uploading final ZIP: ${fileName}`);

    // Upload to storage
    const { error: uploadError } = await supabase.storage
      .from('exports')
      .upload(fileName, zipBlob, {
        contentType: 'application/zip',
        upsert: true
      });

    if (uploadError) throw uploadError;

    // Clean up temp files
    if (allTempFiles.length > 0) {
      const filesToDelete = allTempFiles.map((f: any) => `${tempFolder}/${f.name}`);
      await supabase.storage
        .from('exports')
        .remove(filesToDelete);
    }

    // Mark job as complete
    await supabase
      .from('export_jobs')
      .update({ 
        status: 'completed',
        file_url: fileName,
        completed_at: new Date().toISOString()
      })
      .eq('id', jobId);

    console.log(`Export completed: ${fileName}`);

    return new Response(JSON.stringify({ 
      status: 'completed',
      message: 'Export complete'
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
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
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
}
