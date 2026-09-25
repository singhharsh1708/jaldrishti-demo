const D = window.JD_DATA;
const NET = D.network;
const SC = D.scenarios;
const ADJ = JDRoute.buildGraph(NET);
const PANELS = ["why", "flood", "route", "priority", "twin", "report", "evidence", "city", "radar"];
const VIEWS = ["depth", "p15", "p30"];
const EN = D.ensemble;
const DOCKED = ["flood", "route"];
const STATE_LABEL = { clean: "Clean", silted: "Silted (twin)", inferred: "Inferred" };
const STATE_LONG = { clean: "clean drains", silted: "silted drains, twin truth", inferred: "drains inferred from gauges" };
const EXAMPLE_TRIP = { from: 272, to: 346 };
const DIM = { color: "#5f6a7b", weight: 1.8, opacity: 0.95 };
const BINS = [
  { color: "#6e798b", weight: 1.8, opacity: 0.95, label: "5 cm or less" },
  { color: "#256abf", weight: 2.8, opacity: 1, label: "5 to 15 cm" },
  { color: "#3987e5", weight: 3.8, opacity: 1, label: `15 to 30 cm, speed ${Math.round(JDRoute.speedKmh(15))} to ${Math.round(JDRoute.speedKmh(29.9))} km/h` },
  { color: "#86b6ef", weight: 4.8, opacity: 1, label: "30 to 50 cm, closed" },
  { color: "#cde2fb", weight: 5.8, opacity: 1, label: "50 cm or more, closed" }
];
const SHORT_COLOR = "#f5a524";
const SAFE_COLOR = "#22c55e";
const ESRI = "https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/";
const TILE_ATTR = "Tiles: Esri, HERE, Garmin, OpenStreetMap contributors";

const S = { frame: 0, storm: 60, state: "clean", view: "depth", panel: "flood", from: null, to: null, playing: null, hovered: null, route: null, reports: [] };

function binOf(d) {
  return d >= 50 ? 4 : d >= 30 ? 3 : d > 15 ? 2 : d > 5 ? 1 : 0;
}

function scenarioKey(storm, state) {
  return `${storm}|${state}`;
}

function depthsAt(storm, state, frame) {
  return SC.depth_cm[scenarioKey(storm, state)][frame];
}

function depths() {
  return depthsAt(S.storm, S.state, S.frame);
}

function chanceOn() {
  return S.view !== "depth" && !!EN && S.state === "clean";
}

function viewThr() {
  return S.view === "p30" ? 30 : 15;
}

function probAt(storm, thr, frame) {
  const key = `${storm}|${thr}`;
  return EN && EN.prob_pct[key] ? EN.prob_pct[key][frame] : null;
}

function parseReports(v) {
  if (!v) return [];
  const out = [];
  v.split(/[,_]/).forEach(pair => {
    const [n, cm] = pair.split(/[:-]/);
    const node = validNode(n);
    if (node !== null && !isNaN(+cm) && cm !== "" && !out.some(r => r.node === node)) out.push({ node, cm: Math.max(0, Math.min(200, Math.round(+cm))) });
  });
  return out;
}

function stormInfo(mm) {
  return SC.storms.find(s => s.mm === mm);
}

function nearestFrame(minute) {
  let best = 0;
  SC.minutes.forEach((m, i) => { if (Math.abs(m - minute) < Math.abs(SC.minutes[best] - minute)) best = i; });
  return best;
}

const countCache = {};
function counts(storm, state) {
  const key = scenarioKey(storm, state);
  if (!countCache[key]) {
    countCache[key] = SC.depth_cm[key].map(fr => ({
      over15: fr.filter(d => d > 15).length,
      over30: fr.filter(d => JDRoute.isClosed(d)).length
    }));
  }
  return countCache[key];
}

function peakFrame(storm, state) {
  const c = counts(storm, state);
  let best = 0;
  c.forEach((x, i) => { if (x.over15 > c[best].over15) best = i; });
  return best;
}

function validNode(v) {
  if (v === null || v === "" || isNaN(+v)) return null;
  const n = Math.round(+v);
  return n >= 0 && n < NET.nodes.length ? n : null;
}

function readParams() {
  const p = new URLSearchParams(location.search);
  const storms = SC.storms.map(s => s.mm);
  S.storm = storms.includes(+p.get("storm")) ? +p.get("storm") : 60;
  S.state = SC.states.includes(p.get("state")) ? p.get("state") : "clean";
  S.panel = PANELS.includes(p.get("panel")) ? p.get("panel") : "flood";
  const t = p.get("t");
  S.frame = t !== null && t !== "" && !isNaN(+t) ? nearestFrame(+t) : peakFrame(S.storm, S.state);
  S.from = validNode(p.get("from"));
  S.to = validNode(p.get("to"));
  S.view = VIEWS.includes(p.get("view")) && EN ? p.get("view") : "depth";
  if (S.view !== "depth") S.state = "clean";
  S.reports = parseReports(p.get("rep"));
  S.radarFrame = p.has("frame") && !isNaN(+p.get("frame")) ? Math.round(+p.get("frame")) : null;
}

function writeParams() {
  const p = new URLSearchParams();
  p.set("panel", S.panel);
  if (DOCKED.includes(S.panel)) {
    p.set("t", SC.minutes[S.frame]);
    p.set("storm", S.storm);
    p.set("state", S.state);
  }
  if (S.panel === "flood" && chanceOn()) p.set("view", S.view);
  if (S.panel === "report" && S.reports.length) p.set("rep", S.reports.map(r => `${r.node}-${r.cm}`).join("_"));
  if (S.panel === "route") {
    if (S.from !== null) p.set("from", S.from);
    if (S.to !== null) p.set("to", S.to);
  }
  if (S.panel === "radar" && typeof radarFrameIndex === "function") p.set("frame", radarFrameIndex());
  try {
    history.replaceState(null, "", "?" + p.toString());
  } catch (err) {
    return;
  }
}

function latlngs(e) {
  return e.coords.map(([lon, lat]) => [lat, lon]);
}

function nodeLatLng(n) {
  return [NET.nodes[n].lat, NET.nodes[n].lon];
}

function edgeMid(e) {
  const [a, b] = latlngs(e);
  return [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
}

function nearestNode(latlng) {
  const k = Math.cos(latlng.lat * Math.PI / 180);
  let best = 0, bestD = Infinity;
  NET.nodes.forEach(n => {
    const dx = (n.lon - latlng.lng) * k, dy = n.lat - latlng.lat;
    const d = dx * dx + dy * dy;
    if (d < bestD) { bestD = d; best = n.id; }
  });
  return best;
}

function addBaseTiles(m) {
  L.tileLayer(ESRI + "World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}", { maxZoom: 19, maxNativeZoom: 16, attribution: TILE_ATTR }).addTo(m);
  L.tileLayer(ESRI + "World_Dark_Gray_Reference/MapServer/tile/{z}/{y}/{x}", { maxZoom: 19, maxNativeZoom: 16, opacity: 0.6 }).addTo(m);
}

function makePane(m, name, z, events) {
  const pane = m.createPane(name);
  pane.style.zIndex = z;
  if (!events) pane.style.pointerEvents = "none";
  return L.svg({ pane: name, padding: 0.5 });
}

const map = L.map("map", { zoomControl: false, minZoom: 12, maxZoom: 19, zoomSnap: 0.25, zoomDelta: 0.5 });
L.control.zoom({ position: "topleft" }).addTo(map);
addBaseTiles(map);
const R_UNDER = makePane(map, "under", 405, false);
const R_EDGE = makePane(map, "edges", 410, false);
const R_OVER = makePane(map, "over", 420, false);
const R_ROUTE = makePane(map, "routes", 430, false);
const R_HIT = makePane(map, "hit", 440, true);
map.createPane("pins").style.zIndex = 620;

const edgeLines = NET.edges.map(e => L.polyline(latlngs(e), { renderer: R_EDGE, interactive: false, lineCap: "round", ...DIM }).addTo(map));
const hitLines = NET.edges.map(e => {
  const line = L.polyline(latlngs(e), { renderer: R_HIT, weight: 16, opacity: 0.001, color: "#000" });
  line.bindTooltip(() => edgeTip(e), { sticky: true, className: "jd-tip", direction: "top", offset: [0, -10] });
  line.on("mouseover", () => { S.hovered = e.id; });
  line.on("mouseout", () => { if (S.hovered === e.id) S.hovered = null; });
  return line.addTo(map);
});
const routeLayer = L.layerGroup().addTo(map);
const networkBounds = L.latLngBounds(NET.bounds);

const view = { userMoved: false, mode: null };
["dragstart"].forEach(ev => map.on(ev, () => { view.userMoved = true; }));
["wheel", "dblclick", "touchstart"].forEach(ev => map.getContainer().addEventListener(ev, () => { view.userMoved = true; }, { passive: true }));
document.querySelectorAll("#map .leaflet-control-zoom a").forEach(a => a.addEventListener("click", () => { view.userMoved = true; }));
window.addEventListener("resize", () => {
  if (view.userMoved) return;
  if (S.panel === "radar") refitRadar();
  else if (S.panel === "city") fitNetwork();
  else if (S.panel === "route" && S.route) fitRoute();
  else fitNetwork();
});

function fitNetwork() {
  if (S.panel === "city" && CITY.bounds) {
    map.fitBounds(CITY.bounds, { padding: [20, 20] });
    return;
  }
  const docked = DOCKED.includes(S.panel) && window.innerWidth > 820;
  map.fitBounds(networkBounds, { paddingTopLeft: [30, 30], paddingBottomRight: [docked ? 30 : 30, docked ? 190 : 30] });
}

function edgeTip(e) {
  const flood = DOCKED.includes(S.panel);
  const d = depths()[e.id];
  let depthRow = flood ? `<div class="tt-row"><span>Water depth</span><b>${d.toFixed(1)} cm</b></div>` : "";
  if (S.panel === "flood" && chanceOn()) {
    depthRow = `<div class="tt-row"><span>Nominal depth</span><b>${d.toFixed(1)} cm</b></div>` +
      `<div class="tt-row"><span>Chance over 15 cm</span><b>${probAt(S.storm, 15, S.frame)[e.id]}%</b></div>` +
      `<div class="tt-row"><span>Chance over 30 cm</span><b>${probAt(S.storm, 30, S.frame)[e.id]}%</b></div>`;
  }
  if (S.panel === "report") depthRow = reportTipRows(e);
  if (S.panel === "evidence") depthRow = evidenceTipRows(e);
  const when = flood ? `T+${SC.minutes[S.frame]} min, ${S.storm} mm storm, ${STATE_LONG[S.state]}. ` : "";
  return `<div class="tt-street">${esc(e.street)}</div>` + depthRow +
    `<div class="tt-row"><span>GCC survey OBJECTID</span><b>${e.survey_objectid}</b></div>` +
    `<div class="tt-row"><span>Drain id (results)</span><b>${e.gcc_drain}</b></div>` +
    panelTipRows(S.panel, e) +
    `<div class="tt-sub">${when}Survey condition: ${esc(e.status)}. Segment ${e.id}, ${Math.round(e.length_m)} m.</div>`;
}

function edgeValues() {
  if (S.panel === "flood" && chanceOn()) return { v: probAt(S.storm, viewThr(), S.frame), bins: PROB_BINS, bin: probBin, front: 1 };
  if (S.panel === "report" && RP.after) return { v: RP.after, bins: BINS, bin: binOf, front: 2 };
  if (S.panel === "evidence" && D.evidence) return { v: NET.edges.map(e => evEdge[e.id].peak), bins: BINS, bin: binOf, front: 2 };
  if (DOCKED.includes(S.panel)) return { v: depths(), bins: BINS, bin: binOf, front: 2 };
  return null;
}

function paintEdges() {
  const ev = edgeValues();
  const deep = [];
  NET.edges.forEach((e, i) => {
    if (!ev) {
      edgeLines[i].setStyle(DIM);
      return;
    }
    const b = ev.bin(ev.v[i]);
    edgeLines[i].setStyle({ color: ev.bins[b].color, weight: ev.bins[b].weight, opacity: ev.bins[b].opacity });
    if (b >= ev.front) deep.push(i);
  });
  if (ev) deep.sort((a, b) => ev.v[a] - ev.v[b]).forEach(i => edgeLines[i].bringToFront());
}

function setText(id, text) {
  const node = document.getElementById(id);
  if (node) node.textContent = text;
}

function renderFloodPanel() {
  const d = depths();
  const c = counts(S.storm, S.state)[S.frame];
  setText("f-nseg", NET.edges.length);
  setText("k15", c.over15);
  setText("k30", c.over30);
  let imax = 0;
  d.forEach((x, i) => { if (x > d[imax]) imax = i; });
  document.getElementById("kmax").innerHTML = `${d[imax].toFixed(1)}<small>cm</small>`;
  setText("kmax-street", d[imax] > 0 ? NET.edges[imax].street : "no water yet");
  const rain = stormInfo(S.storm).rain_mm_h_10min[S.frame];
  document.getElementById("krain").innerHTML = `${rain.toFixed(1)}<small>mm/h</small>`;
  renderChanceBlock();
  const note = document.getElementById("state-note");
  note.className = "callout " + (S.state === "clean" ? "info" : "twin");
  note.innerHTML = `<b>${STATE_LABEL[S.state]}.</b> ${esc(SC.state_notes[S.state])}`;
  drawChart(document.getElementById("chart"), {
    minutes: SC.minutes,
    rain: stormInfo(S.storm).rain_mm_h_10min,
    c15: counts(S.storm, S.state).map(x => x.over15),
    c30: counts(S.storm, S.state).map(x => x.over30),
    frame: S.frame,
    total: NET.edges.length,
    onPick: i => { stop(); S.frame = i; render(); }
  });
}

function renderChanceBlock() {
  const box = document.getElementById("chance-block");
  if (!EN) {
    box.hidden = true;
    return;
  }
  box.hidden = false;
  const sm = EN.summary.find(x => x.mm === S.storm);
  const k = document.getElementById("chance-kpis");
  if (chanceOn()) {
    const thr = viewThr();
    const p = probAt(S.storm, thr, S.frame);
    const any = EN.prob_any_pct[`${S.storm}|${thr}`];
    k.innerHTML = kpiHtml(`Chance 50% or more, now`, p.filter(x => x >= 50).length, `segments over ${thr} cm at T+${SC.minutes[S.frame]} min`) +
      kpiHtml("Chance 50% or more, any time", any.filter(x => x >= 50).length, `segments over ${thr} cm in the 3 h`);
    k.hidden = false;
  } else {
    k.hidden = true;
  }
  document.getElementById("chance-note").innerHTML =
    `${EN.members} storms per size: total times a lognormal factor (sigma ${EN.sigma_log} in log), peak moved up to ${EN.peak_jitter_min} min either way, seed ${EN.seed}. ` +
    `At ${S.storm} mm, ${sm.edges_over_15cm_nominal} segments pass 15 cm in the single run; ${sm.edges_p15_any_ge_50} have a 50% or higher chance and ${sm.edges_p15_any_ge_10} a 10% or higher chance at some time. ` +
    `Clean drains only. A synthetic ensemble standing in for radar nowcast ensembles.` +
    (S.view !== "depth" && S.state !== "clean" ? " Switch drains to Clean to see it." : "");
}

function renderDock() {
  document.getElementById("t").value = S.frame;
  setText("tlabel", `T+${SC.minutes[S.frame]} min`);
  const st = stormInfo(S.storm);
  setText("tsub", `${S.storm} mm storm, rain ${st.rain_mm_h_10min[S.frame].toFixed(1)} mm/h`);
  document.querySelectorAll("#storm-seg button").forEach(b => b.setAttribute("aria-pressed", String(+b.dataset.v === S.storm)));
  document.querySelectorAll("#state-seg button").forEach(b => b.setAttribute("aria-pressed", String(b.dataset.v === S.state)));
  document.querySelectorAll("#view-seg button").forEach(b => b.setAttribute("aria-pressed", String(b.dataset.v === (chanceOn() ? S.view : "depth"))));
  document.getElementById("view-group").hidden = !EN || S.panel !== "flood";
  document.getElementById("play").innerHTML = S.playing ? ICON_PAUSE : ICON_PLAY;
}

const ICON_PLAY = '<svg width="14" height="14" viewBox="0 0 14 14"><path d="M3 1.5v11l9-5.5z" fill="#e9edf2"/></svg>';
const ICON_PAUSE = '<svg width="14" height="14" viewBox="0 0 14 14"><rect x="2.5" y="1.5" width="3.2" height="11" rx="1" fill="#e9edf2"/><rect x="8.3" y="1.5" width="3.2" height="11" rx="1" fill="#e9edf2"/></svg>';

function buildDock() {
  const t = document.getElementById("t");
  t.max = SC.minutes.length - 1;
  t.addEventListener("input", () => { const v = +t.value; stop(); S.frame = v; render(); });
  document.getElementById("ticks").innerHTML = SC.minutes.filter(m => m % 30 === 0).map(m => `<span>${m}</span>`).join("");
  document.getElementById("storm-seg").innerHTML = SC.storms.map(s => `<button data-v="${s.mm}" title="Peak ${s.peak_mm_h} mm/h at minute ${s.peak_at_min}">${s.mm} mm</button>`).join("");
  document.getElementById("state-seg").innerHTML = SC.states.map(s => `<button data-v="${s}">${STATE_LABEL[s]}</button>`).join("");
  document.querySelectorAll("#storm-seg button").forEach(b => b.addEventListener("click", () => { S.storm = +b.dataset.v; render(); }));
  document.querySelectorAll("#state-seg button").forEach(b => b.addEventListener("click", () => { S.state = b.dataset.v; if (S.state !== "clean") S.view = "depth"; render(); }));
  if (EN) {
    document.getElementById("view-seg").innerHTML = VIEWS.map(v => `<button data-v="${v}">${v === "depth" ? "Depth" : `Chance &gt;${v.slice(1)} cm`}</button>`).join("");
    document.querySelectorAll("#view-seg button").forEach(b => b.addEventListener("click", () => { S.view = b.dataset.v; if (S.view !== "depth") S.state = "clean"; render(); }));
  }
  document.getElementById("play").addEventListener("click", () => (S.playing ? stop() : play()));
}

function play() {
  if (S.frame >= SC.minutes.length - 1) S.frame = 0;
  S.playing = setInterval(() => {
    if (S.frame >= SC.minutes.length - 1) { stop(); return; }
    S.frame += 1;
    render();
  }, 700);
  render();
}

function stop() {
  if (S.playing) clearInterval(S.playing);
  S.playing = null;
  renderDock();
}

function fmtKm(m) {
  return m >= 1000 ? `${(m / 1000).toFixed(2)} km` : `${Math.round(m)} m`;
}

function fmtMin(s) {
  return s === null ? "impassable" : `${(s / 60).toFixed(1)} min`;
}

function pin(latlng, label, cls) {
  return L.marker(latlng, { pane: "pins", icon: L.divIcon({ className: "", html: `<div class="pin ${cls}">${label}</div>`, iconSize: [26, 26], iconAnchor: [13, 13] }) });
}

function pathLatLngs(r) {
  return r.nodes.map(nodeLatLng);
}

function drawRoute() {
  routeLayer.clearLayers();
  S.route = null;
  const out = document.getElementById("r-out");
  setText("r-from", S.from === null ? "not set" : `junction ${S.from}`);
  setText("r-to", S.to === null ? "not set" : `junction ${S.to}`);
  if (S.panel !== "route") return;
  if (S.from !== null) pin(nodeLatLng(S.from), "A", "a").addTo(routeLayer);
  if (S.to !== null) pin(nodeLatLng(S.to), "B", "b").addTo(routeLayer);
  if (S.from === null || S.to === null) {
    out.innerHTML = `<div class="pulse-hint">${S.from === null ? "Click the map to set the start." : "Now click the map to set the end."}</div>`;
    return;
  }
  if (S.from === S.to) {
    out.innerHTML = '<div class="pulse-hint">Start and end snapped to the same junction. Pick points further apart.</div>';
    return;
  }
  const r = JDRoute.route(NET, depths(), S.from, S.to, ADJ);
  S.route = r;
  const same = r.shortest.edges.join() === r.safe.edges.join();
  L.polyline(pathLatLngs(r.safe), { renderer: R_ROUTE, color: "#06120a", weight: 10, opacity: 0.85, lineJoin: "round" }).addTo(routeLayer);
  L.polyline(pathLatLngs(r.safe), { renderer: R_ROUTE, color: SAFE_COLOR, weight: 5.5, opacity: 1, lineJoin: "round" }).addTo(routeLayer);
  L.polyline(pathLatLngs(r.shortest), { renderer: R_ROUTE, color: "#0b0e13", weight: 7, opacity: 0.9, lineJoin: "round" }).addTo(routeLayer);
  L.polyline(pathLatLngs(r.shortest), { renderer: R_ROUTE, color: SHORT_COLOR, weight: 3.2, opacity: 1, dashArray: "7 7", lineJoin: "round" }).addTo(routeLayer);
  new Set([...r.shortest.closed_edges, ...r.safe.closed_edges]).forEach(id => {
    const e = NET.edges[id];
    L.marker(edgeMid(e), { pane: "pins", icon: L.divIcon({ className: "", html: '<div class="closed-x">&times;</div>', iconSize: [16, 16], iconAnchor: [8, 8] }) })
      .bindTooltip(`${esc(e.street)}: ${depths()[id].toFixed(1)} cm, closed`, { className: "jd-tip short", direction: "top", offset: [0, -8] })
      .addTo(routeLayer);
  });
  const extra = r.safe.length_m - r.shortest.length_m;
  const longer = `${extra >= 0 ? "+" : ""}${Math.round(extra)} m longer than the shortest path.`;
  const safeFoot = r.openRoute
    ? (same ? "Same path as the shortest: no closed segment on it." : longer)
    : `No route from A to B avoids closed streets at T+${SC.minutes[S.frame]} min: every route crosses a street with ${JDRoute.CLOSED_CM} cm of water or more. ` +
      `This one keeps the deepest water as shallow as possible, then crosses the least length of closed street.${same ? " It is the same path as the shortest." : ` ${longer}`}`;
  out.innerHTML = routeCard("shortest", "Shortest distance", `<span class="line-key dashed" style="border-color:${SHORT_COLOR}"></span>`, r.shortest, "") +
    routeCard("safe", r.openRoute ? "Flood-safe" : "No open route: least flooded", `<span class="line-key" style="border-color:${SAFE_COLOR}"></span>`, r.safe, safeFoot) +
    `<p class="note">At T+${SC.minutes[S.frame]} min, ${S.storm} mm storm, ${STATE_LONG[S.state]}. Time is at flood speeds; dry-weather time at ${JDRoute.CAP_KMH} km/h is ${fmtMin(r.safe.dry_time_s)} for the safe path.</p>`;
}

function routeCard(kind, title, key, s, foot) {
  const closedCls = s.closed ? "bad" : "ok";
  return `<div class="route-card" data-route="${kind}" data-length-m="${s.length_m.toFixed(1)}" data-closed="${s.closed}" data-time-s="${s.flood_time_s === null ? "" : s.flood_time_s.toFixed(1)}" data-edges="${s.edges.join(",")}">` +
    `<div class="head">${key}${title}</div>` +
    `<div class="stats"><div><div class="label">Distance</div><div class="value">${fmtKm(s.length_m)}</div></div>` +
    `<div><div class="label">Closed segments</div><div class="value ${closedCls}">${s.closed}</div></div>` +
    `<div><div class="label">Travel time</div><div class="value ${s.closed ? "bad" : ""}">${fmtMin(s.flood_time_s)}</div></div></div>` +
    `<p class="note">Deepest water on the path: ${s.max_depth_cm.toFixed(1)} cm.${s.closed ? ` Crosses ${fmtKm(s.closed_length_m)} of closed street.` : ""} ${foot}</p></div>`;
}

function fitRoute() {
  if (!S.route || !S.route.safe || !S.route.shortest) return;
  const pts = [...S.route.safe.nodes, ...S.route.shortest.nodes].map(nodeLatLng);
  const wide = window.innerWidth > 820;
  map.fitBounds(L.latLngBounds(pts), { paddingTopLeft: [60, 60], paddingBottomRight: [wide ? 260 : 40, wide ? 200 : 40], maxZoom: 17 });
}

function buildRoutePanel() {
  setText("r-cap", JDRoute.CAP_KMH);
  setText("r-closed", JDRoute.CLOSED_CM);
  setText("r-nseg", NET.edges.length);
  document.getElementById("r-example").addEventListener("click", () => { S.from = EXAMPLE_TRIP.from; S.to = EXAMPLE_TRIP.to; render(); fitRoute(); });
  document.getElementById("r-swap").addEventListener("click", () => { [S.from, S.to] = [S.to, S.from]; render(); });
  document.getElementById("r-clear").addEventListener("click", () => { S.from = null; S.to = null; view.userMoved = false; render(); fitNetwork(); });
  map.on("click", ev => {
    if (S.panel === "report") {
      reportClick(S, nearestNode(ev.latlng));
      render();
      return;
    }
    if (S.panel === "city") {
      cityClick(ev.latlng);
      return;
    }
    if (S.panel !== "route") return;
    const n = nearestNode(ev.latlng);
    if (S.from === null || S.to !== null) {
      S.from = n;
      S.to = null;
    } else {
      S.to = n;
    }
    render();
  });
}

function legendHtml() {
  if (S.panel === "priority") return priorityLegend();
  if (S.panel === "twin") return twinLegend();
  if (S.panel === "radar") return typeof radarLegend === "function" ? radarLegend() : "";
  if (S.panel === "report") return reportLegend(BINS);
  if (S.panel === "evidence") return evidenceLegend(BINS);
  if (S.panel === "city") return cityLegend(BINS);
  if (S.panel === "why") return '<div class="title">Prototype site</div><div class="row"><span class="ln" style="background:#5f6a7b;height:2px"></span>' + NET.edges.length + " street segments over surveyed GCC drains</div>";
  if (S.panel === "flood" && chanceOn()) return chanceLegend(viewThr());
  let html = '<div class="title">Water depth on street</div>' +
    BINS.slice().reverse().map(b => `<div class="row"><span class="ln" style="background:${b.color};height:${Math.max(2, b.weight)}px"></span>${b.label}</div>`).join("");
  if (S.panel === "route") {
    html += '<div class="title" style="margin-top:10px">Routes</div>' +
      `<div class="row"><span class="line-key dashed" style="border-color:${SHORT_COLOR}"></span>shortest distance</div>` +
      `<div class="row"><span class="line-key" style="border-color:${SAFE_COLOR}"></span>flood-safe, or least flooded</div>` +
      '<div class="row"><span class="closed-x" style="display:inline-block;margin:0 5px">&times;</span>closed segment on a route</div>';
  }
  return html;
}

function setPanel(p) {
  const was = S.panel;
  S.panel = p;
  if (p === "route" && S.from === null && S.to === null) {
    S.from = EXAMPLE_TRIP.from;
    S.to = EXAMPLE_TRIP.to;
  }
  if (!DOCKED.includes(p)) stop();
  const radar = p === "radar";
  document.getElementById("map").hidden = radar;
  document.getElementById("radar-map").hidden = !radar;
  document.getElementById("dock").hidden = !DOCKED.includes(p);
  document.getElementById("radar-dock").hidden = !radar;
  document.querySelectorAll(".tab").forEach(b => b.setAttribute("aria-selected", String(b.dataset.panel === p)));
  const at = document.querySelector('.tab[aria-selected="true"]');
  if (at) at.scrollIntoView({ inline: "center", block: "nearest" });
  document.querySelectorAll(".panel").forEach(s => { s.hidden = s.dataset.panel !== p; });
  document.body.dataset.panel = p;
  if (radar) {
    showRadar();
  } else if (was === "radar" || was === "why") {
    map.invalidateSize();
    if (was === "why" && !view.userMoved) fitNetwork();
  }
  showPriority(p === "priority");
  showTwin(p === "twin");
  showReport(p === "report");
  showEvidence(p === "evidence");
  showCity(p === "city");
  ["under", "edges", "over", "routes", "hit"].forEach(name => { map.getPane(name).style.display = p === "city" ? "none" : ""; });
  const mode = p === "city" ? "city" : "site";
  if (!radar) map.setMinZoom(mode === "city" ? 10 : 12);
  if (!radar && view.mode && view.mode !== mode) {
    view.userMoved = false;
    fitNetwork();
  }
  if (!radar) view.mode = mode;
}

function render() {
  if (S.panel === "report" && D.report) renderReportPanel(S, NET);
  paintEdges();
  renderDock();
  if (S.panel === "flood") renderFloodPanel();
  drawRoute();
  const legend = document.getElementById("legend");
  legend.innerHTML = legendHtml();
  legend.classList.toggle("light", S.panel === "radar");
  if (S.hovered !== null) hitLines[S.hovered].setTooltipContent(edgeTip(NET.edges[S.hovered]));
  writeParams();
  document.body.dataset.ready = "1";
}

function publicRoute(from, to, opts) {
  const o = opts || {};
  const storm = o.storm !== undefined ? +o.storm : S.storm;
  const state = o.state !== undefined ? o.state : S.state;
  const frame = o.t !== undefined ? nearestFrame(+o.t) : S.frame;
  if (!SC.depth_cm[scenarioKey(storm, state)]) throw new Error(`no scenario ${storm} mm / ${state}`);
  const f = validNode(from), t = validNode(to);
  if (f === null || t === null) throw new Error(`junction ids run from 0 to ${NET.nodes.length - 1}`);
  const r = JDRoute.route(NET, depthsAt(storm, state, frame), f, t, ADJ);
  const slim = s => s && {
    length_m: +s.length_m.toFixed(1), closed_segments: s.closed, closed_edges: s.closed_edges,
    flood_time_min: s.flood_time_s === null ? null : +(s.flood_time_s / 60).toFixed(2),
    dry_time_min: +(s.dry_time_s / 60).toFixed(2), max_depth_cm: s.max_depth_cm, nodes: s.nodes, edges: s.edges
  };
  return { from: f, to: t, minute: SC.minutes[frame], storm, state, shortest: slim(r.shortest), safe: slim(r.safe) };
}

window.JalDrishti = {
  route: publicRoute,
  state: () => ({ panel: S.panel, t: SC.minutes[S.frame], storm: S.storm, state: S.state, from: S.from, to: S.to }),
  set: o => {
    if (o.storm !== undefined) S.storm = +o.storm;
    if (o.state !== undefined) S.state = o.state;
    if (o.t !== undefined) S.frame = nearestFrame(+o.t);
    if (o.from !== undefined) S.from = validNode(o.from);
    if (o.to !== undefined) S.to = validNode(o.to);
    if (o.panel !== undefined) setPanel(o.panel);
    render();
    return window.JalDrishti.state();
  },
  nearestNode: (lat, lon) => nearestNode({ lat, lng: lon }),
  map,
  data: D
};

function buildStaticText() {
  setText("k15-of", `segments, speed ${Math.round(JDRoute.speedKmh(15))} km/h or less`);
  setText("pool-caveat", D.meta.pooling_note);
}

function safeRadarPanel() {
  try {
    buildRadarPanel();
  } catch (err) {
    document.querySelector('.tab[data-panel="radar"]').hidden = true;
    if (S.panel === "radar") S.panel = "flood";
    console.error("Radar panel disabled:", err);
  }
}

function init() {
  readParams();
  buildStaticText();
  buildDock();
  buildRoutePanel();
  buildPriorityPanel(map, R_OVER, fitEdges);
  buildTwinPanel(map, R_OVER, fitEdges);
  const ctx = { map, NET, S, under: R_UNDER, over: R_OVER, bins: BINS, binOf, fitEdges, onChange: render };
  buildWhyPanel();
  buildReportPanel(ctx);
  buildEvidencePanel(ctx);
  buildCityPanel(ctx);
  safeRadarPanel();
  document.querySelectorAll(".tab").forEach(b => b.addEventListener("click", () => { setPanel(b.dataset.panel); render(); }));
  document.addEventListener("keydown", ev => {
    if (!DOCKED.includes(S.panel) || ev.target.tagName === "INPUT") return;
    if (ev.key === "ArrowRight") { stop(); S.frame = Math.min(SC.minutes.length - 1, S.frame + 1); render(); }
    if (ev.key === "ArrowLeft") { stop(); S.frame = Math.max(0, S.frame - 1); render(); }
    if (ev.key === " ") { ev.preventDefault(); S.playing ? stop() : play(); }
  });
  const panel = S.panel;
  S.panel = "flood";
  fitNetwork();
  view.mode = "site";
  setPanel(panel);
  render();
  if (S.panel === "route") fitRoute();
}

function fitEdges(ids) {
  view.userMoved = true;
  const b = L.latLngBounds(ids.flatMap(i => latlngs(NET.edges[i])));
  map.fitBounds(b, { padding: [80, 80], maxZoom: 17 });
}

init();
