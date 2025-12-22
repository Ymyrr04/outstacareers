const AboutSection = () => {
  return (
    <section id="about" className="py-20 bg-background">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
          <div>
            <h2 className="text-4xl md:text-5xl font-bold text-foreground mb-6">
              Meet Outsta: Where Exceptional People Power Your Success
            </h2>
            <h3 className="text-2xl font-semibold text-primary mb-6">
              Empowering Your Growth with Expert Staffing Solutions
            </h3>
            <p className="text-lg text-muted-foreground leading-relaxed">
              At Outsta, we recognize that the core of your business is its people, which is why we mirror that importance in our own operations. We prioritize having the best talent on our team to ensure we identify and match the best candidates for our clients. As your strategic HR partner, we go beyond simple staffing; we deeply integrate into your operations to streamline recruitment processes, reduce long-term staffing costs, and significantly enhance operational efficiency. This commitment to quality in both our team and the candidates we provide safeguards your bottom line and drives your business success.
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
