import { useState, useEffect } from 'react';
import { format } from 'date-fns';
import { supabase } from '@/integrations/supabase/client';
import { getAdminDisplayName } from '@/lib/adminDisplayNames';
import { HiredByEditor } from './HiredByEditor';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { StatCard } from '@/components/StatCard';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { 
  Search, 
  Loader2, 
  Building2, 
  DollarSign, 
  Calendar, 
  Mail,
  Download,
  Upload,
  Briefcase,
  CheckCircle,
  PauseCircle,
  XCircle,
  Clock,
  Phone,
  Link2,
  Globe,
  RefreshCw,
  UserPlus,
  Trash2,
  AlertTriangle,
  X,
  Columns3,
  RotateCcw,
  ArrowUp,
  ArrowDown,
  ArrowUpDown,
  FileText,
  Pencil
} from 'lucide-react';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { HoverCard, HoverCardContent, HoverCardTrigger } from '@/components/ui/hover-card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { ContractorImportDialog } from './ContractorImportDialog';
import { EditContractorDialog } from './EditContractorDialog';
import { ContractorStatusDialog } from './ContractorStatusDialog';
import { SendContractorEmailDialog } from './SendContractorEmailDialog';
import { BulkContractorEmailDialog } from './BulkContractorEmailDialog';
import { ContractorEmailTemplateManager } from './ContractorEmailTemplateManager';
import { RecurringSchedulesManager } from './RecurringSchedulesManager';
import { ContractorColumnFilter } from './ContractorColumnFilter';
import { INTERNAL_CLIENT_ID } from '@/lib/internalCompany';
import { parseDateOnly } from '@/lib/dateOnly';

interface ContractorWithDetails {
  id: string;
  client_id: string;
  applicant_id: string;
  job_title: string | null;
  hourly_rate: number | null;
  hours_per_week: number | null;
  start_date: string | null;
  end_date: string | null;
  status: string;
  status_changed_at: string | null;
  notes: string | null;
  separation_note: string | null;
  contact_number: string | null;
  emergency_number: string | null;
  timesheet_link: string | null;
  is_replacement: boolean | null;
  country: string | null;
  source: string | null;
  hired_by: string | null;
  hired_via: string | null;
  hired_from_stage: string | null;
  created_at: string;
  applicant: {
    full_name: string;
    email: string;
    location: string;
    phone: string | null;
  } | null;
  client: {
    company_name: string;
    industry: string | null;
  } | null;
}

const STATUS_COLORS: Record<string, string> = {
  active: 'bg-green-500/10 text-green-700 border-green-300',
  terminated: 'bg-red-500/10 text-red-700 border-red-300',
  resigned: 'bg-purple-500/10 text-purple-700 border-purple-300',
  rendering: 'bg-cyan-500/10 text-cyan-700 border-cyan-300',
  scheduled: 'bg-amber-500/10 text-amber-700 border-amber-300',
};

const STATUS_ICONS: Record<string, React.ReactNode> = {
  active: <CheckCircle className="w-3 h-3" />,
  terminated: <XCircle className="w-3 h-3" />,
  resigned: <XCircle className="w-3 h-3" />,
  rendering: <Clock className="w-3 h-3" />,
  scheduled: <Calendar className="w-3 h-3" />,
};

export const ContractorsDashboard = () => {
  const { toast } = useToast();
  const [contractors, setContractors] = useState<ContractorWithDetails[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [columnFilters, setColumnFilters] = useState<Record<string, string[] | undefined>>({});
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [sortBy, setSortBy] = useState<string>('company_asc');
  const [importDialogOpen, setImportDialogOpen] = useState(false);
  const [editingContractor, setEditingContractor] = useState<ContractorWithDetails | null>(null);
  const [lastImportResult, setLastImportResult] = useState<{
    successCount: number;
    errors: string[];
    timestamp: Date;
  } | null>(null);
  const [showImportErrors, setShowImportErrors] = useState(false);
  const [updatingStatusId, setUpdatingStatusId] = useState<string | null>(null);
  const [editingSeparationId, setEditingSeparationId] = useState<string | null>(null);
  const [editingSeparationText, setEditingSeparationText] = useState('');
  const [savingSeparation, setSavingSeparation] = useState(false);
  const [statusDialogOpen, setStatusDialogOpen] = useState(false);
  const [emailDialogOpen, setEmailDialogOpen] = useState(false);
  const [bulkEmailDialogOpen, setBulkEmailDialogOpen] = useState(false);
  const [templateManagerOpen, setTemplateManagerOpen] = useState(false);
  const [emailRecipient, setEmailRecipient] = useState<{
    assignmentId: string;
    name: string;
    email: string;
    company: string;
    jobTitle: string;
    hourlyRate?: number | null;
  } | null>(null);
  const [pendingStatusChange, setPendingStatusChange] = useState<{
    contractorId: string;
    contractorName: string;
    status: 'rendering' | 'resigned' | 'terminated' | 'scheduled';
  } | null>(null);
  const [visibleColumns, setVisibleColumns] = useState<Record<string, boolean>>({
    status: true,
    statusChanged: true,
    name: true,
    email: true,
    company: true,
    industry: false,
    startDate: true,
    position: true,
    rate: true,
    hours: false,
    contact: true,
    emergency: false,
    timesheet: false,
    type: false,
    country: true,
    source: false,
    notes: true,
    separationNote: true,
    hiredBy: true,
  });

  const columnLabels: Record<string, string> = {
    status: 'Status',
    statusChanged: 'Status Changed',
    name: 'Name',
    email: 'Email',
    company: 'Company',
    industry: 'Industry',
    startDate: 'Start Date',
    position: 'Position',
    rate: 'Rate',
    hours: 'Hours',
    contact: 'Contact',
    emergency: 'Emergency',
    timesheet: 'Timesheet',
    type: 'Type',
    country: 'Country',
    source: 'Source',
    notes: 'Notes',
    separationNote: 'Separation Note',
    hiredBy: 'Hired By',
  };

  const COLUMN_SORT_MAP: Record<string, { asc: string; desc: string }> = {
    status: { asc: 'status', desc: 'status' },
    statusChanged: { asc: 'status_changed_asc', desc: 'status_changed_desc' },
    name: { asc: 'name_asc', desc: 'name_desc' },
    company: { asc: 'company_asc', desc: 'company_desc' },
    startDate: { asc: 'start_date_asc', desc: 'start_date_desc' },
    position: { asc: 'position_asc', desc: 'position_desc' },
    rate: { asc: 'rate_asc', desc: 'rate_desc' },
    country: { asc: 'country_asc', desc: 'country_desc' },
    hiredBy: { asc: 'hired_by_asc', desc: 'hired_by_desc' },
  };

  const handleHeaderSort = (columnKey: string) => {
    const sortConfig = COLUMN_SORT_MAP[columnKey];
    if (!sortConfig) return;
    if (sortBy === sortConfig.asc) {
      setSortBy(sortConfig.desc);
    } else {
      setSortBy(sortConfig.asc);
    }
  };

  const getSortIcon = (columnKey: string) => {
    const sortConfig = COLUMN_SORT_MAP[columnKey];
    if (!sortConfig) return null;
    if (sortBy === sortConfig.asc) return <ArrowUp className="w-3 h-3 ml-1 inline" />;
    if (sortBy === sortConfig.desc) return <ArrowDown className="w-3 h-3 ml-1 inline" />;
    return <ArrowUpDown className="w-3 h-3 ml-1 inline opacity-30" />;
  };

  const handleSaveSeparationNote = async (contractorId: string) => {
    setSavingSeparation(true);
    try {
      const newValue = editingSeparationText.trim() ? editingSeparationText : null;
      const { error } = await supabase
        .from('contractor_assignments')
        .update({ separation_note: newValue })
        .eq('id', contractorId);
      if (error) throw error;
      setContractors(prev => prev.map(c => c.id === contractorId ? { ...c, separation_note: newValue } : c));
      toast({ title: 'Separation note updated' });
      setEditingSeparationId(null);
    } catch (err: any) {
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
    } finally {
      setSavingSeparation(false);
    }
  };

  const toggleColumn = (column: string) => {
    setVisibleColumns(prev => ({ ...prev, [column]: !prev[column] }));
  };

  const handleStatusChange = async (contractorId: string, newStatus: string) => {
    // For scheduled, rendering, resigned, terminated - open dialog
    if (newStatus === 'scheduled' || newStatus === 'rendering' || newStatus === 'resigned' || newStatus === 'terminated') {
      const contractor = contractors.find(c => c.id === contractorId);
      setPendingStatusChange({
        contractorId,
        contractorName: contractor?.applicant?.full_name || 'Unknown',
        status: newStatus as 'scheduled' | 'rendering' | 'resigned' | 'terminated',
      });
      setStatusDialogOpen(true);
      return;
    }

    // Check if reactivating from terminated/resigned - create duplicate instead
    const contractor = contractors.find(c => c.id === contractorId);
    const currentStatus = contractor?.status?.toLowerCase();
    const isReactivating = (currentStatus === 'terminated' || currentStatus === 'resigned') && newStatus === 'active';

    setUpdatingStatusId(contractorId);
    try {
      if (isReactivating && contractor) {
        // Preserve original notes and append reactivation info
        const reactivationNote = `Reactivated from ${currentStatus}`;
        const preservedNotes = contractor.notes 
          ? `${contractor.notes}\n---\n${reactivationNote}`
          : reactivationNote;

        // Create a new active record (duplicate without end_date) - preserve all original data
        const { error: insertError } = await supabase
          .from('contractor_assignments')
          .insert({
            client_id: contractor.client_id,
            applicant_id: contractor.applicant_id,
            job_title: contractor.job_title,
            hourly_rate: contractor.hourly_rate,
            hours_per_week: contractor.hours_per_week,
            start_date: new Date().toISOString().split('T')[0], // Today as new start
            end_date: null,
            status: 'active',
            notes: preservedNotes,
            contact_number: contractor.contact_number,
            emergency_number: contractor.emergency_number,
            timesheet_link: contractor.timesheet_link,
            is_replacement: false,
            country: contractor.country,
            source: contractor.source,
          });

        if (insertError) throw insertError;

        // Refetch to get the new record
        await fetchContractors();

        toast({
          title: 'Contractor Reactivated',
          description: `${contractor.applicant?.full_name} has been reactivated. Previous record kept for tracking.`,
        });
      } else {
        // Normal status update
        const { error } = await supabase
          .from('contractor_assignments')
          .update({ status: newStatus })
          .eq('id', contractorId);

        if (error) throw error;

        setContractors(prev => 
          prev.map(c => c.id === contractorId ? { ...c, status: newStatus } : c)
        );

        toast({
          title: 'Status Updated',
          description: `Contractor status changed to ${newStatus}`,
        });
      }
    } catch (err: any) {
      toast({
        title: 'Error',
        description: 'Failed to update status: ' + err.message,
        variant: 'destructive',
      });
    } finally {
      setUpdatingStatusId(null);
    }
  };

  const handleStatusDialogConfirm = async (data: { 
    status: string; 
    renderingReason?: 'resign' | 'termination'; 
    effectiveDate?: string;
    startDate?: string;
    reason?: string;
  }) => {
    if (!pendingStatusChange) return;

    setUpdatingStatusId(pendingStatusChange.contractorId);
    try {
      const updateData: Record<string, any> = { 
        status: data.status,
      };

      // Find existing contractor to preserve their separation note history
      const existingContractor = contractors.find(c => c.id === pendingStatusChange.contractorId);
      const existingSeparationNote = existingContractor?.separation_note || '';

      // Build the separation note entry — saved in its own field, NOT in notes
      let statusNote = '';
      if (data.renderingReason) {
        statusNote = `Rendering for ${data.renderingReason}${data.effectiveDate ? ` - Effective: ${data.effectiveDate}` : ''}`;
      } else if ((data.status === 'resigned' || data.status === 'terminated') && data.reason) {
        statusNote = `${data.status === 'resigned' ? 'Resignation' : 'Termination'} reason: ${data.reason}`;
      }

      if (statusNote) {
        const timestamp = new Date().toISOString().split('T')[0];
        const formattedNote = `[${timestamp}] ${statusNote}`;
        updateData.separation_note = existingSeparationNote
          ? `${formattedNote}\n\n${existingSeparationNote}`
          : formattedNote;
      }
      
      // Set start_date for scheduled
      if (data.status === 'scheduled' && data.startDate) {
        updateData.start_date = data.startDate;
      }
      
      // Set end_date for rendering, resigned/terminated
      if ((data.status === 'rendering' || data.status === 'resigned' || data.status === 'terminated') && data.effectiveDate) {
        updateData.end_date = data.effectiveDate;
      }

      const { error } = await supabase
        .from('contractor_assignments')
        .update(updateData)
        .eq('id', pendingStatusChange.contractorId);

      if (error) throw error;

      setContractors(prev => 
        prev.map(c => c.id === pendingStatusChange.contractorId 
          ? { 
              ...c, 
              status: data.status, 
              start_date: updateData.start_date || c.start_date,
              end_date: updateData.end_date || c.end_date,
              separation_note: updateData.separation_note !== undefined ? updateData.separation_note : c.separation_note,
            } 
          : c
        )
      );

      toast({
        title: 'Status Updated',
        description: `Contractor status changed to ${data.status}`,
      });

      setStatusDialogOpen(false);
      setPendingStatusChange(null);
    } catch (err: any) {
      toast({
        title: 'Error',
        description: 'Failed to update status: ' + err.message,
        variant: 'destructive',
      });
    } finally {
      setUpdatingStatusId(null);
    }
  };

  const fetchContractors = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('contractor_assignments')
        .select(`
          *,
          applicant:applicants_prescreen(full_name, email, location, phone),
          client:clients(company_name, industry)
        `)
        .order('status')
        .order('start_date', { ascending: false });

      if (error) throw error;
      setContractors(data || []);
    } catch (err: any) {
      toast({
        title: 'Error',
        description: 'Failed to fetch contractors: ' + err.message,
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchContractors();

    const channel = supabase
      .channel('contractors_dashboard_changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'contractor_assignments' }, fetchContractors)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'applicants_prescreen' }, fetchContractors)
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  // Internal team = OutSta company contractors. Excluded from external
  // contractor counts, exports, and the Active/Separated tables.
  const externalContractors = contractors.filter(c => c.client_id !== INTERNAL_CLIENT_ID);
  const internalTeamContractors = contractors.filter(c => c.client_id === INTERNAL_CLIENT_ID);

  // Per-column value filters: key -> selected values (undefined = no filter)
  const getColumnValue = (c: ContractorWithDetails, key: string): string => {
    switch (key) {
      case 'status': return c.status || '';
      case 'company': return c.client?.company_name || '';
      case 'industry': return c.client?.industry || '';
      case 'position': return c.job_title || '';
      case 'country': return c.country || c.applicant?.location || '';
      case 'source': return c.source || '';
      case 'type': return c.is_replacement ? 'Replacement' : 'New';
      case 'hiredBy': return getAdminDisplayName(c.hired_by, '');
      default: return '';
    }
  };

  const getColumnOptions = (key: string): string[] =>
    Array.from(new Set(externalContractors.map(c => getColumnValue(c, key)).filter(Boolean))).sort((a, b) => a.localeCompare(b));

  const setColumnFilter = (key: string, values: string[] | undefined) =>
    setColumnFilters(prev => ({ ...prev, [key]: values }));

  const filteredContractors = externalContractors
    .filter(contractor => {
      // Per-column filters
      for (const [key, values] of Object.entries(columnFilters)) {
        if (values === undefined) continue;
        if (!values.includes(getColumnValue(contractor, key))) return false;
      }

      const matchesSearch = !searchTerm || 
        contractor.applicant?.full_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        contractor.applicant?.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
        contractor.client?.company_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        contractor.job_title?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        contractor.country?.toLowerCase().includes(searchTerm.toLowerCase());
      
      const matchesStatus = statusFilter === 'all' || contractor.status === statusFilter;
      
      return matchesSearch && matchesStatus;
    })
    .sort((a, b) => {
      // Always put scheduled contractors at the top
      const aScheduled = a.status?.toLowerCase() === 'scheduled';
      const bScheduled = b.status?.toLowerCase() === 'scheduled';
      if (aScheduled && !bScheduled) return -1;
      if (!aScheduled && bScheduled) return 1;
      
      // Then apply regular sorting
      switch (sortBy) {
        case 'name_asc':
          return (a.applicant?.full_name || '').localeCompare(b.applicant?.full_name || '');
        case 'name_desc':
          return (b.applicant?.full_name || '').localeCompare(a.applicant?.full_name || '');
        case 'company_asc':
          return (a.client?.company_name || '').localeCompare(b.client?.company_name || '');
        case 'company_desc':
          return (b.client?.company_name || '').localeCompare(a.client?.company_name || '');
        case 'start_date_asc':
          return (a.start_date || '').localeCompare(b.start_date || '');
        case 'start_date_desc':
          return (b.start_date || '').localeCompare(a.start_date || '');
        case 'rate_asc':
          return (a.hourly_rate || 0) - (b.hourly_rate || 0);
        case 'rate_desc':
          return (b.hourly_rate || 0) - (a.hourly_rate || 0);
        case 'status':
          return a.status.localeCompare(b.status);
        case 'status_changed_asc':
          return (a.status_changed_at || '').localeCompare(b.status_changed_at || '');
        case 'status_changed_desc':
          return (b.status_changed_at || '').localeCompare(a.status_changed_at || '');
        case 'position_asc':
          return (a.job_title || '').localeCompare(b.job_title || '');
        case 'position_desc':
          return (b.job_title || '').localeCompare(a.job_title || '');
        case 'country_asc':
          return (a.country || a.applicant?.location || '').localeCompare(b.country || b.applicant?.location || '');
        case 'country_desc':
          return (b.country || b.applicant?.location || '').localeCompare(a.country || a.applicant?.location || '');
        case 'hired_by_asc':
          return getAdminDisplayName(a.hired_by, '').localeCompare(getAdminDisplayName(b.hired_by, ''));
        case 'hired_by_desc':
          return getAdminDisplayName(b.hired_by, '').localeCompare(getAdminDisplayName(a.hired_by, ''));
        default:
          return 0;
      }
    });

  // Split contractors: active section vs separated section (rendering goes to separated)
  const activeContractors = filteredContractors.filter(c => 
    !['terminated', 'resigned', 'rendering'].includes(c.status?.toLowerCase())
  );
  const separatedContractors = filteredContractors
    .filter(c => ['terminated', 'resigned', 'rendering'].includes(c.status?.toLowerCase()))
    .sort((a, b) => {
      // Rendering (pending) always at the top
      const aIsRendering = a.status?.toLowerCase() === 'rendering' ? 1 : 0;
      const bIsRendering = b.status?.toLowerCase() === 'rendering' ? 1 : 0;
      if (aIsRendering !== bIsRendering) return bIsRendering - aIsRendering;
      
      // Then sort by end_date descending (most recent first)
      const dateA = a.end_date ? parseDateOnly(a.end_date).getTime() : 0;
      const dateB = b.end_date ? parseDateOnly(b.end_date).getTime() : 0;
      return dateB - dateA;
    });

  // Summary stats (exclude internal team)
  const activeCount = externalContractors.filter(c => c.status === 'active').length;
  const terminatedCount = externalContractors.filter(c => c.status === 'terminated').length;
  const resignedCount = externalContractors.filter(c => c.status === 'resigned').length;
  const renderingCount = externalContractors.filter(c => c.status === 'rendering').length;
  const scheduledCount = externalContractors.filter(c => c.status === 'scheduled').length;

  // Export contractors to CSV
  const handleExport = () => {
    try {
      const headers = [
        'Status',
        'Name',
        'Email Address',
        'Company',
        'Industry',
        'Start Date',
        'Position',
        'Rate',
        'Hours',
        'Contact Number',
        'Emergency Number',
        'Contractor Time Sheet',
        'New / Replacement',
        'Country',
        'Source'
      ];

      const rows = externalContractors.map(c => [
        c.status,
        `"${(c.applicant?.full_name || '').replace(/"/g, '""')}"`,
        `"${(c.applicant?.email || '').replace(/"/g, '""')}"`,
        `"${(c.client?.company_name || '').replace(/"/g, '""')}"`,
        `"${(c.client?.industry || '').replace(/"/g, '""')}"`,
        c.start_date || '',
        `"${(c.job_title || '').replace(/"/g, '""')}"`,
        c.hourly_rate || '',
        c.hours_per_week || '',
        `"${(c.contact_number || c.applicant?.phone || '').replace(/"/g, '""')}"`,
        `"${(c.emergency_number || '').replace(/"/g, '""')}"`,
        `"${(c.timesheet_link || '').replace(/"/g, '""')}"`,
        c.is_replacement ? 'Replacement' : 'New',
        `"${(c.country || c.applicant?.location || '').replace(/"/g, '""')}"`,
        `"${(c.source || '').replace(/"/g, '""')}"`
      ].join(','));

      const csvContent = [headers.join(','), ...rows].join('\n');
      const blob = new Blob([csvContent], { type: 'text/csv' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `contractors_export_${new Date().toISOString().split('T')[0]}.csv`;
      a.click();
      URL.revokeObjectURL(url);

      toast({
        title: 'Success',
        description: `Exported ${externalContractors.length} contractors`,
      });
    } catch (err: any) {
      toast({
        title: 'Error',
        description: 'Failed to export contractors: ' + err.message,
        variant: 'destructive',
      });
    }
  };

  const handleClearAll = async () => {
    try {
      const { error } = await supabase
        .from('contractor_assignments')
        .delete()
        .neq('id', '00000000-0000-0000-0000-000000000000'); // Delete all

      if (error) throw error;

      toast({
        title: 'Success',
        description: 'All contractors have been deleted',
      });
      fetchContractors();
    } catch (err: any) {
      toast({
        title: 'Error',
        description: 'Failed to delete contractors: ' + err.message,
        variant: 'destructive',
      });
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12 gap-2 text-muted-foreground">
        <Loader2 className="w-5 h-5 animate-spin" />
        <span>Loading contractors...</span>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Import Errors Banner */}
      {lastImportResult && lastImportResult.errors.length > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
          <div className="flex items-start justify-between">
            <div className="flex items-start gap-3">
              <AlertTriangle className="w-5 h-5 text-amber-600 mt-0.5 flex-shrink-0" />
              <div>
                <p className="font-medium text-amber-800">
                  Last Import: {lastImportResult.successCount} succeeded, {lastImportResult.errors.length} failed
                </p>
                <p className="text-sm text-amber-700 mt-1">
                  {new Date(lastImportResult.timestamp).toLocaleString()}
                </p>
                {!showImportErrors ? (
                  <Button
                    variant="link"
                    size="sm"
                    className="p-0 h-auto text-amber-700 hover:text-amber-900"
                    onClick={() => setShowImportErrors(true)}
                  >
                    View {lastImportResult.errors.length} error(s)
                  </Button>
                ) : (
                  <div className="mt-2">
                    <ul className="text-sm text-amber-700 space-y-1 max-h-40 overflow-y-auto">
                      {lastImportResult.errors.map((err, i) => (
                        <li key={i} className="flex items-start gap-1">
                          <span className="text-amber-500">•</span>
                          <span>{err}</span>
                        </li>
                      ))}
                    </ul>
                    <Button
                      variant="link"
                      size="sm"
                      className="p-0 h-auto text-amber-700 hover:text-amber-900 mt-2"
                      onClick={() => setShowImportErrors(false)}
                    >
                      Hide errors
                    </Button>
                  </div>
                )}
              </div>
            </div>
            <Button
              variant="ghost"
              size="icon"
              className="text-amber-600 hover:text-amber-800 hover:bg-amber-100 h-6 w-6"
              onClick={() => setLastImportResult(null)}
            >
              <X className="w-4 h-4" />
            </Button>
          </div>
        </div>
      )}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 mb-3.5">
        <StatCard accent="teal" icon={CheckCircle} label="Active" value={activeCount} />
        <StatCard accent="purple" icon={Calendar} label="Scheduled" value={scheduledCount} />
        <StatCard accent="purple" icon={Clock} label="Rendering" value={renderingCount} />
        <StatCard accent="red" icon={XCircle} label="Resigned" value={resignedCount} />
        <StatCard accent="red" icon={XCircle} label="Terminated" value={terminatedCount} />
      </div>

      {/* Header with Search and Filters */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3 flex-1">
          <div className="relative flex-1 min-w-[200px] max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Search contractors..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-9"
            />
          </div>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-[150px]">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Statuses</SelectItem>
              <SelectItem value="active">Active</SelectItem>
              <SelectItem value="paused">Paused</SelectItem>
              <SelectItem value="completed">Completed</SelectItem>
              <SelectItem value="terminated">Terminated</SelectItem>
            </SelectContent>
          </Select>
          <Select value={sortBy} onValueChange={setSortBy}>
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder="Sort by" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="start_date_desc">Start Date (Newest)</SelectItem>
              <SelectItem value="start_date_asc">Start Date (Oldest)</SelectItem>
              <SelectItem value="name_asc">Name (A-Z)</SelectItem>
              <SelectItem value="name_desc">Name (Z-A)</SelectItem>
              <SelectItem value="company_asc">Company (A-Z)</SelectItem>
              <SelectItem value="company_desc">Company (Z-A)</SelectItem>
              <SelectItem value="rate_desc">Rate (High-Low)</SelectItem>
              <SelectItem value="rate_asc">Rate (Low-High)</SelectItem>
              <SelectItem value="status">Status</SelectItem>
            </SelectContent>
          </Select>
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" size="icon" title="Toggle columns">
                <Columns3 className="w-4 h-4" />
              </Button>
            </PopoverTrigger>
            <PopoverContent align="end" className="w-48">
              <div className="space-y-2">
                <p className="text-sm font-medium mb-2">Visible Columns</p>
                {Object.entries(columnLabels).map(([key, label]) => (
                  <label key={key} className="flex items-center gap-2 cursor-pointer text-sm">
                    <Checkbox
                      checked={visibleColumns[key]}
                      onCheckedChange={() => toggleColumn(key)}
                    />
                    {label}
                  </label>
                ))}
              </div>
            </PopoverContent>
          </Popover>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => setTemplateManagerOpen(true)}>
            <FileText className="w-4 h-4 mr-2" />
            Templates
          </Button>
          <Button 
            variant="default" 
            onClick={() => setBulkEmailDialogOpen(true)} 
            disabled={activeCount === 0}
          >
            <Mail className="w-4 h-4 mr-2" />
            Bulk Email ({activeCount})
          </Button>
          <Button variant="outline" onClick={() => setImportDialogOpen(true)}>
            <Upload className="w-4 h-4 mr-2" />
            Import
          </Button>
          <Button variant="outline" onClick={handleExport} disabled={contractors.length === 0}>
            <Download className="w-4 h-4 mr-2" />
            Export
          </Button>
        </div>
      </div>

      {/* Recurring Schedules */}
      <RecurringSchedulesManager />

      {/* Contractors Table - Active Section */}
      {activeContractors.length === 0 && separatedContractors.length === 0 && internalTeamContractors.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <p className="text-muted-foreground">
              {contractors.length === 0 
                ? 'No contractors yet. Assign contractors from the Clients dashboard.' 
                : 'No contractors match your filters.'}
            </p>
          </CardContent>
        </Card>
      ) : (
        <>
          {/* Active Contractors Table */}
          {activeContractors.length > 0 && (
            <Card className="overflow-hidden">
              <div className="overflow-x-auto">
                <Table className="w-full table-auto">
                  <TableHeader>
                    <TableRow>
                      {visibleColumns.status && <TableHead className="w-[140px] cursor-pointer select-none hover:text-foreground" onClick={() => handleHeaderSort('status')}><span className="inline-flex items-center gap-1">Status {getSortIcon('status')}<ContractorColumnFilter options={getColumnOptions('status')} selected={columnFilters['status']} onChange={(v) => setColumnFilter('status', v)} /></span></TableHead>}
                      {visibleColumns.statusChanged && <TableHead className="w-[130px] cursor-pointer select-none hover:text-foreground" onClick={() => handleHeaderSort('statusChanged')}>Status Changed {getSortIcon('statusChanged')}</TableHead>}
                      {visibleColumns.name && <TableHead className="min-w-[180px] cursor-pointer select-none hover:text-foreground" onClick={() => handleHeaderSort('name')}>Name {getSortIcon('name')}</TableHead>}
                      {visibleColumns.email && <TableHead className="min-w-[200px]">Email</TableHead>}
                      {visibleColumns.company && <TableHead className="min-w-[180px] cursor-pointer select-none hover:text-foreground" onClick={() => handleHeaderSort('company')}><span className="inline-flex items-center gap-1">Company {getSortIcon('company')}<ContractorColumnFilter options={getColumnOptions('company')} selected={columnFilters['company']} onChange={(v) => setColumnFilter('company', v)} /></span></TableHead>}
                      {visibleColumns.industry && <TableHead className="min-w-[120px]"><span className="inline-flex items-center gap-1">Industry<ContractorColumnFilter options={getColumnOptions('industry')} selected={columnFilters['industry']} onChange={(v) => setColumnFilter('industry', v)} /></span></TableHead>}
                      {visibleColumns.startDate && <TableHead className="w-[120px] cursor-pointer select-none hover:text-foreground" onClick={() => handleHeaderSort('startDate')}>Start Date {getSortIcon('startDate')}</TableHead>}
                      {visibleColumns.position && <TableHead className="min-w-[150px] cursor-pointer select-none hover:text-foreground" onClick={() => handleHeaderSort('position')}><span className="inline-flex items-center gap-1">Position {getSortIcon('position')}<ContractorColumnFilter options={getColumnOptions('position')} selected={columnFilters['position']} onChange={(v) => setColumnFilter('position', v)} /></span></TableHead>}
                      {visibleColumns.rate && <TableHead className="w-[80px] cursor-pointer select-none hover:text-foreground" onClick={() => handleHeaderSort('rate')}>Rate {getSortIcon('rate')}</TableHead>}
                      {visibleColumns.hours && <TableHead className="w-[80px]">Hours</TableHead>}
                      {visibleColumns.contact && <TableHead className="min-w-[140px]">Contact</TableHead>}
                      {visibleColumns.emergency && <TableHead className="min-w-[140px]">Emergency</TableHead>}
                      {visibleColumns.timesheet && <TableHead className="min-w-[100px]">Timesheet</TableHead>}
                      {visibleColumns.type && <TableHead className="w-[100px]"><span className="inline-flex items-center gap-1">Type<ContractorColumnFilter options={getColumnOptions('type')} selected={columnFilters['type']} onChange={(v) => setColumnFilter('type', v)} /></span></TableHead>}
                      {visibleColumns.country && <TableHead className="min-w-[120px] cursor-pointer select-none hover:text-foreground" onClick={() => handleHeaderSort('country')}><span className="inline-flex items-center gap-1">Country {getSortIcon('country')}<ContractorColumnFilter options={getColumnOptions('country')} selected={columnFilters['country']} onChange={(v) => setColumnFilter('country', v)} /></span></TableHead>}
                      {visibleColumns.source && <TableHead className="min-w-[100px]"><span className="inline-flex items-center gap-1">Source<ContractorColumnFilter options={getColumnOptions('source')} selected={columnFilters['source']} onChange={(v) => setColumnFilter('source', v)} /></span></TableHead>}
                      {visibleColumns.notes && <TableHead className="min-w-[200px]">Notes</TableHead>}
                      {visibleColumns.separationNote && <TableHead className="min-w-[200px]">Separation Note</TableHead>}
                      {visibleColumns.hiredBy && <TableHead className="min-w-[120px] cursor-pointer select-none hover:text-foreground" onClick={() => handleHeaderSort('hiredBy')}><span className="inline-flex items-center gap-1">Hired By {getSortIcon('hiredBy')}<ContractorColumnFilter options={getColumnOptions('hiredBy')} selected={columnFilters['hiredBy']} onChange={(v) => setColumnFilter('hiredBy', v)} /></span></TableHead>}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {activeContractors.map(contractor => (
                      <TableRow 
                        key={contractor.id} 
                        className="hover:bg-muted/50"
                        onContextMenu={(e) => {
                          e.preventDefault();
                          setEditingContractor(contractor);
                        }}
                      >
                        {visibleColumns.status && (
                          <TableCell onClick={(e) => e.stopPropagation()}>
                            <Select
                              value={contractor.status}
                              onValueChange={(value) => handleStatusChange(contractor.id, value)}
                              disabled={updatingStatusId === contractor.id}
                            >
                              <SelectTrigger className={`w-24 h-6 text-xs px-2 ${STATUS_COLORS[contractor.status] || ''} border`}>
                                <SelectValue>
                                  <span className="flex items-center gap-1.5">
                                    {updatingStatusId === contractor.id ? (
                                      <Loader2 className="w-3 h-3 animate-spin" />
                                    ) : (
                                      STATUS_ICONS[contractor.status]
                                    )}
                                    <span className="capitalize">{contractor.status}</span>
                                  </span>
                                </SelectValue>
                              </SelectTrigger>
                              <SelectContent className="bg-background">
                                <SelectItem value="active">
                                  <span className="flex items-center gap-2">
                                    <CheckCircle className="w-3 h-3 text-green-600" />
                                    Active
                                  </span>
                                </SelectItem>
                                <SelectItem value="scheduled">
                                  <span className="flex items-center gap-2">
                                    <Calendar className="w-3 h-3 text-amber-600" />
                                    Scheduled to Start
                                  </span>
                                </SelectItem>
                                <SelectItem value="rendering">
                                  <span className="flex items-center gap-2">
                                    <Clock className="w-3 h-3 text-cyan-600" />
                                    Rendering
                                  </span>
                                </SelectItem>
                                <SelectItem value="resigned">
                                  <span className="flex items-center gap-2">
                                    <XCircle className="w-3 h-3 text-purple-600" />
                                    Resigned
                                  </span>
                                </SelectItem>
                                <SelectItem value="terminated">
                                  <span className="flex items-center gap-2">
                                    <XCircle className="w-3 h-3 text-red-600" />
                                    Terminated
                                  </span>
                                </SelectItem>
                              </SelectContent>
                            </Select>
                          </TableCell>
                        )}
                        {visibleColumns.statusChanged && (
                          <TableCell>
                            {contractor.status_changed_at ? (
                              <span className="flex items-center gap-1 text-sm text-muted-foreground whitespace-nowrap">
                                <Clock className="w-3 h-3" />
                                {format(new Date(contractor.status_changed_at), 'MMM d, yyyy')}
                              </span>
                            ) : (
                              <span className="text-muted-foreground">—</span>
                            )}
                          </TableCell>
                        )}
                        {visibleColumns.name && (
                          <TableCell className="font-medium whitespace-nowrap">
                            <span className="flex items-center gap-2">
                              {contractor.applicant?.full_name || 'Unknown'}
                              {contractor.notes?.includes('Reactivated from') && (
                                <Badge variant="outline" className="bg-emerald-50 text-emerald-700 border-emerald-200 text-[10px] px-1.5 py-0 h-4">
                                  <RotateCcw className="w-2.5 h-2.5 mr-0.5" />
                                  Rehire
                                </Badge>
                              )}
                            </span>
                          </TableCell>
                        )}
                        {visibleColumns.email && (
                          <TableCell>
                            <span className="flex items-center gap-1 text-sm">
                              <span title={contractor.applicant?.email}>
                                {contractor.applicant?.email || '—'}
                              </span>
                              {contractor.applicant?.email && (
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-5 w-5 ml-1 text-muted-foreground hover:text-teal-600"
                                  title="Send email"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setEmailRecipient({
                                      assignmentId: contractor.id,
                                      name: contractor.applicant?.full_name || '',
                                      email: contractor.applicant?.email || '',
                                      company: contractor.client?.company_name || '',
                                      jobTitle: contractor.job_title || '',
                                      hourlyRate: contractor.hourly_rate,
                                    });
                                    setEmailDialogOpen(true);
                                  }}
                                >
                                  <Mail className="w-3 h-3" />
                                </Button>
                              )}
                            </span>
                          </TableCell>
                        )}
                        {visibleColumns.company && (
                          <TableCell>
                            <span className="flex items-center gap-1 whitespace-nowrap">
                              <Building2 className="w-3 h-3 text-muted-foreground" />
                              {contractor.client?.company_name || '—'}
                            </span>
                          </TableCell>
                        )}
                        {visibleColumns.industry && (
                          <TableCell className="text-muted-foreground">
                            {contractor.client?.industry || '—'}
                          </TableCell>
                        )}
                        {visibleColumns.startDate && (
                          <TableCell>
                            {contractor.start_date ? (() => {
                              const startDate = parseDateOnly(contractor.start_date);
                              const today = new Date();
                              today.setHours(0, 0, 0, 0);
                              const isFuture = startDate > today;
                              return (
                                <span className={`flex items-center gap-1 whitespace-nowrap ${isFuture ? 'text-amber-600 font-medium' : ''}`}>
                                  <Calendar className={`w-3 h-3 ${isFuture ? 'text-amber-600' : 'text-muted-foreground'}`} />
                                  {format(startDate, 'MMM d, yyyy')}
                                </span>
                              );
                            })() : (
                              <span className="text-muted-foreground">—</span>
                            )}
                          </TableCell>
                        )}
                        {visibleColumns.position && (
                          <TableCell>
                            <span className="flex items-center gap-1 whitespace-nowrap">
                              <Briefcase className="w-3 h-3 text-muted-foreground" />
                              {contractor.job_title || '—'}
                            </span>
                          </TableCell>
                        )}
                        {visibleColumns.rate && (
                          <TableCell>
                            {contractor.hourly_rate ? (
                              <span className="flex items-center gap-1 whitespace-nowrap">
                                <DollarSign className="w-3 h-3 text-muted-foreground" />
                                ${contractor.hourly_rate}/hr
                              </span>
                            ) : (
                              <span className="text-muted-foreground">—</span>
                            )}
                          </TableCell>
                        )}
                        {visibleColumns.hours && (
                          <TableCell>
                            {contractor.hours_per_week ? (
                              <span className="whitespace-nowrap">{contractor.hours_per_week}h/wk</span>
                            ) : (
                              <span className="text-muted-foreground">—</span>
                            )}
                          </TableCell>
                        )}
                        {visibleColumns.contact && (
                          <TableCell onContextMenu={(e) => e.stopPropagation()}>
                            {(contractor.contact_number || contractor.applicant?.phone) ? (
                              <a 
                                href={`https://wa.me/${String(contractor.contact_number || contractor.applicant?.phone).replace(/\D/g, '')}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="flex items-center gap-1 whitespace-nowrap text-sm text-green-600 hover:text-green-700 hover:underline"
                                onClick={(e) => e.stopPropagation()}
                              >
                                <Phone className="w-3 h-3 flex-shrink-0" />
                                {String(contractor.contact_number || contractor.applicant?.phone)}
                              </a>
                            ) : (
                              <span className="text-muted-foreground">—</span>
                            )}
                          </TableCell>
                        )}
                        {visibleColumns.emergency && (
                          <TableCell>
                            {contractor.emergency_number ? (
                              <span className="flex items-center gap-1 whitespace-nowrap text-sm">
                                <Phone className="w-3 h-3 text-muted-foreground flex-shrink-0" />
                                {String(contractor.emergency_number)}
                              </span>
                            ) : (
                              <span className="text-muted-foreground">—</span>
                            )}
                          </TableCell>
                        )}
                        {visibleColumns.timesheet && (
                          <TableCell>
                            {contractor.timesheet_link ? (
                              <a 
                                href={contractor.timesheet_link} 
                                target="_blank" 
                                rel="noopener noreferrer"
                                className="flex items-center gap-1 text-primary hover:underline"
                              >
                                <Link2 className="w-3 h-3" />
                                View
                              </a>
                            ) : (
                              <span className="text-muted-foreground">—</span>
                            )}
                          </TableCell>
                        )}
                        {visibleColumns.type && (
                          <TableCell>
                            <Badge variant="outline" className={contractor.is_replacement ? 'border-amber-300 text-amber-700' : 'border-green-300 text-green-700'}>
                              {contractor.is_replacement ? (
                                <>
                                  <RefreshCw className="w-3 h-3 mr-1" />
                                  Replacement
                                </>
                              ) : (
                                <>
                                  <UserPlus className="w-3 h-3 mr-1" />
                                  New
                                </>
                              )}
                            </Badge>
                          </TableCell>
                        )}
                        {visibleColumns.country && (
                          <TableCell>
                            {(contractor.country || contractor.applicant?.location) ? (
                              <span className="flex items-center gap-1 whitespace-nowrap">
                                <Globe className="w-3 h-3 text-muted-foreground" />
                                {contractor.country || contractor.applicant?.location}
                              </span>
                            ) : (
                              <span className="text-muted-foreground">—</span>
                            )}
                          </TableCell>
                        )}
                        {visibleColumns.source && (
                          <TableCell className="text-muted-foreground">
                            {contractor.source || '—'}
                          </TableCell>
                        )}
                        {visibleColumns.notes && (
                          <TableCell>
                            {contractor.notes ? (
                              <span className="text-sm text-muted-foreground line-clamp-2 max-w-[200px]" title={contractor.notes}>
                                {contractor.notes}
                              </span>
                            ) : (
                              <span className="text-muted-foreground">—</span>
                            )}
                          </TableCell>
                        )}
                        {visibleColumns.separationNote && (
                          <TableCell>
                            {contractor.separation_note ? (
                              <span className="text-sm text-muted-foreground line-clamp-2 max-w-[200px] whitespace-pre-wrap" title={contractor.separation_note}>
                                {contractor.separation_note}
                              </span>
                            ) : (
                              <span className="text-muted-foreground">—</span>
                            )}
                          </TableCell>
                        )}
                        {visibleColumns.hiredBy && (
                          <TableCell>
                            <HiredByEditor
                              contractorId={contractor.id}
                              value={contractor.hired_by}
                              onSaved={(next) => setContractors(prev => prev.map(c => c.id === contractor.id ? { ...c, hired_by: next } : c))}
                            />
                          </TableCell>
                        )}
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </Card>
          )}

          {/* Separated Contractors Section (Terminated/Resigned) */}
          {separatedContractors.length > 0 && (
            <div className="mt-8 space-y-4">
              <div className="flex items-center gap-3">
                <div className="h-px flex-1 bg-border" />
                <h3 className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                  <XCircle className="w-4 h-4" />
                  Separated Contractors ({separatedContractors.length})
                </h3>
                <div className="h-px flex-1 bg-border" />
              </div>
              
              <Card className="overflow-hidden bg-muted/30">
                <div className="overflow-x-auto">
                  <Table className="w-full table-auto">
                    <TableHeader>
                      <TableRow>
                        {visibleColumns.status && <TableHead className="w-[140px] cursor-pointer select-none hover:text-foreground" onClick={() => handleHeaderSort('status')}><span className="inline-flex items-center gap-1">Status {getSortIcon('status')}<ContractorColumnFilter options={getColumnOptions('status')} selected={columnFilters['status']} onChange={(v) => setColumnFilter('status', v)} /></span></TableHead>}
                        {visibleColumns.statusChanged && <TableHead className="w-[130px] cursor-pointer select-none hover:text-foreground" onClick={() => handleHeaderSort('statusChanged')}>Status Changed {getSortIcon('statusChanged')}</TableHead>}
                        {visibleColumns.name && <TableHead className="min-w-[180px] cursor-pointer select-none hover:text-foreground" onClick={() => handleHeaderSort('name')}>Name {getSortIcon('name')}</TableHead>}
                        {visibleColumns.email && <TableHead className="min-w-[200px]">Email</TableHead>}
                        {visibleColumns.company && <TableHead className="min-w-[180px] cursor-pointer select-none hover:text-foreground" onClick={() => handleHeaderSort('company')}><span className="inline-flex items-center gap-1">Company {getSortIcon('company')}<ContractorColumnFilter options={getColumnOptions('company')} selected={columnFilters['company']} onChange={(v) => setColumnFilter('company', v)} /></span></TableHead>}
                        {visibleColumns.industry && <TableHead className="min-w-[120px]"><span className="inline-flex items-center gap-1">Industry<ContractorColumnFilter options={getColumnOptions('industry')} selected={columnFilters['industry']} onChange={(v) => setColumnFilter('industry', v)} /></span></TableHead>}
                        {visibleColumns.startDate && <TableHead className="w-[120px] cursor-pointer select-none hover:text-foreground" onClick={() => handleHeaderSort('startDate')}>Start Date {getSortIcon('startDate')}</TableHead>}
                        <TableHead className="w-[120px]">End Date</TableHead>
                        {visibleColumns.position && <TableHead className="min-w-[150px] cursor-pointer select-none hover:text-foreground" onClick={() => handleHeaderSort('position')}><span className="inline-flex items-center gap-1">Position {getSortIcon('position')}<ContractorColumnFilter options={getColumnOptions('position')} selected={columnFilters['position']} onChange={(v) => setColumnFilter('position', v)} /></span></TableHead>}
                        {visibleColumns.rate && <TableHead className="w-[80px] cursor-pointer select-none hover:text-foreground" onClick={() => handleHeaderSort('rate')}>Rate {getSortIcon('rate')}</TableHead>}
                        {visibleColumns.hours && <TableHead className="w-[80px]">Hours</TableHead>}
                        {visibleColumns.contact && <TableHead className="min-w-[140px]">Contact</TableHead>}
                        {visibleColumns.emergency && <TableHead className="min-w-[140px]">Emergency</TableHead>}
                        {visibleColumns.timesheet && <TableHead className="min-w-[100px]">Timesheet</TableHead>}
                        {visibleColumns.type && <TableHead className="w-[100px]"><span className="inline-flex items-center gap-1">Type<ContractorColumnFilter options={getColumnOptions('type')} selected={columnFilters['type']} onChange={(v) => setColumnFilter('type', v)} /></span></TableHead>}
                        {visibleColumns.country && <TableHead className="min-w-[120px] cursor-pointer select-none hover:text-foreground" onClick={() => handleHeaderSort('country')}><span className="inline-flex items-center gap-1">Country {getSortIcon('country')}<ContractorColumnFilter options={getColumnOptions('country')} selected={columnFilters['country']} onChange={(v) => setColumnFilter('country', v)} /></span></TableHead>}
                        {visibleColumns.source && <TableHead className="min-w-[100px]"><span className="inline-flex items-center gap-1">Source<ContractorColumnFilter options={getColumnOptions('source')} selected={columnFilters['source']} onChange={(v) => setColumnFilter('source', v)} /></span></TableHead>}
                        {visibleColumns.separationNote && <TableHead className="min-w-[200px]">Separation Note</TableHead>}
                        {visibleColumns.notes && <TableHead className="min-w-[200px]">Notes</TableHead>}
                        {visibleColumns.hiredBy && <TableHead className="min-w-[120px] cursor-pointer select-none hover:text-foreground" onClick={() => handleHeaderSort('hiredBy')}><span className="inline-flex items-center gap-1">Hired By {getSortIcon('hiredBy')}<ContractorColumnFilter options={getColumnOptions('hiredBy')} selected={columnFilters['hiredBy']} onChange={(v) => setColumnFilter('hiredBy', v)} /></span></TableHead>}
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {separatedContractors.map(contractor => (
                        <TableRow 
                          key={contractor.id} 
                          className="hover:bg-muted/50"
                          onContextMenu={(e) => {
                            e.preventDefault();
                            setEditingContractor(contractor);
                          }}
                        >
                          {visibleColumns.status && (
                            <TableCell>
                              <Select
                                value={contractor.status}
                                onValueChange={(value) => handleStatusChange(contractor.id, value)}
                                disabled={updatingStatusId === contractor.id}
                              >
                                <SelectTrigger className={`w-24 h-6 text-xs px-2 ${STATUS_COLORS[contractor.status] || ''} border`}>
                                  <SelectValue>
                                    <span className="flex items-center gap-1.5">
                                      {updatingStatusId === contractor.id ? (
                                        <Loader2 className="w-3 h-3 animate-spin" />
                                      ) : (
                                        STATUS_ICONS[contractor.status]
                                      )}
                                      <span className="capitalize">{contractor.status}</span>
                                    </span>
                                  </SelectValue>
                                </SelectTrigger>
                                <SelectContent className="bg-background">
                                  <SelectItem value="active">
                                    <span className="flex items-center gap-2">
                                      <CheckCircle className="w-3 h-3 text-green-600" />
                                      Active
                                    </span>
                                  </SelectItem>
                                  <SelectItem value="scheduled">
                                    <span className="flex items-center gap-2">
                                      <Calendar className="w-3 h-3 text-amber-600" />
                                      Scheduled to Start
                                    </span>
                                  </SelectItem>
                                  <SelectItem value="rendering">
                                    <span className="flex items-center gap-2">
                                      <Clock className="w-3 h-3 text-cyan-600" />
                                      Rendering
                                    </span>
                                  </SelectItem>
                                  <SelectItem value="resigned">
                                    <span className="flex items-center gap-2">
                                      <XCircle className="w-3 h-3 text-purple-600" />
                                      Resigned
                                    </span>
                                  </SelectItem>
                                  <SelectItem value="terminated">
                                    <span className="flex items-center gap-2">
                                      <XCircle className="w-3 h-3 text-red-600" />
                                      Terminated
                                    </span>
                                  </SelectItem>
                                </SelectContent>
                              </Select>
                            </TableCell>
                          )}
                          {visibleColumns.statusChanged && (
                            <TableCell>
                              {contractor.status_changed_at ? (
                                <span className="flex items-center gap-1 text-sm text-muted-foreground whitespace-nowrap">
                                  <Clock className="w-3 h-3" />
                                  {format(new Date(contractor.status_changed_at), 'MMM d, yyyy')}
                                </span>
                              ) : (
                                <span className="text-muted-foreground">—</span>
                              )}
                            </TableCell>
                          )}
                          {visibleColumns.name && (
                            <TableCell className="font-medium whitespace-nowrap">
                              <span className="flex items-center gap-2">
                                {contractor.applicant?.full_name || 'Unknown'}
                                {contractor.notes?.includes('Reactivated from') && (
                                  <Badge variant="outline" className="bg-emerald-50 text-emerald-700 border-emerald-200 text-[10px] px-1.5 py-0 h-4">
                                    <RotateCcw className="w-2.5 h-2.5 mr-0.5" />
                                    Rehire
                                  </Badge>
                                )}
                              </span>
                            </TableCell>
                          )}
                          {visibleColumns.email && (
                            <TableCell>
                              <span className="flex items-center gap-1 text-sm">
                                <span title={contractor.applicant?.email}>
                                  {contractor.applicant?.email || '—'}
                                </span>
                                {contractor.applicant?.email && (
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-5 w-5 ml-1 text-muted-foreground hover:text-teal-600"
                                    title="Send email"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setEmailRecipient({
                                        assignmentId: contractor.id,
                                        name: contractor.applicant?.full_name || '',
                                        email: contractor.applicant?.email || '',
                                        company: contractor.client?.company_name || '',
                                        jobTitle: contractor.job_title || '',
                                        hourlyRate: contractor.hourly_rate,
                                      });
                                      setEmailDialogOpen(true);
                                    }}
                                  >
                                    <Mail className="w-3 h-3" />
                                  </Button>
                                )}
                              </span>
                            </TableCell>
                          )}
                          {visibleColumns.company && (
                            <TableCell>
                              <span className="flex items-center gap-1 whitespace-nowrap">
                                <Building2 className="w-3 h-3 text-muted-foreground" />
                                {contractor.client?.company_name || '—'}
                              </span>
                            </TableCell>
                          )}
                          {visibleColumns.industry && (
                            <TableCell className="text-muted-foreground">
                              {contractor.client?.industry || '—'}
                            </TableCell>
                          )}
                          {visibleColumns.startDate && (
                            <TableCell>
                              {contractor.start_date ? (() => {
                                const startDate = parseDateOnly(contractor.start_date);
                                const today = new Date();
                                today.setHours(0, 0, 0, 0);
                                const isFuture = startDate > today;
                                return (
                                  <span className={`flex items-center gap-1 whitespace-nowrap ${isFuture ? 'text-amber-600 font-medium' : ''}`}>
                                    <Calendar className={`w-3 h-3 ${isFuture ? 'text-amber-600' : 'text-muted-foreground'}`} />
                                    {format(startDate, 'MMM d, yyyy')}
                                  </span>
                                );
                              })() : (
                                <span className="text-muted-foreground">—</span>
                              )}
                            </TableCell>
                          )}
                          <TableCell>
                            {contractor.end_date ? (
                              <span className="flex items-center gap-1 whitespace-nowrap text-red-600">
                                <Calendar className="w-3 h-3" />
                                {format(parseDateOnly(contractor.end_date), 'MMM d, yyyy')}
                              </span>
                            ) : (
                              <span className="text-muted-foreground">—</span>
                            )}
                          </TableCell>
                          {visibleColumns.position && (
                            <TableCell>
                              <span className="flex items-center gap-1 whitespace-nowrap">
                                <Briefcase className="w-3 h-3 text-muted-foreground" />
                                {contractor.job_title || '—'}
                              </span>
                            </TableCell>
                          )}
                          {visibleColumns.rate && (
                            <TableCell>
                              {contractor.hourly_rate ? (
                                <span className="flex items-center gap-1 whitespace-nowrap">
                                  <DollarSign className="w-3 h-3 text-muted-foreground" />
                                  ${contractor.hourly_rate}/hr
                                </span>
                              ) : (
                                <span className="text-muted-foreground">—</span>
                              )}
                            </TableCell>
                          )}
                          {visibleColumns.hours && (
                            <TableCell>
                              {contractor.hours_per_week ? (
                                <span className="whitespace-nowrap">{contractor.hours_per_week}h/wk</span>
                              ) : (
                                <span className="text-muted-foreground">—</span>
                              )}
                            </TableCell>
                          )}
                          {visibleColumns.contact && (
                            <TableCell onContextMenu={(e) => e.stopPropagation()}>
                              {(contractor.contact_number || contractor.applicant?.phone) ? (
                                <a 
                                  href={`https://wa.me/${String(contractor.contact_number || contractor.applicant?.phone).replace(/\D/g, '')}`}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="flex items-center gap-1 whitespace-nowrap text-sm text-green-600 hover:text-green-700 hover:underline"
                                  onClick={(e) => e.stopPropagation()}
                                >
                                  <Phone className="w-3 h-3 flex-shrink-0" />
                                  {String(contractor.contact_number || contractor.applicant?.phone)}
                                </a>
                              ) : (
                                <span className="text-muted-foreground">—</span>
                              )}
                            </TableCell>
                          )}
                          {visibleColumns.emergency && (
                            <TableCell>
                              {contractor.emergency_number ? (
                                <span className="flex items-center gap-1 whitespace-nowrap text-sm">
                                  <Phone className="w-3 h-3 text-muted-foreground flex-shrink-0" />
                                  {String(contractor.emergency_number)}
                                </span>
                              ) : (
                                <span className="text-muted-foreground">—</span>
                              )}
                            </TableCell>
                          )}
                          {visibleColumns.timesheet && (
                            <TableCell>
                              {contractor.timesheet_link ? (
                                <a 
                                  href={contractor.timesheet_link} 
                                  target="_blank" 
                                  rel="noopener noreferrer"
                                  className="flex items-center gap-1 text-primary hover:underline"
                                >
                                  <Link2 className="w-3 h-3" />
                                  View
                                </a>
                              ) : (
                                <span className="text-muted-foreground">—</span>
                              )}
                            </TableCell>
                          )}
                          {visibleColumns.type && (
                            <TableCell>
                              <Badge variant="outline" className={contractor.is_replacement ? 'border-amber-300 text-amber-700' : 'border-green-300 text-green-700'}>
                                {contractor.is_replacement ? (
                                  <>
                                    <RefreshCw className="w-3 h-3 mr-1" />
                                    Replacement
                                  </>
                                ) : (
                                  <>
                                    <UserPlus className="w-3 h-3 mr-1" />
                                    New
                                  </>
                                )}
                              </Badge>
                            </TableCell>
                          )}
                          {visibleColumns.country && (
                            <TableCell>
                              {(contractor.country || contractor.applicant?.location) ? (
                                <span className="flex items-center gap-1 whitespace-nowrap">
                                  <Globe className="w-3 h-3 text-muted-foreground" />
                                  {contractor.country || contractor.applicant?.location}
                                </span>
                              ) : (
                                <span className="text-muted-foreground">—</span>
                              )}
                            </TableCell>
                          )}
                          {visibleColumns.source && (
                            <TableCell className="text-muted-foreground">
                              {contractor.source || '—'}
                            </TableCell>
                          )}
                          {visibleColumns.separationNote && (
                            <TableCell>
                              <Popover
                                open={editingSeparationId === contractor.id}
                                onOpenChange={(open) => {
                                  if (open) {
                                    setEditingSeparationId(contractor.id);
                                    setEditingSeparationText(contractor.separation_note || '');
                                  } else {
                                    setEditingSeparationId(null);
                                  }
                                }}
                              >
                                <PopoverTrigger asChild>
                                  <button
                                    type="button"
                                    className="group flex items-start gap-1 text-left max-w-[220px] hover:bg-muted/50 rounded px-1 py-0.5 -mx-1 -my-0.5 transition-colors"
                                    title="Click to edit separation note"
                                  >
                                    {contractor.separation_note ? (
                                      <span className="text-sm text-muted-foreground line-clamp-2 whitespace-pre-wrap">
                                        {contractor.separation_note}
                                      </span>
                                    ) : (
                                      <span className="text-sm text-muted-foreground italic">Add note…</span>
                                    )}
                                    <Pencil className="w-3 h-3 mt-1 opacity-0 group-hover:opacity-60 shrink-0" />
                                  </button>
                                </PopoverTrigger>
                                <PopoverContent className="w-96" align="start">
                                  <div className="space-y-2">
                                    <p className="text-sm font-medium">Edit Separation Note</p>
                                    <Textarea
                                      value={editingSeparationText}
                                      onChange={(e) => setEditingSeparationText(e.target.value)}
                                      rows={6}
                                      placeholder="Add separation note…"
                                    />
                                    <div className="flex justify-end gap-2">
                                      <Button size="sm" variant="outline" onClick={() => setEditingSeparationId(null)}>
                                        Cancel
                                      </Button>
                                      <Button size="sm" onClick={() => handleSaveSeparationNote(contractor.id)} disabled={savingSeparation}>
                                        {savingSeparation ? <Loader2 className="w-3 h-3 animate-spin" /> : 'Save'}
                                      </Button>
                                    </div>
                                  </div>
                                </PopoverContent>
                              </Popover>
                            </TableCell>
                          )}
                          {visibleColumns.notes && (
                            <TableCell>
                              {contractor.notes ? (
                                <HoverCard>
                                  <HoverCardTrigger asChild>
                                    <span className="text-sm text-muted-foreground line-clamp-1 max-w-[200px] cursor-help underline decoration-dotted underline-offset-2">
                                      {contractor.notes}
                                    </span>
                                  </HoverCardTrigger>
                                  <HoverCardContent className="w-80 text-sm" align="start">
                                    <p className="whitespace-pre-wrap">{contractor.notes}</p>
                                  </HoverCardContent>
                                </HoverCard>
                              ) : (
                                <span className="text-muted-foreground">—</span>
                              )}
                            </TableCell>
                          )}
                          {visibleColumns.hiredBy && (
                            <TableCell>
                              <HiredByEditor
                                contractorId={contractor.id}
                                value={contractor.hired_by}
                                onSaved={(next) => setContractors(prev => prev.map(c => c.id === contractor.id ? { ...c, hired_by: next } : c))}
                              />
                            </TableCell>
                          )}
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </Card>
            </div>
          )}

          {/* Internal Team Section (OutSta employees - excluded from analytics & counts) */}
          {internalTeamContractors.length > 0 && (
            <div className="mt-8 space-y-4">
              <div className="flex items-center gap-3">
                <div className="h-px flex-1 bg-border" />
                <h3 className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                  <Building2 className="w-4 h-4" />
                  Internal Team — OutSta ({internalTeamContractors.length})
                  <Badge variant="outline" className="text-[10px] font-normal">
                    Excluded from analytics
                  </Badge>
                </h3>
                <div className="h-px flex-1 bg-border" />
              </div>

              <Card className="overflow-hidden bg-primary/5 border-primary/20">
                <div className="overflow-x-auto">
                  <Table className="w-full table-auto">
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-[120px]">Status</TableHead>
                        <TableHead className="min-w-[180px]">Name</TableHead>
                        <TableHead className="min-w-[200px]">Email</TableHead>
                        <TableHead className="min-w-[150px]">Position</TableHead>
                        <TableHead className="w-[120px]">Start Date</TableHead>
                        <TableHead className="w-[80px] text-right">Rate</TableHead>
                        <TableHead className="w-[80px] text-right">Hours/Wk</TableHead>
                        <TableHead className="min-w-[140px]">Contact</TableHead>
                        <TableHead className="min-w-[120px]">Country</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {internalTeamContractors.map(contractor => (
                        <TableRow
                          key={contractor.id}
                          className="hover:bg-muted/50"
                          onContextMenu={(e) => {
                            e.preventDefault();
                            setEditingContractor(contractor);
                          }}
                        >
                          <TableCell>
                            <Badge
                              variant="outline"
                              className={`${STATUS_COLORS[contractor.status] || ''} text-xs capitalize`}
                            >
                              <span className="flex items-center gap-1">
                                {STATUS_ICONS[contractor.status]}
                                {contractor.status}
                              </span>
                            </Badge>
                          </TableCell>
                          <TableCell className="font-medium whitespace-nowrap">
                            {contractor.applicant?.full_name || 'Unknown'}
                          </TableCell>
                          <TableCell>
                            <span className="text-sm">{contractor.applicant?.email || '—'}</span>
                          </TableCell>
                          <TableCell className="whitespace-nowrap">
                            {contractor.job_title || '—'}
                          </TableCell>
                          <TableCell className="whitespace-nowrap text-sm text-muted-foreground">
                            {contractor.start_date
                              ? format(parseDateOnly(contractor.start_date), 'MMM d, yyyy')
                              : '—'}
                          </TableCell>
                          <TableCell className="text-right whitespace-nowrap">
                            {contractor.hourly_rate ? `$${contractor.hourly_rate}/hr` : '—'}
                          </TableCell>
                          <TableCell className="text-right">
                            {contractor.hours_per_week ?? '—'}
                          </TableCell>
                          <TableCell className="text-sm">
                            {contractor.contact_number || contractor.applicant?.phone || '—'}
                          </TableCell>
                          <TableCell className="text-sm text-muted-foreground">
                            {contractor.country || contractor.applicant?.location || '—'}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </Card>
            </div>
          )}
        </>
      )}

      {/* Import Dialog */}
      <ContractorImportDialog
        open={importDialogOpen}
        onOpenChange={setImportDialogOpen}
        onContractorsImported={fetchContractors}
        onImportComplete={(result) => {
          setLastImportResult(result);
          if (result.errors.length > 0) {
            setShowImportErrors(true);
          }
        }}
      />

      {/* Edit Dialog */}
      <EditContractorDialog
        contractor={editingContractor}
        open={!!editingContractor}
        onOpenChange={(open) => !open && setEditingContractor(null)}
        onUpdated={fetchContractors}
      />

      {/* Status Change Dialog */}
      {pendingStatusChange && (
        <ContractorStatusDialog
          open={statusDialogOpen}
          onOpenChange={(open) => {
            setStatusDialogOpen(open);
            if (!open) setPendingStatusChange(null);
          }}
          status={pendingStatusChange.status}
          contractorName={pendingStatusChange.contractorName}
          onConfirm={handleStatusDialogConfirm}
          saving={!!updatingStatusId}
        />
      )}

      {/* Contractor Email Dialog */}
      <SendContractorEmailDialog
        open={emailDialogOpen}
        onOpenChange={setEmailDialogOpen}
        contractor={emailRecipient}
      />

      {/* Bulk Email Dialog */}
      <BulkContractorEmailDialog
        open={bulkEmailDialogOpen}
        onOpenChange={setBulkEmailDialogOpen}
        activeContractorCount={activeCount}
      />

      {/* Template Manager */}
      <ContractorEmailTemplateManager
        open={templateManagerOpen}
        onOpenChange={setTemplateManagerOpen}
      />
    </div>
  );
};
