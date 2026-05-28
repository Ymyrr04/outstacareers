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

  if (isWorkforceDomain() && !location.pathname.startsWith("/client-portal")) {
    return <Navigate to="/client-portal/login" replace />;
  }

  return <>{children}</>;
};

export default DomainGuard;
