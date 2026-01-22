import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { usePipelineStages } from '@/hooks/usePipelineStages';

const EMOJI_OPTIONS = ['📋', '🔍', '📞', '✅', '🎯', '💼', '📝', '🚀', '⭐', '🏆', '📊', '💡'];

interface AddPipelineStageDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated?: () => void;
}

export const AddPipelineStageDialog = ({
  open,
  onOpenChange,
  onCreated,
}: AddPipelineStageDialogProps) => {
  const { createStage } = usePipelineStages();
  const [name, setName] = useState('');
  const [emoji, setEmoji] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!name.trim()) return;

    setIsSubmitting(true);
    const success = await createStage({
      name: name.trim(),
      emoji,
    });
    setIsSubmitting(false);

    if (success) {
      setName('');
      setEmoji(null);
      onOpenChange(false);
      onCreated?.();
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Add Pipeline Section</DialogTitle>
        </DialogHeader>
        
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="stage-name">Section Name</Label>
            <Input
              id="stage-name"
              placeholder="e.g., Client Review, Final Interview"
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoFocus
            />
          </div>

          <div className="space-y-2">
            <Label>Icon (optional)</Label>
            <div className="flex flex-wrap gap-2">
              {EMOJI_OPTIONS.map((e) => (
                <button
                  key={e}
                  type="button"
                  onClick={() => setEmoji(emoji === e ? null : e)}
                  className={`
                    w-10 h-10 rounded-lg text-xl flex items-center justify-center
                    transition-all border-2
                    ${emoji === e 
                      ? 'border-primary bg-primary/10' 
                      : 'border-transparent bg-muted hover:bg-muted/80'
                    }
                  `}
                >
                  {e}
                </button>
              ))}
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-4">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={!name.trim() || isSubmitting}>
              {isSubmitting ? 'Creating...' : 'Create Section'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
};
