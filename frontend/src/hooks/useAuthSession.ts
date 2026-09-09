import { useQuery } from "@tanstack/react-query";
import { ApiError, fetchAuthMe } from "@/api/client";
import {
  clearAuthSession,
  getAuthToken,
  getAuthUser,
  isAdminRole,
  setAuthSession,
  type AuthUser,
} from "@/lib/auth";

/**
 * Soft-refresh the signed-in user via GET /api/auth/me.
 * Keeps localStorage role claims current for Admin RBAC.
 */
export function useAuthSession() {
  const token = getAuthToken();
  const cached = getAuthUser();

  const query = useQuery({
    queryKey: ["auth", "me", token || "anon"],
    enabled: !!token,
    staleTime: 60_000,
    retry: false,
    queryFn: async (): Promise<AuthUser> => {
      try {
        const me = await fetchAuthMe();
        const user: AuthUser = {
          ...(cached || {}),
          email: me.email || cached?.email,
          role: me.role || cached?.role,
          is_super_admin: !!(
            me.is_super_admin ||
            me.role === "super_admin" ||
            cached?.is_super_admin
          ),
          id: me.id ?? cached?.id,
        };
        setAuthSession(token, user);
        return user;
      } catch (err) {
        if (
          err instanceof ApiError &&
          (err.status === 401 || err.status === 403)
        ) {
          clearAuthSession();
          return {};
        }
        // Soft-fail: keep cached user if Control /me is briefly unavailable.
        return cached || {};
      }
    },
    initialData: cached || undefined,
  });

  const user = (query.data && Object.keys(query.data).length
    ? query.data
    : cached) || null;
  return {
    token,
    user,
    signedIn: !!token,
    isAdmin: isAdminRole(user),
    isLoading: !!token && query.isLoading && !cached,
    refresh: query.refetch,
  };
}
