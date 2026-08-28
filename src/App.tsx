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
import StageSettings from "./pages/StageSettings";
import PortalLogin from "./pages/PortalLogin";
import PortalChangePassword from "./pages/PortalChangePassword";
import PortalResetPassword from "./pages/PortalResetPassword";
import PortalDashboard from "./pages/PortalDashboard";
import SignContract from "./pages/SignContract";
import CountersignContract from "./pages/CountersignContract";
import ClientPortalLogin from "./pages/ClientPortalLogin";
import ClientPortalChangePassword from "./pages/ClientPortalChangePassword";
import ClientPortalDashboard from "./pages/ClientPortalDashboard";
import ClientPortalSetup from "./pages/ClientPortalSetup";
import ClientPortalResetPassword from "./pages/ClientPortalResetPassword";
import GmailOAuthReturn from "./pages/GmailOAuthReturn";
import DomainGuard from "./components/DomainGuard";
import DesignPreviewToggle from "./components/DesignPreviewToggle";


const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      refetchOnReconnect: false,
      staleTime: 5 * 60 * 1000,
    },
  },
});

const guard = (element: React.ReactNode) => <DomainGuard>{element}</DomainGuard>;

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
                {/* Root: guarded so workforce domain bounces to client portal */}
                <Route path="/" element={guard(<Index />)} />
                <Route path="/careers" element={guard(<Index />)} />
                <Route path="/auth" element={guard(<Auth />)} />
                <Route path="/reset-password" element={guard(<ResetPassword />)} />
                <Route path="/admin" element={guard(<Admin />)} />
                <Route path="/admin/stage-settings" element={guard(<StageSettings />)} />
                <Route path="/admin/:tab" element={guard(<Admin />)} />
                <Route path="/admin/:tab" element={guard(<Admin />)} />
                <Route path="/jobs/:company/:titleSlug/:jobId" element={guard(<JobApplication />)} />
                <Route path="/job/:jobId" element={guard(<JobDetails />)} />
                <Route path="/apply/:jobId" element={guard(<ApplyJob />)} />
                <Route path="/interview/:sessionId" element={guard(<ResumeInterview />)} />
                <Route path="/image-editor" element={guard(<ImageEditor />)} />
                <Route path="/auth/calendly/callback" element={guard(<CalendlyCallback />)} />
                <Route path="/talent-pool" element={guard(<TalentPool />)} />
                <Route path="/portal/login" element={guard(<PortalLogin />)} />
                <Route path="/portal/change-password" element={guard(<PortalChangePassword />)} />
                <Route path="/portal/reset-password" element={guard(<PortalResetPassword />)} />
                <Route path="/portal" element={guard(<PortalDashboard />)} />
                <Route path="/sign/:token" element={guard(<SignContract />)} />
                <Route path="/countersign/:token" element={guard(<CountersignContract />)} />

                {/* Gmail App User Connector OAuth return (popup) */}
                <Route path="/oauth/google_mail/return" element={<GmailOAuthReturn />} />


                {/* Client portal routes are accessible from BOTH domains */}
                <Route path="/client-portal/login" element={<ClientPortalLogin />} />
                <Route path="/client-portal/change-password" element={<ClientPortalChangePassword />} />
                <Route path="/client-portal/reset-password" element={<ClientPortalResetPassword />} />
                <Route path="/client-portal/setup" element={<ClientPortalSetup />} />
                <Route path="/client-portal" element={<ClientPortalDashboard />} />
                <Route path="/client-portal/timesheets" element={<ClientPortalDashboard />} />

                {/* Catch-all also guarded so unknown paths on workforce domain bounce */}
                <Route path="*" element={guard(<NotFound />)} />
              </Routes>
            </BrowserRouter>
            <DesignPreviewToggle />
          </TooltipProvider>

        </AuthProvider>
      </QueryClientProvider>
    </ThemeProvider>
  </HelmetProvider>
);

export default App;
