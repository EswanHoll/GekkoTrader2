import { Navigate, Outlet, useLocation } from "react-router-dom";
import { useAuthSession } from "@/hooks/useAuthSession";

/**
 * Protect the workspace shell — any signed-in user.
 * Anonymous visitors never mount Layout / Sidebar / desks.
 */
export function AuthGate() {
  const { signedIn } = useAuthSession();
  const location = useLocation();

  if (!signedIn) {
    const next = encodeURIComponent(location.pathname + location.search);
    return <Navigate to={`/login/?force=1&next=${next}`} replace />;
  }
  return <Outlet />;
}
