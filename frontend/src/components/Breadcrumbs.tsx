import { Link, useLocation } from "react-router-dom";
import { deskLabel, parseScopeFromPath } from "@/lib/scope";
import { normalizePath } from "@/lib/navigation";

type Crumb = { label: string; href?: string };

function crumbsFor(pathname: string): Crumb[] {
  const path = normalizePath(pathname);
  const parts = path.split("/").filter(Boolean);
  const crumbs: Crumb[] = [{ label: "Home", href: "/overview/" }];

  if (!parts.length || parts[0] === "overview") {
    if (parts[1] === "strategies") crumbs.push({ label: "Strategies" });
    else if (parts[1] === "roadmaps") crumbs.push({ label: "Roadmaps" });
    return crumbs;
  }

  if (parts[0] === "status") {
    crumbs.push({ label: "Status" });
    return crumbs;
  }
  if (parts[0] === "audit") {
    crumbs.push({ label: "Promotion Audit" });
    return crumbs;
  }
  if (parts[0] === "admin") {
    crumbs.push({ label: "Admin", href: "/admin/" });
    if (parts[1]) {
      crumbs.push({
        label: parts[1].charAt(0).toUpperCase() + parts[1].slice(1),
      });
    }
    return crumbs;
  }
  if (parts[0] === "login") {
    return [{ label: "Sign in" }];
  }

  try {
    const scope = parseScopeFromPath(path);
    if (scope) {
      const deskHref =
        scope.execution_env === "live"
          ? "/live/"
          : `/${scope.execution_env}/${scope.lane}/`;
      crumbs.push({ label: deskLabel(scope), href: deskHref });
      const surface = parts[scope.execution_env === "live" ? 1 : 2];
      if (surface) {
        const labels: Record<string, string> = {
          results: "Results",
          setup: "Strategy",
          runs: "Reports",
          compare: "Compare",
        };
        crumbs.push({ label: labels[surface] || surface });
      } else if (scope.execution_env !== "live") {
        crumbs.push({ label: "Desk" });
      }
    }
  } catch {
    crumbs.push({ label: "Page" });
  }
  return crumbs;
}

export function Breadcrumbs() {
  const { pathname } = useLocation();
  const crumbs = crumbsFor(pathname);

  return (
    <nav aria-label="Breadcrumb" className="text-sm text-gekko-muted">
      <ol className="flex flex-wrap items-center gap-1.5">
        {crumbs.map((crumb, idx) => {
          const last = idx === crumbs.length - 1;
          return (
            <li key={`${crumb.label}-${idx}`} className="flex items-center gap-1.5">
              {idx > 0 ? <span aria-hidden="true">/</span> : null}
              {crumb.href && !last ? (
                <Link
                  to={crumb.href}
                  className="hover:text-gekko transition-colors"
                >
                  {crumb.label}
                </Link>
              ) : (
                <span className={last ? "text-white font-semibold" : undefined}>
                  {crumb.label}
                </span>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
