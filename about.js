(function () {
  const D = window.JD_DATA;
  const M = D.meta, P = D.priority, T = D.twin, SC = D.scenarios, RD = D.radar;
  const byObs = n => T.summary.find(s => s.n_obs === n);
  const s10 = byObs(10), s30 = byObs(30);
  const list = xs => xs.length > 1 ? `${xs.slice(0, -1).join(", ")} and ${xs[xs.length - 1]}` : String(xs[0]);
  const esc = s => String(s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const methodName = { extrapolation: "LK extrapolation", sprog: "S-PROG", persistence: "persistence" };
  const score = v => (v === null || v === undefined ? "n/a" : v.toFixed(3));
  const HO = RD ? RD.verification.holdout.targets[0] : null;
  const hoAll = HO ? Object.entries(HO.methods).filter(([k]) => k !== "persistence").map(([, m]) => m.csi_1) : [];
  const hoScores = hoAll.filter(v => v !== null && v !== undefined);
  const every = hoScores.length === hoAll.length ? "every nowcast method" : "every scored nowcast method";
  const pool = M.site.local_lows;

  const V = {
    snap: 10,
    outfall_m: 60,
    cover: 0.3,
    street_w: 8,
    wards: list(M.site.wards),
    zones: list(M.site.zones),
    junctions: M.site.junctions,
    segments: M.site.segments,
    drains: M.site.gcc_drains,
    outfalls: M.site.outfalls,
    totals: list(M.storm.totals_mm),
    duration: M.storm.duration_min,
    peak_at: M.storm.peak_at_min,
    peaks: list(M.storm.peak_mm_h),
    dt: M.storm.time_step_s,
    rec: M.storm.record_every_min,
    n_scen: Object.keys(SC.depth_cm).length,
    n_storms: SC.storms.length,
    n_states: SC.states.length,
    adj_s: P.adjoint_seconds,
    prio_storm: P.storm_mm,
    bf_runs: P.brute_force_runs,
    bf_s: P.brute_force_seconds,
    spearman: P.spearman,
    overlap: P.top20_overlap,
    drain_sp: P.drain_check.spearman,
    drain_ov: P.drain_check.top20_overlap,
    pool_lows: pool.local_low_junctions,
    pool_inner: pool.non_outfall_junctions,
    pool_deep: pool.deep_in_depression === pool.deep_junctions ? pool.deep_junctions : `${pool.deep_in_depression} of the ${pool.deep_junctions}`,
    step: JDRoute.LENGTH_STEP_M,
    twin_k: s30.top_k,
    twin_noise: T.noise_cm,
    twin_cand: s30.candidates,
    twin_runs: s30.runs,
    twin_hits10: s10.topk_hits,
    twin_hits30: s30.topk_hits,
    twin_silted: s30.silted,
    twin_chance: s30.topk_hits_by_chance,
    twin_err10: `${s10.flooded_error_cm_before} to ${s10.flooded_error_cm_after}`,
    twin_err30: `${s30.flooded_error_cm_before} to ${s30.flooded_error_cm_after}`,
    cap: JDRoute.CAP_KMH,
    closed: JDRoute.CLOSED_CM,
    radar_city: RD ? RD.city : "no radar data in this build",
    radar_origins: RD ? RD.verification.backtest.origins : "n/a",
    radar_csi: RD ? list(Object.entries(RD.verification.backtest.by_lead[0].methods).map(([k, m]) => `${score(m.csi_1_pooled)} for ${methodName[k] || k}`)) : "n/a",
    radar_ho_text: !hoScores.length ? "no nowcast method was scored" : Math.max(...hoScores) === Math.min(...hoScores)
      ? `${every} scored CSI ${Math.max(...hoScores).toFixed(3)}` : `the best nowcast method scored CSI ${Math.max(...hoScores).toFixed(3)}`,
    radar_ho_lead: HO ? HO.lead_min : "n/a",
    radar_ho_pers: HO ? score(HO.methods.persistence.csi_1) : "n/a"
  };

  document.querySelectorAll("[data-v]").forEach(el => {
    const v = V[el.dataset.v];
    el.textContent = v === undefined ? "" : v;
  });

  const facts = [
    [M.site.junctions, "junctions"],
    [M.site.segments, "drain-street segments"],
    [M.site.gcc_drains, "surveyed GCC drains"],
    [`${SC.storms.length} × ${SC.states.length}`, "storm and drain-state runs"],
    [`${P.adjoint_seconds} s`, "adjoint ranking of every drain"],
    [`${s30.topk_hits} of ${s30.silted}`, `planted drains in the top 4, twin test with ${s30.n_obs} gauges`]
  ];
  document.getElementById("facts").innerHTML = facts.map(([v, l]) => `<div class="fact"><div class="v num">${esc(v)}</div><div class="l">${esc(l)}</div></div>`).join("");

  const extra = [
    "Flood-safe routes run on the drain-street segments only, treated as two-way streets. It is not the full road network, and there is no traffic.",
    `Priority scores are a linear (adjoint) estimate summed per drain. The brute-force check was per segment; summed per drain it agrees with Spearman ${P.drain_check.spearman}, and single drains can disagree sharply.`,
    ...(RD ? ["The radar nowcast is scored on light, scattered rain. Its skill numbers are indicative, not a skill estimate for monsoon storms."] : [])
  ];
  document.getElementById("caveats").innerHTML = [...M.caveats, ...extra].map(c => `<li>${esc(c)}</li>`).join("");
  document.getElementById("sources").innerHTML = M.sources.map(s => `<li>${esc(s.name)}. <a href="${esc(s.url)}">${esc(s.url.replace(/^https?:\/\//, ""))}</a></li>`).join("");
  document.getElementById("id-note").textContent = `Drain ids: ${M.gcc_drain_id_note}`;
  const dirty = M.git_uncommitted_changes ? " with uncommitted changes" : "";
  document.getElementById("build").textContent =
    `Flood data built ${M.generated_utc} from commit ${M.git_commit}${dirty}.` +
    (RD ? ` Radar data built ${RD.built_utc}.` : "") + ` Page bundle built ${D.bundled_utc}.`;
})();
