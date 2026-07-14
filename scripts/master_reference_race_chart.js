(function initMasterReferenceRaceChart(global) {
  const {
    escapeHtml,
    toRaceKey,
    formatStatsLabel,
    getRaceChartColor,
    getPieSlicePath
  } = global.MasterReferenceUtils || {};

  function renderRaceMembersList(members, raceLabel) {
    const safeMembers = Array.isArray(members) ? members : [];
    if (!safeMembers.length) {
      return `<span class="stats-pill">no cast entries tagged ${escapeHtml(raceLabel || "for this race")}</span>`;
    }

    return safeMembers
      .map((member) => `<span class="stats-pill">${escapeHtml(member.name)} (${escapeHtml(member.id)})</span>`)
      .join("");
  }

  function updateRaceChartSelection(chartEl, raceKey) {
    if (!chartEl) {
      return;
    }

    let membersByRace = {};
    try {
      membersByRace = JSON.parse(chartEl.dataset.raceMembers || "{}");
    } catch (error) {
      console.warn("Failed to parse race members payload", error);
    }

    const normalizedRaceKey = toRaceKey(raceKey);
    const targetList = chartEl.querySelector("[data-race-members-list]");
    const selectedLabel = chartEl.querySelector(`[data-race-key=\"${normalizedRaceKey}\"]`)?.dataset.raceLabel || formatStatsLabel(normalizedRaceKey || "unknown");
    const members = Array.isArray(membersByRace?.[normalizedRaceKey]) ? membersByRace[normalizedRaceKey] : [];

    chartEl.querySelectorAll("[data-race-key]").forEach((el) => {
      const isActive = toRaceKey(el.dataset.raceKey) === normalizedRaceKey;
      el.style.opacity = isActive ? "1" : "0.55";
      if (el.tagName === "BUTTON") {
        el.style.fontWeight = isActive ? "700" : "500";
        el.style.textDecoration = isActive ? "underline" : "none";
      }
      if (el.tagName === "path" || el.tagName === "circle") {
        el.style.strokeWidth = isActive ? "1.8" : "1";
      }
    });

    if (targetList) {
      targetList.innerHTML = renderRaceMembersList(members, selectedLabel);
    }
  }

  function renderRacePieChart(rows, total, membersByRace) {
    const safeRows = Array.isArray(rows) ? rows : [];
    const safeTotal = Number.isFinite(total) && total > 0 ? total : 0;
    if (!safeTotal || !safeRows.length) {
      return "";
    }

    let cursor = 0;
    const slices = safeRows
      .filter((row) => Number(row?.count) > 0)
      .map((row) => {
        const count = Number(row.count);
        const pct = (count / safeTotal) * 100;
        const start = cursor;
        const end = cursor + pct;
        cursor = end;
        const lowerLabel = toRaceKey(row.label);
        return {
          key: lowerLabel,
          label: row.label,
          count,
          pct,
          color: getRaceChartColor(lowerLabel),
          start,
          end
        };
      });

    if (!slices.length) {
      return "";
    }

    const size = 132;
    const center = size / 2;
    const radius = center - 1;
    const membersPayload = escapeHtml(JSON.stringify(membersByRace || {}));

    const pieSlices = slices
      .map((slice) => {
        const startAngle = (slice.start / 100) * 360;
        const endAngle = (slice.end / 100) * 360;
        const path = Math.abs(endAngle - startAngle) >= 359.99
          ? `<circle cx="${center}" cy="${center}" r="${radius}" fill="${slice.color}" data-race-key="${escapeHtml(slice.key)}" data-race-label="${escapeHtml(String(slice.label || ""))}" style="cursor:pointer;stroke:rgba(255,255,255,0.7);stroke-width:1;"></circle>`
          : `<path d="${getPieSlicePath(center, radius, startAngle, endAngle)}" fill="${slice.color}" data-race-key="${escapeHtml(slice.key)}" data-race-label="${escapeHtml(String(slice.label || ""))}" style="cursor:pointer;stroke:rgba(255,255,255,0.7);stroke-width:1;"></path>`;

        return `${path}<title>${escapeHtml(String(slice.label || ""))}: ${slice.count} (${slice.pct.toFixed(1)}%)</title>`;
      })
      .join("");

    const legend = slices
      .map((slice) => `
      <button type="button" data-race-key="${escapeHtml(slice.key)}" data-race-label="${escapeHtml(String(slice.label || ""))}" style="display:flex;align-items:center;gap:8px;font-size:0.82rem;line-height:1.35;background:transparent;border:0;color:inherit;padding:0;cursor:pointer;text-align:left;">
        <span style="display:inline-block;width:10px;height:10px;border-radius:50%;background:${slice.color};border:1px solid rgba(255,255,255,0.4);"></span>
        <span>${escapeHtml(String(slice.label || ""))}: ${slice.count} (${slice.pct.toFixed(1)}%)</span>
      </button>
    `)
      .join("");

    return `
    <div data-race-chart data-race-members="${membersPayload}" style="margin-bottom:12px;">
      <div style="display:grid;grid-template-columns:auto 1fr;gap:14px;align-items:center;">
      <div style="position:relative;width:${size}px;height:${size}px;border-radius:50%;border:1px solid rgba(255,255,255,0.2);box-shadow:inset 0 0 0 1px rgba(0,0,0,0.15);">
        <svg viewBox="0 0 ${size} ${size}" width="${size}" height="${size}" role="img" aria-label="Race distribution pie chart" style="display:block;border-radius:50%;overflow:hidden;">
          ${pieSlices}
        </svg>
        <div style="position:absolute;inset:24px;border-radius:50%;background:rgba(16,18,22,0.96);display:flex;align-items:center;justify-content:center;font-size:0.78rem;color:#cfd4dc;border:1px solid rgba(255,255,255,0.08);">
          ${safeTotal} total
        </div>
      </div>
      <div style="display:flex;flex-direction:column;gap:5px;">${legend}</div>
      </div>
      <div class="stats-small" style="margin-top:10px;">Click a race slice to list matching characters</div>
      <div class="stats-pill-list" data-race-members-list><span class="stats-pill">click a slice or legend row to view members</span></div>
    </div>
  `;
  }

  global.MasterReferenceRaceChart = {
    updateRaceChartSelection,
    renderRacePieChart
  };
}(window));
