// App entry point
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { HelmetProvider } from "react-helmet-async";
import { ThemeProvider } from "next-themes";
import { AuthProvider } from "@/hooks/useAuth";
import Index from "./pages/Index";
import Auth from "./pages/Auth";
import ResetPassword from "./pages/ResetPassword";
import Admin from "./pages/Admin";
import JobApplication from "./pages/JobApplication";
import JobDetails from "./pages/JobDetails";
import ApplyJob from "./pages/ApplyJob";
import ResumeInterview from "./pages/ResumeInterview";
import ImageEditor from "./pages/ImageEditor";
import CalendlyCallback from "./pages/CalendlyCallback";
import TalentPool from "./pages/TalentPool";
import NotFound from "./pages/NotFound";
import AiUsage from "./pages/AiUsage";
import PortalLogin from "./pages/PortalLogin";
import PortalChangePassword from "./pages/PortalChangePassword";
import PortalDashboard from "./pages/PortalDashboard";
import SignContract from "./pages/SignContract";
import ClientPortalLogin from "./pages/ClientPortalLogin";
import ClientPortalChangePassword from "./pages/ClientPortalChangePassword";
import ClientPortalDashboard from "./pages/ClientPortalDashboard";

const queryClient = new QueryClient();

const App = () => (
  <HelmetProvider>
    <ThemeProvider attribute="class" defaultTheme="light" enableSystem>
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <TooltipProvider>
            <Toaster />
            <Sonner />
            <BrowserRouter>
              <Routes>
                <Route path="/" element={<Index />} />
                <Route path="/careers" element={<Index />} />
                <Route path="/auth" element={<Auth />} />
                <Route path="/reset-password" element={<ResetPassword />} />
                <Route path="/admin" element={<Admin />} />
                <Route path="/admin/ai-usage" element={<AiUsage />} />
                <Route path="/admin/:tab" element={<Admin />} />
                <Route path="/jobs/:company/:titleSlug/:jobId" element={<JobApplication />} />
                <Route path="/job/:jobId" element={<JobDetails />} />
                <Route path="/apply/:jobId" element={<ApplyJob />} />
                <Route path="/interview/:sessionId" element={<ResumeInterview />} />
                <Route path="/image-editor" element={<ImageEditor />} />
                <Route path="/auth/calendly/callback" element={<CalendlyCallback />} />
                <Route path="/talent-pool" element={<TalentPool />} />
                <Route path="/portal/login" element={<PortalLogin />} />
                <Route path="/portal/change-password" element={<PortalChangePassword />} />
                <Route path="/portal" element={<PortalDashboard />} />
                <Route path="/sign/:token" element={<SignContract />} />
                {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
                <Route path="*" element={<NotFound />} />
              </Routes>
            </BrowserRouter>
          </TooltipProvider>
        </AuthProvider>
      </QueryClientProvider>
    </ThemeProvider>
  </HelmetProvider>
);

export default App;
