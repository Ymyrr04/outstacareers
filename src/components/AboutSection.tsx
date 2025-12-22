const AboutSection = () => {
  return (
    <section id="about" className="py-20 bg-background">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
          <div>
            <h2 className="text-4xl md:text-5xl font-bold text-foreground mb-6">
              Meet Outsta: Where Your Career Takes Flight
            </h2>
            <h3 className="text-2xl font-semibold text-primary mb-6">
              Empowering Talented Professionals to Reach Their Full Potential
            </h3>
            <p className="text-lg text-muted-foreground leading-relaxed">
              At Outsta, we believe that exceptional talent deserves exceptional opportunities. We're committed to connecting skilled professionals like you with companies that truly value your abilities. As your career partner, we go beyond simple job placement — we advocate for your growth, negotiate competitive compensation, and match you with roles where you can thrive. Our dedication to understanding your unique skills, goals, and aspirations ensures we find opportunities that advance your career and unlock your full potential.
            </p>
          </div>
          <div className="relative">
            <img 
              src="https://outsta.io/wp-content/uploads/2024/10/A7309868-scaled.jpg" 
              alt="Outsta team collaboration"
              className="rounded-2xl shadow-xl w-full object-cover"
            />
          </div>
        </div>
      </div>
    </section>
  );
};

export default AboutSection;
