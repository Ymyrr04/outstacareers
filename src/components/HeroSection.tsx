import { Button } from "@/components/ui/button";
import heroImage from "@/assets/hero-careers.jpg";

const HeroSection = () => {
  return (
    <section className="relative min-h-screen flex items-center justify-center bg-gradient-hero overflow-hidden">
      <div className="absolute inset-0 bg-black/20"></div>
      <div 
        className="absolute inset-0 bg-cover bg-center bg-no-repeat opacity-30"
        style={{ backgroundImage: `url(${heroImage})` }}
      ></div>
      
      <div className="relative z-10 text-center px-4 sm:px-6 lg:px-8 max-w-4xl mx-auto">
        <h1 className="text-5xl md:text-7xl font-bold text-white mb-6 animate-fade-in">
          With OutSta, your next role is the first step to your best career.
        </h1>
        
        <p className="text-xl md:text-2xl text-white/90 mb-8 max-w-2xl mx-auto animate-slide-up" style={{ animationDelay: "0.2s" }}>
          Become part of a global team making remote work meaningful.
        </p>
        
        <div className="animate-scale-in" style={{ animationDelay: "0.4s" }}>
          <Button 
            size="lg" 
            className="bg-white text-primary hover:bg-white/90 shadow-button text-lg px-8 py-4 h-auto font-semibold transition-all duration-300 hover:scale-105"
            onClick={() => document.getElementById('positions')?.scrollIntoView({ behavior: 'smooth' })}
          >
            Explore Opportunities
          </Button>
        </div>
      </div>
      
      {/* Scroll indicator */}
      <div className="absolute bottom-8 left-1/2 transform -translate-x-1/2 animate-bounce">
        <div className="w-1 h-8 bg-white/50 rounded-full"></div>
      </div>
    </section>
  );
};

export default HeroSection;