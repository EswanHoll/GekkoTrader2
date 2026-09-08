import { Link } from "react-router-dom";

const LINKS = [
  {
    href: "/admin/users/",
    title: "Users",
    copy: "Approve pending registrations and manage roles.",
  },
  {
    href: "/admin/keys/",
    title: "Keys",
    copy: "Exchange keys in AWS Secrets Manager for Live / Demo.",
  },
  {
    href: "/admin/operator/",
    title: "Operator",
    copy: "Start / stop environments and freeze trading.",
  },
  {
    href: "/admin/audit/",
    title: "Audit Logs",
    copy: "Promotion and live-activation compliance trail.",
  },
] as const;

export function AdminHome() {
  return (
    <section className="space-y-6" data-testid="admin-home-page">
      <div>
        <p className="text-sm font-semibold uppercase tracking-[0.14em] text-gekko">
          Super admin
        </p>
        <h1 className="mt-1 text-3xl font-extrabold tracking-tight">Admin</h1>
        <p className="mt-2 text-gekko-muted">
          Fleet controls and account administration.
        </p>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {LINKS.map((item) => (
          <Link
            key={item.href}
            to={item.href}
            data-testid={`admin-link-${item.title.toLowerCase()}`}
            className="rounded-lg border border-gekko-border bg-gekko-surface/60 px-4 py-4 hover:border-gekko/40"
          >
            <div className="text-lg font-bold">{item.title}</div>
            <p className="mt-2 text-sm text-gekko-muted">{item.copy}</p>
          </Link>
        ))}
      </div>
    </section>
  );
}
