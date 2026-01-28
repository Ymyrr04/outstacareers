import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CalendarIcon, Send, Loader2, Link2, ExternalLink, Check } from "lucide-react";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { useCalendly } from "@/hooks/useCalendly";

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
  "09:00", "09:30", "10:00", "10:30", "11:00", "11:30",
  "12:00", "12:30", "13:00", "13:30", "14:00", "14:30",
  "15:00", "15:30", "16:00", "16:30", "17:00", "17:30",
  "18:00", "18:30", "19:00", "19:30", "20:00", "20:30",
  "21:00", "21:30", "22:00", "22:30", "23:00", "23:30"
];

export function InterviewInviteDialog({ open, onOpenChange, applicant }: InterviewInviteDialogProps) {
  const [date, setDate] = useState<Date>();
  const [time, setTime] = useState<string>("");
  const [zoomLink, setZoomLink] = useState("");
  const [interviewerName, setInterviewerName] = useState("");
  const [additionalNotes, setAdditionalNotes] = useState("");
  const [sending, setSending] = useState(false);
  const [useCalendlyScheduling, setUseCalendlyScheduling] = useState(false);
  const [selectedEventType, setSelectedEventType] = useState<string>("");
  const [generatingLink, setGeneratingLink] = useState(false);

  const { isConnected, user, eventTypes, connect, createSchedulingLink, loading: calendlyLoading } = useCalendly();

  const handleConnectCalendly = async () => {
    try {
      await connect();
    } catch (error) {
      toast({
        title: "Failed to connect",
        description: "Could not connect to Calendly. Please try again.",
        variant: "destructive",
      });
    }
  };

  const handleGenerateCalendlyLink = async () => {
    if (!selectedEventType) {
      toast({
        title: "Select event type",
        description: "Please select a Calendly event type first.",
        variant: "destructive",
      });
      return;
    }

    setGeneratingLink(true);
    try {
      const bookingUrl = await createSchedulingLink(selectedEventType);
      if (bookingUrl) {
        setZoomLink(bookingUrl);
        toast({
          title: "Scheduling link created",
          description: "The Calendly scheduling link has been added.",
        });
      }
    } catch (error) {
      toast({
        title: "Failed to create link",
        description: "Could not generate Calendly scheduling link.",
        variant: "destructive",
      });
    } finally {
      setGeneratingLink(false);
    }
  };

  const handleSend = async () => {
    if (!applicant || !zoomLink) {
      toast({
        title: "Missing information",
        description: "Please provide a meeting or scheduling link",
        variant: "destructive",
      });
      return;
    }

    // For Calendly scheduling links, date/time are optional since the candidate picks
    if (!useCalendlyScheduling && (!date || !time)) {
      toast({
        title: "Missing information",
        description: "Please fill in date and time for manual scheduling",
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
          interviewDate: date ? format(date, "EEEE, MMMM d, yyyy") : "To be scheduled",
          interviewTime: time || "Pick your preferred time",
          zoomLink: zoomLink,
          interviewerName: interviewerName || "Our Team",
          additionalNotes: additionalNotes,
          isCalendlyLink: useCalendlyScheduling,
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
      setUseCalendlyScheduling(false);
      setSelectedEventType("");
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
      <DialogContent className="sm:max-w-[500px] max-h-[90vh] overflow-y-auto">
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

          {/* Calendly Integration Section */}
          <div className="border rounded-lg p-4 space-y-3">
            <div className="flex items-center justify-between">
              <Label className="text-sm font-medium">Calendly Integration</Label>
              {isConnected ? (
                <span className="text-xs text-green-600 flex items-center gap-1">
                  <Check className="h-3 w-3" />
                  Connected as {user?.name}
                </span>
              ) : (
                <Button 
                  variant="outline" 
                  size="sm" 
                  onClick={handleConnectCalendly}
                  disabled={calendlyLoading}
                >
                  <Link2 className="h-4 w-4 mr-1" />
                  Connect Calendly
                </Button>
              )}
            </div>

            {isConnected && (
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    id="useCalendly"
                    checked={useCalendlyScheduling}
                    onChange={(e) => setUseCalendlyScheduling(e.target.checked)}
                    className="rounded border-gray-300"
                  />
                  <Label htmlFor="useCalendly" className="text-sm cursor-pointer">
                    Let candidate pick their time via Calendly
                  </Label>
                </div>

                {useCalendlyScheduling && (
                  <div className="space-y-2">
                    <Label className="text-sm">Event Type</Label>
                    <div className="flex gap-2">
                      <Select value={selectedEventType} onValueChange={setSelectedEventType}>
                        <SelectTrigger className="flex-1">
                          <SelectValue placeholder="Select event type" />
                        </SelectTrigger>
                        <SelectContent>
                          {eventTypes.map((et) => (
                            <SelectItem key={et.uri} value={et.uri}>
                              {et.name} ({et.duration} min)
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <Button 
                        variant="secondary" 
                        size="sm"
                        onClick={handleGenerateCalendlyLink}
                        disabled={generatingLink || !selectedEventType}
                      >
                        {generatingLink ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <ExternalLink className="h-4 w-4" />
                        )}
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Manual Scheduling - only show if not using Calendly */}
          {!useCalendlyScheduling && (
            <>
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
                      disabled={(date) => {
                        const today = new Date();
                        today.setHours(0, 0, 0, 0);
                        return date < today;
                      }}
                      initialFocus
                      className="pointer-events-auto"
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
            </>
          )}

          {/* Meeting Link */}
          <div className="space-y-2">
            <Label>{useCalendlyScheduling ? "Calendly Scheduling Link *" : "Zoom Meeting Link *"}</Label>
            <Input
              placeholder={useCalendlyScheduling ? "https://calendly.com/..." : "https://zoom.us/j/..."}
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
