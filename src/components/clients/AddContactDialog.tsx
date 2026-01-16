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

interface AddContactDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  clientId: string;
  onContactAdded: () => void;
}

export const AddContactDialog = ({ open, onOpenChange, clientId, onContactAdded }: AddContactDialogProps) => {
  const { toast } = useToast();
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    full_name: '',
    email: '',
    phone: '',
    role: '',
    is_primary: false,
    notes: '',
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!form.full_name.trim()) {
      toast({
        title: 'Error',
        description: 'Name is required',
        variant: 'destructive',
      });
      return;
    }

    setSaving(true);
    try {
      // If setting as primary, unset other primaries first
      if (form.is_primary) {
        await supabase
          .from('client_contacts')
          .update({ is_primary: false })
          .eq('client_id', clientId);
      }

      const { error } = await supabase.from('client_contacts').insert({
        client_id: clientId,
        full_name: form.full_name.trim(),
        email: form.email.trim() || null,
        phone: form.phone.trim() || null,
        role: form.role.trim() || null,
        is_primary: form.is_primary,
        notes: form.notes.trim() || null,
      });

      if (error) throw error;

      toast({ title: 'Success', description: 'Contact added successfully' });

      setForm({
        full_name: '',
        email: '',
        phone: '',
        role: '',
        is_primary: false,
        notes: '',
      });

      onOpenChange(false);
      onContactAdded();
    } catch (err: any) {
      toast({
        title: 'Error',
        description: 'Failed to add contact: ' + err.message,
        variant: 'destructive',
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Add Contact</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="full_name">Full Name *</Label>
            <Input
              id="full_name"
              value={form.full_name}
              onChange={(e) => setForm({ ...form, full_name: e.target.value })}
              placeholder="John Smith"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                placeholder="john@company.com"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="phone">Phone</Label>
              <Input
                id="phone"
                value={form.phone}
                onChange={(e) => setForm({ ...form, phone: e.target.value })}
                placeholder="+1 234 567 8900"
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="role">Role/Title</Label>
            <Input
              id="role"
              value={form.role}
              onChange={(e) => setForm({ ...form, role: e.target.value })}
              placeholder="e.g. HR Manager, CEO"
            />
          </div>

          <div className="flex items-center space-x-2">
            <Checkbox
              id="is_primary"
              checked={form.is_primary}
              onCheckedChange={(checked) => setForm({ ...form, is_primary: !!checked })}
            />
            <Label htmlFor="is_primary" className="text-sm font-normal">
              Set as primary contact
            </Label>
          </div>

          <div className="space-y-2">
            <Label htmlFor="notes">Notes</Label>
            <Textarea
              id="notes"
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
              placeholder="Additional notes..."
              rows={2}
            />
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={saving}>
              {saving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Add Contact
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};
