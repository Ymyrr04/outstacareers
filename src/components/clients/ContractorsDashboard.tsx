import { useState, useEffect } from 'react';
import { format } from 'date-fns';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
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
  ArrowUpDown
} from 'lucide-react';
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
  contact_number: string | null;
  emergency_number: string | null;
  timesheet_link: string | null;
  is_replacement: boolean | null;
  country: string | null;
  source: string | null;
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
    country: false,
    source: false,
    notes: true,
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

      // Set notes for rendering
      if (data.renderingReason) {
        updateData.notes = `Rendering for ${data.renderingReason}${data.effectiveDate ? ` - Effective: ${data.effectiveDate}` : ''}`;
      }
      
      // Set notes for resigned/terminated with reason
      if ((data.status === 'resigned' || data.status === 'terminated') && data.reason) {
        updateData.notes = `${data.status === 'resigned' ? 'Resignation' : 'Termination'} reason: ${data.reason}`;
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
              end_date: updateData.end_date || c.end_date 
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
  }, []);

  const filteredContractors = contractors
    .filter(contractor => {
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
      // Sort by status_changed_at descending (most recent first)
      const dateA = a.status_changed_at ? new Date(a.status_changed_at).getTime() : 0;
      const dateB = b.status_changed_at ? new Date(b.status_changed_at).getTime() : 0;
      return dateB - dateA;
    });

  // Summary stats
  const activeCount = contractors.filter(c => c.status === 'active').length;
  const terminatedCount = contractors.filter(c => c.status === 'terminated').length;
  const resignedCount = contractors.filter(c => c.status === 'resigned').length;
  const renderingCount = contractors.filter(c => c.status === 'rendering').length;
  const scheduledCount = contractors.filter(c => c.status === 'scheduled').length;

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

      const rows = contractors.map(c => [
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
        description: `Exported ${contractors.length} contractors`,
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

      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-green-500/10 rounded-lg">
                <CheckCircle className="w-5 h-5 text-green-600" />
              </div>
              <div>
                <p className="text-2xl font-bold">{activeCount}</p>
                <p className="text-sm text-muted-foreground">Active</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-amber-500/10 rounded-lg">
                <Calendar className="w-5 h-5 text-amber-600" />
              </div>
              <div>
                <p className="text-2xl font-bold">{scheduledCount}</p>
                <p className="text-sm text-muted-foreground">Scheduled</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-cyan-500/10 rounded-lg">
                <Clock className="w-5 h-5 text-cyan-600" />
              </div>
              <div>
                <p className="text-2xl font-bold">{renderingCount}</p>
                <p className="text-sm text-muted-foreground">Rendering</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-purple-500/10 rounded-lg">
                <XCircle className="w-5 h-5 text-purple-600" />
              </div>
              <div>
                <p className="text-2xl font-bold">{resignedCount}</p>
                <p className="text-sm text-muted-foreground">Resigned</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-red-500/10 rounded-lg">
                <XCircle className="w-5 h-5 text-red-600" />
              </div>
              <div>
                <p className="text-2xl font-bold">{terminatedCount}</p>
                <p className="text-sm text-muted-foreground">Terminated</p>
              </div>
            </div>
          </CardContent>
        </Card>
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

      {/* Contractors Table - Active Section */}
      {activeContractors.length === 0 && separatedContractors.length === 0 ? (
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
                      {visibleColumns.status && <TableHead className="w-[140px] cursor-pointer select-none hover:text-foreground" onClick={() => handleHeaderSort('status')}>Status {getSortIcon('status')}</TableHead>}
                      {visibleColumns.statusChanged && <TableHead className="w-[130px] cursor-pointer select-none hover:text-foreground" onClick={() => handleHeaderSort('statusChanged')}>Status Changed {getSortIcon('statusChanged')}</TableHead>}
                      {visibleColumns.name && <TableHead className="min-w-[180px] cursor-pointer select-none hover:text-foreground" onClick={() => handleHeaderSort('name')}>Name {getSortIcon('name')}</TableHead>}
                      {visibleColumns.email && <TableHead className="min-w-[200px]">Email</TableHead>}
                      {visibleColumns.company && <TableHead className="min-w-[180px] cursor-pointer select-none hover:text-foreground" onClick={() => handleHeaderSort('company')}>Company {getSortIcon('company')}</TableHead>}
                      {visibleColumns.industry && <TableHead className="min-w-[120px]">Industry</TableHead>}
                      {visibleColumns.startDate && <TableHead className="w-[120px] cursor-pointer select-none hover:text-foreground" onClick={() => handleHeaderSort('startDate')}>Start Date {getSortIcon('startDate')}</TableHead>}
                      {visibleColumns.position && <TableHead className="min-w-[150px] cursor-pointer select-none hover:text-foreground" onClick={() => handleHeaderSort('position')}>Position {getSortIcon('position')}</TableHead>}
                      {visibleColumns.rate && <TableHead className="w-[80px] cursor-pointer select-none hover:text-foreground" onClick={() => handleHeaderSort('rate')}>Rate {getSortIcon('rate')}</TableHead>}
                      {visibleColumns.hours && <TableHead className="w-[80px]">Hours</TableHead>}
                      {visibleColumns.contact && <TableHead className="min-w-[140px]">Contact</TableHead>}
                      {visibleColumns.emergency && <TableHead className="min-w-[140px]">Emergency</TableHead>}
                      {visibleColumns.timesheet && <TableHead className="min-w-[100px]">Timesheet</TableHead>}
                      {visibleColumns.type && <TableHead className="w-[100px]">Type</TableHead>}
                      {visibleColumns.country && <TableHead className="min-w-[120px] cursor-pointer select-none hover:text-foreground" onClick={() => handleHeaderSort('country')}>Country {getSortIcon('country')}</TableHead>}
                      {visibleColumns.source && <TableHead className="min-w-[100px]">Source</TableHead>}
                      {visibleColumns.notes && <TableHead className="min-w-[200px]">Notes</TableHead>}
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
                              const startDate = new Date(contractor.start_date);
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
                        {visibleColumns.status && <TableHead className="w-[140px] cursor-pointer select-none hover:text-foreground" onClick={() => handleHeaderSort('status')}>Status {getSortIcon('status')}</TableHead>}
                        {visibleColumns.statusChanged && <TableHead className="w-[130px] cursor-pointer select-none hover:text-foreground" onClick={() => handleHeaderSort('statusChanged')}>Status Changed {getSortIcon('statusChanged')}</TableHead>}
                        {visibleColumns.name && <TableHead className="min-w-[180px] cursor-pointer select-none hover:text-foreground" onClick={() => handleHeaderSort('name')}>Name {getSortIcon('name')}</TableHead>}
                        {visibleColumns.email && <TableHead className="min-w-[200px]">Email</TableHead>}
                        {visibleColumns.company && <TableHead className="min-w-[180px] cursor-pointer select-none hover:text-foreground" onClick={() => handleHeaderSort('company')}>Company {getSortIcon('company')}</TableHead>}
                        {visibleColumns.industry && <TableHead className="min-w-[120px]">Industry</TableHead>}
                        {visibleColumns.startDate && <TableHead className="w-[120px] cursor-pointer select-none hover:text-foreground" onClick={() => handleHeaderSort('startDate')}>Start Date {getSortIcon('startDate')}</TableHead>}
                        <TableHead className="w-[120px]">End Date</TableHead>
                        {visibleColumns.position && <TableHead className="min-w-[150px] cursor-pointer select-none hover:text-foreground" onClick={() => handleHeaderSort('position')}>Position {getSortIcon('position')}</TableHead>}
                        {visibleColumns.rate && <TableHead className="w-[80px] cursor-pointer select-none hover:text-foreground" onClick={() => handleHeaderSort('rate')}>Rate {getSortIcon('rate')}</TableHead>}
                        {visibleColumns.hours && <TableHead className="w-[80px]">Hours</TableHead>}
                        {visibleColumns.contact && <TableHead className="min-w-[140px]">Contact</TableHead>}
                        {visibleColumns.emergency && <TableHead className="min-w-[140px]">Emergency</TableHead>}
                        {visibleColumns.timesheet && <TableHead className="min-w-[100px]">Timesheet</TableHead>}
                        {visibleColumns.type && <TableHead className="w-[100px]">Type</TableHead>}
                        {visibleColumns.country && <TableHead className="min-w-[120px] cursor-pointer select-none hover:text-foreground" onClick={() => handleHeaderSort('country')}>Country {getSortIcon('country')}</TableHead>}
                        {visibleColumns.source && <TableHead className="min-w-[100px]">Source</TableHead>}
                        {visibleColumns.notes && <TableHead className="min-w-[200px]">Notes</TableHead>}
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
                                const startDate = new Date(contractor.start_date);
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
                                {format(new Date(contractor.end_date), 'MMM d, yyyy')}
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
    </div>
  );
};
