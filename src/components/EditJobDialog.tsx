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
import { Pencil, Loader2 } from 'lucide-react';

const jobSchema = z.object({
  title: z.string().min(1, 'Title is required').max(200),
  rate: z.string().max(100).optional(),
  apply_url: z.string().url('Must be a valid URL'),
  description: z.string().max(2000).optional(),
  region: z.enum(['all', 'philippines', 'latin-america']),
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
}

interface EditJobDialogProps {
  job: Job;
  onJobUpdated: () => void;
}

// Helper function to parse USD rate and extract amount and period
const parseUsdRate = (rate: string): { amount: number; period: string } | null => {
  const match = rate.match(/\$?([\d,]+(?:\.\d{2})?)\s*\/?\s*(hour|month|hr|mo)?/i);
  if (!match) return null;
  
  const amount = parseFloat(match[1].replace(/,/g, ''));
  let period = match[2]?.toLowerCase() || '';
  
  // Normalize period
  if (period === 'hr') period = 'hour';
  if (period === 'mo') period = 'month';
  if (!period) period = 'month';
  
  return { amount, period };
};

// Helper function to format PHP amount
const formatPhpRate = (amount: number, period: string): string => {
  const rounded = Math.round(amount);
  const formatted = rounded.toLocaleString('en-PH');
  return `₱${formatted}/${period}`;
};

const EditJobDialog = ({ job, onJobUpdated }: EditJobDialogProps) => {
  const [open, setOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isConverting, setIsConverting] = useState(false);
  const [exchangeRate, setExchangeRate] = useState<number | null>(null);
  const [formData, setFormData] = useState({
    title: job.title,
    rate: job.rate || '',
    apply_url: job.apply_url,
    description: job.description || '',
    region: (job.region || 'all') as 'all' | 'philippines' | 'latin-america',
  });
  const [convertedRate, setConvertedRate] = useState<string | null>(null);
  const { toast } = useToast();

  // Reset form data when job changes or dialog opens
  useEffect(() => {
    if (open) {
      setFormData({
        title: job.title,
        rate: job.rate || '',
        apply_url: job.apply_url,
        description: job.description || '',
        region: (job.region || 'all') as 'all' | 'philippines' | 'latin-america',
      });
      setConvertedRate(null);
    }
  }, [open, job]);

  // Fetch exchange rate when dialog opens
  useEffect(() => {
    if (open && !exchangeRate) {
      fetchExchangeRate();
    }
  }, [open]);

  // Convert rate when region changes to Philippines or rate changes
  useEffect(() => {
    if (formData.region === 'philippines' && formData.rate && exchangeRate) {
      // Only convert if it looks like USD (starts with $ or is a plain number)
      if (formData.rate.startsWith('₱')) {
        setConvertedRate(null); // Already in PHP
      } else {
        const parsed = parseUsdRate(formData.rate);
        if (parsed) {
          const phpAmount = parsed.amount * exchangeRate;
          setConvertedRate(formatPhpRate(phpAmount, parsed.period));
        } else {
          setConvertedRate(null);
        }
      }
    } else {
      setConvertedRate(null);
    }
  }, [formData.region, formData.rate, exchangeRate]);

  const fetchExchangeRate = async () => {
    setIsConverting(true);
    try {
      const { data, error } = await supabase.functions.invoke('get-exchange-rate');
      
      if (error) throw error;
      if (data?.success && data?.rate) {
        setExchangeRate(data.rate);
      }
    } catch (error) {
      console.error('Failed to fetch exchange rate:', error);
    } finally {
      setIsConverting(false);
    }
  };

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

    const { error } = await supabase
      .from('jobs')
      .update({
        title: formData.title,
        rate: finalRate,
        apply_url: formData.apply_url,
        description: formData.description || null,
        region: formData.region,
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
      <DialogContent className="sm:max-w-[500px]">
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
              placeholder="e.g., $25/hour or $4000/month"
            />
            {formData.region === 'philippines' && formData.rate && !formData.rate.startsWith('₱') && (
              <div className="text-sm text-muted-foreground flex items-center gap-2">
                {isConverting ? (
                  <>
                    <Loader2 className="w-3 h-3 animate-spin" />
                    <span>Converting to PHP...</span>
                  </>
                ) : convertedRate ? (
                  <span className="text-primary font-medium">
                    Will be saved as: {convertedRate}
                  </span>
                ) : exchangeRate ? (
                  <span className="text-destructive">
                    Could not parse USD amount. Enter format like "$25/hour"
                  </span>
                ) : (
                  <span className="text-muted-foreground">
                    Exchange rate unavailable - will save as entered
                  </span>
                )}
              </div>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="edit-apply_url">Apply URL *</Label>
            <Input
              id="edit-apply_url"
              type="url"
              value={formData.apply_url}
              onChange={(e) => setFormData({ ...formData, apply_url: e.target.value })}
              placeholder="https://..."
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="edit-region">Region</Label>
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
            <Label htmlFor="edit-description">Description (optional)</Label>
            <Textarea
              id="edit-description"
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              placeholder="Short job description..."
              rows={3}
            />
          </div>

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
