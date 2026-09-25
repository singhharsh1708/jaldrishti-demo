(function (root) {
  function denseDeltas(drains, n) {
    const K = [];
    for (let i = 0; i < n; i++) K.push(new Float64Array(drains.length));
    drains.forEach((d, j) => d.delta_cm.idx.forEach((i, k) => { K[i][j] = d.delta_cm.cm[k]; }));
    return K;
  }

  function matVec(A, v) {
    return A.map(row => {
      let s = 0;
      for (let j = 0; j < v.length; j++) s += row[j] * v[j];
      return s;
    });
  }

  function matTVec(A, u, m) {
    const out = new Float64Array(m);
    A.forEach((row, i) => {
      for (let j = 0; j < m; j++) out[j] += row[j] * u[i];
    });
    return out;
  }

  function norm(v) {
    let s = 0;
    for (let j = 0; j < v.length; j++) s += v[j] * v[j];
    return Math.sqrt(s);
  }

  function stepSize(A, m, ridge, powerIter) {
    let v = new Float64Array(m).fill(1);
    let lam = 0;
    for (let it = 0; it < powerIter; it++) {
      const u = matTVec(A, matVec(A, v), m);
      lam = norm(u);
      if (lam === 0) break;
      v = u.map(x => x / lam);
    }
    return 1 / (lam + ridge + 1e-9);
  }

  function solve(A, b, m, opts) {
    const o = opts || {};
    const l1 = o.l1 !== undefined ? o.l1 : 1.0;
    const ridge = o.ridge !== undefined ? o.ridge : 0.1;
    const maxIter = o.maxIter !== undefined ? o.maxIter : 500;
    const powerIter = o.powerIter !== undefined ? o.powerIter : 50;
    const t = stepSize(A, m, ridge, powerIter);
    let w = new Float64Array(m);
    let y = new Float64Array(m);
    let k = 1;
    for (let it = 0; it < maxIter; it++) {
      const r = matVec(A, y).map((x, i) => x - b[i]);
      const g = matTVec(A, r, m);
      const wNext = new Float64Array(m);
      for (let j = 0; j < m; j++) wNext[j] = Math.min(1, Math.max(0, y[j] - t * (g[j] + l1 + ridge * y[j])));
      const kNext = 0.5 * (1 + Math.sqrt(1 + 4 * k * k));
      const c = (k - 1) / kNext;
      for (let j = 0; j < m; j++) y[j] = wNext[j] + c * (wNext[j] - w[j]);
      w = wNext;
      k = kNext;
    }
    return Array.from(w);
  }

  function optsFrom(solver) {
    return { l1: solver.penalty.l1, ridge: solver.penalty.ridge, maxIter: solver.max_iter, powerIter: solver.power_iter };
  }

  function solveReports(R, K, reports) {
    const m = R.drains.length;
    if (!reports.length) return new Array(m).fill(0);
    const A = reports.map(r => K[r.node]);
    const b = reports.map(r => r.cm - R.base_cm[r.node]);
    return solve(A, b, m, optsFrom(R.solver));
  }

  function forecast(R, K, w) {
    return R.base_cm.map((base, i) => {
      let s = base;
      for (let j = 0; j < w.length; j++) s += K[i][j] * w[j];
      return s;
    });
  }

  const api = { denseDeltas, stepSize, solve, optsFrom, solveReports, forecast };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.JDReport = api;
})(typeof window !== "undefined" ? window : globalThis);
