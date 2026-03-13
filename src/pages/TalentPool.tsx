import { Helmet } from "react-helmet-async";
import Navigation from "@/components/ui/navigation";
import TalentPoolForm from "@/components/TalentPoolForm";
import { CheckCircle, FileSearch, MessageSquare, Users, Briefcase, ArrowDown } from "lucide-react";

const TalentPool = () => {
  const scrollToForm = () => {
    document.getElementById('talent-pool-form')?.scrollIntoView({ behavior: 'smooth' });
  };

  return (
    <>
      <Helmet>
        <title>Join Our Talent Pool | OutSta Careers</title>
        <meta name="description" content="Work with international clients. Build a long-term remote career with OutSta. Join our talent pool and get matched with U.S. companies." />
      </Helmet>

      <Navigation />

      {/* Hero Section */}
      <section className="relative pt-28 pb-16 bg-gradient-to-br from-primary to-secondary overflow-hidden">
        <div className="absolute inset-0 bg-[url('/images/contractor-bg-original.jpg')] bg-cover bg-center opacity-10" />
        <div className="relative max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <h1 className="text-4xl md:text-5xl font-bold text-primary-foreground mb-6 leading-tight">
            Work With International Clients.<br />
            Build a Long-Term Remote Career.
          </h1>
          <p className="text-lg md:text-xl text-primary-foreground/90 max-w-3xl mx-auto mb-4 leading-relaxed">
            At OutSta, we connect highly capable remote professionals with growing businesses 
            in the United States. Our clients rely on us to find reliable people who communicate 
            well and take ownership of their work.
          </p>
          <p className="text-lg text-primary-foreground/80 max-w-2xl mx-auto mb-8">
            If you are looking for a serious remote role where your work is valued and your 
            performance matters, we would like to hear from you.
          </p>
          <button
            onClick={scrollToForm}
            className="inline-flex items-center gap-2 bg-primary-foreground text-primary font-semibold px-8 py-4 rounded-lg hover:bg-primary-foreground/90 transition-colors text-lg shadow-lg"
          >
            Apply Now
            <ArrowDown className="w-5 h-5" />
          </button>
        </div>
      </section>

      {/* Priority Notice */}
      <section className="bg-accent/10 border-b border-border">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <p className="text-center text-muted-foreground text-sm md:text-base font-medium italic">
            We receive a high number of applications and prioritize candidates who submit thoughtful responses.
          </p>
        </div>
      </section>

      {/* What We Look For */}
      <section className="py-16 bg-background">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
          <h2 className="text-3xl font-bold text-foreground mb-8 text-center">What We Look For</h2>
          <div className="grid sm:grid-cols-2 gap-4 max-w-2xl mx-auto">
            {[
              "Strong English communication",
              "Reliable internet and work setup",
              "Ability to work U.S. business hours",
              "A proactive approach to solving problems",
              "Professionalism when working with international clients",
            ].map((item) => (
              <div key={item} className="flex items-start gap-3 p-3">
                <CheckCircle className="w-5 h-5 text-primary flex-shrink-0 mt-0.5" />
                <span className="text-foreground">{item}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Hiring Process */}
      <section className="py-16 bg-muted/50">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
          <h2 className="text-3xl font-bold text-foreground mb-10 text-center">Our Hiring Process</h2>
          <div className="flex flex-col md:flex-row items-center justify-center gap-4 md:gap-2">
            {[
              { icon: FileSearch, label: "Application Review" },
              { icon: MessageSquare, label: "Communication Assessment" },
              { icon: Users, label: "Recruiter Interview" },
              { icon: Briefcase, label: "Client Interview" },
              { icon: CheckCircle, label: "Placement" },
            ].map((step, i) => (
              <div key={step.label} className="flex items-center gap-2 md:gap-0">
                <div className="flex flex-col items-center text-center w-36">
                  <div className="w-12 h-12 rounded-full bg-primary flex items-center justify-center mb-2">
                    <step.icon className="w-6 h-6 text-primary-foreground" />
                  </div>
                  <span className="text-sm font-medium text-foreground">{step.label}</span>
                </div>
                {i < 4 && (
                  <div className="hidden md:block w-8 h-0.5 bg-primary/30" />
                )}
              </div>
            ))}
          </div>
          <p className="text-center text-muted-foreground mt-8 text-sm">
            We review applications within 24 to 48 business hours.
          </p>
        </div>
      </section>

      {/* Application Form */}
      <section id="talent-pool-form" className="py-16 bg-background">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8">
          <TalentPoolForm />
        </div>
      </section>

      {/* Thank You Footer */}
      <section className="py-12 bg-muted/50 border-t border-border">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <p className="text-muted-foreground text-sm">
            We carefully review every application. If your background matches what our clients 
            are looking for, our recruitment team will reach out for the next step. We appreciate 
            the time you invest in your application.
          </p>
        </div>
      </section>
    </>
  );
};

export default TalentPool;
