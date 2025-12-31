-- Add phone and file_hash columns to applicants_prescreen for duplicate detection
ALTER TABLE public.applicants_prescreen
ADD COLUMN IF NOT EXISTS phone text,
ADD COLUMN IF NOT EXISTS file_hash text;

-- Create index on email for faster duplicate lookups
CREATE INDEX IF NOT EXISTS idx_applicants_email ON public.applicants_prescreen(email);

-- Create index on phone for faster duplicate lookups
CREATE INDEX IF NOT EXISTS idx_applicants_phone ON public.applicants_prescreen(phone);

-- Create index on file_hash for faster duplicate lookups
CREATE INDEX IF NOT EXISTS idx_applicants_file_hash ON public.applicants_prescreen(file_hash);