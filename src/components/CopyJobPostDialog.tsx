import { useEffect, useMemo, useState } from 'react';
import { Copy } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import { buildJobPost, type JobPostInput, type JobPostPlatform } from '@/lib/jobPostFormats';

const PLATFORMS: { id: JobPostPlatform; label: string }[] = [
  { id: 'general', label: 'General' },
  { id: 'indeed', label: 'Indeed' },
  { id: 'facebook', label: 'Facebook' },
  { id: 'threads', label: 'Threads' },
  { id: 'linkedin', label: 'LinkedIn' },
];

interface Props {
  job: JobPostInput;
  phpPerUsd: number;
}

export default function CopyJobPostDialog({ job, phpPerUsd }: Props) {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [platform, setPlatform] = useState<JobPostPlatform>('general');
  const [workHours, setWorkHours] = useState('');
  const post = useMemo(
    () => (open ? buildJobPost(platform, job, { workHours, phpPerUsd }) : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [open, platform, workHours],
  );
  const [text, setText] = useState('');
  const [edited, setEdited] = useState(false);

  useEffect(() => {
    if (post) { setText(post.text); setEdited(false); }
  }, [post]);

  const limit = post?.charLimit ?? null;
  const over = limit != null && text.length > limit;
  const label = PLATFORMS.find((p) => p.id === platform)!.label;

  const copy = async () => {
    try {
      if (platform === 'indeed' && post?.html && !edited && typeof ClipboardItem !== 'undefined') {
        try {
          await navigator.clipboard.write([
            new ClipboardItem({
              'text/html': new Blob([post.html], { type: 'text/html' }),
              'text/plain': new Blob([text], { type: 'text/plain' }),
            }),
          ]);
        } catch {
          await navigator.clipboard.writeText(text);
        }
      } else {
        await navigator.clipboard.writeText(text);
      }
      toast({ title: `Copied for ${label}` });
    } catch {
      toast({ title: 'Could not copy', variant: 'destructive' });
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button type="button" variant="outline">
          <Copy className="h-4 w-4 mr-2" />
          Copy job post
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Copy job post</DialogTitle>
        </DialogHeader>
        <Tabs value={platform} onValueChange={(v) => setPlatform(v as JobPostPlatform)}>
          <TabsList className="grid w-full grid-cols-5">
            {PLATFORMS.map((p) => (
              <TabsTrigger key={p.id} value={p.id}>{p.label}</TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
        <div className="space-y-2">
          <Label htmlFor="copy-post-hours">Work Hours</Label>
          <Input
            id="copy-post-hours"
            value={workHours}
            onChange={(e) => setWorkHours(e.target.value)}
            placeholder="e.g., 9 AM – 5 PM EST, Mon–Fri"
          />
        </div>
        <div className="space-y-1">
          <Textarea
            aria-label="Job post preview"
            value={text}
            onChange={(e) => { setText(e.target.value); setEdited(true); }}
            rows={16}
            className="font-mono text-xs"
          />
          <p className={cn('text-xs text-right', over ? 'text-destructive font-medium' : 'text-muted-foreground')}>
            {limit != null ? `${text.length.toLocaleString()} / ${limit.toLocaleString()}` : `${text.length.toLocaleString()} characters`}
          </p>
        </div>
        <div className="flex justify-end">
          <Button type="button" onClick={copy}>
            <Copy className="h-4 w-4 mr-2" />
            Copy
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
