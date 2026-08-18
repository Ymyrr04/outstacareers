import { useState, useEffect } from 'react';
import { z } from 'zod';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import { Switch } from '@/components/ui/switch';
import { Pencil, Plus, X, Linkedin } from 'lucide-react';
import { getAdminDisplayName } from '@/lib/adminDisplayNames';
import JobClientSelect from '@/components/JobClientSelect';
import JobInterviewQuestionsManager from '@/components/JobInterviewQuestionsManager';
import { JobDescriptionParser } from '@/components/JobDescriptionParser';

interface AdminUser {
  user_id: string;
  email: string;
}

const jobSchema = z.object({
  title: z.string().min(1, 'Title is required').max(200),
  rate: z.string().max(100).optional(),
  description: z.string().max(5000).optional(),
  region: z.enum(['all', 'philippines', 'latin-america', 'global']),
  qualifications: z.array(z.string().max(1000)).max(20).optional(),
  responsibilities: z.array(z.string().max(1000)).max(20).optional(),
  assigned_admin_id: z.string().uuid().optional().nullable(),
});

interface Job {
  id: string;
  title: string;
  department: string | null;
  rate: string | null;
  apply_url: string;
  description: string | null;
  region: string;
  is_active: boolean;
  qualifications?: string[] | null;
  responsibilities?: string[] | null;
  assigned_admin_id?: string | null;
  client_id?: string | null;
  post_to_linkedin?: boolean | null;
  linkedin_post_url?: string | null;
  linkedin_posted_at?: string | null;
}

interface EditJobDialogProps {
  job: Job;
  onJobUpdated: () => void;
}

// Helper function to clean pasted text (remove bullets, dashes, etc.)
const cleanPastedText = (text: string): string => {
  return text
    .replace(/^[\s]*[-–—•◦▪▸►◆★✓✔☑︎●○]\s*/gm, '') // Remove common bullet characters
    .replace(/^[\s]*\d+[.)]\s*/gm, '') // Remove numbered list markers (1. or 1))
    .replace(/^[\s]*[a-zA-Z][.)]\s*/gm, '') // Remove letter list markers (a. or a))
    .replace(/^\s*\*\s*/gm, '') // Remove asterisk bullets
    .trim();
};

// Fixed conversion values for Philippines
const USD_TO_PHP_RATE = 56;
const WEEKS_PER_MONTH = 4;
const MIN_HOURS_PER_WEEK = 40;
const MAX_HOURS_PER_WEEK = 50;

// Helper function to parse USD hourly rate
const parseUsdHourlyRate = (rate: string): number | null => {
  const match = rate.match(/\$?([\d,]+(?:\.\d{2})?)\s*\/?\s*(hour|hr)?/i);
  if (!match) return null;
  
  const amount = parseFloat(match[1].replace(/,/g, ''));
  const period = match[2]?.toLowerCase() || '';
  
  // Only accept hourly rates
  if (period && period !== 'hour' && period !== 'hr') return null;
  
  return amount;
};

// Helper function to calculate PHP monthly range from USD hourly rate
const calculatePhpMonthlyRange = (usdHourlyRate: number): { min: number; max: number } => {
  const minMonthly = Math.round(usdHourlyRate * USD_TO_PHP_RATE * MIN_HOURS_PER_WEEK * WEEKS_PER_MONTH);
  const maxMonthly = Math.round(usdHourlyRate * USD_TO_PHP_RATE * MAX_HOURS_PER_WEEK * WEEKS_PER_MONTH);
  return { min: minMonthly, max: maxMonthly };
};

// Helper function to format PHP monthly range
const formatPhpMonthlyRange = (min: number, max: number): string => {
  const formattedMin = min.toLocaleString('en-PH');
  const formattedMax = max.toLocaleString('en-PH');
  return `₱${formattedMin} - ₱${formattedMax}/month`;
};

const EditJobDialog = ({ job, onJobUpdated }: EditJobDialogProps) => {
  const [open, setOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [adminUsers, setAdminUsers] = useState<AdminUser[]>([]);
  const [formData, setFormData] = useState({
    title: job.title,
    rate: job.rate || '',
    description: job.description || '',
    region: (job.region || 'all') as 'all' | 'philippines' | 'latin-america' | 'global',
    qualifications: (job.qualifications && job.qualifications.length > 0) 
      ? job.qualifications 
      : ['', '', '', '', ''] as string[],
    responsibilities: (job.responsibilities && job.responsibilities.length > 0)
      ? job.responsibilities
      : ['', '', '', '', ''] as string[],
    assigned_admin_id: job.assigned_admin_id || '',
    client_id: job.client_id || '',
    post_to_linkedin: job.post_to_linkedin ?? false,
  });
  const [convertedRate, setConvertedRate] = useState<string | null>(null);
  const [isPosting, setIsPosting] = useState(false);
  const { toast } = useToast();

  const handlePostToLinkedIn = async () => {
    setIsPosting(true);
    try {
      const { data, error } = await supabase.functions.invoke('post-job-to-linkedin', {
        body: { job_id: job.id },
      });
      if (error) throw error;
      if ((data as any)?.error) throw new Error((data as any).error);
      toast({ title: 'Posted to LinkedIn', description: 'Your job is now live on LinkedIn.' });
      onJobUpdated();
    } catch (e: any) {
      toast({ title: 'LinkedIn post failed', description: e?.message || 'Unknown error', variant: 'destructive' });
    } finally {
      setIsPosting(false);
    }
  };

  // Fetch admin users
  useEffect(() => {
    const fetchAdminUsers = async () => {
      try {
        const { data: sessionData } = await supabase.auth.getSession();
        const token = sessionData?.session?.access_token;
        
        if (!token) return;
        
        const response = await supabase.functions.invoke('get-admin-users', {
          headers: { Authorization: `Bearer ${token}` }
        });
        
        if (response.data?.adminUsers) {
          setAdminUsers(response.data.adminUsers);
        }
      } catch (err) {
        console.error('Error fetching admin users:', err);
      }
    };
    
    if (open) {
      fetchAdminUsers();
    }
  }, [open]);

  const updateQualification = (index: number, value: string) => {
    const newQualifications = [...formData.qualifications];
    newQualifications[index] = value;
    setFormData({ ...formData, qualifications: newQualifications });
  };

  const handleQualificationPaste = (index: number, e: React.ClipboardEvent<HTMLInputElement>) => {
    e.preventDefault();
    const pastedText = e.clipboardData.getData('text');
    const cleanedText = cleanPastedText(pastedText);
    updateQualification(index, cleanedText);
  };

  const addQualification = () => {
    if (formData.qualifications.length < 10) {
      setFormData({ ...formData, qualifications: [...formData.qualifications, ''] });
    }
  };

  const removeQualification = (index: number) => {
    if (formData.qualifications.length > 1) {
      const newQualifications = formData.qualifications.filter((_, i) => i !== index);
      setFormData({ ...formData, qualifications: newQualifications });
    }
  };

  const updateResponsibility = (index: number, value: string) => {
    const newResponsibilities = [...formData.responsibilities];
    newResponsibilities[index] = value;
    setFormData({ ...formData, responsibilities: newResponsibilities });
  };

  const handleResponsibilityPaste = (index: number, e: React.ClipboardEvent<HTMLInputElement>) => {
    e.preventDefault();
    const pastedText = e.clipboardData.getData('text');
    const cleanedText = cleanPastedText(pastedText);
    updateResponsibility(index, cleanedText);
  };

  const addResponsibility = () => {
    if (formData.responsibilities.length < 10) {
      setFormData({ ...formData, responsibilities: [...formData.responsibilities, ''] });
    }
  };

  const removeResponsibility = (index: number) => {
    if (formData.responsibilities.length > 1) {
      const newResponsibilities = formData.responsibilities.filter((_, i) => i !== index);
      setFormData({ ...formData, responsibilities: newResponsibilities });
    }
  };

  // Reset form data when job changes or dialog opens
  useEffect(() => {
    if (open) {
      setFormData({
        title: job.title,
        rate: job.rate || '',
        description: job.description || '',
        region: (job.region || 'all') as 'all' | 'philippines' | 'latin-america' | 'global',
        qualifications: (job.qualifications && job.qualifications.length > 0) 
          ? job.qualifications 
          : ['', '', '', '', ''],
        responsibilities: (job.responsibilities && job.responsibilities.length > 0)
          ? job.responsibilities
          : ['', '', '', '', ''],
        assigned_admin_id: job.assigned_admin_id || '',
    client_id: job.client_id || '',
        post_to_linkedin: job.post_to_linkedin ?? false,
      });
      setConvertedRate(null);
    }
  }, [open, job]);

  // Convert rate when region changes to Philippines or rate changes
  useEffect(() => {
    if (formData.region === 'philippines' && formData.rate) {
      // Only convert if it looks like USD (not already in PHP)
      if (formData.rate.startsWith('₱')) {
        setConvertedRate(null); // Already in PHP
      } else {
        const hourlyRate = parseUsdHourlyRate(formData.rate);
        if (hourlyRate) {
          const { min, max } = calculatePhpMonthlyRange(hourlyRate);
          setConvertedRate(formatPhpMonthlyRange(min, max));
        } else {
          setConvertedRate(null);
        }
      }
    } else {
      setConvertedRate(null);
    }
  }, [formData.region, formData.rate]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);

    const validation = jobSchema.safeParse(formData);
    if (!validation.success) {
      toast({
        title: 'Validation Error',
        description: validation.error.errors[0].message,
        variant: 'destructive',
      });
      setIsLoading(false);
      return;
    }

    // Use converted rate for Philippines region if available and rate looks like USD
    const finalRate = formData.region === 'philippines' && convertedRate 
      ? convertedRate 
      : formData.rate || null;

    // Filter out empty qualifications and responsibilities
    const filteredQualifications = formData.qualifications.filter(q => q.trim() !== '');
    const filteredResponsibilities = formData.responsibilities.filter(r => r.trim() !== '');

    const { error } = await supabase
      .from('jobs')
      .update({
        title: formData.title,
        rate: finalRate,
        description: formData.description || null,
        region: formData.region,
        qualifications: filteredQualifications.length > 0 ? filteredQualifications : null,
        responsibilities: filteredResponsibilities.length > 0 ? filteredResponsibilities : null,
        assigned_admin_id: formData.assigned_admin_id || null,
        client_id: formData.client_id || null,
        post_to_linkedin: formData.post_to_linkedin,
      })
      .eq('id', job.id);

    if (error) {
      toast({
        title: 'Error',
        description: error.message,
        variant: 'destructive',
      });
    } else {
      toast({
        title: 'Success',
        description: 'Job updated successfully!',
      });
      setOpen(false);
      onJobUpdated();
    }

    setIsLoading(false);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <Pencil className="w-4 h-4 mr-1" />
          Edit
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[500px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Edit Job</DialogTitle>
          <DialogDescription>
            Update the job details below.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4 mt-4">
          <div className="space-y-2">
            <Label htmlFor="edit-title">Job Title *</Label>
            <Input
              id="edit-title"
              value={formData.title}
              onChange={(e) => setFormData({ ...formData, title: e.target.value })}
              placeholder="e.g., Senior Developer"
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="edit-rate">Rate (optional)</Label>
            <Input
              id="edit-rate"
              value={formData.rate}
              onChange={(e) => setFormData({ ...formData, rate: e.target.value })}
              placeholder="e.g., $5/hour"
            />
            {formData.region === 'philippines' && formData.rate && !formData.rate.startsWith('₱') && (
              <div className="text-sm text-muted-foreground">
                {convertedRate ? (
                  <span className="text-primary font-medium">
                    Will be saved as: {convertedRate}
                  </span>
                ) : (
                  <span className="text-destructive">
                    Enter USD hourly rate (e.g., "$5/hour")
                  </span>
                )}
              </div>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="edit-region">Region</Label>
            <Select
              value={formData.region}
              onValueChange={(value: 'all' | 'philippines' | 'latin-america' | 'global') => 
                setFormData({ ...formData, region: value })
              }
            >
              <SelectTrigger>
                <SelectValue placeholder="Select region" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Regions</SelectItem>
                <SelectItem value="philippines">Philippines</SelectItem>
                <SelectItem value="latin-america">Latin America</SelectItem>
                <SelectItem value="global">Global</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <JobClientSelect
            id="edit-job-client"
            value={formData.client_id}
            onChange={(client_id) => setFormData({ ...formData, client_id })}
          />

          <div className="space-y-2">
            <Label htmlFor="edit-assigned_admin">Assigned Admin</Label>
            <Select
              value={formData.assigned_admin_id || "__none__"}
              onValueChange={(value) => 
                setFormData({ ...formData, assigned_admin_id: value === "__none__" ? "" : value })
              }
            >
              <SelectTrigger>
                <SelectValue placeholder="Select admin responsible" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">No assignment</SelectItem>
                {adminUsers.map((admin) => (
                  <SelectItem key={admin.user_id} value={admin.user_id}>
                    {getAdminDisplayName(admin.email)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              Admin responsible for managing this role
            </p>
          </div>

          <div className="p-3 border rounded-lg space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-start gap-2">
                <Linkedin className="w-4 h-4 mt-0.5 text-[#0A66C2]" />
                <div>
                  <Label htmlFor="edit-post_to_linkedin" className="cursor-pointer">Post to LinkedIn</Label>
                  <p className="text-xs text-muted-foreground">Publish this role to the connected LinkedIn account.</p>
                </div>
              </div>
              <Switch
                id="edit-post_to_linkedin"
                checked={formData.post_to_linkedin}
                onCheckedChange={(checked) => setFormData({ ...formData, post_to_linkedin: checked })}
              />
            </div>
            {formData.post_to_linkedin && (
              <div className="flex items-center justify-between gap-2 pl-6">
                <div className="text-xs text-muted-foreground">
                  {job.linkedin_posted_at ? (
                    <>
                      Posted {new Date(job.linkedin_posted_at).toLocaleString()}
                      {job.linkedin_post_url && (
                        <> · <a href={job.linkedin_post_url} target="_blank" rel="noreferrer" className="underline">View post</a></>
                      )}
                    </>
                  ) : (
                    'Not posted yet'
                  )}
                </div>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={isPosting}
                  onClick={handlePostToLinkedIn}
                >
                  <Linkedin className="w-3.5 h-3.5 mr-1.5 text-[#0A66C2]" />
                  {isPosting ? 'Posting…' : job.linkedin_posted_at ? 'Post again' : 'Post now'}
                </Button>
              </div>
            )}
          </div>

          {/* Job Description Parser Helper */}
          <div className="flex items-center justify-between p-3 border border-dashed rounded-lg bg-muted/30">
            <div className="text-sm text-muted-foreground">
              Have a full job description? Let AI parse it for you.
            </div>
            <JobDescriptionParser
              currentDescription={formData.description}
              currentQualifications={formData.qualifications}
              currentResponsibilities={formData.responsibilities}
              onApply={(parsed) => {
                setFormData({
                  ...formData,
                  description: parsed.description,
                  qualifications: parsed.qualifications.length > 0 ? parsed.qualifications : [''],
                  responsibilities: parsed.responsibilities.length > 0 ? parsed.responsibilities : [''],
                });
              }}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="edit-description">Description (optional)</Label>
            <Textarea
              id="edit-description"
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              placeholder="Short job description..."
              rows={3}
            />
          </div>

          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Label>Key Qualifications (optional)</Label>
              {formData.qualifications.length < 10 && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={addQualification}
                >
                  <Plus className="w-3 h-3 mr-1" />
                  Add
                </Button>
              )}
            </div>
            <div className="space-y-2">
              {formData.qualifications.map((qual, index) => (
                <div key={index} className="flex items-center gap-2">
                  <Input
                    value={qual}
                    onChange={(e) => updateQualification(index, e.target.value)}
                    onPaste={(e) => handleQualificationPaste(index, e)}
                    placeholder={
                      index === 0 ? "Required skill or experience" :
                      index === 1 ? "Required skill or experience" :
                      index === 2 ? "Required skill or experience" :
                      index === 3 ? "Tool, software, or platform experience" :
                      index === 4 ? "Communication or availability requirement" :
                      "Additional qualification"
                    }
                  />
                  {formData.qualifications.length > 1 && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => removeQualification(index)}
                      className="px-2"
                    >
                      <X className="w-4 h-4 text-muted-foreground" />
                    </Button>
                  )}
                </div>
              ))}
            </div>
          </div>

          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Label>Responsibilities (optional)</Label>
              {formData.responsibilities.length < 10 && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={addResponsibility}
                >
                  <Plus className="w-3 h-3 mr-1" />
                  Add
                </Button>
              )}
            </div>
            <div className="space-y-2">
              {formData.responsibilities.map((resp, index) => (
                <div key={index} className="flex items-center gap-2">
                  <Input
                    value={resp}
                    onChange={(e) => updateResponsibility(index, e.target.value)}
                    onPaste={(e) => handleResponsibilityPaste(index, e)}
                    placeholder={
                      index === 0 ? "Key responsibility or task" :
                      index === 1 ? "Key responsibility or task" :
                      index === 2 ? "Key responsibility or task" :
                      index === 3 ? "Project or team responsibility" :
                      index === 4 ? "Communication or reporting duty" :
                      "Additional responsibility"
                    }
                  />
                  {formData.responsibilities.length > 1 && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => removeResponsibility(index)}
                      className="px-2"
                    >
                      <X className="w-4 h-4 text-muted-foreground" />
                    </Button>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Custom Interview Questions */}
          <JobInterviewQuestionsManager
            jobId={job.id}
            jobTitle={formData.title}
            jobDescription={formData.description}
            qualifications={formData.qualifications.filter(q => q.trim())}
            responsibilities={formData.responsibilities.filter(r => r.trim())}
          />

          <div className="flex justify-end gap-3 pt-4">
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={isLoading}>
              {isLoading ? 'Saving...' : 'Save Changes'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
};

export default EditJobDialog;
