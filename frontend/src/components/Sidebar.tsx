import { useEffect, useState } from "react";
import { NavLink, useLocation } from "react-router-dom";
import {
  ADMIN_GROUP,
  buildPrimaryNavTree,
  isNavActive,
} from "@/lib/navigation";
import { useAuthSession } from "@/hooks/useAuthSession";
import { UserProfile } from "@/components/UserProfile";
import type { NavGroup } from "@/types/scope";

const accentDot: Record<string, string> = {
  live: "bg-red-400",
  a: "bg-gekko",
  b: "bg-sky-400",
};

type Props = {
  open?: boolean;
  onNavigate?: () => void;
};

function groupMatchesRoute(group: NavGroup, pathname: string): boolean {
  if (isNavActive(group.href, pathname)) return true;
  return group.children.some((child) =>
    isNavActive(child.href, pathname, child.exact)
  );
}

function Chevron({ expanded }: { expanded: boolean }) {
  return (
    <svg
      className={[
        "shell-nav-chevron-icon h-3.5 w-3.5 shrink-0 text-gekko-muted transition-transform duration-150",
        expanded ? "rotate-90" : "rotate-0",
      ].join(" ")}
      viewBox="0 0 16 16"
      aria-hidden="true"
      focusable="false"
    >
      {/* Points right when collapsed; rotates to point down when expanded. */}
      <path
        fill="currentColor"
        d="M5.5 3.5a.75.75 0 0 1 1.06 0l4 4a.75.75 0 0 1 0 1.06l-4 4A.75.75 0 0 1 5.5 11.5L8.94 8 5.5 4.56a.75.75 0 0 1 0-1.06z"
      />
    </svg>
  );
}

function NavGroupBlock({
  group,
  pathname,
  expanded,
  onToggle,
  onNavigate,
}: {
  group: NavGroup;
  pathname: string;
  expanded: boolean;
  onToggle: () => void;
  onNavigate?: () => void;
}) {
  const groupActive = groupMatchesRoute(group, pathname);
  const childrenId = `nav-children-${group.id}`;

  return (
    <div
      key={group.id}
      className="shell-nav-group mb-2"
      data-nav-id={group.id}
      data-expanded={expanded ? "true" : "false"}
    >
      <div
        className={[
          "shell-nav-row mb-0.5 flex items-stretch gap-0.5",
          groupActive ? "is-active-parent" : "",
        ]
          .filter(Boolean)
          .join(" ")}
      >
        <NavLink
          to={group.href}
          data-nav-id={group.id}
          onClick={onNavigate}
          className={({ isActive }) =>
            [
              "shell-nav-link flex min-w-0 flex-1 items-center gap-2 rounded-md px-2 py-1.5 text-sm font-semibold",
              isActive || groupActive
                ? "is-active is-active-parent bg-gekko/10 text-gekko"
                : "text-white/85 hover:bg-gekko-surface-hover",
            ].join(" ")
          }
        >
          <span
            className={`h-1.5 w-1.5 shrink-0 rounded-full ${accentDot[group.accent] || "bg-gekko"}`}
          />
          <span className="truncate">{group.label}</span>
        </NavLink>
        <button
          type="button"
          className="shell-nav-chevron inline-flex w-8 shrink-0 items-center justify-center rounded-md text-gekko-muted hover:bg-gekko-surface-hover hover:text-white"
          data-nav-chevron={group.id}
          data-testid={`nav-chevron-${group.id}`}
          aria-expanded={expanded}
          aria-controls={childrenId}
          title={`${expanded ? "Collapse" : "Expand"} ${group.label}`}
          aria-label={`${expanded ? "Collapse" : "Expand"} ${group.label}`}
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            onToggle();
          }}
        >
          <Chevron expanded={expanded} />
        </button>
      </div>
      <ul
        id={childrenId}
        className="shell-nav-children ml-3 space-y-0.5 border-l border-gekko-border pl-2"
        hidden={!expanded}
        data-testid={`nav-children-${group.id}`}
      >
        {group.children.map((child) => (
          <li key={child.id}>
            <NavLink
              to={child.href}
              end={!!child.exact}
              data-nav-id={child.id}
              onClick={onNavigate}
              className={({ isActive }) =>
                [
                  "shell-nav-link block rounded-md px-2 py-1 text-sm",
                  isActive
                    ? "is-active bg-gekko/15 font-semibold text-gekko"
                    : "text-gekko-muted hover:bg-gekko-surface-hover hover:text-white",
                ].join(" ")
              }
            >
              {child.label}
            </NavLink>
          </li>
        ))}
      </ul>
    </div>
  );
}

function initialExpanded(
  groups: NavGroup[],
  pathname: string
): Record<string, boolean> {
  const map: Record<string, boolean> = {};
  for (const group of groups) {
    map[group.id] = groupMatchesRoute(group, pathname);
  }
  return map;
}

export function Sidebar({ open = false, onNavigate }: Props) {
  const { pathname } = useLocation();
  const { signedIn, user, isAdmin } = useAuthSession();
  const primary = buildPrimaryNavTree();
  const allGroups = isAdmin ? [...primary, ADMIN_GROUP] : primary;

  const [expanded, setExpanded] = useState<Record<string, boolean>>(() =>
    initialExpanded(allGroups, pathname)
  );

  // Auto-expand the L1 group whose L2 child matches the current route.
  useEffect(() => {
    const groups = isAdmin
      ? [...buildPrimaryNavTree(), ADMIN_GROUP]
      : buildPrimaryNavTree();
    setExpanded((prev) => {
      let changed = false;
      const next = { ...prev };
      for (const group of groups) {
        if (groupMatchesRoute(group, pathname) && next[group.id] !== true) {
          next[group.id] = true;
          changed = true;
        }
        if (next[group.id] === undefined) {
          next[group.id] = groupMatchesRoute(group, pathname);
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [pathname, isAdmin]);

  function toggleGroup(id: string) {
    setExpanded((prev) => ({
      ...prev,
      [id]: !prev[id],
    }));
  }

  return (
    <aside
      id="appSidebar"
      className={[
        "app-sidebar sticky top-0 flex h-screen w-56 shrink-0 flex-col border-r border-gekko-border bg-gekko-surface/80 backdrop-blur-sm",
        open ? "is-open" : "",
      ]
        .filter(Boolean)
        .join(" ")}
      data-testid="app-sidebar"
    >
      <div className="flex shrink-0 items-center gap-2 border-b border-gekko-border px-4 py-4">
        <img src="/gekko-logo.png" alt="" className="h-7 w-7" />
        <div className="leading-tight">
          <div
            className="font-extrabold tracking-tight"
            data-testid="sidebar-wordmark"
          >
            <span className="text-gekko">Gekko</span>
            <span className="text-white">Trader2</span>
          </div>
        </div>
      </div>

      <nav
        id="appSidebarNav"
        className="app-sidebar-primary app-sidebar-scroll min-h-0 flex-1 overflow-x-hidden overflow-y-auto px-2 py-3"
        aria-label="Main"
        data-testid="app-sidebar-nav"
      >
        {primary.map((group) => (
          <NavGroupBlock
            key={group.id}
            group={group}
            pathname={pathname}
            expanded={!!expanded[group.id]}
            onToggle={() => toggleGroup(group.id)}
            onNavigate={onNavigate}
          />
        ))}
      </nav>

      {isAdmin ? (
        <nav
          id="appSidebarUtility"
          className="app-sidebar-utility app-sidebar-scroll shrink-0 border-t border-gekko-border px-2 py-3"
          aria-label="Admin"
          data-testid="app-sidebar-utility"
        >
          <NavGroupBlock
            group={ADMIN_GROUP}
            pathname={pathname}
            expanded={!!expanded[ADMIN_GROUP.id]}
            onToggle={() => toggleGroup(ADMIN_GROUP.id)}
            onNavigate={onNavigate}
          />
        </nav>
      ) : null}

      <UserProfile
        signedIn={signedIn}
        user={user}
        onNavigate={onNavigate}
      />
    </aside>
  );
}
