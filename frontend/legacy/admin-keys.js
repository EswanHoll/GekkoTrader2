/*! Super-admin Binance key management for Live + Demo workers. */
(function () {
  "use strict";

  const $ = (id) => document.getElementById(id);

  function escapeHtml(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  async function ensureAdmin() {
    // Live /me check — cached login must not hide an expired JWT (Keys needs both
    // login JWT + operator write session).
    const session = (await window.GekkoAuth?.getSession?.({ refresh: true })) || null;
    const user = session?.user;
    if (!user) {
      location.replace("/login/?next=" + encodeURIComponent("/admin/keys/"));
      return null;
    }
    if (user.role !== "super_admin") {
      const pill = $("healthPill");
      if (pill) {
        pill.textContent = "forbidden";
        pill.className = "pill bad";
      }
      if ($("keysStatusMeta")) {
        $("keysStatusMeta").textContent = "Super admin access required.";
      }
      return null;
    }
    const pill = $("healthPill");
    if (pill) {
      pill.textContent = "super admin";
      pill.className = "pill ok";
    }
    return user;
  }

  function setMeta(msg, ok) {
    const el = $("keysStatusMeta");
    if (!el) return;
    el.textContent = msg || "";
    el.className = `section-copy muted-line${ok === false ? " danger-text" : ""}`;
  }

  function renderKeyCard(t) {
    const status = t.error
      ? `<span class="danger-text">error</span>`
      : t.configured
        ? `<span class="ok-text">configured</span>`
        : `<span class="muted-line">missing</span>`;
    const liveConfirm =
      t.id === "live"
        ? `<div class="operator-row">
            <label class="auth-label" for="confirm_${escapeHtml(t.id)}">Type LIVE to confirm</label>
            <input id="confirm_${escapeHtml(t.id)}" name="confirm" type="text" autocomplete="off" spellcheck="false" placeholder="LIVE" />
          </div>`
        : "";
    const exchange = (t.execution_env === "demo" || t.is_demo) ? "Binance demo" : "Binance live";
    const updatedAt = t.api_key_updated_at
      ? window.GekkoTime?.format?.(t.api_key_updated_at, {
          precision: "second",
          withLabel: true,
        }) || String(t.api_key_updated_at)
      : "";
    return `<article class="panel admin-keys-card" data-target="${escapeHtml(t.id)}">
          <div class="panel-heading">
            <div class="panel-heading-copy">
              <h3>${escapeHtml(t.label)}</h3>
              <p class="section-copy muted-line">${exchange}</p>
            </div>
            ${status}
          </div>
          <p class="section-copy muted-line">
            Key ${t.has_api_key ? "set" : "missing"} · Secret ${t.has_api_secret ? "set" : "missing"}
            ${updatedAt ? ` · updated ${escapeHtml(updatedAt)}` : ""}
          </p>
          ${t.error ? `<p class="section-copy danger-text">${escapeHtml(t.error)}</p>` : ""}
          <form class="admin-keys-form" data-keys-form="${escapeHtml(t.id)}">
            <div class="operator-row">
              <label class="auth-label" for="key_${escapeHtml(t.id)}">API key</label>
              <input id="key_${escapeHtml(t.id)}" name="api_key" type="password" autocomplete="off" spellcheck="false" required />
            </div>
            <div class="operator-row">
              <label class="auth-label" for="secret_${escapeHtml(t.id)}">API secret</label>
              <input id="secret_${escapeHtml(t.id)}" name="api_secret" type="password" autocomplete="off" spellcheck="false" required />
            </div>
            ${liveConfirm}
            <div class="operator-actions">
              <button type="submit" class="btn">Save to AWS</button>
            </div>
            <p class="operator-status" data-form-status></p>
          </form>
        </article>`;
  }

  function renderTargets(targets) {
    const root = $("keysTargetsRoot");
    if (!root) return;
    if (!targets?.length) {
      root.innerHTML = `<p class="section-copy muted-line">No targets.</p>`;
      return;
    }
    // Same band layout as Overview summaries: Live alone, then Demo pair.
    const order = { live: 0, "demo-a": 1, "demo-b": 2, "demo-v1": 1, "demo-v2": 2 };
    const sorted = [...targets].sort(
      (a, b) => (order[a.id] ?? 99) - (order[b.id] ?? 99)
    );
    const live = sorted.find((t) => t.id === "live");
    const demos = sorted.filter((t) => t.id !== "live");
    const parts = [];
    if (live) {
      parts.push(
        `<div class="overview-summary-row overview-summary-row-solo">${renderKeyCard(live)}</div>`
      );
    }
    if (demos.length) {
      parts.push(
        `<div class="overview-summary-row overview-summary-row-pair">${demos
          .map(renderKeyCard)
          .join("")}</div>`
      );
    }
    root.innerHTML = parts.join("");

    root.querySelectorAll("[data-keys-form]").forEach((form) => {
      form.addEventListener("submit", (event) => {
        event.preventDefault();
        void saveTarget(form);
      });
    });
  }

  async function refreshStatus() {
    const Op = window.GekkoOperator;
    if (!Op?.privilegedFetch) {
      setMeta("Operator helpers missing.", false);
      return;
    }
    setMeta("Loading key status from the AWS password vault…");
    try {
      const data = await Op.privilegedFetch("/api/admin/keys");
      renderTargets(data.targets || []);
      const configured = (data.targets || []).filter((t) => t.configured).length;
      setMeta(
        `${configured} of ${(data.targets || []).length} desks have exchange keys in AWS · actor ${
          data.actor || "—"
        }. Website releases do not wipe these. Sim never receives keys.`,
        true
      );
    } catch (err) {
      const msg = String(err?.message || "Failed to load key status");
      const lower = msg.toLowerCase();
      // Never imply the operator write-secret was wiped when Control simply
      // has no Keys route / cannot read the vault yet.
      if (
        lower.includes("not found") ||
        err?.status === 404 ||
        lower.includes("404")
      ) {
        setMeta(
          "Exchange key status is unavailable from Control right now — this is not your operator secret. Demo keys already live in the AWS password vault and are not cleared by website releases. Retry after Control is updated, or use Refresh keys.",
          false
        );
        return;
      }
      setMeta(msg, false);
    }
  }

  async function saveTarget(form) {
    const Op = window.GekkoOperator;
    const target = form.getAttribute("data-keys-form");
    const statusEl = form.querySelector("[data-form-status]");
    const setStatus = (msg, ok) => {
      if (!statusEl) return;
      statusEl.textContent = msg || "";
      statusEl.className = `operator-status${ok === true ? " ok" : ok === false ? " error" : ""}`;
    };
    if (!Op?.privilegedFetch || !target) return;
    const fd = new FormData(form);
    const body = {
      api_key: String(fd.get("api_key") || "").trim(),
      api_secret: String(fd.get("api_secret") || "").trim(),
      confirm: String(fd.get("confirm") || "").trim(),
    };
    setStatus("Saving to AWS Secrets Manager…");
    try {
      const data = await Op.privilegedFetch(`/api/admin/keys/${encodeURIComponent(target)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      form.reset();
      setStatus(
        `Saved to AWS · fingerprint ${data.api_key_fingerprint || "—"} · workers pick this up after restart`,
        true
      );
      await refreshStatus();
    } catch (err) {
      setStatus(err.message || "Save failed", false);
    }
  }

  document.addEventListener("DOMContentLoaded", async () => {
    const user = await ensureAdmin();
    if (!user) return;
    const panel = $("operatorPanel");
    const Op = window.GekkoOperator;
    Op?.wireOperatorPanel?.(panel, {
      onMinted: () => {
        void refreshStatus();
      },
      onSaved: () => {
        void refreshStatus();
      },
    });
    $("keysRefreshBtn")?.addEventListener("click", () => {
      void refreshStatus();
    });
    const params = new URLSearchParams(location.search);
    if (Op?.hasDeviceSecret?.()) {
      setMeta(
        params.get("session_failed") === "1"
          ? "Operator secret is still saved on this device · click Update & unlock if writes failed."
          : "Operator secret saved on this device · loading key status…"
      );
      void refreshStatus();
      if (params.get("session_failed") === "1") {
        panel?.querySelector("[data-operator-mint]")?.focus?.();
      }
    } else {
      setMeta("Save the operator secret once above, then exchange keys can load.");
      if (params.get("need_secret") === "1" || params.get("session_failed") === "1") {
        panel?.querySelector("[data-operator-secret]")?.focus?.();
      }
    }
  });
})();
