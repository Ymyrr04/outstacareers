import JSZip from 'jszip';
import { supabase } from '@/integrations/supabase/client';
import { formatDate, formatDateTime } from "@/lib/dateFormat";

// Helper to strip HTML tags and convert to plain text
const stripHtml = (html: string | null | undefined): string => {
  if (!html) return '';
  // Create a temporary element to parse HTML
  const temp = document.createElement('div');
  temp.innerHTML = html;
  // Get text content and clean up whitespace
  let text = temp.textContent || temp.innerText || '';
  // Replace multiple spaces/newlines with single space
  text = text.replace(/\s+/g, ' ').trim();
  return text;
};

// Helper to escape CSV values
const escapeCSV = (value: any): string => {
  if (value === null || value === undefined) return '';
  const str = String(value);
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
};

// Generic CSV generator
const generateCSV = (headers: string[], rows: any[][]): string => {
  const headerLine = headers.join(',');
  const dataLines = rows.map(row => row.map(escapeCSV).join(','));
  return [headerLine, ...dataLines].join('\n');
};

// Download helper
const downloadFile = (content: string | Blob, filename: string, type = 'text/csv') => {
  const blob = content instanceof Blob ? content : new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
};

// Export Jobs
export const exportJobs = async (): Promise<{ success: boolean; count: number; error?: string }> => {
  try {
    const { data, error } = await supabase
      .from('jobs')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) throw error;

    const headers = ['Title', 'Department', 'Rate', 'Region', 'Status', 'Created At', 'Description', 'Qualifications', 'Responsibilities'];
    const rows = (data || []).map(job => [
      job.title,
      job.department,
      job.rate,
      job.region,
      job.is_active ? 'Active' : 'Inactive',
      job.created_at ? formatDate(job.created_at) : '',
      job.description,
      (job.qualifications || []).join('; '),
      (job.responsibilities || []).join('; '),
    ]);

    const csv = generateCSV(headers, rows);
    downloadFile(csv, `jobs_export_${new Date().toISOString().split('T')[0]}.csv`);

    return { success: true, count: data?.length || 0 };
  } catch (err: any) {
    return { success: false, count: 0, error: err.message };
  }
};

// Export Applicants (optionally with CVs)
export const exportApplicants = async (options?: { 
  includeCVs?: boolean;
  onProgress?: (step: string) => void;
}): Promise<{ success: boolean; count: number; error?: string }> => {
  try {
    options?.onProgress?.('Fetching applicants...');
    
    const { data, error } = await supabase
      .from('applicants_prescreen')
      .select('*')
      .order('submitted_at', { ascending: false });

    if (error) throw error;

    const headers = [
      'Full Name', 'Email', 'Phone', 'WhatsApp', 'Location', 'Job Title', 'Status',
      'Start Availability', 'Years Experience', 'Total Score', 'AI Summary',
      'Home Office', 'Noise Canceling Headset', 'Laptop/PC', 'Good Internet', 
      'Internet Speed', 'Power Backup', 'Can Work 40-50 hrs', 'US Timezone OK',
      'Currently Working', 'Has Experience', 'Job Source', 'Submitted At', 'Notes',
      ...(options?.includeCVs ? ['CV Filename'] : [])
    ];
    
    const applicantsWithCVs = (data || []).filter(a => a.cv_file_url);
    
    // If including CVs, create a ZIP
    if (options?.includeCVs && applicantsWithCVs.length > 0) {
      const zip = new JSZip();
      const dateStr = new Date().toISOString().split('T')[0];
      const cvFolder = zip.folder('CVs');
      
      // Track CV filenames for the CSV
      const cvFilenames: Record<string, string> = {};
      
      // Download CVs
      let downloaded = 0;
      for (const applicant of applicantsWithCVs) {
        if (!applicant.cv_file_url) continue;
        
        options?.onProgress?.(`Downloading CVs... (${++downloaded}/${applicantsWithCVs.length})`);
        
        try {
          // Extract path from URL or use as-is if already a path
          let cvPath = applicant.cv_file_url;
          if (cvPath.includes('/cv-uploads/')) {
            cvPath = cvPath.split('/cv-uploads/').pop() || cvPath;
          }
          
          const { data: fileData, error: downloadError } = await supabase.storage
            .from('cv-uploads')
            .download(cvPath);
          
          if (downloadError || !fileData) {
            console.warn(`Failed to download CV for ${applicant.full_name}:`, downloadError);
            continue;
          }
          
          // Generate filename: "Name - JobTitle.ext"
          const ext = cvPath.split('.').pop()?.toLowerCase() || 'pdf';
          const safeName = applicant.full_name.replace(/[^a-zA-Z0-9 ]/g, '').trim();
          const safeTitle = (applicant.job_title || 'Unknown').replace(/[^a-zA-Z0-9 ]/g, '').trim();
          const filename = `${safeName} - ${safeTitle}.${ext}`;
          
          cvFilenames[applicant.id] = filename;
          cvFolder?.file(filename, fileData);
        } catch (err) {
          console.warn(`Error processing CV for ${applicant.full_name}:`, err);
        }
      }
      
      options?.onProgress?.('Creating ZIP file...');
      
      // Create CSV with CV filename column
      const rows = (data || []).map(a => [
        a.full_name,
        a.email,
        a.phone,
        a.whatsapp,
        a.location,
        a.job_title,
        a.status,
        a.start_availability,
        a.years_of_experience,
        a.total_score,
        a.ai_summary,
        a.home_office ? 'Yes' : 'No',
        a.noise_canceling_headset ? 'Yes' : 'No',
        a.laptop_or_pc ? 'Yes' : 'No',
        a.good_internet ? 'Yes' : 'No',
        a.internet_speed,
        a.power_backup ? 'Yes' : 'No',
        a.can_work_40_50 ? 'Yes' : 'No',
        a.us_timezone_ok ? 'Yes' : 'No',
        a.currently_working ? 'Yes' : 'No',
        a.has_experience ? 'Yes' : 'No',
        a.job_source,
        a.submitted_at ? formatDateTime(a.submitted_at) : '',
        stripHtml(a.notes),
        cvFilenames[a.id] || '',
      ]);
      
      const csv = generateCSV(headers, rows);
      zip.file(`applicants_${dateStr}.csv`, csv);
      
      const zipBlob = await zip.generateAsync({ type: 'blob' });
      downloadFile(zipBlob, `applicants_with_cvs_${dateStr}.zip`, 'application/zip');
      
      return { success: true, count: data?.length || 0 };
    }
    
    // Standard CSV export without CVs
    const rows = (data || []).map(a => [
      a.full_name,
      a.email,
      a.phone,
      a.whatsapp,
      a.location,
      a.job_title,
      a.status,
      a.start_availability,
      a.years_of_experience,
      a.total_score,
      a.ai_summary,
      a.home_office ? 'Yes' : 'No',
      a.noise_canceling_headset ? 'Yes' : 'No',
      a.laptop_or_pc ? 'Yes' : 'No',
      a.good_internet ? 'Yes' : 'No',
      a.internet_speed,
      a.power_backup ? 'Yes' : 'No',
      a.can_work_40_50 ? 'Yes' : 'No',
      a.us_timezone_ok ? 'Yes' : 'No',
      a.currently_working ? 'Yes' : 'No',
      a.has_experience ? 'Yes' : 'No',
      a.job_source,
      a.submitted_at ? formatDateTime(a.submitted_at) : '',
      stripHtml(a.notes),
    ]);

    const csv = generateCSV(headers, rows);
    downloadFile(csv, `applicants_export_${new Date().toISOString().split('T')[0]}.csv`);

    return { success: true, count: data?.length || 0 };
  } catch (err: any) {
    return { success: false, count: 0, error: err.message };
  }
};

// Export Pipeline/Hiring Requests
export const exportPipeline = async (stageSlugs?: string[]): Promise<{ success: boolean; count: number; error?: string }> => {
  try {
    let query = supabase
      .from('client_hiring_requests')
      .select(`*, clients(company_name)`)
      .order('created_at', { ascending: false });

    if (stageSlugs && stageSlugs.length > 0) {
      query = query.in('pipeline_stage', stageSlugs);
    }

    const { data, error } = await query;

    if (error) throw error;

    const headers = [
      'Job Title', 'Client', 'Pipeline Stage', 'Priority', 'Client Status',
      'Industry', 'Source', 'Start Date', 'Target End Date', 'Notes', 'Created At'
    ];
    const rows = (data || []).map((r: any) => [
      r.job_title,
      r.clients?.company_name || '',
      r.pipeline_stage,
      r.priority,
      r.client_status,
      r.industry,
      r.source,
      r.start_date,
      r.target_end_date,
      stripHtml(r.notes),
      r.created_at ? formatDateTime(r.created_at) : '',
    ]);

    const csv = generateCSV(headers, rows);
    downloadFile(csv, `pipeline_export_${new Date().toISOString().split('T')[0]}.csv`);

    return { success: true, count: data?.length || 0 };
  } catch (err: any) {
    return { success: false, count: 0, error: err.message };
  }
};

// Export Contractors
export const exportContractors = async (): Promise<{ success: boolean; count: number; error?: string }> => {
  try {
    const { data, error } = await supabase
      .from('contractor_assignments')
      .select(`
        *,
        applicant:applicants_prescreen(full_name, email, location, phone),
        client:clients(company_name, industry)
      `)
      .order('created_at', { ascending: false });

    if (error) throw error;

    const headers = [
      'Status', 'Name', 'Email', 'Company', 'Industry', 'Start Date', 'End Date',
      'Position', 'Hourly Rate', 'Hours/Week', 'Contact Number', 'Emergency Number',
      'Timesheet Link', 'Type', 'Country', 'Source', 'Notes'
    ];
    const rows = (data || []).map((c: any) => [
      c.status,
      c.applicant?.full_name,
      c.applicant?.email,
      c.client?.company_name,
      c.client?.industry,
      c.start_date,
      c.end_date,
      c.job_title,
      c.hourly_rate,
      c.hours_per_week,
      c.contact_number || c.applicant?.phone,
      c.emergency_number,
      c.timesheet_link,
      c.is_replacement ? 'Replacement' : 'New',
      c.country || c.applicant?.location,
      c.source,
      stripHtml(c.notes),
    ]);

    const csv = generateCSV(headers, rows);
    downloadFile(csv, `contractors_export_${new Date().toISOString().split('T')[0]}.csv`);

    return { success: true, count: data?.length || 0 };
  } catch (err: any) {
    return { success: false, count: 0, error: err.message };
  }
};

// Export Clients
export const exportClients = async (): Promise<{ success: boolean; count: number; error?: string }> => {
  try {
    const { data: clientsData, error: clientsError } = await supabase
      .from('clients')
      .select('*')
      .order('company_name');

    if (clientsError) throw clientsError;

    const { data: contactsData } = await supabase
      .from('client_contacts')
      .select('*')
      .eq('is_primary', true);

    // Build contacts map
    const contactsMap: Record<string, any> = {};
    contactsData?.forEach(c => {
      if (!contactsMap[c.client_id]) {
        contactsMap[c.client_id] = c;
      }
    });

    const headers = [
      'Business Name', 'First Name', 'Last Name', 'Email Address', 'Contact Phone',
      'No. of Contractors', 'Leads From', 'Company Links', '4% Yearly Increase',
      'Industry', 'Website', 'Is Hiring', 'Notes'
    ];
    const rows = (clientsData || []).map(client => {
      const contact = contactsMap[client.id];
      return [
        client.company_name,
        contact?.first_name,
        contact?.last_name,
        contact?.email,
        contact?.phone,
        client.contractor_count,
        client.leads_from,
        client.company_links,
        client.yearly_increase ? 'Yes' : 'No',
        client.industry,
        client.website,
        client.is_hiring ? 'Yes' : 'No',
        stripHtml(client.notes),
      ];
    });

    const csv = generateCSV(headers, rows);
    downloadFile(csv, `clients_export_${new Date().toISOString().split('T')[0]}.csv`);

    return { success: true, count: clientsData?.length || 0 };
  } catch (err: any) {
    return { success: false, count: 0, error: err.message };
  }
};

// Export ALL data as ZIP
export const exportAllData = async (
  onProgress?: (step: string) => void
): Promise<{ success: boolean; error?: string }> => {
  try {
    const zip = new JSZip();
    const dateStr = new Date().toISOString().split('T')[0];

    // Fetch all data in parallel
    onProgress?.('Fetching data...');
    
    const [jobsRes, applicantsRes, pipelineRes, contractorsRes, clientsRes, contactsRes] = await Promise.all([
      supabase.from('jobs').select('*').order('created_at', { ascending: false }),
      supabase.from('applicants_prescreen').select('*').order('submitted_at', { ascending: false }),
      supabase.from('client_hiring_requests').select(`*, clients(company_name)`).order('created_at', { ascending: false }),
      supabase.from('contractor_assignments').select(`*, applicant:applicants_prescreen(full_name, email, location, phone), client:clients(company_name, industry)`).order('created_at', { ascending: false }),
      supabase.from('clients').select('*').order('company_name'),
      supabase.from('client_contacts').select('*').eq('is_primary', true),
    ]);

    onProgress?.('Generating CSV files...');

    // Jobs CSV
    if (jobsRes.data) {
      const headers = ['Title', 'Department', 'Rate', 'Region', 'Status', 'Created At', 'Description'];
      const rows = jobsRes.data.map(job => [
        job.title, job.department, job.rate, job.region, job.is_active ? 'Active' : 'Inactive',
        job.created_at ? formatDate(job.created_at) : '', job.description,
      ]);
      zip.file(`jobs_${dateStr}.csv`, generateCSV(headers, rows));
    }

    // Applicants CSV
    if (applicantsRes.data) {
      const headers = ['Full Name', 'Email', 'Phone', 'Location', 'Job Title', 'Status', 'Total Score', 'Submitted At'];
      const rows = applicantsRes.data.map(a => [
        a.full_name, a.email, a.phone, a.location, a.job_title, a.status, a.total_score,
        a.submitted_at ? formatDateTime(a.submitted_at) : '',
      ]);
      zip.file(`applicants_${dateStr}.csv`, generateCSV(headers, rows));
    }

    // Pipeline CSV
    if (pipelineRes.data) {
      const headers = ['Job Title', 'Client', 'Pipeline Stage', 'Priority', 'Client Status', 'Industry', 'Created At'];
      const rows = pipelineRes.data.map((r: any) => [
        r.job_title, r.clients?.company_name || '', r.pipeline_stage, r.priority, r.client_status,
        r.industry, r.created_at ? formatDateTime(r.created_at) : '',
      ]);
      zip.file(`pipeline_${dateStr}.csv`, generateCSV(headers, rows));
    }

    // Contractors CSV
    if (contractorsRes.data) {
      const headers = ['Status', 'Name', 'Email', 'Company', 'Position', 'Rate', 'Start Date'];
      const rows = contractorsRes.data.map((c: any) => [
        c.status, c.applicant?.full_name, c.applicant?.email, c.client?.company_name,
        c.job_title, c.hourly_rate, c.start_date,
      ]);
      zip.file(`contractors_${dateStr}.csv`, generateCSV(headers, rows));
    }

    // Clients CSV
    if (clientsRes.data) {
      const contactsMap: Record<string, any> = {};
      contactsRes.data?.forEach(c => { if (!contactsMap[c.client_id]) contactsMap[c.client_id] = c; });
      
      const headers = ['Business Name', 'Contact Name', 'Email', 'Industry', 'Leads From', 'Is Hiring'];
      const rows = clientsRes.data.map(client => {
        const contact = contactsMap[client.id];
        return [
          client.company_name, contact?.full_name, contact?.email,
          client.industry, client.leads_from, client.is_hiring ? 'Yes' : 'No',
        ];
      });
      zip.file(`clients_${dateStr}.csv`, generateCSV(headers, rows));
    }

    onProgress?.('Creating ZIP file...');
    
    const zipBlob = await zip.generateAsync({ type: 'blob' });
    downloadFile(zipBlob, `outsta_export_${dateStr}.zip`, 'application/zip');

    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
};
