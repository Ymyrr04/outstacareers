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
import { useToast } from '@/hooks/use-toast';
import { format } from 'date-fns';
import { 
  Building2, Users, Briefcase, MessageSquare, Globe, MapPin, 
  Edit2, Save, Trash2, Plus, Loader2, Phone, Mail, Star, User,
  Calendar, DollarSign, FileText, TrendingUp, Link, Hash
} from 'lucide-react';
import type { Client, ClientContact, ContractorAssignment, ClientCommunication } from './ClientsDashboard';
import { AddContactDialog } from './AddContactDialog';
import { AddContractorDialog } from './AddContractorDialog';
import { AddCommunicationDialog } from './AddCommunicationDialog';

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
    contractor_count: client.contractor_count || 0,
    notes: client.notes || '',
  });

  const [addContactOpen, setAddContactOpen] = useState(false);
  const [addContractorOpen, setAddContractorOpen] = useState(false);
  const [addCommunicationOpen, setAddCommunicationOpen] = useState(false);

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
      const { error } = await supabase.from('clients').delete().eq('id', client.id);
      if (error) throw error;

      toast({ title: 'Success', description: 'Client deleted successfully' });
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

  const getContactDisplayName = (contact: ClientContact) => {
    if (contact.first_name || contact.last_name) {
      return [contact.first_name, contact.last_name].filter(Boolean).join(' ');
    }
    return contact.full_name;
  };

  const CONTRACTOR_STATUS_COLORS: Record<string, string> = {
    active: 'bg-green-500/10 text-green-600',
    completed: 'bg-blue-500/10 text-blue-600',
    paused: 'bg-amber-500/10 text-amber-600',
    terminated: 'bg-red-500/10 text-red-600',
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
          <div className="flex gap-2">
            {editing ? (
              <>
                <Button onClick={handleSave} disabled={saving}>
                  {saving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
                  Save
                </Button>
                <Button variant="outline" onClick={() => setEditing(false)}>Cancel</Button>
              </>
            ) : (
              <>
                <Button variant="outline" onClick={() => setEditing(true)}>
                  <Edit2 className="w-4 h-4 mr-2" />
                  Edit
                </Button>
                <Button variant="destructive" onClick={handleDelete} disabled={deleting}>
                  {deleting ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Trash2 className="w-4 h-4 mr-2" />}
                  Delete
                </Button>
              </>
            )}
          </div>

          {/* Edit Form */}
          {editing && (
            <div className="grid gap-4 p-4 border rounded-lg bg-muted/30">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Industry</Label>
                  <Input
                    value={editForm.industry}
                    onChange={(e) => setEditForm({ ...editForm, industry: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label>No. of Contractors</Label>
                  <Input
                    type="number"
                    min="0"
                    value={editForm.contractor_count}
                    onChange={(e) => setEditForm({ ...editForm, contractor_count: parseInt(e.target.value) || 0 })}
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label>Leads from</Label>
                <Input
                  value={editForm.leads_from}
                  onChange={(e) => setEditForm({ ...editForm, leads_from: e.target.value })}
                  placeholder="e.g. Referral, LinkedIn"
                />
              </div>
              <div className="space-y-2">
                <Label>Company Links (to share with candidates)</Label>
                <Textarea
                  value={editForm.company_links}
                  onChange={(e) => setEditForm({ ...editForm, company_links: e.target.value })}
                  rows={2}
                />
              </div>
              <div className="flex items-center space-x-2">
                <Checkbox
                  id="yearly_increase_edit"
                  checked={editForm.yearly_increase}
                  onCheckedChange={(checked) => setEditForm({ ...editForm, yearly_increase: !!checked })}
                />
                <Label htmlFor="yearly_increase_edit" className="text-sm font-normal">
                  4% Yearly Increase
                </Label>
              </div>
              <div className="space-y-2">
                <Label>Notes</Label>
                <Textarea
                  value={editForm.notes}
                  onChange={(e) => setEditForm({ ...editForm, notes: e.target.value })}
                  rows={3}
                />
              </div>
            </div>
          )}

          {/* Info Cards */}
          {!editing && (
            <div className="grid grid-cols-2 gap-4 text-sm">
              {client.industry && (
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Briefcase className="w-4 h-4" />
                  <span>{client.industry}</span>
                </div>
              )}
              {client.leads_from && (
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Globe className="w-4 h-4" />
                  <span>From: {client.leads_from}</span>
                </div>
              )}
              <div className="flex items-center gap-2 text-muted-foreground">
                <Hash className="w-4 h-4" />
                <span>{client.contractor_count} Contractor{client.contractor_count !== 1 ? 's' : ''}</span>
              </div>
              {client.company_links && (
                <div className="flex items-start gap-2 text-muted-foreground col-span-2">
                  <Link className="w-4 h-4 mt-0.5" />
                  <span className="break-all">{client.company_links}</span>
                </div>
              )}
            </div>
          )}

          {/* Tabs */}
          <Tabs defaultValue="contacts" className="space-y-4">
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value="contacts" className="flex items-center gap-1">
                <Users className="w-4 h-4" />
                Contacts ({contacts.length})
              </TabsTrigger>
              <TabsTrigger value="contractors" className="flex items-center gap-1">
                <Briefcase className="w-4 h-4" />
                Contractors ({contractors.length})
              </TabsTrigger>
              <TabsTrigger value="communications" className="flex items-center gap-1">
                <MessageSquare className="w-4 h-4" />
                Comms ({communications.length})
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
                      <div className="flex items-start justify-between">
                        <div className="flex items-start gap-3">
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
                    </Card>
                  ))}
                </div>
              )}
            </TabsContent>

            {/* Contractors Tab */}
            <TabsContent value="contractors" className="space-y-3">
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
                <div className="space-y-2">
                  {contractors.map(assignment => (
                    <Card key={assignment.id} className="p-3">
                      <div className="flex items-start justify-between">
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-medium">{assignment.applicant?.full_name || 'Unknown'}</span>
                            <Badge className={CONTRACTOR_STATUS_COLORS[assignment.status]}>
                              {assignment.status}
                            </Badge>
                          </div>
                          <p className="text-sm text-muted-foreground">
                            {assignment.job_title || 'No title specified'}
                          </p>
                          <div className="flex items-center gap-4 mt-1 text-sm text-muted-foreground">
                            {assignment.hourly_rate && (
                              <span className="flex items-center gap-1">
                                <DollarSign className="w-3 h-3" />
                                ${assignment.hourly_rate}/hr
                              </span>
                            )}
                            {assignment.start_date && (
                              <span className="flex items-center gap-1">
                                <Calendar className="w-3 h-3" />
                                Started {format(new Date(assignment.start_date), 'MMM d, yyyy')}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    </Card>
                  ))}
                </div>
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
                              {format(new Date(comm.communication_date), 'MMM d, yyyy h:mm a')}
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
          </Tabs>

          {/* Notes */}
          {!editing && client.notes && (
            <Card>
              <CardHeader className="py-3">
                <CardTitle className="text-sm flex items-center gap-2">
                  <FileText className="w-4 h-4" />
                  Notes
                </CardTitle>
              </CardHeader>
              <CardContent className="py-2">
                <p className="text-sm text-muted-foreground whitespace-pre-wrap">{client.notes}</p>
              </CardContent>
            </Card>
          )}
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