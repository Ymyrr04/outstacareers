import adamsComposite from "@/assets/team/adams-composite.png";
import liezlNew from "@/assets/team/liezl-new.png";
import eduardoCzaKristine from "@/assets/team/eduardo-cza-kristine.png";
import markSean from "@/assets/team/mark-sean.png";

interface TeamMember {
  name: string;
  role: string;
  description: string;
  image: string;
  objectPosition: string;
}

const teamMembers: TeamMember[] = [
  // Row 1
  {
    name: "Adam Tabari",
    role: "Founder, CEO",
    description: "As our founder and CEO, Adam is dedicated to connecting you with opportunities at top Western businesses. He'll ensure you receive ongoing support and are valued for your exceptional skills. His vision is to help talented professionals like you thrive in rewarding remote careers.",
    image: adamsComposite,
    objectPosition: "left center",
  },
  {
    name: "Adam W.",
    role: "Client Growth & Optimization Specialist",
    description: "Adam uses cutting-edge technology and data insights to match you with the perfect role. He works to understand your unique strengths and find positions where you'll excel, ensuring a great fit between your skills and employer needs.",
    image: adamsComposite,
    objectPosition: "right center",
  },
  {
    name: "Liezl De Dios",
    role: "Client & Contractor Operations and Hiring Strategy",
    description: "With her background as a virtual assistant and global experience, Liezl understands exactly what you need to succeed in remote work. She'll help align your talents with the right opportunities and support you throughout your journey.",
    image: liezlNew,
    objectPosition: "center top",
  },
  {
    name: "Sean de Luna",
    role: "Strategic Engagement Advisor",
    description: "Sean brings extensive experience to help you stand out. He's passionate about diversity and inclusion, and works to ensure every candidate receives fair consideration and has their unique strengths recognized.",
    image: markSean,
    objectPosition: "right center",
  },
  // Row 2
  {
    name: "Eduardo",
    role: "Bilingual Contractor Recruitment and Client HR Strategy & Support",
    description: "Eduardo is your go-to specialist for bilingual opportunities across Latin America. He'll guide you through the hiring process, build a strong relationship with you, and advocate for your success every step of the way.",
    image: eduardoCzaKristine,
    objectPosition: "left center",
  },
  {
    name: "Cza",
    role: "Client HR Strategy & Support and Contractor Recruitment",
    description: "Czarina will be your main point of contact throughout the recruitment journey. She prioritizes clear communication and ensures you feel supported, helping you build strong connections with your future employer.",
    image: eduardoCzaKristine,
    objectPosition: "center center",
  },
  {
    name: "Kristine",
    role: "Client HR Strategy & Support and Candidate Recruitment",
    description: "Kristine is here to make your job search seamless. She focuses on understanding your capabilities and career goals, then works to match you with employers who truly value what you bring to the table.",
    image: eduardoCzaKristine,
    objectPosition: "right center",
  },
  {
    name: "Mark",
    role: "Client Satisfaction & Development",
    description: "Mark is committed to your long-term success. He nurtures meaningful partnerships that help you grow professionally, ensuring you have the support you need to build an enduring and rewarding career.",
    image: markSean,
    objectPosition: "left center",
  },
];

const FooterAboutSection = () => {
  return (
    <section id="team" className="py-20 bg-card">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Values Introduction */}
        <div className="text-center mb-16">
          <h2 className="text-4xl md:text-5xl font-bold text-foreground mb-4">
            Our Team Values
          </h2>
          <h3 className="text-2xl font-semibold text-primary mb-6">
            Your Success Team — Driven by Core Values, Dedicated to Your Career Growth
          </h3>
          <p className="text-lg text-muted-foreground max-w-4xl mx-auto leading-relaxed">
            Outsta is more than a staffing agency — we're your dedicated career partners, driven by the principles of Empowerment, Adaptability, Integrity, Collaboration, and Continuous Improvement. These core values guide how we support you throughout your journey. We're committed to finding opportunities where you're not only valued for your skills but also welcomed into a culture where you can thrive, ensuring we make a real difference in your professional life.
          </p>
        </div>

        {/* Meet Our Team */}
        <div className="mb-12">
          <h3 className="text-3xl font-bold text-foreground text-center mb-12">
            Meet Our Team
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">
            {teamMembers.map((member, index) => (
              <div 
                key={member.name}
                className="group bg-background rounded-xl p-6 shadow-card hover:shadow-xl transition-all duration-300 hover:-translate-y-2 animate-fade-in"
                style={{ animationDelay: `${index * 0.1}s` }}
              >
                <div className="mb-4 overflow-hidden rounded-lg">
                  <img 
                    src={member.image} 
                    alt={member.name}
                    className="w-full h-48 object-cover group-hover:scale-105 transition-transform duration-300"
                    style={{ objectPosition: member.objectPosition }}
                  />
                </div>
                <h4 className="text-xl font-bold text-foreground mb-1">{member.name}</h4>
                <p className="text-primary font-medium text-sm mb-3">{member.role}</p>
                <p className="text-muted-foreground text-sm leading-relaxed">{member.description}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
};

export default FooterAboutSection;
