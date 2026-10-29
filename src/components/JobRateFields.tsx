import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { buildJobPay, type HoursOption, type RateFormValue } from '@/lib/jobRate';

const HOURS: { value: HoursOption; label: string }[] = [
  { value: '40', label: '40 hours' },
  { value: '50', label: '50 hours' },
  { value: '40-50', label: '40–50 hours' },
];

interface Props {
  idPrefix: string;
  value: RateFormValue;
  onChange: (v: RateFormValue) => void;
  region: string;
  phpRate: number;
  legacyRate?: string | null;
}

function MoneyInput({ id, label, value, onChange }: { id: string; label?: string; value: string; onChange: (s: string) => void }) {
  return (
    <div className="space-y-1 flex-1">
      {label && <Label htmlFor={id} className="text-xs text-muted-foreground">{label}</Label>}
      <div className="relative">
        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">$</span>
        <Input
          id={id}
          inputMode="decimal"
          className="pl-7"
          value={value}
          placeholder="0.00"
          onChange={(e) => {
            const s = e.target.value;
            if (s === '' || /^\d*(\.\d{0,2})?$/.test(s)) onChange(s);
          }}
        />
      </div>
    </div>
  );
}

export default function JobRateFields({ idPrefix, value, onChange, region, phpRate, legacyRate }: Props) {
  const set = (patch: Partial<RateFormValue>) => onChange({ ...value, ...patch });
  const result = buildJobPay(value, region, phpRate, legacyRate ?? null);
  const hasInput = value.min.trim() !== '' || (value.rateType === 'range' && value.max.trim() !== '');

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label>Rate in USD per hour (optional)</Label>
        <ToggleGroup
          type="single"
          variant="outline"
          size="sm"
          className="justify-start"
          value={value.rateType}
          onValueChange={(t) => t && set({ rateType: t as RateFormValue['rateType'] })}
        >
          <ToggleGroupItem value="fixed">Fixed rate</ToggleGroupItem>
          <ToggleGroupItem value="range">Rate range</ToggleGroupItem>
        </ToggleGroup>
        {value.rateType === 'fixed' ? (
          <MoneyInput id={`${idPrefix}-rate-min`} value={value.min} onChange={(min) => set({ min })} />
        ) : (
          <div className="flex gap-3">
            <MoneyInput id={`${idPrefix}-rate-min`} label="Minimum" value={value.min} onChange={(min) => set({ min })} />
            <MoneyInput id={`${idPrefix}-rate-max`} label="Maximum" value={value.max} onChange={(max) => set({ max })} />
          </div>
        )}
        {legacyRate && (
          <p className="text-sm text-muted-foreground">
            Current rate: <span className="font-medium text-foreground">{legacyRate}</span>
            {hasInput ? ' (will be replaced)' : ''}
          </p>
        )}
        {!result.ok && hasInput && <p className="text-sm text-destructive">{result.error}</p>}
        {region === 'philippines' && result.ok && result.value.rate && (
          <p className="text-sm font-medium text-primary">Will be saved as: {result.value.rate}</p>
        )}
      </div>

      <div className="space-y-2">
        <Label>Work hours per week</Label>
        <div className="flex flex-wrap gap-4">
          {HOURS.map((h) => (
            <label key={h.value} className="flex items-center gap-2 text-sm cursor-pointer">
              <Checkbox
                checked={value.hoursOption === h.value}
                onCheckedChange={(c) => c && set({ hoursOption: h.value })}
              />
              {h.label}
            </label>
          ))}
        </div>
      </div>
    </div>
  );
}
