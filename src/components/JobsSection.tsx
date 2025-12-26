import { useState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { MapPin } from "lucide-react";
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
    is_active: true,
    created_at: new Date().toISOString(),
  },
];

type Region = "philippines" | "latin-america";

const JobsSection = () => {
  const [selectedRegion, setSelectedRegion] = useState<Region>("philippines");
  const [openJobId, setOpenJobId] = useState<string | null>(null);
  const [hoveredJobId, setHoveredJobId] = useState<string | null>(null);
  const hoverTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const { jobs: dbJobs, loading } = useJobs();
  const { trackJobView, trackApplyClick } = useAnalytics();
  const viewedJobs = useRef<Set<string>>(new Set());

  // Use database jobs if available, otherwise use static jobs
  const jobs: Job[] = dbJobs.length > 0 ? dbJobs : staticJobs;

  const handleApplyClick = (applyUrl: string, jobId: string) => {
    trackApplyClick(jobId);
    window.open(applyUrl, '_blank');
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

  // Get the selected job details for the popup
  const selectedJob = openJobId ? jobs.find(j => j.id === openJobId) : null;
  const selectedJobDisplayRate = selectedJob ? getDisplayRate(selectedJob) : null;

  const JobCard = ({ job, index }: { job: Job; index: number }) => {
    const displayRate = getDisplayRate(job);
    const hasDetails = job.description || (job.qualifications && job.qualifications.length > 0);
    
    // Track job view when card is rendered/visible
    useEffect(() => {
      handleJobView(job.id);
    }, [job.id]);

    const handleMouseEnter = () => {
      setHoveredJobId(job.id);
      if (hasDetails) {
        // Clear any existing timeout
        if (hoverTimeoutRef.current) {
          clearTimeout(hoverTimeoutRef.current);
        }
        // Set new timeout for 750ms delay
        hoverTimeoutRef.current = setTimeout(() => {
          setOpenJobId(job.id);
        }, 750);
      }
    };

    const handleMouseLeave = () => {
      setHoveredJobId(null);
      // Clear the timeout if mouse leaves before delay completes
      if (hoverTimeoutRef.current) {
        clearTimeout(hoverTimeoutRef.current);
        hoverTimeoutRef.current = null;
      }
      setOpenJobId(null);
    };

    const isActive = openJobId === job.id;
    const isHovered = hoveredJobId === job.id;
    const hasActivePopup = openJobId !== null;
    
    return (
      <Card 
        key={job.id} 
        className={`flex flex-col h-full animate-fade-in transition-all duration-300 ${
          isHovered && !hasActivePopup ? 'shadow-xl -translate-y-1' : ''
        } ${isActive ? 'shadow-xl ring-2 ring-primary/50 -translate-y-1 z-10' : ''} ${isHovered && !isActive && hasActivePopup ? '' : ''} ${!isHovered && !isActive ? '' : ''}`}
        style={{ animationDelay: `${index * 0.05}s` }}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
      >
        <div className="flex-grow">
          <CardHeader className="pb-2">
            <CardTitle className={`text-lg min-h-[3.5rem] transition-colors duration-300 ${
              isHovered || isActive ? 'text-primary' : ''
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
                <MapPin className="w-4 h-4" />
                <span>Remote</span>
              </div>
              <span>Full time</span>
            </div>
          </CardContent>
        </div>
        
        <CardContent className="pt-0">
          <Button 
            onClick={(e) => {
              e.stopPropagation();
              handleApplyClick(job.apply_url, job.id);
            }}
            className={`w-full transition-all duration-300 ${isHovered || isActive ? 'shadow-button' : ''}`}
          >
            Apply Now
          </Button>
        </CardContent>
      </Card>
    );
  };

  // Job details popup component
  const JobDetailsPopup = () => {
    if (!selectedJob) return null;
    
    const hasDetails = selectedJob.description || (selectedJob.qualifications && selectedJob.qualifications.length > 0);
    if (!hasDetails) return null;

    return (
      <>
        {/* Subtle backdrop overlay */}
        <div className="fixed inset-0 z-40 bg-black/30 pointer-events-none transition-opacity duration-200" />
        
        <div 
          className="fixed inset-0 z-50 flex items-center justify-center p-4 pointer-events-none"
        >
          {/* Popup content */}
          <div 
            className="pointer-events-auto w-full max-w-md max-h-[80vh] overflow-y-auto bg-background rounded-lg shadow-2xl border border-primary/20 p-6 animate-scale-in"
          >
            <div className="space-y-4">
              <h4 className="font-bold text-lg text-foreground">{selectedJob.title}</h4>
              
              {selectedJob.description && (
                <div>
                  <p className="text-sm text-muted-foreground leading-relaxed">
                    {selectedJob.description}
                  </p>
                </div>
              )}
              
              {selectedJob.qualifications && selectedJob.qualifications.length > 0 && (
                <div>
                  <h5 className="font-semibold text-sm text-foreground mb-2">Key Qualifications:</h5>
                  <ul className="space-y-1.5">
                    {selectedJob.qualifications.map((qual, idx) => (
                      <li key={idx} className="text-sm text-muted-foreground flex items-start gap-2">
                        <span className="text-primary mt-1">•</span>
                        <span>{qual}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              
              {selectedJobDisplayRate && (
                <div className="pt-2 border-t border-border">
                  <p className="text-sm font-semibold text-primary">{selectedJobDisplayRate}</p>
                </div>
              )}
              
              <Button 
                onClick={() => {
                  handleApplyClick(selectedJob.apply_url, selectedJob.id);
                }}
                className="w-full mt-4"
              >
                Apply Now
              </Button>
            </div>
          </div>
        </div>
      </>
    );
  };

  return (
    <>
      {/* Job details popup */}
      <JobDetailsPopup />
      
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
            onClick={() => window.open('https://docs.google.com/forms/d/e/1FAIpQLScTA302hqdCmDBphLwsRdHm2wH0U5dxnzu28JQWaJ8_dB9aeQ/viewform?usp=header', '_blank')}
          >
            Join our Talent Pool here
          </Button>
        </div>
      </div>
      </section>
    </>
  );
};

export default JobsSection;
