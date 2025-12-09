import Navigation from "@/components/ui/navigation";
import HeroSection from "@/components/HeroSection";
import BenefitsSection from "@/components/BenefitsSection";
import FloatingReviews from "@/components/FloatingReviews";
import FullReviewsSection from "@/components/FullReviewsSection";
import ClientReviewsSection from "@/components/ClientReviewsSection";
import RecruitmentProcess from "@/components/RecruitmentProcess";
import ValuesSection from "@/components/ValuesSection";
import JobsSection from "@/components/JobsSection";
const Index = () => {
  return (
    <div className="min-h-screen">
      <Navigation />
      <HeroSection />
      <BenefitsSection />
      <JobsSection />
      <RecruitmentProcess />
      <ValuesSection />
      <FloatingReviews />
      <FullReviewsSection />
      <ClientReviewsSection />
    </div>
  );
};

export default Index;
