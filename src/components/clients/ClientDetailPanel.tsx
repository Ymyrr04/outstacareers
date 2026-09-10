import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { Switch } from '@/components/ui/switch';
import { useToast } from '@/hooks/use-toast';
import { format } from 'date-fns';
import { 
  Building2, Users, Briefcase, MessageSquare, Globe, MapPin, 
  Edit2, Save, Trash2, Plus, Loader2, Phone, Mail, Star, User,
  Calendar, DollarSign, FileText, TrendingUp, Link, Hash, KeyRound
} from 'lucide-react';
import type { Client, ClientContact, ContractorAssignment, ClientCommunication } from './ClientsDashboard';
import { AddContactDialog } from './AddContactDialog';
import { AddContractorDialog } from './AddContractorDialog';
import { AddCommunicationDialog } from './AddCommunicationDialog';
import { ClientPortalAccountsSection } from './ClientPortalAccountsSection';
import { parseDateOnly } from '@/lib/dateOnly';
import { formatDateTime } from "@/lib/dateFormat";

// Hiring Toggle Component
const HiringToggle = ({ clientId, isHiring, onUpdate }: { clientId: string; isHiring: boolean; onUpdate: () => void }) => {
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();

  const handleToggle = async (checked: boolean) => {
    setLoading(true);
    try {
      const { error } = await supabase
        .from('clients')
        .update({ is_hiring: checked })
        .eq('id', clientId);

      if (error) throw error;

      toast({
        title: checked ? 'Hiring enabled' : 'Hiring disabled',
        description: `Client is ${checked ? 'now' : 'no longer'} marked as hiring`,
      });
      onUpdate();
    } catch (err: any) {
      toast({
        title: 'Error',
        description: err.message,
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex items-center gap-2">
      <Switch
        checked={isHiring}
        onCheckedChange={handleToggle}
        disabled={loading}
        className="data-[state=checked]:bg-green-500"
      />
      <Label className={`text-sm ${isHiring ? 'text-green-600 font-medium' : 'text-muted-foreground'}`}>
        {loading ? 'Updating...' : isHiring ? 'Hiring' : 'Not Hiring'}
      </Label>
    </div>
  );
};

interface ClientDetailPanelProps {
  client: Client;
  onClose: () => void;
  onUpdate: () => void;
}

export const ClientDetailPanel = ({ client, onClose, onUpdate }: ClientDetailPanelProps) => {
  const { toast } = useToast();
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [contacts, setContacts] = useState<ClientContact[]>([]);
  const [contractors, setContractors] = useState<ContractorAssignment[]>([]);
  const [communications, setCommunications] = useState<ClientCommunication[]>([]);
  const [loading, setLoading] = useState(true);

  const [editForm, setEditForm] = useState({
    company_name: client.company_name,
    industry: client.industry || '',
    leads_from: client.leads_from || '',
    company_links: client.company_links || '',
    yearly_increase: client.yearly_increase || false,
    is_hiring: client.is_hiring || false,
    contractor_count: client.contractor_count || 0,
    notes: client.notes || '',
  });

  const [addContactOpen, setAddContactOpen] = useState(false);
  const [addContractorOpen, setAddContractorOpen] = useState(false);
  const [addCommunicationOpen, setAddCommunicationOpen] = useState(false);
  const [editingContactId, setEditingContactId] = useState<string | null>(null);
  const [contactEditForm, setContactEditForm] = useState<{
    full_name: string; first_name: string; last_name: string; email: string; phone: string; role: string; notes: string;
  }>({ full_name: '', first_name: '', last_name: '', email: '', phone: '', role: '', notes: '' });
  const [savingContact, setSavingContact] = useState(false);
  const [existingIndustries, setExistingIndustries] = useState<string[]>([]);
  const [existingSources, setExistingSources] = useState<string[]>([]);

  // Fetch unique industry/source values for dropdown suggestions
  useEffect(() => {
    if (!editing) return;
    const fetchSuggestions = async () => {
      const { data } = await supabase
        .from('clients')
        .select('industry, leads_from');
      if (data) {
        setExistingIndustries([...new Set(data.map(c => c.industry).filter((v): v is string => !!v && v.trim() !== ''))].sort());
        setExistingSources([...new Set(data.map(c => c.leads_from).filter((v): v is string => !!v && v.trim() !== ''))].sort());
      }
    };
    fetchSuggestions();
  }, [editing]);

  const fetchClientData = async () => {
    setLoading(true);
    try {
      // Fetch contacts
      const { data: contactsData } = await supabase
        .from('client_contacts')
        .select('*')
        .eq('client_id', client.id)
        .order('is_primary', { ascending: false })
        .order('created_at');

      // Fetch contractors with applicant info
      const { data: contractorsData } = await supabase
        .from('contractor_assignments')
        .select(`
          *,
          applicant:applicants_prescreen(full_name, email, location)
        `)
        .eq('client_id', client.id)
        .order('status')
        .order('start_date', { ascending: false });

      // Fetch communications
      const { data: communicationsData } = await supabase
        .from('client_communications')
        .select(`
          *,
          contact:client_contacts(full_name)
        `)
        .eq('client_id', client.id)
        .order('communication_date', { ascending: false })
        .limit(50);

      setContacts(contactsData || []);
      setContractors((contractorsData || []) as unknown as ContractorAssignment[]);
      setCommunications((communicationsData || []) as unknown as ClientCommunication[]);
    } catch (err) {
      console.error('Error fetching client data:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchClientData();
  }, [client.id]);

  const handleSave = async () => {
    if (!editForm.company_name.trim()) {
      toast({
        title: 'Error',
        description: 'Business name is required',
        variant: 'destructive',
      });
      return;
    }

    setSaving(true);
    try {
      const { error } = await supabase
        .from('clients')
        .update({
          company_name: editForm.company_name.trim(),
          industry: editForm.industry.trim() || null,
          leads_from: editForm.leads_from.trim() || null,
          company_links: editForm.company_links.trim() || null,
          yearly_increase: editForm.yearly_increase,
          is_hiring: editForm.is_hiring,
          contractor_count: editForm.contractor_count,
          notes: editForm.notes.trim() || null,
        })
        .eq('id', client.id);

      if (error) throw error;

      toast({ title: 'Success', description: 'Client updated successfully' });
      setEditing(false);
      onUpdate();
    } catch (err: any) {
      toast({
        title: 'Error',
        description: 'Failed to update client: ' + err.message,
        variant: 'destructive',
      });
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!confirm('Are you sure you want to delete this client? This will also delete all contacts, assignments, and communications.')) {
      return;
    }

    setDeleting(true);
    try {
      // Get current user for audit trail
      const { data: { user } } = await supabase.auth.getUser();
      
      // Archive client before deletion
      const { error: archiveError } = await supabase.from('deleted_clients').insert({
        original_id: client.id,
        company_name: client.company_name,
        industry: client.industry,
        website: client.website,
        address: client.address,
        notes: client.notes,
        leads_from: client.leads_from,
        company_links: client.company_links,
        yearly_increase: client.yearly_increase,
        contractor_count: client.contractor_count,
        is_hiring: client.is_hiring,
        created_at: client.created_at,
        deleted_by: user?.id || null,
      });
      
      if (archiveError) {
        console.error('Failed to archive client:', archiveError);
        // Continue with deletion even if archive fails
      }
      
      const { error } = await supabase.from('clients').delete().eq('id', client.id);
      if (error) throw error;

      toast({ title: 'Success', description: 'Client archived and deleted successfully' });
      onClose();
      onUpdate();
    } catch (err: any) {
      toast({
        title: 'Error',
        description: 'Failed to delete client: ' + err.message,
        variant: 'destructive',
      });
    } finally {
      setDeleting(false);
    }
  };

  const handleDeleteContact = async (contactId: string) => {
    if (!confirm('Delete this contact?')) return;

    const { error } = await supabase.from('client_contacts').delete().eq('id', contactId);
    if (error) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    } else {
      toast({ title: 'Contact deleted' });
      fetchClientData();
    }
  };

  const handleSetPrimaryContact = async (contactId: string) => {
    // First unset all primary
    await supabase.from('client_contacts').update({ is_primary: false }).eq('client_id', client.id);
    // Then set the new primary
    await supabase.from('client_contacts').update({ is_primary: true }).eq('id', contactId);
    fetchClientData();
    toast({ title: 'Primary contact updated' });
  };

  const startEditingContact = (contact: ClientContact) => {
    setEditingContactId(contact.id);
    setContactEditForm({
      full_name: contact.full_name,
      first_name: contact.first_name || '',
      last_name: contact.last_name || '',
      email: contact.email || '',
      phone: contact.phone || '',
      role: contact.role || '',
      notes: contact.notes || '',
    });
  };

  const handleSaveContact = async () => {
    if (!editingContactId) return;
    setSavingContact(true);
    try {
      const fullName = [contactEditForm.first_name.trim(), contactEditForm.last_name.trim()].filter(Boolean).join(' ') || contactEditForm.full_name.trim();
      const { error } = await supabase
        .from('client_contacts')
        .update({
          first_name: contactEditForm.first_name.trim() || null,
          last_name: contactEditForm.last_name.trim() || null,
          full_name: fullName,
          email: contactEditForm.email.trim() || null,
          phone: contactEditForm.phone.trim() || null,
          role: contactEditForm.role.trim() || null,
          notes: contactEditForm.notes.trim() || null,
        })
        .eq('id', editingContactId);
      if (error) throw error;
      toast({ title: 'Contact updated' });
      setEditingContactId(null);
      fetchClientData();
    } catch (err: any) {
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
    } finally {
      setSavingContact(false);
    }
  };

  const getContactDisplayName = (contact: ClientContact) => {
    if (contact.first_name || contact.last_name) {
      return [contact.first_name, contact.last_name].filter(Boolean).join(' ');
    }
    return contact.full_name;
  };

  const CONTRACTOR_STATUS_COLORS: Record<string, string> = {
    active: 'bg-green-500/10 text-green-600',
    scheduled: 'bg-amber-500/10 text-amber-600',
    rendering: 'bg-cyan-500/10 text-cyan-600',
    resigned: 'bg-purple-500/10 text-purple-600',
    terminated: 'bg-red-500/10 text-red-600',
  };

  const SEPARATED_STATUSES = ['rendering', 'terminated', 'resigned'];

  const activeContractors = contractors.filter(
    a => !SEPARATED_STATUSES.includes(a.status?.toLowerCase?.() || '')
  );
  const previousContractors = contractors.filter(
    a => SEPARATED_STATUSES.includes(a.status?.toLowerCase?.() || '')
  );

  const handleRemoveContractor = async (assignmentId: string) => {
    if (!confirm('Remove this contractor from the client? This will delete the assignment record.')) return;

    try {
      const { error } = await supabase
        .from('contractor_assignments')
        .delete()
        .eq('id', assignmentId);

      if (error) throw error;

      toast({ title: 'Contractor removed' });
      fetchClientData();
    } catch (err: any) {
      toast({
        title: 'Error',
        description: err.message,
        variant: 'destructive',
      });
    }
  };

  const COMMUNICATION_ICONS: Record<string, React.ReactNode> = {
    email: <Mail className="w-4 h-4" />,
    call: <Phone className="w-4 h-4" />,
    meeting: <Users className="w-4 h-4" />,
    note: <FileText className="w-4 h-4" />,
  };

  return (
    <Sheet open={true} onOpenChange={() => onClose()}>
      <SheetContent className="w-full sm:max-w-2xl overflow-y-auto">
        <SheetHeader className="flex flex-row items-start justify-between">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 bg-primary/10 rounded-lg flex items-center justify-center">
              <Building2 className="w-6 h-6 text-primary" />
            </div>
            <div>
              {editing ? (
                <Input
                  value={editForm.company_name}
                  onChange={(e) => setEditForm({ ...editForm, company_name: e.target.value })}
                  className="text-xl font-bold"
                />
              ) : (
                <div className="flex items-center gap-2">
                  <SheetTitle className="text-xl">{client.company_name}</SheetTitle>
                  {client.is_hiring && (
                    <Badge variant="outline" className="text-xs text-green-600 border-green-300">
                      Hiring
                    </Badge>
                  )}
                  {client.yearly_increase && (
                    <Badge variant="outline" className="text-xs text-amber-600 border-amber-300">
                      <TrendingUp className="w-3 h-3 mr-1" />
                      4% Increase
                    </Badge>
                  )}
                </div>
              )}
            </div>
          </div>
        </SheetHeader>

        <div className="mt-6 space-y-6">
          {/* Actions */}
          <div className="flex items-center justify-between">
            <div className="flex gap-2">
              {editing ? (
                <>
                  <Button onClick={handleSave} disabled={saving}>
                    {saving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
                    Save
                  </Button>
                  <Button variant="ghost" onClick={() => setEditing(false)}>Cancel</Button>
                </>
              ) : (
                <>
                  <Button variant="outline" size="sm" onClick={() => setEditing(true)}>
                    <Edit2 className="w-4 h-4 mr-2" />
                    Edit
                  </Button>
                  <Button variant="destructive" size="sm" onClick={handleDelete} disabled={deleting}>
                    {deleting ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Trash2 className="w-4 h-4 mr-2" />}
                    Delete
                  </Button>
                </>
              )}
            </div>
            {!editing && (
              <HiringToggle 
                clientId={client.id} 
                isHiring={client.is_hiring || false} 
                onUpdate={onUpdate} 
              />
            )}
          </div>

          {/* Company Information Section */}
          <div className="space-y-3">
            <h3 className="text-sm font-semibold text-foreground flex items-center gap-2 border-b pb-2">
              <Building2 className="w-4 h-4" />
              Company Information
            </h3>
            {editing ? (
              <div className="grid gap-3">
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground">Industry</Label>
                    <Input
                      list="edit-industry-suggestions"
                      value={editForm.industry}
                      onChange={(e) => setEditForm({ ...editForm, industry: e.target.value })}
                      placeholder="Select or type industry"
                      className="h-9"
                    />
                    <datalist id="edit-industry-suggestions">
                      {existingIndustries.map((ind) => (
                        <option key={ind} value={ind} />
                      ))}
                    </datalist>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground">No. of Contractors</Label>
                    <Input
                      type="number"
                      min="0"
                      value={editForm.contractor_count}
                      onChange={(e) => setEditForm({ ...editForm, contractor_count: parseInt(e.target.value) || 0 })}
                      className="h-9"
                    />
                  </div>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">Leads from</Label>
                  <Input
                    list="edit-leads-from-suggestions"
                    value={editForm.leads_from}
                    onChange={(e) => setEditForm({ ...editForm, leads_from: e.target.value })}
                    placeholder="Select or type source"
                    className="h-9"
                  />
                  <datalist id="edit-leads-from-suggestions">
                    {existingSources.map((src) => (
                      <option key={src} value={src} />
                    ))}
                  </datalist>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">Company Links (to share with candidates)</Label>
                  <Textarea
                    value={editForm.company_links}
                    onChange={(e) => setEditForm({ ...editForm, company_links: e.target.value })}
                    rows={2}
                  />
                </div>
                <div className="flex gap-6">
                  <div className="flex items-center space-x-2">
                    <Checkbox
                      id="is_hiring_edit"
                      checked={editForm.is_hiring}
                      onCheckedChange={(checked) => setEditForm({ ...editForm, is_hiring: !!checked })}
                    />
                    <Label htmlFor="is_hiring_edit" className="text-sm font-normal">Currently Hiring</Label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <Checkbox
                      id="yearly_increase_edit"
                      checked={editForm.yearly_increase}
                      onCheckedChange={(checked) => setEditForm({ ...editForm, yearly_increase: !!checked })}
                    />
                    <Label htmlFor="yearly_increase_edit" className="text-sm font-normal">4% Yearly Increase</Label>
                  </div>
                </div>
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div>
                  <span className="text-xs text-muted-foreground">Industry</span>
                  <p className="font-medium">{client.industry || '—'}</p>
                </div>
                <div>
                  <span className="text-xs text-muted-foreground">No. of Contractors</span>
                  <p className="font-medium">{client.contractor_count ?? 0}</p>
                </div>
                <div>
                  <span className="text-xs text-muted-foreground">Leads from</span>
                  <p className="font-medium">{client.leads_from || '—'}</p>
                </div>
                <div>
                  <span className="text-xs text-muted-foreground">Flags</span>
                  <div className="flex gap-2 mt-0.5">
                    {client.is_hiring && (
                      <Badge variant="outline" className="text-xs text-green-600 border-green-300">Hiring</Badge>
                    )}
                    {client.yearly_increase && (
                      <Badge variant="outline" className="text-xs text-amber-600 border-amber-300">
                        <TrendingUp className="w-3 h-3 mr-1" />4%
                      </Badge>
                    )}
                    {!client.is_hiring && !client.yearly_increase && <span className="text-muted-foreground">—</span>}
                  </div>
                </div>
                {client.company_links && (
                  <div className="col-span-2">
                    <span className="text-xs text-muted-foreground">Company Links</span>
                    <p className="font-medium break-all">{client.company_links}</p>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Notes Section */}
          <div className="space-y-3">
            <h3 className="text-sm font-semibold text-foreground flex items-center gap-2 border-b pb-2">
              <FileText className="w-4 h-4" />
              Notes
            </h3>
            {editing ? (
              <Textarea
                value={editForm.notes}
                onChange={(e) => setEditForm({ ...editForm, notes: e.target.value })}
                rows={3}
                placeholder="Add notes..."
              />
            ) : (
              <p className="text-sm text-muted-foreground whitespace-pre-wrap">
                {client.notes || 'No notes yet'}
              </p>
            )}
          </div>

          {/* Tabs */}
          <Tabs defaultValue="contacts" className="space-y-4">
            <TabsList className="grid w-full grid-cols-4">
              <TabsTrigger value="contacts" className="flex items-center gap-1">
                <Users className="w-4 h-4" />
                Contacts ({contacts.length})
              </TabsTrigger>
              <TabsTrigger value="contractors" className="flex items-center gap-1">
                <Briefcase className="w-4 h-4" />
                Contractors ({activeContractors.length})
              </TabsTrigger>
              <TabsTrigger value="communications" className="flex items-center gap-1">
                <MessageSquare className="w-4 h-4" />
                Comms ({communications.length})
              </TabsTrigger>
              <TabsTrigger value="portal" className="flex items-center gap-1">
                <KeyRound className="w-4 h-4" />
                Portal
              </TabsTrigger>
            </TabsList>

            {/* Contacts Tab */}
            <TabsContent value="contacts" className="space-y-3">
              <Button size="sm" onClick={() => setAddContactOpen(true)}>
                <Plus className="w-4 h-4 mr-2" />
                Add Contact
              </Button>

              {loading ? (
                <div className="flex justify-center py-6">
                  <Loader2 className="w-5 h-5 animate-spin" />
                </div>
              ) : contacts.length === 0 ? (
                <p className="text-center text-muted-foreground py-6">No contacts yet</p>
              ) : (
                <div className="space-y-2">
                  {contacts.map(contact => (
                    <Card key={contact.id} className="p-3">
                      {editingContactId === contact.id ? (
                        <div className="space-y-3">
                          <div className="grid grid-cols-2 gap-2">
                            <div className="space-y-1">
                              <Label className="text-xs text-muted-foreground">First Name</Label>
                              <Input
                                value={contactEditForm.first_name}
                                onChange={(e) => setContactEditForm({ ...contactEditForm, first_name: e.target.value })}
                                className="h-8 text-sm"
                              />
                            </div>
                            <div className="space-y-1">
                              <Label className="text-xs text-muted-foreground">Last Name</Label>
                              <Input
                                value={contactEditForm.last_name}
                                onChange={(e) => setContactEditForm({ ...contactEditForm, last_name: e.target.value })}
                                className="h-8 text-sm"
                              />
                            </div>
                          </div>
                          <div className="grid grid-cols-2 gap-2">
                            <div className="space-y-1">
                              <Label className="text-xs text-muted-foreground">Email</Label>
                              <Input
                                value={contactEditForm.email}
                                onChange={(e) => setContactEditForm({ ...contactEditForm, email: e.target.value })}
                                className="h-8 text-sm"
                                type="email"
                              />
                            </div>
                            <div className="space-y-1">
                              <Label className="text-xs text-muted-foreground">Phone</Label>
                              <Input
                                value={contactEditForm.phone}
                                onChange={(e) => setContactEditForm({ ...contactEditForm, phone: e.target.value })}
                                className="h-8 text-sm"
                              />
                            </div>
                          </div>
                          <div className="space-y-1">
                            <Label className="text-xs text-muted-foreground">Role</Label>
                            <Input
                              value={contactEditForm.role}
                              onChange={(e) => setContactEditForm({ ...contactEditForm, role: e.target.value })}
                              className="h-8 text-sm"
                              placeholder="e.g. HR Manager"
                            />
                          </div>
                          <div className="flex gap-2 justify-end">
                            <Button variant="ghost" size="sm" onClick={() => setEditingContactId(null)}>Cancel</Button>
                            <Button size="sm" onClick={handleSaveContact} disabled={savingContact}>
                              {savingContact && <Loader2 className="w-3 h-3 mr-1 animate-spin" />}
                              Save
                            </Button>
                          </div>
                        </div>
                      ) : (
                        <div className="flex items-start justify-between">
                          <div className="flex items-start gap-3 cursor-pointer" onClick={() => startEditingContact(contact)}>
                            <div className="w-8 h-8 bg-muted rounded-full flex items-center justify-center">
                              <User className="w-4 h-4" />
                            </div>
                            <div>
                              <div className="flex items-center gap-2">
                                <span className="font-medium">{getContactDisplayName(contact)}</span>
                                {contact.is_primary && (
                                  <Badge variant="outline" className="text-xs">
                                    <Star className="w-3 h-3 mr-1 fill-amber-400 text-amber-400" />
                                    Primary
                                  </Badge>
                                )}
                              </div>
                              {contact.role && <p className="text-sm text-muted-foreground">{contact.role}</p>}
                              <div className="flex items-center gap-3 mt-1 text-sm text-muted-foreground">
                                {contact.email && (
                                  <span className="flex items-center gap-1">
                                    <Mail className="w-3 h-3" />
                                    {contact.email}
                                  </span>
                                )}
                                {contact.phone && (
                                  <span className="flex items-center gap-1">
                                    <Phone className="w-3 h-3" />
                                    {contact.phone}
                                  </span>
                                )}
                              </div>
                            </div>
                          </div>
                          <div className="flex gap-1">
                            <Button 
                              variant="ghost" 
                              size="sm"
                              onClick={() => startEditingContact(contact)}
                              title="Edit contact"
                            >
                              <Edit2 className="w-4 h-4" />
                            </Button>
                            {!contact.is_primary && (
                              <Button 
                                variant="ghost" 
                                size="sm"
                                onClick={() => handleSetPrimaryContact(contact.id)}
                                title="Set as primary"
                              >
                                <Star className="w-4 h-4" />
                              </Button>
                            )}
                            <Button 
                              variant="ghost" 
                              size="sm"
                              onClick={() => handleDeleteContact(contact.id)}
                            >
                              <Trash2 className="w-4 h-4 text-destructive" />
                            </Button>
                          </div>
                        </div>
                      )}
                    </Card>
                  ))}
                </div>
              )}
            </TabsContent>

            {/* Contractors Tab */}
            <TabsContent value="contractors" className="space-y-4">
              <Button size="sm" onClick={() => setAddContractorOpen(true)}>
                <Plus className="w-4 h-4 mr-2" />
                Assign Contractor
              </Button>

              {loading ? (
                <div className="flex justify-center py-6">
                  <Loader2 className="w-5 h-5 animate-spin" />
                </div>
              ) : contractors.length === 0 ? (
                <p className="text-center text-muted-foreground py-6">No contractors assigned</p>
              ) : (
                <>
                  {activeContractors.length > 0 && (
                    <div className="space-y-2">
                      <h4 className="text-sm font-medium text-foreground flex items-center gap-2">
                        <Briefcase className="w-4 h-4" />
                        Active Contractors ({activeContractors.length})
                      </h4>
                      {activeContractors.map(assignment => (
                        <Card key={assignment.id} className="p-3">
                          <div className="flex items-start justify-between">
                            <div className="flex-1">
                              <div className="flex items-center gap-2">
                                <span className="font-medium">{assignment.applicant?.full_name || 'Unknown'}</span>
                                <Badge className={CONTRACTOR_STATUS_COLORS[assignment.status] || 'bg-muted text-muted-foreground'}>
                                  {assignment.status}
                                </Badge>
                              </div>
                              <p className="text-sm text-muted-foreground">
                                {assignment.job_title || 'No title specified'}
                              </p>
                              <div className="flex items-center gap-4 mt-1 text-sm text-muted-foreground flex-wrap">
                                {assignment.hourly_rate && (
                                  <span className="flex items-center gap-1">
                                    <DollarSign className="w-3 h-3" />
                                    ${assignment.hourly_rate}/hr
                                  </span>
                                )}
                                {assignment.start_date && (
                                  <span className="flex items-center gap-1">
                                    <Calendar className="w-3 h-3" />
                                    Started {format(parseDateOnly(assignment.start_date), 'MMM d, yyyy')}
                                  </span>
                                )}
                                {assignment.timesheet_link && (
                                  <a
                                    href={assignment.timesheet_link}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="flex items-center gap-1 text-primary hover:underline"
                                  >
                                    <Link className="w-3 h-3" />
                                    Timesheet
                                  </a>
                                )}
                              </div>
                            </div>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleRemoveContractor(assignment.id)}
                              title="Remove contractor"
                            >
                              <Trash2 className="w-4 h-4 text-destructive" />
                            </Button>
                          </div>
                        </Card>
                      ))}
                    </div>
                  )}

                  {previousContractors.length > 0 && (
                    <div className="space-y-2">
                      <h4 className="text-sm font-medium text-muted-foreground flex items-center gap-2 mt-4">
                        <Users className="w-4 h-4" />
                        Previous Contractors ({previousContractors.length})
                      </h4>
                      {previousContractors.map(assignment => (
                        <Card key={assignment.id} className="p-3 opacity-75">
                          <div className="flex items-start justify-between">
                            <div className="flex-1">
                              <div className="flex items-center gap-2">
                                <span className="font-medium">{assignment.applicant?.full_name || 'Unknown'}</span>
                                <Badge className={CONTRACTOR_STATUS_COLORS[assignment.status] || 'bg-muted text-muted-foreground'}>
                                  {assignment.status}
                                </Badge>
                              </div>
                              <p className="text-sm text-muted-foreground">
                                {assignment.job_title || 'No title specified'}
                              </p>
                              <div className="flex items-center gap-4 mt-1 text-sm text-muted-foreground flex-wrap">
                                {assignment.hourly_rate && (
                                  <span className="flex items-center gap-1">
                                    <DollarSign className="w-3 h-3" />
                                    ${assignment.hourly_rate}/hr
                                  </span>
                                )}
                                {assignment.start_date && (
                                  <span className="flex items-center gap-1">
                                    <Calendar className="w-3 h-3" />
                                    Started {format(parseDateOnly(assignment.start_date), 'MMM d, yyyy')}
                                  </span>
                                )}
                                {assignment.end_date && (
                                  <span className="flex items-center gap-1">
                                    <Calendar className="w-3 h-3" />
                                    Ended {format(parseDateOnly(assignment.end_date), 'MMM d, yyyy')}
                                  </span>
                                )}
                              </div>
                            </div>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleRemoveContractor(assignment.id)}
                              title="Remove contractor"
                            >
                              <Trash2 className="w-4 h-4 text-destructive" />
                            </Button>
                          </div>
                        </Card>
                      ))}
                    </div>
                  )}

                  {activeContractors.length === 0 && previousContractors.length === 0 && (
                    <p className="text-center text-muted-foreground py-6">No contractors assigned</p>
                  )}
                </>
              )}
            </TabsContent>

            {/* Communications Tab */}
            <TabsContent value="communications" className="space-y-3">
              <Button size="sm" onClick={() => setAddCommunicationOpen(true)}>
                <Plus className="w-4 h-4 mr-2" />
                Log Communication
              </Button>

              {loading ? (
                <div className="flex justify-center py-6">
                  <Loader2 className="w-5 h-5 animate-spin" />
                </div>
              ) : communications.length === 0 ? (
                <p className="text-center text-muted-foreground py-6">No communications logged</p>
              ) : (
                <div className="space-y-2">
                  {communications.map(comm => (
                    <Card key={comm.id} className="p-3">
                      <div className="flex items-start gap-3">
                        <div className="w-8 h-8 bg-muted rounded-full flex items-center justify-center">
                          {COMMUNICATION_ICONS[comm.communication_type]}
                        </div>
                        <div className="flex-1">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <Badge variant="outline" className="capitalize">
                                {comm.communication_type}
                              </Badge>
                              {comm.contact && (
                                <span className="text-sm text-muted-foreground">
                                  with {comm.contact.full_name}
                                </span>
                              )}
                            </div>
                            <span className="text-xs text-muted-foreground">
                              {formatDateTime(comm.communication_date)}
                            </span>
                          </div>
                          {comm.subject && <p className="font-medium mt-1">{comm.subject}</p>}
                          {comm.content && (
                            <p className="text-sm text-muted-foreground mt-1 whitespace-pre-wrap">
                              {comm.content}
                            </p>
                          )}
                        </div>
                      </div>
                    </Card>
                  ))}
                </div>
              )}
            </TabsContent>

            {/* Portal Tab */}
            <TabsContent value="portal" className="space-y-3">
              <ClientPortalAccountsSection clientId={client.id} />
            </TabsContent>
          </Tabs>
        </div>

        {/* Dialogs */}
        <AddContactDialog
          open={addContactOpen}
          onOpenChange={setAddContactOpen}
          clientId={client.id}
          onContactAdded={fetchClientData}
        />
        <AddContractorDialog
          open={addContractorOpen}
          onOpenChange={setAddContractorOpen}
          clientId={client.id}
          onContractorAdded={fetchClientData}
        />
        <AddCommunicationDialog
          open={addCommunicationOpen}
          onOpenChange={setAddCommunicationOpen}
          clientId={client.id}
          contacts={contacts}
          onCommunicationAdded={fetchClientData}
        />
      </SheetContent>
    </Sheet>
  );
};