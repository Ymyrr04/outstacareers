import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { Loader2 } from 'lucide-react';
import type { ClientContact } from './ClientsDashboard';

interface AddCommunicationDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  clientId: string;
  contacts: ClientContact[];
  onCommunicationAdded: () => void;
}

export const AddCommunicationDialog = ({ 
  open, 
  onOpenChange, 
  clientId, 
  contacts,
  onCommunicationAdded 
}: AddCommunicationDialogProps) => {
  const { toast } = useToast();
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    contact_id: '',
    communication_type: 'note',
    subject: '',
    content: '',
    communication_date: new Date().toISOString().slice(0, 16), // datetime-local format
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    setSaving(true);
    try {
      const { error } = await supabase.from('client_communications').insert({
        client_id: clientId,
        contact_id: form.contact_id || null,
        communication_type: form.communication_type,
        subject: form.subject.trim() || null,
        content: form.content.trim() || null,
        communication_date: form.communication_date,
      });

      if (error) throw error;

      toast({ title: 'Success', description: 'Communication logged successfully' });

      setForm({
        contact_id: '',
        communication_type: 'note',
        subject: '',
        content: '',
        communication_date: new Date().toISOString().slice(0, 16),
      });

      onOpenChange(false);
      onCommunicationAdded();
    } catch (err: any) {
      toast({
        title: 'Error',
        description: 'Failed to log communication: ' + err.message,
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
          <DialogTitle>Log Communication</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Type</Label>
              <Select
                value={form.communication_type}
                onValueChange={(v) => setForm({ ...form, communication_type: v })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="email">Email</SelectItem>
                  <SelectItem value="call">Phone Call</SelectItem>
                  <SelectItem value="meeting">Meeting</SelectItem>
                  <SelectItem value="note">Note</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Contact</Label>
              <Select
                value={form.contact_id}
                onValueChange={(v) => setForm({ ...form, contact_id: v })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select contact" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">No specific contact</SelectItem>
                  {contacts.map(c => (
                    <SelectItem key={c.id} value={c.id}>{c.full_name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="communication_date">Date & Time</Label>
            <Input
              id="communication_date"
              type="datetime-local"
              value={form.communication_date}
              onChange={(e) => setForm({ ...form, communication_date: e.target.value })}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="subject">Subject</Label>
            <Input
              id="subject"
              value={form.subject}
              onChange={(e) => setForm({ ...form, subject: e.target.value })}
              placeholder="Brief subject line"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="content">Notes/Content</Label>
            <Textarea
              id="content"
              value={form.content}
              onChange={(e) => setForm({ ...form, content: e.target.value })}
              placeholder="Details of the communication..."
              rows={4}
            />
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={saving}>
              {saving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Log Communication
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};
