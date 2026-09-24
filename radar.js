const RD = window.JD_DATA.radar;
let rmap = null;
let roverlay = null;
let rtimer = null;
let rframe = 0;

function radarFrameIndex() {
  return rframe;
}

function utcClock(iso) {
  return iso.slice(11, 16);
}

function istClock(iso) {
  const t = new Date(new Date(iso).getTime() + 330 * 60000);
  return t.toISOString().slice(11, 16);
}

function thrKey(v) {
  return String(+v);
}

function score3(v) {
  return v === null || v === undefined ? "n/a" : v.toFixed(3);
}

function bestIn(vals) {
  const ok = vals.filter(x => x !== null && x !== undefined);
  return ok.length ? Math.max(...ok) : null;
}

function buildRadarPanel() {
  const tab = document.querySelector('.tab[data-panel="radar"]');
  if (!RD) {
    tab.hidden = true;
    return;
  }
  const obs = RD.frames.filter(f => f.kind === "observed");
  const now = RD.frames.filter(f => f.kind === "nowcast");
  const V = RD.verification;
  const thr = V.threshold_mm_h;
  document.getElementById("rd-offline").innerHTML =
    `<b>Chennai's radar was offline on 2026-09-24,</b> so this panel runs the same chain on the IMD Doppler Weather Radar at ${esc(RD.city)} (${esc(RD.product_name)}). ` +
    "The radar nowcast is not yet coupled to the flood model, which uses a synthetic storm.";
  document.getElementById("rd-lede").innerHTML =
    `${obs.length} observed scans from ${utcClock(obs[0].time_utc)} to ${utcClock(obs[obs.length - 1].time_utc)} UTC on ${obs[0].time_utc.slice(0, 10)}, decoded from the image colours to rain rate on a ${RD.grid_km} km grid. ` +
    `${now.length} nowcast frames extend them to +${now[now.length - 1].lead_min} min by ${esc(now[0].method)}.`;
  document.getElementById("rd-thr").textContent = thr;
  document.getElementById("rd-thr2").textContent = thr;
  const H = V.holdout;
  const methods = Object.keys(H.targets[0].methods);
  const key = `csi_${thrKey(thr)}`;
  document.getElementById("rd-holdout").innerHTML =
    `<thead><tr><th>Method</th>${H.targets.map(t => `<th class="r">+${t.lead_min} min</th>`).join("")}</tr></thead><tbody>` +
    methods.map(m => `<tr><td>${METHOD_NAME[m] || esc(m)}</td>${H.targets.map(t => {
      const v = t.methods[m][key];
      const best = v !== null && v > 0 && v === bestIn(methods.map(k => t.methods[k][key]));
      return `<td class="r num${best ? " best" : ""}">${score3(v)}</td>`;
    }).join("")}</tr>`).join("") + "</tbody>";
  const vecs = H.vectors_per_pair.reduce((a, p) => a + p.vectors, 0);
  document.getElementById("rd-holdout-note").textContent =
    `Inputs ${H.inputs_utc.map(utcClock).join(", ")} UTC, scored on the next ${H.targets.length} scans. Motion rests on ${vecs} tracked vectors (median ${H.median_motion_km_h} km/h). ` +
    `Observed cells at ${thr} mm/h or more: ${H.targets.map(t => t.obs_cells_ge_1).join(", ")}. CSI is hits / (hits + misses + false alarms); 1 is perfect, 0 is no skill.`;
  const B = V.backtest;
  const bm = Object.keys(B.by_lead[0].methods);
  document.getElementById("rd-backtest").innerHTML =
    `<thead><tr><th>Method</th>${B.by_lead.map(l => `<th class="r">${l.frames_ahead} scan${l.frames_ahead > 1 ? "s" : ""}</th>`).join("")}</tr></thead><tbody>` +
    bm.map(m => `<tr><td>${METHOD_NAME[m] || esc(m)}</td>${B.by_lead.map(l => {
      const v = l.methods[m].csi_1_pooled;
      const best = v !== null && v === bestIn(bm.map(k => l.methods[k].csi_1_pooled));
      return `<td class="r num${best ? " best" : ""}">${score3(v)}</td>`;
    }).join("")}</tr>`).join("") + "</tbody>";
  document.getElementById("rd-backtest-note").textContent =
    `${B.origins} forecast origins. Lead times: ${B.by_lead.map(l => `${l.lead_min_range[0]} to ${l.lead_min_range[1]} min`).join("; ")}. ` +
    `Fractions skill score (${thr} mm/h, ${V.fss_window_km} km), next scan: ${bm.map(m => `${METHOD_NAME[m] || m} ${score3(B.by_lead[0].methods[m].fss_1_10km_mean)}`).join(", ")}.`;
  document.getElementById("rd-notes").innerHTML = [...V.summary, ...RD.notes].map(n => `<li>${esc(n)}</li>`).join("");
  const slider = document.getElementById("rframe");
  slider.max = RD.frames.length - 1;
  slider.addEventListener("input", () => { stopRadar(); setRadarFrame(+slider.value); });
  document.getElementById("rticks").innerHTML = RD.frames.map(f => `<span>${f.kind === "observed" ? utcClock(f.time_utc) : "+" + Math.round(f.lead_min)}</span>`).join("");
  document.getElementById("rplay").addEventListener("click", () => (rtimer ? stopRadar() : playRadar()));
  document.getElementById("rd-ring").textContent = `Full ${RD.range_km} km range`;
  document.getElementById("rd-rain").addEventListener("click", () => radarView("rain"));
  document.getElementById("rd-ring").addEventListener("click", () => radarView("ring"));
  document.getElementById("rfine").innerHTML =
    `<b>${esc(RD.city)} radar, not Chennai.</b> Light, scattered rain in this archive. ${esc(RD.product_name)} converted with Marshall-Palmer Z = 200R<sup>1.6</sup>. Nowcast cells keep their intensity; growth and decay are not modelled.`;
  const start = S.radarFrame !== null && S.radarFrame >= 0 && S.radarFrame < RD.frames.length ? S.radarFrame : obs.length - 1;
  rframe = start;
}

function initRadarMap() {
  rmap = L.map("radar-map", { zoomControl: false, minZoom: 5, maxZoom: 12, zoomSnap: 1, zoomDelta: 1 });
  L.control.zoom({ position: "topleft" }).addTo(rmap);
  L.tileLayer(ESRI + "World_Light_Gray_Base/MapServer/tile/{z}/{y}/{x}", { maxZoom: 12, maxNativeZoom: 16, attribution: TILE_ATTR }).addTo(rmap);
  L.tileLayer(ESRI + "World_Light_Gray_Reference/MapServer/tile/{z}/{y}/{x}", { maxZoom: 12, maxNativeZoom: 16, opacity: 0.8 }).addTo(rmap);
  const b = RD.frames[0].bounds_latlon;
  L.circle([RD.radar_lat, RD.radar_lon], { radius: RD.range_km * 1000, color: "#4b5563", weight: 1.2, dashArray: "4 6", fill: false, interactive: false }).addTo(rmap);
  roverlay = L.imageOverlay(RD.frames[rframe].src, b, { opacity: 1, className: "radar-img" }).addTo(rmap);
  L.marker([RD.radar_lat, RD.radar_lon], { icon: L.divIcon({ className: "", html: '<div class="radar-site"></div>', iconSize: [12, 12], iconAnchor: [6, 6] }) })
    .bindTooltip(`IMD DWR ${esc(RD.city)}`, { permanent: true, direction: "right", offset: [10, 0], className: "map-label" })
    .addTo(rmap);
  rmap.on("dragstart", () => { rview.userMoved = true; });
  ["wheel", "dblclick", "touchstart"].forEach(ev => rmap.getContainer().addEventListener(ev, () => { rview.userMoved = true; }, { passive: true }));
  refitRadar();
  rainBounds().then(b => {
    rview.rain = b;
    document.getElementById("rd-rain").disabled = !b;
    refitRadar();
  });
}

const rview = { userMoved: false, mode: "rain", rain: null };

function loadImage(src) {
  return new Promise(res => {
    const img = new Image();
    img.onload = () => res(img);
    img.onerror = () => res(null);
    img.src = src;
  });
}

function rainBounds() {
  return Promise.all(RD.frames.map(f => loadImage(f.src))).then(imgs => {
    let x0 = Infinity, y0 = Infinity, x1 = -1, y1 = -1, w = 0, h = 0;
    imgs.filter(Boolean).forEach(img => {
      w = img.naturalWidth;
      h = img.naturalHeight;
      const c = document.createElement("canvas");
      c.width = w;
      c.height = h;
      const ctx = c.getContext("2d");
      ctx.drawImage(img, 0, 0);
      const a = ctx.getImageData(0, 0, w, h).data;
      for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
          if (a[(y * w + x) * 4 + 3] > 0) {
            if (x < x0) x0 = x;
            if (x > x1) x1 = x;
            if (y < y0) y0 = y;
            if (y > y1) y1 = y;
          }
        }
      }
    });
    if (x1 < 0) return null;
    const [[la0, lo0], [la1, lo1]] = RD.frames[0].bounds_latlon;
    const crs = L.CRS.EPSG3857;
    const sw = crs.project(L.latLng(la0, lo0)), ne = crs.project(L.latLng(la1, lo1));
    const at = (x, y) => crs.unproject(L.point(sw.x + (x / w) * (ne.x - sw.x), ne.y - (y / h) * (ne.y - sw.y)));
    return L.latLngBounds(at(x0, y1 + 1), at(x1 + 1, y0)).extend(L.latLng(RD.radar_lat, RD.radar_lon));
  }).catch(() => null);
}

function refitRadar() {
  if (!rmap || rview.userMoved) return;
  rmap.invalidateSize();
  const ring = L.latLng(RD.radar_lat, RD.radar_lon).toBounds(2 * RD.range_km * 1000);
  const target = rview.mode === "rain" && rview.rain ? rview.rain : ring;
  const pad = rview.mode === "rain" && rview.rain ? 40 : 10;
  rmap.fitBounds(target, { paddingTopLeft: [pad, pad], paddingBottomRight: [pad, window.innerWidth > 820 ? 130 + pad : pad], maxZoom: 10 });
}

function radarView(mode) {
  rview.mode = mode;
  rview.userMoved = false;
  refitRadar();
}

function showRadar() {
  if (!RD) return;
  if (!rmap) initRadarMap();
  else rmap.invalidateSize();
  setRadarFrame(rframe);
}

function setRadarFrame(i) {
  rframe = i;
  const f = RD.frames[i];
  if (roverlay) roverlay.setUrl(f.src);
  document.getElementById("rframe").value = i;
  document.getElementById("rplay").innerHTML = rtimer ? ICON_PAUSE : ICON_PLAY;
  const obs = f.kind === "observed";
  setText("rlabel", `${utcClock(f.time_utc)} UTC`);
  setText("rsub", obs ? `Observed scan, ${istClock(f.time_utc)} IST` : `Nowcast, +${f.lead_min} min after last scan`);
  document.getElementById("rlabel").style.color = obs ? "" : "#f6c3ad";
  if (S.panel === "radar") document.getElementById("legend").innerHTML = radarLegend();
  writeParams();
}

function playRadar() {
  if (rframe >= RD.frames.length - 1) rframe = 0;
  rtimer = setInterval(() => {
    if (rframe >= RD.frames.length - 1) { stopRadar(); return; }
    setRadarFrame(rframe + 1);
  }, 900);
  setRadarFrame(rframe);
}

function stopRadar() {
  if (rtimer) clearInterval(rtimer);
  rtimer = null;
  document.getElementById("rplay").innerHTML = ICON_PLAY;
}

function radarLegend() {
  if (!RD) return "";
  const rows = RD.scale_mm_h.slice().reverse().map(s =>
    `<div class="row"><span class="box" style="background:${s.color}"></span>${s.max === null ? `${s.min} mm/h or more` : `${s.min} to ${s.max} mm/h`}</div>`).join("");
  const f = RD.frames[rframe];
  return `<div class="title">Rain rate, ${f.kind === "observed" ? "observed" : "nowcast"}</div>${rows}` +
    `<div class="row"><span class="radar-site" style="display:inline-block;margin:0 7px 0 4px;width:10px;height:10px;border-width:2px"></span>radar, ${RD.range_km} km ring</div>`;
}
