import { Star, Quote, Briefcase, User } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";

const clientReviews = [
  {
    id: 1,
    name: "Michael R.",
    role: "CEO",
    rating: 5,
    text: "OutSta has transformed how we build our remote team. The talent quality is consistently excellent, and their vetting process ensures we get professionals who are ready to contribute from day one."
  },
  {
    id: 2,
    name: "Amanda H.",
    role: "Lawyer",
    rating: 5,
    text: "As a law firm, we needed bilingual legal assistants who could handle complex cases. OutSta delivered exceptional candidates who have become indispensable to our practice."
  },
  {
    id: 3,
    name: "James W.",
    role: "Founder",
    rating: 5,
    text: "We scaled from 5 to 30 team members with OutSta's help. They understand startup needs and provide flexible, skilled professionals who grow with your company."
  },
  {
    id: 4,
    name: "Lisa K.",
    role: "Owner",
    rating: 5,
    text: "Running a medical practice requires reliable, detail-oriented staff. OutSta's medical billing and VA professionals have exceeded every expectation. Highly recommend."
  },
  {
    id: 5,
    name: "David B.",
    role: "CEO",
    rating: 5,
    text: "Our company has worked with several staffing agencies, but OutSta stands out. Their contractors are professional, skilled, and culturally aligned with our values."
  },
  {
    id: 6,
    name: "Patricia N.",
    role: "Founder",
    rating: 5,
    text: "OutSta helped us launch our e-commerce business with top-tier marketing and admin support. Their team is responsive, and the talent is world-class."
  },
  {
    id: 7,
    name: "Robert K.",
    role: "Founder",
    rating: 5,
    text: "The quality of talent we've sourced through OutSta has been outstanding. They really understand what businesses need to succeed in today's remote-first world."
  },
  {
    id: 8,
    name: "Sarah M.",
    role: "Owner",
    rating: 5,
    text: "We've partnered with OutSta for over two years. They consistently deliver talented professionals who exceed expectations and integrate seamlessly with our team."
  }
];

const ClientReviewsSection = () => {
  return (
    <section id="client-reviews" className="py-20 bg-gradient-section">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-16">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-accent rounded-full mb-6">
            <Briefcase className="w-8 h-8 text-primary" />
          </div>
          <h2 className="text-4xl md:text-5xl font-bold text-foreground mb-4">
            What Our Clients Say
          </h2>
          <p className="text-xl text-muted-foreground max-w-3xl mx-auto">
            Trusted by businesses across industries. See why companies choose OutSta 
            to build their remote teams.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {clientReviews.map((review, index) => (
            <Card 
              key={review.id} 
              className="group hover:shadow-xl transition-all duration-300 hover:-translate-y-2 animate-fade-in border-0 shadow-card"
              style={{ animationDelay: `${index * 0.1}s` }}
            >
              <CardContent className="p-6">
                <div className="flex items-center mb-4">
                  <div className="w-12 h-12 bg-accent rounded-full flex items-center justify-center mr-3 group-hover:scale-110 transition-transform duration-300">
                    <User className="w-6 h-6 text-primary" />
                  </div>
                  <div className="flex-grow">
                    <h4 className="font-semibold text-foreground">{review.name}</h4>
                    <p className="text-xs text-muted-foreground">{review.role}</p>
                  </div>
                </div>
                
                <div className="flex mb-3">
                  {[...Array(review.rating)].map((_, i) => (
                    <Star key={i} className="w-4 h-4 fill-yellow-400 text-yellow-400" />
                  ))}
                </div>
                
                <div className="relative">
                  <Quote className="w-6 h-6 text-accent mb-2 opacity-50" />
                  <p className="text-muted-foreground leading-relaxed text-sm">
                    {review.text}
                  </p>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </section>
  );
};

export default ClientReviewsSection;