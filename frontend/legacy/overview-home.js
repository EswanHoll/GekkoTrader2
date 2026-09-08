/**
 * Home Strategies / Roadmaps (Parity Plus floor from old.gekkotrader.com).
 * Roadmaps try /api/project-status; fall back to a clear Sim→Demo→Live map.
 */
(function (root) {
  "use strict";

  const $ = (id) => document.getElementById(id);

  function escapeHtml(s) {
    return root.GekkoUi?.escapeHtml?.(s) ?? String(s ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function stateBadge(state) {
    const s = String(state || "pending");
    return `<span class="status-badge status-${escapeHtml(s)}">${escapeHtml(s)}</span>`;
  }

  function renderItems(items) {
    const list = Array.isArray(items) ? items : [];
    if (!list.length) return "";
    return `<ul class="checklist">${list
      .map((it) => `<li>${escapeHtml(typeof it === "string" ? it : it.label || it.text || "—")}</li>`)
      .join("")}</ul>`;
  }

  function renderPhase(key, phase) {
    const stats = phase.stats || {};
    let statsHtml = "";
    if (stats.equity != null || stats.pnl != null) {
      statsHtml = `<div class="phase-stats">
        <span>Equity ${escapeHtml(String(stats.equity ?? "—"))}</span>
        <span>PnL ${escapeHtml(String(stats.pnl ?? "—"))}</span>
      </div>`;
    } else if (stats.enabled != null) {
      statsHtml = `<div class="phase-stats"><span>${stats.enabled ? "Live enabled" : "Not enabled"}</span></div>`;
    }
    return `<article class="panel phase-card phase-${escapeHtml(phase.state || "pending")}">
      <div class="phase-head">
        <h2>${escapeHtml(phase.title || key)}</h2>
        ${stateBadge(phase.state)}
      </div>
      <p class="section-copy">${escapeHtml(phase.summary || "")}</p>
      ${statsHtml}
      ${renderItems(phase.items)}
    </article>`;
  }

  function renderRoadmap(prefix, data, intro) {
    const introEl = $(`${prefix}PlanIntro`);
    if (introEl) introEl.textContent = intro || data.intro || "";
    const strip = $(`${prefix}EngineStrip`);
    if (strip) {
      const eng = data.engine || data.runtime || {};
      strip.innerHTML = eng.label
        ? `<span class="scope-chip">${escapeHtml(eng.label)}</span> ${escapeHtml(eng.status || "")}`
        : "";
    }
    const next = $(`${prefix}NextActions`);
    if (next) {
      const actions = data.next_actions || data.next || [];
      next.innerHTML = Array.isArray(actions)
        ? actions
            .map((it) => `<li>${escapeHtml(typeof it === "string" ? it : it.label || "—")}</li>`)
            .join("")
        : "";
    }
    const grid = $(`${prefix}PhaseGrid`);
    const phases = data.phases || {};
    if (grid) {
      grid.innerHTML = Object.keys(phases)
        .map((k) => renderPhase(k, phases[k]))
        .join("");
    }
    const infra = $(`${prefix}InfraList`);
    if (infra) {
      const items = data.infrastructure || data.infra || [];
      infra.innerHTML = Array.isArray(items)
        ? items
            .map((it) => `<li>${escapeHtml(typeof it === "string" ? it : it.label || "—")}</li>`)
            .join("")
        : "";
    }
  }

  function fallbackRoadmap(laneLetter) {
    const lane = String(laneLetter || "A").toUpperCase();
    const lower = lane.toLowerCase();
    return {
      intro: `Lane ${lane} — prove on Sim and Demo before any Live capital. Live activation stays manual.`,
      next_actions: [
        `Review Sim ${lane} Results Run Board`,
        `Copy proven settings to Demo ${lane} when ready`,
        "Keep Live dormant until the operator explicitly activates capital",
      ],
      phases: {
        sim: {
          title: `Sim ${lane}`,
          state: "active",
          summary: `Research / batch runs for Lane ${lane}.`,
          items: [
            { label: `Open Sim ${lane} Desk`, href: `/sim/${lower}/` },
            { label: "Results Run Board", href: `/sim/${lower}/results/` },
            { label: "Reports", href: `/sim/${lower}/runs/` },
          ],
        },
        demo: {
          title: `Demo ${lane}`,
          state: "pending",
          summary: `Binance demo book for Lane ${lane} forward checks.`,
          items: [
            { label: `Open Demo ${lane} Desk`, href: `/demo/${lower}/` },
            { label: "Demo Results", href: `/demo/${lower}/results/` },
          ],
        },
        live: {
          title: "Live",
          state: "pending",
          summary: "Singleton Live desk — dormant until manual activation.",
          items: [{ label: "Open Live Status", href: "/live/" }],
          stats: { enabled: false },
        },
      },
      infrastructure: [
        "Control API (AWS Tokyo)",
        "Cloudflare Pages UI",
        "Supabase Tokyo GekkoTraderDB",
        "R2 run artefacts",
      ],
    };
  }

  function enhancePhaseLinks(prefix, data) {
    const grid = $(`${prefix}PhaseGrid`);
    if (!grid) return;
    // Re-render items as links when href present.
    const phases = data.phases || {};
    grid.innerHTML = Object.keys(phases)
      .map((key) => {
        const phase = phases[key];
        const items = Array.isArray(phase.items) ? phase.items : [];
        const list = items
          .map((it) => {
            if (typeof it === "string") return `<li>${escapeHtml(it)}</li>`;
            if (it.href) {
              return `<li><a href="${escapeHtml(it.href)}">${escapeHtml(it.label || it.href)}</a></li>`;
            }
            return `<li>${escapeHtml(it.label || "—")}</li>`;
          })
          .join("");
        return `<article class="panel phase-card phase-${escapeHtml(phase.state || "pending")}">
          <div class="phase-head">
            <h2>${escapeHtml(phase.title || key)}</h2>
            ${stateBadge(phase.state)}
          </div>
          <p class="section-copy">${escapeHtml(phase.summary || "")}</p>
          <ul class="checklist">${list}</ul>
        </article>`;
      })
      .join("");
  }

  async function fetchProjectStatus(product) {
    try {
      if (root.GekkoApi?.get) {
        return await root.GekkoApi.get(
          `/api/project-status?product=${encodeURIComponent(product)}`
        );
      }
    } catch (_) {
      /* fall through */
    }
    return null;
  }

  async function loadRoadmaps() {
    if (!$("v1PlanIntro") && !$("v2PlanIntro")) return;
    const [v1Status, v2Status] = await Promise.all([
      fetchProjectStatus("v1"),
      fetchProjectStatus("v2"),
    ]);
    const v1 = v1Status || fallbackRoadmap("A");
    const v2 = v2Status || fallbackRoadmap("B");
    renderRoadmap(
      "v1",
      v1,
      v1Status
        ? "Lane A roadmap — prove on Sim/Demo before Live capital."
        : "Lane A roadmap (local map — project-status unavailable)."
    );
    enhancePhaseLinks("v1", v1);
    renderRoadmap(
      "v2",
      v2,
      v2Status
        ? "Lane B roadmap — prove on Sim/Demo before Live capital."
        : "Lane B roadmap (local map — project-status unavailable)."
    );
    enhancePhaseLinks("v2", v2);
    const infraDefaults = fallbackRoadmap("A").infrastructure;
    if ($("v1InfraList") && !$("v1InfraList").children.length) {
      $("v1InfraList").innerHTML = infraDefaults
        .map((x) => `<li>${escapeHtml(x)}</li>`)
        .join("");
    }
    if ($("v2InfraList") && !$("v2InfraList").children.length) {
      $("v2InfraList").innerHTML = infraDefaults
        .map((x) => `<li>${escapeHtml(x)}</li>`)
        .join("");
    }
  }

  function boot() {
    const page = document.body?.dataset?.page || "";
    if (page === "roadmaps") void loadRoadmaps();
  }

  root.GekkoOverviewHome = { loadRoadmaps, fallbackRoadmap };
  if (typeof document !== "undefined") {
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", boot);
    } else {
      boot();
    }
  }
})(typeof globalThis !== "undefined" ? globalThis : this);
