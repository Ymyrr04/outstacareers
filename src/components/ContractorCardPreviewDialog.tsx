import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Loader2, RefreshCw, Send, X } from 'lucide-react';

interface ContractorCardPreviewDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  imageUrl: string | null;
  isGenerating: boolean;
  applicantName: string;
  jobTitle: string;
  onConfirm: () => void;
  onRegenerate: () => void;
  onCancel: () => void;
}

export function ContractorCardPreviewDialog({
  open,
  onOpenChange,
  imageUrl,
  isGenerating,
  applicantName,
  jobTitle,
  onConfirm,
  onRegenerate,
  onCancel,
}: ContractorCardPreviewDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Contractor Card Preview</DialogTitle>
          <DialogDescription>
            Review the generated contractor card for <strong>{applicantName}</strong> before sending the SIV email.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col items-center gap-4 py-4">
          {isGenerating ? (
            <div className="flex flex-col items-center justify-center h-64 w-full bg-muted rounded-lg">
              <Loader2 className="h-8 w-8 animate-spin text-primary mb-4" />
              <p className="text-sm text-muted-foreground">Generating contractor card...</p>
              <p className="text-xs text-muted-foreground mt-1">
                Name: {applicantName} | Role: {jobTitle}
              </p>
            </div>
          ) : imageUrl ? (
            <div className="relative w-full">
              <img
                src={imageUrl}
                alt={`Contractor card for ${applicantName}`}
                className="w-full h-auto rounded-lg border shadow-sm"
              />
              <div className="mt-2 text-center text-sm text-muted-foreground">
                <p><strong>Name:</strong> {applicantName}</p>
                <p><strong>Role:</strong> {jobTitle}</p>
              </div>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center h-64 w-full bg-destructive/10 rounded-lg">
              <X className="h-8 w-8 text-destructive mb-4" />
              <p className="text-sm text-destructive">Failed to generate contractor card</p>
              <p className="text-xs text-muted-foreground mt-1">Click "Regenerate" to try again</p>
            </div>
          )}
        </div>

        <DialogFooter className="flex-col sm:flex-row gap-2">
          <Button variant="outline" onClick={onCancel} disabled={isGenerating}>
            Cancel
          </Button>
          <Button
            variant="secondary"
            onClick={onRegenerate}
            disabled={isGenerating}
            className="gap-2"
          >
            <RefreshCw className="h-4 w-4" />
            Regenerate
          </Button>
          <Button
            onClick={onConfirm}
            disabled={isGenerating || !imageUrl}
            className="gap-2"
          >
            <Send className="h-4 w-4" />
            Send Email with Card
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
