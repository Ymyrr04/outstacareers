import { useState, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import { Upload, Download, Loader2, AlertCircle } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';

interface ContractorImportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onContractorsImported: () => void;
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

export const ContractorImportDialog = ({ open, onOpenChange, onContractorsImported }: ContractorImportDialogProps) => {
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [importing, setImporting] = useState(false);
  const [parsedData, setParsedData] = useState<ParsedContractor[]>([]);
  const [errors, setErrors] = useState<string[]>([]);

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
    const importErrors: string[] = [];
    let successCount = 0;

    try {
      // Fetch all clients to match by company name
      const { data: clients } = await supabase
        .from('clients')
        .select('id, company_name');

      const clientMap: Record<string, string> = {};
      clients?.forEach(c => {
        clientMap[c.company_name.toLowerCase()] = c.id;
      });

      // Fetch all applicants to match by email
      const { data: applicants } = await supabase
        .from('applicants_prescreen')
        .select('id, email, full_name');

      const applicantMap: Record<string, { id: string; name: string }> = {};
      applicants?.forEach(a => {
        applicantMap[a.email.toLowerCase()] = { id: a.id, name: a.full_name };
      });

      for (const row of parsedData) {
        // Find client by company name
        const clientId = clientMap[row.company.toLowerCase()];
        if (!clientId) {
          importErrors.push(`Company "${row.company}" not found for contractor ${row.name}`);
          continue;
        }

        // Find applicant by email
        const applicantInfo = applicantMap[row.email.toLowerCase()];
        if (!applicantInfo) {
          importErrors.push(`Applicant with email "${row.email}" not found for contractor ${row.name}`);
          continue;
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

      if (successCount > 0) {
        toast({
          title: 'Import Complete',
          description: `Successfully imported ${successCount} contractor(s)${importErrors.length > 0 ? ` with ${importErrors.length} error(s)` : ''}`,
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

  const handleClose = () => {
    onOpenChange(false);
    setParsedData([]);
    setErrors([]);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  return (
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
  );
};
