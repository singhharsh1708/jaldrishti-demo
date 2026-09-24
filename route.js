(function (root) {
  const CAP_KMH = 40;
  const CLOSED_CM = 30;
  const FLOOR_KMH = 2;
  const LENGTH_STEP_M = 0.1;

  function speedKmh(depthCm) {
    const w = Math.max(0, depthCm) * 10;
    return Math.min(CAP_KMH, 0.0009 * w * w - 0.5529 * w + 86.9448);
  }

  function isClosed(depthCm) {
    return depthCm >= CLOSED_CM;
  }

  function travelSeconds(lengthM, depthCm) {
    return lengthM / (speedKmh(Math.min(depthCm, CLOSED_CM)) / 3.6);
  }

  function penaltyPerM(net) {
    return (net.edges.reduce((a, e) => a + e.length_m, 0) / (FLOOR_KMH / 3.6) + 1) / LENGTH_STEP_M;
  }

  function buildGraph(net) {
    const adj = net.nodes.map(() => []);
    net.edges.forEach(e => {
      adj[e.u].push([e.v, e.id]);
      adj[e.v].push([e.u, e.id]);
    });
    return adj;
  }

  function heapPush(h, item) {
    h.push(item);
    let i = h.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (less(h[p], h[i])) break;
      [h[p], h[i]] = [h[i], h[p]];
      i = p;
    }
  }

  function heapPop(h) {
    const top = h[0];
    const last = h.pop();
    if (h.length) {
      h[0] = last;
      let i = 0;
      for (;;) {
        const l = 2 * i + 1, r = l + 1;
        let m = i;
        if (l < h.length && less(h[l], h[m])) m = l;
        if (r < h.length && less(h[r], h[m])) m = r;
        if (m === i) break;
        [h[m], h[i]] = [h[i], h[m]];
        i = m;
      }
    }
    return top;
  }

  function less(a, b) {
    return a[0] < b[0] || (a[0] === b[0] && a[1] < b[1]);
  }

  function dijkstra(adj, cost, from, to) {
    const dist = new Float64Array(adj.length).fill(Infinity);
    const prevEdge = new Int32Array(adj.length).fill(-1);
    const prevNode = new Int32Array(adj.length).fill(-1);
    const done = new Uint8Array(adj.length);
    const heap = [];
    dist[from] = 0;
    heapPush(heap, [0, from]);
    while (heap.length) {
      const [d, n] = heapPop(heap);
      if (done[n]) continue;
      done[n] = 1;
      if (n === to) break;
      for (const [m, e] of adj[n]) {
        const nd = d + cost[e];
        if (nd < dist[m]) {
          dist[m] = nd;
          prevEdge[m] = e;
          prevNode[m] = n;
          heapPush(heap, [nd, m]);
        }
      }
    }
    if (!Number.isFinite(dist[to])) return null;
    const nodes = [to], edges = [];
    for (let n = to; n !== from; n = prevNode[n]) {
      edges.push(prevEdge[n]);
      nodes.push(prevNode[n]);
    }
    return { nodes: nodes.reverse(), edges: edges.reverse(), cost: dist[to] };
  }

  function minimaxDepth(adj, depths, from, to) {
    const best = new Float64Array(adj.length).fill(Infinity);
    const done = new Uint8Array(adj.length);
    const heap = [];
    best[from] = 0;
    heapPush(heap, [0, from]);
    while (heap.length) {
      const [d, n] = heapPop(heap);
      if (done[n]) continue;
      done[n] = 1;
      if (n === to) return d;
      for (const [m, e] of adj[n]) {
        const nd = Math.max(d, depths[e]);
        if (nd < best[m]) {
          best[m] = nd;
          heapPush(heap, [nd, m]);
        }
      }
    }
    return Infinity;
  }

  function summarize(net, depths, path) {
    if (!path) return null;
    let length = 0, openSeconds = 0, closed = 0, closedLength = 0, maxDepth = 0;
    const closedEdges = [];
    path.edges.forEach(id => {
      const e = net.edges[id], d = depths[id];
      length += e.length_m;
      maxDepth = Math.max(maxDepth, d);
      if (isClosed(d)) {
        closed += 1;
        closedLength += e.length_m;
        closedEdges.push(id);
      } else {
        openSeconds += travelSeconds(e.length_m, d);
      }
    });
    return {
      nodes: path.nodes, edges: path.edges, length_m: length, closed, closed_edges: closedEdges,
      closed_length_m: closedLength, max_depth_cm: maxDepth,
      flood_time_s: closed ? null : openSeconds, open_time_s: openSeconds,
      dry_time_s: length / (CAP_KMH / 3.6)
    };
  }

  function route(net, depths, from, to, adj) {
    const graph = adj || buildGraph(net);
    const byDistance = net.edges.map(e => e.length_m);
    const perM = penaltyPerM(net);
    const byFlood = net.edges.map(e => travelSeconds(e.length_m, depths[e.id]) + (isClosed(depths[e.id]) ? perM * e.length_m : 0));
    let safe = dijkstra(graph, byFlood, from, to);
    let depthCap = null;
    if (safe && safe.edges.some(id => isClosed(depths[id]))) {
      depthCap = minimaxDepth(graph, depths, from, to);
      safe = dijkstra(graph, byFlood.map((c, id) => (depths[id] > depthCap ? Infinity : c)), from, to);
    }
    return {
      from, to, openRoute: depthCap === null, depthCap,
      shortest: summarize(net, depths, dijkstra(graph, byDistance, from, to)),
      safe: summarize(net, depths, safe)
    };
  }

  const api = { CAP_KMH, CLOSED_CM, FLOOR_KMH, LENGTH_STEP_M, penaltyPerM, speedKmh, isClosed, travelSeconds, buildGraph, dijkstra, minimaxDepth, summarize, route };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.JDRoute = api;
})(typeof window !== "undefined" ? window : globalThis);
