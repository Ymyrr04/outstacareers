import { useState, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { Wand2, Upload, Loader2, FileText, X } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';

interface ParsedData {
  description: string;
  qualifications: string[];
  responsibilities: string[];
}

interface JobDescriptionParserProps {
  currentDescription: string;
  currentQualifications: string[];
  currentResponsibilities: string[];
  onApply: (data: ParsedData) => void;
}

export const JobDescriptionParser = ({
  currentDescription,
  currentQualifications,
  currentResponsibilities,
  onApply,
}: JobDescriptionParserProps) => {
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  const [isOpen, setIsOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [pastedContent, setPastedContent] = useState('');
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  const [parsedData, setParsedData] = useState<ParsedData | null>(null);
  const [showConfirmReplace, setShowConfirmReplace] = useState(false);

  const hasExistingContent = () => {
    const hasDescription = currentDescription.trim().length > 0;
    const hasQualifications = currentQualifications.some(q => q.trim().length > 0);
    const hasResponsibilities = currentResponsibilities.some(r => r.trim().length > 0);
    return hasDescription || hasQualifications || hasResponsibilities;
  };

  const extractTextFromFile = async (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      
      if (file.type === 'application/pdf') {
        // For PDF, we'll read as text (basic extraction)
        reader.onload = (e) => {
          const text = e.target?.result as string;
          // Basic PDF text extraction - may not work perfectly for all PDFs
          resolve(text || '');
        };
        reader.onerror = reject;
        reader.readAsText(file);
      } else if (file.type === 'application/msword' || file.type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') {
        // For DOC/DOCX, read as text
        reader.onload = (e) => {
          const text = e.target?.result as string;
          resolve(text || '');
        };
        reader.onerror = reject;
        reader.readAsText(file);
      } else if (file.type === 'text/plain') {
        reader.onload = (e) => {
          resolve(e.target?.result as string || '');
        };
        reader.onerror = reject;
        reader.readAsText(file);
      } else {
        reject(new Error('Unsupported file type'));
      }
    });
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const validTypes = [
      'application/pdf',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'text/plain'
    ];

    if (!validTypes.includes(file.type)) {
      toast({
        title: 'Invalid file type',
        description: 'Please upload a PDF, DOC, DOCX, or TXT file.',
        variant: 'destructive',
      });
      return;
    }

    setUploadedFile(file);
    setPastedContent('');
  };

  const handleParse = async () => {
    let content = pastedContent.trim();

    // If a file is uploaded, try to extract text from it
    if (uploadedFile && !content) {
      try {
        content = await extractTextFromFile(uploadedFile);
      } catch (error) {
        toast({
          title: 'Failed to read file',
          description: 'Could not extract text from the uploaded file. Please paste the content directly.',
          variant: 'destructive',
        });
        return;
      }
    }

    if (!content) {
      toast({
        title: 'No content',
        description: 'Please paste a job description or upload a document.',
        variant: 'destructive',
      });
      return;
    }

    setIsLoading(true);

    try {
      const { data, error } = await supabase.functions.invoke('parse-job-description', {
        body: { content },
      });

      if (error) {
        throw error;
      }

      if (!data?.success || !data?.data) {
        throw new Error(data?.error || 'Failed to parse job description');
      }

      setParsedData(data.data);
      toast({
        title: 'Parsed successfully',
        description: 'Review the extracted content below.',
      });
    } catch (error) {
      console.error('Parse error:', error);
      toast({
        title: 'Parse failed',
        description: error instanceof Error ? error.message : 'Failed to parse job description',
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleApply = () => {
    if (!parsedData) return;

    if (hasExistingContent()) {
      setShowConfirmReplace(true);
    } else {
      applyParsedData();
    }
  };

  const applyParsedData = () => {
    if (!parsedData) return;
    
    onApply(parsedData);
    setIsOpen(false);
    setPastedContent('');
    setUploadedFile(null);
    setParsedData(null);
    setShowConfirmReplace(false);
    
    toast({
      title: 'Content applied',
      description: 'The parsed content has been added to the form. You can edit it as needed.',
    });
  };

  const handleClose = () => {
    setIsOpen(false);
    setPastedContent('');
    setUploadedFile(null);
    setParsedData(null);
  };

  const removeFile = () => {
    setUploadedFile(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  return (
    <>
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => setIsOpen(true)}
        className="gap-2"
      >
        <Wand2 className="h-4 w-4" />
        Parse Job Description
      </Button>

      <Dialog open={isOpen} onOpenChange={setIsOpen}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Wand2 className="h-5 w-5" />
              Parse Job Description
            </DialogTitle>
            <DialogDescription>
              Paste a job description or upload a document. AI will extract the description, 
              qualifications, and responsibilities automatically.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            {/* Paste Text Area */}
            <div className="space-y-2">
              <Label>Paste Job Description</Label>
              <Textarea
                value={pastedContent}
                onChange={(e) => {
                  setPastedContent(e.target.value);
                  if (e.target.value) setUploadedFile(null);
                }}
                placeholder="Paste the full job description here..."
                rows={8}
                className="resize-none"
              />
            </div>

            <div className="flex items-center gap-4">
              <div className="flex-1 border-t" />
              <span className="text-sm text-muted-foreground">or</span>
              <div className="flex-1 border-t" />
            </div>

            {/* File Upload */}
            <div className="space-y-2">
              <Label>Upload Document</Label>
              <div className="flex items-center gap-2">
                <Input
                  ref={fileInputRef}
                  type="file"
                  accept=".pdf,.doc,.docx,.txt"
                  onChange={handleFileSelect}
                  className="hidden"
                  id="job-doc-upload"
                />
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => fileInputRef.current?.click()}
                  className="gap-2"
                >
                  <Upload className="h-4 w-4" />
                  Choose File
                </Button>
                {uploadedFile && (
                  <div className="flex items-center gap-2 px-3 py-1.5 bg-muted rounded-md">
                    <FileText className="h-4 w-4" />
                    <span className="text-sm truncate max-w-[200px]">{uploadedFile.name}</span>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-5 w-5"
                      onClick={removeFile}
                    >
                      <X className="h-3 w-3" />
                    </Button>
                  </div>
                )}
              </div>
              <p className="text-xs text-muted-foreground">
                Supported: PDF, DOC, DOCX, TXT
              </p>
            </div>

            {/* Parse Button */}
            <Button
              type="button"
              onClick={handleParse}
              disabled={isLoading || (!pastedContent.trim() && !uploadedFile)}
              className="w-full gap-2"
            >
              {isLoading ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Parsing...
                </>
              ) : (
                <>
                  <Wand2 className="h-4 w-4" />
                  Parse Content
                </>
              )}
            </Button>

            {/* Parsed Results Preview */}
            {parsedData && (
              <div className="space-y-4 pt-4 border-t">
                <h4 className="font-medium text-sm">Extracted Content Preview</h4>
                
                <div className="space-y-2">
                  <Label className="text-xs text-muted-foreground">Description</Label>
                  <div className="p-3 bg-muted rounded-md text-sm">
                    {parsedData.description || <span className="italic text-muted-foreground">No description extracted</span>}
                  </div>
                </div>

                <div className="space-y-2">
                  <Label className="text-xs text-muted-foreground">
                    Qualifications ({parsedData.qualifications.length})
                  </Label>
                  <div className="p-3 bg-muted rounded-md text-sm space-y-1">
                    {parsedData.qualifications.length > 0 ? (
                      parsedData.qualifications.map((q, i) => (
                        <div key={i} className="flex items-start gap-2">
                          <span className="text-muted-foreground">•</span>
                          <span>{q}</span>
                        </div>
                      ))
                    ) : (
                      <span className="italic text-muted-foreground">No qualifications extracted</span>
                    )}
                  </div>
                </div>

                <div className="space-y-2">
                  <Label className="text-xs text-muted-foreground">
                    Responsibilities ({parsedData.responsibilities.length})
                  </Label>
                  <div className="p-3 bg-muted rounded-md text-sm space-y-1">
                    {parsedData.responsibilities.length > 0 ? (
                      parsedData.responsibilities.map((r, i) => (
                        <div key={i} className="flex items-start gap-2">
                          <span className="text-muted-foreground">•</span>
                          <span>{r}</span>
                        </div>
                      ))
                    ) : (
                      <span className="italic text-muted-foreground">No responsibilities extracted</span>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={handleClose}>
              Cancel
            </Button>
            {parsedData && (
              <Button type="button" onClick={handleApply}>
                Apply to Form
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Confirmation Dialog */}
      <AlertDialog open={showConfirmReplace} onOpenChange={setShowConfirmReplace}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Replace existing content?</AlertDialogTitle>
            <AlertDialogDescription>
              The form already has content in the description, qualifications, or responsibilities fields. 
              Applying the parsed content will replace the existing data.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={applyParsedData}>
              Replace Content
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
};
