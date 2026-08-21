import * as React from "react";
import { Clock } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";

export const TIME_OPTIONS: { value: string; label: string }[] = (() => {
  const out: { value: string; label: string }[] = [];
  for (let m = 0; m < 24 * 60; m += 15) {
    const h = Math.floor(m / 60);
    const min = m % 60;
    const value = `${String(h).padStart(2, "0")}:${String(min).padStart(2, "0")}`;
    const hour12 = h % 12 === 0 ? 12 : h % 12;
    const ampm = h < 12 ? "AM" : "PM";
    out.push({ value, label: `${hour12}:${String(min).padStart(2, "0")} ${ampm}` });
  }
  return out;
})();

export function formatTimeLabel(value: string): string {
  if (!value) return "";
  const [hStr, mStr] = value.split(":");
  const h = Number(hStr);
  if (Number.isNaN(h)) return value;
  const hour12 = h % 12 === 0 ? 12 : h % 12;
  const ampm = h < 12 ? "AM" : "PM";
  return `${hour12}:${(mStr ?? "00").padStart(2, "0")} ${ampm}`;
}

interface TimeSelectProps {
  id?: string;
  value: string;
  onChange: (value: string) => void;
  className?: string;
  disabled?: boolean;
}

/** 30-minute increment time picker (12-hour labels, 24-hour "HH:mm" value). */
export function TimeSelect({ id, value, onChange, className, disabled }: TimeSelectProps) {
  // Include the current value even if it isn't on a 30-minute boundary.
  const options = React.useMemo(() => {
    if (value && !TIME_OPTIONS.some((o) => o.value === value)) {
      return [...TIME_OPTIONS, { value, label: formatTimeLabel(value) }].sort((a, b) =>
        a.value.localeCompare(b.value)
      );
    }
    return TIME_OPTIONS;
  }, [value]);

  return (
    <Select value={value} onValueChange={onChange} disabled={disabled}>
      <SelectTrigger id={id} className={cn("w-full", className)}>
        <span className="flex items-center gap-2 truncate">
          <Clock className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
          <SelectValue placeholder="Select time" />
        </span>
      </SelectTrigger>
      <SelectContent className="max-h-64">
        {options.map((o) => (
          <SelectItem key={o.value} value={o.value}>
            {o.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
