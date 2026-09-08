import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate } from "react-router-dom";
import {
  approveAuthUser,
  fetchAuthUsers,
  rejectAuthUser,
  setAuthUserRole,
  type AuthUserRow,
} from "@/api/client";
import { getAuthToken, getAuthUser } from "@/lib/auth";

const ROLES = ["view_only", "super_admin"] as const;

function roleLabel(role?: string): string {
  if (role === "super_admin") return "Super admin";
  if (role === "view_only") return "View only";
  return role || "Unknown role";
}

function statusLabel(status?: string): string {
  const s = String(status || "").toLowerCase();
  if (s === "active") return "Active";
  if (s === "pending") return "Pending";
  if (s === "rejected") return "Rejected";
  return status || "Unknown";
}

export function AdminUsers() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const user = getAuthUser();
  const [view, setView] = useState<"pending" | "all">("pending");
  const [status, setStatus] = useState("");
  const [roleDraft, setRoleDraft] = useState<Record<string, string>>({});

  const isSuper = user?.role === "super_admin" || !!user?.is_super_admin;

  useEffect(() => {
    if (!getAuthToken()) {
      navigate(`/login/?next=${encodeURIComponent("/admin/users/")}`, {
        replace: true,
      });
    }
  }, [navigate]);

  const usersQ = useQuery({
    queryKey: ["auth", "users"],
    queryFn: fetchAuthUsers,
    enabled: !!getAuthToken() && isSuper,
    staleTime: 10_000,
  });

  const mutateApprove = useMutation({
    mutationFn: ({ id, role }: { id: string | number; role: string }) =>
      approveAuthUser(id, role),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["auth", "users"] }),
  });
  const mutateReject = useMutation({
    mutationFn: (id: string | number) => rejectAuthUser(id),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["auth", "users"] }),
  });
  const mutateRole = useMutation({
    mutationFn: ({ id, role }: { id: string | number; role: string }) =>
      setAuthUserRole(id, role),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["auth", "users"] }),
  });

  const rows = usersQ.data || [];
  const pending = useMemo(
    () => rows.filter((u) => String(u.status).toLowerCase() === "pending"),
    [rows]
  );

  function selectedRole(u: AuthUserRow): string {
    const key = String(u.id);
    return (
      roleDraft[key] ||
      (u.role === "super_admin" ? "super_admin" : "view_only")
    );
  }

  if (!isSuper) {
    return (
      <section data-testid="admin-users-page">
        <h1 className="text-2xl font-extrabold">Users</h1>
        <p className="mt-2 text-red-400" data-testid="admin-users-forbidden">
          Super admin access required.
        </p>
      </section>
    );
  }

  return (
    <section className="space-y-6" data-testid="admin-users-page">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.14em] text-gekko">
            Super admin
          </p>
          <h1 className="mt-1 text-3xl font-extrabold">Users</h1>
          <p className="mt-2 text-gekko-muted">
            Approve pending registrations, then manage roles.
          </p>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            id="tabPending"
            data-testid="admin-users-tab-pending"
            className={`rounded px-3 py-1.5 text-sm ${view === "pending" ? "bg-gekko/20 text-gekko" : "border border-gekko-border"}`}
            onClick={() => setView("pending")}
          >
            Pending
          </button>
          <button
            type="button"
            id="tabAll"
            data-testid="admin-users-tab-all"
            className={`rounded px-3 py-1.5 text-sm ${view === "all" ? "bg-gekko/20 text-gekko" : "border border-gekko-border"}`}
            onClick={() => setView("all")}
          >
            All users
          </button>
          <button
            type="button"
            id="btnRefreshUsers"
            data-testid="admin-users-refresh"
            className="rounded border border-gekko-border px-3 py-1.5 text-sm"
            onClick={() => void usersQ.refetch()}
          >
            Refresh
          </button>
        </div>
      </div>

      <p className="text-sm text-gekko-muted" id="usersCopy" data-testid="admin-users-copy">
        {view === "pending"
          ? pending.length
            ? `${pending.length} pending`
            : "No pending requests"
          : `${rows.length} account${rows.length === 1 ? "" : "s"}`}
      </p>
      <p
        id="adminStatus"
        data-testid="admin-users-status"
        className="text-sm text-gekko-muted"
      >
        {status ||
          (usersQ.isError
            ? usersQ.error instanceof Error
              ? usersQ.error.message
              : "Could not load users"
            : "")}
      </p>

      {view === "pending" ? (
        <div className="overflow-x-auto rounded-lg border border-gekko-border" id="pendingWrap">
          <table className="w-full min-w-[560px] text-left text-sm" id="pendingTable">
            <thead className="bg-gekko-surface/80 text-xs uppercase text-gekko-muted">
              <tr>
                <th className="px-3 py-2">Email</th>
                <th className="px-3 py-2">Requested</th>
                <th className="px-3 py-2">Role</th>
                <th className="px-3 py-2">Actions</th>
              </tr>
            </thead>
            <tbody id="pendingBody" data-testid="admin-users-pending-body">
              {!pending.length ? (
                <tr>
                  <td colSpan={4} className="px-3 py-6 text-center text-gekko-muted">
                    No pending requests
                  </td>
                </tr>
              ) : (
                pending.map((u) => (
                  <tr key={String(u.id)} className="border-t border-gekko-border/80">
                    <td className="px-3 py-2">{u.email}</td>
                    <td className="px-3 py-2 font-mono text-xs">
                      {u.created_at || "—"}
                    </td>
                    <td className="px-3 py-2">
                      <select
                        className="rounded border border-gekko-border bg-gekko-surface px-2 py-1"
                        value={selectedRole(u)}
                        data-testid={`admin-role-select-${u.id}`}
                        onChange={(e) =>
                          setRoleDraft((d) => ({
                            ...d,
                            [String(u.id)]: e.target.value,
                          }))
                        }
                      >
                        {ROLES.map((r) => (
                          <option key={r} value={r}>
                            {roleLabel(r)}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="px-3 py-2 space-x-2">
                      <button
                        type="button"
                        className="rounded bg-gekko px-2 py-1 text-xs font-bold text-gekko-bg"
                        data-testid={`admin-approve-${u.id}`}
                        onClick={async () => {
                          try {
                            setStatus(`Approving ${u.email}…`);
                            await mutateApprove.mutateAsync({
                              id: u.id,
                              role: selectedRole(u),
                            });
                            setStatus(`Approved ${u.email}.`);
                          } catch (err) {
                            setStatus(
                              err instanceof Error ? err.message : "Approve failed"
                            );
                          }
                        }}
                      >
                        Approve
                      </button>
                      <button
                        type="button"
                        className="rounded border border-gekko-border px-2 py-1 text-xs"
                        data-testid={`admin-reject-${u.id}`}
                        onClick={async () => {
                          try {
                            setStatus(`Rejecting ${u.email}…`);
                            await mutateReject.mutateAsync(u.id);
                            setStatus(`Rejected ${u.email}.`);
                          } catch (err) {
                            setStatus(
                              err instanceof Error ? err.message : "Reject failed"
                            );
                          }
                        }}
                      >
                        Reject
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-gekko-border" id="allWrap">
          <table className="w-full min-w-[560px] text-left text-sm" id="usersTable">
            <thead className="bg-gekko-surface/80 text-xs uppercase text-gekko-muted">
              <tr>
                <th className="px-3 py-2">Email</th>
                <th className="px-3 py-2">Status</th>
                <th className="px-3 py-2">Role</th>
                <th className="px-3 py-2">Created</th>
              </tr>
            </thead>
            <tbody id="usersBody" data-testid="admin-users-all-body">
              {!rows.length ? (
                <tr>
                  <td colSpan={4} className="px-3 py-6 text-center text-gekko-muted">
                    No users
                  </td>
                </tr>
              ) : (
                rows.map((u) => (
                  <tr key={String(u.id)} className="border-t border-gekko-border/80">
                    <td className="px-3 py-2">{u.email}</td>
                    <td className="px-3 py-2">{statusLabel(u.status)}</td>
                    <td className="px-3 py-2">
                      {String(u.status).toLowerCase() === "pending" ? (
                        <span className="text-gekko-muted">Approve in Pending</span>
                      ) : (
                        <select
                          className="rounded border border-gekko-border bg-gekko-surface px-2 py-1"
                          value={u.role === "super_admin" ? "super_admin" : "view_only"}
                          data-testid={`admin-role-all-${u.id}`}
                          onChange={async (e) => {
                            const role = e.target.value;
                            try {
                              setStatus(`Updating role for ${u.email}…`);
                              await mutateRole.mutateAsync({ id: u.id, role });
                              setStatus(`Updated ${u.email} to ${roleLabel(role)}.`);
                            } catch (err) {
                              setStatus(
                                err instanceof Error
                                  ? err.message
                                  : "Could not update role"
                              );
                            }
                          }}
                        >
                          {ROLES.map((r) => (
                            <option key={r} value={r}>
                              {roleLabel(r)}
                            </option>
                          ))}
                        </select>
                      )}
                    </td>
                    <td className="px-3 py-2 font-mono text-xs">
                      {u.created_at || "—"}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}

      <p className="text-sm text-gekko-muted">
        <Link to="/admin/" className="text-gekko underline">
          Admin home
        </Link>
      </p>
    </section>
  );
}
