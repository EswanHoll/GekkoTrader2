/*! Strategy summaries — rendered on Home (#strategy-v1 / #strategy-v2 / #strategy-bandit). */
(function () {
  "use strict";

  const SUMMARIES = {
    v1: {
      title: "Strategy V1",
      eyebrow: "How V1 trades",
      lead:
        "V1 trades liquid USDT-M futures by rotating through a shortlist of classic setups. After each closed trade it leans toward the setups that have been working.",
      how: [
        "Looks for Trend Pullback, Mean Reversion, and Breakout Retest as the core plays.",
        "Also runs shorter-horizon setups such as VWAP scalp, EMA cross, Stoch RSI fade, and momentum continuation.",
        "Uses ATR-based stops and take-profits; each trade risks a small fixed slice of account equity (~1.5%).",
        "Prefers setups that have been winning lately, while still trying others so it does not get stuck on one pattern.",
        "Sizes leverage by conviction between 1x and 3x.",
      ],
    },
    v2: {
      title: "Strategy V2",
      eyebrow: "How V2 trades",
      lead:
        "V2 trades the same futures markets with a regime-first mindset: read the market condition, then pick a specialist play that fits that condition.",
      how: [
        "Starts from market context — trending, chopping, or breaking out — before choosing an entry style.",
        "In trends it favors EMA cross and Supertrend; in chop it fades with Bollinger + RSI; when momentum is clear it uses MACD and ADX continuation; when range expands it looks for channel / range breaks.",
        "Keeps the same cash-risk discipline: ATR stops, fixed risk per trade, daily and weekly loss caps, and a kill switch.",
        "Ranks which specialist is earning and leans into those plays while still sampling alternatives.",
        "Sizes leverage by conviction between 1x and 3x.",
      ],
    },
  };

  const BANDIT = {
    eyebrow: "Shared selector",
    title: "What the bandit is",
    lead:
      "“Bandit” comes from the multi-armed bandit problem — named after slot machines (“one-armed bandits”). Each option is an arm with an uncertain payoff. The algorithm keeps choosing: try something less proven (explore), or stick with what looks best so far (exploit).",
    body:
      "In GekkoTrader the bandit is not the trading strategy. It is the adaptive picker that chooses which strategy variant (parameter set) to use next. A closed trade’s result is the reward; that evidence updates the variant’s standing before the next choice.",
    terms: [
      { term: "Arm", meaning: "One eligible strategy variant or parameter set" },
      { term: "Pull", meaning: "Selecting that variant for a trade decision" },
      { term: "Reward", meaning: "The outcome evidence from the trade (e.g. PnL or a reward score)" },
      { term: "Exploration", meaning: "Trying a less-established eligible variant to learn more" },
      { term: "Exploitation", meaning: "Favouring the strongest eligible variant on current evidence" },
    ],
  };

  function escapeHtml(s) {
    return String(s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function tipMarkup(text, ariaLabel) {
    if (typeof window.GekkoUi?.infoTip === "function") {
      return window.GekkoUi.infoTip(text, ariaLabel);
    }
    return `<button type="button" class="info-tip" aria-label="${escapeHtml(ariaLabel)}"><span class="info-tip-icon" aria-hidden="true">i</span><span class="info-tip-bubble" role="tooltip">${escapeHtml(text)}</span></button>`;
  }

  function renderSummary(product) {
    const s = SUMMARIES[product];
    if (!s) return "";
    const how = s.how.map((d) => `<li>${escapeHtml(d)}</li>`).join("");
    const tip = tipMarkup(s.lead, `About ${s.title}`);

    return `
      <p class="eyebrow">${escapeHtml(s.eyebrow)}</p>
      <h2 class="heading-with-tip">${escapeHtml(s.title)} ${tip}</h2>
      <h3 class="strategy-subhead">How it trades</h3>
      <ul class="checklist strategy-decide">${how}</ul>
    `;
  }

  function renderBandit() {
    const terms = BANDIT.terms
      .map(
        (t) => `
      <div class="strategy-bandit-term">
        <dt>${escapeHtml(t.term)}</dt>
        <dd>${escapeHtml(t.meaning)}</dd>
      </div>`
      )
      .join("");
    const tip = tipMarkup(`${BANDIT.lead} ${BANDIT.body}`, "About the bandit");

    return `
      <p class="eyebrow">${escapeHtml(BANDIT.eyebrow)}</p>
      <h2 class="heading-with-tip">${escapeHtml(BANDIT.title)} ${tip}</h2>
      <h3 class="strategy-subhead">In plain terms</h3>
      <dl class="strategy-bandit-terms">${terms}</dl>
    `;
  }

  function paint() {
    const v1 = document.getElementById("strategy-v1");
    const v2 = document.getElementById("strategy-v2");
    const bandit = document.getElementById("strategy-bandit");
    if (!v1 && !v2 && !bandit) return;
    if (v1) v1.innerHTML = renderSummary("v1");
    if (v2) v2.innerHTML = renderSummary("v2");
    if (bandit) bandit.innerHTML = renderBandit();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", paint);
  } else {
    paint();
  }

  window.GekkoStrategySummaries = { paint, SUMMARIES, BANDIT };
})();
