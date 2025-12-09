import { Star, Quote, User } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";

const allReviews = [
  {
    id: 1,
    name: "Miguel Rodriguez",
    role: "I.T Helpdesk",
    rating: 5,
    text: "OutSta found me the perfect remote role where I can truly grow my career. The support team is incredible and always available when I need guidance. They matched me with a client that values my skills and gives me room to innovate.",
    type: "contractor"
  },
  {
    id: 2,
    name: "Camila Torres",
    role: "Bilingual Receptionist",
    rating: 5,
    text: "Working with global clients through OutSta has expanded my skills and network beyond what I imagined. The diversity of projects keeps me challenged and growing. Best career decision I've made.",
    type: "contractor"
  },
  {
    id: 3,
    name: "Jose Garcia",
    role: "Bilingual VA",
    rating: 5,
    text: "The matching process is spot-on. They really understand your strengths and career goals. I've been with my current client for over a year now, and it's been an amazing journey of professional growth.",
    type: "contractor"
  },
  {
    id: 4,
    name: "Ana Lopez",
    role: "Bilingual Marketing Assistant",
    rating: 5,
    text: "Outstanding support throughout the entire process. OutSta makes remote work meaningful by connecting you with clients who truly value your expertise. The onboarding was seamless.",
    type: "contractor"
  },
  {
    id: 5,
    name: "Diego Silva",
    role: "Bilingual IT HelpDesk",
    rating: 5,
    text: "Found my dream role in just 2 weeks. The team at OutSta really knows how to match talent with opportunity. They understand both technical skills and cultural fit perfectly.",
    type: "contractor"
  },
  {
    id: 6,
    name: "Gabriela Santos",
    role: "CCTV Assistant",
    rating: 5,
    text: "I've been working with OutSta for 3 years now. They've helped me transition between different projects seamlessly while maintaining career momentum. Truly professional service.",
    type: "employee"
  },
  {
    id: 7,
    name: "Luis Fernandez",
    role: "Purchasing Expeditor",
    rating: 5,
    text: "The quality of clients and projects through OutSta is exceptional. They don't just place you anywhere - they find the right fit where you can thrive and make real impact.",
    type: "employee"
  },
  {
    id: 8,
    name: "Carmen Ramirez",
    role: "VA Admin Assistant",
    rating: 5,
    text: "OutSta's approach to career development is unique. They genuinely care about your long-term growth, not just filling positions. My career has accelerated tremendously since joining.",
    type: "employee"
  }
];

const FullReviewsSection = () => {
  return (
    <section id="reviews" className="py-20 bg-card">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-16">
          <h2 className="text-4xl md:text-5xl font-bold text-foreground mb-4">
            Reviews & Testimonials
          </h2>
          <p className="text-xl text-muted-foreground max-w-3xl mx-auto">
            Hear from contractors and employees who've built successful careers with OutSta. 
            Real stories, real growth, real impact.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
          {allReviews.map((review, index) => (
            <Card 
              key={review.id} 
              className="group hover:shadow-xl transition-all duration-300 hover:-translate-y-2 animate-fade-in border-0 shadow-card"
              style={{ animationDelay: `${index * 0.1}s` }}
            >
              <CardContent className="p-6">
                <div className="flex items-center mb-4">
                  <div className="w-14 h-14 bg-accent rounded-full flex items-center justify-center mr-4 group-hover:scale-110 transition-transform duration-300">
                    <User className="w-7 h-7 text-primary" />
                  </div>
                  <div className="flex-grow">
                    <h4 className="font-semibold text-foreground text-lg">{review.name}</h4>
                    <p className="text-sm text-muted-foreground">{review.role}</p>
                    <div className="flex items-center mt-1">
                      <div className="flex mr-2">
                        {[...Array(review.rating)].map((_, i) => (
                          <Star key={i} className="w-4 h-4 fill-yellow-400 text-yellow-400" />
                        ))}
                      </div>
                      <span className="text-xs text-muted-foreground capitalize bg-accent px-2 py-1 rounded-full">
                        {review.type}
                      </span>
                    </div>
                  </div>
                </div>
                
                <div className="relative">
                  <Quote className="w-8 h-8 text-accent mb-3" />
                  <p className="text-muted-foreground leading-relaxed">
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

export default FullReviewsSection;