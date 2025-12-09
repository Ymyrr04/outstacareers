import { Card, CardContent } from "@/components/ui/card";
import teamPhoto from "@/assets/team-photo.jpg";
import teamValues from "@/assets/team-values.png";
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
    image: adamTabari,
    description: "Adam Tabari, the founder and CEO of Outsta, is committed to bridging the gap between exceptional global talent and Western businesses, achieving significant savings and ongoing support. His visionary approach to cost-effective, skilled staffing solutions profoundly impacts the staffing sector."
  },
  {
    name: "Adam W.",
    role: "Client Growth & Optimization Specialist",
    image: adamW,
    description: "Adam harnesses data science, creative insights, and both emerging and proven tech platforms to enhance client-candidate alignment and drive business growth."
  },
  {
    name: "Adri",
    role: "Contractor Onboarding & Performance",
    image: adri,
    description: "Adrianne spearheads marketing and onboarding at Outsta, ensuring engaging and effective processes. She is adept at creating memorable onboarding experiences that allow new hires to integrate seamlessly into our culture."
  },
  {
    name: "Eduardo",
    role: "Bilingual Contractor Recruitment and Client HR Strategy & Support",
    image: eduardo,
    description: "Eduardo specializes in recruiting across Latin America, focusing on bilingual positions and streamlining the hiring process. His expertise in building strong relationships and handling HR matters is instrumental in surpassing client expectations."
  },
  {
    name: "Cza",
    role: "Client HR Strategy & Support and Contractor Recruitment",
    image: cza,
    description: "Czarina oversees the recruitment process, prioritizing clear communication and strong connections between client and contractor that contribute to collective success."
  },
  {
    name: "Kristine",
    role: "Client HR Strategy & Support and Candidate Recruitment",
    image: kristine,
    description: "Kristine dedicates herself to streamlining the hiring process, aligning client needs with candidate capabilities. Her focus on building lasting partnerships enhances our talent acquisition efforts."
  },
  {
    name: "Mark",
    role: "Client Satisfaction & Development",
    image: mark,
    description: "Mark is committed to establishing strong connections that drive growth and enduring success for both clients and contractors. His focus on fostering meaningful partnerships underscores Outsta's mission."
  },
  {
    name: "Sean de Luna",
    role: "Strategic Engagement Advisor",
    image: sean,
    description: "With extensive experience in marketing and personnel optimizations, Sean is a strategic leader proficient in enhancing audience engagement and campaign effectiveness."
  },
];

const AboutSection = () => {
  return (
    <section id="about" className="py-20 bg-background">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="text-center mb-16">
          <span className="text-primary font-medium text-sm uppercase tracking-wider">
            About Outsta
          </span>
          <h2 className="text-4xl md:text-5xl font-bold text-foreground mt-2 mb-4">
            Meet Outsta: Where Exceptional People Power Your Success
          </h2>
        </div>

        {/* Empowering Growth Section */}
        <div className="mb-20">
          <div className="grid md:grid-cols-2 gap-12 items-center">
            <div>
              <h3 className="text-2xl md:text-3xl font-bold text-foreground mb-6">
                Empowering Your Growth with Expert Staffing Solutions
              </h3>
              <p className="text-muted-foreground text-lg leading-relaxed">
                At Outsta, we recognize that the core of your business is its people, which is why we mirror that importance in our own operations. We prioritize having the best talent on our team to ensure we identify and match the best candidates for our clients. As your strategic HR partner, we go beyond simple staffing; we deeply integrate into your operations to streamline recruitment processes, reduce long-term staffing costs, and significantly enhance operational efficiency. This commitment to quality in both our team and the candidates we provide safeguards your bottom line and drives your business success.
              </p>
            </div>
            <div className="rounded-2xl overflow-hidden shadow-card">
              <img 
                src={teamPhoto} 
                alt="Outsta Team" 
                className="w-full h-auto object-cover"
              />
            </div>
          </div>
        </div>

        {/* Core Values Section */}
        <div className="mb-20">
          <div className="grid md:grid-cols-2 gap-12 items-center">
            <div className="order-2 md:order-1 rounded-2xl overflow-hidden shadow-card">
              <img 
                src={teamValues} 
                alt="Our Team Values" 
                className="w-full h-auto object-cover"
              />
            </div>
            <div className="order-1 md:order-2">
              <h3 className="text-2xl md:text-3xl font-bold text-foreground mb-6">
                Our Team, Serving Your Team — Driven by Core Values, Dedicated to Your Success
              </h3>
              <p className="text-muted-foreground text-lg leading-relaxed">
                Outsta is not just a staffing agency; we are a team driven by the principles of Empowerment, Adaptability, Integrity, Collaboration, and Continuous Improvement. These core values shape our interactions with clients and nurture robust relationships. By ensuring every professional we place is not only skilled but also a perfect fit for your company's culture, we solidify our commitment to making a tangible difference in your business.
              </p>
            </div>
          </div>
        </div>

        {/* Team Members */}
        <div>
          <h3 className="text-3xl md:text-4xl font-bold text-foreground text-center mb-12">
            Meet Our Team
          </h3>
          <div className="grid gap-8 md:grid-cols-2 lg:grid-cols-4">
            {teamMembers.map((member, index) => (
              <Card 
                key={member.name}
                className="group hover:shadow-lg transition-all duration-300 overflow-hidden animate-fade-in"
                style={{ animationDelay: `${index * 100}ms` }}
              >
                <div className="aspect-square overflow-hidden bg-muted">
                  <img 
                    src={member.image} 
                    alt={member.name}
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                  />
                </div>
                <CardContent className="p-5">
                  <h4 className="text-lg font-bold text-foreground mb-1">
                    {member.name}
                  </h4>
                  <p className="text-primary text-sm font-medium mb-3">
                    {member.role}
                  </p>
                  <p className="text-muted-foreground text-sm line-clamp-4">
                    {member.description}
                  </p>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
};

export default AboutSection;
