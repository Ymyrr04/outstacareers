import { useEffect } from "react";
import { useLocation } from "react-router-dom";
import Navigation from "@/components/ui/navigation";
import HeroSection from "@/components/HeroSection";
import BenefitsSection from "@/components/BenefitsSection";
import FloatingReviews from "@/components/FloatingReviews";
import FullReviewsSection from "@/components/FullReviewsSection";
import ClientReviewsSection from "@/components/ClientReviewsSection";
import RecruitmentProcess from "@/components/RecruitmentProcess";
import ValuesSection from "@/components/ValuesSection";
import JobsSection from "@/components/JobsSection";
import FooterAboutSection from "@/components/FooterAboutSection";
import { usePageViewTracking } from "@/hooks/useAnalytics";
import ClientPortalLogin from "./ClientPortalLogin";

const Index = () => {
  usePageViewTracking();
  const location = useLocation();

  const isWorkforceDomain = typeof window !== 'undefined' &&
    window.location.hostname.includes('outstaworkforce.com');

  // Handle hash navigation (e.g., /#positions)
  useEffect(() => {
    if (location.hash) {
      const elementId = location.hash.replace('#', '');
      // Small delay to ensure the page is rendered
      setTimeout(() => {
        const element = document.getElementById(elementId);
        if (element) {
          element.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
      }, 100);
    }
  }, [location.hash]);
  if (isWorkforceDomain) {
    return <ClientPortalLogin />;
  }

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
      <FooterAboutSection />
    </div>
  );
};

export default Index;

