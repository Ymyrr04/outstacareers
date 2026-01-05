import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CalendarIcon, Send, Loader2 } from "lucide-react";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";

interface InterviewInviteDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  applicant: {
    full_name: string;
    email: string;
    job_title: string;
  } | null;
}

const timeSlots = [
  "09:00 AM", "09:30 AM", "10:00 AM", "10:30 AM", "11:00 AM", "11:30 AM",
  "12:00 PM", "12:30 PM", "01:00 PM", "01:30 PM", "02:00 PM", "02:30 PM",
  "03:00 PM", "03:30 PM", "04:00 PM", "04:30 PM", "05:00 PM", "05:30 PM",
  "06:00 PM", "06:30 PM", "07:00 PM", "07:30 PM", "08:00 PM"
];

export function InterviewInviteDialog({ open, onOpenChange, applicant }: InterviewInviteDialogProps) {
  const [date, setDate] = useState<Date>();
  const [time, setTime] = useState<string>("");
  const [zoomLink, setZoomLink] = useState("");
  const [interviewerName, setInterviewerName] = useState("");
  const [additionalNotes, setAdditionalNotes] = useState("");
  const [sending, setSending] = useState(false);

  const handleSend = async () => {
    if (!applicant || !date || !time || !zoomLink) {
      toast({
        title: "Missing information",
        description: "Please fill in all required fields",
        variant: "destructive",
      });
      return;
    }

    setSending(true);

    try {
      const { data, error } = await supabase.functions.invoke("send-interview-invite", {
        body: {
          to: applicant.email,
          candidateName: applicant.full_name,
          jobTitle: applicant.job_title,
          interviewDate: format(date, "EEEE, MMMM d, yyyy"),
          interviewTime: time,
          zoomLink: zoomLink,
          interviewerName: interviewerName || "Our Team",
          additionalNotes: additionalNotes,
        },
      });

      if (error) throw error;

      toast({
        title: "Interview invite sent!",
        description: `Email sent to ${applicant.email}`,
      });

      // Reset form and close
      setDate(undefined);
      setTime("");
      setZoomLink("");
      setInterviewerName("");
      setAdditionalNotes("");
      onOpenChange(false);
    } catch (error: any) {
      console.error("Error sending invite:", error);
      toast({
        title: "Failed to send invite",
        description: error.message || "Please try again",
        variant: "destructive",
      });
    } finally {
      setSending(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CalendarIcon className="h-5 w-5 text-primary" />
            Send Interview Invite
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Candidate Info */}
          <div className="bg-muted/50 rounded-lg p-3">
            <p className="text-sm text-muted-foreground">Sending to:</p>
            <p className="font-medium">{applicant?.full_name}</p>
            <p className="text-sm text-muted-foreground">{applicant?.email}</p>
            <p className="text-xs text-primary mt-1">{applicant?.job_title}</p>
          </div>

          {/* Date Picker */}
          <div className="space-y-2">
            <Label>Interview Date *</Label>
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  className={cn(
                    "w-full justify-start text-left font-normal",
                    !date && "text-muted-foreground"
                  )}
                >
                  <CalendarIcon className="mr-2 h-4 w-4" />
                  {date ? format(date, "PPP") : "Select date"}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar
                  mode="single"
                  selected={date}
                  onSelect={setDate}
                  disabled={(date) => date < new Date()}
                  initialFocus
                />
              </PopoverContent>
            </Popover>
          </div>

          {/* Time Picker */}
          <div className="space-y-2">
            <Label>Interview Time *</Label>
            <Select value={time} onValueChange={setTime}>
              <SelectTrigger>
                <SelectValue placeholder="Select time" />
              </SelectTrigger>
              <SelectContent>
                {timeSlots.map((slot) => (
                  <SelectItem key={slot} value={slot}>
                    {slot}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Zoom Link */}
          <div className="space-y-2">
            <Label>Zoom Meeting Link *</Label>
            <Input
              placeholder="https://zoom.us/j/..."
              value={zoomLink}
              onChange={(e) => setZoomLink(e.target.value)}
            />
          </div>

          {/* Interviewer Name */}
          <div className="space-y-2">
            <Label>Interviewer Name</Label>
            <Input
              placeholder="e.g., John Smith"
              value={interviewerName}
              onChange={(e) => setInterviewerName(e.target.value)}
            />
          </div>

          {/* Additional Notes */}
          <div className="space-y-2">
            <Label>Additional Notes</Label>
            <Textarea
              placeholder="Any additional instructions or notes for the candidate..."
              value={additionalNotes}
              onChange={(e) => setAdditionalNotes(e.target.value)}
              rows={3}
            />
          </div>
        </div>

        <div className="flex justify-end gap-3">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSend} disabled={sending}>
            {sending ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Sending...
              </>
            ) : (
              <>
                <Send className="mr-2 h-4 w-4" />
                Send Invite
              </>
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
