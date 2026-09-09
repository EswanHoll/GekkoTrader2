import type { NavGroup, NavPage, OperationalDesk } from "@/types/scope";

/** LOCKED operator order: Live → Demo A/B → Sim A/B */
export const OPERATIONAL_DESK_ORDER: readonly OperationalDesk[] = [
  {
    id: "live",
    execution_env: "live",
    lane: null,
    scope_key: "live",
    label: "Live",
    icon: "radio",
    accent: "live",
  },
  {
    id: "demo-a",
    execution_env: "demo",
    lane: "a",
    scope_key: "demo|a",
    label: "Demo A",
    icon: "activity",
    accent: "a",
  },
  {
    id: "demo-b",
    execution_env: "demo",
    lane: "b",
    scope_key: "demo|b",
    label: "Demo B",
    icon: "activity",
    accent: "b",
  },
  {
    id: "sim-a",
    execution_env: "sim",
    lane: "a",
    scope_key: "sim|a",
    label: "Sim A",
    icon: "flask",
    accent: "a",
  },
  {
    id: "sim-b",
    execution_env: "sim",
    lane: "b",
    scope_key: "sim|b",
    label: "Sim B",
    icon: "flask",
    accent: "b",
  },
] as const;

function laneChildren(
  execution_env: "sim" | "demo",
  lane: "a" | "b"
): NavPage[] {
  const base = `/${execution_env}/${lane}`;
  const accent = lane;
  const children: NavPage[] = [
    {
      id: `${execution_env}-${lane}-desk`,
      kind: "page",
      label: "Desk",
      href: `${base}/`,
      icon: "activity",
      exact: true,
      accent,
    },
    {
      id: `${execution_env}-${lane}-results`,
      kind: "page",
      label: "Results",
      href: `${base}/results/`,
      icon: "chart",
      exact: true,
      accent,
    },
    {
      id: `${execution_env}-${lane}-setup`,
      kind: "page",
      label: "Strategy",
      href: `${base}/setup/`,
      icon: "sliders",
      exact: true,
      accent,
    },
    {
      id: `${execution_env}-${lane}-runs`,
      kind: "page",
      label: "Reports",
      href: `${base}/runs/`,
      icon: "list",
      exact: true,
      accent,
    },
  ];
  if (execution_env === "sim") {
    children.push({
      id: `${execution_env}-${lane}-compare`,
      kind: "page",
      label: "Compare",
      href: `${base}/compare/`,
      icon: "chart",
      exact: true,
      accent,
    });
  }
  return children;
}

function deskNavGroup(desk: OperationalDesk): NavGroup {
  if (desk.execution_env === "live") {
    return {
      id: desk.id,
      kind: "group",
      label: desk.label,
      href: "/live/",
      icon: desk.icon,
      accent: desk.accent,
      children: [
        {
          id: "live-status",
          kind: "page",
          label: "Status",
          href: "/live/",
          icon: "radio",
          exact: true,
          accent: "live",
        },
      ],
    };
  }
  return {
    id: desk.id,
    kind: "group",
    label: desk.label,
    href: `/${desk.execution_env}/${desk.lane}/`,
    icon: desk.icon,
    accent: desk.accent,
    children: laneChildren(desk.execution_env, desk.lane!),
  };
}

export const HOME_GROUP: NavGroup = {
  id: "overview",
  kind: "home",
  label: "Home",
  href: "/overview/",
  icon: "home",
  accent: "a",
  children: [
    {
      id: "overview-main",
      kind: "page",
      label: "Home",
      href: "/overview/",
      icon: "home",
      exact: true,
      accent: "a",
    },
    {
      id: "overview-strategies",
      kind: "page",
      label: "Strategies",
      href: "/overview/strategies/",
      icon: "sliders",
      exact: true,
      accent: "a",
    },
    {
      id: "overview-roadmaps",
      kind: "page",
      label: "Roadmaps",
      href: "/overview/roadmaps/",
      icon: "list",
      exact: true,
      accent: "a",
    },
    {
      id: "status",
      kind: "page",
      label: "Status",
      href: "/status/",
      icon: "radio",
      exact: true,
      accent: "a",
    },
    {
      id: "audit",
      kind: "page",
      label: "Promotion Audit",
      href: "/audit/",
      icon: "list",
      exact: true,
      accent: "a",
    },
  ],
};

export const ADMIN_GROUP: NavGroup = {
  id: "admin",
  kind: "utility",
  label: "Admin",
  href: "/admin/",
  icon: "sliders",
  accent: "b",
  children: [
    {
      id: "admin-home",
      kind: "page",
      label: "Admin",
      href: "/admin/",
      icon: "sliders",
      exact: true,
      accent: "b",
    },
    {
      id: "admin-users",
      kind: "page",
      label: "Users",
      href: "/admin/users/",
      icon: "list",
      exact: true,
      accent: "b",
    },
    {
      id: "admin-keys",
      kind: "page",
      label: "Keys",
      href: "/admin/keys/",
      icon: "sliders",
      exact: true,
      accent: "b",
    },
    {
      id: "admin-operator",
      kind: "page",
      label: "Operator",
      href: "/admin/operator/",
      icon: "radio",
      exact: true,
      accent: "b",
    },
    {
      id: "admin-audit",
      kind: "page",
      label: "Audit Logs",
      href: "/admin/audit/",
      icon: "list",
      exact: true,
      accent: "b",
    },
  ],
};

/** Primary trading desks + Home (no Admin). */
export function buildPrimaryNavTree(): NavGroup[] {
  return [HOME_GROUP, ...OPERATIONAL_DESK_ORDER.map(deskNavGroup)];
}

/** @deprecated prefer buildPrimaryNavTree + ADMIN_GROUP when isAdmin */
export function buildNavTree(opts: { includeAdmin?: boolean } = {}): NavGroup[] {
  const primary = buildPrimaryNavTree();
  if (opts.includeAdmin === false) return primary;
  if (opts.includeAdmin === true) return [...primary, ADMIN_GROUP];
  // Default keeps Admin for back-compat with older callers/tests.
  return [...primary, ADMIN_GROUP];
}

export function normalizePath(pathname: string): string {
  if (!pathname) return "/";
  let path = pathname.startsWith("/") ? pathname : `/${pathname}`;
  if (path.length > 1 && !path.endsWith("/")) path = `${path}/`;
  return path;
}

export function isNavActive(
  href: string,
  pathname: string,
  exact?: boolean
): boolean {
  const here = normalizePath(pathname);
  const target = normalizePath(href);
  if (exact) return here === target;
  return here === target || here.startsWith(target);
}
