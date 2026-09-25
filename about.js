(function () {
  const D = window.JD_DATA;
  const M = D.meta, P = D.priority, T = D.twin, SC = D.scenarios, RD = D.radar;
  const EN = D.ensemble, RP = D.report, CT = D.city, EV = D.evidence, SW = D.swmm, WH = D.why;
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
    ...(RD ? ["The radar nowcast is scored on light, scattered rain. Its skill numbers are indicative, not a skill estimate for monsoon storms."] : []),
    ...(EV ? ["Against 2015 flood records the default model does not beat chance, and calibration did not improve the held-out half. We do not claim a match with 2015."] : []),
    ...(RP ? ["Report water here is a linear approximation tested only in the identical-twin setting, with silt planted in the model and exact reports."] : [])
  ];
  document.getElementById("caveats").innerHTML = [...M.caveats, ...extra].map(c => `<li>${esc(c)}</li>`).join("");
  document.getElementById("sources").innerHTML = M.sources.map(s => `<li>${esc(s.name)}. <a href="${esc(s.url)}">${esc(s.url.replace(/^https?:\/\//, ""))}</a></li>`).join("");
  document.getElementById("id-note").textContent = `Drain ids: ${M.gcc_drain_id_note}`;
  const put = (id, html) => { const el = document.getElementById(id); if (el) el.innerHTML = html; };
  const f2 = x => (x < 0 ? "\u2212" : "") + Math.abs(x).toFixed(2);
  const rng = ci => `${f2(ci[0])} to ${f2(ci[1])}`;
  const nf = n => n.toLocaleString("en-IN");
  if (EN) {
    const s80 = EN.summary.find(x => x.mm === 80) || EN.summary[0];
    put("m-ensemble", `Each storm size runs as ${EN.members} members in one batched call. A member's total is the nominal total times a lognormal factor (sigma ${EN.sigma_log} in natural log) and its peak moves up to ${EN.peak_jitter_min} minutes either way, seed ${EN.seed}. For every segment and 10-minute frame the page stores the share of members over 15 cm and over 30 cm. At ${s80.mm} mm, ${s80.edges_over_15cm_nominal} segments pass 15 cm in the single run; ${s80.edges_p15_any_ge_50} have a 50% or higher chance of passing it at some time and ${s80.edges_p15_any_ge_10} a 10% or higher chance. Clean drains only, with the same spatially uniform storm shape: this stands in for radar nowcast ensembles and is not one.`);
  }
  if (RP) {
    const a = RP.accuracy, r = a.recovery;
    put("m-report", `For each of the ${RP.drains.length} candidate drains the model was run with that drain ${Math.round(RP.silt_fraction * 100)}% silted in a ${RP.storm.total_mm} mm storm, and the change in peak depth at every junction was stored. In the browser, street reports (dry, ankle, knee or waist deep) are matched by bounded least squares: one weight between 0 and 1 per drain, L1 penalty ${RP.solver.penalty.l1}, ridge ${RP.solver.penalty.ridge}, ${RP.solver.max_iter} FISTA steps. The same solve in Python gives the same weights. The updated forecast adds each drain's effect times its weight, a linear approximation: on ${a.per_scenario.length} twin scenarios it was off by ${a.superposition_mean_cm} cm on average and ${a.superposition_max_cm} cm at worst over ${a.junctions_compared} junction peaks, against ${a.no_silt_mean_cm} cm and ${a.no_silt_max_cm} cm when silt is ignored. In ${r.solves} twin solves with ${r.reports_per_solve} exact reports each, a truly silted drain filled ${(r.topk_hit_rate * 100).toFixed(1)}% of the top slots, against ${(r.topk_hit_rate_random * 100).toFixed(1)}% for a random ranking. Silt was planted in the model; no real report has been tested.`);
  }
  if (CT) {
    const c = CT.coverage, t = CT.timing, rs = CT.results;
    put("m-city", `Every piece of the GCC drain network with at least 20 junctions runs in one batch on the ${CT.storm_mm} mm storm: ${nf(c.components_run)} of ${nf(c.components_total)} pieces, ${nf(c.junctions_run)} junctions and ${nf(c.segments_run)} segments, ${t.run_wall_s.toFixed(1)} s wall clock for the 3 h storm on CPU. That covers ${c.modelled_km.toFixed(1)} of ${c.survey_km.toFixed(1)} surveyed km (${(c.modelled_share_of_survey * 100).toFixed(1)}%). Street level uses the GLO-30 tiles N12 and N13 with the same anchoring per piece. Outfalls are junctions within 60 m of an OpenStreetMap waterway; ${c.components_fallback_outfall} pieces have none and use their lowest dead end. ${nf(rs.segments_over_15cm)} segments pass 15 cm at peak and ${nf(rs.segments_over_100cm)} pass 1 m, which are 30 m DEM pooling artifacts.`);
  }
  if (EV) {
    const A = EV.headline.all_segments, St = EV.headline.stagnation_all_segments, Sp = EV.headline.measured_depth_spearman_all;
    put("m-evidence", `Three public 2015 records are joined to the site network: roads crowd-mapped as flooded (${EV.counts.flooded_2015} of ${EV.counts.segments} segments lie within 30 m of one), ${EV.counts.stagnation_points} GCC water-stagnation points within 50 m, and ${EV.counts.depth_points} measured depths. The model runs a ${EV.storm.total_mm} mm storm with the ERA5 hourly shape of the wettest ${EV.storm.hours_of_rain} h of 2015, scaled by hand. Metrics were set before scoring. The result is weak: ROC AUC ${f2(A.model.value)} (95% range ${rng(A.model.ci95)}) against the flooded roads, where 0.5 is chance, against ${f2(A.baseline_dem_depression.value)} for DEM lowness alone; ${f2(St.model.value)} against the stagnation points, below chance; Spearman ${f2(Sp.value)} against measured depths. The modelled wet spots follow the closed hollows of the 30 m DEM. 2015 flooding also had canal and river backwater, which the model leaves out, so this is a pattern test, not a depth replay.`);
    const C = EV.calibration, T = EV.headline.test_half;
    put("m-calib", `The three site-wide multipliers (runoff width, street roughness, inlet capacity) were fitted on the north half of the site and tested on the south half. The adjoint gradient with respect to these multipliers failed a finite-difference check on these long storms, so a grid search was used. ${esc(C.verdict)} South-half AUC with defaults: ${f2(T.default.value)}; DEM baseline there: ${f2(T.baseline_dem_depression.value)}. Every panel uses the default parameters.`);
  }
  if (SW) {
    const s = SW.summary, c = SW.swmm_continuity;
    put("m-swmm", `The site network is written as an ${esc(SW.swmm_engine)} model with the same rain. On a ${s.storm_mm} mm storm, small enough that the only surcharged junctions sit in closed pipe depressions, the median difference in peak flow on the ${s.busiest_drains} busiest drains is ${s.median_abs_pct_diff_peak_flow}% (Spearman ${s.spearman}), JalDrishti lower on most, and outfall volume differs by ${s.outfall_volume_diff_pct_jaldrishti_vs_swmm}%. SWMM's own routing continuity error is ${c.flow_routing_error_pct}%. A main source is JalDrishti's junction storage, which counts space below drain floors; runoff timing also differs. This compares two models, not a model with observed floods.`);
  }
  if (WH) {
    put("why-sources", WH.sources.map(x => `<li>${esc(x.name)}. <a href="${esc(x.url)}">${esc(x.url.replace(/^https?:\/\//, "").slice(0, 90))}</a></li>`).join(""));
  }
  const dirty = M.git_uncommitted_changes ? " with uncommitted changes" : "";
  document.getElementById("build").textContent =
    `Flood data built ${M.generated_utc} from commit ${M.git_commit}${dirty}.` +
    (RD ? ` Radar data built ${RD.built_utc}.` : "") + ` Page bundle built ${D.bundled_utc}.`;
})();
