import { Star, User } from "lucide-react";
import Autoplay from "embla-carousel-autoplay";
import {
  Carousel,
  CarouselContent,
  CarouselItem,
  CarouselNext,
  CarouselPrevious,
} from "@/components/ui/carousel";

const reviews = [
  {
    id: 1,
    name: "Maria Santos",
    role: "CSR",
    rating: 5,
    text: "OutSta found me the perfect remote role where I can truly grow my career. The support team is incredible!"
  },
  {
    id: 2,
    name: "Juan Hernandez",
    role: "Social Media Manager",
    rating: 5,
    text: "Working with global clients through OutSta has expanded my skills and network beyond what I imagined."
  },
  {
    id: 3,
    name: "Isabella Reyes",
    role: "Medical VA",
    rating: 5,
    text: "The matching process is spot-on. They really understand your strengths and career goals."
  },
  {
    id: 4,
    name: "Carlos Dela Cruz",
    role: "Bilingual Legal Assistant",
    rating: 5,
    text: "Outstanding support throughout the entire process. OutSta makes remote work meaningful."
  },
  {
    id: 5,
    name: "Sofia Martinez",
    role: "Medical Biller",
    rating: 5,
    text: "Found my dream role in just 2 weeks. The team at OutSta really knows how to match talent with opportunity."
  }
];

const FloatingReviews = () => {
  // Duplicate reviews for seamless infinite scroll
  const duplicatedReviews = [...reviews, ...reviews];

  return (
    <section className="py-16 bg-gradient-section overflow-hidden">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-12">
          <h2 className="text-3xl md:text-4xl font-bold text-foreground mb-4">
            What Our Contractors Say
          </h2>
          <p className="text-lg text-muted-foreground">
            Real experiences from Filipino and Hispanic professionals who've built their careers with OutSta
          </p>
        </div>

        {/* Seamless scrolling container */}
        <div className="relative overflow-hidden">
          <div className="flex animate-smooth-scroll gap-6 w-max">
            {duplicatedReviews.map((review, index) => (
              <div 
                key={`${review.id}-${index}`} 
                className="bg-card rounded-xl p-6 shadow-card hover:shadow-xl transition-all duration-300 hover:-translate-y-1 w-80 flex-shrink-0"
              >
                <div className="flex items-center mb-4">
                  <div className="w-12 h-12 bg-accent rounded-full flex items-center justify-center mr-4">
                    <User className="w-6 h-6 text-primary" />
                  </div>
                  <div>
                    <h4 className="font-semibold text-foreground">{review.name}</h4>
                    <p className="text-sm text-muted-foreground">{review.role}</p>
                  </div>
                </div>
                
                <div className="flex mb-3">
                  {[...Array(review.rating)].map((_, i) => (
                    <Star key={i} className="w-4 h-4 fill-yellow-400 text-yellow-400" />
                  ))}
                </div>
                
                <p className="text-muted-foreground leading-relaxed">
                  "{review.text}"
                </p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
};

export default FloatingReviews;