import { useState, useCallback } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { Upload, FileText, CheckCircle, XCircle, AlertCircle, Loader2, SkipForward } from 'lucide-react';

interface Job {
  id: string;
  title: string;
  description: string | null;
  qualifications: string[] | null;
  responsibilities: string[] | null;
}

interface FileStatus {
  name: string;
  status: 'pending' | 'uploading' | 'checking' | 'extracting' | 'scoring' | 'completed' | 'skipped' | 'failed';
  message?: string;
  extractedInfo?: {
    email?: string;
    phone?: string;
    fullName?: string;
  };
  score?: number;
  rankingStatus?: string;
}

const STATUS_OPTIONS = [
  'Reviewed',
  'Pass Screening',
  'Reject',
  '50/50',
  'For Interview',
  'Candidate Successful',
  'Bench'
] as const;

interface BulkUploadDialogProps {
  jobs: Job[];
  onUploadComplete: () => void;
}

export default function BulkUploadDialog({ jobs, onUploadComplete }: BulkUploadDialogProps) {
  const [open, setOpen] = useState(false);
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [selectedJobId, setSelectedJobId] = useState<string>('');
  const [selectedStatus, setSelectedStatus] = useState<string>('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [fileStatuses, setFileStatuses] = useState<FileStatus[]>([]);
  const { toast } = useToast();

  const selectedJob = jobs.find(j => j.id === selectedJobId);

  const handleFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    const validFiles = files.filter(file => 
      file.type === 'application/pdf' || 
      file.type === 'application/msword' ||
      file.type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    );
    
    if (validFiles.length !== files.length) {
      toast({
        title: 'Some files skipped',
        description: 'Only PDF and DOC/DOCX files are accepted',
        variant: 'destructive',
      });
    }
    
    setSelectedFiles(validFiles);
    setFileStatuses(validFiles.map(f => ({ name: f.name, status: 'pending' })));
  }, [toast]);

  const updateFileStatus = (index: number, updates: Partial<FileStatus>) => {
    setFileStatuses(prev => prev.map((fs, i) => 
      i === index ? { ...fs, ...updates } : fs
    ));
  };

  const fileToBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const result = reader.result as string;
        // Remove the data URL prefix
        const base64 = result.split(',')[1];
        resolve(base64);
      };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  };

  const processFiles = async () => {
    if (!selectedJobId || !selectedStatus || selectedFiles.length === 0) {
      toast({
        title: 'Missing information',
        description: 'Please select files, a role, and a status',
        variant: 'destructive',
      });
      return;
    }

    setIsProcessing(true);
    const runScoring = selectedStatus === 'Reviewed';

    let successCount = 0;
    let skippedCount = 0;
    let failedCount = 0;

    for (let i = 0; i < selectedFiles.length; i++) {
      const file = selectedFiles[i];

      try {
        // Step 1: Uploading
        updateFileStatus(i, { status: 'uploading' });
        const base64 = await fileToBase64(file);

        // Step 2: Checking duplicates
        updateFileStatus(i, { status: 'checking' });
        await new Promise(resolve => setTimeout(resolve, 200)); // Brief pause for UI

        // Step 3: Extracting
        updateFileStatus(i, { status: 'extracting' });

        // Step 4: Scoring (if applicable)
        if (runScoring) {
          updateFileStatus(i, { status: 'scoring' });
        }

        // Call the edge function
        const { data, error } = await supabase.functions.invoke('bulk-upload-cv', {
          body: {
            file_base64: base64,
            file_name: file.name,
            file_type: file.type,
            job_id: selectedJobId,
            job_title: selectedJob?.title || 'Unknown',
            job_description: selectedJob?.description || '',
            job_qualifications: selectedJob?.qualifications || [],
            job_responsibilities: selectedJob?.responsibilities || [],
            status: selectedStatus,
            run_scoring: runScoring,
          },
        });

        if (error) {
          console.error('Function error:', error);
          updateFileStatus(i, { 
            status: 'failed', 
            message: error.message || 'Processing failed' 
          });
          failedCount++;
          continue;
        }

        if (data?.skipped) {
          updateFileStatus(i, { 
            status: 'skipped', 
            message: data.reason || 'Duplicate found',
            extractedInfo: data.extracted_info,
          });
          skippedCount++;
        } else if (data?.success) {
          updateFileStatus(i, { 
            status: 'completed',
            extractedInfo: data.extracted_info,
            score: data.total_score,
            rankingStatus: data.ranking_status,
          });
          successCount++;
        } else {
          updateFileStatus(i, { 
            status: 'failed', 
            message: data?.error || 'Unknown error' 
          });
          failedCount++;
        }

      } catch (err) {
        console.error('Processing error:', err);
        updateFileStatus(i, { 
          status: 'failed', 
          message: err instanceof Error ? err.message : 'Unknown error' 
        });
        failedCount++;
      }
    }

    setIsProcessing(false);

    toast({
      title: 'Bulk Upload Complete',
      description: `${successCount} added, ${skippedCount} skipped (duplicates), ${failedCount} failed`,
    });

    if (successCount > 0) {
      onUploadComplete();
    }
  };

  const resetDialog = () => {
    setSelectedFiles([]);
    setSelectedJobId('');
    setSelectedStatus('');
    setFileStatuses([]);
  };

  const completedCount = fileStatuses.filter(f => f.status === 'completed').length;
  const skippedCount = fileStatuses.filter(f => f.status === 'skipped').length;
  const failedCount = fileStatuses.filter(f => f.status === 'failed').length;
  const progress = fileStatuses.length > 0 
    ? ((completedCount + skippedCount + failedCount) / fileStatuses.length) * 100 
    : 0;

  const getStatusIcon = (status: FileStatus['status']) => {
    switch (status) {
      case 'pending':
        return <FileText className="w-4 h-4 text-muted-foreground" />;
      case 'uploading':
      case 'checking':
      case 'extracting':
      case 'scoring':
        return <Loader2 className="w-4 h-4 text-primary animate-spin" />;
      case 'completed':
        return <CheckCircle className="w-4 h-4 text-green-500" />;
      case 'skipped':
        return <SkipForward className="w-4 h-4 text-yellow-500" />;
      case 'failed':
        return <XCircle className="w-4 h-4 text-red-500" />;
    }
  };

  const getStatusLabel = (fs: FileStatus) => {
    switch (fs.status) {
      case 'pending':
        return 'Waiting...';
      case 'uploading':
        return 'Uploading...';
      case 'checking':
        return 'Checking duplicate...';
      case 'extracting':
        return 'Extracting data...';
      case 'scoring':
        return 'AI Scoring...';
      case 'completed':
        return fs.score !== undefined ? `Score: ${fs.score} (${fs.rankingStatus})` : 'Completed';
      case 'skipped':
        return fs.message || 'Skipped (duplicate)';
      case 'failed':
        return fs.message || 'Failed';
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) resetDialog(); }}>
      <DialogTrigger asChild>
        <Button variant="outline">
          <Upload className="w-4 h-4 mr-2" />
          Bulk Upload CVs
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle>Bulk Upload CVs</DialogTitle>
          <DialogDescription>
            Upload multiple CV files at once. Duplicates will be automatically skipped.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 flex-1 overflow-hidden flex flex-col">
          {/* File Input */}
          <div className="space-y-2">
            <Label>Select CV Files (PDF, DOC, DOCX)</Label>
            <input
              type="file"
              multiple
              accept=".pdf,.doc,.docx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
              onChange={handleFileChange}
              disabled={isProcessing}
              className="block w-full text-sm text-muted-foreground
                file:mr-4 file:py-2 file:px-4
                file:rounded-md file:border-0
                file:text-sm file:font-medium
                file:bg-primary file:text-primary-foreground
                hover:file:bg-primary/90
                file:cursor-pointer cursor-pointer
                disabled:opacity-50 disabled:cursor-not-allowed"
            />
            {selectedFiles.length > 0 && (
              <p className="text-sm text-muted-foreground">
                {selectedFiles.length} file(s) selected
              </p>
            )}
          </div>

          {/* Role Selection */}
          <div className="space-y-2">
            <Label>Select Role</Label>
            <Select value={selectedJobId} onValueChange={setSelectedJobId} disabled={isProcessing}>
              <SelectTrigger>
                <SelectValue placeholder="Choose a role..." />
              </SelectTrigger>
              <SelectContent>
                {jobs.filter(j => j.id).map(job => (
                  <SelectItem key={job.id} value={job.id}>
                    {job.title}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Status Selection */}
          <div className="space-y-2">
            <Label>Assign Status</Label>
            <Select value={selectedStatus} onValueChange={setSelectedStatus} disabled={isProcessing}>
              <SelectTrigger>
                <SelectValue placeholder="Choose a status..." />
              </SelectTrigger>
              <SelectContent>
                {STATUS_OPTIONS.map(status => (
                  <SelectItem key={status} value={status}>
                    {status}
                    {status === 'Reviewed' && (
                      <span className="ml-2 text-xs text-muted-foreground">(with AI scoring)</span>
                    )}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {selectedStatus === 'Reviewed' && (
              <p className="text-xs text-muted-foreground">
                <AlertCircle className="w-3 h-3 inline mr-1" />
                AI scoring will be performed on each CV
              </p>
            )}
          </div>

          {/* Progress Section */}
          {fileStatuses.length > 0 && (
            <div className="space-y-3 flex-1 overflow-hidden flex flex-col">
              <div className="space-y-1">
                <div className="flex justify-between text-sm">
                  <span>Progress</span>
                  <span>
                    {completedCount + skippedCount + failedCount} / {fileStatuses.length}
                  </span>
                </div>
                <Progress value={progress} className="h-2" />
              </div>

              <div className="flex gap-2 text-sm">
                <Badge variant="outline" className="text-green-600">
                  <CheckCircle className="w-3 h-3 mr-1" />
                  {completedCount} Added
                </Badge>
                <Badge variant="outline" className="text-yellow-600">
                  <SkipForward className="w-3 h-3 mr-1" />
                  {skippedCount} Skipped
                </Badge>
                <Badge variant="outline" className="text-red-600">
                  <XCircle className="w-3 h-3 mr-1" />
                  {failedCount} Failed
                </Badge>
              </div>

              <ScrollArea className="flex-1 border rounded-md">
                <div className="p-2 space-y-2">
                  {fileStatuses.map((fs, index) => (
                    <div 
                      key={index} 
                      className={`flex items-center gap-3 p-2 rounded text-sm ${
                        fs.status === 'completed' ? 'bg-green-50 dark:bg-green-950/20' :
                        fs.status === 'skipped' ? 'bg-yellow-50 dark:bg-yellow-950/20' :
                        fs.status === 'failed' ? 'bg-red-50 dark:bg-red-950/20' :
                        'bg-muted/50'
                      }`}
                    >
                      {getStatusIcon(fs.status)}
                      <div className="flex-1 min-w-0">
                        <p className="font-medium truncate">{fs.name}</p>
                        <p className={`text-xs ${
                          fs.status === 'completed' ? 'text-green-600' :
                          fs.status === 'skipped' ? 'text-yellow-600' :
                          fs.status === 'failed' ? 'text-red-600' :
                          'text-muted-foreground'
                        }`}>
                          {getStatusLabel(fs)}
                        </p>
                        {fs.extractedInfo?.email && fs.status !== 'pending' && (
                          <p className="text-xs text-muted-foreground">
                            {fs.extractedInfo.fullName && `${fs.extractedInfo.fullName} • `}
                            {fs.extractedInfo.email}
                          </p>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </ScrollArea>
            </div>
          )}

          {/* Action Buttons */}
          <div className="flex justify-end gap-2 pt-2">
            <Button 
              variant="outline" 
              onClick={() => setOpen(false)}
              disabled={isProcessing}
            >
              {isProcessing ? 'Processing...' : 'Close'}
            </Button>
            <Button
              onClick={processFiles}
              disabled={isProcessing || selectedFiles.length === 0 || !selectedJobId || !selectedStatus}
            >
              {isProcessing ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Processing...
                </>
              ) : (
                <>
                  <Upload className="w-4 h-4 mr-2" />
                  Upload {selectedFiles.length} File(s)
                </>
              )}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
