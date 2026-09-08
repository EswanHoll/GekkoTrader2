/**
 * Greenfield workspace shell: left rail, breadcrumbs, scope selector mount,
 * top-bar + account footer auth. Consumes GekkoNavigationConfig + GekkoScope.
 */
(function (root) {
  "use strict";

  const Config = () => root.GekkoNavigationConfig;
  const Scope = () => root.GekkoScope;
  const Labels = () => root.GekkoDisplayLabels;

  let overlayOpen = false;

  function $(id) {
    return document.getElementById(id);
  }

  function escapeHtml(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function formatMoney(value, opts = {}) {
    const n = Number(value);
    if (!Number.isFinite(n)) return "—";
    const cents = !!opts.cents;
    const signed = opts.signed === true;
    if (cents) {
      return new Intl.NumberFormat("en-US", {
        style: "currency",
        currency: "USD",
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
        signDisplay: signed ? "exceptZero" : "auto",
      }).format(n);
    }
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
      signDisplay: signed ? "exceptZero" : "auto",
    }).format(Math.round(n));
  }

  function infoTipMarkup(text, ariaLabel) {
    const tip = escapeHtml(text || "");
    const label = escapeHtml(ariaLabel || "More information");
    return `<button type="button" class="info-tip" aria-label="${label}"><span class="info-tip-icon" aria-hidden="true">i</span><span class="info-tip-bubble" role="tooltip">${tip}</span></button>`;
  }

  function wireInfoTips() {
    if (document.documentElement.dataset.infoTipsWired === "1") return;
    document.documentElement.dataset.infoTipsWired = "1";
    document.addEventListener("click", (e) => {
      const tip = e.target.closest(".info-tip");
      if (tip) {
        e.preventDefault();
        e.stopPropagation();
        tip.classList.toggle("is-open");
        document.querySelectorAll(".info-tip.is-open").forEach((node) => {
          if (node !== tip) node.classList.remove("is-open");
        });
        return;
      }
      document.querySelectorAll(".info-tip.is-open").forEach((n) => n.classList.remove("is-open"));
    });
  }

  root.GekkoUi = {
    escapeHtml,
    infoTip: infoTipMarkup,
    formatMoney,
    wireInfoTips,
  };

  function loginHref() {
    const Auth = root.GekkoAuth;
    // Always force-clear on Sign in so stale localStorage cannot bounce operators.
    if (Auth?.forceLoginHref && typeof location !== "undefined") {
      return Auth.forceLoginHref(location.pathname, location.search || "");
    }
    return "/login/?force=1";
  }

  /** Display name for account chrome — never dump raw email as the only label. */
  function displayNameFromUser(user) {
    const named = user?.name || user?.display_name || user?.full_name;
    if (named && String(named).trim()) return String(named).trim();
    const email = String(user?.email || "");
    const local = email.split("@")[0] || "operator";
    const words = local
      .replace(/[._-]+/g, " ")
      .split(/\s+/)
      .filter(Boolean)
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase());
    return words.join(" ") || "Operator";
  }

  function avatarInitialFromUser(user) {
    const name = displayNameFromUser(user);
    return (name.charAt(0) || "?").toUpperCase();
  }

  /**
   * Left-rail account chrome only (GekkoFlow pattern).
   * Top-bar account chrome is removed — surface "top" returns empty.
   */
  function authChromeHtml(session, { surface = "footer" } = {}) {
    if (surface === "top") return "";
    const user = session?.user;
    const href = escapeHtml(loginHref());
    if (!user) {
      return `<a class="shell-account-trigger shell-footer-signin" id="shellSignIn" href="${href}" data-auth-primary="1" title="Sign in" aria-label="Sign in">
        <span class="shell-account-avatar" aria-hidden="true">${iconHtml("users")}</span>
        <span class="shell-account-meta">
          <strong class="shell-label">Sign in</strong>
        </span>
      </a>`;
    }
    const email = escapeHtml(user.email || "operator");
    const displayName = escapeHtml(displayNameFromUser(user));
    const initial = escapeHtml(avatarInitialFromUser(user));
    const roleLabel = escapeHtml(
      Labels()?.formatRoleLabel?.(user.role) || "Unknown role"
    );
    return `
      <div class="shell-account" data-auth-primary="1">
        <button type="button" class="shell-account-trigger" id="shellAccountTrigger"
          aria-expanded="false" aria-controls="shellAccountMenu" aria-haspopup="menu"
          title="${displayName}">
          <span class="shell-account-avatar" aria-hidden="true">${initial}</span>
          <span class="shell-account-meta">
            <strong class="shell-account-name">${displayName}</strong>
            <span class="muted-line shell-account-role">${roleLabel}</span>
          </span>
        </button>
        <div class="shell-account-menu" id="shellAccountMenu" hidden role="menu">
          <p class="shell-account-email">${email}</p>
          <a class="shell-account-menu-link" role="menuitem" id="shellChangePassword" href="/account/password/">Change password</a>
          <button type="button" class="danger shell-signout" role="menuitem" id="shellSignOut">Sign out</button>
        </div>
      </div>`;
  }

  const SHELL_COLLAPSE_KEY = "gekko_shell_rail_collapsed";
  let railHover = false;
  let railFocus = false;
  // GST-103 — old-site nav Search (filter left rail labels).
  let navSearchOpen = false;
  let navSearchQuery = "";

  function shellRoot() {
    return document.querySelector('.app-shell[data-shell="workspace"]') || document.body;
  }

  function isCompactViewport() {
    return typeof window !== "undefined" && window.matchMedia
      ? window.matchMedia("(max-width: 1199px)").matches
      : false;
  }

  function isPhoneViewport() {
    return typeof window !== "undefined" && window.matchMedia
      ? window.matchMedia("(max-width: 767px)").matches
      : false;
  }

  function readCollapsedPref() {
    try {
      return localStorage.getItem(SHELL_COLLAPSE_KEY) === "1";
    } catch (_) {
      return false;
    }
  }

  function writeCollapsedPref(collapsed) {
    try {
      localStorage.setItem(SHELL_COLLAPSE_KEY, collapsed ? "1" : "0");
    } catch (_) {
      /* private mode */
    }
  }

  /**
   * Pure rail state resolver (tested).
   * Hover/focus peek expands labels without pinning open.
   */
  function resolveShellRailState({
    collapsed = false,
    hover = false,
    focus = false,
    compact = false,
    mobile = false,
    overlayOpen: overlay = false,
  } = {}) {
    // The mobile drawer has its own transform selector. Tablet remains a
    // persistent/collapsible rail; phones use the explicit mobile-open state.
    if (mobile) return overlay ? "mobile-open" : "mobile-closed";
    if (compact) return overlay ? "tablet-overlay" : "tablet-collapsed";
    if (collapsed && (hover || focus)) return "desktop-hover";
    return collapsed ? "desktop-collapsed" : "desktop-expanded";
  }

  function updateRailToggleChrome(collapsed) {
    const btn = document.getElementById("shellRailToggle");
    if (!btn) return;
    const expanded = !collapsed;
    btn.setAttribute("aria-expanded", expanded ? "true" : "false");
    btn.setAttribute("aria-pressed", expanded ? "true" : "false");
    btn.classList.toggle("is-rail-open", expanded);
    btn.title = collapsed
      ? "Open sidebar (hover or click)"
      : "Close sidebar";
    btn.setAttribute(
      "aria-label",
      collapsed ? "Open sidebar" : "Close sidebar"
    );
    const label = btn.querySelector(".shell-rail-toggle-label");
    if (label) label.textContent = collapsed ? "Open sidebar" : "Close sidebar";
  }

  /**
   * Desktop (≥1200px): Parity Plus dual chrome — top L1 scopes + left rail
   * (old.gekkotrader.com floor; FPP-01). Narrow viewports hide the top bar and
   * use the complete rail / hamburger (rail-only).
   */
  function isTopnavPrimaryViewport() {
    return (
      typeof window !== "undefined" &&
      typeof window.matchMedia === "function" &&
      window.matchMedia("(min-width: 1200px)").matches
    );
  }

  function applyNavModel() {
    const desktopTopbar = isTopnavPrimaryViewport();
    // GST-101 — never use topbar-only (that hid Overview…Sim and left only Admin).
    const model = desktopTopbar ? "dual" : "rail-only";
    const rootEl = shellRoot();
    if (rootEl) rootEl.setAttribute("data-nav-model", model);
    if (typeof document !== "undefined" && document.body) {
      document.body.setAttribute("data-nav-model", model);
    }
    const sidebar = $("appSidebar");
    if (sidebar) {
      sidebar.setAttribute("aria-label", "Primary navigation");
    }
    return model;
  }

  function applyShellCollapsed(collapsedOpt) {
    const collapsed =
      typeof collapsedOpt === "boolean" ? collapsedOpt : readCollapsedPref();
    const rootEl = shellRoot();
    if (!rootEl) return;
    const compact = isCompactViewport();
    const mobile = isPhoneViewport();
    applyNavModel();
    const state = resolveShellRailState({
      collapsed,
      hover: railHover,
      focus: railFocus,
      compact,
      mobile,
      overlayOpen,
    });
    rootEl.setAttribute("data-shell-state", state);
    // Hover flyout overlays content; keep grid slot at collapsed width.
    const width =
      compact
        ? overlayOpen
          ? "min(86vw, 280px)"
          : "var(--shell-rail-collapsed)"
        : collapsed
          ? "var(--shell-rail-collapsed)"
          : "var(--shell-rail-expanded)";
    document.documentElement.style.setProperty("--shell-current-rail-width", width);
    updateRailToggleChrome(collapsed);
  }

  function wireRailToggle() {
    const btn = document.getElementById("shellRailToggle");
    if (!btn || btn.dataset.wired === "1") return;
    btn.dataset.wired = "1";
    btn.addEventListener("click", () => {
      const next = !readCollapsedPref();
      writeCollapsedPref(next);
      // Pinning open clears temporary hover/focus peek.
      if (!next) {
        railHover = false;
        railFocus = false;
      } else {
        // Closing the rail also closes Search (old-site parity).
        setNavSearchOpen(false);
      }
      applyShellCollapsed(next);
    });
  }

  /**
   * Filter left-nav groups/links by label (old.gekkotrader.com Search).
   * Pure DOM helper — exported for tests.
   */
  function applyNavSearch(query) {
    const sidebar = $("appSidebar");
    if (!sidebar) return;
    const q = String(query || "").trim().toLowerCase();
    const groups = sidebar.querySelectorAll(
      ".app-sidebar-primary > .shell-nav-group, .app-sidebar-utility > .shell-nav-group"
    );
    let visibleCount = 0;

    const ownLabel = (el) => {
      const label =
        el.querySelector(":scope > .shell-nav-row .shell-label") ||
        el.querySelector(":scope > a.shell-nav-link > .shell-label");
      return (label?.textContent || "").trim().toLowerCase();
    };

    const nodeMatches = (el) => {
      const labels = [...el.querySelectorAll(".shell-label")].map((node) =>
        (node.textContent || "").trim().toLowerCase()
      );
      if (!labels.length) {
        return (el.textContent || "").trim().toLowerCase().includes(q);
      }
      return labels.some((label) => label.includes(q));
    };

    const filterGroupTree = (group) => {
      const selfMatch = ownLabel(group).includes(q);
      group.querySelectorAll(":scope > .shell-nav-children").forEach((list) => {
        list.hidden = false;
      });
      group
        .querySelectorAll(":scope > .shell-nav-row .shell-nav-chevron")
        .forEach((btn) => {
          btn.setAttribute("aria-expanded", "true");
        });

      if (selfMatch) {
        group
          .querySelectorAll(".shell-nav-group, .shell-nav-subgroup, a.shell-nav-link")
          .forEach((el) => {
            el.hidden = false;
          });
        group.querySelectorAll(".shell-nav-children").forEach((list) => {
          list.hidden = false;
        });
        group.querySelectorAll(".shell-nav-chevron").forEach((btn) => {
          btn.setAttribute("aria-expanded", "true");
        });
        return;
      }

      group
        .querySelectorAll(":scope > .shell-nav-children > .shell-nav-group")
        .forEach((child) => {
          const match = nodeMatches(child);
          child.hidden = !match;
          if (match) filterGroupTree(child);
        });
      group
        .querySelectorAll(":scope > .shell-nav-children > a.shell-nav-link")
        .forEach((link) => {
          const text = (link.textContent || "").trim().toLowerCase();
          link.hidden = !text.includes(q);
        });
    };

    groups.forEach((group) => {
      if (!q) {
        group.hidden = false;
        group
          .querySelectorAll(".shell-nav-group, .shell-nav-subgroup, a.shell-nav-link")
          .forEach((el) => {
            el.hidden = false;
          });
        visibleCount += 1;
        return;
      }

      const match = nodeMatches(group);
      group.hidden = !match;
      if (!match) return;
      visibleCount += 1;
      filterGroupTree(group);
    });

    let empty = sidebar.querySelector(".shell-nav-search-empty");
    if (q && visibleCount === 0) {
      if (!empty) {
        empty = document.createElement("p");
        empty.className = "shell-nav-search-empty";
        empty.textContent = "No matching pages";
        sidebar.querySelector(".app-sidebar-primary")?.appendChild(empty);
      }
      empty.hidden = false;
    } else if (empty) {
      empty.hidden = true;
    }
  }

  function setNavSearchOpen(open, { focus = false } = {}) {
    navSearchOpen = Boolean(open);
    const wrap = document.getElementById("shellNavSearch");
    const btn = document.getElementById("shellSearchToggle");
    const input = document.querySelector("[data-shell-search-input]");
    if (wrap) wrap.hidden = !navSearchOpen;
    if (btn) {
      btn.setAttribute("aria-expanded", navSearchOpen ? "true" : "false");
      btn.classList.toggle("is-active", navSearchOpen);
    }
    if (!navSearchOpen) {
      navSearchQuery = "";
      if (input) input.value = "";
      applyNavSearch("");
      return;
    }

    // Search needs an expanded rail so the field is usable.
    if (!isCompactViewport() && readCollapsedPref()) {
      writeCollapsedPref(false);
      railHover = false;
      railFocus = false;
      applyShellCollapsed(false);
    } else if (isCompactViewport() && !isPhoneViewport() && !overlayOpen) {
      setOverlay(true);
    }

    if (focus && typeof window !== "undefined" && window.requestAnimationFrame) {
      window.requestAnimationFrame(() => {
        document.querySelector("[data-shell-search-input]")?.focus();
      });
    } else if (focus) {
      document.querySelector("[data-shell-search-input]")?.focus();
    }
  }

  function wireNavSearch() {
    const btn = document.getElementById("shellSearchToggle");
    if (btn && btn.dataset.wired !== "1") {
      btn.dataset.wired = "1";
      btn.addEventListener("click", (e) => {
        e.preventDefault();
        setNavSearchOpen(!navSearchOpen, { focus: true });
      });
    }
    const input = document.querySelector("[data-shell-search-input]");
    if (input && input.dataset.wired !== "1") {
      input.dataset.wired = "1";
      input.addEventListener("input", () => {
        navSearchQuery = input.value || "";
        applyNavSearch(navSearchQuery);
      });
    }
    if (navSearchQuery) applyNavSearch(navSearchQuery);
  }

  /** Collapsed rail: hover or keyboard focus temporarily expands labels. */
  function wireRailHoverExpand() {
    const sidebar = $("appSidebar");
    if (!sidebar || sidebar.dataset.hoverWired === "1") return;
    sidebar.dataset.hoverWired = "1";
    sidebar.addEventListener("mouseenter", () => {
      if (isCompactViewport() || !readCollapsedPref()) return;
      railHover = true;
      applyShellCollapsed(true);
    });
    sidebar.addEventListener("mouseleave", () => {
      railHover = false;
      applyShellCollapsed(readCollapsedPref());
    });
    sidebar.addEventListener("focusin", () => {
      if (isCompactViewport() || !readCollapsedPref()) return;
      railFocus = true;
      applyShellCollapsed(true);
    });
    sidebar.addEventListener("focusout", (e) => {
      if (sidebar.contains(e.relatedTarget)) return;
      railFocus = false;
      applyShellCollapsed(readCollapsedPref());
    });
  }

  /** Remove retired top-right account / meaningless status chrome. */
  function removeTopAccountChrome() {
    if (typeof document === "undefined") return;
    const auth = $("appAuthActions");
    if (auth) {
      auth.innerHTML = "";
      auth.hidden = true;
      auth.setAttribute("hidden", "");
      auth.setAttribute("aria-hidden", "true");
    }
    const pills = $("statusPills");
    if (pills) {
      pills.innerHTML = "";
      pills.hidden = true;
      pills.setAttribute("hidden", "");
    }
    const health = $("healthPill");
    if (health) {
      health.remove();
    }
  }

  function wireSignOut(btnId) {
    $(btnId)?.addEventListener("click", async () => {
      await root.GekkoAuth?.signOut?.();
      location.assign("/login/?force=1");
    });
  }

  function wireAccountMenu() {
    const trigger = $("shellAccountTrigger");
    const menu = $("shellAccountMenu");
    if (!trigger || !menu || trigger.dataset.wired === "1") return;
    trigger.dataset.wired = "1";
    const setOpen = (open) => {
      menu.hidden = !open;
      trigger.setAttribute("aria-expanded", open ? "true" : "false");
    };
    trigger.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      setOpen(menu.hidden);
    });
    document.addEventListener("click", (e) => {
      if (!menu.hidden && !menu.contains(e.target) && e.target !== trigger) {
        setOpen(false);
      }
    });
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape") setOpen(false);
    });
  }

  function ensureIconSprite() {
    if (document.getElementById("gekkoNavIcons")) return;
    const holder = document.createElement("div");
    holder.id = "gekkoNavIcons";
    holder.hidden = true;
    holder.setAttribute("aria-hidden", "true");
    holder.innerHTML = `
<svg xmlns="http://www.w3.org/2000/svg">
  <symbol id="icon-home" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M15 21v-8a1 1 0 0 0-1-1h-4a1 1 0 0 0-1 1v8"/><path d="M3 10a2 2 0 0 1 .709-1.528l7-5.999a2 2 0 0 1 2.582 0l7 5.999A2 2 0 0 1 21 10v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/></symbol>
  <symbol id="icon-activity" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 12h-2.48a2 2 0 0 0-1.93 1.46l-2.35 8.36a.25.25 0 0 1-.48 0L9.24 2.18a.25.25 0 0 0-.48 0l-2.35 8.36A2 2 0 0 1 4.49 12H2"/></symbol>
  <symbol id="icon-chart" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 3v16a2 2 0 0 0 2 2h16"/><path d="M18 17V9"/><path d="M13 17V5"/><path d="M8 17v-3"/></symbol>
  <symbol id="icon-radio" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4.9 19.1C1 15.2 1 8.8 4.9 4.9"/><circle cx="12" cy="12" r="2"/><path d="M19.1 4.9C23 8.8 23 15.1 19.1 19"/></symbol>
  <symbol id="icon-flask" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10 2v7.527a2 2 0 0 1-.211.896L4.72 20.55a1 1 0 0 0 .9 1.45h12.76a1 1 0 0 0 .9-1.45l-5.069-10.127A2 2 0 0 1 14 9.527V2"/><path d="M8.5 2h7"/></symbol>
  <symbol id="icon-list" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 12h.01"/><path d="M3 18h.01"/><path d="M3 6h.01"/><path d="M8 12h13"/><path d="M8 18h13"/><path d="M8 6h13"/></symbol>
  <symbol id="icon-sliders" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="4" x2="4" y1="21" y2="14"/><line x1="12" x2="12" y1="21" y2="12"/><line x1="20" x2="20" y1="21" y2="16"/><line x1="2" x2="6" y1="14" y2="14"/><line x1="10" x2="14" y1="8" y2="8"/><line x1="18" x2="22" y1="16" y2="16"/></symbol>
  <symbol id="icon-shield" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z"/></symbol>
  <symbol id="icon-users" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/></symbol>
  <symbol id="icon-menu" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="4" x2="20" y1="12" y2="12"/><line x1="4" x2="20" y1="6" y2="6"/><line x1="4" x2="20" y1="18" y2="18"/></symbol>
  <symbol id="icon-panel-left" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect width="18" height="18" x="3" y="3" rx="2"/><path d="M9 3v18"/></symbol>
  <symbol id="icon-search" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></symbol>
  <symbol id="icon-chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="m9 18 6-6-6-6"/></symbol>
  <symbol id="icon-logout" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" x2="9" y1="12" y2="12"/></symbol>
</svg>`;
    document.body.prepend(holder);
  }

  function iconHtml(name) {
    return `<svg class="shell-icon" aria-hidden="true" width="20" height="20"><use href="#icon-${escapeHtml(name)}"></use></svg>`;
  }

  function setOverlay(open) {
    overlayOpen = !!open;
    const sidebar = $("appSidebar");
    const backdrop = $("appSidebarBackdrop");
    const trigger = document.querySelector(".app-menu-trigger");
    document.body.classList.toggle("shell-nav-open", overlayOpen);
    if (sidebar) sidebar.classList.toggle("is-open", overlayOpen);
    if (backdrop) backdrop.hidden = !overlayOpen;
    if (trigger) trigger.setAttribute("aria-expanded", overlayOpen ? "true" : "false");
    applyShellCollapsed(readCollapsedPref());
  }

  /** Normalize desk labels for top bar (legacy "Demo · Lane A" → "Demo A"). */
  function topNavLabel(label) {
    return String(label || "")
      .replace(/\s*[·-]\s*Lane\s+/gi, " ")
      .trim();
  }

  function topNavItems(navigation) {
    return (navigation || []).filter(
      (node) => node && node.role !== "admin" && node.id !== "admin"
    );
  }

  function parentGroupForActive(active, navigation) {
    if (!active) return null;
    for (const group of navigation || []) {
      if (group.id === active.id) return group;
      if ((group.children || []).some((c) => c.id === active.id)) return group;
    }
    return null;
  }

  function isTopNavChildActive(child, active, pathname) {
    if (!child) return false;
    if (active && active.id === child.id) return true;
    const cfg = Config();
    if (!cfg?.normalizePath || !child.href) return false;
    const current = cfg.normalizePath(pathname);
    const target = cfg.normalizePath(child.href);
    if (!target) return false;
    if (child.exact) return current === target;
    return current === target || (target !== "/" && current.startsWith(target));
  }

  function closeTopMenus() {
    document.querySelectorAll(".app-topnav-menu").forEach((menu) => {
      menu.hidden = true;
    });
    document.querySelectorAll(".app-topnav-item.is-open").forEach((item) => {
      item.classList.remove("is-open");
      delete item.dataset.menuPinned;
    });
    document.querySelectorAll(".app-topnav-trigger[aria-expanded='true']").forEach((btn) => {
      btn.setAttribute("aria-expanded", "false");
    });
  }

  function canHoverTopMenus() {
    return (
      typeof window !== "undefined" &&
      typeof window.matchMedia === "function" &&
      window.matchMedia("(min-width: 1200px)").matches &&
      window.matchMedia("(hover: hover) and (pointer: fine)").matches
    );
  }

  /**
   * Ensure #appTopNav exists in the sticky topbar (old.gekkotrader.com layout).
   */
  function ensureTopNavHost() {
    const topbar = document.querySelector(".app-topbar");
    if (!topbar) return null;
    let host = $("appTopNav");
    if (!host) {
      host = document.createElement("div");
      host.id = "appTopNav";
      host.className = "app-topnav-region";
    } else {
      host.classList.add("app-topnav-region");
    }
    if (host.parentElement !== topbar) {
      const actions = topbar.querySelector(".app-top-actions, .app-topbar-actions");
      if (actions) topbar.insertBefore(host, actions);
      else topbar.appendChild(host);
    }
    return host;
  }

  /**
   * Keep breadcrumbs under the topbar in content chrome (not inside brand bar).
   */
  function ensureBreadcrumbsHost() {
    const shell = document.querySelector(".app-content-shell");
    const chrome = $("appDeskChrome");
    let host = $("appBreadcrumbs");
    if (!host) {
      host = document.createElement("div");
      host.id = "appBreadcrumbs";
      host.className = "app-breadcrumb-region";
    } else {
      host.classList.add("app-breadcrumb-region");
    }
    if (chrome) {
      if (host.parentElement !== chrome) {
        const actions = chrome.querySelector(".app-desk-actions");
        if (actions) chrome.insertBefore(host, actions);
        else chrome.prepend(host);
      }
    } else if (shell && host.parentElement !== shell) {
      const scroll = shell.querySelector(".app-content-scroll");
      if (scroll) shell.insertBefore(host, scroll);
      else shell.prepend(host);
    }
    // Remove a stray host if we previously parked crumbs in the topbar.
    document.querySelectorAll(".app-topbar #appBreadcrumbs").forEach((el) => {
      if (el !== host) el.remove();
    });
    return host;
  }

  /**
   * Color-coded L1 desk bar in the sticky header — aligned with old.gekkotrader.com.
   * Local L2 menus: click + keyboard primary; hover progressive enhancement (UX-P0-02).
   */
  function renderTopNav(pathname) {
    const host = ensureTopNavHost();
    const cfg = Config();
    if (!host || !cfg) return;
    const path =
      pathname ||
      (typeof location !== "undefined" ? location.pathname : "/");
    const active = cfg.findActive(path);
    const parent = parentGroupForActive(active, cfg.NAVIGATION);
    const leaveTimers = new Map();

    const openItemMenu = (item, { pinned = false } = {}) => {
      if (!item) return;
      const keepPinned = pinned || item.dataset.menuPinned === "1";
      closeTopMenus();
      const menu = item.querySelector(".app-topnav-menu");
      const trigger = item.querySelector(".app-topnav-trigger");
      if (!menu) return;
      menu.hidden = false;
      item.classList.add("is-open");
      trigger?.setAttribute("aria-expanded", "true");
      if (keepPinned) item.dataset.menuPinned = "1";
    };

    const closeItemMenu = (item) => {
      if (!item) return;
      const menu = item.querySelector(".app-topnav-menu");
      const trigger = item.querySelector(".app-topnav-trigger");
      if (menu) menu.hidden = true;
      item.classList.remove("is-open");
      delete item.dataset.menuPinned;
      trigger?.setAttribute("aria-expanded", "false");
    };

    while (host.firstChild) host.removeChild(host.firstChild);
    const nav = document.createElement("nav");
    nav.className = "app-topnav";
    nav.setAttribute("aria-label", "Site");

    topNavItems(cfg.NAVIGATION).forEach((node) => {
      const children = Array.isArray(node.children) ? node.children : [];
      const item = document.createElement("div");
      item.className = "app-topnav-item";
      item.dataset.navId = node.id;
      const isActive = !!(parent && parent.id === node.id);

      const a = document.createElement("a");
      a.className = "app-topnav-link app-topnav-top";
      a.href = node.href || "#";
      a.dataset.navId = node.id;
      const labelText = topNavLabel(node.label);
      if (children.length) {
        a.setAttribute("aria-haspopup", "menu");
        a.setAttribute("aria-expanded", "false");
        a.classList.add("app-topnav-trigger");
        a.setAttribute(
          "aria-label",
          `${labelText} menu — Desk and local pages`
        );
        a.innerHTML = `${escapeHtml(labelText)}<span class="app-topnav-caret" aria-hidden="true">${iconHtml("chevron")}</span>`;
      } else {
        a.textContent = labelText;
      }
      if (isActive) {
        item.classList.add("is-active");
        a.classList.add("is-active");
      }
      item.appendChild(a);

      if (children.length) {
        const menu = document.createElement("div");
        menu.className = "app-topnav-menu";
        menu.id = `topnav-menu-${node.id}`;
        menu.hidden = true;
        menu.setAttribute("role", "menu");
        menu.setAttribute("aria-label", `${labelText} pages`);
        a.setAttribute("aria-controls", menu.id);

        children.forEach((child) => {
          if (!child?.href || !child?.label) return;
          const link = document.createElement("a");
          link.className = "app-topnav-link app-topnav-child";
          link.href = child.href;
          link.textContent = child.label;
          link.dataset.navId = child.id || "";
          link.setAttribute("role", "menuitem");
          if (isTopNavChildActive(child, active, path)) {
            link.classList.add("is-active");
            link.setAttribute("aria-current", "page");
          }
          menu.appendChild(link);
        });

        if (menu.childElementCount) {
          item.appendChild(menu);

          a.addEventListener("click", (e) => {
            if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) {
              return;
            }
            e.preventDefault();
            e.stopPropagation();
            if (item.classList.contains("is-open") && item.dataset.menuPinned === "1") {
              closeItemMenu(item);
              return;
            }
            openItemMenu(item, { pinned: true });
          });
          a.addEventListener("keydown", (e) => {
            if (e.key === "ArrowDown" || e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              openItemMenu(item, { pinned: true });
              const first = menu.querySelector("a.app-topnav-child");
              first?.focus?.();
            } else if (e.key === "Escape") {
              e.preventDefault();
              closeItemMenu(item);
              a.focus();
            }
          });
          menu.addEventListener("keydown", (e) => {
            if (e.key === "Escape") {
              e.preventDefault();
              closeItemMenu(item);
              a.focus();
            }
          });

          item.addEventListener("pointerenter", () => {
            if (!canHoverTopMenus()) return;
            const pending = leaveTimers.get(item);
            if (pending) {
              clearTimeout(pending);
              leaveTimers.delete(item);
            }
            openItemMenu(item);
          });
          item.addEventListener("pointerleave", () => {
            if (!canHoverTopMenus()) return;
            // Keep click-/keyboard-pinned menus open until Escape/outside click.
            if (item.dataset.menuPinned === "1") return;
            const pending = leaveTimers.get(item);
            if (pending) clearTimeout(pending);
            leaveTimers.set(
              item,
              setTimeout(() => {
                leaveTimers.delete(item);
                if (!item.classList.contains("is-open")) return;
                if (item.dataset.menuPinned === "1") return;
                closeItemMenu(item);
              }, 140)
            );
          });
          // Do not auto-open on focusin — that races click (focus opens → click toggles closed).
          // Keyboard: ArrowDown / Enter / Space open; Escape / focus leaving closes.
          item.addEventListener("focusout", (e) => {
            if (item.contains(e.relatedTarget)) return;
            delete item.dataset.menuPinned;
            closeItemMenu(item);
          });
        }
      }

      nav.appendChild(item);
    });

    host.appendChild(nav);
    applyNavModel();
  }

  /**
   * Pure HTML for tests — L1 scopes + discoverable L2 menus (UX-P0-02/03).
   */
  function buildTopNavHtml(pathname) {
    const cfg = Config();
    if (!cfg) return "";
    const path = cfg.normalizePath(pathname);
    const active = cfg.findActive(path);
    const parent = parentGroupForActive(active, cfg.NAVIGATION);
    return `<nav class="app-topnav" aria-label="Site">${topNavItems(cfg.NAVIGATION)
      .map((node) => {
        const isActive = !!(parent && parent.id === node.id);
        const children = Array.isArray(node.children) ? node.children : [];
        const hasMenu = children.length > 0;
        const cls = [
          "app-topnav-link",
          "app-topnav-top",
          hasMenu ? "app-topnav-trigger" : "",
          isActive ? "is-active" : "",
        ]
          .filter(Boolean)
          .join(" ");
        const itemCls = ["app-topnav-item", isActive ? "is-active" : ""]
          .filter(Boolean)
          .join(" ");
        const label = escapeHtml(topNavLabel(node.label));
        const triggerAttrs = hasMenu
          ? ` aria-haspopup="menu" aria-expanded="false" aria-controls="topnav-menu-${escapeHtml(node.id)}"`
          : "";
        const caret = hasMenu
          ? `<span class="app-topnav-caret" aria-hidden="true"></span>`
          : "";
        const menu = hasMenu
          ? `<div class="app-topnav-menu" id="topnav-menu-${escapeHtml(node.id)}" hidden role="menu" aria-label="${label} pages">${children
              .filter((c) => c?.href && c?.label)
              .map((child) => {
                const childActive = isTopNavChildActive(child, active, path);
                return `<a class="app-topnav-link app-topnav-child${childActive ? " is-active" : ""}" href="${escapeHtml(child.href)}" data-nav-id="${escapeHtml(child.id || "")}" role="menuitem"${childActive ? ' aria-current="page"' : ""}>${escapeHtml(child.label)}</a>`;
              })
              .join("")}</div>`
          : "";
        return `<div class="${itemCls}" data-nav-id="${escapeHtml(node.id)}"><a class="${cls}" href="${escapeHtml(node.href)}" data-nav-id="${escapeHtml(node.id)}"${triggerAttrs}>${label}${caret}</a>${menu}</div>`;
      })
      .join("")}</nav>`;
  }

  function renderBreadcrumbs() {
    const host = ensureBreadcrumbsHost() || $("appBreadcrumbs");
    const cfg = Config();
    if (!host || !cfg) return;
    const crumbs = cfg.breadcrumbs(location.pathname);
    // Old shell: hide trail on home / single-crumb routes.
    if (!Array.isArray(crumbs) || crumbs.length <= 1) {
      host.hidden = true;
      host.innerHTML = "";
      return;
    }
    host.hidden = false;
    const parts = crumbs
      .map((c, i) => {
        const last = i === crumbs.length - 1 || c.current || !c.href;
        const sep =
          i === 0
            ? ""
            : `<li class="breadcrumb-separator" aria-hidden="true">${iconHtml("chevron")}</li>`;
        if (last) {
          return `${sep}<li><span class="breadcrumb-current" aria-current="page">${escapeHtml(c.label)}</span></li>`;
        }
        return `${sep}<li><a class="breadcrumb-link" href="${escapeHtml(c.href)}">${escapeHtml(c.label)}</a></li>`;
      })
      .join("");
    host.innerHTML = `<nav aria-label="Breadcrumb"><ol class="breadcrumbs">${parts}</ol></nav>`;
  }

  function staticFooterSignInHtml() {
    return authChromeHtml(null, { surface: "footer" });
  }

  /** GST-103 — collapse + Search tools matching old.gekkotrader.com rail head. */
  function sidebarHeadHtml() {
    return `
          <div class="app-sidebar-head">
            <button type="button" class="app-rail-toggle app-rail-tool" id="shellRailToggle"
              data-shell-collapse="true"
              aria-controls="appSidebarNav" aria-expanded="true" aria-pressed="true"
              title="Close sidebar" aria-label="Close sidebar">
              ${iconHtml("panel-left")}
              <span class="shell-label shell-rail-toggle-label visually-hidden">Close sidebar</span>
            </button>
            <div class="app-sidebar-tools">
              <button type="button" class="app-rail-tool" id="shellSearchToggle"
                data-shell-search-toggle="true"
                aria-expanded="false" aria-controls="shellNavSearch"
                title="Search navigation" aria-label="Search navigation">
                ${iconHtml("search")}
                <span class="shell-label visually-hidden">Search</span>
              </button>
            </div>
          </div>
          <div class="app-sidebar-search" id="shellNavSearch" hidden>
            <input type="search" class="app-sidebar-search-input"
              data-shell-search-input="true"
              placeholder="Search pages…"
              autocomplete="off" spellcheck="false"
              aria-label="Search navigation items" />
          </div>`;
  }

  /**
   * Sidebar scaffold: scrollable primary + pinned Admin utility + account footer.
   */
  function ensureSidebarScaffold() {
    const host = $("appSidebar");
    if (!host) return null;
    let inner = host.querySelector(".app-sidebar-inner");
    let nav = host.querySelector("#appSidebarNav");
    let utility = host.querySelector("#appSidebarUtility");
    let footer = host.querySelector("#appAccountFooter");
    if (!inner || !nav || !footer) {
      host.innerHTML = `
        <div class="app-sidebar-inner">
          ${sidebarHeadHtml()}
          <nav class="app-sidebar-primary" id="appSidebarNav" aria-label="Desk navigation"></nav>
          <nav class="app-sidebar-utility" id="appSidebarUtility" aria-label="Admin" hidden></nav>
          <div class="app-sidebar-footer" id="appAccountFooter" data-auth-primary-host="1">
            ${staticFooterSignInHtml()}
          </div>
        </div>`;
      inner = host.querySelector(".app-sidebar-inner");
      nav = host.querySelector("#appSidebarNav");
      utility = host.querySelector("#appSidebarUtility");
      footer = host.querySelector("#appAccountFooter");
    } else {
      if (!utility) {
        utility = document.createElement("nav");
        utility.className = "app-sidebar-utility";
        utility.id = "appSidebarUtility";
        utility.setAttribute("aria-label", "Admin");
        utility.hidden = true;
        footer.parentNode.insertBefore(utility, footer);
      }
      footer.setAttribute("data-auth-primary-host", "1");
      if (!footer.querySelector("#shellSignIn, #shellAccountTrigger, .shell-account")) {
        footer.innerHTML = staticFooterSignInHtml();
      }
      // Upgrade static HTML heads that only had a bare Collapse button.
      let head = inner.querySelector(".app-sidebar-head");
      if (!head || !document.getElementById("shellSearchToggle")) {
        const tmp = document.createElement("div");
        tmp.innerHTML = sidebarHeadHtml();
        const nextHead = tmp.querySelector(".app-sidebar-head");
        const nextSearch = tmp.querySelector(".app-sidebar-search");
        if (head) head.replaceWith(nextHead);
        else inner.prepend(nextHead);
        const existingSearch = inner.querySelector("#shellNavSearch");
        if (existingSearch) existingSearch.replaceWith(nextSearch);
        else nextHead.after(nextSearch);
        // Fresh nodes need re-wiring.
        const toggle = document.getElementById("shellRailToggle");
        if (toggle) delete toggle.dataset.wired;
        const searchBtn = document.getElementById("shellSearchToggle");
        if (searchBtn) delete searchBtn.dataset.wired;
        const searchInput = document.querySelector("[data-shell-search-input]");
        if (searchInput) delete searchInput.dataset.wired;
      }
    }
    return { host, inner, nav, utility, footer };
  }

  /** Admin utility is super_admin only (design NAV-D04 / GekkoFlow). */
  function isAdminRole(role) {
    return role === "super_admin";
  }

  const NAV_GROUPS_KEY = "gekko_expanded_groups";

  /**
   * L1 group open/closed (tested).
   * No stored preference → follow the active desk so deep links land open.
   */
  function resolveGroupExpanded({ groupActive = false, stored } = {}) {
    if (stored === true || stored === false) return stored;
    return !!groupActive;
  }

  function readExpandedGroups() {
    try {
      const raw = localStorage.getItem(NAV_GROUPS_KEY);
      const parsed = raw ? JSON.parse(raw) : null;
      return parsed && typeof parsed === "object" ? parsed : {};
    } catch (_) {
      return {};
    }
  }

  function writeExpandedGroup(id, expanded) {
    if (!id) return;
    try {
      const map = readExpandedGroups();
      map[id] = !!expanded;
      localStorage.setItem(NAV_GROUPS_KEY, JSON.stringify(map));
    } catch (_) {
      /* private mode */
    }
  }

  function renderNavGroupHtml(
    group,
    { active, path, cfg, collapsible = false, expandedGroups = null } = {}
  ) {
    const children = group.children || [];
    const childActive = !!(active && children.some((c) => c.id === active.id));
    const selfActive = !!(active && active.id === group.id);
    const pathUnderGroup = path.startsWith(cfg.normalizePath(group.href));
    const groupActive = selfActive || childActive || pathUnderGroup;
    const canCollapse = collapsible && children.length > 0;
    const expanded = canCollapse
      ? resolveGroupExpanded({
          groupActive,
          stored: expandedGroups ? expandedGroups[group.id] : undefined,
        })
      : true;
    const parentRowClass = [
      "shell-nav-link",
      "shell-nav-row",
      groupActive ? "is-active-parent" : "",
      selfActive ? "is-active" : "",
    ]
      .filter(Boolean)
      .join(" ");
    const childrenHidden = expanded ? "" : " hidden";
    const chevron = canCollapse
      ? `<button type="button" class="shell-nav-chevron" data-nav-chevron="${escapeHtml(group.id)}"
          aria-expanded="${expanded ? "true" : "false"}"
          aria-controls="nav-children-${escapeHtml(group.id)}"
          title="${expanded ? "Collapse" : "Expand"} ${escapeHtml(group.label)}"
          aria-label="${expanded ? "Collapse" : "Expand"} ${escapeHtml(group.label)}">
          ${iconHtml("chevron")}
        </button>`
      : "";
    const linkClass = [
      "shell-nav-link",
      groupActive ? "is-active-parent" : "",
      selfActive ? "is-active" : "",
    ]
      .filter(Boolean)
      .join(" ");
    const rowWrap = canCollapse
      ? `<div class="shell-nav-row ${groupActive ? "is-active-parent" : ""}">
            <a class="${linkClass}" href="${escapeHtml(group.href)}" data-nav-id="${escapeHtml(group.id)}">
              ${iconHtml(group.icon || "home")}
              <span class="shell-label">${escapeHtml(group.label)}</span>
            </a>
            ${chevron}
          </div>`
      : `<a class="${parentRowClass}" href="${escapeHtml(group.href)}" data-nav-id="${escapeHtml(group.id)}">
              ${iconHtml(group.icon || "home")}
              <span class="shell-label">${escapeHtml(group.label)}</span>
            </a>`;
    return `
      <div class="shell-nav-group ${groupActive ? "is-active" : ""}" data-nav-id="${escapeHtml(group.id)}" data-accent="${escapeHtml(group.accent || "a")}">
        ${rowWrap}
        ${
          children.length
            ? `<div class="shell-nav-children" id="nav-children-${escapeHtml(group.id)}"${childrenHidden}>${children
                .map((child) => {
                  const isActive = !!(active && active.id === child.id);
                  return `<a class="shell-nav-link${isActive ? " is-active" : ""}" href="${escapeHtml(child.href)}" data-nav-id="${escapeHtml(child.id)}">
                    ${iconHtml(child.icon || "activity")}
                    <span class="shell-label">${escapeHtml(child.label)}</span>
                  </a>`;
                })
                .join("")}</div>`
            : ""
        }
      </div>`;
  }

  /**
   * Build primary + utility nav HTML (tested).
   * Admin is pinned in utility (above account), not mid primary list.
   * CSS expects `is-active` / `is-active-parent` — never bare `active`.
   */
  function buildSidebarNavParts(pathname, { role = "", expandedGroups } = {}) {
    const cfg = Config();
    if (!cfg) return { primary: "", utility: "" };
    const active = cfg.findActive(pathname);
    const path = cfg.normalizePath(pathname);
    const adminOk = isAdminRole(role);
    const primaryGroups = cfg.NAVIGATION.filter((g) => g.role !== "admin");
    const utilityGroups = adminOk
      ? cfg.NAVIGATION.filter((g) => g.role === "admin")
      : [];
    const ctx = {
      active,
      path,
      cfg,
      collapsible: true,
      expandedGroups: expandedGroups || null,
    };
    return {
      primary: primaryGroups.map((g) => renderNavGroupHtml(g, ctx)).join(""),
      utility: utilityGroups.map((g) => renderNavGroupHtml(g, ctx)).join(""),
    };
  }

  /** @deprecated use buildSidebarNavParts — returns primary HTML only */
  function buildSidebarNavHtml(pathname, opts) {
    return buildSidebarNavParts(pathname, opts).primary;
  }

  /** Chevron toggles any L1 group (primary desks + pinned Admin) and remembers it. */
  function wireNavChevrons(hostId) {
    const host = $(hostId);
    if (!host || host.dataset.chevronWired === "1") return;
    host.dataset.chevronWired = "1";
    host.addEventListener("click", (e) => {
      const btn = e.target.closest?.("[data-nav-chevron]");
      if (!btn) return;
      e.preventDefault();
      e.stopPropagation();
      const id = btn.getAttribute("data-nav-chevron");
      const children = host.querySelector(`[id="nav-children-${id}"]`);
      if (!children) return;
      const open = children.hasAttribute("hidden");
      if (open) children.removeAttribute("hidden");
      else children.setAttribute("hidden", "");
      btn.setAttribute("aria-expanded", open ? "true" : "false");
      const groupLabel =
        btn
          .closest(".shell-nav-row")
          ?.querySelector(".shell-label")
          ?.textContent?.trim() || "section";
      const verb = open ? "Collapse" : "Expand";
      btn.title = `${verb} ${groupLabel}`;
      btn.setAttribute("aria-label", `${verb} ${groupLabel}`);
      writeExpandedGroup(id, open);
    });
  }

  function renderSidebar(session) {
    const cfg = Config();
    if (!cfg) return;
    ensureIconSprite();
    const parts = ensureSidebarScaffold();
    if (!parts?.nav) return;
    const role = session?.user?.role || "";
    const pathname =
      typeof location !== "undefined" ? location.pathname : "/";
    const html = buildSidebarNavParts(pathname, {
      role,
      expandedGroups: readExpandedGroups(),
    });
    parts.nav.innerHTML = html.primary;
    if (parts.utility) {
      parts.utility.innerHTML = html.utility;
      parts.utility.hidden = !html.utility;
      if (html.utility) parts.utility.removeAttribute("hidden");
    }
    wireRailToggle();
    wireRailHoverExpand();
    wireNavSearch();
    wireNavChevrons("appSidebarNav");
    wireNavChevrons("appSidebarUtility");
    applyShellCollapsed(readCollapsedPref());
    if (navSearchOpen || navSearchQuery) {
      const wrap = document.getElementById("shellNavSearch");
      const btn = document.getElementById("shellSearchToggle");
      const input = document.querySelector("[data-shell-search-input]");
      if (wrap) wrap.hidden = !navSearchOpen;
      if (btn) {
        btn.setAttribute("aria-expanded", navSearchOpen ? "true" : "false");
        btn.classList.toggle("is-active", navSearchOpen);
      }
      if (input && navSearchQuery) input.value = navSearchQuery;
      if (navSearchQuery) applyNavSearch(navSearchQuery);
    }
  }

  async function renderAccount(session) {
    ensureSidebarScaffold();
    removeTopAccountChrome();
    const host = $("appAccountFooter");
    if (!host) return;
    host.innerHTML = authChromeHtml(session, { surface: "footer" });
    wireSignOut("shellSignOut");
    wireAccountMenu();
  }

  function wireChrome() {
    const trigger = document.querySelector(".app-menu-trigger");
    const backdrop = $("appSidebarBackdrop");
    trigger?.addEventListener("click", () => setOverlay(!overlayOpen));
    backdrop?.addEventListener("click", () => setOverlay(false));
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape") {
        if (navSearchOpen) {
          setNavSearchOpen(false);
          return;
        }
        closeTopMenus();
        setOverlay(false);
      }
    });
    document.addEventListener("pointerdown", (e) => {
      if (!e.target.closest?.(".app-topnav-item")) closeTopMenus();
    });
  }

  async function refreshShell(sessionOpt) {
    // Prefer live validation when caller did not pass a session.
    let session = sessionOpt;
    if (session === undefined) {
      session = (await root.GekkoAuth?.getSession?.({ refresh: true })) || null;
    }
    ensureIconSprite();
    ensureSidebarScaffold();
    ensureTopNavHost();
    ensureBreadcrumbsHost();
    removeTopAccountChrome();
    renderSidebar(session);
    renderTopNav();
    renderBreadcrumbs();
    await renderAccount(session);
    // Desk scope comes from left nav / URL / top L1 — do not mount Env/Lane pickers.
    root.GekkoScopeSelector?.unmountTopChrome?.();
    return session;
  }

  function warnMissingControlUrl() {
    const Cfg = root.GekkoControlConfig;
    if (!Cfg || Cfg.isConfigured()) return;
    if (Cfg.mockEnabled && Cfg.mockEnabled()) return;
    const gate = $("gateBanner");
    const msg =
      Cfg.MISSING_MSG ||
      "Control API URL is not configured. Set Cursor/GitHub secret CONTROL_API_URL__PROJ_GEKKOTRADER (patches window.GEKKO_API_URL at deploy).";
    if (gate) {
      gate.hidden = false;
      gate.className = "panel gate-banner gate-blocked";
      gate.textContent = msg;
      return;
    }
    const content = $("appContent");
    if (!content || content.querySelector("[data-gekko-api-url-missing]")) return;
    const note = document.createElement("div");
    note.dataset.gekkoApiUrlMissing = "1";
    note.className = "panel gate-banner gate-blocked";
    note.setAttribute("role", "alert");
    note.textContent = msg;
    content.prepend(note);
  }

  async function boot() {
    if (document.body.dataset.shellPage !== "workspace") return;
    // Soft-gate: clear expired/invalid local token; stay on shell with Sign in.
    root.GekkoAuth?.requireAuthOrRedirect?.();
    ensureIconSprite();
    ensureSidebarScaffold();
    ensureTopNavHost();
    ensureBreadcrumbsHost();
    removeTopAccountChrome();
    renderTopNav();
    renderBreadcrumbs();
    // Paint pinned footer Sign in ASAP (primary) before async /me.
    await renderAccount(null);
    wireRailToggle();
    wireRailHoverExpand();
    wireNavSearch();
    applyShellCollapsed(readCollapsedPref());
    wireInfoTips();
    wireChrome();
    warnMissingControlUrl();
    const session = (await root.GekkoAuth?.validateSessionOrRedirect?.()) || null;
    await refreshShell(session);
    root.addEventListener("gekko-auth-changed", () => {
      void refreshShell();
    });
    if (typeof window !== "undefined") {
      window.addEventListener("resize", () => {
        railHover = false;
        railFocus = false;
        applyNavModel();
        applyShellCollapsed(readCollapsedPref());
      });
    }
    // Scope from left-nav / deep-link URL only (no top Env/Lane pickers).
    const scope = Scope()?.parseScopeFromPath?.(location.pathname);
    if (scope) Scope()?.storeScope?.(scope);
  }

  const api = {
    refreshShell,
    escapeHtml,
    formatMoney,
    authChromeHtml,
    displayNameFromUser,
    avatarInitialFromUser,
    removeTopAccountChrome,
    ensureSidebarScaffold,
    ensureTopNavHost,
    ensureBreadcrumbsHost,
    renderTopNav,
    buildTopNavHtml,
    topNavLabel,
    renderBreadcrumbs,
    applyShellCollapsed,
    applyNavModel,
    isTopnavPrimaryViewport,
    resolveShellRailState,
    resolveGroupExpanded,
    readCollapsedPref,
    readExpandedGroups,
    buildSidebarNavHtml,
    buildSidebarNavParts,
    closeTopMenus,
    applyNavSearch,
    setNavSearchOpen,
  };

  root.GekkoAppShell = api;
  if (typeof module === "object" && module.exports) {
    module.exports = api;
  }

  if (typeof document !== "undefined") {
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", () => void boot());
    } else {
      void boot();
    }
  }
})(typeof globalThis !== "undefined" ? globalThis : this);
