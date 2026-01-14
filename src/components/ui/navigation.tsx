import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/useAuth";
import { Settings } from "lucide-react";

const Navigation = () => {
  const { isAdmin } = useAuth();

  return (
    <nav className="w-full bg-card border-b shadow-sm">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center h-16">
          <div className="flex flex-col items-center">
            <img 
              src="/lovable-uploads/7836cf47-5f6b-4453-bba2-011eb015bafd.png" 
              alt="OutSta Logo" 
              className="h-6 w-6 mb-1"
            />
            <div className="flex flex-col items-center -space-y-1">
              <div className="text-lg font-bold text-primary leading-tight">OutSta</div>
              <div className="text-[10px] text-muted-foreground leading-tight">Talent Across Borders</div>
            </div>
          </div>
          <div className="hidden md:block">
            <div className="ml-10 flex items-baseline space-x-8">
              <a href="#benefits" className="text-foreground hover:text-primary transition-colors duration-200">
                Why OutSta
              </a>
              <a href="#reviews" className="text-foreground hover:text-primary transition-colors duration-200">
                Reviews
              </a>
              <a href="#values" className="text-foreground hover:text-primary transition-colors duration-200">
                Values
              </a>
              <a href="#positions" className="text-foreground hover:text-primary transition-colors duration-200">
                Open Positions
              </a>
            </div>
          </div>
          <div className="flex items-center gap-3">
            {isAdmin && (
              <Link to="/admin">
                <Button 
                  variant="ghost" 
                  size="sm"
                  className="text-muted-foreground hover:text-primary"
                >
                  <Settings className="w-4 h-4 mr-2" />
                  Admin
                </Button>
              </Link>
            )}
            <Button 
              variant="outline" 
              size="sm" 
              className="border-primary text-primary hover:bg-primary hover:text-primary-foreground"
              onClick={() => document.getElementById('positions')?.scrollIntoView({ behavior: 'smooth' })}
            >
              Apply Now
            </Button>
          </div>
        </div>
      </div>
    </nav>
  );
};

export default Navigation;