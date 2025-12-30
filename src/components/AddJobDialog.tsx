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
import { Plus, X } from 'lucide-react';

const jobSchema = z.object({
  title: z.string().min(1, 'Title is required').max(200),
  rate: z.string().max(100).optional(),
  apply_url: z.string().url('Must be a valid URL'),
  description: z.string().max(2000).optional(),
  region: z.enum(['all', 'philippines', 'latin-america']),
  qualifications: z.array(z.string().max(200)).max(10).optional(),
  responsibilities: z.array(z.string().max(200)).max(10).optional(),
});

interface AddJobDialogProps {
  onJobAdded: () => void;
}

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

const AddJobDialog = ({ onJobAdded }: AddJobDialogProps) => {
  const [open, setOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [formData, setFormData] = useState({
    title: '',
    rate: '',
    apply_url: '',
    description: '',
    region: 'all' as 'all' | 'philippines' | 'latin-america',
    qualifications: ['', '', '', '', ''] as string[],
    responsibilities: ['', '', '', '', ''] as string[],
  });
  const [convertedRate, setConvertedRate] = useState<string | null>(null);
  const { toast } = useToast();

  const updateQualification = (index: number, value: string) => {
    const newQualifications = [...formData.qualifications];
    newQualifications[index] = value;
    setFormData({ ...formData, qualifications: newQualifications });
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

  // Convert rate when region changes to Philippines or rate changes
  useEffect(() => {
    if (formData.region === 'philippines' && formData.rate) {
      const hourlyRate = parseUsdHourlyRate(formData.rate);
      if (hourlyRate) {
        const { min, max } = calculatePhpMonthlyRange(hourlyRate);
        setConvertedRate(formatPhpMonthlyRange(min, max));
      } else {
        setConvertedRate(null);
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

    // Use converted rate for Philippines region if available
    const finalRate = formData.region === 'philippines' && convertedRate 
      ? convertedRate 
      : formData.rate || null;

    // Filter out empty qualifications and responsibilities
    const filteredQualifications = formData.qualifications.filter(q => q.trim() !== '');
    const filteredResponsibilities = formData.responsibilities.filter(r => r.trim() !== '');

    const { error } = await supabase.from('jobs').insert({
      title: formData.title,
      rate: finalRate,
      apply_url: formData.apply_url,
      description: formData.description || null,
      region: formData.region,
      qualifications: filteredQualifications.length > 0 ? filteredQualifications : null,
      responsibilities: filteredResponsibilities.length > 0 ? filteredResponsibilities : null,
    });

    if (error) {
      toast({
        title: 'Error',
        description: error.message,
        variant: 'destructive',
      });
    } else {
      toast({
        title: 'Success',
        description: 'Job added successfully!',
      });
      setFormData({
        title: '',
        rate: '',
        apply_url: '',
        description: '',
        region: 'all',
        qualifications: ['', '', '', '', ''],
        responsibilities: ['', '', '', '', ''],
      });
      setConvertedRate(null);
      setOpen(false);
      onJobAdded();
    }

    setIsLoading(false);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <Plus className="w-4 h-4 mr-2" />
          Add New Job
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[500px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Add New Job Opportunity</DialogTitle>
          <DialogDescription>
            Fill in the job details below. All fields marked with * are required.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4 mt-4">
          <div className="space-y-2">
            <Label htmlFor="title">Job Title *</Label>
            <Input
              id="title"
              value={formData.title}
              onChange={(e) => setFormData({ ...formData, title: e.target.value })}
              placeholder="e.g., Senior Developer"
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="rate">Rate in USD (optional)</Label>
            <Input
              id="rate"
              value={formData.rate}
              onChange={(e) => setFormData({ ...formData, rate: e.target.value })}
              placeholder="e.g., $5/hour"
            />
            {formData.region === 'philippines' && formData.rate && (
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
            <Label htmlFor="apply_url">Apply URL *</Label>
            <Input
              id="apply_url"
              type="url"
              value={formData.apply_url}
              onChange={(e) => setFormData({ ...formData, apply_url: e.target.value })}
              placeholder="https://..."
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="region">Region</Label>
            <Select
              value={formData.region}
              onValueChange={(value: 'all' | 'philippines' | 'latin-america') => 
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
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="description">Description (optional)</Label>
            <Textarea
              id="description"
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

          <div className="flex justify-end gap-3 pt-4">
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={isLoading}>
              {isLoading ? 'Adding...' : 'Add Job'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
};

export default AddJobDialog;
