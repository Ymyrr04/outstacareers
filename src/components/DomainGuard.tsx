import { Navigate, useLocation } from "react-router-dom";

/**
 * Restricts non-client-portal routes when the app is loaded under
 * the outstaworkforce.com domain. On that domain users may only
 * access /client-portal/*; everything else redirects to the
 * client portal login.
 */
export const isWorkforceDomain = (): boolean =>
  typeof window !== "undefined" &&
  window.location.hostname.includes("outstaworkforce");

interface DomainGuardProps {
  children: React.ReactNode;
}

const DomainGuard = ({ children }: DomainGuardProps) => {
  const location = useLocation();
  const hostname = typeof window !== "undefined" ? window.location.hostname : "";
  const workforce = hostname.includes("outstaworkforce");

  // Debug: surface which hostname the browser actually sees.
  // If this never logs "outstaworkforce.com", the domain is being
  // redirected at the DNS/CDN level before React loads.
  console.log("[DomainGuard] hostname:", hostname, "path:", location.pathname);

  if (
    workforce &&
  if (workforce && !location.pathname.startsWith("/client-portal")) {
    return <Navigate to="/client-portal" replace />;
  }
};


export default DomainGuard;
