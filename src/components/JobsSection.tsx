import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { MapPin } from "lucide-react";

const jobs = [
  // ... keep existing code (all job entries)
  {
    id: 1,
    title: "Construction Cost Estimator / Quantity Surveyor",
    department: "Construction",
    location: "Remote",
    applyUrl: "https://verifind.io/applicant/jobs/dd70583a-c117-48db-997a-481ef3f1db32"
  },
  {
    id: 2,
    title: "Business Executive Assistant",
    department: "Administration",
    location: "Remote",
    applyUrl: "https://verifind.io/applicant/jobs/26f2861d-02fd-4ec2-b7c6-2dc94cd8bdc1"
  },
  {
    id: 3,
    title: "SketchUp Designer (Architecture/Interior)",
    department: "Design",
    location: "Remote",
    applyUrl: "https://verifind.io/applicant/jobs/eb515337-a75e-45eb-8b0c-231c1d0df9c2"
  },
  {
    id: 4,
    title: "Construction Client Outreach & Operations Coordinator",
    department: "Operations",
    location: "Remote",
    applyUrl: "https://verifind.io/applicant/jobs/f4d6dadb-cf45-4c35-972d-6d518293f6ea"
  },
  {
    id: 5,
    title: "EB2 NIW Immigration Assistant",
    department: "Immigration",
    location: "Remote",
    applyUrl: "https://verifind.io/applicant/jobs/94f70b06-c1a3-462d-92aa-4e171c06422a"
  },
  {
    id: 6,
    title: "Immigration Paralegal",
    department: "Legal",
    location: "Remote",
    applyUrl: "https://verifind.io/applicant/jobs/7ce2ecf5-12dc-45bb-a550-725f016d54ba"
  },
  {
    id: 7,
    title: "Paralegal - Trusts and Estates",
    department: "Legal",
    location: "Remote",
    applyUrl: "https://verifind.io/applicant/jobs/4ff305cd-cd4a-4319-a912-de10a12d21d1"
  },
  {
    id: 8,
    title: "Intake Specialist",
    department: "Customer Service",
    location: "Remote",
    applyUrl: "https://verifind.io/applicant/jobs/38a683c2-a911-4327-bc1b-f1c81961326a"
  },
  {
    id: 9,
    title: "Graphic Designer and Video Editor",
    department: "Creative",
    location: "Remote",
    applyUrl: "https://verifind.io/applicant/jobs/154800ba-0f1a-4f02-8906-693b00e5eef8"
  },
  {
    id: 10,
    title: "Operations Manager / Booking Manager",
    department: "Operations",
    location: "Remote",
    applyUrl: "https://verifind.io/applicant/jobs/0db946e8-7cae-4a6a-a463-3492c88e7e67"
  },
  {
    id: 11,
    title: "Mortgage Processor & Administrative Specialist",
    department: "Finance",
    location: "Remote",
    applyUrl: "https://verifind.io/applicant/jobs/b91e4878-0bb3-48d4-8d8a-ee9c826f1276"
  },
  {
    id: 13,
    title: "Marketing Specialist with SEO Expertise",
    department: "Marketing",
    location: "Remote",
    applyUrl: "https://verifind.io/applicant/jobs/fc8a989e-39a7-4f3b-9072-16a48d513f0a"
  },
  {
    id: 14,
    title: "Bilingual Immigration Paralegal",
    department: "Legal",
    location: "Remote",
    applyUrl: "https://verifind.io/applicant/jobs/4786147d-7bdd-4d1c-a47b-e65514c5e0fa"
  },
  {
    id: 15,
    title: "Immigration/Family Paralegal",
    department: "Legal",
    location: "Remote",
    applyUrl: "https://verifind.io/applicant/jobs/6b473a04-c982-498d-b5a3-9d151fe1ce5f"
  },
  {
    id: 16,
    title: "Senior Multimedia Designer",
    department: "Creative",
    location: "Remote",
    applyUrl: "https://verifind.io/applicant/jobs/d8a0e728-30be-4b82-a0d8-6e4ee546470d"
  },
];

type Region = "philippines" | "latin-america";

const JobsSection = () => {
  const [selectedRegion, setSelectedRegion] = useState<Region>("philippines");

  const handleApplyClick = (applyUrl: string) => {
    window.open(applyUrl, '_blank');
  };

  const latinAmericaJobs = jobs.filter(job => job.title.toLowerCase().includes('bilingual'));
  const philippinesJobs = jobs.filter(job => !job.title.toLowerCase().includes('bilingual'));

  const displayedJobs = selectedRegion === "philippines" ? philippinesJobs : latinAmericaJobs;

  const JobCard = ({ job, index }: { job: typeof jobs[0]; index: number }) => (
    <Card 
      key={job.id} 
      className="group hover:shadow-xl transition-all duration-300 hover:-translate-y-1 animate-fade-in flex flex-col h-full"
      style={{ animationDelay: `${index * 0.05}s` }}
    >
      <CardHeader>
        <CardTitle className="text-lg group-hover:text-primary transition-colors duration-300 min-h-[3.5rem]">
          {job.title}
        </CardTitle>
      </CardHeader>
      
      <CardContent className="flex flex-col flex-grow space-y-4">
        <div className="flex items-center space-x-2 text-sm text-muted-foreground">
          <MapPin className="w-4 h-4" />
          <span>{job.location}</span>
        </div>
        
        <Button 
          onClick={() => handleApplyClick(job.applyUrl)}
          className="w-full group-hover:shadow-button transition-all duration-300 mt-auto"
        >
          Apply Now
        </Button>
      </CardContent>
    </Card>
  );

  return (
    <section id="positions" className="py-20 bg-gradient-section">
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
          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            {displayedJobs.map((job, index) => (
              <JobCard key={job.id} job={job} index={index} />
            ))}
          </div>
        </div>
        
        <div className="text-center mt-16 py-12 px-8 bg-primary/5 rounded-2xl border border-primary/10">
          <h3 className="text-2xl font-bold text-foreground mb-3">
            Join Our Talent Pool
          </h3>
          <p className="text-lg text-muted-foreground mb-6 max-w-lg mx-auto">
            Don't see the perfect role? We're always looking for exceptional talent to join our community.
          </p>
          <Button 
            variant="default" 
            size="lg"
            className="text-lg px-8 py-6"
            onClick={() => window.open('https://docs.google.com/forms/d/e/1FAIpQLScTA302hqdCmDBphLwsRdHm2wH0U5dxnzu28JQWaJ8_dB9aeQ/viewform?usp=header', '_blank')}
          >
            Join Our Talent Pool
          </Button>
        </div>
      </div>
    </section>
  );
};

export default JobsSection;