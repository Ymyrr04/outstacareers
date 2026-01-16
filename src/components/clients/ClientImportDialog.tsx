import { useState, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { Loader2, Upload, FileText, CheckCircle, XCircle, Download } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';

interface ClientImportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onClientsImported: () => void;
}

interface ImportRow {
  business_name: string;
  first_name?: string;
  last_name?: string;
  email_address?: string;
  contact_information?: string;
  no_of_contractors?: string;
  leads_from?: string;
  company_links?: string;
  yearly_increase?: string;
  industry?: string;
}

interface ImportResult {
  success: number;
  failed: number;
  errors: string[];
}

export const ClientImportDialog = ({ open, onOpenChange, onClientsImported }: ClientImportDialogProps) => {
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [importing, setImporting] = useState(false);
  const [parsedRows, setParsedRows] = useState<ImportRow[]>([]);
  const [result, setResult] = useState<ImportResult | null>(null);

  const downloadTemplate = () => {
    const headers = [
      'Business Name',
      'First Name',
      'Last Name',
      'Email Address',
      'Contact Information',
      'No. of Contractors',
      'Leads from',
      'Add links about the company to be shared with candidate(s)',
      '4% Yearly increase',
      'Industry'
    ];
    
    const exampleRow = [
      'Acme Corp',
      'John',
      'Smith',
      'john@acme.com',
      '+1 234 567 8900',
      '5',
      'Referral',
      'https://acme.com/careers',
      'Yes',
      'Technology'
    ];

    const csvContent = [
      headers.join(','),
      exampleRow.join(',')
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'client_import_template.csv';
    a.click();
    URL.revokeObjectURL(url);
  };

  const normalizeHeader = (header: string): string => {
    const h = header.toLowerCase().trim();
    if (h.includes('business name')) return 'business_name';
    if (h.includes('first name')) return 'first_name';
    if (h.includes('last name')) return 'last_name';
    if (h.includes('email')) return 'email_address';
    if (h.includes('contact information')) return 'contact_information';
    if (h.includes('contractors')) return 'no_of_contractors';
    if (h.includes('leads')) return 'leads_from';
    if (h.includes('links') || h.includes('company')) return 'company_links';
    if (h.includes('yearly') || h.includes('4%') || h.includes('increase')) return 'yearly_increase';
    if (h.includes('industry')) return 'industry';
    return h.replace(/[^a-z]/g, '_');
  };

  const parseCSV = (text: string): ImportRow[] => {
    const lines = text.split('\n').filter(line => line.trim());
    if (lines.length < 2) return [];

    const headers = lines[0].split(',').map(h => normalizeHeader(h.replace(/^"|"$/g, '')));
    const rows: ImportRow[] = [];

    for (let i = 1; i < lines.length; i++) {
      // Handle quoted values with commas
      const values: string[] = [];
      let current = '';
      let inQuotes = false;
      
      for (const char of lines[i]) {
        if (char === '"') {
          inQuotes = !inQuotes;
        } else if (char === ',' && !inQuotes) {
          values.push(current.trim().replace(/^"|"$/g, ''));
          current = '';
        } else {
          current += char;
        }
      }
      values.push(current.trim().replace(/^"|"$/g, ''));

      const row: Record<string, string> = {};
      headers.forEach((header, idx) => {
        if (values[idx]) {
          row[header] = values[idx];
        }
      });

      if (row.business_name) {
        rows.push({
          business_name: row.business_name,
          first_name: row.first_name,
          last_name: row.last_name,
          email_address: row.email_address,
          contact_information: row.contact_information,
          no_of_contractors: row.no_of_contractors,
          leads_from: row.leads_from,
          company_links: row.company_links,
          yearly_increase: row.yearly_increase,
          industry: row.industry,
        });
      }
    }

    return rows;
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const text = await file.text();
    const rows = parseCSV(text);
    setParsedRows(rows);
    setResult(null);

    if (rows.length === 0) {
      toast({
        title: 'Error',
        description: 'No valid rows found in CSV. Make sure it has a header row and at least one data row with Business Name.',
        variant: 'destructive',
      });
    }
  };

  const handleImport = async () => {
    if (parsedRows.length === 0) return;

    setImporting(true);
    const importResult: ImportResult = { success: 0, failed: 0, errors: [] };

    for (const row of parsedRows) {
      try {
        const yearlyIncrease = row.yearly_increase?.toLowerCase() === 'yes' || 
                               row.yearly_increase?.toLowerCase() === 'true' || 
                               row.yearly_increase === '1';
        
        const contractorCount = parseInt(row.no_of_contractors || '0') || 0;

        // Insert client
        const { data: client, error: clientError } = await supabase
          .from('clients')
          .insert({
            company_name: row.business_name,
            industry: row.industry || null,
            leads_from: row.leads_from || null,
            company_links: row.company_links || null,
            yearly_increase: yearlyIncrease,
            contractor_count: contractorCount,
          })
          .select('id')
          .single();

        if (clientError) throw clientError;

        // If contact info provided, create contact
        if ((row.first_name || row.last_name) && client?.id) {
          const fullName = [row.first_name, row.last_name].filter(Boolean).join(' ');
          await supabase.from('client_contacts').insert({
            client_id: client.id,
            first_name: row.first_name || null,
            last_name: row.last_name || null,
            full_name: fullName,
            email: row.email_address || null,
            phone: row.contact_information || null,
            is_primary: true,
          });
        }

        importResult.success++;
      } catch (err: any) {
        importResult.failed++;
        importResult.errors.push(`${row.business_name}: ${err.message}`);
      }
    }

    setResult(importResult);
    setImporting(false);

    if (importResult.success > 0) {
      toast({
        title: 'Import Complete',
        description: `Successfully imported ${importResult.success} client(s)`,
      });
      onClientsImported();
    }
  };

  const handleClose = () => {
    setParsedRows([]);
    setResult(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Import Clients</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Download Template */}
          <Card>
            <CardContent className="pt-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium">Download Template</p>
                  <p className="text-sm text-muted-foreground">Get the CSV template with correct headers</p>
                </div>
                <Button variant="outline" onClick={downloadTemplate}>
                  <Download className="w-4 h-4 mr-2" />
                  Template
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* File Upload */}
          <div className="space-y-2">
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv"
              onChange={handleFileSelect}
              className="hidden"
            />
            <Button
              variant="outline"
              className="w-full h-20 border-dashed"
              onClick={() => fileInputRef.current?.click()}
            >
              <div className="flex flex-col items-center gap-2">
                <Upload className="w-6 h-6" />
                <span>Click to select CSV file</span>
              </div>
            </Button>
          </div>

          {/* Parsed Preview */}
          {parsedRows.length > 0 && !result && (
            <Card>
              <CardContent className="pt-4">
                <div className="flex items-center gap-2 mb-2">
                  <FileText className="w-4 h-4" />
                  <span className="font-medium">{parsedRows.length} clients found</span>
                </div>
                <div className="max-h-40 overflow-y-auto space-y-1 text-sm">
                  {parsedRows.slice(0, 10).map((row, idx) => (
                    <div key={idx} className="flex items-center gap-2 py-1 border-b last:border-0">
                      <span className="font-medium">{row.business_name}</span>
                      {row.industry && <span className="text-muted-foreground">• {row.industry}</span>}
                    </div>
                  ))}
                  {parsedRows.length > 10 && (
                    <p className="text-muted-foreground">...and {parsedRows.length - 10} more</p>
                  )}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Results */}
          {result && (
            <Card>
              <CardContent className="pt-4 space-y-3">
                <div className="flex items-center gap-4">
                  <div className="flex items-center gap-2 text-green-600">
                    <CheckCircle className="w-5 h-5" />
                    <span>{result.success} imported</span>
                  </div>
                  {result.failed > 0 && (
                    <div className="flex items-center gap-2 text-red-600">
                      <XCircle className="w-5 h-5" />
                      <span>{result.failed} failed</span>
                    </div>
                  )}
                </div>
                {result.errors.length > 0 && (
                  <div className="max-h-32 overflow-y-auto text-sm text-red-600 space-y-1">
                    {result.errors.map((err, idx) => (
                      <p key={idx}>{err}</p>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={handleClose}>
            {result ? 'Close' : 'Cancel'}
          </Button>
          {!result && (
            <Button onClick={handleImport} disabled={importing || parsedRows.length === 0}>
              {importing && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Import {parsedRows.length} Client{parsedRows.length !== 1 ? 's' : ''}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};