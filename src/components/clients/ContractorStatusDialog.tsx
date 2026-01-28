import { useState } from 'react';
import { format } from 'date-fns';
import { CalendarIcon, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';

interface ContractorStatusDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  status: 'rendering' | 'resigned' | 'terminated' | 'scheduled';
  contractorName: string;
  onConfirm: (data: { 
    status: string; 
    renderingReason?: 'resign' | 'termination'; 
    effectiveDate?: string;
    startDate?: string;
    reason?: string;
  }) => void;
  saving: boolean;
}

export const ContractorStatusDialog = ({
  open,
  onOpenChange,
  status,
  contractorName,
  onConfirm,
  saving,
}: ContractorStatusDialogProps) => {
  const [renderingReason, setRenderingReason] = useState<'resign' | 'termination'>('resign');
  const [effectiveDate, setEffectiveDate] = useState<Date | undefined>(undefined);
  const [reason, setReason] = useState('');

  const handleConfirm = () => {
    if (status === 'rendering') {
      onConfirm({
        status,
        renderingReason,
        effectiveDate: effectiveDate ? format(effectiveDate, 'yyyy-MM-dd') : undefined,
        reason: reason.trim() || undefined,
      });
    } else if (status === 'scheduled') {
      onConfirm({
        status,
        startDate: effectiveDate ? format(effectiveDate, 'yyyy-MM-dd') : undefined,
      });
    } else {
      onConfirm({
        status,
        effectiveDate: effectiveDate ? format(effectiveDate, 'yyyy-MM-dd') : undefined,
        reason: reason.trim() || undefined,
      });
    }
  };

  const showReasonField = status === 'rendering' || status === 'resigned' || status === 'terminated';

  const getDialogTitle = () => {
    switch (status) {
      case 'scheduled':
        return 'Scheduled to Start';
      case 'rendering':
        return 'Rendering Period';
      case 'resigned':
        return 'Confirm Resignation';
      case 'terminated':
        return 'Confirm Termination';
      default:
        return 'Update Status';
    }
  };

  const getDialogDescription = () => {
    switch (status) {
      case 'scheduled':
        return `Set start date for ${contractorName}`;
      case 'rendering':
        return `Set rendering details for ${contractorName}`;
      case 'resigned':
        return `Confirm resignation for ${contractorName}`;
      case 'terminated':
        return `Confirm termination for ${contractorName}`;
      default:
        return '';
    }
  };

  const getDateLabel = () => {
    switch (status) {
      case 'scheduled':
        return 'Start Date';
      case 'rendering':
        return 'Effective Date';
      default:
        return 'Last Day';
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{getDialogTitle()}</DialogTitle>
          <DialogDescription>{getDialogDescription()}</DialogDescription>
        </DialogHeader>

        <div className="space-y-6 py-4">
          {status === 'rendering' && (
            <div className="space-y-3">
              <Label>Rendering Reason</Label>
              <RadioGroup
                value={renderingReason}
                onValueChange={(value) => setRenderingReason(value as 'resign' | 'termination')}
                className="flex flex-col gap-3"
              >
                <div className="flex items-center space-x-3">
                  <RadioGroupItem value="resign" id="resign" />
                  <Label htmlFor="resign" className="font-normal cursor-pointer">
                    Resignation
                  </Label>
                </div>
                <div className="flex items-center space-x-3">
                  <RadioGroupItem value="termination" id="termination" />
                  <Label htmlFor="termination" className="font-normal cursor-pointer">
                    Termination
                  </Label>
                </div>
              </RadioGroup>
            </div>
          )}

          <div className="space-y-3">
            <Label>{getDateLabel()}</Label>
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  className={cn(
                    "w-full justify-start text-left font-normal",
                    !effectiveDate && "text-muted-foreground"
                  )}
                >
                  <CalendarIcon className="mr-2 h-4 w-4" />
                  {effectiveDate ? format(effectiveDate, "PPP") : <span>Pick a date</span>}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar
                  mode="single"
                  selected={effectiveDate}
                  onSelect={setEffectiveDate}
                  initialFocus
                  className={cn("p-3 pointer-events-auto")}
                />
              </PopoverContent>
            </Popover>
          </div>

          {showReasonField && (
            <div className="space-y-3">
              <Label>Reason (optional)</Label>
              <Textarea
                placeholder="Brief reason for the status change..."
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                rows={3}
                className="resize-none"
              />
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={handleConfirm} disabled={saving}>
            {saving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
            Confirm
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};