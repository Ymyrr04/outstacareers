import { Navigate, useLocation } from "react-router-dom";

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

  if (workforce && !location.pathname.startsWith("/client-portal")) {
    return <Navigate to="/client-portal" replace />;
  }

  return <>{children}</>;
};

export default DomainGuard;
