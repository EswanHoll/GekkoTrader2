/**
 * Greenfield navigation — env-before-lane routes (Naming Standard §8).
 * Operational desk order (LOCKED operator priority):
 *   Live → Demo A → Demo B → Sim A → Sim B
 * Overview/home/admin utilities may surround that sequence but must not
 * reorder the operational desks.
 *
 * Works in browser (window.GekkoNavigationConfig) and Node (module.exports).
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) {
    module.exports = api;
  }
  if (root) {
    root.GekkoNavigationConfig = api;
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  const STORAGE = Object.freeze({
    lastScope: "gekko_last_scope",
    railState: "gekko_rail_state",
    expandedGroups: "gekko_expanded_groups",
  });

  /**
   * Canonical operational desk sequence. Every nav surface, selector, and
   * overview card list MUST derive order from this — no one-off DOM sorts.
   */
  const OPERATIONAL_DESK_ORDER = Object.freeze([
    Object.freeze({
      id: "live",
      execution_env: "live",
      lane: null,
      scope_key: "live",
      label: "Live",
      icon: "radio",
      accent: "live",
    }),
    Object.freeze({
      id: "demo-a",
      execution_env: "demo",
      lane: "a",
      scope_key: "demo|a",
      label: "Demo A",
      icon: "activity",
      accent: "a",
    }),
    Object.freeze({
      id: "demo-b",
      execution_env: "demo",
      lane: "b",
      scope_key: "demo|b",
      label: "Demo B",
      icon: "activity",
      accent: "b",
    }),
    Object.freeze({
      id: "sim-a",
      execution_env: "sim",
      lane: "a",
      scope_key: "sim|a",
      label: "Sim A",
      icon: "flask",
      accent: "a",
    }),
    Object.freeze({
      id: "sim-b",
      execution_env: "sim",
      lane: "b",
      scope_key: "sim|b",
      label: "Sim B",
      icon: "flask",
      accent: "b",
    }),
  ]);

  /** Env option order for scope selector: Live, then Demo, then Sim. */
  const EXECUTION_ENV_UI_ORDER = Object.freeze(["live", "demo", "sim"]);

  const ENV_OPTION_LABELS = Object.freeze({
    live: "Live",
    demo: "Demo",
    sim: "Sim",
  });

  function scopeKeyForDesk(desk) {
    if (!desk) return "";
    if (desk.scope_key) return desk.scope_key;
    if (desk.execution_env === "live") return "live";
    if (desk.execution_env && desk.lane) {
      return `${desk.execution_env}|${desk.lane}`;
    }
    return String(desk.id || "");
  }

  function operationalDeskIds() {
    return OPERATIONAL_DESK_ORDER.map((d) => d.id);
  }

  function sortDesksByOperationalOrder(desks) {
    const rank = new Map(
      OPERATIONAL_DESK_ORDER.map((d, i) => [d.scope_key, i])
    );
    return [...(desks || [])].sort((a, b) => {
      const ra = rank.has(scopeKeyForDesk(a))
        ? rank.get(scopeKeyForDesk(a))
        : 999;
      const rb = rank.has(scopeKeyForDesk(b))
        ? rank.get(scopeKeyForDesk(b))
        : 999;
      return ra - rb;
    });
  }

  function laneChildren(execution_env, lane) {
    const base = `/${execution_env}/${lane}`;
    const accent = lane === "a" ? "a" : "b";
    // Old-site L2 order: Desk · Results · Strategy · Reports (+ Compare on Sim).
    const children = [
      Object.freeze({
        id: `${execution_env}-${lane}-desk`,
        kind: "page",
        label: "Desk",
        href: `${base}/`,
        icon: "activity",
        exact: true,
        accent,
      }),
      Object.freeze({
        id: `${execution_env}-${lane}-results`,
        kind: "page",
        label: "Results",
        href: `${base}/results/`,
        icon: "chart",
        exact: true,
        accent,
      }),
    ];
    // Parity Plus: old Demo V1/V2 and Backtest exposed Strategy locally.
    if (execution_env === "sim" || execution_env === "demo") {
      children.push(
        Object.freeze({
          id: `${execution_env}-${lane}-setup`,
          kind: "page",
          label: "Strategy",
          href: `${base}/setup/`,
          icon: "sliders",
          exact: true,
          accent,
        })
      );
    }
    children.push(
      Object.freeze({
        id: `${execution_env}-${lane}-runs`,
        kind: "page",
        label: "Reports",
        href: `${base}/runs/`,
        icon: "list",
        exact: true,
        accent,
      })
    );
    if (execution_env === "sim") {
      children.push(
        Object.freeze({
          id: `${execution_env}-${lane}-compare`,
          kind: "page",
          label: "Compare",
          href: `${base}/compare/`,
          icon: "chart",
          exact: true,
          accent,
        })
      );
    }
    return Object.freeze(children);
  }

  function deskNavGroup(desk) {
    if (desk.execution_env === "live") {
      return Object.freeze({
        id: desk.id,
        kind: "group",
        label: desk.label,
        href: "/live/",
        icon: desk.icon,
        accent: desk.accent,
        children: Object.freeze([
          Object.freeze({
            id: "live-status",
            kind: "page",
            label: "Status",
            href: "/live/",
            icon: "radio",
            exact: true,
            accent: "live",
          }),
        ]),
      });
    }
    return Object.freeze({
      id: desk.id,
      kind: "group",
      label: desk.label,
      href: `/${desk.execution_env}/${desk.lane}/`,
      icon: desk.icon,
      accent: desk.accent,
      children: laneChildren(desk.execution_env, desk.lane),
    });
  }

  const OVERVIEW_GROUP = Object.freeze({
    id: "overview",
    kind: "home",
    // GST-103 — old.gekkotrader.com L1 label is Home (not Overview).
    label: "Home",
    href: "/overview/",
    icon: "home",
    accent: "a",
    // Parity Plus Home floor (old site) + Plus bits (Status, Promotion Audit).
    children: Object.freeze([
      Object.freeze({
        id: "overview-main",
        kind: "page",
        label: "Home",
        href: "/overview/",
        icon: "home",
        exact: true,
        accent: "a",
      }),
      Object.freeze({
        id: "overview-strategies",
        kind: "page",
        label: "Strategies",
        href: "/overview/strategies/",
        icon: "sliders",
        exact: true,
        accent: "a",
      }),
      Object.freeze({
        id: "overview-roadmaps",
        kind: "page",
        label: "Roadmaps",
        href: "/overview/roadmaps/",
        icon: "list",
        exact: true,
        accent: "a",
      }),
      Object.freeze({
        id: "overview-live-summary",
        kind: "page",
        label: "Live Summary",
        href: "/live/",
        icon: "radio",
        exact: true,
        accent: "live",
        // Home shortcut — desk Status owns active highlighting for /live/.
        alias: true,
      }),
      Object.freeze({
        id: "overview-demo-a-summary",
        kind: "page",
        label: "Demo A Summary",
        href: "/demo/a/",
        icon: "activity",
        exact: true,
        accent: "a",
        alias: true,
      }),
      Object.freeze({
        id: "overview-demo-b-summary",
        kind: "page",
        label: "Demo B Summary",
        href: "/demo/b/",
        icon: "activity",
        exact: true,
        accent: "b",
        alias: true,
      }),
      Object.freeze({
        id: "overview-sim-a-summary",
        kind: "page",
        label: "Sim A Summary",
        href: "/sim/a/",
        icon: "chart",
        exact: true,
        accent: "a",
        alias: true,
      }),
      Object.freeze({
        id: "overview-sim-b-summary",
        kind: "page",
        label: "Sim B Summary",
        href: "/sim/b/",
        icon: "chart",
        exact: true,
        accent: "b",
        alias: true,
      }),
      Object.freeze({
        id: "status",
        kind: "page",
        label: "Status",
        href: "/status/",
        icon: "radio",
        exact: true,
        accent: "a",
      }),
      Object.freeze({
        id: "audit",
        kind: "page",
        label: "Promotion Audit",
        href: "/audit/",
        icon: "shield",
        exact: true,
        accent: "a",
      }),
    ]),
  });

  const ADMIN_GROUP = Object.freeze({
    id: "admin",
    kind: "group",
    label: "Admin",
    href: "/admin/",
    icon: "shield",
    accent: "a",
    role: "admin",
    children: Object.freeze([
      Object.freeze({
        id: "admin-home",
        kind: "page",
        label: "Admin",
        href: "/admin/",
        icon: "shield",
        exact: true,
        accent: "a",
      }),
      Object.freeze({
        id: "admin-keys",
        kind: "page",
        label: "Keys",
        href: "/admin/keys/",
        icon: "sliders",
        exact: true,
        accent: "a",
      }),
      Object.freeze({
        id: "admin-users",
        kind: "page",
        label: "Users",
        href: "/admin/users/",
        icon: "users",
        exact: true,
        accent: "a",
      }),
      Object.freeze({
        id: "admin-operator",
        kind: "page",
        label: "Operator",
        href: "/admin/operator/",
        icon: "shield",
        exact: true,
        accent: "a",
      }),
    ]),
  });

  // Home → Live → Demo A → Demo B → Sim A → Sim B → Admin
  const NAVIGATION = Object.freeze([
    OVERVIEW_GROUP,
    ...OPERATIONAL_DESK_ORDER.map(deskNavGroup),
    ADMIN_GROUP,
  ]);

  /** Top-level nav group ids in render order (desktop sidebar = mobile overlay). */
  function navGroupIds(items) {
    return (items || NAVIGATION).map((n) => n.id);
  }

  function normalizePath(pathname) {
    let path = String(pathname || "/");
    if (!path.startsWith("/")) path = `/${path}`;
    if (path.length > 1 && !path.endsWith("/")) path = `${path}/`;
    return path;
  }

  function flattenNav(items, out = []) {
    for (const item of items) {
      out.push(item);
      if (item.children) flattenNav(item.children, out);
    }
    return out;
  }

  function findActive(pathname) {
    const path = normalizePath(pathname);
    // Prefer page nodes over groups when href lengths tie (desk `/demo/a/` → desk page).
    // Skip Overview Home shortcuts (alias:true) so desk pages own active state.
    const pages = flattenNav(NAVIGATION).filter((n) => n.href && !n.alias);
    let best = null;
    let bestLen = -1;
    let bestIsPage = false;
    for (const page of pages) {
      const href = normalizePath(page.href);
      const isPage = page.kind === "page";
      let matched = false;
      if (page.exact) {
        matched = path === href;
      } else {
        matched = path.startsWith(href);
      }
      if (!matched) continue;
      if (
        href.length > bestLen ||
        (href.length === bestLen && isPage && !bestIsPage)
      ) {
        best = page;
        bestLen = href.length;
        bestIsPage = isPage;
      }
    }
    return best;
  }

  function breadcrumbs(pathname) {
    const path = normalizePath(pathname);
    // Lead with Home (old.gekkotrader.com trail), not the product wordmark.
    const crumbs = [{ label: "Home", href: "/overview/" }];
    const parts = path.split("/").filter(Boolean);
    if (!parts.length || (parts.length === 1 && parts[0] === "overview")) {
      return [{ label: "Home", href: null, current: true }];
    }

    if (parts[0] === "overview") {
      // Home crumb already points at /overview/ — only append deeper pages.
      if (parts[1] === "strategies") {
        crumbs.push({ label: "Strategies", href: "/overview/strategies/" });
      } else if (parts[1] === "roadmaps") {
        crumbs.push({ label: "Roadmaps", href: "/overview/roadmaps/" });
      }
      return crumbs;
    }
    if (parts[0] === "status") {
      crumbs.push({ label: "Status", href: "/status/" });
      return crumbs;
    }
    if (parts[0] === "audit") {
      crumbs.push({ label: "Promotion Audit", href: "/audit/" });
      return crumbs;
    }
    if (parts[0] === "admin") {
      crumbs.push({ label: "Admin", href: "/admin/" });
      if (parts[1]) {
        const label = parts[1].charAt(0).toUpperCase() + parts[1].slice(1);
        crumbs.push({ label, href: `/admin/${parts[1]}/` });
      }
      return crumbs;
    }
    if (parts[0] === "live") {
      crumbs.push({ label: "Live", href: "/live/" });
      return crumbs;
    }
    if (parts[0] === "sim" || parts[0] === "demo") {
      const envLabel = parts[0] === "sim" ? "Sim" : "Demo";
      const lane = parts[1];
      crumbs.push({
        label: `${envLabel} ${String(lane || "").toUpperCase()}`,
        href: `/${parts[0]}/${lane}/`,
      });
      if (parts[2] === "results") {
        crumbs.push({ label: "Results", href: `/${parts[0]}/${lane}/results/` });
      }
      if (parts[2] === "setup") {
        crumbs.push({ label: "Strategy", href: `/${parts[0]}/${lane}/setup/` });
      }
      if (parts[2] === "runs") {
        crumbs.push({ label: "Reports", href: `/${parts[0]}/${lane}/runs/` });
      }
      if (parts[2] === "compare") {
        crumbs.push({ label: "Compare", href: `/${parts[0]}/${lane}/compare/` });
      }
      return crumbs;
    }
    return crumbs;
  }

  function parseScopeFromPath(pathname) {
    const parts = String(pathname || "/")
      .split("/")
      .filter(Boolean);
    if (parts[0] === "live") {
      return { execution_env: "live", lane: null, scope_key: "live" };
    }
    if (
      (parts[0] === "sim" || parts[0] === "demo") &&
      (parts[1] === "a" || parts[1] === "b")
    ) {
      return {
        execution_env: parts[0],
        lane: parts[1],
        scope_key: `${parts[0]}|${parts[1]}`,
      };
    }
    return null;
  }

  return {
    STORAGE,
    OPERATIONAL_DESK_ORDER,
    EXECUTION_ENV_UI_ORDER,
    ENV_OPTION_LABELS,
    NAVIGATION,
    operationalDeskIds,
    sortDesksByOperationalOrder,
    scopeKeyForDesk,
    navGroupIds,
    normalizePath,
    flattenNav,
    findActive,
    breadcrumbs,
    parseScopeFromPath,
  };
});
