import { useState, useMemo } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { CalendarClock, Loader2 } from 'lucide-react';

const TIME_SLOTS: string[] = [];
for (let h = 0; h < 24; h++) {
  for (let m = 0; m < 60; m += 30) {
    const hour12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
    const ampm = h < 12 ? 'AM' : 'PM';
    const minStr = m === 0 ? '00' : '30';
    TIME_SLOTS.push(`${hour12}:${minStr} ${ampm}`);
  }
}

const parseTime = (timeStr: string): { hour: number; minute: number } => {
  const [timePart, ampm] = timeStr.split(' ');
  let [hour, minute] = timePart.split(':').map(Number);
  if (ampm === 'PM' && hour !== 12) hour += 12;
  if (ampm === 'AM' && hour === 12) hour = 0;
  return { hour, minute };
};

interface ScheduleDateTimeDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: (date: Date) => Promise<void>;
  title?: string;
  defaultDate?: string; // YYYY-MM-DD
  defaultTime?: string; // e.g. "11:00 AM"
  loading?: boolean;
}

export const ScheduleDateTimeDialog = ({
  open,
  onOpenChange,
  onConfirm,
  title = 'Schedule Email',
  defaultDate,
  defaultTime = '11:00 AM',
  loading = false,
}: ScheduleDateTimeDialogProps) => {
  const todayStr = useMemo(() => {
    const now = new Date();
    // Get today in Eastern time for the default
    const eastern = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'America/New_York',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(now);
    return eastern;
  }, []);

  const [selectedDate, setSelectedDate] = useState(defaultDate || todayStr);
  const [selectedTime, setSelectedTime] = useState(defaultTime);

  const handleConfirm = async () => {
    const { hour, minute } = parseTime(selectedTime);
    const [year, month, day] = selectedDate.split('-').map(Number);

    // Build date at Eastern timezone
    const EASTERN_TIME_ZONE = 'America/New_York';
    const utcGuess = new Date(Date.UTC(year, month - 1, day, hour, minute, 0));

    const partMap = new Intl.DateTimeFormat('en-US', {
      timeZone: EASTERN_TIME_ZONE,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    })
      .formatToParts(utcGuess)
      .reduce<Record<string, string>>((acc, part) => {
        if (part.type !== 'literal') acc[part.type] = part.value;
        return acc;
      }, {});

    const asUtc = Date.UTC(
      Number(partMap.year),
      Number(partMap.month) - 1,
      Number(partMap.day),
      Number(partMap.hour),
      Number(partMap.minute),
      Number(partMap.second),
    );
    const offsetMs = asUtc - utcGuess.getTime();
    const finalDate = new Date(utcGuess.getTime() - offsetMs);

    await onConfirm(finalDate);
  };

  // Reset defaults when dialog opens
  const handleOpenChange = (o: boolean) => {
    if (o) {
      setSelectedDate(defaultDate || todayStr);
      setSelectedTime(defaultTime);
    }
    onOpenChange(o);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CalendarClock className="w-5 h-5 text-primary" />
            {title}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <Label htmlFor="schedule-date">Date (US Eastern)</Label>
            <Input
              id="schedule-date"
              type="date"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              min={todayStr}
            />
          </div>

          <div>
            <Label>Time (US Eastern)</Label>
            <Select value={selectedTime} onValueChange={setSelectedTime}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="max-h-[200px]">
                {TIME_SLOTS.map((slot) => (
                  <SelectItem key={slot} value={slot}>
                    {slot} ET
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => onOpenChange(false)} disabled={loading}>
              Cancel
            </Button>
            <Button onClick={handleConfirm} disabled={loading || !selectedDate}>
              {loading ? (
                <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Scheduling...</>
              ) : (
                <><CalendarClock className="w-4 h-4 mr-2" />Confirm Schedule</>
              )}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};
