// Generate URL-friendly slugs for job titles
export const slugify = (text: string): string => {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, '') // Remove special characters
    .replace(/\s+/g, '-') // Replace spaces with hyphens
    .replace(/-+/g, '-') // Replace multiple hyphens with single
    .replace(/^-+|-+$/g, ''); // Remove leading/trailing hyphens
};

// Company name for URL
export const COMPANY_SLUG = 'outsta';

// Generate a shareable job URL
export const generateJobUrl = (jobTitle: string, jobId: string): string => {
  const titleSlug = slugify(jobTitle);
  return `/jobs/${COMPANY_SLUG}/${titleSlug}/${jobId}`;
};

// Parse job ID from URL path
export const parseJobIdFromUrl = (path: string): string | null => {
  const segments = path.split('/').filter(Boolean);
  // Expected format: /jobs/outsta/job-title-slug/uuid
  if (segments.length >= 4 && segments[0] === 'jobs') {
    return segments[segments.length - 1]; // Last segment is the job ID
  }
  return null;
};
