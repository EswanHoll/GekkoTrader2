/**
 * Human-facing labels for wire/API enum tokens.
 * Hard rule: never show raw database/API field codes as the main UI label.
 */
(function (root) {
  "use strict";

  const ROLE_LABELS = Object.freeze({
    super_admin: "Super admin",
    view_only: "View only",
    admin: "Admin",
  });

  const USER_STATUS_LABELS = Object.freeze({
    pending: "Pending",
    active: "Active",
    rejected: "Rejected",
  });

  /**
   * @param {string|null|undefined} role wire value (e.g. super_admin)
   * @returns {string} human label; never the raw code for unknown values
   */
  function formatRoleLabel(role) {
    const key = String(role ?? "").trim();
    if (!key) return "Unknown role";
    if (Object.prototype.hasOwnProperty.call(ROLE_LABELS, key)) {
      return ROLE_LABELS[key];
    }
    return "Unknown role";
  }

  /**
   * @param {string|null|undefined} status wire value (pending|active|rejected)
   * @returns {string} human label; never the raw code for unknown values
   */
  function formatUserStatusLabel(status) {
    const key = String(status ?? "")
      .trim()
      .toLowerCase();
    if (!key) return "Unknown status";
    if (Object.prototype.hasOwnProperty.call(USER_STATUS_LABELS, key)) {
      return USER_STATUS_LABELS[key];
    }
    return "Unknown status";
  }

  const api = {
    formatRoleLabel,
    formatUserStatusLabel,
    ROLE_LABELS,
    USER_STATUS_LABELS,
  };

  root.GekkoDisplayLabels = api;
  if (typeof module === "object" && module.exports) {
    module.exports = api;
  }
})(typeof globalThis !== "undefined" ? globalThis : this);
