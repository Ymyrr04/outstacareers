import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { useToast } from '@/hooks/use-toast';
import { Loader2 } from 'lucide-react';

interface AddClientDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onClientAdded: () => void;
}

export const AddClientDialog = ({ open, onOpenChange, onClientAdded }: AddClientDialogProps) => {
  const { toast } = useToast();
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    company_name: '',
    industry: '',
    leads_from: '',
    company_links: '',
    yearly_increase: false,
    contractor_count: 0,
    // Primary contact
    first_name: '',
    last_name: '',
    email: '',
    phone: '',
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!form.company_name.trim()) {
      toast({
        title: 'Error',
        description: 'Business name is required',
        variant: 'destructive',
      });
      return;
    }

    setSaving(true);
    try {
      // Insert client
      const { data: client, error } = await supabase.from('clients').insert({
        company_name: form.company_name.trim(),
        industry: form.industry.trim() || null,
        leads_from: form.leads_from.trim() || null,
        company_links: form.company_links.trim() || null,
        yearly_increase: form.yearly_increase,
        contractor_count: form.contractor_count,
      }).select('id').single();

      if (error) throw error;

      // If contact info provided, create primary contact
      if ((form.first_name.trim() || form.last_name.trim()) && client?.id) {
        const fullName = [form.first_name.trim(), form.last_name.trim()].filter(Boolean).join(' ');
        await supabase.from('client_contacts').insert({
          client_id: client.id,
          first_name: form.first_name.trim() || null,
          last_name: form.last_name.trim() || null,
          full_name: fullName,
          email: form.email.trim() || null,
          phone: form.phone.trim() || null,
          is_primary: true,
        });
      }

      toast({
        title: 'Success',
        description: 'Client added successfully',
      });

      // Reset form
      setForm({
        company_name: '',
        industry: '',
        leads_from: '',
        company_links: '',
        yearly_increase: false,
        contractor_count: 0,
        first_name: '',
        last_name: '',
        email: '',
        phone: '',
      });

      onOpenChange(false);
      onClientAdded();
    } catch (err: any) {
      toast({
        title: 'Error',
        description: 'Failed to add client: ' + err.message,
        variant: 'destructive',
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Add New Client</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Business Info */}
          <div className="space-y-4">
            <h4 className="font-medium text-sm text-muted-foreground">Business Information</h4>
            
            <div className="space-y-2">
              <Label htmlFor="company_name">Business Name *</Label>
              <Input
                id="company_name"
                value={form.company_name}
                onChange={(e) => setForm({ ...form, company_name: e.target.value })}
                placeholder="Acme Corp"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="industry">Industry</Label>
                <Input
                  id="industry"
                  value={form.industry}
                  onChange={(e) => setForm({ ...form, industry: e.target.value })}
                  placeholder="e.g. Technology"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="contractor_count">No. of Contractors</Label>
                <Input
                  id="contractor_count"
                  type="number"
                  min="0"
                  value={form.contractor_count}
                  onChange={(e) => setForm({ ...form, contractor_count: parseInt(e.target.value) || 0 })}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="leads_from">Leads from</Label>
              <Input
                id="leads_from"
                value={form.leads_from}
                onChange={(e) => setForm({ ...form, leads_from: e.target.value })}
                placeholder="e.g. Referral, LinkedIn, Website"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="company_links">Company Links (to share with candidates)</Label>
              <Textarea
                id="company_links"
                value={form.company_links}
                onChange={(e) => setForm({ ...form, company_links: e.target.value })}
                placeholder="Add website links, job descriptions, etc."
                rows={2}
              />
            </div>

            <div className="flex items-center space-x-2">
              <Checkbox
                id="yearly_increase"
                checked={form.yearly_increase}
                onCheckedChange={(checked) => setForm({ ...form, yearly_increase: !!checked })}
              />
              <Label htmlFor="yearly_increase" className="text-sm font-normal">
                4% Yearly Increase
              </Label>
            </div>
          </div>

          {/* Primary Contact */}
          <div className="space-y-4 pt-4 border-t">
            <h4 className="font-medium text-sm text-muted-foreground">Primary Contact (Optional)</h4>
            
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="first_name">First Name</Label>
                <Input
                  id="first_name"
                  value={form.first_name}
                  onChange={(e) => setForm({ ...form, first_name: e.target.value })}
                  placeholder="John"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="last_name">Last Name</Label>
                <Input
                  id="last_name"
                  value={form.last_name}
                  onChange={(e) => setForm({ ...form, last_name: e.target.value })}
                  placeholder="Smith"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="email">Email Address</Label>
                <Input
                  id="email"
                  type="email"
                  value={form.email}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                  placeholder="john@company.com"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="phone">Contact Information</Label>
                <Input
                  id="phone"
                  value={form.phone}
                  onChange={(e) => setForm({ ...form, phone: e.target.value })}
                  placeholder="+1 234 567 8900"
                />
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={saving}>
              {saving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Add Client
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};