const PROB_BINS = [
  { color: "#6e798b", weight: 1.8, opacity: 0.95, label: "under 10% of members" },
  { color: "#7a5cc7", weight: 2.8, opacity: 1, label: "10 to 49%" },
  { color: "#a98bf0", weight: 3.8, opacity: 1, label: "50 to 89%" },
  { color: "#e4d8ff", weight: 5, opacity: 1, label: "90% or more" }
];
const CHOKE_COLOR = "#ff8a5c";
const STAG_COLOR = "#f5a524";
const MEASURED_COLOR = "#1baf7a";
const FLOODED_HALO = "rgba(236, 131, 90, 0.34)";
const FRAGMENT_COLOR = "#8a5a9e";
const REPORT_DEPTHS = [
  { key: "dry", cm: 0, label: "Dry", hint: "0 cm" },
  { key: "ankle", cm: 10, label: "Ankle", hint: "about 10 cm" },
  { key: "knee", cm: 45, label: "Knee", hint: "about 45 cm" },
  { key: "waist", cm: 90, label: "Waist", hint: "about 90 cm" }
];
const EXAMPLE_REPORTS = [{ node: 237, cm: 45 }, { node: 2, cm: 45 }, { node: 67, cm: 10 }];

function probBin(p) {
  return p >= 90 ? 3 : p >= 50 ? 2 : p >= 10 ? 1 : 0;
}

function hasPart(name) {
  return !!(window.JD_DATA && window.JD_DATA[name]);
}

function fmt2(x, digits) {
  return (x < 0 ? "−" : "") + Math.abs(x).toFixed(digits === undefined ? 2 : digits);
}

function rangeText(ci, digits) {
  return `${fmt2(ci[0], digits)} to ${fmt2(ci[1], digits)}`;
}

function kpiHtml(label, value, of) {
  return `<div class="kpi"><div class="label">${label}</div><div class="value">${value}</div><div class="of">${of}</div></div>`;
}

function sourceOf(url) {
  const W = window.JD_DATA.why;
  const s = W.sources.find(x => x.url === url);
  const name = s ? s.name : url.replace(/^https?:\/\//, "").split("/")[0];
  return { full: name, short: name.split(",")[0] };
}

function buildWhyPanel() {
  const W = window.JD_DATA.why;
  const tab = document.querySelector('.tab[data-panel="why"]');
  if (!W) {
    tab.hidden = true;
    return false;
  }
  const link = url => {
    const s = sourceOf(url);
    return `<a class="src" href="${esc(url)}" target="_blank" rel="noopener" title="${esc(s.full)}">${esc(s.short)}</a>`;
  };
  document.getElementById("why-events").innerHTML = W.events.map(e =>
    `<div class="event"><div class="ev-name">${esc(e.event)}</div><div class="ev-fact">${esc(e.fact)} ${link(e.source_url)}</div></div>`).join("");
  document.getElementById("why-causes").innerHTML = W.causes.map((c, i) =>
    `<li class="cause"><div class="c-head"><span class="c-num num">${i + 1}</span>${esc(c.cause)}</div>` +
    `<p class="c-fact">${esc(c.fact)} ${link(c.source_url)}</p>` +
    `<p class="c-answer"><b>JalDrishti:</b> ${esc(c.jaldrishti_answer)}</p></li>`).join("");
  document.getElementById("why-limits").innerHTML = W.limits.map(l => `<li>${esc(l)}</li>`).join("");
  document.getElementById("why-nlimits").textContent = W.limits.length;
  document.getElementById("why-note").textContent = `Sources checked ${W.checked}. ${W.note}`;
  return true;
}

let evLayer = null;
let evShown = { flooded: true, stagnation: true, depth: true };
let evSub = {};
let evEdge = {};

function evidencePeak() {
  const SC = window.JD_DATA.scenarios;
  const frames = SC.depth_cm["100|clean"];
  return frames[0].map((_, i) => Math.max(...frames.map(f => f[i])));
}

function buildEvidencePanel(ctx) {
  const E = window.JD_DATA.evidence;
  const SW = window.JD_DATA.swmm;
  const tab = document.querySelector('.tab[data-panel="evidence"]');
  if (!E) {
    tab.hidden = true;
    return false;
  }
  const H = E.headline, A = H.all_segments, T = H.test_half, C = E.calibration;
  const flooded = new Set(E.layers.flooded_2015_edge_ids);
  const near = new Set(E.layers.near_stagnation_edge_ids);
  const peak = evidencePeak();
  ctx.NET.edges.forEach(e => { evEdge[e.id] = { flooded: flooded.has(e.id), near: near.has(e.id), peak: peak[e.id] }; });
  document.getElementById("e-lede").innerHTML =
    `Does the model flood the streets that flooded in December 2015? It is scored against three public 2015 records on this site: ` +
    `roads reported flooded (${E.counts.flooded_2015} of ${E.counts.segments} segments lie within 30 m of one), ` +
    `${E.counts.stagnation_points} GCC water-stagnation points and ${E.counts.depth_points} measured depths.`;
  document.getElementById("e-verdict").innerHTML =
    `<b>Result: weak.</b> ${esc(E.summary[0])} Against the GCC stagnation points the model scores ${fmt2(H.stagnation_all_segments.model.value)}, below chance.`;
  document.getElementById("e-kpis").innerHTML =
    kpiHtml("Model AUC, all segments", fmt2(A.model.value), `95% range ${rangeText(A.model.ci95)}; 0.5 is chance`) +
    kpiHtml("DEM depression baseline", fmt2(A.baseline_dem_depression.value), `95% range ${rangeText(A.baseline_dem_depression.ci95)}`) +
    kpiHtml("Test half (south), default", fmt2(T.default.value), `range ${rangeText(T.default.ci95)}; ${T.default.negatives} unflooded segments`) +
    kpiHtml("Calibrated minus default", fmt2(T.calibrated_minus_default.value, 3), `test half AUC, range ${rangeText(T.calibrated_minus_default.ci95, 3)}`);
  const row = (name, m, base) => `<tr><td>${name}</td><td class="r num nw">${fmt2(m.value)}<div class="rng">${rangeText(m.ci95)}</div></td><td class="r num nw">${base}</td></tr>`;
  const b = (label, m) => `<div>${label} ${fmt2(m.value)}</div><div class="rng">${rangeText(m.ci95)}</div>`;
  document.getElementById("e-table").innerHTML =
    '<thead><tr><th>Pre-set metric</th><th class="r">Model</th><th class="r">Baseline</th></tr></thead><tbody>' +
    row(`AUC, roads reported flooded (${A.model.positives} vs ${A.model.negatives} segments)`, A.model, b("DEM", A.baseline_dem_depression) + b("low street", A.baseline_low_street)) +
    row(`AUC, test half only (${T.default.positives} vs ${T.default.negatives})`, T.default, b("DEM", T.baseline_dem_depression) + b("low street", T.baseline_low_street)) +
    row(`AUC, GCC stagnation points (${H.stagnation_all_segments.model.positives} vs ${H.stagnation_all_segments.model.negatives})`, H.stagnation_all_segments.model, b("DEM", H.stagnation_all_segments.baseline_dem_depression)) +
    row(`Spearman, measured depths (n = ${H.measured_depth_spearman_all.n})`, H.measured_depth_spearman_all, "none") +
    "</tbody>";
  document.getElementById("e-table-note").textContent =
    `${H.metric} Scored on a ${E.storm.total_mm} mm storm with the ${E.storm.shape_from} (${E.storm.hours_of_rain} h of rain, peak ${E.storm.peak_mm_h} mm/h). ${E.storm.note} ${H.range_note}`;
  const P = C.parameters;
  document.getElementById("e-calib").innerHTML =
    `<div class="callout ${C.adopted ? "info" : "twin"}"><b>${C.adopted ? "Calibrated parameters in use." : "Defaults kept."}</b> ${esc(C.verdict.replace(/^Defaults kept\.\s*/, ""))}</div>` +
    '<table class="data" style="margin-top:10px"><thead><tr><th>Site-wide multiplier</th><th class="r">Fitted (north half)</th><th class="r">Used</th></tr></thead><tbody>' +
    Object.values(P).map(p => `<tr><td>${esc(p.label)}</td><td class="r num">${p.fitted}</td><td class="r num">${p.used}</td></tr>`).join("") +
    `</tbody></table><p class="note">${esc(C.rule)}</p>`;
  if (SW) {
    const s = SW.summary;
    document.getElementById("e-swmm").innerHTML =
      '<div class="kpis">' +
      kpiHtml("Peak flow difference", `${s.median_abs_pct_diff_peak_flow}<small>%</small>`, `median, ${s.busiest_drains} busiest drains`) +
      kpiHtml("Rank agreement", s.spearman, `Spearman, same drains`) +
      kpiHtml("Outfall volume", `${s.outfall_volume_diff_pct_jaldrishti_vs_swmm > 0 ? "+" : "−"}${Math.abs(s.outfall_volume_diff_pct_jaldrishti_vs_swmm)}<small>%</small>`, "JalDrishti vs SWMM") +
      kpiHtml("SWMM routing continuity", `${s.swmm_flow_routing_continuity_error_pct}<small>%</small>`, `error; runoff ${s.swmm_runoff_continuity_error_pct}%`) +
      "</div>" +
      `<p class="note">${esc(SW.what)} ${esc(SW.swmm_engine)}, ${s.storm_mm} mm storm (peak ${SW.storm.peak_mm_h} mm/h), small enough that the only junctions over their pipe crown sit in closed pipe depressions; the ${SW.storm.drains_left_out} drains touching them are left out. JalDrishti's peaks are lower on most of the busiest drains; its junction pools count storage below drain floors, one main source of the difference along with runoff timing. Details: <code class="inline">${esc(SW.source)}</code>.</p>`;
  } else {
    document.getElementById("e-swmm").innerHTML = '<p class="note">No SWMM cross-check in this build.</p>';
  }
  document.getElementById("e-caveats").innerHTML = E.caveats.map(c => `<li>${esc(c)}</li>`).join("");
  document.getElementById("e-map-note").textContent =
    `The map shows modelled peak depth in the flood map's 100 mm synthetic storm (3 h, peak ${window.JD_DATA.scenarios.storms.find(s => s.mm === 100).peak_mm_h} mm/h, clean drains). ` +
    `The scores above come from the separate ERA5-shaped run, whose per-segment depths are not in the page data.`;

  const ll = e => e.coords.map(([lon, lat]) => [lat, lon]);
  evSub.flooded = L.polyline(ctx.NET.edges.filter(e => flooded.has(e.id)).map(ll), { renderer: ctx.under, color: FLOODED_HALO, weight: 13, opacity: 1, interactive: false, lineCap: "round" });
  evSub.stagnation = L.layerGroup(E.layers.stagnation_points.map(p =>
    L.marker([p.lat, p.lon], { pane: "pins", icon: L.divIcon({ className: "", html: '<div class="stag-mark"></div>', iconSize: [12, 12], iconAnchor: [6, 6] }) })
      .bindTooltip(`GCC 2015 water-stagnation point, near segment ${p.edge_ids.join(", ")}`, { className: "jd-tip short", direction: "top", offset: [0, -6] })));
  evSub.depth = L.layerGroup(E.layers.depth_points.map(p =>
    L.circleMarker([p.lat, p.lon], { pane: "pins", radius: 3 + 1.6 * Math.sqrt(p.depth_cm / 2.54), color: "#0b0e13", weight: 1.5, fillColor: MEASURED_COLOR, fillOpacity: 0.9 })
      .bindTooltip(`Measured 2015 depth <b>${p.depth_cm.toFixed(1)} cm</b>, snapped to junction ${p.node}`, { className: "jd-tip short", direction: "top", offset: [0, -6] })));
  evLayer = L.layerGroup();
  evLayer._map0 = ctx.map;
  document.querySelectorAll("#e-toggles button").forEach(btn => btn.addEventListener("click", () => {
    const k = btn.dataset.layer;
    evShown[k] = !evShown[k];
    syncEvidenceLayers();
  }));
  syncEvidenceLayers();
  return true;
}

function syncEvidenceLayers() {
  if (!evLayer) return;
  Object.keys(evSub).forEach(k => {
    const on = evShown[k];
    if (on && !evLayer.hasLayer(evSub[k])) evLayer.addLayer(evSub[k]);
    if (!on && evLayer.hasLayer(evSub[k])) evLayer.removeLayer(evSub[k]);
  });
  document.querySelectorAll("#e-toggles button").forEach(btn => btn.setAttribute("aria-pressed", String(evShown[btn.dataset.layer])));
}

function showEvidence(on) {
  if (!evLayer) return;
  const map = evLayer._map0;
  if (on && !map.hasLayer(evLayer)) evLayer.addTo(map);
  if (!on && map.hasLayer(evLayer)) map.removeLayer(evLayer);
}

function evidenceLegend(bins) {
  const E = window.JD_DATA.evidence;
  return '<div class="title">2015 records</div>' +
    `<div class="row"><span class="ln" style="background:${FLOODED_HALO};height:11px"></span>road reported flooded nearby (${E.counts.flooded_2015})</div>` +
    '<div class="row"><span class="stag-mark" style="margin:0 6px"></span>GCC stagnation point</div>' +
    `<div class="row"><span class="dot" style="background:${MEASURED_COLOR};border:1.5px solid #0b0e13"></span>measured depth, size by depth</div>` +
    '<div class="title" style="margin-top:10px">Model peak, 100 mm storm</div>' +
    bins.slice().reverse().map(b => `<div class="row"><span class="ln" style="background:${b.color};height:${Math.max(2, b.weight)}px"></span>${b.label.split(",")[0]}</div>`).join("");
}

function evidenceTipRows(e) {
  const x = evEdge[e.id];
  if (!x) return "";
  return `<div class="tt-row"><span>Model peak, 100 mm</span><b>${x.peak.toFixed(1)} cm</b></div>` +
    `<div class="tt-row"><span>Flooded road within 30 m (2015)</span><b>${x.flooded ? "yes" : "no report"}</b></div>` +
    `<div class="tt-row"><span>GCC stagnation point within 50 m</span><b>${x.near ? "yes" : "no"}</b></div>`;
}

const RP = { K: null, w: null, fc: null, layer: null, pins: null, choke: null, depth: "knee", streetOf: {} };

function buildReportPanel(ctx) {
  const R = window.JD_DATA.report;
  const tab = document.querySelector('.tab[data-panel="report"]');
  if (!R) {
    tab.hidden = true;
    return false;
  }
  RP.K = JDReport.denseDeltas(R.drains, R.base_cm.length);
  RP.outfall = new Set(R.outfall);
  ctx.NET.edges.forEach(e => {
    if (!RP.streetOf[e.u]) RP.streetOf[e.u] = e.street;
    if (!RP.streetOf[e.v]) RP.streetOf[e.v] = e.street;
  });
  RP.drainEdges = R.drains.map(d => ctx.NET.edges.filter(e => e.gcc_drain === d.gcc_drain).map(e => e.id));
  const acc = R.accuracy, rec = acc.recovery;
  document.getElementById("rp-depths").innerHTML = REPORT_DEPTHS.map(d => `<button data-v="${d.key}" title="${d.hint}">${d.label}<span class="hint"> ${d.cm} cm</span></button>`).join("");
  document.querySelectorAll("#rp-depths button").forEach(btn => btn.addEventListener("click", () => { RP.depth = btn.dataset.v; syncReportDepth(); }));
  syncReportDepth();
  document.getElementById("rp-example").addEventListener("click", () => { ctx.S.reports = EXAMPLE_REPORTS.map(r => ({ ...r })); ctx.onChange(); });
  document.getElementById("rp-undo").addEventListener("click", () => { ctx.S.reports.pop(); ctx.onChange(); });
  document.getElementById("rp-clear").addEventListener("click", () => { ctx.S.reports = []; ctx.onChange(); });
  document.getElementById("rp-setup").innerHTML =
    `Forecast: the twin test's ${R.storm.total_mm} mm synthetic storm (peak ${R.storm.peak_mm_h} mm/h at ${Math.round(R.storm.peak_at_s / 60)} min, not the flood map's ${R.storm.total_mm} mm storm), peak street depth, ${R.params.catch_mult === 1 && R.params.street_n_mult === 1 && R.params.inlet_mult === 1 ? "default parameters" : "calibrated parameters"}. ` +
    `For each of the ${R.drains.length} candidate drains, the model was run with that drain ${Math.round(R.silt_fraction * 100)}% silted. ` +
    `Your reports are matched by a bounded least-squares solve in the browser: one weight in [${R.solver.bounds.join(", ")}] per drain, with a small L1 penalty (${R.solver.penalty.l1}) and ridge (${R.solver.penalty.ridge}), ${R.solver.max_iter} FISTA steps. ` +
    `The updated forecast is the clean forecast plus each drain's effect times its weight.`;
  document.getElementById("rp-accuracy").innerHTML =
    `<b>Linear approximation.</b> The update adds single-drain effects together; the model itself is nonlinear. ` +
    `On ${acc.per_scenario.length} twin scenarios (${acc.junctions_compared} junction peaks at 5 cm or more), the sum was off by ${acc.superposition_mean_cm} cm on average and ${acc.superposition_max_cm} cm at worst. ` +
    `Ignoring the silt was off by ${acc.no_silt_mean_cm} cm on average and ${acc.no_silt_max_cm} cm at worst.`;
  document.getElementById("rp-recovery").innerHTML =
    `<b>Identical-twin test, not a field finding.</b> Silt was planted in the model and reports were exact model depths. ` +
    `In ${rec.solves} solves with ${rec.reports_per_solve} reports each, a truly silted drain filled ${Math.round(rec.topk_hit_rate * 1000) / 10}% of the top slots, against ${Math.round(rec.topk_hit_rate_random * 1000) / 10}% for a random ranking. ` +
    `The top-ranked drain was truly silted in ${Math.round(rec.top1_hit_rate * 100)}% of solves; no solve found every silted drain. Real reports would carry depth-guess error.`;
  document.getElementById("rp-notes").innerHTML = R.notes.map(n => `<li>${esc(n)}</li>`).join("");
  RP.layer = L.layerGroup();
  RP.cand = L.layerGroup().addTo(RP.layer);
  RP.choke = L.layerGroup().addTo(RP.layer);
  RP.pins = L.layerGroup().addTo(RP.layer);
  const ll = id => ctx.NET.edges[id].coords.map(([lon, lat]) => [lat, lon]);
  RP.drainEdges.forEach(ids => ids.forEach(id => {
    L.polyline(ll(id), { renderer: ctx.under, color: "#c9794f", weight: 9, opacity: 0.28, interactive: false, lineCap: "round" }).addTo(RP.cand);
  }));
  RP.ll = ll;
  RP.ctx = ctx;
  RP.layer._map0 = ctx.map;
  return true;
}

function syncReportDepth() {
  document.querySelectorAll("#rp-depths button").forEach(b => b.setAttribute("aria-pressed", String(b.dataset.v === RP.depth)));
}

function reportDepthCm() {
  return REPORT_DEPTHS.find(d => d.key === RP.depth).cm;
}

function reportClick(S, node) {
  if (RP.outfall.has(node)) return;
  const cm = reportDepthCm();
  const i = S.reports.findIndex(r => r.node === node);
  if (i >= 0 && S.reports[i].cm === cm) S.reports.splice(i, 1);
  else if (i >= 0) S.reports[i].cm = cm;
  else S.reports.push({ node, cm });
}

function reportEdgeDepths(net, fc) {
  return net.edges.map(e => Math.max(0, fc[e.u], fc[e.v]));
}

function computeReport(S) {
  const R = window.JD_DATA.report;
  RP.w = JDReport.solveReports(R, RP.K, S.reports);
  RP.fc = JDReport.forecast(R, RP.K, RP.w);
  RP.base = R.base_cm;
  return RP;
}

function renderReportPanel(S, net) {
  const R = window.JD_DATA.report;
  computeReport(S);
  const before = reportEdgeDepths(net, RP.base), after = reportEdgeDepths(net, RP.fc);
  RP.before = before;
  RP.after = after;
  const n15 = d => d.filter(x => x > 15).length;
  const strong = RP.w.filter(x => x > 0.5).length;
  document.getElementById("rp-kpis").innerHTML =
    kpiHtml("Reports", S.reports.length, "street junctions") +
    kpiHtml("Likely choked drains", strong, `weight over 50%, of ${R.drains.length} candidates`) +
    kpiHtml("Over 15 cm, clean drains", n15(before), "segments at peak") +
    kpiHtml("Over 15 cm, updated", n15(after), `segments at peak (${n15(after) - n15(before) >= 0 ? "+" : "−"}${Math.abs(n15(after) - n15(before))})`);
  document.getElementById("rp-list").innerHTML = S.reports.length
    ? S.reports.map((r, i) => {
      const d = REPORT_DEPTHS.find(x => x.cm === r.cm);
      return `<tr><td>${esc(RP.streetOf[r.node] || "junction")}<div class="note" style="margin:0">junction ${r.node}</div></td>` +
        `<td class="r num">${d ? d.label.toLowerCase() + ", " : ""}${r.cm} cm</td><td class="r num">${RP.base[r.node].toFixed(1)} cm</td><td class="r num">${Math.max(0, RP.fc[r.node]).toFixed(1)} cm</td>` +
        `<td class="r"><button class="x-btn" data-i="${i}" aria-label="Remove report">&times;</button></td></tr>`;
    }).join("")
    : "";
  document.getElementById("rp-table").hidden = !S.reports.length;
  document.getElementById("rp-hint").hidden = !!S.reports.length;
  document.querySelectorAll("#rp-list .x-btn").forEach(b => b.addEventListener("click", () => { S.reports.splice(+b.dataset.i, 1); RP.ctx.onChange(); }));
  const order = RP.w.map((w, j) => j).filter(j => RP.w[j] > 0.005).sort((a, b) => RP.w[b] - RP.w[a]);
  document.getElementById("rp-drains").innerHTML = order.length
    ? order.map(j => `<li data-j="${j}"><span class="rk num">${Math.round(RP.w[j] * 100)}%</span><span class="st">${esc(R.drains[j].street)}</span><span class="sc">drain ${R.drains[j].gcc_drain}</span>` +
      `<span class="bar"><span style="width:${(100 * RP.w[j]).toFixed(1)}%;background:${CHOKE_COLOR}"></span></span></li>`).join("")
    : `<li class="empty">${S.reports.length ? "No candidate drain explains these reports better than clean drains." : "Add reports to see which drains are likely choked."}</li>`;
  const hi = R.solver.bounds[1];
  const sat = S.reports.some(r => Math.max(0, RP.fc[r.node]) < r.cm - 5) && RP.w.some(x => x >= hi - 0.005);
  const satEl = document.getElementById("rp-sat");
  satEl.hidden = !sat;
  satEl.textContent = sat ? `The ${R.drains.length} candidate drains cannot reach this depth; weights at ${Math.round(hi * 100)}% mean the solve is saturated, not that each drain is choked.` : "";
  document.querySelectorAll("#rp-drains li[data-j]").forEach(li => li.addEventListener("click", () => RP.ctx.fitEdges(RP.drainEdges[+li.dataset.j])));
  RP.choke.clearLayers();
  order.forEach(j => RP.drainEdges[j].forEach(id => {
    const w = RP.w[j];
    L.polyline(RP.ll(id), { renderer: RP.ctx.over, color: "#12161d", weight: 4 + 7 * w, opacity: 0.9, interactive: false, lineCap: "round" }).addTo(RP.choke);
    L.polyline(RP.ll(id), { renderer: RP.ctx.over, color: CHOKE_COLOR, weight: 2 + 6 * w, opacity: 0.35 + 0.65 * w, interactive: false, lineCap: "round" }).addTo(RP.choke);
  }));
  RP.pins.clearLayers();
  S.reports.forEach(r => {
    const j = R.junctions[r.node];
    const d = REPORT_DEPTHS.find(x => x.cm === r.cm);
    L.marker([j.lat, j.lon], { pane: "pins", icon: L.divIcon({ className: "", html: `<div class="rep-pin${r.cm === 0 ? " dry" : ""}">${r.cm}</div>`, iconSize: [28, 28], iconAnchor: [14, 14] }) })
      .bindTooltip(`Report: ${d ? d.label.toLowerCase() + ", " : ""}${r.cm} cm at junction ${r.node}<br>Model before ${RP.base[r.node].toFixed(1)} cm, after ${Math.max(0, RP.fc[r.node]).toFixed(1)} cm<br><span class="tt-sub">Click to remove</span>`, { className: "jd-tip short", direction: "top", offset: [0, -12] })
      .on("click", () => { const i = S.reports.indexOf(r); if (i >= 0) S.reports.splice(i, 1); RP.ctx.onChange(); })
      .addTo(RP.pins);
  });
  return after;
}

function showReport(on) {
  if (!RP.layer) return;
  const map = RP.layer._map0;
  if (on && !map.hasLayer(RP.layer)) RP.layer.addTo(map);
  if (!on && map.hasLayer(RP.layer)) map.removeLayer(RP.layer);
}

function reportLegend(bins) {
  return '<div class="title">Peak depth, updated forecast</div>' +
    bins.slice().reverse().map(b => `<div class="row"><span class="ln" style="background:${b.color};height:${Math.max(2, b.weight)}px"></span>${b.label.split(",")[0]}</div>`).join("") +
    '<div class="title" style="margin-top:10px">Drains</div>' +
    `<div class="row"><span class="ln" style="background:${CHOKE_COLOR};height:6px"></span>likely choked, width by weight</div>` +
    '<div class="row"><span class="ln" style="background:rgba(201,121,79,0.4);height:9px"></span>candidate drain</div>' +
    '<div class="row"><span class="rep-pin" style="width:20px;height:20px;font-size:9px;line-height:16px;margin:0 2px">45</span>your report, cm</div>';
}

function reportTipRows(e) {
  if (!RP.after) return "";
  return `<div class="tt-row"><span>Peak, clean drains</span><b>${RP.before[e.id].toFixed(1)} cm</b></div>` +
    `<div class="tt-row"><span>Peak, updated</span><b>${RP.after[e.id].toFixed(1)} cm</b></div>`;
}

const CITY = { layer: null, bounds: null, mids: null };

function cityBin(cm, binOf) {
  return binOf(cm);
}

function buildCityPanel(ctx) {
  const C = window.JD_DATA.city;
  const tab = document.querySelector('.tab[data-panel="city"]');
  if (!C) {
    tab.hidden = true;
    return false;
  }
  const cv = C.coverage, rs = C.results, ms = C.missing, tm = C.timing;
  const f = C.edge_fields, ix = k => f.indexOf(k);
  const i0 = ix("lon0"), i1 = ix("lat0"), i2 = ix("lon1"), i3 = ix("lat1"), ip = ix("peak_cm"), ic = ix("component");
  const nf = n => n.toLocaleString("en-IN");
  document.getElementById("c-lede").innerHTML =
    `Every piece of the GCC drain network with at least 20 junctions, run together in one batch on the ${C.storm_mm} mm synthetic storm (peak ${C.peak_mm_h} mm/h, clean drains): ` +
    `<b class="num">${nf(cv.components_run)}</b> of ${nf(cv.components_total)} pieces, <b class="num">${nf(cv.junctions_run)}</b> junctions and <b class="num">${nf(cv.segments_run)}</b> street segments.`;
  document.getElementById("c-kpis").innerHTML =
    kpiHtml("Surveyed drains modelled", `${Math.round(cv.modelled_share_of_survey * 1000) / 10}<small>%</small>`, `${fmtNum(cv.modelled_km, 1)} of ${fmtNum(cv.survey_km, 1)} km`) +
    kpiHtml("Run time, 3 h storm", `${tm.run_wall_s.toFixed(1)}<small>s</small>`, `wall clock on CPU, ${tm.run_cpu_s.toFixed(1)} s CPU`) +
    kpiHtml("Over 15 cm at peak", nf(rs.segments_over_15cm), `of ${nf(cv.segments_run)} segments`) +
    kpiHtml("Over 1 m at peak", nf(rs.segments_over_100cm), "30 m DEM pooling artifacts");
  const fb = rs.fallback_components;
  document.getElementById("c-notes").innerHTML =
    `<li>${esc(ms.note.split(" Zones below")[0])}</li>` +
    `<li>Outfalls are junctions within 60 m of an OpenStreetMap canal, river, drain or stream. ${cv.components_fallback_outfall} of ${cv.components_run} pieces have none, so their lowest dead end is used instead. Those pieces flood more: ${Math.round(fb.share_over_15cm * 1000) / 10}% of their segments pass 15 cm, against ${Math.round(fb.share_over_15cm_waterway_outfall_components * 1000) / 10}% elsewhere.</li>` +
    `<li>Median peak on wet segments ${rs.median_peak_cm_wet} cm; deepest ${rs.max_peak_cm} cm.</li>`;
  document.getElementById("c-caveats").innerHTML = C.caveats.map(c => `<li>${esc(c)}</li>`).join("");
  const pane = ctx.map.createPane("city");
  pane.style.zIndex = 412;
  pane.style.pointerEvents = "none";
  const rend = L.canvas({ pane: "city", padding: 0.3 });
  const byBin = ctx.bins.map(() => []);
  const mids = [];
  let s = 90, n = -90, w = 180, e = -180;
  C.edges.forEach(r => {
    byBin[cityBin(r[ip], ctx.binOf)].push([[r[i1], r[i0]], [r[i3], r[i2]]]);
    mids.push([(r[i1] + r[i3]) / 2, (r[i0] + r[i2]) / 2, r[ip], r[ic]]);
    s = Math.min(s, r[i1], r[i3]); n = Math.max(n, r[i1], r[i3]); w = Math.min(w, r[i0], r[i2]); e = Math.max(e, r[i0], r[i2]);
  });
  const ff = C.fragment_fields, j0 = ff.indexOf("lon0"), j1 = ff.indexOf("lat0"), j2 = ff.indexOf("lon1"), j3 = ff.indexOf("lat1");
  CITY.layer = L.layerGroup();
  L.polyline(C.fragments.map(r => [[r[j1], r[j0]], [r[j3], r[j2]]]), { renderer: rend, color: FRAGMENT_COLOR, weight: 1.4, opacity: 0.85, interactive: false, dashArray: "3 3" }).addTo(CITY.layer);
  byBin.forEach((lines, b) => {
    if (!lines.length) return;
    const st = ctx.bins[b];
    L.polyline(lines, { renderer: rend, color: st.color, weight: 1 + 0.5 * b, opacity: st.opacity, interactive: false, lineCap: "round" }).addTo(CITY.layer);
  });
  const of = C.outfall_fields, o0 = of.indexOf("lon"), o1 = of.indexOf("lat"), o2 = of.indexOf("fallback");
  C.outfalls.forEach(o => {
    L.circleMarker([o[o1], o[o0]], { renderer: rend, radius: 2.4, color: o[o2] ? "#f5a524" : "#1baf7a", weight: 1, fillOpacity: 0.9, fillColor: o[o2] ? "#f5a524" : "#1baf7a", interactive: false }).addTo(CITY.layer);
  });
  CITY.bounds = L.latLngBounds([[s, w], [n, e]]);
  CITY.mids = mids;
  CITY.tip = L.tooltip({ className: "jd-tip short", direction: "top", offset: [0, -6] });
  CITY.layer._map0 = ctx.map;
  return true;
}

function cityClick(latlng) {
  if (!CITY.mids) return;
  const k = Math.cos(latlng.lat * Math.PI / 180);
  let best = -1, bd = Infinity;
  CITY.mids.forEach((m, i) => {
    const dx = (m[1] - latlng.lng) * k, dy = m[0] - latlng.lat, d = dx * dx + dy * dy;
    if (d < bd) { bd = d; best = i; }
  });
  const map = CITY.layer._map0;
  const m = CITY.mids[best];
  const px = map.latLngToContainerPoint(latlng).distanceTo(map.latLngToContainerPoint([m[0], m[1]]));
  if (px > 40) { map.closeTooltip(CITY.tip); return; }
  CITY.tip.setLatLng([m[0], m[1]]).setContent(`<b>${m[2].toFixed(1)} cm</b> peak depth<div class="tt-sub">Network piece ${m[3]}, ${window.JD_DATA.city.storm_mm} mm synthetic storm</div>`);
  map.openTooltip(CITY.tip);
}

function showCity(on) {
  if (!CITY.layer) return;
  const map = CITY.layer._map0;
  if (on && !map.hasLayer(CITY.layer)) CITY.layer.addTo(map);
  if (!on && map.hasLayer(CITY.layer)) { map.removeLayer(CITY.layer); map.closeTooltip(CITY.tip); }
}

function cityLegend(bins) {
  return '<div class="title">Peak depth, whole city</div>' +
    bins.map((b, i) => `<div class="row"><span class="ln" style="background:${b.color};height:${Math.max(2, 1 + 0.5 * i)}px"></span>${b.label.split(",")[0]}</div>`).reverse().join("") +
    `<div class="row"><span class="ln" style="height:0;border-top:2px dashed ${FRAGMENT_COLOR}"></span>not modelled (small piece)</div>` +
    '<div class="row"><span class="dot" style="background:#1baf7a;width:7px;height:7px"></span>outfall at a waterway</div>' +
    '<div class="row"><span class="dot" style="background:#f5a524;width:7px;height:7px"></span>outfall guessed (lowest dead end)</div>';
}

function chanceLegend(thr) {
  return `<div class="title">Chance of water over ${thr} cm</div>` +
    PROB_BINS.slice().reverse().map(b => `<div class="row"><span class="ln" style="background:${b.color};height:${Math.max(2, b.weight)}px"></span>${b.label}</div>`).join("") +
    `<div class="row" style="max-width:220px"><span style="font-size:11px;color:var(--muted)">Share of ${window.JD_DATA.ensemble.members} storm members, clean drains</span></div>`;
}
