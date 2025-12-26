import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { X, Loader2, CheckCircle, ExternalLink } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { z } from "zod";
import speedtestSample from "@/assets/speedtest-sample.png";

interface PreScreeningFormProps {
  job: {
    id: string;
    title: string;
    apply_url: string;
  };
  onClose: () => void;
}

const prescreenSchema = z.object({
  full_name: z.string().trim().min(1, "Full name is required").max(100, "Name must be less than 100 characters"),
  email: z.string().trim().email("Invalid email address").max(255, "Email must be less than 255 characters"),
  home_office: z.boolean().nullable().refine(val => val !== null, "Please select an option"),
  noise_canceling_headset: z.boolean().nullable().refine(val => val !== null, "Please select an option"),
  laptop_or_pc: z.boolean().nullable().refine(val => val !== null, "Please select an option"),
  good_internet: z.boolean().nullable().refine(val => val !== null, "Please select an option"),
  internet_speed: z.string().trim().min(1, "Speedtest result link is required").max(500, "Must be less than 500 characters"),
  power_backup: z.boolean().nullable().refine(val => val !== null, "Please select an option"),
  can_work_40_50: z.boolean().nullable().refine(val => val !== null, "Please select an option"),
  us_timezone_ok: z.boolean().nullable().refine(val => val !== null, "Please select an option"),
  start_availability: z.string().trim().min(1, "Start availability is required").max(200, "Must be less than 200 characters"),
  has_experience: z.boolean().nullable().refine(val => val !== null, "Please select an option"),
  currently_working: z.boolean().nullable().refine(val => val !== null, "Please select an option"),
  location: z.string().trim().min(1, "Location is required").max(200, "Must be less than 200 characters"),
});

type FormData = {
  full_name: string;
  email: string;
  home_office: boolean | null;
  noise_canceling_headset: boolean | null;
  laptop_or_pc: boolean | null;
  good_internet: boolean | null;
  internet_speed: string;
  power_backup: boolean | null;
  can_work_40_50: boolean | null;
  us_timezone_ok: boolean | null;
  start_availability: string;
  has_experience: boolean | null;
  currently_working: boolean | null;
  location: string;
};

const PreScreeningForm = ({ job, onClose }: PreScreeningFormProps) => {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [showSpeedtestSample, setShowSpeedtestSample] = useState(false);
  
  const [formData, setFormData] = useState<FormData>({
    full_name: "",
    email: "",
    home_office: null,
    noise_canceling_headset: null,
    laptop_or_pc: null,
    good_internet: null,
    internet_speed: "",
    power_backup: null,
    can_work_40_50: null,
    us_timezone_ok: null,
    start_availability: "",
    has_experience: null,
    currently_working: null,
    location: "",
  });

  const handleTextChange = (field: keyof FormData, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }));
    if (errors[field]) {
      setErrors(prev => ({ ...prev, [field]: "" }));
    }
  };

  const handleBooleanChange = (field: keyof FormData, value: boolean) => {
    setFormData(prev => ({ ...prev, [field]: value }));
    if (errors[field]) {
      setErrors(prev => ({ ...prev, [field]: "" }));
    }
  };

  const isFormComplete = () => {
    return (
      formData.full_name.trim() !== "" &&
      formData.email.trim() !== "" &&
      formData.internet_speed.trim() !== "" &&
      formData.start_availability.trim() !== "" &&
      formData.location.trim() !== "" &&
      formData.home_office !== null &&
      formData.noise_canceling_headset !== null &&
      formData.laptop_or_pc !== null &&
      formData.good_internet !== null &&
      formData.power_backup !== null &&
      formData.can_work_40_50 !== null &&
      formData.us_timezone_ok !== null &&
      formData.has_experience !== null &&
      formData.currently_working !== null
    );
  };

  const handleSubmit = async () => {
    setErrors({});
    
    const result = prescreenSchema.safeParse(formData);
    if (!result.success) {
      const fieldErrors: Record<string, string> = {};
      result.error.errors.forEach(err => {
        if (err.path[0]) {
          fieldErrors[err.path[0] as string] = err.message;
        }
      });
      setErrors(fieldErrors);
      return;
    }

    setIsSubmitting(true);

    try {
      const insertData = {
        full_name: formData.full_name,
        email: formData.email,
        home_office: formData.home_office!,
        noise_canceling_headset: formData.noise_canceling_headset!,
        laptop_or_pc: formData.laptop_or_pc!,
        good_internet: formData.good_internet!,
        internet_speed: formData.internet_speed,
        power_backup: formData.power_backup!,
        can_work_40_50: formData.can_work_40_50!,
        us_timezone_ok: formData.us_timezone_ok!,
        start_availability: formData.start_availability,
        has_experience: formData.has_experience!,
        currently_working: formData.currently_working!,
        location: formData.location,
        job_title: job.title,
        job_id: job.id,
        apply_url: job.apply_url,
        status: "new",
      };

      const { error } = await supabase.from("applicants_prescreen").insert(insertData);

      if (error) {
        console.error("Error submitting pre-screening form:", error);
        toast({
          title: "Submission failed",
          description: "There was an error submitting your application. Please try again.",
          variant: "destructive",
        });
        setIsSubmitting(false);
        return;
      }

      setIsSuccess(true);
      
      setTimeout(() => {
        window.open(job.apply_url, "_blank");
        onClose();
      }, 1500);
    } catch (err) {
      console.error("Unexpected error:", err);
      toast({
        title: "Submission failed",
        description: "An unexpected error occurred. Please try again.",
        variant: "destructive",
      });
      setIsSubmitting(false);
    }
  };

  const YesNoQuestion = ({ 
    label, 
    field, 
    value 
  }: { 
    label: string; 
    field: keyof FormData; 
    value: boolean | null;
  }) => (
    <div className="space-y-2">
      <Label className="text-sm font-medium">{label} *</Label>
      <RadioGroup
        value={value === null ? undefined : value ? "yes" : "no"}
        onValueChange={(val) => handleBooleanChange(field, val === "yes")}
        className="flex gap-4"
      >
        <div className="flex items-center space-x-2">
          <RadioGroupItem value="yes" id={`${field}-yes`} />
          <Label htmlFor={`${field}-yes`} className="font-normal cursor-pointer">Yes</Label>
        </div>
        <div className="flex items-center space-x-2">
          <RadioGroupItem value="no" id={`${field}-no`} />
          <Label htmlFor={`${field}-no`} className="font-normal cursor-pointer">No</Label>
        </div>
      </RadioGroup>
      {errors[field] && <p className="text-sm text-destructive">{errors[field]}</p>}
    </div>
  );

  if (isSuccess) {
    return (
      <>
        <div 
          className="fixed inset-0 z-40 bg-black/40 backdrop-blur-sm animate-in fade-in duration-200" 
          onClick={onClose}
        />
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="w-full max-w-md bg-background rounded-xl shadow-2xl border border-primary/20 p-8 text-center animate-in fade-in zoom-in-95 duration-300">
            <CheckCircle className="w-16 h-16 text-green-500 mx-auto mb-4" />
            <h3 className="text-xl font-bold text-foreground mb-2">Application Submitted!</h3>
            <p className="text-muted-foreground">Redirecting you to complete your application...</p>
          </div>
        </div>
      </>
    );
  }

  return (
    <>
      <div 
        className="fixed inset-0 z-40 bg-black/40 backdrop-blur-sm animate-in fade-in duration-200" 
        onClick={onClose}
      />
      
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 pointer-events-none">
        <div className="pointer-events-auto w-full max-w-lg max-h-[90vh] overflow-y-auto bg-background rounded-xl shadow-2xl border border-primary/20 animate-in fade-in slide-in-from-bottom-4 zoom-in-95 duration-300">
          <div className="sticky top-0 bg-background/95 backdrop-blur-sm border-b border-border px-6 py-4 flex items-start justify-between gap-4">
            <div>
              <h3 className="font-bold text-lg text-foreground">Pre-Screening Questions</h3>
              <p className="text-sm text-muted-foreground mt-1">{job.title}</p>
            </div>
            <button 
              onClick={onClose}
              className="flex-shrink-0 p-1 rounded-full hover:bg-muted transition-colors duration-200"
              aria-label="Close form"
            >
              <X className="w-5 h-5 text-muted-foreground hover:text-foreground transition-colors" />
            </button>
          </div>

          <div className="p-6 space-y-5">
            <div className="space-y-2">
              <Label htmlFor="full_name">Full Name *</Label>
              <Input
                id="full_name"
                value={formData.full_name}
                onChange={(e) => handleTextChange("full_name", e.target.value)}
                placeholder="Enter your full name"
                className={errors.full_name ? "border-destructive" : ""}
              />
              {errors.full_name && <p className="text-sm text-destructive">{errors.full_name}</p>}
            </div>

            <div className="space-y-2">
              <Label htmlFor="email">Email Address *</Label>
              <Input
                id="email"
                type="email"
                value={formData.email}
                onChange={(e) => handleTextChange("email", e.target.value)}
                placeholder="Enter your email address"
                className={errors.email ? "border-destructive" : ""}
              />
              {errors.email && <p className="text-sm text-destructive">{errors.email}</p>}
            </div>

            <YesNoQuestion 
              label="Do you have a home office setup?" 
              field="home_office" 
              value={formData.home_office} 
            />

            <YesNoQuestion 
              label="Do you have a noise-canceling headset?" 
              field="noise_canceling_headset" 
              value={formData.noise_canceling_headset} 
            />

            <YesNoQuestion 
              label="Do you have a fully functioning laptop or PC?" 
              field="laptop_or_pc" 
              value={formData.laptop_or_pc} 
            />

            <YesNoQuestion 
              label="Do you have a good quality internet connection?" 
              field="good_internet" 
              value={formData.good_internet} 
            />

            <div className="space-y-2">
              <Label htmlFor="internet_speed">
                Please run a speedtest on{" "}
                <a 
                  href="https://www.speedtest.net" 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="text-primary hover:underline inline-flex items-center gap-1"
                >
                  speedtest.net
                  <ExternalLink className="w-3 h-3" />
                </a>
                {" "}and share the result link *
              </Label>
              <Input
                id="internet_speed"
                value={formData.internet_speed}
                onChange={(e) => handleTextChange("internet_speed", e.target.value)}
                placeholder="e.g., https://www.speedtest.net/result/12345678"
                className={errors.internet_speed ? "border-destructive" : ""}
              />
              {errors.internet_speed && <p className="text-sm text-destructive">{errors.internet_speed}</p>}
              <button
                type="button"
                onClick={() => setShowSpeedtestSample(!showSpeedtestSample)}
                className="text-xs text-primary hover:underline mt-1"
              >
                {showSpeedtestSample ? "Hide sample" : "View sample"}
              </button>
              {showSpeedtestSample && (
                <img 
                  src={speedtestSample} 
                  alt="Speedtest result sample" 
                  className="rounded-md border border-border max-w-full h-auto mt-2"
                  style={{ maxHeight: "200px" }}
                />
              )}
            </div>

            <YesNoQuestion 
              label="Do you have a power generator or backup for power cuts?" 
              field="power_backup" 
              value={formData.power_backup} 
            />

            <YesNoQuestion 
              label="Are you willing to work 40–50 hours per week?" 
              field="can_work_40_50" 
              value={formData.can_work_40_50} 
            />

            <YesNoQuestion 
              label="Are you comfortable working US time zones?" 
              field="us_timezone_ok" 
              value={formData.us_timezone_ok} 
            />

            <div className="space-y-2">
              <Label htmlFor="start_availability">How soon can you start? *</Label>
              <Input
                id="start_availability"
                value={formData.start_availability}
                onChange={(e) => handleTextChange("start_availability", e.target.value)}
                placeholder="e.g., Immediately, 2 weeks notice"
                className={errors.start_availability ? "border-destructive" : ""}
              />
              {errors.start_availability && <p className="text-sm text-destructive">{errors.start_availability}</p>}
            </div>

            <YesNoQuestion 
              label="Do you have experience in a similar role?" 
              field="has_experience" 
              value={formData.has_experience} 
            />

            <YesNoQuestion 
              label="Are you currently working for another client or company?" 
              field="currently_working" 
              value={formData.currently_working} 
            />

            <div className="space-y-2">
              <Label htmlFor="location">Your current location (city, country) *</Label>
              <Input
                id="location"
                value={formData.location}
                onChange={(e) => handleTextChange("location", e.target.value)}
                placeholder="e.g., Manila, Philippines"
                className={errors.location ? "border-destructive" : ""}
              />
              {errors.location && <p className="text-sm text-destructive">{errors.location}</p>}
            </div>

            <div className="pt-4 border-t border-border">
              <Button
                onClick={handleSubmit}
                disabled={!isFormComplete() || isSubmitting}
                className="w-full"
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Submitting...
                  </>
                ) : (
                  "Proceed to Application"
                )}
              </Button>
              <p className="text-xs text-muted-foreground text-center mt-2">
                All fields marked with * are required
              </p>
            </div>
          </div>
        </div>
      </div>
    </>
  );
};

export default PreScreeningForm;