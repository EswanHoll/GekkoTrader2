/*! Site-wide clock: display instants in SAST (Africa/Johannesburg, UTC+2). */
(function (root) {
  "use strict";

  const TZ = "Africa/Johannesburg";
  const LABEL = "SAST";

  /**
   * Parse API timestamps as UTC.
   * Engines often emit naive ISO without ``Z`` / offset — treat those as UTC.
   */
  function parseUtc(value) {
    if (value == null || value === "") return null;
    if (value instanceof Date) {
      return Number.isNaN(value.getTime()) ? null : value;
    }
    if (typeof value === "number" && Number.isFinite(value)) {
      const d = new Date(value);
      return Number.isNaN(d.getTime()) ? null : d;
    }
    let raw = String(value).trim();
    if (!raw || raw === "—") return null;
    // Already-formatted display string — do not re-parse as local.
    if (/\bSAST\b/i.test(raw) && /^\d{4}-\d{2}-\d{2} /.test(raw)) {
      return null;
    }
    // Space separator → ISO T for Date.parse reliability.
    if (/^\d{4}-\d{2}-\d{2} \d/.test(raw)) {
      raw = raw.replace(" ", "T");
    }
    const hasZone = /Z$/i.test(raw) || /[+-]\d{2}:?\d{2}$/.test(raw);
    const normalized = hasZone ? raw : `${raw}Z`;
    const d = new Date(normalized);
    return Number.isNaN(d.getTime()) ? null : d;
  }

  function fractionFromSource(value) {
    const raw = String(value ?? "");
    const m = raw.match(/\.(\d+)/);
    return m ? m[1] : "";
  }

  function partsInSast(date) {
    const fmt = new Intl.DateTimeFormat("en-GB", {
      timeZone: TZ,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
    });
    const bag = Object.create(null);
    for (const p of fmt.formatToParts(date)) {
      if (p.type !== "literal") bag[p.type] = p.value;
    }
    return {
      year: bag.year || "0000",
      month: bag.month || "00",
      day: bag.day || "00",
      hour: bag.hour === "24" ? "00" : bag.hour || "00",
      minute: bag.minute || "00",
      second: bag.second || "00",
    };
  }

  /**
   * @param {string|Date|number|null|undefined} value
   * @param {{precision?: 'minute'|'second'|'fraction'|'auto', withLabel?: boolean, empty?: string}} [opts]
   */
  function format(value, opts) {
    const options = opts || {};
    const empty = options.empty != null ? options.empty : "—";
    const withLabel = options.withLabel !== false;
    let precision = options.precision || "auto";

    const d = parseUtc(value);
    if (!d) {
      const raw = value == null ? "" : String(value).trim();
      if (/\bSAST\b/i.test(raw)) return raw;
      return raw || empty;
    }

    const fracSrc = fractionFromSource(value);
    if (precision === "auto") {
      precision = fracSrc ? "fraction" : "second";
    }

    const p = partsInSast(d);
    let out = `${p.year}-${p.month}-${p.day} ${p.hour}:${p.minute}`;
    if (precision === "second" || precision === "fraction") {
      out += `:${p.second}`;
    }
    if (precision === "fraction" && fracSrc) {
      out += `.${fracSrc}`;
    }
    if (withLabel) out += ` ${LABEL}`;
    return out;
  }

  /** Operator / status lines: ``Updated 2026-07-18 13:34:16.196983 SAST``. */
  function formatUpdated(value) {
    if (!value) return "";
    return `Updated ${format(value, { precision: "auto", withLabel: true })}`;
  }

  /** Compact board cells: ``YYYY-MM-DD HH:MM SAST``. */
  function formatCompact(value) {
    return format(value, { precision: "minute", withLabel: true, empty: "—" });
  }

  /** Today's calendar date in SAST as ``YYYY-MM-DD``. */
  function todayYmd() {
    const p = partsInSast(new Date());
    return `${p.year}-${p.month}-${p.day}`;
  }

  const api = {
    TZ,
    LABEL,
    parseUtc,
    format,
    formatUpdated,
    formatCompact,
    todayYmd,
  };

  root.GekkoTime = api;
  if (typeof module === "object" && module.exports) {
    module.exports = api;
  }
})(typeof globalThis !== "undefined" ? globalThis : this);
