const PRIO_COLOR = "#eb6834";
const SILT_STYLE = [
  { color: "#ffab80", weight: 7 },
  { color: "#e8703d", weight: 5 },
  { color: "#9c5a3c", weight: 3.5 }
];
const GAUGE_COLOR = "#1baf7a";
const METHOD_NAME = { extrapolation: "LK extrapolation", sprog: "S-PROG", steps_mean: "STEPS mean", persistence: "Persistence" };

function esc(s) {
  return String(s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

function fmtNum(x, digits) {
  return x.toLocaleString("en-IN", { minimumFractionDigits: digits, maximumFractionDigits: digits });
}

function niceMax(v, step) {
  return Math.max(step, Math.ceil(v / step) * step);
}

let chartScale = null;
function chartMaxima() {
  if (!chartScale) {
    const D0 = window.JD_DATA.scenarios;
    const rain = Math.max(...D0.storms.flatMap(s => s.rain_mm_h_10min));
    const c15 = Math.max(...Object.values(D0.depth_cm).flatMap(frames => frames.map(fr => fr.filter(d => d > 15).length)));
    chartScale = { rain: niceMax(rain, 20), count: niceMax(c15, 100) };
  }
  return chartScale;
}

function drawChart(box, o) {
  const W = 380, L0 = 34, R0 = 78, top = 16, rainH = 44, gap = 26, cntH = 96;
  const cntTop = top + rainH + gap, base = cntTop + cntH, H = base + 22;
  const mx = chartMaxima();
  const last = o.minutes[o.minutes.length - 1];
  const x = m => L0 + (m / last) * (W - L0 - R0);
  const yr = v => top + rainH - (v / mx.rain) * rainH;
  const yc = v => base - (v / mx.count) * cntH;
  const step = x(o.minutes[1]) - x(o.minutes[0]);
  let svg = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Rain rate and flooded segments over the storm">`;
  svg += `<text class="axis" x="${L0 - 6}" y="${top + 3}" text-anchor="end">${mx.rain}</text>`;
  svg += `<text class="axis" x="${L0 - 6}" y="${top + rainH + 3}" text-anchor="end">0</text>`;
  svg += `<text class="lab" x="${W - R0 + 8}" y="${top + 10}">rain</text><text class="axis" x="${W - R0 + 8}" y="${top + 23}">mm/h</text>`;
  svg += `<line class="grid" x1="${L0}" x2="${W - R0}" y1="${top + rainH}" y2="${top + rainH}"/>`;
  o.rain.forEach((v, i) => {
    if (i === 0 || v <= 0) return;
    const x1 = x(o.minutes[i - 1]) + 1, w = Math.max(1, step - 2), y = yr(v);
    svg += `<rect x="${x1.toFixed(1)}" y="${y.toFixed(1)}" width="${w.toFixed(1)}" height="${(top + rainH - y).toFixed(1)}" rx="1.5" fill="${i === o.frame ? "#8d99aa" : "#4d5766"}"/>`;
  });
  [0, mx.count / 2, mx.count].forEach(v => {
    svg += `<line class="grid" x1="${L0}" x2="${W - R0}" y1="${yc(v)}" y2="${yc(v)}"/>`;
    svg += `<text class="axis" x="${L0 - 6}" y="${yc(v) + 3}" text-anchor="end">${v}</text>`;
  });
  const path = arr => arr.map((v, i) => `${i ? "L" : "M"}${x(o.minutes[i]).toFixed(1)},${yc(v).toFixed(1)}`).join("");
  svg += `<path d="${path(o.c15)}" fill="none" stroke="#3987e5" stroke-width="2" stroke-linejoin="round"/>`;
  svg += `<path d="${path(o.c30)}" fill="none" stroke="#86b6ef" stroke-width="2" stroke-linejoin="round"/>`;
  let y15 = yc(o.c15[o.c15.length - 1]), y30 = yc(o.c30[o.c30.length - 1]);
  if (y30 - y15 < 13) y30 = y15 + 13;
  svg += `<text class="lab" x="${W - R0 + 8}" y="${y15 + 4}">over 15 cm</text>`;
  svg += `<text class="lab" x="${W - R0 + 8}" y="${y30 + 4}">30 cm or more</text>`;
  [0, 30, 60, 90, 120, 150, 180].filter(m => m <= last).forEach(m => {
    svg += `<text class="axis" x="${x(m)}" y="${base + 15}" text-anchor="middle">${m}</text>`;
  });
  const cx = x(o.minutes[o.frame]);
  svg += `<line class="cursor" x1="${cx}" x2="${cx}" y1="${top - 4}" y2="${base}"/>`;
  svg += `<circle cx="${cx}" cy="${yc(o.c15[o.frame])}" r="4" fill="#3987e5" stroke="#12161d" stroke-width="2"/>`;
  svg += `<circle cx="${cx}" cy="${yc(o.c30[o.frame])}" r="4" fill="#86b6ef" stroke="#12161d" stroke-width="2"/>`;
  svg += `<rect class="hit" x="${L0 - step / 2}" y="0" width="${W - L0 - R0 + step}" height="${base}" fill="transparent" style="cursor:pointer"/>`;
  svg += "</svg>";
  const old = box.querySelector("svg");
  if (old) old.remove();
  box.insertAdjacentHTML("beforeend", svg);
  const el = box.querySelector("svg");
  const tip = box.querySelector(".chart-tip");
  const pick = ev => {
    const r = el.getBoundingClientRect();
    const px = (ev.clientX - r.left) * (W / r.width);
    const m = ((px - L0) / (W - L0 - R0)) * last;
    let i = 0;
    o.minutes.forEach((mm, k) => { if (Math.abs(mm - m) < Math.abs(o.minutes[i] - m)) i = k; });
    return i;
  };
  const show = i => {
    tip.textContent = `T+${o.minutes[i]} min  rain ${o.rain[i].toFixed(1)} mm/h  ${o.c15[i]} over 15 cm  ${o.c30[i]} at 30 cm or more`;
  };
  show(o.frame);
  el.querySelector(".hit").addEventListener("mousemove", ev => show(pick(ev)));
  el.querySelector(".hit").addEventListener("mouseleave", () => show(o.frame));
  el.querySelector(".hit").addEventListener("click", ev => o.onPick(pick(ev)));
}

let prioLayer = null;
let prioRank = {};

function buildPriorityPanel(map, renderer, fitEdges) {
  const P = window.JD_DATA.priority;
  const net = window.JD_DATA.network;
  const top = P.drains.slice(0, 20);
  const maxScore = top[0].score_m3h;
  P.drains.forEach((d, i) => { prioRank[d.gcc_drain] = { rank: i + 1, score: d.score_m3h }; });
  document.getElementById("p-adj").innerHTML = `${P.adjoint_seconds}<small>s</small>`;
  document.getElementById("p-bf").innerHTML = `${P.brute_force_seconds}<small>s</small>`;
  document.getElementById("p-bf-of").textContent = `${P.brute_force_runs} model runs`;
  document.getElementById("p-sp").textContent = P.spearman;
  document.getElementById("p-ov").innerHTML = `${P.top20_overlap}<small>of 20</small>`;
  document.getElementById("p-list").innerHTML = top.map((d, i) =>
    `<li data-i="${i}"><span class="rk">${i + 1}</span><span class="st">${esc(d.street)}</span><span class="sc">${fmtNum(d.score_m3h, 0)}</span>` +
    `<span class="bar"><span style="width:${(100 * d.score_m3h / maxScore).toFixed(1)}%"></span></span>` +
    `<span class="id">drain ${d.gcc_drain} &middot; GCC OBJECTID ${d.survey_objectid} &middot; ${d.edge_ids.length} segment${d.edge_ids.length > 1 ? "s" : ""} &middot; survey: ${esc(d.status)}</span>` +
    `<span class="id">brute-force sum ${fmtNum(d.brute_sum_m3h, 0)} (rank ${d.brute_sum_rank})</span></li>`).join("");
  const DC = P.drain_check;
  document.getElementById("p-summary").innerHTML =
    `Score in m&sup3;&middot;h of street water above 15 cm. ${P.n_drains_positive} of ${P.n_drains_total} drains add flood volume in this estimate. ` +
    `Brute-force sum: the single-segment brute-force effects added up over the drain's segments, with its rank among all ${DC.drains} drains; no run silted a whole drain. ` +
    `Per drain, the two agree with Spearman ${DC.spearman} and ${DC.top20_overlap} of the top 20 in common. ` +
    `Baseline: ${fmtNum(P.baseline_flood_volume_m3h, 1)} m&sup3;&middot;h in the ${P.storm_mm} mm storm (peak ${P.peak_mm_h} mm/h, synthetic and uniform).`;
  document.getElementById("p-method").innerHTML = `<b>Method.</b> ${esc(P.method)} The ${P.brute_force_runs} brute-force runs each silted one segment and re-ran the model.`;
  prioLayer = L.layerGroup();
  top.slice().reverse().forEach(d => {
    const w = 3 + 5 * Math.sqrt(d.score_m3h / maxScore);
    d.edge_ids.forEach(id => {
      const ll = net.edges[id].coords.map(([lon, lat]) => [lat, lon]);
      L.polyline(ll, { renderer, color: "#12161d", weight: w + 4, opacity: 0.9, interactive: false, lineCap: "round" }).addTo(prioLayer);
      L.polyline(ll, { renderer, color: PRIO_COLOR, weight: w, opacity: 1, interactive: false, lineCap: "round" }).addTo(prioLayer);
    });
  });
  top.forEach((d, i) => {
    const mid = d.edge_ids.map(id => net.edges[id]).sort((a, b) => b.length_m - a.length_m)[0];
    const [a, b] = mid.coords;
    const badge = L.marker([(a[1] + b[1]) / 2, (a[0] + b[0]) / 2], {
      pane: "pins", zIndexOffset: 1000 - i,
      icon: L.divIcon({ className: "", html: `<div class="rank-badge">${i + 1}</div>`, iconSize: [22, 22], iconAnchor: [11, 11] })
    });
    badge.bindTooltip(`<div class="tt-street">#${i + 1} ${esc(d.street)}</div><div class="tt-row"><span>Flood volume added</span><b>${fmtNum(d.score_m3h, 1)} m&sup3;&middot;h</b></div><div class="tt-row"><span>Brute-force sum</span><b>${fmtNum(d.brute_sum_m3h, 1)} m&sup3;&middot;h</b></div><div class="tt-row"><span>GCC OBJECTID</span><b>${d.survey_objectid}</b></div>`, { className: "jd-tip", direction: "top", offset: [0, -10] });
    badge.on("click", () => fitEdges(d.edge_ids));
    badge.addTo(prioLayer);
  });
  document.querySelectorAll("#p-list li").forEach(li => li.addEventListener("click", () => fitEdges(top[+li.dataset.i].edge_ids)));
  prioLayer._map0 = map;
}

function showPriority(on) {
  const map = prioLayer._map0;
  if (on && !map.hasLayer(prioLayer)) prioLayer.addTo(map);
  if (!on && map.hasLayer(prioLayer)) map.removeLayer(prioLayer);
}

function priorityLegend() {
  return '<div class="title">Desilting priority</div>' +
    `<div class="row"><span class="ln" style="background:${PRIO_COLOR};height:6px"></span>top 20 drains, width by score</div>` +
    '<div class="row"><span class="rank-badge" style="width:18px;height:18px;line-height:18px;font-size:10px;margin:0 3px">1</span>rank</div>' +
    '<div class="row"><span class="ln" style="background:#5f6a7b;height:2px"></span>other drain segments</div>';
}

let twinLayer = null;
let twinByDrain = {};

function siltClass(s) {
  const thr = window.JD_DATA.twin.flag_threshold;
  return SILT_STYLE[s > thr ? 0 : s >= 0.1 ? 1 : 2];
}

function siltLabels() {
  const pct = Math.round(window.JD_DATA.twin.flag_threshold * 100);
  return [`over ${pct}%, flagged`, `10 to ${pct}%`, "under 10%"];
}

function buildTwinPanel(map, renderer, fitEdges) {
  const T = window.JD_DATA.twin;
  const net = window.JD_DATA.network;
  const truth = new Set(T.silted_truth.map(d => d.gcc_drain));
  T.candidates.forEach(c => { twinByDrain[c.gcc_drain] = c; });
  document.getElementById("w-hits").innerHTML = `${T.run.topk_hits}<small>of ${T.run.top_k}</small>`;
  document.getElementById("w-hits-of").textContent = `planted drains among the ${T.run.top_k} highest estimates`;
  document.getElementById("w-flag-label").textContent = `Flagged, silt over ${Math.round(T.flag_threshold * 100)}%`;
  document.getElementById("w-flag").textContent = T.run.flagged.length;
  document.getElementById("w-flag-of").textContent = `${T.run.flagged_correct} correct, ${T.run.flagged_wrong} wrong`;
  document.getElementById("w-before").innerHTML = `${T.run.flooded_error_cm_before}<small>cm</small>`;
  document.getElementById("w-after").innerHTML = `${T.run.flooded_error_cm_after}<small>cm</small>`;
  document.getElementById("w-after-of").textContent = `at ${T.run.flooded_junctions_unobserved} flooded junctions with no gauge`;
  document.getElementById("w-setup").innerHTML =
    `Truth: ${T.silted_truth.length} drains silted to ${Math.round(T.silt_true * 100)}% of their depth. ` +
    `${T.n_obs} simulated gauges read street depth every 10 minutes for 3 hours with ${T.noise_cm} cm noise in a ${T.calib_storm.total_mm} mm storm (peak ${T.calib_storm.peak_mm_h} mm/h). ` +
    `Error is the mean absolute peak-depth error in a different ${T.test_storm.total_mm} mm storm (peak ${T.test_storm.peak_mm_h} mm/h). Run: <code class="inline">${esc(T.source)}</code>.`;
  document.getElementById("w-table").innerHTML =
    '<thead><tr><th>Drain</th><th class="r">Est. silt</th><th>Planted</th></tr></thead><tbody>' +
    T.candidates.map((c, i) => {
      const planted = c.silted_truth ? '<span class="pill yes">planted</span>' : '<span class="pill">no</span>';
      const flag = c.flagged ? (c.silted_truth ? ' <span class="pill hit">flagged, correct</span>' : ' <span class="pill miss">flagged, wrong</span>') : (c.silted_truth ? ' <span class="pill miss">missed</span>' : "");
      return `<tr class="clickable" data-i="${i}"><td>${esc(c.street)}<div class="note" style="margin:0">drain ${c.gcc_drain} &middot; OBJECTID ${c.survey_objectid}</div></td>` +
        `<td class="r num">${(c.silt_post * 100).toFixed(1)}%</td><td>${planted}${flag}</td></tr>`;
    }).join("") + "</tbody>";
  document.querySelectorAll("#w-table tr.clickable").forEach(tr => tr.addEventListener("click", () => fitEdges(T.candidates[+tr.dataset.i].edge_ids)));
  document.getElementById("w-summary").innerHTML =
    '<thead><tr><th>Gauges</th><th class="r">Runs</th><th class="r">In top 4</th><th class="r">Chance</th><th class="r">Flagged</th><th class="r">Error before, after</th></tr></thead><tbody>' +
    T.summary.map(s => `<tr><td class="num">${s.n_obs}</td><td class="r num">${s.runs}</td><td class="r num">${s.topk_hits} of ${s.silted}</td>` +
      `<td class="r num">${s.topk_hits_by_chance}</td><td class="r num">${s.flagged} (${s.flagged_correct} correct)</td>` +
      `<td class="r num">${s.flooded_error_cm_before} &rarr; ${s.flooded_error_cm_after} cm</td></tr>`).join("") + "</tbody>";
  document.getElementById("w-summary-note").textContent =
    `Each row sums ${T.summary[0].runs} runs (seeds ${T.summary[0].seeds.join(", ")}), each with ${T.summary[0].top_k} planted drains among ${T.summary[0].candidates} candidates. "Chance" is the expected top-4 hits by random picking. ${T.summary_note}`;
  document.getElementById("w-caveats").innerHTML = T.caveats.map(c => `<li>${esc(c)}</li>`).join("");
  twinLayer = L.layerGroup();
  const lines = id => net.edges[id].coords.map(([lon, lat]) => [lat, lon]);
  T.candidates.filter(c => truth.has(c.gcc_drain)).forEach(c => c.edge_ids.forEach(id => {
    L.polyline(lines(id), { renderer, color: "#f4f6f9", weight: 20, opacity: 0.3, interactive: false, lineCap: "round" }).addTo(twinLayer);
  }));
  T.candidates.filter(c => truth.has(c.gcc_drain)).forEach(c => {
    const e = c.edge_ids.map(id => net.edges[id]).sort((a, b) => b.length_m - a.length_m)[0];
    const [a, b] = e.coords;
    const verdict = c.flagged ? "found" : "missed";
    L.marker([(a[1] + b[1]) / 2, (a[0] + b[0]) / 2], { pane: "pins", opacity: 0, interactive: false, icon: L.divIcon({ className: "", iconSize: [1, 1] }) })
      .bindTooltip(`<b>Planted:</b> ${esc(c.street)}<br><span class="${verdict}">estimated ${(c.silt_post * 100).toFixed(1)}%, ${verdict}</span>`, { permanent: true, direction: "auto", offset: [14, 0], className: "map-label twin-label" })
      .addTo(twinLayer);
  });
  T.candidates.slice().reverse().forEach(c => {
    const k = siltClass(c.silt_post);
    c.edge_ids.forEach(id => {
      L.polyline(lines(id), { renderer, color: "#12161d", weight: k.weight + 3, opacity: 0.9, interactive: false, lineCap: "round" }).addTo(twinLayer);
      L.polyline(lines(id), { renderer, color: k.color, weight: k.weight, opacity: 1, interactive: false, lineCap: "round" }).addTo(twinLayer);
    });
  });
  T.gauges.forEach(g => {
    L.circleMarker([g.lat, g.lon], { pane: "pins", radius: 5.5, color: "#0b0e13", weight: 2, fillColor: GAUGE_COLOR, fillOpacity: 1 })
      .bindTooltip(`Simulated street gauge at junction ${g.node}`, { className: "jd-tip short", direction: "top", offset: [0, -6] })
      .addTo(twinLayer);
  });
  twinLayer._map0 = map;
}

function showTwin(on) {
  const map = twinLayer._map0;
  if (on && !map.hasLayer(twinLayer)) twinLayer.addTo(map);
  if (!on && map.hasLayer(twinLayer)) map.removeLayer(twinLayer);
}

function twinLegend() {
  const T = window.JD_DATA.twin;
  return '<div class="title">Twin test</div>' +
    `<div class="row"><span class="dot" style="background:${GAUGE_COLOR};border:2px solid #0b0e13"></span>simulated gauge (${T.gauges.length})</div>` +
    '<div class="row"><span class="ln" style="background:rgba(244,246,249,0.35);height:12px"></span>silt planted (truth)</div>' +
    '<div class="title" style="margin-top:10px">Estimated silt, candidates</div>' +
    SILT_STYLE.map((c, i) => `<div class="row"><span class="ln" style="background:${c.color};height:${c.weight}px"></span>${siltLabels()[i]}</div>`).join("") +
    '<div class="row"><span class="ln" style="background:#5f6a7b;height:2px"></span>not a candidate</div>';
}

function panelTipRows(panel, e) {
  if (panel === "priority" && prioRank[e.gcc_drain]) {
    const p = prioRank[e.gcc_drain];
    return `<div class="tt-row"><span>Desilting rank</span><b>${p.rank} of ${window.JD_DATA.priority.n_drains_positive}</b></div>` +
      `<div class="tt-row"><span>Flood volume added</span><b>${fmtNum(p.score, 1)} m&sup3;&middot;h</b></div>`;
  }
  if (panel === "twin" && twinByDrain[e.gcc_drain]) {
    const c = twinByDrain[e.gcc_drain];
    return `<div class="tt-row"><span>Estimated silt</span><b>${(c.silt_post * 100).toFixed(1)}%</b></div>` +
      `<div class="tt-row"><span>Silt planted</span><b>${c.silted_truth ? "yes (twin truth)" : "no"}</b></div>`;
  }
  return "";
}
