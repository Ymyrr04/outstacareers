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
  Users, 
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
  Clock
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
  start_date: string | null;
  end_date: string | null;
  status: string;
  notes: string | null;
  created_at: string;
  applicant: {
    full_name: string;
    email: string;
    location: string;
  } | null;
  client: {
    company_name: string;
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
          applicant:applicants_prescreen(full_name, email, location),
          client:clients(company_name)
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
      contractor.job_title?.toLowerCase().includes(searchTerm.toLowerCase());
    
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
        'Contractor Name',
        'Email',
        'Location',
        'Client',
        'Job Title',
        'Hourly Rate',
        'Start Date',
        'End Date',
        'Status',
        'Notes'
      ];

      const rows = contractors.map(c => [
        `"${(c.applicant?.full_name || '').replace(/"/g, '""')}"`,
        `"${(c.applicant?.email || '').replace(/"/g, '""')}"`,
        `"${(c.applicant?.location || '').replace(/"/g, '""')}"`,
        `"${(c.client?.company_name || '').replace(/"/g, '""')}"`,
        `"${(c.job_title || '').replace(/"/g, '""')}"`,
        c.hourly_rate || '',
        c.start_date || '',
        c.end_date || '',
        c.status,
        `"${(c.notes || '').replace(/"/g, '""')}"`
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
        <Card>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Contractor</TableHead>
                <TableHead>Client</TableHead>
                <TableHead>Job Title</TableHead>
                <TableHead>Rate</TableHead>
                <TableHead>Start Date</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredContractors.map(contractor => (
                <TableRow key={contractor.id}>
                  <TableCell>
                    <div>
                      <p className="font-medium">{contractor.applicant?.full_name || 'Unknown'}</p>
                      <div className="flex items-center gap-3 text-sm text-muted-foreground">
                        <span className="flex items-center gap-1">
                          <Mail className="w-3 h-3" />
                          {contractor.applicant?.email}
                        </span>
                        {contractor.applicant?.location && (
                          <span className="flex items-center gap-1">
                            <MapPin className="w-3 h-3" />
                            {contractor.applicant.location}
                          </span>
                        )}
                      </div>
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <Building2 className="w-4 h-4 text-muted-foreground" />
                      {contractor.client?.company_name || 'Unknown'}
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <Briefcase className="w-4 h-4 text-muted-foreground" />
                      {contractor.job_title || 'Not specified'}
                    </div>
                  </TableCell>
                  <TableCell>
                    {contractor.hourly_rate ? (
                      <div className="flex items-center gap-1">
                        <DollarSign className="w-4 h-4 text-muted-foreground" />
                        ${contractor.hourly_rate}/hr
                      </div>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </TableCell>
                  <TableCell>
                    {contractor.start_date ? (
                      <div className="flex items-center gap-1">
                        <Calendar className="w-4 h-4 text-muted-foreground" />
                        {format(new Date(contractor.start_date), 'MMM d, yyyy')}
                      </div>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline" className={STATUS_COLORS[contractor.status]}>
                      {STATUS_ICONS[contractor.status]}
                      <span className="ml-1 capitalize">{contractor.status}</span>
                    </Badge>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}
    </div>
  );
};
