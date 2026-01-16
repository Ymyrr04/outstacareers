import { useState, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import { Upload, Download, Loader2, AlertCircle, AlertTriangle } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Label } from '@/components/ui/label';
import { ScrollArea } from '@/components/ui/scroll-area';

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
    reader.readAsText(file);
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
          const parsed = new Date(row.start_date);
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
        });

        if (error) {
          importErrors.push(`Failed to import ${row.name}: ${error.message}`);
        } else {
          successCount++;
        }
      }

      setErrors(importErrors);

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
                          Started: {new Date(dup.existingAssignment.start_date).toLocaleDateString()}
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
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Import Contractors</DialogTitle>
            <DialogDescription>
              Upload a CSV file to bulk import contractors. Contractors must be linked to existing clients and applicants.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
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
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
};
