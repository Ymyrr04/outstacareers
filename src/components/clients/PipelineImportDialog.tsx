import { useState, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { Loader2, Upload, FileText, CheckCircle, XCircle, Download, AlertTriangle, RefreshCw } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { usePipelineStages, type PipelineStage } from '@/hooks/usePipelineStages';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

type ImportMode = 'insert' | 'update' | 'replace';

interface PipelineImportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onImported: () => void;
}

interface ParsedRow {
  name: string; // Contains client name in curly braces and job title
  clientName: string; // Extracted client name
  jobTitle: string; // Extracted job title (after removing client name)
  section: string; // Pipeline stage
  assigneeEmail: string;
  priority: string;
  industry: string;
  clientStatus: string; // Existing / New / Returning
  notes: string;
  startDate: string;
  dueDate: string;
  completedDate: string; // For closed items - when they were completed
}

interface ImportResult {
  success: number;
  failed: number;
  errors: string[];
  clientsCreated: number;
  updated: number;
  skipped: number;
}

// Admin email to user_id mapping (will be fetched)
interface AdminUser {
  user_id: string;
  email: string;
}

export const PipelineImportDialog = ({ open, onOpenChange, onImported }: PipelineImportDialogProps) => {
  const { toast } = useToast();
  const { stages } = usePipelineStages();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [importing, setImporting] = useState(false);
  const [parsedRows, setParsedRows] = useState<ParsedRow[]>([]);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [adminUsers, setAdminUsers] = useState<AdminUser[]>([]);
  const [importMode, setImportMode] = useState<ImportMode>('update');

  // Fetch admin users on mount
  const fetchAdminUsers = async () => {
    const { data, error } = await supabase.functions.invoke('get-admin-users');
    if (!error && data?.adminUsers) {
      setAdminUsers(data.adminUsers);
    }
  };

  // Extract client name from curly braces: "ClientName {Job Title}" or "Client {Job Title} - extra"
  const extractClientAndJob = (name: string): { clientName: string; jobTitle: string } => {
    // Pattern: "ClientName {JobTitle}" or "ClientName {JobTitle} - extra info"
    const match = name.match(/^([^{]+)\s*\{([^}]+)\}/);
    if (match) {
      return {
        clientName: match[1].trim(),
        jobTitle: match[2].trim(),
      };
    }
    // Fallback: use whole name as job title
    return {
      clientName: '',
      jobTitle: name.trim(),
    };
  };

  // Map section name to pipeline stage slug
  const mapSectionToStage = (section: string, stages: PipelineStage[]): string => {
    const normalized = section.toLowerCase().trim();
    
    // Direct slug match
    const directMatch = stages.find(s => s.slug === normalized);
    if (directMatch) return directMatch.slug;
    
    // Name match
    const nameMatch = stages.find(s => s.name.toLowerCase() === normalized);
    if (nameMatch) return nameMatch.slug;
    
    // Partial match
    if (normalized.includes('backlog')) return 'backlog';
    if (normalized.includes('sourcing') || normalized.includes('screening')) return 'sourcing';
    if (normalized.includes('pitch')) return 'pitch';
    if (normalized.includes('interview') || normalized.includes('scheduled')) return 'scheduled_interview';
    if (normalized.includes('closed')) return 'closed';
    if (normalized.includes('lost') && normalized.includes('client')) return 'lost_client';
    if (normalized.includes('lost') && normalized.includes('outsta')) return 'lost_outsta';
    
    return 'backlog'; // Default
  };

  // Map priority text to our format
  const mapPriority = (priority: string): 'high' | 'medium' | 'low' => {
    const p = priority.toLowerCase().trim();
    if (p === 'high') return 'high';
    if (p === 'mid' || p === 'medium') return 'medium';
    return 'low';
  };

  // Map client status
  const mapClientStatus = (status: string): 'new' | 'existing' | 'returning' => {
    const s = status.toLowerCase().trim();
    if (s.includes('existing')) return 'existing';
    if (s.includes('returning')) return 'returning';
    return 'new';
  };

  // Parse date from various formats (MM/DD/YY or MM/DD/YYYY)
  const parseDate = (dateStr: string): string | null => {
    if (!dateStr || dateStr.trim() === '') return null;
    
    // Try MM/DD/YY or MM/DD/YYYY format
    const match = dateStr.match(/(\d{1,2})\/(\d{1,2})\/(\d{2,4})/);
    if (match) {
      let year = parseInt(match[3]);
      if (year < 100) year += 2000; // Convert 2-digit year
      const month = match[1].padStart(2, '0');
      const day = match[2].padStart(2, '0');
      return `${year}-${month}-${day}`;
    }
    return null;
  };

  // Strip HTML/markdown from notes
  const cleanNotes = (notes: string): string => {
    if (!notes) return '';
    return notes
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<[^>]+>/g, '')
      .replace(/\\:/g, ':')
      .replace(/\\_/g, '_')
      .trim();
  };

  // Parse CSV with proper handling of quoted fields (including multiline)
  const parseCSV = (text: string): string[][] => {
    const rows: string[][] = [];
    let currentRow: string[] = [];
    let currentField = '';
    let inQuotes = false;

    for (let i = 0; i < text.length; i++) {
      const char = text[i];
      const nextChar = text[i + 1];

      if (char === '"') {
        if (inQuotes && nextChar === '"') {
          // Escaped quote
          currentField += '"';
          i++;
        } else {
          // Toggle quote state
          inQuotes = !inQuotes;
        }
      } else if (char === ',' && !inQuotes) {
        currentRow.push(currentField.trim());
        currentField = '';
      } else if ((char === '\n' || (char === '\r' && nextChar === '\n')) && !inQuotes) {
        currentRow.push(currentField.trim());
        if (currentRow.some(f => f)) { // Only add non-empty rows
          rows.push(currentRow);
        }
        currentRow = [];
        currentField = '';
        if (char === '\r') i++; // Skip \n in \r\n
      } else if (char === '\r' && !inQuotes) {
        // Handle \r without \n
        currentRow.push(currentField.trim());
        if (currentRow.some(f => f)) {
          rows.push(currentRow);
        }
        currentRow = [];
        currentField = '';
      } else {
        currentField += char;
      }
    }

    // Handle last field/row
    if (currentField || currentRow.length > 0) {
      currentRow.push(currentField.trim());
      if (currentRow.some(f => f)) {
        rows.push(currentRow);
      }
    }

    return rows;
  };

  // Parse pipe-delimited markdown table line
  const parsePipeLine = (line: string): string[] => {
    const values: string[] = [];
    let current = '';
    let inQuotes = false;

    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      if (char === '"') {
        inQuotes = !inQuotes;
      } else if (char === '|' && !inQuotes) {
        values.push(current.trim());
        current = '';
      } else {
        current += char;
      }
    }
    values.push(current.trim());
    return values;
  };

  // Detect file format and parse accordingly
  const parseFile = (text: string): ParsedRow[] => {
    // Check if it's a pipe-delimited markdown table
    const firstLines = text.split('\n').slice(0, 10);
    const isPipeDelimited = firstLines.some(line => line.trim().startsWith('|'));
    
    if (isPipeDelimited) {
      return parseMarkdownTable(text);
    } else {
      return parseStandardCSV(text);
    }
  };

  // Parse standard comma-separated CSV
  const parseStandardCSV = (text: string): ParsedRow[] => {
    const allRows = parseCSV(text);
    if (allRows.length < 2) return []; // Need header + at least one data row

    const headers = allRows[0];
    
    // Find column indices
    const nameIdx = headers.findIndex(h => h.toLowerCase() === 'name');
    const sectionIdx = headers.findIndex(h => {
      const lower = h.toLowerCase();
      return lower.includes('section') || lower === 'column' || lower.includes('section/column');
    });
    const assigneeEmailIdx = headers.findIndex(h => h.toLowerCase().includes('assignee email'));
    const priorityIdx = headers.findIndex(h => h.toLowerCase().includes('priority'));
    const industryIdx = headers.findIndex(h => h.toLowerCase() === 'industry');
    const clientStatusIdx = headers.findIndex(h => {
      const lower = h.toLowerCase();
      return lower.includes('existing') || lower.includes('new / existing') || lower === 'existing / new';
    });
    const notesIdx = headers.findIndex(h => h.toLowerCase() === 'notes');
    const startDateIdx = headers.findIndex(h => h.toLowerCase().includes('start date'));
    const dueDateIdx = headers.findIndex(h => h.toLowerCase().includes('due date'));
    const completedDateIdx = headers.findIndex(h => {
      const lower = h.toLowerCase();
      return lower.includes('completed') || lower.includes('completion') || lower.includes('closed');
    });

    console.log('CSV Headers found:', headers);
    console.log('Column indices:', { nameIdx, sectionIdx, assigneeEmailIdx, priorityIdx, industryIdx, clientStatusIdx, notesIdx });

    const rows: ParsedRow[] = [];

    // Process data rows (skip header)
    for (let i = 1; i < allRows.length; i++) {
      const values = allRows[i];
      
      const rawName = nameIdx >= 0 ? values[nameIdx] || '' : '';
      if (!rawName) continue; // Skip empty rows
      
      const { clientName, jobTitle } = extractClientAndJob(rawName);
      
      rows.push({
        name: rawName,
        clientName,
        jobTitle,
        section: sectionIdx >= 0 ? values[sectionIdx] || '' : '',
        assigneeEmail: assigneeEmailIdx >= 0 ? values[assigneeEmailIdx] || '' : '',
        priority: priorityIdx >= 0 ? values[priorityIdx] || '' : '',
        industry: industryIdx >= 0 ? values[industryIdx] || '' : '',
        clientStatus: clientStatusIdx >= 0 ? values[clientStatusIdx] || '' : '',
        notes: notesIdx >= 0 ? cleanNotes(values[notesIdx] || '') : '',
        startDate: startDateIdx >= 0 ? values[startDateIdx] || '' : '',
        dueDate: dueDateIdx >= 0 ? values[dueDateIdx] || '' : '',
        completedDate: completedDateIdx >= 0 ? values[completedDateIdx] || '' : '',
      });
    }

    return rows;
  };

  // Parse the markdown table format from Excel parsing
  const parseMarkdownTable = (text: string): ParsedRow[] => {
    const lines = text.split('\n').filter(line => line.trim().startsWith('|'));
    if (lines.length < 3) return []; // Need header, separator, and at least one data row

    // Find header row - look for the one with "Task ID" AND "Name" columns
    const headerIdx = lines.findIndex(line => {
      const lower = line.toLowerCase();
      return (lower.includes('task id') || lower.includes('|name|')) && 
             (lower.includes('section') || lower.includes('assignee'));
    });
    if (headerIdx === -1) return [];

    const headers = parsePipeLine(lines[headerIdx]);
    
    // Find column indices - handle various header formats
    const nameIdx = headers.findIndex(h => h.toLowerCase() === 'name');
    const sectionIdx = headers.findIndex(h => {
      const lower = h.toLowerCase();
      return lower.includes('section') || lower === 'column' || lower.includes('section/column');
    });
    const assigneeEmailIdx = headers.findIndex(h => h.toLowerCase().includes('assignee email'));
    const priorityIdx = headers.findIndex(h => h.toLowerCase().includes('priority'));
    const industryIdx = headers.findIndex(h => h.toLowerCase() === 'industry');
    const clientStatusIdx = headers.findIndex(h => {
      const lower = h.toLowerCase();
      return lower.includes('existing') || lower.includes('new / existing') || lower === 'existing / new';
    });
    const notesIdx = headers.findIndex(h => h.toLowerCase() === 'notes');
    const startDateIdx = headers.findIndex(h => h.toLowerCase().includes('start date'));
    const dueDateIdx = headers.findIndex(h => h.toLowerCase().includes('due date'));
    const completedDateIdx = headers.findIndex(h => {
      const lower = h.toLowerCase();
      return lower.includes('completed') || lower.includes('completion') || lower.includes('closed');
    });

    console.log('Markdown Headers found:', headers);
    console.log('Column indices:', { nameIdx, sectionIdx, assigneeEmailIdx, priorityIdx, industryIdx, clientStatusIdx, notesIdx });

    const rows: ParsedRow[] = [];

    // Skip header and separator row (the line with |---|---|...)
    for (let i = headerIdx + 1; i < lines.length; i++) {
      const line = lines[i];
      // Skip separator rows
      if (line.match(/^\|[\s-]+\|/)) continue;
      
      const values = parsePipeLine(line);
      
      const rawName = nameIdx >= 0 ? values[nameIdx] || '' : '';
      if (!rawName || rawName.match(/^[\s-]*$/)) continue; // Skip empty or separator rows
      
      const { clientName, jobTitle } = extractClientAndJob(rawName);
      
      rows.push({
        name: rawName,
        clientName,
        jobTitle,
        section: sectionIdx >= 0 ? values[sectionIdx] || '' : '',
        assigneeEmail: assigneeEmailIdx >= 0 ? values[assigneeEmailIdx] || '' : '',
        priority: priorityIdx >= 0 ? values[priorityIdx] || '' : '',
        industry: industryIdx >= 0 ? values[industryIdx] || '' : '',
        clientStatus: clientStatusIdx >= 0 ? values[clientStatusIdx] || '' : '',
        notes: notesIdx >= 0 ? cleanNotes(values[notesIdx] || '') : '',
        startDate: startDateIdx >= 0 ? values[startDateIdx] || '' : '',
        dueDate: dueDateIdx >= 0 ? values[dueDateIdx] || '' : '',
        completedDate: completedDateIdx >= 0 ? values[completedDateIdx] || '' : '',
      });
    }

    return rows;
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    await fetchAdminUsers();

    const text = await file.text();
    const rows = parseFile(text);
    setParsedRows(rows);
    setResult(null);

    if (rows.length === 0) {
      toast({
        title: 'Error',
        description: 'No valid rows found. Make sure the file has the correct format.',
        variant: 'destructive',
      });
    }
  };

  const handleImport = async () => {
    if (parsedRows.length === 0) return;

    setImporting(true);
    const importResult: ImportResult = { success: 0, failed: 0, errors: [], clientsCreated: 0, updated: 0, skipped: 0 };

    // Cache for clients (to avoid creating duplicates)
    const clientCache: Record<string, string> = {}; // name -> id

    // Fetch existing clients first
    const { data: existingClients } = await supabase
      .from('clients')
      .select('id, company_name');
    
    (existingClients || []).forEach(c => {
      clientCache[c.company_name.toLowerCase()] = c.id;
    });

    // Fetch existing hiring requests for update/skip mode
    const { data: existingRequests } = await supabase
      .from('client_hiring_requests')
      .select('id, client_id, job_title, clients(company_name)');

    // Build a lookup map: "clientname|jobtitle" -> request id
    const requestLookup: Record<string, string> = {};
    (existingRequests || []).forEach((req: any) => {
      const clientName = req.clients?.company_name?.toLowerCase() || '';
      const jobTitle = req.job_title?.toLowerCase() || '';
      const key = `${clientName}|${jobTitle}`;
      requestLookup[key] = req.id;
    });

    // Replace mode: delete all existing requests first
    if (importMode === 'replace') {
      const { error: deleteError } = await supabase
        .from('client_hiring_requests')
        .delete()
        .neq('id', '00000000-0000-0000-0000-000000000000'); // Delete all
      
      if (deleteError) {
        toast({
          title: 'Error',
          description: `Failed to clear existing requests: ${deleteError.message}`,
          variant: 'destructive',
        });
        setImporting(false);
        return;
      }
    }

    for (const row of parsedRows) {
      try {
        let clientId: string | null = null;

        // Find or create client
        if (row.clientName) {
          const clientKey = row.clientName.toLowerCase();
          
          if (clientCache[clientKey]) {
            clientId = clientCache[clientKey];
          } else {
            // Create new client
            const { data: newClient, error: clientError } = await supabase
              .from('clients')
              .insert({
                company_name: row.clientName,
                industry: row.industry || null,
              })
              .select('id')
              .single();

            if (clientError) {
              throw new Error(`Failed to create client "${row.clientName}": ${clientError.message}`);
            }

            clientId = newClient.id;
            clientCache[clientKey] = newClient.id;
            importResult.clientsCreated++;
          }
        }

        // Find admin user by email
        let assignedAdminId: string | null = null;
        if (row.assigneeEmail) {
          const cleanEmail = row.assigneeEmail.replace(/\\/g, '').toLowerCase();
          const admin = adminUsers.find(a => a.email.toLowerCase() === cleanEmail);
          if (admin) {
            assignedAdminId = admin.user_id;
          }
        }

        // Map to pipeline stage
        const pipelineStage = mapSectionToStage(row.section, stages);

        // Check if this request already exists (for update/insert modes)
        const lookupKey = `${row.clientName.toLowerCase()}|${(row.jobTitle || row.name).toLowerCase()}`;
        const existingRequestId = requestLookup[lookupKey];

        if (existingRequestId && importMode === 'insert') {
          // Insert mode: skip existing
          importResult.skipped++;
          continue;
        }

        const requestData = {
          client_id: clientId,
          job_title: row.jobTitle || row.name,
          priority: mapPriority(row.priority),
          industry: row.industry || null,
          client_status: mapClientStatus(row.clientStatus),
          pipeline_stage: pipelineStage,
          assigned_admin_id: assignedAdminId,
          notes: row.notes || null,
          start_date: parseDate(row.startDate),
          target_end_date: parseDate(row.dueDate),
          closed_at: pipelineStage === 'closed' 
            ? (parseDate(row.completedDate) ? new Date(parseDate(row.completedDate)!).toISOString() : new Date().toISOString())
            : null,
        };

        if (existingRequestId && importMode === 'update') {
          // Update mode: update existing record
          const { error: updateError } = await supabase
            .from('client_hiring_requests')
            .update(requestData)
            .eq('id', existingRequestId);

          if (updateError) {
            throw new Error(`Failed to update request: ${updateError.message}`);
          }
          importResult.updated++;
        } else {
          // Insert new record
          const { error: requestError } = await supabase
            .from('client_hiring_requests')
            .insert(requestData);

          if (requestError) {
            throw new Error(`Failed to create request: ${requestError.message}`);
          }
          importResult.success++;
        }
      } catch (err: any) {
        importResult.failed++;
        importResult.errors.push(`${row.name}: ${err.message}`);
      }
    }

    setResult(importResult);
    setImporting(false);

    const totalProcessed = importResult.success + importResult.updated;
    if (totalProcessed > 0) {
      const parts = [];
      if (importResult.success > 0) parts.push(`${importResult.success} inserted`);
      if (importResult.updated > 0) parts.push(`${importResult.updated} updated`);
      if (importResult.skipped > 0) parts.push(`${importResult.skipped} skipped`);
      if (importResult.clientsCreated > 0) parts.push(`${importResult.clientsCreated} clients created`);
      
      toast({
        title: 'Import Complete',
        description: parts.join(', '),
      });
      onImported();
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

  const downloadTemplate = () => {
    const headers = [
      'Name',
      'Section/Column',
      'Assignee Email',
      'Priority:',
      'Industry',
      'Existing / New',
      'Start Date',
      'Due Date',
      'Completed Date',
      'Notes'
    ];
    
    const exampleRow = [
      'Acme Corp {Account Manager}',
      'Backlog',
      'eduardo@outsta.io',
      'High',
      'Technology',
      'New',
      '01/15/26',
      '02/01/26',
      '',
      'Looking for experienced account manager'
    ];
    
    const closedExampleRow = [
      'Beta Inc {Customer Support}',
      'Closed',
      'kristine@outsta.io',
      'Medium',
      'Healthcare',
      'Existing',
      '12/01/25',
      '12/15/25',
      '12/20/25',
      'Successfully placed'
    ];

    const csvContent = [
      headers.join(','),
      exampleRow.join(','),
      closedExampleRow.join(',')
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'pipeline_import_template.csv';
    a.click();
    URL.revokeObjectURL(url);
  };

  // Group parsed rows by stage for preview
  const rowsByStage = parsedRows.reduce((acc, row) => {
    const stage = mapSectionToStage(row.section, stages);
    if (!acc[stage]) acc[stage] = [];
    acc[stage].push(row);
    return acc;
  }, {} as Record<string, ParsedRow[]>);

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-2xl max-h-[85vh]">
        <DialogHeader>
          <DialogTitle>Import Pipeline</DialogTitle>
        </DialogHeader>

        <ScrollArea className="max-h-[60vh]">
          <div className="space-y-4 pr-4">
            {/* Instructions */}
            <Card className="border-blue-200 bg-blue-50 dark:border-blue-900 dark:bg-blue-950">
              <CardContent className="pt-4">
                <div className="flex gap-2">
                  <AlertTriangle className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
                  <div className="text-sm">
                    <p className="font-medium text-blue-800 dark:text-blue-200">Expected format:</p>
                    <p className="text-blue-700 dark:text-blue-300 mt-1">
                      <strong>Name column:</strong> "ClientName {'{'} JobTitle {'}'}" (e.g., "Acme Corp {'{'} Account Manager {'}'}")
                    </p>
                    <p className="text-blue-700 dark:text-blue-300">
                      Clients will be auto-created if they don't exist.
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>

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

            {/* Import Mode */}
            <Card>
              <CardContent className="pt-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-medium">Import Mode</p>
                    <p className="text-sm text-muted-foreground">Choose how to handle existing records</p>
                  </div>
                  <Select value={importMode} onValueChange={(v) => setImportMode(v as ImportMode)}>
                    <SelectTrigger className="w-[200px]">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="update">
                        <div className="flex items-center gap-2">
                          <RefreshCw className="w-4 h-4" />
                          <span>Update Existing</span>
                        </div>
                      </SelectItem>
                      <SelectItem value="insert">
                        <div className="flex items-center gap-2">
                          <Upload className="w-4 h-4" />
                          <span>Insert Only</span>
                        </div>
                      </SelectItem>
                      <SelectItem value="replace">
                        <div className="flex items-center gap-2">
                          <XCircle className="w-4 h-4" />
                          <span>Replace All</span>
                        </div>
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <p className="text-xs text-muted-foreground mt-2">
                  {importMode === 'update' && '⟳ Matches by Client + Job Title. Updates existing, inserts new.'}
                  {importMode === 'insert' && '+ Only inserts new records, skips existing matches.'}
                  {importMode === 'replace' && '⚠️ Deletes ALL existing requests, then inserts from file.'}
                </p>
              </CardContent>
            </Card>

            {/* File Upload */}
            <div className="space-y-2">
              <input
                ref={fileInputRef}
                type="file"
                accept=".csv,.txt,.md"
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
                  <span>Click to select file (CSV, TXT, or parsed Excel)</span>
                </div>
              </Button>
            </div>

            {/* Parsed Preview */}
            {parsedRows.length > 0 && !result && (
              <Card>
                <CardContent className="pt-4">
                  <div className="flex items-center gap-2 mb-3">
                    <FileText className="w-4 h-4" />
                    <span className="font-medium">{parsedRows.length} requests found</span>
                  </div>
                  <div className="space-y-3 text-sm">
                    {Object.entries(rowsByStage).map(([stage, rows]) => (
                      <div key={stage} className="border rounded-lg p-2">
                        <p className="font-medium text-xs uppercase text-muted-foreground mb-1">
                          {stages.find(s => s.slug === stage)?.name || stage} ({rows.length})
                        </p>
                        <div className="space-y-1">
                          {rows.slice(0, 5).map((row, idx) => (
                            <div key={idx} className="flex items-center gap-2 py-0.5">
                              <span className="font-medium">{row.clientName || 'Unknown'}</span>
                              <span className="text-muted-foreground">•</span>
                              <span className="truncate">{row.jobTitle}</span>
                            </div>
                          ))}
                          {rows.length > 5 && (
                            <p className="text-muted-foreground text-xs">...and {rows.length - 5} more</p>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Results */}
            {result && (
              <Card>
                <CardContent className="pt-4 space-y-3">
                  <div className="flex flex-wrap items-center gap-4">
                    {result.success > 0 && (
                      <div className="flex items-center gap-2 text-green-600">
                        <CheckCircle className="w-5 h-5" />
                        <span>{result.success} inserted</span>
                      </div>
                    )}
                    {result.updated > 0 && (
                      <div className="flex items-center gap-2 text-blue-600">
                        <RefreshCw className="w-5 h-5" />
                        <span>{result.updated} updated</span>
                      </div>
                    )}
                    {result.skipped > 0 && (
                      <div className="flex items-center gap-2 text-muted-foreground">
                        <span>{result.skipped} skipped</span>
                      </div>
                    )}
                    {result.clientsCreated > 0 && (
                      <div className="flex items-center gap-2 text-purple-600">
                        <span>{result.clientsCreated} clients created</span>
                      </div>
                    )}
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
        </ScrollArea>

        <DialogFooter>
          <Button variant="outline" onClick={handleClose}>
            {result ? 'Close' : 'Cancel'}
          </Button>
          {!result && (
            <Button onClick={handleImport} disabled={importing || parsedRows.length === 0}>
              {importing && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Import {parsedRows.length} Request{parsedRows.length !== 1 ? 's' : ''}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
