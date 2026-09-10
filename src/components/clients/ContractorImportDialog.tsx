import { useState, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import { Upload, Download, Loader2, AlertCircle, AlertTriangle, UserPlus } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Label } from '@/components/ui/label';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { parseDateOnly } from '@/lib/dateOnly';

interface ImportResult {
  successCount: number;
  errors: string[];
  timestamp: Date;
}

interface ContractorImportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onContractorsImported: () => void;
  onImportComplete?: (result: ImportResult) => void;
}

interface ParsedContractor {
  status: string;
  name: string;
  email: string;
  company: string;
  industry: string;
  start_date: string;
  position: string;
  rate: string;
  hours: string;
  contact_number: string;
  emergency_number: string;
  timesheet_link: string;
  type: string;
  country: string;
  source: string;
}

interface DuplicateInfo {
  contractor: ParsedContractor;
  existingAssignment: {
    id: string;
    job_title: string | null;
    client_name: string;
    start_date: string | null;
  };
}

type DuplicateAction = 'skip' | 'add';

export const ContractorImportDialog = ({ open, onOpenChange, onContractorsImported, onImportComplete }: ContractorImportDialogProps) => {
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [importing, setImporting] = useState(false);
  const [parsedData, setParsedData] = useState<ParsedContractor[]>([]);
  const [errors, setErrors] = useState<string[]>([]);
  const [duplicates, setDuplicates] = useState<DuplicateInfo[]>([]);
  const [duplicateActions, setDuplicateActions] = useState<Record<string, DuplicateAction>>({});
  const [showDuplicateDialog, setShowDuplicateDialog] = useState(false);
  const [pendingImportData, setPendingImportData] = useState<{
    parsedData: ParsedContractor[];
    clientMap: Record<string, string>;
    applicantMap: Record<string, { id: string; name: string }>;
  } | null>(null);
  const [activeTab, setActiveTab] = useState<string>('csv');
  const [manualForm, setManualForm] = useState({
    name: '', email: '', company: '', position: '', rate: '', hours: '',
    start_date: '', contact_number: '', emergency_number: '', timesheet_link: '',
    country: '', source: '', status: 'active', type: 'New',
  });
  const [manualSubmitting, setManualSubmitting] = useState(false);
  const [clients, setClients] = useState<{ id: string; company_name: string }[]>([]);
  const [clientsLoaded, setClientsLoaded] = useState(false);

  const loadClients = async () => {
    if (clientsLoaded) return;
    const { data } = await supabase.from('clients').select('id, company_name').order('company_name');
    setClients(data || []);
    setClientsLoaded(true);
  };

  const handleManualSubmit = async () => {
    if (!manualForm.name || !manualForm.email || !manualForm.company) {
      toast({ title: 'Missing fields', description: 'Name, email, and company are required.', variant: 'destructive' });
      return;
    }

    setManualSubmitting(true);
    try {
      // Find client
      const client = clients.find(c => c.company_name === manualForm.company);
      if (!client) {
        toast({ title: 'Client not found', description: `Company "${manualForm.company}" doesn't exist.`, variant: 'destructive' });
        setManualSubmitting(false);
        return;
      }

      // Find or create applicant
      const { data: existingApplicants } = await supabase
        .from('applicants_prescreen')
        .select('id, full_name')
        .ilike('email', manualForm.email)
        .limit(1);

      let applicantId: string;
      if (existingApplicants && existingApplicants.length > 0) {
        applicantId = existingApplicants[0].id;
      } else {
        const { data: newApplicant, error: createError } = await supabase
          .from('applicants_prescreen')
          .insert({
            full_name: manualForm.name,
            email: manualForm.email,
            phone: manualForm.contact_number || null,
            status: 'Hired',
            job_source: manualForm.source || 'Manual Entry',
            home_office: true, noise_canceling_headset: true, laptop_or_pc: true,
            good_internet: true, internet_speed: 'Unknown', power_backup: true,
            can_work_40_50: true, us_timezone_ok: true, start_availability: 'Immediately',
            has_experience: true, currently_working: true,
            location: manualForm.country || 'Unknown',
            job_title: manualForm.position || 'Contractor',
            apply_url: 'manual-entry',
          })
          .select('id')
          .single();

        if (createError || !newApplicant) {
          toast({ title: 'Error', description: 'Failed to create applicant: ' + (createError?.message || 'Unknown'), variant: 'destructive' });
          setManualSubmitting(false);
          return;
        }
        applicantId = newApplicant.id;
      }

      const hourlyRate = manualForm.rate ? parseFloat(manualForm.rate) : null;
      const hoursPerWeek = manualForm.hours ? parseFloat(manualForm.hours) : null;
      let startDate: string | null = manualForm.start_date || null;

      const { data: userData } = await supabase.auth.getUser();
      const hiredByUserId = userData?.user?.id ?? null;

      const { error } = await supabase.from('contractor_assignments').insert({
        client_id: client.id,
        applicant_id: applicantId,
        job_title: manualForm.position || null,
        hourly_rate: hourlyRate,
        hours_per_week: hoursPerWeek,
        start_date: startDate,
        status: manualForm.status,
        contact_number: manualForm.contact_number || null,
        emergency_number: manualForm.emergency_number || null,
        timesheet_link: manualForm.timesheet_link || null,
        is_replacement: manualForm.type.toLowerCase().includes('replacement'),
        country: manualForm.country || null,
        source: manualForm.source || null,
        hired_via: 'manual_import',
        hired_by: hiredByUserId,
      });

      if (error) {
        toast({ title: 'Error', description: 'Failed to add contractor: ' + error.message, variant: 'destructive' });
      } else {
        toast({ title: 'Contractor Added', description: `${manualForm.name} has been added successfully.` });
        onContractorsImported();
        setManualForm({
          name: '', email: '', company: '', position: '', rate: '', hours: '',
          start_date: '', contact_number: '', emergency_number: '', timesheet_link: '',
          country: '', source: '', status: 'active', type: 'New',
        });
      }
    } catch (err: any) {
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
    } finally {
      setManualSubmitting(false);
    }
  };

  const downloadTemplate = () => {
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
    
    const exampleRow = [
      'active',
      'John Doe',
      'john@example.com',
      'Acme Corp',
      'Technology',
      '2024-01-15',
      'Virtual Assistant',
      '15',
      '40',
      '+1234567890',
      '+0987654321',
      'https://docs.google.com/spreadsheets/...',
      'New',
      'Philippines',
      'Referral'
    ];

    const csvContent = [headers.join(','), exampleRow.join(',')].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'contractors_import_template.csv';
    a.click();
    URL.revokeObjectURL(url);
  };

  const parseCSVLine = (line: string): string[] => {
    const values: string[] = [];
    let current = '';
    let inQuotes = false;
    
    for (const char of line) {
      if (char === '"') {
        inQuotes = !inQuotes;
      } else if (char === ',' && !inQuotes) {
        values.push(current.trim());
        current = '';
      } else {
        current += char;
      }
    }
    values.push(current.trim());
    return values;
  };

  const parseCSV = (text: string): ParsedContractor[] => {
    const lines = text.split('\n').filter(line => line.trim());
    if (lines.length < 2) return [];

    // Parse header row to find column indices
    const headers = parseCSVLine(lines[0]).map(h => h.toLowerCase().trim());
    
    // Map expected column names to their indices
    const columnMap: Record<string, number> = {};
    const headerMappings: Record<string, string[]> = {
      status: ['status'],
      name: ['name', 'full name', 'contractor name'],
      email: ['email', 'email address', 'e-mail'],
      company: ['company', 'company name', 'client', 'business name'],
      industry: ['industry'],
      start_date: ['start date', 'start_date', 'startdate', 'date started'],
      position: ['position', 'job title', 'role', 'title'],
      rate: ['rate', 'hourly rate', 'pay rate'],
      hours: ['hours', 'hours per week', 'weekly hours'],
      contact_number: ['contact number', 'contact', 'phone', 'phone number'],
      emergency_number: ['emergency number', 'emergency contact', 'emergency'],
      timesheet_link: ['contractor time sheet', 'timesheet', 'time sheet', 'timesheet link'],
      type: ['new / replacement', 'new/replacement', 'type', 'contractor type'],
      country: ['country', 'location'],
      source: ['source', 'lead source', 'referral source'],
    };

    // Find index for each column
    for (const [key, possibleNames] of Object.entries(headerMappings)) {
      for (const name of possibleNames) {
        const idx = headers.findIndex(h => h === name || h.includes(name));
        if (idx !== -1) {
          columnMap[key] = idx;
          break;
        }
      }
    }

    console.log('Detected column mapping:', columnMap);

    const results: ParsedContractor[] = [];
    
    for (let i = 1; i < lines.length; i++) {
      const values = parseCSVLine(lines[i]);
      
      const getValue = (key: string): string => {
        const idx = columnMap[key];
        return idx !== undefined ? (values[idx] || '') : '';
      };

      const name = getValue('name');
      const email = getValue('email');
      
      // Skip rows without name or email
      if (!name || !email) continue;

      results.push({
        status: (getValue('status') || 'active').toLowerCase(),
        name,
        email,
        company: getValue('company'),
        industry: getValue('industry'),
        start_date: getValue('start_date'),
        position: getValue('position'),
        rate: getValue('rate'),
        hours: getValue('hours'),
        contact_number: getValue('contact_number'),
        emergency_number: getValue('emergency_number'),
        timesheet_link: getValue('timesheet_link'),
        type: getValue('type') || 'New',
        country: getValue('country'),
        source: getValue('source'),
      });
    }

    return results;
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target?.result as string;
      const parsed = parseCSV(text);
      setParsedData(parsed);
      setErrors([]);
    };
    // Use UTF-8 encoding to properly handle special characters (á, é, í, ñ, etc.)
    reader.readAsText(file, 'UTF-8');
  };

  const handleImport = async () => {
    if (parsedData.length === 0) return;

    setImporting(true);
    setErrors([]);
    setDuplicates([]);

    try {
      // Fetch all clients to match by company name
      const { data: clients } = await supabase
        .from('clients')
        .select('id, company_name');

      const clientMap: Record<string, string> = {};
      const clientNameMap: Record<string, string> = {};
      clients?.forEach(c => {
        clientMap[c.company_name.toLowerCase()] = c.id;
        clientNameMap[c.id] = c.company_name;
      });

      // Fetch all applicants to match by email
      const { data: applicants } = await supabase
        .from('applicants_prescreen')
        .select('id, email, full_name');

      const applicantMap: Record<string, { id: string; name: string }> = {};
      applicants?.forEach(a => {
        applicantMap[a.email.toLowerCase()] = { id: a.id, name: a.full_name };
      });

      // Fetch existing contractor assignments to detect duplicates
      const { data: existingAssignments } = await supabase
        .from('contractor_assignments')
        .select('id, applicant_id, client_id, job_title, start_date');

      // Create a map of existing assignments by applicant+client combo
      const assignmentMap: Record<string, { id: string; job_title: string | null; client_id: string; start_date: string | null }> = {};
      existingAssignments?.forEach(a => {
        const key = `${a.applicant_id}-${a.client_id}`;
        assignmentMap[key] = { id: a.id, job_title: a.job_title, client_id: a.client_id, start_date: a.start_date };
      });

      // Check for duplicates
      const foundDuplicates: DuplicateInfo[] = [];
      
      for (const row of parsedData) {
        const clientId = clientMap[row.company.toLowerCase()];
        if (!clientId) continue; // Will be handled as error later

        const applicantInfo = applicantMap[row.email.toLowerCase()];
        if (!applicantInfo) continue; // Will be created during import

        const key = `${applicantInfo.id}-${clientId}`;
        const existingAssignment = assignmentMap[key];
        
        if (existingAssignment) {
          foundDuplicates.push({
            contractor: row,
            existingAssignment: {
              id: existingAssignment.id,
              job_title: existingAssignment.job_title,
              client_name: clientNameMap[clientId] || row.company,
              start_date: existingAssignment.start_date,
            },
          });
        }
      }

      if (foundDuplicates.length > 0) {
        // Show duplicate dialog
        setDuplicates(foundDuplicates);
        // Initialize all actions to 'skip' by default
        const actions: Record<string, DuplicateAction> = {};
        foundDuplicates.forEach(d => {
          actions[d.contractor.email] = 'skip';
        });
        setDuplicateActions(actions);
        setPendingImportData({ parsedData, clientMap, applicantMap });
        setShowDuplicateDialog(true);
        setImporting(false);
        return;
      }

      // No duplicates, proceed with import
      await executeImport(parsedData, clientMap, applicantMap, {});
    } catch (err: any) {
      toast({
        title: 'Error',
        description: 'Failed to check for duplicates: ' + err.message,
        variant: 'destructive',
      });
      setImporting(false);
    }
  };

  const executeImport = async (
    data: ParsedContractor[],
    clientMap: Record<string, string>,
    applicantMap: Record<string, { id: string; name: string }>,
    actions: Record<string, DuplicateAction>
  ) => {
    setImporting(true);
    const importErrors: string[] = [];
    let successCount = 0;
    let skippedCount = 0;

    try {
      // Capture admin performing the bulk import
      const { data: userData } = await supabase.auth.getUser();
      const hiredByUserId = userData?.user?.id ?? null;

      // Fetch existing assignments to check duplicates
      const { data: existingAssignments } = await supabase
        .from('contractor_assignments')
        .select('id, applicant_id, client_id');

      const assignmentSet = new Set<string>();
      existingAssignments?.forEach(a => {
        assignmentSet.add(`${a.applicant_id}-${a.client_id}`);
      });

      for (const row of data) {
        // Find client by company name
        const clientId = clientMap[row.company.toLowerCase()];
        if (!clientId) {
          importErrors.push(`Company "${row.company}" not found for contractor ${row.name}`);
          continue;
        }

        // Find or create applicant by email
        let applicantInfo = applicantMap[row.email.toLowerCase()];
        if (!applicantInfo) {
          // Auto-create applicant record for this contractor (existing contractor import)
          const { data: newApplicant, error: createError } = await supabase
            .from('applicants_prescreen')
            .insert({
              full_name: row.name,
              email: row.email,
              phone: row.contact_number || null,
              status: 'Hired',
              job_source: row.source || 'Contractor Import',
              // Required fields with defaults for imported contractors
              home_office: true,
              noise_canceling_headset: true,
              laptop_or_pc: true,
              good_internet: true,
              internet_speed: 'Unknown',
              power_backup: true,
              can_work_40_50: true,
              us_timezone_ok: true,
              start_availability: 'Immediately',
              has_experience: true,
              currently_working: true,
              location: row.country || 'Unknown',
              job_title: row.position || 'Contractor',
              apply_url: 'contractor-import',
            })
            .select('id, email, full_name')
            .single();

          if (createError || !newApplicant) {
            importErrors.push(`Failed to create applicant for ${row.name}: ${createError?.message || 'Unknown error'}`);
            continue;
          }

          // Add to map for potential duplicates in same import
          applicantInfo = { id: newApplicant.id, name: newApplicant.full_name };
          applicantMap[row.email.toLowerCase()] = applicantInfo;
        }

        // Check if this is a duplicate
        const key = `${applicantInfo.id}-${clientId}`;
        if (assignmentSet.has(key)) {
          const action = actions[row.email] || 'skip';
          if (action === 'skip') {
            skippedCount++;
            continue;
          }
          // action === 'add' - proceed to add new assignment
        }

        // Validate status
        const validStatuses = ['active', 'completed', 'paused', 'terminated'];
        const status = validStatuses.includes(row.status) ? row.status : 'active';

        // Parse numeric values
        const hourlyRate = row.rate ? parseFloat(row.rate) : null;
        const hoursPerWeek = row.hours ? parseFloat(row.hours) : null;

        // Parse date
        let startDate: string | null = null;
        if (row.start_date) {
          const parsed = parseDateOnly(row.start_date);
          if (!isNaN(parsed.getTime())) {
            startDate = parsed.toISOString().split('T')[0];
          }
        }

        // Determine if replacement
        const isReplacement = row.type.toLowerCase().includes('replacement');

        const { error } = await supabase.from('contractor_assignments').insert({
          client_id: clientId,
          applicant_id: applicantInfo.id,
          job_title: row.position || null,
          hourly_rate: hourlyRate,
          hours_per_week: hoursPerWeek,
          start_date: startDate,
          status,
          contact_number: row.contact_number || null,
          emergency_number: row.emergency_number || null,
          timesheet_link: row.timesheet_link || null,
          is_replacement: isReplacement,
          country: row.country || null,
          source: row.source || null,
          hired_via: 'manual_import',
          hired_by: hiredByUserId,
        });

        if (error) {
          importErrors.push(`Failed to import ${row.name}: ${error.message}`);
        } else {
          successCount++;
        }
      }

      setErrors(importErrors);

      // Log import batch to contractor_import_logs
      if (successCount > 0 || importErrors.length > 0) {
        const { data: { user } } = await supabase.auth.getUser();
        await supabase.from('contractor_import_logs').insert({
          imported_by: user?.id || null,
          total_records: parsedData.length,
          success_count: successCount,
          error_count: importErrors.length,
          source_filename: null,
          notes: skippedCount > 0 ? `${skippedCount} skipped (duplicates)` : null,
        });
      }

      // Report import results
      onImportComplete?.({
        successCount,
        errors: importErrors,
        timestamp: new Date(),
      });

      if (successCount > 0 || skippedCount > 0) {
        const skippedMsg = skippedCount > 0 ? `, ${skippedCount} skipped` : '';
        toast({
          title: 'Import Complete',
          description: `Successfully imported ${successCount} contractor(s)${skippedMsg}${importErrors.length > 0 ? `, ${importErrors.length} error(s)` : ''}`,
        });
        onContractorsImported();
        
        if (importErrors.length === 0) {
          onOpenChange(false);
          setParsedData([]);
        }
      } else if (importErrors.length > 0) {
        toast({
          title: 'Import Failed',
          description: 'No contractors were imported. Check the errors below.',
          variant: 'destructive',
        });
      }
    } catch (err: any) {
      toast({
        title: 'Error',
        description: 'Failed to import contractors: ' + err.message,
        variant: 'destructive',
      });
    } finally {
      setImporting(false);
    }
  };

  const handleDuplicateDialogConfirm = async () => {
    if (!pendingImportData) return;
    setShowDuplicateDialog(false);
    await executeImport(
      pendingImportData.parsedData,
      pendingImportData.clientMap,
      pendingImportData.applicantMap,
      duplicateActions
    );
    setPendingImportData(null);
  };

  const handleDuplicateDialogCancel = () => {
    setShowDuplicateDialog(false);
    setPendingImportData(null);
    setDuplicates([]);
    setDuplicateActions({});
    setImporting(false);
  };

  const setAllDuplicateActions = (action: DuplicateAction) => {
    const actions: Record<string, DuplicateAction> = {};
    duplicates.forEach(d => {
      actions[d.contractor.email] = action;
    });
    setDuplicateActions(actions);
  };

  const handleClose = () => {
    onOpenChange(false);
    setParsedData([]);
    setErrors([]);
    setDuplicates([]);
    setDuplicateActions({});
    setShowDuplicateDialog(false);
    setPendingImportData(null);
    setActiveTab('csv');
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  return (
    <>
      {/* Duplicate Detection Dialog */}
      <Dialog open={showDuplicateDialog} onOpenChange={setShowDuplicateDialog}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-amber-500" />
              Duplicate Contractors Detected
            </DialogTitle>
            <DialogDescription>
              {duplicates.length} contractor(s) already have assignments with the same client. Choose what to do with each:
            </DialogDescription>
          </DialogHeader>

          <div className="flex gap-2 mb-4">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setAllDuplicateActions('skip')}
            >
              Skip All Duplicates
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setAllDuplicateActions('add')}
            >
              Add All as New
            </Button>
          </div>

          <ScrollArea className="max-h-[400px] pr-4">
            <div className="space-y-4">
              {duplicates.map((dup, index) => (
                <div
                  key={dup.contractor.email}
                  className="p-4 border rounded-lg bg-muted/50"
                >
                  <div className="flex justify-between items-start mb-3">
                    <div>
                      <p className="font-medium">{dup.contractor.name}</p>
                      <p className="text-sm text-muted-foreground">{dup.contractor.email}</p>
                      <p className="text-sm text-muted-foreground">
                        Company: {dup.contractor.company}
                      </p>
                    </div>
                    <div className="text-right text-sm">
                      <p className="text-amber-600 font-medium">Existing Assignment</p>
                      <p className="text-muted-foreground">
                        {dup.existingAssignment.job_title || 'No title'}
                      </p>
                      {dup.existingAssignment.start_date && (
                        <p className="text-muted-foreground">
                          Started: {parseDateOnly(dup.existingAssignment.start_date).toLocaleDateString()}
                        </p>
                      )}
                    </div>
                  </div>

                  <RadioGroup
                    value={duplicateActions[dup.contractor.email] || 'skip'}
                    onValueChange={(value) =>
                      setDuplicateActions((prev) => ({
                        ...prev,
                        [dup.contractor.email]: value as DuplicateAction,
                      }))
                    }
                    className="flex gap-4"
                  >
                    <div className="flex items-center space-x-2">
                      <RadioGroupItem value="skip" id={`skip-${index}`} />
                      <Label htmlFor={`skip-${index}`} className="cursor-pointer">
                        Skip (don't import)
                      </Label>
                    </div>
                    <div className="flex items-center space-x-2">
                      <RadioGroupItem value="add" id={`add-${index}`} />
                      <Label htmlFor={`add-${index}`} className="cursor-pointer">
                        Add as new assignment
                      </Label>
                    </div>
                  </RadioGroup>
                </div>
              ))}
            </div>
          </ScrollArea>

          <DialogFooter className="mt-4">
            <Button variant="outline" onClick={handleDuplicateDialogCancel}>
              Cancel Import
            </Button>
            <Button onClick={handleDuplicateDialogConfirm}>
              Continue Import
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Main Import Dialog */}
      <Dialog open={open} onOpenChange={handleClose}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle>Import Contractors</DialogTitle>
            <DialogDescription>
              Add contractors via CSV upload or manual entry.
            </DialogDescription>
          </DialogHeader>

          <Tabs value={activeTab} onValueChange={(v) => { setActiveTab(v); if (v === 'manual') loadClients(); }} className="flex-1 overflow-hidden flex flex-col">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="csv">
                <Upload className="w-4 h-4 mr-2" />
                CSV Upload
              </TabsTrigger>
              <TabsTrigger value="manual">
                <UserPlus className="w-4 h-4 mr-2" />
                Manual Entry
              </TabsTrigger>
            </TabsList>

            <TabsContent value="csv" className="flex-1 overflow-y-auto space-y-4 mt-4">
              <Alert>
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>
                  <strong>Important:</strong> The company name must match an existing client, and the email must match an existing applicant in the system.
                </AlertDescription>
              </Alert>

              <Button variant="outline" onClick={downloadTemplate} className="w-full">
                <Download className="w-4 h-4 mr-2" />
                Download Template
              </Button>

              <div className="border-2 border-dashed rounded-lg p-6 text-center">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".csv"
                  onChange={handleFileSelect}
                  className="hidden"
                  id="contractor-csv-upload"
                />
                <label htmlFor="contractor-csv-upload" className="cursor-pointer">
                  <Upload className="w-8 h-8 mx-auto mb-2 text-muted-foreground" />
                  <p className="text-sm text-muted-foreground">
                    Click to upload or drag and drop
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">CSV files only</p>
                </label>
              </div>

              {parsedData.length > 0 && (
                <div className="p-3 bg-muted rounded-lg">
                  <p className="text-sm font-medium">
                    {parsedData.length} contractor(s) ready to import
                  </p>
                  <ul className="text-xs text-muted-foreground mt-1 max-h-32 overflow-y-auto">
                    {parsedData.slice(0, 5).map((c, i) => (
                      <li key={i}>• {c.name} - {c.company}</li>
                    ))}
                    {parsedData.length > 5 && (
                      <li>...and {parsedData.length - 5} more</li>
                    )}
                  </ul>
                </div>
              )}

              {errors.length > 0 && (
                <div className="p-3 bg-destructive/10 border border-destructive/20 rounded-lg max-h-40 overflow-y-auto">
                  <p className="text-sm font-medium text-destructive mb-1">Import Errors:</p>
                  <ul className="text-xs text-destructive space-y-1">
                    {errors.map((error, i) => (
                      <li key={i}>• {error}</li>
                    ))}
                  </ul>
                </div>
              )}

              <div className="flex gap-2 justify-end">
                <Button variant="outline" onClick={handleClose}>
                  Cancel
                </Button>
                <Button 
                  onClick={handleImport} 
                  disabled={parsedData.length === 0 || importing}
                >
                  {importing ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Importing...
                    </>
                  ) : (
                    <>
                      <Upload className="w-4 h-4 mr-2" />
                      Import {parsedData.length} Contractor(s)
                    </>
                  )}
                </Button>
              </div>
            </TabsContent>

            <TabsContent value="manual" className="flex-1 overflow-y-auto mt-4">
              <ScrollArea className="h-[50vh] pr-4">
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <Label htmlFor="m-name">Full Name *</Label>
                      <Input id="m-name" value={manualForm.name} onChange={e => setManualForm(p => ({ ...p, name: e.target.value }))} placeholder="John Doe" />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="m-email">Email *</Label>
                      <Input id="m-email" type="email" value={manualForm.email} onChange={e => setManualForm(p => ({ ...p, email: e.target.value }))} placeholder="john@example.com" />
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="m-company">Company *</Label>
                    <Select value={manualForm.company} onValueChange={v => setManualForm(p => ({ ...p, company: v }))}>
                      <SelectTrigger>
                        <SelectValue placeholder="Select a client..." />
                      </SelectTrigger>
                      <SelectContent>
                        {clients.map(c => (
                          <SelectItem key={c.id} value={c.company_name}>{c.company_name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <Label htmlFor="m-position">Position</Label>
                      <Input id="m-position" value={manualForm.position} onChange={e => setManualForm(p => ({ ...p, position: e.target.value }))} placeholder="Virtual Assistant" />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="m-status">Status</Label>
                      <Select value={manualForm.status} onValueChange={v => setManualForm(p => ({ ...p, status: v }))}>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="active">Active</SelectItem>
                          <SelectItem value="scheduled">Scheduled</SelectItem>
                          <SelectItem value="paused">Paused</SelectItem>
                          <SelectItem value="rendering">Rendering</SelectItem>
                          <SelectItem value="terminated">Terminated</SelectItem>
                          <SelectItem value="resigned">Resigned</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  <div className="grid grid-cols-3 gap-3">
                    <div className="space-y-1.5">
                      <Label htmlFor="m-rate">Rate ($/hr)</Label>
                      <Input id="m-rate" type="number" value={manualForm.rate} onChange={e => setManualForm(p => ({ ...p, rate: e.target.value }))} placeholder="15" />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="m-hours">Hours/Week</Label>
                      <Input id="m-hours" type="number" value={manualForm.hours} onChange={e => setManualForm(p => ({ ...p, hours: e.target.value }))} placeholder="40" />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="m-start">Start Date</Label>
                      <Input id="m-start" type="date" value={manualForm.start_date} onChange={e => setManualForm(p => ({ ...p, start_date: e.target.value }))} />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <Label htmlFor="m-contact">Contact Number</Label>
                      <Input id="m-contact" value={manualForm.contact_number} onChange={e => setManualForm(p => ({ ...p, contact_number: e.target.value }))} placeholder="+1234567890" />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="m-emergency">Emergency Number</Label>
                      <Input id="m-emergency" value={manualForm.emergency_number} onChange={e => setManualForm(p => ({ ...p, emergency_number: e.target.value }))} placeholder="+0987654321" />
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="m-timesheet">Timesheet Link</Label>
                    <Input id="m-timesheet" value={manualForm.timesheet_link} onChange={e => setManualForm(p => ({ ...p, timesheet_link: e.target.value }))} placeholder="https://docs.google.com/..." />
                  </div>

                  <div className="grid grid-cols-3 gap-3">
                    <div className="space-y-1.5">
                      <Label htmlFor="m-country">Country</Label>
                      <Input id="m-country" value={manualForm.country} onChange={e => setManualForm(p => ({ ...p, country: e.target.value }))} placeholder="Philippines" />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="m-source">Source</Label>
                      <Input id="m-source" value={manualForm.source} onChange={e => setManualForm(p => ({ ...p, source: e.target.value }))} placeholder="Referral" />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="m-type">Type</Label>
                      <Select value={manualForm.type} onValueChange={v => setManualForm(p => ({ ...p, type: v }))}>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="New">New</SelectItem>
                          <SelectItem value="Replacement">Replacement</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                </div>
              </ScrollArea>

              <div className="flex gap-2 justify-end mt-4">
                <Button variant="outline" onClick={handleClose}>
                  Cancel
                </Button>
                <Button onClick={handleManualSubmit} disabled={manualSubmitting}>
                  {manualSubmitting ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Adding...
                    </>
                  ) : (
                    <>
                      <UserPlus className="w-4 h-4 mr-2" />
                      Add Contractor
                    </>
                  )}
                </Button>
              </div>
            </TabsContent>
          </Tabs>
        </DialogContent>
      </Dialog>
    </>
  );
};
