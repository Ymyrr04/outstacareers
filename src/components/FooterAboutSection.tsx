import adamTabari from "@/assets/team/adam-tabari.png";
import adamW from "@/assets/team/adam-w.png";
import adri from "@/assets/team/adri.png";
import eduardo from "@/assets/team/eduardo.png";
import cza from "@/assets/team/cza.png";
import kristine from "@/assets/team/kristine.png";
import mark from "@/assets/team/mark.png";
import sean from "@/assets/team/sean.png";

const teamMembers = [
  {
    name: "Adam Tabari",
    role: "Founder, CEO",
    description: "Adam Tabari, the founder and CEO of Outsta, is committed to bridging the gap between exceptional global talent and Western businesses, achieving significant savings and ongoing support. His visionary approach to cost-effective, skilled staffing solutions profoundly impacts the staffing sector.",
    image: adamTabari,
  },
  {
    name: "Adam W.",
    role: "Client Growth & Optimization Specialist",
    description: "Adam harnesses data science, creative insights, and both emerging and proven tech platforms to enhance client-candidate alignment and drive business growth.",
    image: adamW,
  },
  {
    name: "Adri",
    role: "Contractor Onboarding & Performance",
    description: "Adrianne spearheads marketing and onboarding at Outsta, ensuring engaging and effective processes. She is adept at creating memorable onboarding experiences that allow new hires to integrate seamlessly into our culture.",
    image: adri,
  },
  {
    name: "Eduardo",
    role: "Bilingual Contractor Recruitment and Client HR Strategy & Support",
    description: "Eduardo specializes in recruiting across Latin America, focusing on bilingual positions and streamlining the hiring process. His expertise in building strong relationships and handling HR matters is instrumental in surpassing client expectations.",
    image: eduardo,
  },
  {
    name: "Cza",
    role: "Client HR Strategy & Support and Contractor Recruitment",
    description: "Czarina oversees the recruitment process, prioritizing clear communication and strong connections between client and contractor that contribute to collective success.",
    image: cza,
  },
  {
    name: "Kristine",
    role: "Client HR Strategy & Support and Candidate Recruitment",
    description: "Kristine dedicates herself to streamlining the hiring process, aligning client needs with candidate capabilities. Her focus on building lasting partnerships enhances our talent acquisition efforts.",
    image: kristine,
  },
  {
    name: "Mark",
    role: "Client Satisfaction & Development",
    description: "Mark is committed to establishing strong connections that drive growth and enduring success for both clients and contractors. His focus on fostering meaningful partnerships underscores Outsta's mission.",
    image: mark,
  },
  {
    name: "Sean de Luna",
    role: "Strategic Engagement Advisor",
    description: "With extensive experience in marketing and personnel optimizations, Sean is a strategic leader proficient in enhancing audience engagement and campaign effectiveness.",
    image: sean,
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
                    className="w-full h-48 object-cover object-top group-hover:scale-105 transition-transform duration-300"
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
