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
  RotateCcw
} from 'lucide-react';
import { Checkbox } from '@/components/ui/checkbox';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
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
  const [pendingStatusChange, setPendingStatusChange] = useState<{
    contractorId: string;
    contractorName: string;
    status: 'rendering' | 'resigned' | 'terminated' | 'scheduled';
  } | null>(null);
  const [visibleColumns, setVisibleColumns] = useState<Record<string, boolean>>({
    status: true,
    name: true,
    email: true,
    company: true,
    industry: false,
    startDate: true,
    position: true,
    rate: true,
    hours: false,
    contact: false,
    emergency: false,
    timesheet: false,
    type: false,
    country: false,
    source: false,
  });

  const columnLabels: Record<string, string> = {
    status: 'Status',
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
        // Create a new active record (duplicate without end_date)
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
            notes: `Reactivated from ${currentStatus}`,
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
      
      // Set end_date for resigned/terminated
      if ((data.status === 'resigned' || data.status === 'terminated') && data.effectiveDate) {
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
        default:
          return 0;
      }
    });

  // Split contractors: active section vs separated section
  const activeContractors = filteredContractors.filter(c => 
    !['terminated', 'resigned'].includes(c.status?.toLowerCase())
  );
  const separatedContractors = filteredContractors.filter(c => 
    ['terminated', 'resigned'].includes(c.status?.toLowerCase())
  );

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
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="outline" className="text-destructive hover:text-destructive" disabled={contractors.length === 0}>
                <Trash2 className="w-4 h-4 mr-2" />
                Clear All
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Delete all contractors?</AlertDialogTitle>
                <AlertDialogDescription>
                  This will permanently delete all {contractors.length} contractor records. This action cannot be undone.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction onClick={handleClearAll} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                  Delete All
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
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
                      {visibleColumns.status && <TableHead className="w-[140px]">Status</TableHead>}
                      {visibleColumns.name && <TableHead className="min-w-[180px]">Name</TableHead>}
                      {visibleColumns.email && <TableHead className="min-w-[200px]">Email</TableHead>}
                      {visibleColumns.company && <TableHead className="min-w-[180px]">Company</TableHead>}
                      {visibleColumns.industry && <TableHead className="min-w-[120px]">Industry</TableHead>}
                      {visibleColumns.startDate && <TableHead className="w-[120px]">Start Date</TableHead>}
                      {visibleColumns.position && <TableHead className="min-w-[150px]">Position</TableHead>}
                      {visibleColumns.rate && <TableHead className="w-[80px]">Rate</TableHead>}
                      {visibleColumns.hours && <TableHead className="w-[80px]">Hours</TableHead>}
                      {visibleColumns.contact && <TableHead className="min-w-[140px]">Contact</TableHead>}
                      {visibleColumns.emergency && <TableHead className="min-w-[140px]">Emergency</TableHead>}
                      {visibleColumns.timesheet && <TableHead className="min-w-[100px]">Timesheet</TableHead>}
                      {visibleColumns.type && <TableHead className="w-[100px]">Type</TableHead>}
                      {visibleColumns.country && <TableHead className="min-w-[120px]">Country</TableHead>}
                      {visibleColumns.source && <TableHead className="min-w-[100px]">Source</TableHead>}
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
                            <span className="text-sm" title={contractor.applicant?.email}>
                              {contractor.applicant?.email || '—'}
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
                            {contractor.start_date ? (
                              <span className="flex items-center gap-1 whitespace-nowrap">
                                <Calendar className="w-3 h-3 text-muted-foreground" />
                                {format(new Date(contractor.start_date), 'MMM d, yyyy')}
                              </span>
                            ) : (
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
                          <TableCell>
                            {(contractor.contact_number || contractor.applicant?.phone) ? (
                              <span className="flex items-center gap-1 whitespace-nowrap text-sm">
                                <Phone className="w-3 h-3 text-muted-foreground flex-shrink-0" />
                                {String(contractor.contact_number || contractor.applicant?.phone)}
                              </span>
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
                        {visibleColumns.status && <TableHead className="w-[140px]">Status</TableHead>}
                        {visibleColumns.name && <TableHead className="min-w-[180px]">Name</TableHead>}
                        {visibleColumns.email && <TableHead className="min-w-[200px]">Email</TableHead>}
                        {visibleColumns.company && <TableHead className="min-w-[180px]">Company</TableHead>}
                        {visibleColumns.industry && <TableHead className="min-w-[120px]">Industry</TableHead>}
                        {visibleColumns.startDate && <TableHead className="w-[120px]">Start Date</TableHead>}
                        <TableHead className="w-[120px]">End Date</TableHead>
                        {visibleColumns.position && <TableHead className="min-w-[150px]">Position</TableHead>}
                        {visibleColumns.rate && <TableHead className="w-[80px]">Rate</TableHead>}
                        {visibleColumns.hours && <TableHead className="w-[80px]">Hours</TableHead>}
                        {visibleColumns.contact && <TableHead className="min-w-[140px]">Contact</TableHead>}
                        {visibleColumns.emergency && <TableHead className="min-w-[140px]">Emergency</TableHead>}
                        {visibleColumns.timesheet && <TableHead className="min-w-[100px]">Timesheet</TableHead>}
                        {visibleColumns.type && <TableHead className="w-[100px]">Type</TableHead>}
                        {visibleColumns.country && <TableHead className="min-w-[120px]">Country</TableHead>}
                        {visibleColumns.source && <TableHead className="min-w-[100px]">Source</TableHead>}
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
                              <span className="text-sm" title={contractor.applicant?.email}>
                                {contractor.applicant?.email || '—'}
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
                              {contractor.start_date ? (
                                <span className="flex items-center gap-1 whitespace-nowrap">
                                  <Calendar className="w-3 h-3 text-muted-foreground" />
                                  {format(new Date(contractor.start_date), 'MMM d, yyyy')}
                                </span>
                              ) : (
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
                            <TableCell>
                              {(contractor.contact_number || contractor.applicant?.phone) ? (
                                <span className="flex items-center gap-1 whitespace-nowrap text-sm">
                                  <Phone className="w-3 h-3 text-muted-foreground flex-shrink-0" />
                                  {String(contractor.contact_number || contractor.applicant?.phone)}
                                </span>
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
    </div>
  );
};
