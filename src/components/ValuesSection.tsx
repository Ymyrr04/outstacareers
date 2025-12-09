const values = [
  {
    id: "01",
    title: "Take Charge of Your Career",
    description: "We give you the space and support to make decisions, solve problems, and show what you can do.",
  },
  {
    id: "02",
    title: "Keep Growing",
    description: "Every role is a chance to learn new skills, take on challenges, and reach your next level.",
  },
  {
    id: "03", 
    title: "Build Trust That Opens Doors",
    description: "Your consistency, communication, and reliability create opportunities for long-term success.",
  },
  {
    id: "04",
    title: "Own Your Wins",
    description: "Take pride in your results, and use every experience — good or bad — to become stronger.",
  },
  {
    id: "05",
    title: "Work with Integrity",
    description: "Do your best work with honesty, respect, and professionalism in everything you do.",
  },
];

const ValuesSection = () => {
  return (
    <section id="values" className="py-20 bg-card">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-16">
          <h2 className="text-4xl md:text-5xl font-bold text-foreground mb-4">
            How We Show Up at OutSta
          </h2>
          <p className="text-xl text-muted-foreground max-w-2xl mx-auto">
            Our values shape how we work, grow, and succeed — together.
          </p>
        </div>
        
        <div className="space-y-8">
          {values.map((value, index) => (
            <div 
              key={value.id}
              className="group flex items-start space-x-6 p-6 rounded-xl hover:bg-accent/50 transition-all duration-300 animate-slide-up"
              style={{ animationDelay: `${index * 0.1}s` }}
            >
              <div className="flex-shrink-0">
                <div className="w-16 h-16 bg-gradient-hero rounded-full flex items-center justify-center text-2xl font-bold text-white group-hover:scale-110 transition-transform duration-300">
                  {value.id}
                </div>
              </div>
              <div className="flex-grow">
                <h3 className="text-2xl font-bold text-foreground mb-3 group-hover:text-primary transition-colors duration-300">
                  {value.title}
                </h3>
                <p className="text-lg text-muted-foreground leading-relaxed">
                  {value.description}
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};

export default ValuesSection;