import { TrendingUp, Users, Target, Globe, Trophy } from "lucide-react";

const benefits = [
  {
    id: "01",
    title: "We Invest in Your Growth",
    description: "OutSta matches you with opportunities where your skills shine and your career can grow long-term.",
    icon: TrendingUp,
  },
  {
    id: "02", 
    title: "Driven by Core Values That Work in the Real World",
    description: "Empowerment, adaptability, integrity, collaboration, and continuous improvement aren't just words — they're how we operate daily, ensuring both clients and contractors succeed.",
    icon: Target,
  },
  {
    id: "03",
    title: "Your Success is Our Win",
    description: "From your first interview to ongoing support, we're here to help you achieve your career goals.",
    icon: Trophy,
  },
];

const BenefitsSection = () => {
  return (
    <section id="benefits" className="py-20 bg-gradient-section">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-16">
          <h2 className="text-4xl md:text-5xl font-bold text-foreground mb-4">
            Why Build Your Career with OutSta?
          </h2>
          <p className="text-xl text-muted-foreground max-w-2xl mx-auto">
            Join a community that values your skills, supports your growth, and connects you with opportunities where you can thrive.
          </p>
        </div>

        {/* About Section - Moved here */}
        <div className="mb-20 grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
          <div>
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
        
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
          {benefits.map((benefit, index) => {
            const IconComponent = benefit.icon;
            return (
              <div 
                key={benefit.id}
                className="group bg-card rounded-xl p-8 shadow-card hover:shadow-xl transition-all duration-300 hover:-translate-y-2 animate-fade-in"
                style={{ animationDelay: `${index * 0.1}s` }}
              >
                <div className="flex items-start space-x-4">
                  <div className="flex-shrink-0">
                    <div className="w-12 h-12 bg-primary rounded-lg flex items-center justify-center group-hover:scale-110 transition-transform duration-300">
                      <IconComponent className="w-6 h-6 text-primary-foreground" />
                    </div>
                  </div>
                  <div className="flex-grow">
                    <div className="text-3xl font-bold text-primary mb-2">{benefit.id}</div>
                    <h3 className="text-xl font-semibold text-foreground mb-3">{benefit.title}</h3>
                    <p className="text-muted-foreground leading-relaxed">{benefit.description}</p>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
};

export default BenefitsSection;