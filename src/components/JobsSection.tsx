import { useState, useEffect, useRef } from "react";
import { getErrorMessageSync } from "@/lib/errors";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { MapPin, Eye, Link2, Check } from "lucide-react";
import { generateJobUrl } from "@/lib/slugify";
import { toast } from "sonner";
import { useJobs, Job } from "@/hooks/useJobs";
import { useAnalytics } from "@/hooks/useAnalytics";
// Fixed conversion values for Philippines
const USD_TO_PHP_RATE = 56;
const WEEKS_PER_MONTH = 4;
const MIN_HOURS_PER_WEEK = 40;
const MAX_HOURS_PER_WEEK = 50;

// Helper function to parse USD hourly rate
const parseUsdHourlyRate = (rate: string): number | null => {
  // Skip if already in PHP
  if (rate.startsWith('₱')) return null;
  
  const match = rate.match(/\$?([\d,]+(?:\.\d{2})?)\s*\/?\s*(hour|hr)?/i);
  if (!match) return null;
  
  const amount = parseFloat(match[1].replace(/,/g, ''));
  const period = match[2]?.toLowerCase() || '';
  
  // Only convert hourly rates
  if (period && period !== 'hour' && period !== 'hr') return null;
  
  return amount;
};

// Helper function to convert USD hourly rate to PHP monthly range
const convertToPhpMonthlyRange = (rate: string): string => {
  const hourlyRate = parseUsdHourlyRate(rate);
  if (!hourlyRate) return rate; // Return original if can't parse
  
  const minMonthly = Math.round(hourlyRate * USD_TO_PHP_RATE * MIN_HOURS_PER_WEEK * WEEKS_PER_MONTH);
  const maxMonthly = Math.round(hourlyRate * USD_TO_PHP_RATE * MAX_HOURS_PER_WEEK * WEEKS_PER_MONTH);
  
  const formattedMin = minMonthly.toLocaleString('en-PH');
  const formattedMax = maxMonthly.toLocaleString('en-PH');
  
  return `₱${formattedMin} - ₱${formattedMax}/month`;
};

// Static fallback jobs for when database is empty
const staticJobs: Job[] = [
  {
    id: "1",
    title: "Construction Cost Estimator / Quantity Surveyor",
    department: "Construction",
    apply_url: "https://verifind.io/applicant/jobs/dd70583a-c117-48db-997a-481ef3f1db32",
    region: "philippines",
    rate: null,
    description: null,
    qualifications: null,
    responsibilities: null,
    is_active: true,
    created_at: new Date().toISOString(),
  },
  {
    id: "2",
    title: "Business Executive Assistant",
    department: "Administration",
    apply_url: "https://verifind.io/applicant/jobs/26f2861d-02fd-4ec2-b7c6-2dc94cd8bdc1",
    region: "philippines",
    rate: null,
    description: null,
    qualifications: null,
    responsibilities: null,
    is_active: true,
    created_at: new Date().toISOString(),
  },
  {
    id: "3",
    title: "SketchUp Designer (Architecture/Interior)",
    department: "Design",
    apply_url: "https://verifind.io/applicant/jobs/eb515337-a75e-45eb-8b0c-231c1d0df9c2",
    region: "philippines",
    rate: null,
    description: null,
    qualifications: null,
    responsibilities: null,
    is_active: true,
    created_at: new Date().toISOString(),
  },
  {
    id: "4",
    title: "Construction Client Outreach & Operations Coordinator",
    department: "Operations",
    apply_url: "https://verifind.io/applicant/jobs/f4d6dadb-cf45-4c35-972d-6d518293f6ea",
    region: "philippines",
    rate: null,
    description: null,
    qualifications: null,
    responsibilities: null,
    is_active: true,
    created_at: new Date().toISOString(),
  },
  {
    id: "5",
    title: "EB2 NIW Immigration Assistant",
    department: "Immigration",
    apply_url: "https://verifind.io/applicant/jobs/94f70b06-c1a3-462d-92aa-4e171c06422a",
    region: "philippines",
    rate: null,
    description: null,
    qualifications: null,
    responsibilities: null,
    is_active: true,
    created_at: new Date().toISOString(),
  },
  {
    id: "6",
    title: "Immigration Paralegal",
    department: "Legal",
    apply_url: "https://verifind.io/applicant/jobs/7ce2ecf5-12dc-45bb-a550-725f016d54ba",
    region: "philippines",
    rate: null,
    description: null,
    qualifications: null,
    responsibilities: null,
    is_active: true,
    created_at: new Date().toISOString(),
  },
  {
    id: "7",
    title: "Paralegal - Trusts and Estates",
    department: "Legal",
    apply_url: "https://verifind.io/applicant/jobs/4ff305cd-cd4a-4319-a912-de10a12d21d1",
    region: "philippines",
    rate: null,
    description: null,
    qualifications: null,
    responsibilities: null,
    is_active: true,
    created_at: new Date().toISOString(),
  },
  {
    id: "8",
    title: "Intake Specialist",
    department: "Customer Service",
    apply_url: "https://verifind.io/applicant/jobs/38a683c2-a911-4327-bc1b-f1c81961326a",
    region: "philippines",
    rate: null,
    description: null,
    qualifications: null,
    responsibilities: null,
    is_active: true,
    created_at: new Date().toISOString(),
  },
  {
    id: "9",
    title: "Graphic Designer and Video Editor",
    department: "Creative",
    apply_url: "https://verifind.io/applicant/jobs/154800ba-0f1a-4f02-8906-693b00e5eef8",
    region: "philippines",
    rate: null,
    description: null,
    qualifications: null,
    responsibilities: null,
    is_active: true,
    created_at: new Date().toISOString(),
  },
  {
    id: "10",
    title: "Operations Manager / Booking Manager",
    department: "Operations",
    apply_url: "https://verifind.io/applicant/jobs/0db946e8-7cae-4a6a-a463-3492c88e7e67",
    region: "philippines",
    rate: null,
    description: null,
    qualifications: null,
    responsibilities: null,
    is_active: true,
    created_at: new Date().toISOString(),
  },
  {
    id: "11",
    title: "Mortgage Processor & Administrative Specialist",
    department: "Finance",
    apply_url: "https://verifind.io/applicant/jobs/b91e4878-0bb3-48d4-8d8a-ee9c826f1276",
    region: "philippines",
    rate: null,
    description: null,
    qualifications: null,
    responsibilities: null,
    is_active: true,
    created_at: new Date().toISOString(),
  },
  {
    id: "13",
    title: "Marketing Specialist with SEO Expertise",
    department: "Marketing",
    apply_url: "https://verifind.io/applicant/jobs/fc8a989e-39a7-4f3b-9072-16a48d513f0a",
    region: "philippines",
    rate: null,
    description: null,
    qualifications: null,
    responsibilities: null,
    is_active: true,
    created_at: new Date().toISOString(),
  },
  {
    id: "14",
    title: "Bilingual Immigration Paralegal",
    department: "Legal",
    apply_url: "https://verifind.io/applicant/jobs/4786147d-7bdd-4d1c-a47b-e65514c5e0fa",
    region: "latin-america",
    rate: null,
    description: null,
    qualifications: null,
    responsibilities: null,
    is_active: true,
    created_at: new Date().toISOString(),
  },
  {
    id: "15",
    title: "Immigration/Family Paralegal",
    department: "Legal",
    apply_url: "https://verifind.io/applicant/jobs/6b473a04-c982-498d-b5a3-9d151fe1ce5f",
    region: "philippines",
    rate: null,
    description: null,
    qualifications: null,
    responsibilities: null,
    is_active: true,
    created_at: new Date().toISOString(),
  },
  {
    id: "16",
    title: "Senior Multimedia Designer",
    department: "Creative",
    apply_url: "https://verifind.io/applicant/jobs/d8a0e728-30be-4b82-a0d8-6e4ee546470d",
    region: "philippines",
    rate: null,
    description: null,
    qualifications: null,
    responsibilities: null,
    is_active: true,
    created_at: new Date().toISOString(),
  },
];

type Region = "philippines" | "latin-america" | "global";

const JobsSection = () => {
  const navigate = useNavigate();
  const [selectedRegion, setSelectedRegion] = useState<Region>("philippines");
  const [hoveredJobId, setHoveredJobId] = useState<string | null>(null);
  const { jobs: dbJobs, loading } = useJobs();
  const { trackJobView, trackApplyClick } = useAnalytics();
  const viewedJobs = useRef<Set<string>>(new Set());

  // Use database jobs if available, otherwise use static jobs
  const jobs: Job[] = dbJobs.length > 0 ? dbJobs : staticJobs;

  const handleApplyClick = (job: Job) => {
    trackApplyClick(job.id);
    navigate(`/apply/${job.id}`);
  };

  const handleJobView = (jobId: string) => {
    if (!viewedJobs.current.has(jobId)) {
      viewedJobs.current.add(jobId);
      trackJobView(jobId);
    }
  };

  const philippinesJobs = jobs.filter(job => 
    job.region === 'philippines' || job.region === 'all' || 
    (!job.region && !job.title.toLowerCase().includes('bilingual'))
  );
  const latinAmericaJobs = jobs.filter(job => 
    job.region === 'latin-america' || job.region === 'all' ||
    (!job.region && job.title.toLowerCase().includes('bilingual'))
  );

  const displayedJobs = selectedRegion === "philippines" ? philippinesJobs : latinAmericaJobs;

  // Get the display rate based on selected region
  const getDisplayRate = (job: Job): string | null => {
    if (!job.rate) return null;
    
    // Convert to PHP monthly range when viewing Philippines section
    if (selectedRegion === 'philippines') {
      return convertToPhpMonthlyRange(job.rate);
    }
    
    return job.rate;
  };

  const JobCard = ({ job, index }: { job: Job; index: number }) => {
    const displayRate = getDisplayRate(job);
    const hasDetails = job.description || (job.qualifications && job.qualifications.length > 0);
    const [copied, setCopied] = useState(false);
    
    // Track job view when card is rendered/visible
    useEffect(() => {
      handleJobView(job.id);
    }, [job.id]);

    const handleMouseEnter = () => {
      setHoveredJobId(job.id);
    };

    const handleMouseLeave = () => {
      setHoveredJobId(null);
    };

    const handleViewDetails = (e: React.MouseEvent) => {
      e.stopPropagation();
      navigate(`/job/${job.id}`);
    };

    const handleCopyLink = async (e: React.MouseEvent) => {
      e.stopPropagation();
      
      // Use the production URL for shareable links
      const productionOrigin = 'https://outstahub.com';
      const jobUrl = `${productionOrigin}${generateJobUrl(job.title, job.id)}`;
      
      try {
        await navigator.clipboard.writeText(jobUrl);
        setCopied(true);
        toast.success("Link copied to clipboard!");
        setTimeout(() => setCopied(false), 2000);
      } catch (err) {
        toast.error(getErrorMessageSync(err, "Failed to copy link"));
      }
    };

    const isHovered = hoveredJobId === job.id;
    
    return (
      <div className="relative">
        <Card 
          key={job.id} 
          className={`flex flex-col h-full transition-all duration-300 ease-out will-change-transform ${
            isHovered 
              ? 'shadow-2xl -translate-y-3 border-primary/30 z-20' 
              : 'shadow-sm border-border z-0'
          }`}
          style={{ position: 'relative' }}
          onMouseEnter={handleMouseEnter}
          onMouseLeave={handleMouseLeave}
        >
          <div className="flex-grow">
            <CardHeader className="pb-2">
              <CardTitle className={`text-lg min-h-[3.5rem] transition-colors duration-300 ${
                isHovered ? 'text-primary' : ''
              }`}>
                {job.title}
              </CardTitle>
            </CardHeader>
            
            <CardContent className="flex flex-col space-y-3 pt-0">
              {/* Rate - centered and highlighted in blue */}
              {displayRate && (
                <p className="text-xl font-bold text-primary text-center py-1">
                  {displayRate}
                </p>
              )}
              
              {/* Remote & Full time - opposite sides */}
              <div className="flex items-center justify-between text-sm text-muted-foreground">
                <div className="flex items-center space-x-1">
                  <MapPin className={`w-4 h-4 transition-colors duration-300 ${
                    isHovered ? 'text-primary' : ''
                  }`} />
                  <span>Remote</span>
                </div>
                <span>Full time</span>
              </div>
            </CardContent>
          </div>
          
          <CardContent className="pt-0 space-y-2">
            {/* View Job Details button - appears on hover with slide-up animation */}
            <div className={`overflow-hidden transition-all duration-300 ease-out ${
              isHovered && hasDetails ? 'max-h-12 opacity-100' : 'max-h-0 opacity-0'
            }`}>
              <Button 
                variant="outline"
                onClick={handleViewDetails}
                className={`w-full flex items-center justify-center gap-2 border-primary/30 text-primary hover:bg-primary/10 hover:border-primary hover:text-primary transition-all duration-300 ${
                  isHovered && hasDetails ? 'translate-y-0' : 'translate-y-4'
                }`}
              >
                <Eye className="w-4 h-4" />
                View Job Details
              </Button>
            </div>
            
            <div className="flex gap-2">
              <Button 
                onClick={(e) => {
                  e.stopPropagation();
                  handleApplyClick(job);
                }}
                className={`flex-1 transition-all duration-300 ${
                  isHovered ? 'shadow-button' : ''
                }`}
              >
                Apply Now
              </Button>
              <Button
                variant="outline"
                size="icon"
                onClick={handleCopyLink}
                className="flex-shrink-0 border-primary/30 text-primary hover:bg-primary/10 hover:border-primary"
                title="Copy application link"
              >
                {copied ? <Check className="w-4 h-4" /> : <Link2 className="w-4 h-4" />}
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  };

  return (
    <section id="positions" className="py-20 bg-gradient-section relative">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-12">
          <h2 className="text-4xl md:text-5xl font-bold text-foreground mb-4">
            Open Positions
          </h2>
          <p className="text-xl text-muted-foreground max-w-2xl mx-auto">
            Find your next opportunity and join our mission to empower exceptional talent.
          </p>
        </div>

        {/* Region Selection */}
        <div className="flex justify-center gap-4 mb-12">
          <Button
            variant={selectedRegion === "philippines" ? "default" : "outline"}
            size="lg"
            onClick={() => setSelectedRegion("philippines")}
            className="min-w-[160px]"
          >
            Philippines
          </Button>
          <Button
            variant={selectedRegion === "latin-america" ? "default" : "outline"}
            size="lg"
            onClick={() => setSelectedRegion("latin-america")}
            className="min-w-[160px]"
          >
            Latin America
          </Button>
        </div>

        {/* Jobs Grid */}
        <div className="mb-12">
          <h3 className="text-2xl md:text-3xl font-bold text-foreground mb-8 text-center">
            {selectedRegion === "philippines" ? "Philippines" : "Latin America"} Roles
          </h3>
          {loading ? (
            <p className="text-center text-muted-foreground">Loading jobs...</p>
          ) : (
            <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
              {displayedJobs.map((job, index) => (
                <JobCard key={job.id} job={job} index={index} />
              ))}
            </div>
          )}
        </div>
        
        <div className="text-center mt-16 py-12 px-8 bg-primary/5 rounded-2xl border border-primary/10">
          <h3 className="text-2xl font-bold text-foreground mb-3">
            Join Our Talent Pool
          </h3>
          <p className="text-lg text-muted-foreground mb-6 max-w-lg mx-auto">
            Didn't find a role for you? Join our OutSta community for future openings.
          </p>
          <Button 
            variant="default" 
            size="lg"
            className="text-lg px-8 py-6"
            onClick={() => navigate('/talent-pool')}
          >
            Join our Talent Pool here
          </Button>
        </div>
      </div>
    </section>
  );
};

export default JobsSection;
