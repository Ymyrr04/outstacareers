import { useState, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Upload, Loader2, CheckCircle, AlertCircle, FileText, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { z } from "zod";
import { VoiceRecorder } from "./VoiceRecorder";
import { CountryCodeSelect } from "./CountryCodeSelect";

const talentPoolSchema = z.object({
  full_name: z.string().trim().min(1, "Full name is required").max(100),
  email: z.string().trim().email("Invalid email address").max(255),
  phone: z.string().trim().min(1, "Phone number is required").max(30),
  location: z.string().trim().min(1, "Location is required").max(200),
  desired_roles: z.string().trim().min(1, "Please tell us what roles you're interested in").max(500),
  us_timezone_ok: z.enum(["yes", "no"], { required_error: "Please select an option" }),
  remote_work_reason: z.string().trim().min(10, "Please provide at least a short answer (10+ characters)").max(500),
  culture_fit: z.enum(["structured", "problem_solver"], { required_error: "Please select an option" }),
  years_experience: z.string().min(1, "Please select your experience level"),
});

type FormState = {
  full_name: string;
  email: string;
  phone_country_code: string;
  phone: string;
  location: string;
  desired_roles: string;
  us_timezone_ok: string;
  remote_work_reason: string;
  culture_fit: string;
  years_experience: string;
  honeypot: string;
};

const EXPERIENCE_OPTIONS = [
  { value: "0-1", label: "Less than 1 year" },
  { value: "1-3", label: "1–3 years" },
  { value: "3-5", label: "3–5 years" },
  { value: "5-10", label: "5–10 years" },
  { value: "10+", label: "10+ years" },
];

const TalentPoolForm = () => {
  const [form, setForm] = useState<FormState>({
    full_name: "",
    email: "",
    phone_country_code: "+63",
    phone: "",
    location: "",
    desired_roles: "",
    us_timezone_ok: "",
    remote_work_reason: "",
    culture_fit: "",
    years_experience: "",
    honeypot: "",
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [cvFile, setCvFile] = useState<File | null>(null);
  const [voiceUrl, setVoiceUrl] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const updateField = (field: keyof FormState, value: string) => {
    setForm(prev => ({ ...prev, [field]: value }));
    if (errors[field]) {
      setErrors(prev => {
        const next = { ...prev };
        delete next[field];
        return next;
      });
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.type !== "application/pdf") {
      toast.error("Only PDF files are accepted");
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      toast.error("File must be under 10MB");
      return;
    }
    setCvFile(file);
    if (errors.cv) {
      setErrors(prev => { const n = { ...prev }; delete n.cv; return n; });
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    // Honeypot check
    if (form.honeypot) return;

    // Validate
    const result = talentPoolSchema.safeParse({
      full_name: form.full_name,
      email: form.email,
      phone: form.phone,
      location: form.location,
      desired_roles: form.desired_roles,
      us_timezone_ok: form.us_timezone_ok || undefined,
      remote_work_reason: form.remote_work_reason,
      culture_fit: form.culture_fit || undefined,
      years_experience: form.years_experience,
    });

    const newErrors: Record<string, string> = {};
    if (!result.success) {
      result.error.errors.forEach(err => {
        const field = err.path[0] as string;
        newErrors[field] = err.message;
      });
    }
    if (!cvFile) newErrors.cv = "Please upload your resume (PDF)";
    if (!voiceUrl) newErrors.voice = "Please record your voice introduction";

    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      // Scroll to first error
      const firstErrorEl = document.querySelector('[data-error="true"]');
      firstErrorEl?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      return;
    }

    setIsSubmitting(true);

    try {
      // Upload CV
      const fileExt = "pdf";
      const fileName = `talent-pool/${Date.now()}-${Math.random().toString(36).slice(2)}.${fileExt}`;
      const { error: uploadError } = await supabase.storage
        .from("cv-uploads")
        .upload(fileName, cvFile!, { contentType: "application/pdf" });

      if (uploadError) throw new Error("Failed to upload resume");

      const { data: urlData } = supabase.storage
        .from("cv-uploads")
        .getPublicUrl(fileName);

      const fullPhone = `${form.phone_country_code}${form.phone}`;
      const yearsNum = form.years_experience === "10+" ? 10 : parseInt(form.years_experience.split("-")[0]);

      // Build candidate profile from screening answers
      const candidateProfile = [
        `Culture: ${form.culture_fit === "structured" ? "Prefers clear instructions and stable tasks" : "Enjoys solving problems and improving processes"}`,
        `Remote work motivation: ${form.remote_work_reason}`,
      ].join("\n");

      // Insert into applicants_prescreen with Talent Pool status
      const { error: insertError } = await supabase
        .from("applicants_prescreen")
        .insert({
          full_name: form.full_name.trim(),
          email: form.email.trim().toLowerCase(),
          phone: fullPhone,
          location: form.location.trim(),
          job_title: form.desired_roles.trim(),
          status: "Talent Pool",
          apply_url: window.location.href,
          cv_file_url: urlData.publicUrl,
          voice_recording_url: voiceUrl,
          us_timezone_ok: form.us_timezone_ok === "yes",
          can_work_40_50: form.us_timezone_ok === "yes",
          start_availability: "Open / Flexible",
          has_experience: yearsNum >= 1,
          currently_working: false,
          home_office: true,
          noise_canceling_headset: true,
          laptop_or_pc: true,
          good_internet: true,
          power_backup: false,
          internet_speed: "Not provided",
          years_of_experience: yearsNum,
          candidate_profile: candidateProfile,
          job_source: "Talent Pool Sign-up",
          honeypot_field: form.honeypot || null,
        });

      if (insertError) throw insertError;

      // Trigger CV extraction
      try {
        await supabase.functions.invoke("extract-cv-with-vision", {
          body: { cvUrl: urlData.publicUrl, applicantEmail: form.email.trim().toLowerCase() },
        });
      } catch {
        // Non-blocking - extraction will happen async
      }

      setSubmitted(true);
    } catch (err: any) {
      console.error("Submission error:", err);
      toast.error(err.message || "Something went wrong. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  if (submitted) {
    return (
      <Card className="text-center py-12">
        <CardContent className="space-y-4">
          <CheckCircle className="w-16 h-16 text-primary mx-auto" />
          <h2 className="text-2xl font-bold text-foreground">Thank You for Applying!</h2>
          <p className="text-muted-foreground max-w-md mx-auto">
            We carefully review every application. If your background matches what our clients 
            are looking for, our recruitment team will reach out for the next step.
          </p>
          <p className="text-sm text-muted-foreground">
            We appreciate the time you invested in your application.
          </p>
        </CardContent>
      </Card>
    );
  }

  const fieldError = (field: string) => errors[field] ? (
    <p className="text-sm text-destructive flex items-center gap-1 mt-1" data-error="true">
      <AlertCircle className="w-3 h-3" /> {errors[field]}
    </p>
  ) : null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-2xl text-primary">Join Our Talent Pool</CardTitle>
        <p className="text-muted-foreground">
          Complete the form below to be considered for current and future remote positions with our U.S. clients.
        </p>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-8">
          {/* Honeypot */}
          <div className="hidden" aria-hidden="true">
            <input
              type="text"
              tabIndex={-1}
              autoComplete="off"
              value={form.honeypot}
              onChange={e => updateField("honeypot", e.target.value)}
            />
          </div>

          {/* Section 1: Personal Info */}
          <div className="space-y-4">
            <h3 className="text-lg font-semibold text-foreground border-b border-border pb-2">
              Personal Information
            </h3>
            <div className="grid sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="full_name">Full Name *</Label>
                <Input
                  id="full_name"
                  value={form.full_name}
                  onChange={e => updateField("full_name", e.target.value)}
                  placeholder="Juan Dela Cruz"
                />
                {fieldError("full_name")}
              </div>
              <div className="space-y-2">
                <Label htmlFor="email">Email Address *</Label>
                <Input
                  id="email"
                  type="email"
                  value={form.email}
                  onChange={e => updateField("email", e.target.value)}
                  placeholder="juan@email.com"
                />
                {fieldError("email")}
              </div>
            </div>
            <div className="grid sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="phone">Phone Number *</Label>
                <div className="flex gap-2">
                  <CountryCodeSelect
                    value={form.phone_country_code}
                    onChange={val => updateField("phone_country_code", val)}
                  />
                  <Input
                    id="phone"
                    type="tel"
                    value={form.phone}
                    onChange={e => updateField("phone", e.target.value)}
                    placeholder="9171234567"
                    className="flex-1"
                  />
                </div>
                {fieldError("phone")}
              </div>
              <div className="space-y-2">
                <Label htmlFor="location">Location (City, Country) *</Label>
                <Input
                  id="location"
                  value={form.location}
                  onChange={e => updateField("location", e.target.value)}
                  placeholder="Manila, Philippines"
                />
                {fieldError("location")}
              </div>
            </div>
          </div>

          {/* Section 2: Role & Experience */}
          <div className="space-y-4">
            <h3 className="text-lg font-semibold text-foreground border-b border-border pb-2">
              Role & Experience
            </h3>
            <div className="space-y-2">
              <Label htmlFor="desired_roles">What role(s) are you interested in? *</Label>
              <Input
                id="desired_roles"
                value={form.desired_roles}
                onChange={e => updateField("desired_roles", e.target.value)}
                placeholder="e.g. Virtual Assistant, Customer Support, Executive Assistant"
              />
              <p className="text-xs text-muted-foreground">You can list multiple roles separated by commas</p>
              {fieldError("desired_roles")}
            </div>
            <div className="space-y-2">
              <Label>Years of Relevant Experience *</Label>
              <Select value={form.years_experience} onValueChange={val => updateField("years_experience", val)}>
                <SelectTrigger>
                  <SelectValue placeholder="Select experience level" />
                </SelectTrigger>
                <SelectContent>
                  {EXPERIENCE_OPTIONS.map(opt => (
                    <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {fieldError("years_experience")}
            </div>
          </div>

          {/* Section 3: Commitment Check */}
          <div className="space-y-4">
            <h3 className="text-lg font-semibold text-foreground border-b border-border pb-2">
              Commitment Check
            </h3>
            <div className="space-y-3">
              <Label>Are you comfortable working U.S. business hours? *</Label>
              <RadioGroup
                value={form.us_timezone_ok}
                onValueChange={val => updateField("us_timezone_ok", val)}
                className="flex gap-6"
              >
                <div className="flex items-center gap-2">
                  <RadioGroupItem value="yes" id="tz-yes" />
                  <Label htmlFor="tz-yes" className="font-normal cursor-pointer">Yes</Label>
                </div>
                <div className="flex items-center gap-2">
                  <RadioGroupItem value="no" id="tz-no" />
                  <Label htmlFor="tz-no" className="font-normal cursor-pointer">No</Label>
                </div>
              </RadioGroup>
              {fieldError("us_timezone_ok")}
            </div>
          </div>

          {/* Section 4: Effort Barrier */}
          <div className="space-y-4">
            <h3 className="text-lg font-semibold text-foreground border-b border-border pb-2">
              About You
            </h3>
            <div className="space-y-2">
              <Label htmlFor="remote_work_reason">
                In one or two sentences, tell us why you enjoy remote work. *
              </Label>
              <Textarea
                id="remote_work_reason"
                value={form.remote_work_reason}
                onChange={e => updateField("remote_work_reason", e.target.value)}
                placeholder="Share what you appreciate about working remotely..."
                rows={3}
                maxLength={500}
              />
              <p className="text-xs text-muted-foreground text-right">{form.remote_work_reason.length}/500</p>
              {fieldError("remote_work_reason")}
            </div>
          </div>

          {/* Section 5: Culture Question */}
          <div className="space-y-4">
            <h3 className="text-lg font-semibold text-foreground border-b border-border pb-2">
              Work Style
            </h3>
            <div className="space-y-3">
              <Label>Which statement describes you best? *</Label>
              <RadioGroup
                value={form.culture_fit}
                onValueChange={val => updateField("culture_fit", val)}
                className="space-y-3"
              >
                <div
                  className={`flex items-start gap-3 p-4 rounded-lg border-2 transition-all cursor-pointer ${
                    form.culture_fit === "structured"
                      ? "border-primary bg-primary/5"
                      : "border-border hover:border-primary/50"
                  }`}
                  onClick={() => updateField("culture_fit", "structured")}
                >
                  <RadioGroupItem value="structured" id="culture-structured" className="mt-0.5" />
                  <Label htmlFor="culture-structured" className="font-normal cursor-pointer">
                    I prefer clear instructions and stable tasks
                  </Label>
                </div>
                <div
                  className={`flex items-start gap-3 p-4 rounded-lg border-2 transition-all cursor-pointer ${
                    form.culture_fit === "problem_solver"
                      ? "border-primary bg-primary/5"
                      : "border-border hover:border-primary/50"
                  }`}
                  onClick={() => updateField("culture_fit", "problem_solver")}
                >
                  <RadioGroupItem value="problem_solver" id="culture-solver" className="mt-0.5" />
                  <Label htmlFor="culture-solver" className="font-normal cursor-pointer">
                    I enjoy solving problems and improving processes
                  </Label>
                </div>
              </RadioGroup>
              {fieldError("culture_fit")}
            </div>
          </div>

          {/* Section 6: Voice Introduction */}
          <div className="space-y-4">
            <h3 className="text-lg font-semibold text-foreground border-b border-border pb-2">
              Voice Introduction
            </h3>
            <div className="space-y-3">
              <Label>Please record a 60-second introduction telling us: *</Label>
              <ul className="text-sm text-muted-foreground space-y-1 ml-4 list-disc">
                <li>Your professional background</li>
                <li>The type of work you enjoy</li>
                <li>The type of remote role you are looking for</li>
              </ul>
              <VoiceRecorder
                onRecordingComplete={url => {
                  setVoiceUrl(url);
                  if (errors.voice) {
                    setErrors(prev => { const n = { ...prev }; delete n.voice; return n; });
                  }
                }}
                maxDuration={120}
              />
              {voiceUrl && (
                <p className="text-sm text-primary flex items-center gap-1">
                  <CheckCircle className="w-4 h-4" /> Recording uploaded
                </p>
              )}
              {fieldError("voice")}
            </div>
          </div>

          {/* Section 7: Resume Upload (Last!) */}
          <div className="space-y-4">
            <h3 className="text-lg font-semibold text-foreground border-b border-border pb-2">
              Resume / CV
            </h3>
            <div className="space-y-2">
              <Label>Upload your resume *</Label>
              <p className="text-sm text-muted-foreground">
                <span className="font-bold text-primary">PDF format only</span> — max 10MB
              </p>
              <input
                ref={fileInputRef}
                type="file"
                accept=".pdf,application/pdf"
                onChange={handleFileChange}
                className="hidden"
              />
              {cvFile ? (
                <div className="flex items-center gap-3 p-4 bg-muted rounded-lg">
                  <FileText className="w-5 h-5 text-primary" />
                  <span className="text-sm text-foreground flex-1 truncate">{cvFile.name}</span>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => { setCvFile(null); if (fileInputRef.current) fileInputRef.current.value = ""; }}
                  >
                    <X className="w-4 h-4" />
                  </Button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="w-full border-2 border-dashed border-border rounded-lg p-8 text-center hover:bg-muted/50 transition-colors cursor-pointer"
                >
                  <Upload className="w-8 h-8 mx-auto text-muted-foreground mb-2" />
                  <p className="text-sm text-muted-foreground">Click to upload your resume</p>
                </button>
              )}
              {fieldError("cv")}
            </div>
          </div>

          {/* Submit */}
          <Button
            type="submit"
            className="w-full text-lg py-6"
            disabled={isSubmitting}
          >
            {isSubmitting ? (
              <>
                <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                Submitting...
              </>
            ) : (
              "Submit Application"
            )}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
};

export default TalentPoolForm;
