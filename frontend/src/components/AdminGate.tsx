import { Navigate, Outlet, useLocation } from "react-router-dom";
import { useAuthSession } from "@/hooks/useAuthSession";

/**
 * Protect `/admin/*` — super_admin only. Others land on Home.
 */
export function AdminGate() {
  const { signedIn, isAdmin, isLoading } = useAuthSession();
  const location = useLocation();

  if (!signedIn) {
    const next = encodeURIComponent(location.pathname + location.search);
    return <Navigate to={`/login/?force=1&next=${next}`} replace />;
  }
  if (isLoading && !isAdmin) {
    return (
      <p className="text-sm text-gekko-muted" data-testid="admin-gate-loading">
        Checking admin access…
      </p>
    );
  }
  if (!isAdmin) {
    return <Navigate to="/overview/" replace />;
  }
  return <Outlet />;
}
