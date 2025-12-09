import { FileText, Search, MessageCircle, Users, CheckCircle } from "lucide-react";

const processSteps = [
  {
    id: 1,
    title: "Apply",
    description: "Submit your application with your skills, experience, and career goals. We review every application carefully.",
    icon: FileText,
    color: "bg-blue-500"
  },
  {
    id: 2,
    title: "Screening",
    description: "Our team conducts an initial screening to understand your background and match you with suitable opportunities.",
    icon: Search,
    color: "bg-purple-500"
  },
  {
    id: 3,
    title: "Interview",
    description: "Have a detailed conversation with our recruitment team about your skills, experience, and career aspirations.",
    icon: MessageCircle,
    color: "bg-green-500"
  },
  {
    id: 4,
    title: "Client Interview",
    description: "Meet with potential clients to discuss the role, project requirements, and ensure mutual fit.",
    icon: Users,
    color: "bg-orange-500"
  },
  {
    id: 5,
    title: "Placement",
    description: "Start your new role with ongoing support from our team to ensure your success and career growth.",
    icon: CheckCircle,
    color: "bg-emerald-500"
  }
];

const RecruitmentProcess = () => {
  return (
    <section className="py-20 bg-gradient-section">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-16">
          <h2 className="text-4xl md:text-5xl font-bold text-foreground mb-4">
            Your Journey to Success
          </h2>
          <p className="text-xl text-muted-foreground max-w-3xl mx-auto">
            Our streamlined 5-step process ensures we find the perfect match for your skills and career goals
          </p>
        </div>

        <div className="relative">
          {/* Process Steps */}
          <div className="grid grid-cols-1 md:grid-cols-5 gap-8 relative">
            {/* Connection Line */}
            <div className="hidden md:block absolute top-16 left-0 right-0 h-0.5 bg-accent -z-10"></div>
            
            {processSteps.map((step, index) => {
              const IconComponent = step.icon;
              return (
                <div 
                  key={step.id}
                  className="group text-center animate-fade-in"
                  style={{ animationDelay: `${index * 0.2}s` }}
                >
                  {/* Step Circle */}
                  <div className="relative mb-6">
                    <div className={`w-32 h-32 ${step.color} rounded-full flex items-center justify-center mx-auto group-hover:scale-110 transition-transform duration-300 shadow-lg`}>
                      <IconComponent className="w-12 h-12 text-white" />
                    </div>
                    <div className="absolute -bottom-2 left-1/2 transform -translate-x-1/2 w-8 h-8 bg-card rounded-full border-4 border-accent flex items-center justify-center shadow-sm">
                      <span className="text-sm font-bold text-foreground">{step.id}</span>
                    </div>
                  </div>
                  
                  {/* Step Content */}
                  <div className="max-w-xs mx-auto">
                    <h3 className="text-xl font-bold text-foreground mb-3 group-hover:text-primary transition-colors duration-300">
                      {step.title}
                    </h3>
                    <p className="text-muted-foreground leading-relaxed text-sm">
                      {step.description}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Call to Action */}
        <div className="text-center mt-16">
          <div className="inline-flex items-center bg-card rounded-xl p-6 shadow-card">
            <CheckCircle className="w-8 h-8 text-green-500 mr-4" />
            <div className="text-left">
              <h4 className="font-semibold text-foreground">Ready to Start Your Journey?</h4>
              <p className="text-muted-foreground">Join hundreds of professionals who've built successful careers with OutSta</p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};

export default RecruitmentProcess;