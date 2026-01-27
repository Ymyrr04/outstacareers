import { useState, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { X, Loader2, CheckCircle, ExternalLink, Upload, FileText, Clock, Mic } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { z } from "zod";
import speedtestSample from "@/assets/speedtest-sample.png";
import { InterviewSession } from "./interview/InterviewSession";
import { CountryCodeSelect } from "./CountryCodeSelect";

interface PreScreeningFormProps {
  job: {
    id: string;
    title: string;
    apply_url: string;
    description?: string | null;
    qualifications?: string[] | null;
    responsibilities?: string[] | null;
  };
  onClose: () => void;
  mode?: 'modal' | 'page';
}

const prescreenSchema = z.object({
  full_name: z.string().trim().min(1, "Full name is required").max(100, "Name must be less than 100 characters"),
  email: z.string().trim().email("Invalid email address").max(255, "Email must be less than 255 characters"),
  phone: z.string().trim().min(1, "Phone number is required").max(30, "Phone must be less than 30 characters"),
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
  job_source: z.string().trim().min(1, "Please select where you learned about this job"),
});

type FormData = {
  full_name: string;
  email: string;
  phone_country_code: string;
  phone: string;
  whatsapp_country_code: string;
  whatsapp: string;
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
  honeypot_field: string;
  job_source: string;
  job_source_other: string;
};

const JOB_SOURCE_OPTIONS = [
  'LinkedIn',
  'Facebook',
  'Referral',
  'Job Board (Indeed, Glassdoor, etc.)',
  'Google Search',
  'Company Website',
  'OnlineJobs.ph',
  'Other'
];

type Step = 'prescreening' | 'cv-upload' | 'interview' | 'submitting';

const PreScreeningForm = ({ job, onClose, mode = 'modal' }: PreScreeningFormProps) => {
  const isPageMode = mode === 'page';
  const [currentStep, setCurrentStep] = useState<Step>('prescreening');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isScoring, setIsScoring] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [showSpeedtestSample, setShowSpeedtestSample] = useState(false);
  
  // CV related state
  const [cvFile, setCvFile] = useState<File | null>(null);
  const [cvText, setCvText] = useState<string>("");
  const [cvFileUrl, setCvFileUrl] = useState<string>("");
  const [isExtractingText, setIsExtractingText] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  // Interview state
  const [interviewSessionId, setInterviewSessionId] = useState<string>("");
  const [applicantId, setApplicantId] = useState<string>("");
  
  const [formData, setFormData] = useState<FormData>({
    full_name: "",
    email: "",
    phone_country_code: "+63|Philippines",
    phone: "",
    whatsapp_country_code: "+63|Philippines",
    whatsapp: "",
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
    honeypot_field: "",
    job_source: "",
    job_source_other: "",
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

  const isPrescreeningComplete = () => {
    const jobSourceValid = formData.job_source.trim() !== "" && 
      (formData.job_source !== "Other" || formData.job_source_other.trim() !== "");
    
    return (
      formData.full_name.trim() !== "" &&
      formData.email.trim() !== "" &&
      formData.phone.trim() !== "" &&
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
      formData.currently_working !== null &&
      jobSourceValid
    );
  };

  const handlePrescreeningSubmit = () => {
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

    // Validate job_source_other if "Other" is selected
    if (formData.job_source === "Other" && !formData.job_source_other.trim()) {
      setErrors(prev => ({ ...prev, job_source_other: "Please specify where you found this job" }));
      return;
    }

    // Move to CV upload step
    setCurrentStep('cv-upload');
  };

  const extractTextFromFile = async (file: File): Promise<string> => {
    const arrayBuffer = await file.arrayBuffer();
    
    if (file.type === 'application/pdf') {
      // Use PDF.js for proper PDF text extraction
      try {
        // Import pdfjs-dist correctly for v3.x
        const pdfjs = await import('pdfjs-dist');
        
        // Set up worker using the legacy build for better compatibility
        pdfjs.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
        
        console.log('Loading PDF document...');
        const loadingTask = pdfjs.getDocument({ data: arrayBuffer });
        const pdf = await loadingTask.promise;
        
        console.log(`PDF loaded with ${pdf.numPages} pages`);
        let fullText = '';
        
        for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
          const page = await pdf.getPage(pageNum);
          const textContent = await page.getTextContent();
          const pageText = textContent.items
            .map((item: any) => item.str || '')
            .join(' ');
          fullText += pageText + '\n';
        }
        
        // Clean up the extracted text
        const cleanText = fullText
          .replace(/\0/g, '') // Remove null bytes
          .replace(/\s+/g, ' ')
          .trim();
        
        console.log(`Extracted ${cleanText.length} characters from PDF`);
        
        if (cleanText.length > 50) {
          return cleanText;
        } else {
          console.warn('PDF extraction returned minimal text, PDF may be image-based');
          return 'PDF appears to be image-based. Please ensure your CV contains selectable text for AI processing.';
        }
      } catch (pdfError) {
        console.error('PDF.js extraction failed:', pdfError);
        return 'Unable to extract text from PDF. Please upload a text-based PDF or DOCX file.';
      }
    } else if (file.type === 'application/msword' || 
               file.type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') {
      // For DOC/DOCX files - basic extraction
      const text = await file.text();
      const cleanText = text
        .replace(/[^\x20-\x7E\n\r\t]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
      return cleanText || 'Document content extracted - please verify manually';
    } else {
      // Plain text files
      return await file.text();
    }
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate file type
    const allowedTypes = [
      'application/pdf',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    ];
    
    if (!allowedTypes.includes(file.type)) {
      toast({
        title: "Invalid file type",
        description: "Please upload a PDF or DOC/DOCX file.",
        variant: "destructive",
      });
      return;
    }

    // Validate file size (max 10MB)
    if (file.size > 10 * 1024 * 1024) {
      toast({
        title: "File too large",
        description: "Please upload a file smaller than 10MB.",
        variant: "destructive",
      });
      return;
    }

    setCvFile(file);
    setErrors(prev => ({ ...prev, cv: "" }));
    setCvText(""); // Reset text while extracting
    setIsExtractingText(true);

    try {
      const text = await extractTextFromFile(file);
      setCvText(text);
      console.log('CV text extraction complete, length:', text.length);
    } catch (error) {
      console.error('Error extracting text:', error);
      setCvText('Unable to extract text automatically');
    } finally {
      setIsExtractingText(false);
    }
  };

  const handleCvSubmit = async () => {
    if (!cvFile) {
      setErrors(prev => ({ ...prev, cv: "Please upload your CV" }));
      return;
    }

    if (isExtractingText) {
      toast({
        title: "Please wait",
        description: "Still extracting text from your CV...",
      });
      return;
    }

    if (!cvText || cvText.length < 50) {
      console.warn('CV text extraction may have failed, proceeding anyway with what we have');
    }

    console.log('Submitting with CV text length:', cvText.length);

    setIsScoring(true);

    try {
      // Upload CV to storage
      const fileExt = cvFile.name.split('.').pop();
      const fileName = `${Date.now()}-${Math.random().toString(36).substring(7)}.${fileExt}`;
      const filePath = `applications/${fileName}`;

      console.log('Uploading CV to storage...', { fileName, filePath });

      const { data: uploadData, error: uploadError } = await supabase.storage
        .from('cv-uploads')
        .upload(filePath, cvFile);

      if (uploadError) {
        console.error('CV upload error:', uploadError);
        toast({
          title: "Upload failed",
          description: uploadError.message || "Failed to upload your CV. Please try again.",
          variant: "destructive",
        });
        setIsScoring(false);
        return;
      }

      console.log('CV uploaded successfully:', uploadData);
      setCvFileUrl(filePath);

      // Submit application first to create applicant record
      setCurrentStep('submitting');
      
      // Format phone with country code
      const phoneCountryCode = formData.phone_country_code.split('|')[0] || '+63';
      // Remove leading 0 for Philippine numbers (+63)
      let phoneNumber = formData.phone.trim();
      if (phoneCountryCode === '+63' && phoneNumber.startsWith('0')) {
        phoneNumber = phoneNumber.substring(1);
      }
      const formattedPhone = `${phoneCountryCode} ${phoneNumber}`;
      
      // Format WhatsApp if provided
      let formattedWhatsapp = null;
      if (formData.whatsapp.trim()) {
        const whatsappCountryCode = formData.whatsapp_country_code.split('|')[0] || '+63';
        // Remove leading 0 for Philippine numbers (+63)
        let whatsappNumber = formData.whatsapp.trim();
        if (whatsappCountryCode === '+63' && whatsappNumber.startsWith('0')) {
          whatsappNumber = whatsappNumber.substring(1);
        }
        formattedWhatsapp = `${whatsappCountryCode} ${whatsappNumber}`;
      }
      
      const response = await supabase.functions.invoke('submit-application', {
        body: {
          full_name: formData.full_name,
          email: formData.email,
          phone: formattedPhone,
          whatsapp: formattedWhatsapp,
          home_office: formData.home_office,
          noise_canceling_headset: formData.noise_canceling_headset,
          laptop_or_pc: formData.laptop_or_pc,
          good_internet: formData.good_internet,
          internet_speed: formData.internet_speed,
          power_backup: formData.power_backup,
          can_work_40_50: formData.can_work_40_50,
          us_timezone_ok: formData.us_timezone_ok,
          start_availability: formData.start_availability,
          has_experience: formData.has_experience,
          currently_working: formData.currently_working,
          location: formData.location,
          job_title: job.title,
          job_id: job.id,
          apply_url: job.apply_url,
          honeypot_field: formData.honeypot_field,
          cv_file_url: filePath,
          cv_text: cvText,
          vocaroo_link: null,
          voice_recording_url: null,
          job_source: formData.job_source === "Other" && formData.job_source_other.trim() 
            ? `Other: ${formData.job_source_other.trim()}` 
            : formData.job_source,
        },
      });

      if (response.error || response.data?.error) {
        throw new Error(response.data?.error || response.error?.message || 'Failed to submit application');
      }

      const newApplicantId = response.data?.applicant_id;
      if (!newApplicantId) {
        throw new Error('No applicant ID returned');
      }
      
      console.log('Application submitted, applicant ID:', newApplicantId);
      setApplicantId(newApplicantId);

      // Create interview session with retry logic
      let sessionData = null;
      let sessionError = null;
      const maxRetries = 3;
      
      for (let attempt = 1; attempt <= maxRetries; attempt++) {
        console.log(`Creating interview session (attempt ${attempt}/${maxRetries})...`);
        
        const result = await supabase
          .from('interview_sessions')
          .insert({
            applicant_id: newApplicantId,
            job_id: job.id,
            status: 'in_progress'
          })
          .select('id')
          .single();
        
        if (!result.error) {
          sessionData = result.data;
          sessionError = null;
          console.log('Interview session created successfully:', sessionData.id);
          break;
        }
        
        sessionError = result.error;
        console.error(`Failed to create interview session (attempt ${attempt}):`, result.error);
        
        if (attempt < maxRetries) {
          // Wait before retry with exponential backoff
          await new Promise(resolve => setTimeout(resolve, 1000 * attempt));
        }
      }

      if (sessionError || !sessionData) {
        console.error('Failed to create interview session after all retries:', sessionError);
        toast({
          title: "Application Submitted",
          description: "Your application has been received and will be manually reviewed by our recruitment team.",
          className: "bg-primary text-primary-foreground border-primary",
        });
        // Still close the form since application was submitted
        setIsSuccess(true);
        setTimeout(() => onClose(), 3000);
        return;
      }

      setInterviewSessionId(sessionData.id);
      setCurrentStep('interview');
    } catch (error) {
      console.error('CV submission error:', error);
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "An unexpected error occurred. Please try again.",
        variant: "destructive",
      });
      setCurrentStep('cv-upload');
    } finally {
      setIsScoring(false);
    }
  };

  const handleInterviewComplete = () => {
    setIsSuccess(true);
    setTimeout(() => {
      onClose();
    }, 2000);
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
      <Label className="text-base font-medium">{label} *</Label>
      <RadioGroup
        value={value === null ? undefined : value ? "yes" : "no"}
        onValueChange={(val) => handleBooleanChange(field, val === "yes")}
        className="flex gap-6"
      >
        <div className="flex items-center space-x-2">
          <RadioGroupItem value="yes" id={`${field}-yes`} className="h-5 w-5" />
          <Label htmlFor={`${field}-yes`} className="font-normal cursor-pointer text-base">Yes</Label>
        </div>
        <div className="flex items-center space-x-2">
          <RadioGroupItem value="no" id={`${field}-no`} className="h-5 w-5" />
          <Label htmlFor={`${field}-no`} className="font-normal cursor-pointer text-base">No</Label>
        </div>
      </RadioGroup>
      {errors[field] && <p className="text-sm text-destructive">{errors[field]}</p>}
    </div>
  );

  const StepIndicator = () => (
    <div className="flex items-center justify-center gap-2 mb-4">
      <div className={`w-3 h-3 rounded-full ${currentStep === 'prescreening' ? 'bg-primary' : 'bg-primary/30'}`} />
      <div className="w-8 h-0.5 bg-border" />
      <div className={`w-3 h-3 rounded-full ${currentStep === 'cv-upload' || currentStep === 'submitting' ? 'bg-primary' : currentStep === 'interview' ? 'bg-primary/30' : 'bg-muted'}`} />
      <div className="w-8 h-0.5 bg-border" />
      <div className={`w-3 h-3 rounded-full ${currentStep === 'interview' ? 'bg-primary' : 'bg-muted'}`} />
    </div>
  );

  if (isSuccess) {
    if (isPageMode) {
      return (
        <div className="p-8 text-center">
          <CheckCircle className="w-16 h-16 text-green-500 mx-auto mb-4" />
          <h3 className="text-2xl font-bold text-foreground mb-2">Application Submitted!</h3>
          <p className="text-lg text-muted-foreground">Thank you for completing your application!</p>
        </div>
      );
    }
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

  // Form content (shared between page and modal modes)
  const formContent = (
    <>
      {/* Disclaimer for interview step */}
      {currentStep === 'interview' && (
        <div className="mb-4 p-3 bg-muted/50 rounded-lg border border-border">
          <div className="flex items-center gap-2 mb-1">
            <Clock className="w-4 h-4 text-primary" />
            <p className="text-sm font-medium text-foreground">Interview Assessment (10-15 minutes)</p>
          </div>
          <p className="text-sm text-muted-foreground leading-relaxed">
            You'll answer <strong>5 voice questions</strong>, <strong>5 written questions</strong>, and <strong>5 multiple-choice questions</strong>. This assessment helps us evaluate your experience, communication skills, and fit for the role.
          </p>
          <p className="text-sm text-muted-foreground leading-relaxed mt-1">
            Your responses are supported by AI for efficiency but will be reviewed by a human recruiter. Answers that appear AI-generated may be flagged.
          </p>
        </div>
      )}
      <StepIndicator />

      {/* Step 1: Pre-screening Questions */}
      {currentStep === 'prescreening' && (
        <div className="space-y-6">
          {/* Important Interview Notice */}
          <div className="p-4 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-lg">
            <div className="flex items-start gap-3">
              <Mic className="w-5 h-5 text-amber-600 dark:text-amber-400 mt-0.5 shrink-0" />
              <div>
                <p className="font-semibold text-amber-800 dark:text-amber-200 mb-1">
                  Important: Interview Assessment Ahead
                </p>
                <p className="text-sm text-amber-700 dark:text-amber-300 leading-relaxed">
                  After submitting this form, you will complete a <strong>10-15 minute interview assessment</strong> that includes voice recordings, written responses, and multiple-choice questions.
                </p>
                <p className="text-sm text-amber-700 dark:text-amber-300 leading-relaxed mt-2">
                  <strong>Please prepare:</strong>
                </p>
                <ul className="text-sm text-amber-700 dark:text-amber-300 list-disc list-inside mt-1 space-y-1">
                  <li>Find a <strong>quiet environment</strong> with minimal background noise</li>
                  <li>Have your <strong>headset or microphone ready</strong></li>
                  <li>Set aside <strong>15-20 minutes</strong> of uninterrupted time</li>
                </ul>
              </div>
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="full_name" className="text-base">Full Name *</Label>
            <Input
              id="full_name"
              value={formData.full_name}
              onChange={(e) => handleTextChange("full_name", e.target.value)}
              placeholder="Enter your full name"
              className={`text-base h-11 ${errors.full_name ? "border-destructive" : ""}`}
            />
            {errors.full_name && <p className="text-sm text-destructive">{errors.full_name}</p>}
          </div>

          <div className="space-y-2">
            <Label htmlFor="email" className="text-base">Email Address *</Label>
            <Input
              id="email"
              type="email"
              value={formData.email}
              onChange={(e) => handleTextChange("email", e.target.value)}
              placeholder="Enter your email address"
              className={`text-base h-11 ${errors.email ? "border-destructive" : ""}`}
            />
            {errors.email && <p className="text-sm text-destructive">{errors.email}</p>}
          </div>

          <div className="space-y-2">
            <Label htmlFor="phone" className="text-base">Phone Number *</Label>
            <div className="flex gap-2">
              <CountryCodeSelect
                value={formData.phone_country_code}
                onChange={(value) => handleTextChange("phone_country_code", value)}
              />
              <Input
                id="phone"
                type="tel"
                value={formData.phone}
                onChange={(e) => handleTextChange("phone", e.target.value)}
                placeholder="Enter phone number"
                className={`flex-1 text-base h-11 ${errors.phone ? "border-destructive" : ""}`}
              />
            </div>
            {errors.phone && <p className="text-sm text-destructive">{errors.phone}</p>}
          </div>

          <div className="space-y-2">
            <Label htmlFor="whatsapp" className="text-base">
              WhatsApp Number <span className="text-muted-foreground text-sm">(Optional)</span>
            </Label>
            <div className="flex gap-2">
              <CountryCodeSelect
                value={formData.whatsapp_country_code}
                onChange={(value) => handleTextChange("whatsapp_country_code", value)}
              />
              <Input
                id="whatsapp"
                type="tel"
                value={formData.whatsapp}
                onChange={(e) => handleTextChange("whatsapp", e.target.value)}
                placeholder="Enter WhatsApp number"
                className="flex-1 text-base h-11"
              />
            </div>
            <p className="text-sm text-muted-foreground">Leave blank if same as phone number</p>
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
            <Label htmlFor="internet_speed" className="text-base">
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
              className={`text-base h-11 ${errors.internet_speed ? "border-destructive" : ""}`}
            />
            {errors.internet_speed && <p className="text-sm text-destructive">{errors.internet_speed}</p>}
            <button
              type="button"
              onClick={() => setShowSpeedtestSample(true)}
              className="text-sm text-primary hover:underline mt-1"
            >
              View sample
            </button>
          </div>

          {/* Speedtest Sample Modal */}
          {showSpeedtestSample && (
            <>
              <div 
                className="fixed inset-0 z-[60] bg-black/60 backdrop-blur-sm animate-fade-in"
                onClick={() => setShowSpeedtestSample(false)}
              />
              <div className="fixed inset-0 z-[70] flex items-center justify-center p-4 pointer-events-none">
                <div className="pointer-events-auto relative animate-scale-in">
                  <button
                    type="button"
                    onClick={() => setShowSpeedtestSample(false)}
                    className="absolute -top-3 -right-3 bg-background rounded-full p-1.5 shadow-lg border border-border hover:bg-muted transition-colors z-10"
                    aria-label="Close"
                  >
                    <X className="w-4 h-4" />
                  </button>
                  <img 
                    src={speedtestSample} 
                    alt="Speedtest result sample" 
                    className="rounded-lg shadow-2xl max-w-[90vw] max-h-[80vh] object-contain"
                  />
                  <p className="text-center text-sm text-muted-foreground mt-3 bg-background/80 backdrop-blur-sm rounded-md py-2 px-4">
                    Copy the result link from speedtest.net after running your test
                  </p>
                </div>
              </div>
            </>
          )}

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
            <Label htmlFor="start_availability" className="text-base">How soon can you start? *</Label>
            <Input
              id="start_availability"
              value={formData.start_availability}
              onChange={(e) => handleTextChange("start_availability", e.target.value)}
              placeholder="e.g., Immediately, 2 weeks notice"
              className={`text-base h-11 ${errors.start_availability ? "border-destructive" : ""}`}
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
            <Label htmlFor="location" className="text-base">Your current location (city, country) *</Label>
            <Input
              id="location"
              value={formData.location}
              onChange={(e) => handleTextChange("location", e.target.value)}
              placeholder="e.g., Manila, Philippines"
              className={`text-base h-11 ${errors.location ? "border-destructive" : ""}`}
            />
            {errors.location && <p className="text-sm text-destructive">{errors.location}</p>}
          </div>

          <div className="space-y-2">
            <Label htmlFor="job_source" className="text-base">Where did you learn about this job opportunity? *</Label>
            <Select
              value={formData.job_source}
              onValueChange={(value) => {
                handleTextChange("job_source", value);
                if (value !== "Other") {
                  handleTextChange("job_source_other", "");
                }
              }}
            >
              <SelectTrigger className={`text-base h-11 ${errors.job_source ? "border-destructive" : ""}`}>
                <SelectValue placeholder="Select an option" />
              </SelectTrigger>
              <SelectContent>
                {JOB_SOURCE_OPTIONS.map((source) => (
                  <SelectItem key={source} value={source} className="text-base">
                    {source}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {errors.job_source && <p className="text-sm text-destructive">{errors.job_source}</p>}
            
            {formData.job_source === "Other" && (
              <div className="mt-2">
                <Input
                  id="job_source_other"
                  value={formData.job_source_other}
                  onChange={(e) => handleTextChange("job_source_other", e.target.value)}
                  placeholder="Please specify where you found this job"
                  className={`text-base h-11 ${errors.job_source_other ? "border-destructive" : ""}`}
                />
                {errors.job_source_other && <p className="text-sm text-destructive">{errors.job_source_other}</p>}
              </div>
            )}
          </div>

          <div 
            aria-hidden="true" 
            style={{ 
              position: 'absolute', 
              left: '-9999px', 
              top: '-9999px',
              opacity: 0, 
              height: 0, 
              width: 0, 
              overflow: 'hidden',
              pointerEvents: 'none' 
            }}
          >
            <label htmlFor="fax_number_do_not_fill">Leave this empty</label>
            <input
              type="text"
              id="fax_number_do_not_fill"
              name="fax_number_do_not_fill"
              value={formData.honeypot_field}
              onChange={(e) => handleTextChange("honeypot_field", e.target.value)}
              autoComplete="new-password"
              tabIndex={-1}
            />
          </div>

          <div className="pt-4 border-t border-border">
            <Button
              onClick={handlePrescreeningSubmit}
              disabled={!isPrescreeningComplete()}
              className="w-full"
            >
              Continue
            </Button>
            <p className="text-xs text-muted-foreground text-center mt-2">
              All fields marked with * are required
            </p>
          </div>
        </div>
      )}

      {/* Step 2: CV Upload */}
      {currentStep === 'cv-upload' && (
        <div className="space-y-6">
          <div className="text-center mb-6">
            <FileText className="w-14 h-14 text-primary mx-auto mb-3" />
            <h4 className="font-semibold text-xl">Upload Your CV</h4>
            <p className="text-base text-muted-foreground mt-1">
              Please upload your CV in PDF or DOC/DOCX format
            </p>
          </div>

          {/* Interview notice */}
          <div className="p-4 bg-primary/10 rounded-lg border border-primary/20">
            <div className="flex items-start gap-3">
              <Mic className="w-6 h-6 text-primary flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-base font-medium text-foreground">Next Step: Candidate Assessment</p>
                <p className="text-base text-muted-foreground mt-1">
                  After uploading your CV, you'll complete a short interview assessment with voice, written, and multiple-choice questions. This takes approximately <strong>10-15 minutes</strong>.
                </p>
              </div>
            </div>
          </div>

          <div 
            className={`border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors ${
              cvFile ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/50'
            } ${errors.cv ? 'border-destructive' : ''}`}
            onClick={() => fileInputRef.current?.click()}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept=".pdf,.doc,.docx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
              onChange={handleFileChange}
              className="hidden"
            />
            
            {cvFile ? (
              <div className="space-y-2">
                <CheckCircle className="w-12 h-12 text-green-500 mx-auto" />
                <p className="font-medium text-lg text-foreground">{cvFile.name}</p>
                <p className="text-base text-muted-foreground">
                  {(cvFile.size / 1024 / 1024).toFixed(2)} MB
                </p>
                <p className="text-sm text-primary">Click to change file</p>
              </div>
            ) : (
              <div className="space-y-2">
                <Upload className="w-12 h-12 text-muted-foreground mx-auto" />
                <p className="font-medium text-lg text-foreground">Click to upload your CV</p>
                <p className="text-base text-muted-foreground">PDF, DOC, or DOCX (max 10MB)</p>
              </div>
            )}
          </div>
          {errors.cv && <p className="text-sm text-destructive">{errors.cv}</p>}

          <div className="pt-4 border-t border-border flex gap-3">
            <Button
              variant="outline"
              onClick={() => setCurrentStep('prescreening')}
              className="flex-1"
              disabled={isScoring}
            >
              Back
            </Button>
            <Button
              onClick={handleCvSubmit}
              disabled={!cvFile || isScoring || isExtractingText}
              className="flex-1"
            >
              {isScoring ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Analyzing CV...
                </>
              ) : isExtractingText ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Extracting text...
                </>
              ) : (
                "Continue"
              )}
            </Button>
          </div>
        </div>
      )}

      {/* Step 3: Submitting */}
      {currentStep === 'submitting' && (
        <div className="text-center py-12">
          <Loader2 className="w-12 h-12 animate-spin mx-auto text-primary mb-4" />
          <h4 className="font-semibold text-lg mb-2">Saving Your Application</h4>
          <p className="text-sm text-muted-foreground">
            Please wait while we process your information...
          </p>
        </div>
      )}

      {/* Step 4: AI Interview */}
      {currentStep === 'interview' && interviewSessionId && (
        <InterviewSession
          sessionId={interviewSessionId}
          jobId={job.id}
          jobTitle={job.title}
          jobDescription={job.description || null}
          qualifications={job.qualifications || null}
          responsibilities={job.responsibilities || null}
          cvText={cvText}
          applicantName={formData.full_name}
          onComplete={handleInterviewComplete}
          onBack={() => setCurrentStep('cv-upload')}
        />
      )}
    </>
  );

  // Page mode rendering
  if (isPageMode) {
    return (
      <div className="w-full">
        <div className="border-b border-border px-6 py-4">
          <h3 className="font-bold text-lg text-foreground">
            {currentStep === 'prescreening' && 'Pre-Screening Questions'}
            {currentStep === 'cv-upload' && 'Upload Your CV'}
            {currentStep === 'submitting' && 'Processing...'}
            {currentStep === 'interview' && 'Candidate Assessment'}
          </h3>
          <p className="text-sm text-muted-foreground mt-1">{job.title}</p>
        </div>
        <div className="p-6">
          {formContent}
        </div>
      </div>
    );
  }

  // Modal mode rendering
  return (
    <>
      <div 
        className="fixed inset-0 z-40 bg-black/40 backdrop-blur-sm animate-in fade-in duration-200" 
        onClick={currentStep === 'prescreening' ? onClose : undefined}
      />
      
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 pointer-events-none">
        <div className="pointer-events-auto w-full max-w-lg max-h-[90vh] overflow-y-auto bg-background rounded-xl shadow-2xl border border-primary/20 animate-in fade-in slide-in-from-bottom-4 zoom-in-95 duration-300">
          <div className="sticky top-0 bg-background/95 backdrop-blur-sm border-b border-border px-6 py-4 flex items-start justify-between gap-4">
            <div>
              <h3 className="font-bold text-lg text-foreground">
                {currentStep === 'prescreening' && 'Pre-Screening Questions'}
                {currentStep === 'cv-upload' && 'Upload Your CV'}
                {currentStep === 'submitting' && 'Processing...'}
                {currentStep === 'interview' && 'Candidate Assessment'}
              </h3>
              <p className="text-sm text-muted-foreground mt-1">{job.title}</p>
            </div>
            {currentStep !== 'interview' && (
              <button 
                onClick={onClose}
                className="flex-shrink-0 p-1 rounded-full hover:bg-muted transition-colors duration-200"
                aria-label="Close form"
              >
                <X className="w-5 h-5 text-muted-foreground hover:text-foreground transition-colors" />
              </button>
            )}
          </div>

          <div className="p-6">
            {formContent}
          </div>
        </div>
      </div>
    </>
  );
};

export default PreScreeningForm;
