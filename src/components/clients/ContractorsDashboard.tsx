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
  MapPin,
  Mail,
  Download,
  Briefcase,
  CheckCircle,
  PauseCircle,
  XCircle,
  Clock,
  Phone,
  Link2,
  Globe,
  RefreshCw,
  UserPlus
} from 'lucide-react';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

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
  completed: 'bg-blue-500/10 text-blue-700 border-blue-300',
  paused: 'bg-amber-500/10 text-amber-700 border-amber-300',
  terminated: 'bg-red-500/10 text-red-700 border-red-300',
};

const STATUS_ICONS: Record<string, React.ReactNode> = {
  active: <CheckCircle className="w-3 h-3" />,
  completed: <Clock className="w-3 h-3" />,
  paused: <PauseCircle className="w-3 h-3" />,
  terminated: <XCircle className="w-3 h-3" />,
};

export const ContractorsDashboard = () => {
  const { toast } = useToast();
  const [contractors, setContractors] = useState<ContractorWithDetails[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');

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

  const filteredContractors = contractors.filter(contractor => {
    const matchesSearch = !searchTerm || 
      contractor.applicant?.full_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      contractor.applicant?.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
      contractor.client?.company_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      contractor.job_title?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      contractor.country?.toLowerCase().includes(searchTerm.toLowerCase());
    
    const matchesStatus = statusFilter === 'all' || contractor.status === statusFilter;
    
    return matchesSearch && matchesStatus;
  });

  // Summary stats
  const activeCount = contractors.filter(c => c.status === 'active').length;
  const pausedCount = contractors.filter(c => c.status === 'paused').length;
  const completedCount = contractors.filter(c => c.status === 'completed').length;
  const terminatedCount = contractors.filter(c => c.status === 'terminated').length;

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
      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
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
                <PauseCircle className="w-5 h-5 text-amber-600" />
              </div>
              <div>
                <p className="text-2xl font-bold">{pausedCount}</p>
                <p className="text-sm text-muted-foreground">Paused</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-blue-500/10 rounded-lg">
                <Clock className="w-5 h-5 text-blue-600" />
              </div>
              <div>
                <p className="text-2xl font-bold">{completedCount}</p>
                <p className="text-sm text-muted-foreground">Completed</p>
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
        </div>
        <Button variant="outline" onClick={handleExport} disabled={contractors.length === 0}>
          <Download className="w-4 h-4 mr-2" />
          Export
        </Button>
      </div>

      {/* Contractors Table */}
      {filteredContractors.length === 0 ? (
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
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Status</TableHead>
                  <TableHead>Name</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Company</TableHead>
                  <TableHead>Industry</TableHead>
                  <TableHead>Start Date</TableHead>
                  <TableHead>Position</TableHead>
                  <TableHead>Rate</TableHead>
                  <TableHead>Hours</TableHead>
                  <TableHead>Contact</TableHead>
                  <TableHead>Emergency</TableHead>
                  <TableHead>Timesheet</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Country</TableHead>
                  <TableHead>Source</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredContractors.map(contractor => (
                  <TableRow key={contractor.id}>
                    <TableCell>
                      <Badge variant="outline" className={STATUS_COLORS[contractor.status] || ''}>
                        {STATUS_ICONS[contractor.status]}
                        <span className="ml-1 capitalize">{contractor.status}</span>
                      </Badge>
                    </TableCell>
                    <TableCell className="font-medium whitespace-nowrap">
                      {contractor.applicant?.full_name || 'Unknown'}
                    </TableCell>
                    <TableCell>
                      <span className="flex items-center gap-1 text-sm">
                        <Mail className="w-3 h-3 text-muted-foreground" />
                        {contractor.applicant?.email || '—'}
                      </span>
                    </TableCell>
                    <TableCell>
                      <span className="flex items-center gap-1 whitespace-nowrap">
                        <Building2 className="w-3 h-3 text-muted-foreground" />
                        {contractor.client?.company_name || '—'}
                      </span>
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {contractor.client?.industry || '—'}
                    </TableCell>
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
                    <TableCell>
                      <span className="flex items-center gap-1 whitespace-nowrap">
                        <Briefcase className="w-3 h-3 text-muted-foreground" />
                        {contractor.job_title || '—'}
                      </span>
                    </TableCell>
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
                    <TableCell>
                      {contractor.hours_per_week ? (
                        <span className="whitespace-nowrap">{contractor.hours_per_week}h/wk</span>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell>
                      {(contractor.contact_number || contractor.applicant?.phone) ? (
                        <span className="flex items-center gap-1 whitespace-nowrap">
                          <Phone className="w-3 h-3 text-muted-foreground" />
                          {contractor.contact_number || contractor.applicant?.phone}
                        </span>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell>
                      {contractor.emergency_number ? (
                        <span className="flex items-center gap-1 whitespace-nowrap">
                          <Phone className="w-3 h-3 text-muted-foreground" />
                          {contractor.emergency_number}
                        </span>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>
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
                    <TableCell className="text-muted-foreground">
                      {contractor.source || '—'}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </Card>
      )}
    </div>
  );
};
