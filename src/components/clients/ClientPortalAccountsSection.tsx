import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Checkbox } from '@/components/ui/checkbox';
import { useToast } from '@/hooks/use-toast';
import { Loader2, Plus, Trash2, KeyRound, User as UserIcon, Copy, Mail, Phone, ChevronDown, ChevronUp, X, UserPlus } from 'lucide-react';
import { format } from 'date-fns';
import { formatDate } from "@/lib/dateFormat";

interface PortalUser {
  id: string;
  username: string | null;
  email: string | null;
  must_change_password: boolean;
  created_at: string;
  full_name: string | null;
  primary_email: string | null;
  secondary_email: string | null;
  phone: string | null;
  is_first_login: boolean | null;
  label: string | null;
}

interface Contractor {
  id: string;
  job_title: string | null;
  status: string | null;
  applicant: { full_name: string | null } | null;
}

const DEFAULT_PASSWORD = 'OutSta2026!';

export function ClientPortalAccountsSection({ clientId }: { clientId: string }) {
  const { toast } = useToast();
  const [accounts, setAccounts] = useState<PortalUser[]>([]);
  const [contractors, setContractors] = useState<Contractor[]>([]);
  const [assignments, setAssignments] = useState<Record<string, string[]>>({}); // portal_user_id -> [assignment_id]
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [busy, setBusy] = useState(false);
  const [resetFor, setResetFor] = useState<string | null>(null);
  const [resetPwd, setResetPwd] = useState(DEFAULT_PASSWORD);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [editingLabelFor, setEditingLabelFor] = useState<string | null>(null);
  const [labelDraft, setLabelDraft] = useState('');

  // Create form
  const [cUsername, setCUsername] = useState('');
  const [cPassword, setCPassword] = useState(DEFAULT_PASSWORD);
  const [cLabel, setCLabel] = useState('');
  const [cContractorIds, setCContractorIds] = useState<string[]>([]);

  const fetchAll = async () => {
    setLoading(true);
    const [{ data: accs, error: accErr }, { data: cons }] = await Promise.all([
      supabase
        .from('client_portal_users')
        .select('id, username, email, must_change_password, created_at, full_name, primary_email, secondary_email, phone, is_first_login, label')
        .eq('client_id', clientId)
        .order('created_at', { ascending: false }),
      supabase
        .from('contractor_assignments')
        .select('id, job_title, status, applicant:applicants_prescreen(full_name)')
        .eq('client_id', clientId)
        .in('status', ['active', 'scheduled', 'rendering']),
    ]);
    if (accErr) toast({ title: 'Failed to load accounts', description: accErr.message, variant: 'destructive' });
    const accountList = (accs || []) as PortalUser[];
    setAccounts(accountList);
    setContractors((cons || []) as any);

    // Load assignments for all accounts
    if (accountList.length > 0) {
      const { data: rels } = await supabase
        .from('client_portal_user_contractors')
        .select('portal_user_id, contractor_assignment_id')
        .in('portal_user_id', accountList.map(a => a.id));
      const map: Record<string, string[]> = {};
      (rels || []).forEach((r: any) => {
        map[r.portal_user_id] = map[r.portal_user_id] || [];
        map[r.portal_user_id].push(r.contractor_assignment_id);
      });
      setAssignments(map);
    } else {
      setAssignments({});
    }
    setLoading(false);
  };

  useEffect(() => { fetchAll(); /* eslint-disable-next-line */ }, [clientId]);

  const resetCreateForm = () => {
    setCUsername('');
    setCPassword(DEFAULT_PASSWORD);
    setCLabel('');
    setCContractorIds([]);
  };

  const handleCreate = async () => {
    if (!cUsername.trim() || !cPassword) {
      toast({ title: 'Username and password are required', variant: 'destructive' });
      return;
    }
    setBusy(true);
    const { data, error } = await supabase.functions.invoke('create-client-portal-account', {
      body: {
        action: 'create',
        clientId,
        username: cUsername.trim(),
        password: cPassword,
        label: cLabel.trim() || null,
        contractorAssignmentIds: cContractorIds,
      },
    });
    setBusy(false);
    if (error || (data as any)?.error) {
      toast({ title: 'Could not create account', description: (data as any)?.error || error?.message, variant: 'destructive' });
      return;
    }
    toast({ title: 'Sub-account created', description: `Login: ${cUsername.trim()}  /  Password: ${cPassword}` });
    resetCreateForm();
    setShowCreate(false);
    fetchAll();
  };

  const handleReset = async (portalUserId: string) => {
    if (!resetPwd || resetPwd.length < 6) {
      toast({ title: 'Password must be at least 6 characters', variant: 'destructive' });
      return;
    }
    setBusy(true);
    const { data, error } = await supabase.functions.invoke('create-client-portal-account', {
      body: { action: 'reset_password', portalUserId, password: resetPwd },
    });
    setBusy(false);
    if (error || (data as any)?.error) {
      toast({ title: 'Reset failed', description: (data as any)?.error || error?.message, variant: 'destructive' });
      return;
    }
    toast({ title: 'Password reset', description: `New password: ${resetPwd}` });
    setResetFor(null);
    setResetPwd(DEFAULT_PASSWORD);
    fetchAll();
  };

  const handleDelete = async (portalUserId: string) => {
    if (!confirm('Delete this portal account? This login will no longer work.')) return;
    setBusy(true);
    const { data, error } = await supabase.functions.invoke('create-client-portal-account', {
      body: { action: 'delete', portalUserId },
    });
    setBusy(false);
    if (error || (data as any)?.error) {
      toast({ title: 'Delete failed', description: (data as any)?.error || error?.message, variant: 'destructive' });
      return;
    }
    toast({ title: 'Account deleted' });
    fetchAll();
  };

  const persistAssignments = async (portalUserId: string, ids: string[]) => {
    const { error } = await supabase.functions.invoke('create-client-portal-account', {
      body: { action: 'set_contractors', portalUserId, contractorAssignmentIds: ids },
    });
    if (error) {
      toast({ title: 'Failed to update contractor access', description: error.message, variant: 'destructive' });
      fetchAll();
    }
  };

  const toggleContractor = (portalUserId: string, contractorId: string) => {
    const current = assignments[portalUserId] || [];
    const next = current.includes(contractorId)
      ? current.filter(id => id !== contractorId)
      : [...current, contractorId];
    setAssignments(prev => ({ ...prev, [portalUserId]: next }));
    persistAssignments(portalUserId, next);
  };

  const removeContractor = (portalUserId: string, contractorId: string) => {
    const next = (assignments[portalUserId] || []).filter(id => id !== contractorId);
    setAssignments(prev => ({ ...prev, [portalUserId]: next }));
    persistAssignments(portalUserId, next);
  };

  const saveLabel = async (portalUserId: string) => {
    setBusy(true);
    const { error } = await supabase.functions.invoke('create-client-portal-account', {
      body: { action: 'update_label', portalUserId, label: labelDraft.trim() },
    });
    setBusy(false);
    if (error) {
      toast({ title: 'Failed to save label', description: error.message, variant: 'destructive' });
      return;
    }
    setEditingLabelFor(null);
    setLabelDraft('');
    fetchAll();
  };

  const displayLogin = (a: PortalUser) =>
    a.username || (a.email && !a.email.endsWith('@portal.outsta.local') ? a.email : '—');

  const contractorLabel = (c: Contractor) =>
    `${c.applicant?.full_name || 'Unknown'}${c.job_title ? ` · ${c.job_title}` : ''}`;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">
          Create login accounts so this client can review and approve timesheets at <code className="text-xs">/client-portal</code>. Each sub-account can be scoped to specific contractors.
        </p>
        <Button size="sm" onClick={() => setShowCreate(true)}>
          <Plus className="w-4 h-4 mr-1" /> New account
        </Button>
      </div>

      {loading ? (
        <div className="flex justify-center py-6"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /></div>
      ) : accounts.length === 0 ? (
        <Card className="p-6 text-center text-sm text-muted-foreground">No portal accounts yet.</Card>
      ) : (
        <div className="space-y-2">
          {accounts.map((a) => {
            const assigned = assignments[a.id] || [];
            const assignedSet = new Set(assigned);
            const unassignedContractors = contractors.filter(c => !assignedSet.has(c.id));
            return (
              <Card key={a.id} className="p-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <UserIcon className="w-4 h-4 text-muted-foreground shrink-0" />
                      <span className="font-medium truncate">{displayLogin(a)}</span>
                      {a.label && (
                        <span className="text-[10px] uppercase tracking-wide bg-primary/10 text-primary px-1.5 py-0.5 rounded">
                          {a.label}
                        </span>
                      )}
                      {assigned.length === 0 && (
                        <span className="text-[10px] uppercase tracking-wide bg-slate-100 text-slate-700 px-1.5 py-0.5 rounded" title="No contractor restriction — sees all contractors under this client">
                          All contractors
                        </span>
                      )}
                      {a.must_change_password && (
                        <span className="text-[10px] uppercase tracking-wide bg-amber-100 text-amber-800 px-1.5 py-0.5 rounded">
                          Password not changed
                        </span>
                      )}
                      <button
                        type="button"
                        onClick={() => { navigator.clipboard.writeText(displayLogin(a)); toast({ title: 'Copied' }); }}
                        className="text-muted-foreground hover:text-foreground"
                        title="Copy login"
                      >
                        <Copy className="w-3 h-3" />
                      </button>
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {a.full_name ? <span className="font-medium text-foreground">{a.full_name} · </span> : null}
                      Created {formatDate(a.created_at)}
                      {a.is_first_login === false && <span className="ml-2 text-[10px] uppercase tracking-wide bg-emerald-100 text-emerald-800 px-1.5 py-0.5 rounded">Profile complete</span>}
                    </p>

                    {/* Assigned contractors */}
                    <div className="mt-2 flex flex-wrap items-center gap-1.5">
                      {assigned.map(cid => {
                        const c = contractors.find(x => x.id === cid);
                        if (!c) return null;
                        return (
                          <span key={cid} className="inline-flex items-center gap-1 text-xs bg-muted rounded-full pl-2 pr-1 py-0.5 border">
                            {contractorLabel(c)}
                            <button
                              type="button"
                              onClick={() => removeContractor(a.id, cid)}
                              className="hover:bg-destructive/10 rounded-full p-0.5"
                              title="Unassign"
                            >
                              <X className="w-3 h-3" />
                            </button>
                          </span>
                        );
                      })}
                      <Popover>
                        <PopoverTrigger asChild>
                          <button
                            type="button"
                            className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
                          >
                            <UserPlus className="w-3 h-3" /> Assign contractor
                          </button>
                        </PopoverTrigger>
                        <PopoverContent className="w-72 p-2 max-h-64 overflow-y-auto" align="start">
                          {unassignedContractors.length === 0 ? (
                            <p className="text-xs text-muted-foreground p-2">All active contractors already assigned.</p>
                          ) : (
                            unassignedContractors.map(c => (
                              <button
                                key={c.id}
                                type="button"
                                onClick={() => toggleContractor(a.id, c.id)}
                                className="w-full text-left text-xs px-2 py-1.5 rounded hover:bg-muted"
                              >
                                {contractorLabel(c)}
                              </button>
                            ))
                          )}
                        </PopoverContent>
                      </Popover>
                    </div>

                    {/* Label edit */}
                    <div className="mt-2">
                      {editingLabelFor === a.id ? (
                        <div className="flex items-center gap-2">
                          <Input
                            value={labelDraft}
                            onChange={(e) => setLabelDraft(e.target.value)}
                            placeholder="e.g. Finance Contact"
                            className="h-7 text-xs"
                          />
                          <Button size="sm" onClick={() => saveLabel(a.id)} disabled={busy}>Save</Button>
                          <Button size="sm" variant="ghost" onClick={() => { setEditingLabelFor(null); setLabelDraft(''); }}>Cancel</Button>
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={() => { setEditingLabelFor(a.id); setLabelDraft(a.label || ''); }}
                          className="text-xs text-muted-foreground hover:text-foreground hover:underline"
                        >
                          {a.label ? 'Change label' : 'Add label'}
                        </button>
                      )}
                    </div>

                    <button
                      type="button"
                      onClick={() => setExpanded((s) => ({ ...s, [a.id]: !s[a.id] }))}
                      className="mt-2 inline-flex items-center gap-1 text-xs text-primary hover:underline"
                    >
                      {expanded[a.id] ? <><ChevronUp className="w-3 h-3" /> Hide profile details</> : <><ChevronDown className="w-3 h-3" /> View profile details</>}
                    </button>

                    {expanded[a.id] && (
                      <div className="mt-2 rounded-md border bg-muted/30 p-3 space-y-1.5 text-xs">
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1.5">
                          <div>
                            <div className="text-muted-foreground">Full name</div>
                            <div className="font-medium">{a.full_name || '—'}</div>
                          </div>
                          <div>
                            <div className="text-muted-foreground">Username</div>
                            <div className="font-medium">{a.username || '—'}</div>
                          </div>
                          <div>
                            <div className="text-muted-foreground flex items-center gap-1"><Mail className="w-3 h-3" /> Primary email</div>
                            <div className="font-medium break-all">{a.primary_email || '—'}</div>
                          </div>
                          <div>
                            <div className="text-muted-foreground flex items-center gap-1"><Mail className="w-3 h-3" /> Secondary email</div>
                            <div className="font-medium break-all">{a.secondary_email || '—'}</div>
                          </div>
                          <div>
                            <div className="text-muted-foreground flex items-center gap-1"><Phone className="w-3 h-3" /> Phone</div>
                            <div className="font-medium">{a.phone || '—'}</div>
                          </div>
                          <div>
                            <div className="text-muted-foreground">Setup status</div>
                            <div className="font-medium">{a.is_first_login === false ? 'Completed' : 'Pending first login'}</div>
                          </div>
                        </div>
                      </div>
                    )}

                    {resetFor === a.id && (
                      <div className="mt-3 flex items-end gap-2">
                        <div className="flex-1 space-y-1">
                          <Label htmlFor={`reset-${a.id}`} className="text-xs">New password</Label>
                          <Input id={`reset-${a.id}`} value={resetPwd} onChange={(e) => setResetPwd(e.target.value)} />
                        </div>
                        <Button size="sm" onClick={() => handleReset(a.id)} disabled={busy}>
                          {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Save'}
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => { setResetFor(null); setResetPwd(DEFAULT_PASSWORD); }}>Cancel</Button>
                      </div>
                    )}
                  </div>
                  {resetFor !== a.id && (
                    <div className="flex gap-1 shrink-0">
                      <Button size="sm" variant="outline" onClick={() => { setResetFor(a.id); setResetPwd(DEFAULT_PASSWORD); }}>
                        <KeyRound className="w-3 h-3 mr-1" /> Reset password
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => handleDelete(a.id)} className="text-destructive hover:text-destructive">
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  )}
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {/* Create modal */}
      <Dialog open={showCreate} onOpenChange={(o) => { setShowCreate(o); if (!o) resetCreateForm(); }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>New portal account</DialogTitle>
            <DialogDescription>
              Create a login for this client. Leave contractor selection empty to grant access to all contractors.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label htmlFor="new-username">Username *</Label>
                <Input
                  id="new-username"
                  placeholder="e.g. bark.finance"
                  value={cUsername}
                  onChange={(e) => setCUsername(e.target.value.toLowerCase().replace(/[^a-z0-9._-]/g, ''))}
                />
                <p className="text-[10px] text-muted-foreground">3-40 chars, lowercase letters/numbers/._-</p>
              </div>
              <div className="space-y-1">
                <Label htmlFor="new-password">Initial password *</Label>
                <Input id="new-password" value={cPassword} onChange={(e) => setCPassword(e.target.value)} />
                <p className="text-[10px] text-muted-foreground">Client will be asked to change on first login.</p>
              </div>
            </div>
            <div className="space-y-1">
              <Label htmlFor="new-label">Label / role (optional)</Label>
              <Input
                id="new-label"
                placeholder="e.g. Finance Contact"
                value={cLabel}
                onChange={(e) => setCLabel(e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <Label>Contractor access</Label>
              <div className="rounded-md border max-h-48 overflow-y-auto p-2 space-y-1">
                {contractors.length === 0 ? (
                  <p className="text-xs text-muted-foreground p-2">No active contractors under this client.</p>
                ) : contractors.map(c => (
                  <label key={c.id} className="flex items-center gap-2 text-xs px-1 py-1 rounded hover:bg-muted cursor-pointer">
                    <Checkbox
                      checked={cContractorIds.includes(c.id)}
                      onCheckedChange={(v) => {
                        setCContractorIds(prev =>
                          v ? [...prev, c.id] : prev.filter(id => id !== c.id)
                        );
                      }}
                    />
                    <span>{contractorLabel(c)}</span>
                  </label>
                ))}
              </div>
              <p className="text-[10px] text-muted-foreground">
                Leave empty to grant access to <strong>all</strong> contractors under this client.
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => { setShowCreate(false); resetCreateForm(); }}>Cancel</Button>
            <Button onClick={handleCreate} disabled={busy}>
              {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Create account'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
