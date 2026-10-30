import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useExchangeRate } from '@/hooks/useExchangeRate';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
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

interface Country { country: string; currency: string; symbol: string | null }

const DEFAULT_COUNTRIES: Country[] = [
  { country: 'Philippines', currency: 'PHP', symbol: '₱' },
  { country: 'Colombia', currency: 'COP', symbol: null },
  { country: 'Costa Rica', currency: 'CRC', symbol: null },
  { country: 'Mexico', currency: 'MXN', symbol: null },
];
const FIXED = DEFAULT_COUNTRIES.map((c) => c.country);
const ADD = '__add__';

function orderCountries(rows: Country[]): Country[] {
  const fixed = FIXED.map((n) => rows.find((r) => r.country === n) ?? DEFAULT_COUNTRIES.find((d) => d.country === n)!);
  const extra = rows.filter((r) => !FIXED.includes(r.country)).sort((a, b) => a.country.localeCompare(b.country));
  return [...fixed, ...extra];
}

interface Props {
  job: JobPostInput;
  phpPerUsd: number;
}

export default function CopyJobPostDialog({ job, phpPerUsd }: Props) {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [platform, setPlatform] = useState<JobPostPlatform>('general');
  const [workHours, setWorkHours] = useState('');
  const [countries, setCountries] = useState<Country[]>(DEFAULT_COUNTRIES);
  const [countryName, setCountryName] = useState('Philippines');
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState('');
  const [newCode, setNewCode] = useState('');
  const [addError, setAddError] = useState('');
  const [saving, setSaving] = useState(false);

  const country = countries.find((c) => c.country === countryName) ?? DEFAULT_COUNTRIES[0];
  const isPhp = country.currency === 'PHP';
  const { rate: otherRate, known } = useExchangeRate(country.currency, open && platform === 'indeed' && !isPhp);
  const perUsd = isPhp ? phpPerUsd : known ? otherRate : 0;

  useEffect(() => {
    if (!open) return;
    setCountryName('Philippines');
    setAdding(false);
    let cancelled = false;
    supabase.from('job_post_countries').select('country, currency, symbol').then(({ data }) => {
      if (!cancelled && data) setCountries(orderCountries(data as Country[]));
    });
    return () => { cancelled = true; };
  }, [open]);

  const addCountry = async () => {
    const name = newName.trim();
    const code = newCode.trim().toUpperCase();
    setAddError('');
    if (!name || !/^[A-Z]{3}$/.test(code)) { setAddError('Enter a country name and a 3-letter currency code.'); return; }
    if (countries.some((c) => c.country.toLowerCase() === name.toLowerCase())) { setAddError('That country is already in the list.'); return; }
    setSaving(true);
    try {
      const { data, error } = await supabase.functions.invoke('get-exchange-rate', { body: { currency: code } });
      if (error || !(Number(data?.rate) > 0)) { setAddError('Currency not found'); return; }
      const row = { country: name, currency: code, symbol: null };
      const { error: insErr } = await supabase.from('job_post_countries').insert(row);
      if (insErr) { setAddError(insErr.message); return; }
      setCountries((prev) => orderCountries([...prev, row]));
      setCountryName(name);
      setAdding(false); setNewName(''); setNewCode('');
    } finally {
      setSaving(false);
    }
  };

  const post = useMemo(
    () => (open
      ? buildJobPost(platform, job, {
          workHours,
          phpPerUsd,
          country: platform === 'indeed' ? { currency: country.currency, symbol: country.symbol, perUsd } : undefined,
        })
      : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [open, platform, workHours, country.currency, country.symbol, perUsd],
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
        <Button type="button" variant="outline" size="sm">
          <Copy className="h-4 w-4 mr-1" />
          Copy to Job Boards
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Copy to Job Boards</DialogTitle>
        </DialogHeader>
        <Tabs value={platform} onValueChange={(v) => setPlatform(v as JobPostPlatform)}>
          <TabsList className="grid w-full grid-cols-5">
            {PLATFORMS.map((p) => (
              <TabsTrigger key={p.id} value={p.id}>{p.label}</TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
        {platform === 'indeed' && (
          <div className="space-y-2">
            <Label htmlFor="copy-post-country">Country</Label>
            <Select
              value={countryName}
              onValueChange={(v) => { if (v === ADD) { setAdding(true); setAddError(''); } else setCountryName(v); }}
            >
              <SelectTrigger id="copy-post-country"><SelectValue /></SelectTrigger>
              <SelectContent>
                {countries.map((c) => (
                  <SelectItem key={c.country} value={c.country}>
                    {c.country} ({c.currency}{c.symbol ? `, ${c.symbol}` : ''})
                  </SelectItem>
                ))}
                <SelectItem value={ADD}>+ Add country</SelectItem>
              </SelectContent>
            </Select>
            {adding && (
              <div className="rounded-md border p-3 space-y-2">
                <div className="grid grid-cols-[1fr_8rem] gap-2">
                  <Input aria-label="Country name" placeholder="Country name" value={newName} onChange={(e) => setNewName(e.target.value)} />
                  <Input aria-label="Currency code" placeholder="e.g. PEN" maxLength={3} value={newCode} onChange={(e) => setNewCode(e.target.value.toUpperCase())} />
                </div>
                {addError && <p className="text-xs text-destructive">{addError}</p>}
                <div className="flex justify-end gap-2">
                  <Button type="button" variant="ghost" size="sm" onClick={() => setAdding(false)}>Cancel</Button>
                  <Button type="button" size="sm" onClick={addCountry} disabled={saving}>{saving ? 'Checking…' : 'Save'}</Button>
                </div>
              </div>
            )}
          </div>
        )}
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
