/*! Super-admin user approval desk. */
(function () {
  const $ = (id) => document.getElementById(id);
  function roleLabel(role) {
    return window.GekkoDisplayLabels?.formatRoleLabel?.(role) || "Unknown role";
  }

  function statusLabel(status) {
    return window.GekkoDisplayLabels?.formatUserStatusLabel?.(status) || "Unknown status";
  }

  const ROLE_VALUES = ["view_only", "super_admin"];
  let view = "pending";
  let cache = [];

  function setStatus(text, kind) {
    const el = $("adminStatus");
    if (!el) return;
    el.textContent = text || "";
    el.className = "auth-modal-status" + (kind ? ` ${kind}` : "");
  }

  function fmtTs(value) {
    if (window.GekkoTime?.format) {
      return window.GekkoTime.format(value, { precision: "second", withLabel: true });
    }
    if (!value) return "—";
    return String(value);
  }

  function statusPill(status) {
    const s = String(status || "").toLowerCase();
    const cls =
      s === "active" ? "pill ok" : s === "pending" ? "pill warn" : s === "rejected" ? "pill bad" : "pill";
    const label = statusLabel(status);
    return `<span class="${cls}">${label}</span>`;
  }

  function roleSelect(userId, email, selected, opts = {}) {
    const disabled = opts.disabled ? " disabled" : "";
    const options = ROLE_VALUES.map(
      (value) =>
        `<option value="${value}"${value === selected ? " selected" : ""}>${roleLabel(value)}</option>`
    ).join("");
    return `<select class="admin-role-select" data-id="${userId}" data-email="${email}" data-prev="${selected}"${disabled} aria-label="Role for ${email}">${options}</select>`;
  }

  async function ensureAdmin() {
    const session = (await window.GekkoAuth?.getSession?.()) || null;
    const user = session?.user;
    if (!user) {
      location.replace("/login/?next=" + encodeURIComponent("/admin/users/"));
      return null;
    }
    if (user.role !== "super_admin") {
      setStatus("Super admin access required.", "error");
      $("pendingBody").innerHTML = `<tr><td colspan="4" class="empty">Forbidden</td></tr>`;
      $("usersBody").innerHTML = `<tr><td colspan="4" class="empty">Forbidden</td></tr>`;
      return null;
    }
    if ($("healthPill")) {
      $("healthPill").textContent = roleLabel("super_admin");
      $("healthPill").className = "pill ok";
    }
    return user;
  }

  function setView(next) {
    view = next === "all" ? "all" : "pending";
    const pendingTab = $("tabPending");
    const allTab = $("tabAll");
    pendingTab?.classList.toggle("active", view === "pending");
    allTab?.classList.toggle("active", view === "all");
    if (pendingTab) pendingTab.setAttribute("aria-selected", view === "pending" ? "true" : "false");
    if (allTab) allTab.setAttribute("aria-selected", view === "all" ? "true" : "false");
    if ($("pendingWrap")) $("pendingWrap").hidden = view !== "pending";
    if ($("allWrap")) $("allWrap").hidden = view !== "all";
    render();
  }

  function render() {
    const pending = cache.filter((u) => u.status === "pending");
    const copy = $("usersCopy");
    if (copy) {
      if (view === "pending") {
        copy.textContent = pending.length
          ? `${pending.length} pending`
          : "No pending requests";
      } else {
        copy.textContent = `${cache.length} account${cache.length === 1 ? "" : "s"}`;
      }
    }

    $("pendingBody").innerHTML = pending.length
      ? pending
          .map(
            (u) => `<tr data-id="${u.id}" data-email="${u.email}">
          <td>${u.email}</td>
          <td>${fmtTs(u.created_at)}</td>
          <td>${roleSelect(u.id, u.email, u.role === "super_admin" ? "super_admin" : "view_only")}</td>
          <td class="admin-actions">
            <button type="button" class="btn-primary btn-approve" data-id="${u.id}" data-email="${u.email}">Approve</button>
            <button type="button" class="btn-ghost btn-reject" data-id="${u.id}" data-email="${u.email}">Reject</button>
          </td>
        </tr>`
          )
          .join("")
      : `<tr><td colspan="4" class="empty">No pending requests</td></tr>`;

    const all = cache;
    $("usersBody").innerHTML = all.length
      ? all
          .map(
            (u) => `<tr>
          <td>${u.email}</td>
          <td>${statusPill(u.status)}</td>
          <td>${
            u.status === "pending"
              ? `<span class="muted">Approve in Pending</span>`
              : roleSelect(u.id, u.email, u.role === "super_admin" ? "super_admin" : "view_only")
          }</td>
          <td>${fmtTs(u.created_at)}</td>
        </tr>`
          )
          .join("")
      : `<tr><td colspan="4" class="empty">No users</td></tr>`;
  }

  async function loadUsers() {
    cache = await window.GekkoAuth.authFetch("/api/auth/users");
    render();
  }

  function selectedRoleFor(id) {
    const select = document.querySelector(`.admin-role-select[data-id="${id}"]`);
    return select?.value || "view_only";
  }

  async function approve(id, email) {
    const role = selectedRoleFor(id);
    setStatus(`Approving ${email} as ${roleLabel(role)}…`);
    await window.GekkoAuth.authFetch(`/api/auth/users/${id}/approve`, {
      method: "POST",
      body: JSON.stringify({ role }),
    });
    setStatus(`Approved ${email}.`, "ok");
    await loadUsers();
  }

  async function reject(id, email) {
    setStatus(`Rejecting ${email}…`);
    await window.GekkoAuth.authFetch(`/api/auth/users/${id}/reject`, { method: "POST" });
    setStatus(`Rejected ${email}.`, "ok");
    await loadUsers();
  }

  async function setRole(id, email, role, selectEl) {
    setStatus(`Updating role for ${email}…`);
    try {
      await window.GekkoAuth.authFetch(`/api/auth/users/${id}/role`, {
        method: "POST",
        body: JSON.stringify({ role }),
      });
      setStatus(`Updated ${email} to ${roleLabel(role)}.`, "ok");
      await loadUsers();
    } catch (err) {
      if (selectEl) selectEl.value = selectEl.dataset.prev || "view_only";
      throw err;
    }
  }

  function wire() {
    document.addEventListener("click", async (e) => {
      const viewBtn = e.target.closest?.(".admin-view-tab");
      if (viewBtn?.dataset.view) {
        setView(viewBtn.dataset.view);
        return;
      }
      const approveBtn = e.target.closest?.(".btn-approve");
      const rejectBtn = e.target.closest?.(".btn-reject");
      try {
        if (approveBtn) {
          await approve(approveBtn.dataset.id, approveBtn.dataset.email);
        } else if (rejectBtn) {
          await reject(rejectBtn.dataset.id, rejectBtn.dataset.email);
        }
      } catch (err) {
        setStatus(err?.message || "Action failed", "error");
      }
    });

    document.addEventListener("change", async (e) => {
      const select = e.target.closest?.(".admin-role-select");
      if (!select || view !== "all") return;
      const role = select.value;
      const prev = select.dataset.prev || "view_only";
      if (role === prev) return;
      try {
        await setRole(select.dataset.id, select.dataset.email, role, select);
      } catch (err) {
        setStatus(err?.message || "Could not update role", "error");
      }
    });

    $("btnRefreshUsers")?.addEventListener("click", async () => {
      try {
        setStatus("Refreshing…");
        await loadUsers();
        setStatus("");
      } catch (err) {
        setStatus(err?.message || "Refresh failed", "error");
      }
    });
  }

  async function boot() {
    wire();
    setView("pending");
    const admin = await ensureAdmin();
    if (!admin) return;
    try {
      await loadUsers();
    } catch (err) {
      setStatus(err?.message || "Could not load users", "error");
      $("pendingBody").innerHTML = `<tr><td colspan="4" class="empty">Failed to load</td></tr>`;
      $("usersBody").innerHTML = `<tr><td colspan="4" class="empty">Failed to load</td></tr>`;
    }
  }

  boot();
})();
