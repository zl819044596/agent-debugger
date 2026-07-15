# Topology Diagram — Technology Selection Document

**Date:** 2026-07-15
**Task:** t_d97d805b (消化调研方案并确定拓扑图技术选型)
**Upstream:** T1 Guanlan Research (`d3-research-findings.md`)
**Status:** ✅ Selection complete

---

## 1. Project Context

| Dimension | Value |
|-----------|-------|
| Frontend framework | Astro v7 (static output) |
| Styling | TailwindCSS v4 |
| SPA framework | **None** (vanilla JS inline in `.astro`) |
| TypeScript | Enabled (strict) |
| Existing libs | None for visualization |
| API endpoint | `../../api/topology/:project_id` |
| Expected node scale | 10–1000 agents |
| Interaction requirements | Drag nodes, zoom/pan, click for details, Traces linkage |
| Edge types | `handoff`, `parent-child` (directional) |

---

## 2. Alternatives Evaluation

### 2.1 G6 (AntV) — `@antv/g6`

| Criterion | Rating | Notes |
|-----------|--------|-------|
| Force layout | ✅ Good | Built-in force, Fruchterman, circular, dagre layouts |
| SVG+Canvas | ✅ Built-in | Dual renderer with auto-switch |
| Interaction | ✅ Built-in | Drag, zoom, click, hover all built-in |
| Bundle size | ❌ ~500KB+ | Heavy for a static Astro site |
| Chinese ecosystem | ⚠️ | Docs primarily Chinese, community in Chinese |
| Framework dependency | ⚠️ | Best with React/Vue; vanilla JS integration is possible but awkward |
| **Verdict** | ❌ Not selected | Overweight, opinionated API, not a natural fit for the vanilla JS codebase |

### 2.2 Apache ECharts

| Criterion | Rating | Notes |
|-----------|--------|-------|
| Force layout | ⚠️ Basic | Graph series has force layout but limited configuration |
| Interaction | ⚠️ Limited | Drag not well supported; zoom/pan yes but no node-by-node control |
| Customization | ❌ | Hard to customize node rendering for domain-specific needs |
| Bundle size | ⚠️ ~400KB+ | Even with tree-shaking, significant overhead |
| Framework fit | ✅ Good | Vanilla JS friendly, works with any framework |
| **Verdict** | ❌ Not selected | Not designed for interactive topology exploration; better for static chart dashboards |

### 2.3 React Flow (`@xyflow/react`)

| Criterion | Rating | Notes |
|-----------|--------|-------|
| Drag & drop | ✅ Excellent | Best-in-class for node dragging |
| Force layout | ❌ | No force-directed layout built-in — must integrate d3-force separately |
| Framework dependency | ❌ **Requires React** | Would add React + ReactDOM (~130KB) just for this component |
| Bundle size | ❌ Large | React + React Flow = ~200KB+ minified |
| Astro integration | ⚠️ Possible | Astro can embed React islands, but adds complexity |
| **Verdict** | ❌ Not selected | Architectural mismatch — project has zero React dependency |

### 2.4 D3.js v7.9.0 (Selected) ✅

| Criterion | Rating | Notes |
|-----------|--------|-------|
| Force layout | ✅ **Best-in-class** | `d3-force` — velocity Verlet integrator, Barnes-Hut O(N log N), 1000-node sim converges in ~1-2s |
| SVG renderer | ✅ | Best DX for < 500 nodes, native DOM events, CSS styling, tooltips |
| Canvas renderer | ✅ | Supports 5,000+ nodes at 60fps for scaling up |
| Dual renderer | ✅ Possible | Same d3-force simulation can feed both SVG and Canvas |
| Interaction | ✅ | `d3-drag`, `d3-zoom` — built-in, battle-tested |
| Bundle size | ✅ **Modular** | Import only what you need: `d3-force` + `d3-drag` + `d3-zoom` + `d3-selection` + `d3-shape` + `d3-scale` = ~80KB gzipped |
| Framework fit | ✅ **Perfect** | Vanilla JS native — mounts into a DOM container, no framework needed |
| Maturity | ✅ **113k stars** | Active since 2011, maintained by Observable Inc, will not be abandoned |
| **Verdict** | ✅ **SELECTED** | Perfect match for the vanilla JS SPA architecture; modular, mature, flexible |

---

## 3. Selection: D3.js v7.9.0

### 3.1 Why D3 Wins

1. **Architecture fit** — The Dashboard is already a vanilla JS SPA (inline script in `app/index.astro`). D3 integrates natively with zero framework overhead, matching the existing code pattern exactly.

2. **Modular imports** — D3 is fully modular. We import only the specific modules needed, keeping the bundle lean:

   ```
   d3-force        → force-directed layout
   d3-drag         → node dragging
   d3-zoom         → pan/zoom
   d3-selection    → DOM mounting & event handling
   d3-shape        → edge path drawing (curves, arrows)
   d3-scale        → color/size mapping for agent states
   ```

3. **SVG-first, Canvas-ready** — Start with SVG (simpler, better DX). If scale grows beyond 500 nodes, switch to Canvas using the same d3-force simulation. The T1 research confirms this dual-renderer path works.

4. **Full visual control** — Agent state → color, type → shape, activity → radius, communication frequency → edge thickness, direction → arrows. Every visual variable is under direct control.

### 3.2 Version

- **Library:** `d3` (and individual sub-modules)
- **Version:** **7.9.0** (latest stable as of 2026)
- **npm packages:**
  - `d3-force@3` — standalone force simulation
  - `d3-drag@3` — drag behavior
  - `d3-zoom@3` — zoom/pan behavior  
  - `d3-selection@3` — DOM manipulation
  - `d3-shape@3` — edge curve/path drawing
  - `d3-scale@4` — color/size scales
  - `d3-scale-chromatic@3` — color schemes

  OR import the full `d3@7` for simplicity during development.

### 3.3 Key Configuration Approach

#### Installation
```bash
npm install d3@7
# Or modular:
npm install d3-force@3 d3-drag@3 d3-zoom@3 d3-selection@3 d3-shape@3 d3-scale@4 d3-scale-chromatic@3
```

#### Architecture Overview

```
Topology Component
├── Data Layer
│   ├── fetch(`../../api/topology/${projectId}`)
│   ├── Map response → { nodes: [...], links: [...] }
│   └── Handle loading / empty / error states
├── Layout Engine (d3-force)
│   ├── forceSimulation(nodes)
│   ├── forceLink(edges) — spring attraction
│   ├── forceManyBody() — charge repulsion (Barnes-Hut)
│   ├── forceCenter(width/2, height/2) — centering
│   ├── forceCollide(radius) — overlap prevention
│   └── alpha(0.3).restart() — re-heat on data change
├── Renderer (SVG)
│   ├── <svg> with viewBox and g.zoom transform
│   ├── <g class="links"> — <line> or <path> elements
│   │   ├── stroke-width → edge weight
│   │   ├── stroke-dasharray → relationship type
│   │   └── <marker> defs → directional arrows
│   ├── <g class="nodes"> — <circle> + <text> elements
│   │   ├── fill → agent state color
│   │   ├── r → activity/importance
│   │   └── title → tooltip text
│   └── update pattern: data join → enter/update/exit
├── Interaction Layer
│   ├── d3.drag() — node dragging (fx/fy freeze)
│   ├── d3.zoom() — canvas pan/zoom (g transform)
│   ├── click → show agent detail panel
│   ├── hover → tooltip overlay
│   └── dblclick → navigate to Trace Timeline
└── Dashboard Integration
    ├── Mount to #topology-container div
    ├── React to project_id changes (re-fetch + re-simulate)
    └── ResizeObserver for container resize
```

#### SVG Renderer (for < 500 nodes — expected scale)

```javascript
// Core pattern
const svg = d3.select('#topology-container')
  .append('svg')
  .attr('width', containerWidth)
  .attr('height', containerHeight);

const g = svg.append('g'); // zoom/pan target

// Zoom behavior
svg.call(d3.zoom()
  .scaleExtent([0.1, 4])
  .on('zoom', (event) => g.attr('transform', event.transform)));

// Force simulation
const simulation = d3.forceSimulation(nodes)
  .force('link', d3.forceLink(links).id(d => d.id))
  .force('charge', d3.forceManyBody().strength(-300))
  .force('center', d3.forceCenter(width / 2, height / 2))
  .force('collide', d3.forceCollide(30))
  .on('tick', ticked);

// Data join — enter/update/exit
function ticked() {
  link.attr('x1', d => d.source.x).attr('y1', d => d.source.y)
      .attr('x2', d => d.target.x).attr('y2', d => d.target.y);
  node.attr('cx', d => d.x).attr('cy', d => d.y);
}
```

#### Canvas Renderer (if scale > 500 nodes)

Switch by replacing the tick handler with Canvas drawing:

```javascript
const ctx = canvas.getContext('2d');
simulation.on('tick', () => {
  ctx.clearRect(0, 0, width, height);
  links.forEach(drawEdge);   // ctx.beginPath → moveTo/lineTo
  nodes.forEach(drawNode);   // ctx.arc → fill/stroke
});

// Hit testing via d3-quadtree
const tree = d3.quadtree(nodes, d => d.x, d => d.y);
function findNode(x, y) {
  return tree.find(x, y, hitRadius);
}
```

#### Edge Rendering (Directional)

```javascript
// SVG: marker defs for arrows
svg.append('defs').append('marker')
  .attr('id', 'arrow')
  .attr('viewBox', '0 -5 10 10')
  .attr('refX', 20).attr('refY', 0)
  .attr('markerWidth', 8).attr('markerHeight', 8)
  .attr('orient', 'auto')
  .append('path').attr('d', 'M0,-5L10,0L0,5').attr('fill', '#6366f1');

// Apply to edges
link.attr('marker-end', 'url(#arrow)');

// Edge styles by relationship type
link.attr('stroke', d => d.type === 'handoff' ? '#a855f7' : '#6366f1')
  .attr('stroke-dasharray', d => d.type === 'parent-child' ? '4,4' : 'none');
```

### 3.4 Integration Plan with Dashboard

#### Phase 1: Setup & Basic Rendering (1 day)

| Step | Description |
|------|-------------|
| 1.1 | `npm install d3@7` |
| 1.2 | Add a new `<div id="topology-tab">` to Dashboard, create tab navigation |
| 1.3 | Create `renderTopology(container, projectId)` function |
| 1.4 | Implement data fetch + loading/empty/error states |
| 1.5 | Implement basic SVG force-directed graph with sample data |
| **Gate** | ✅ Nodes and edges render correctly in force layout |

#### Phase 2: Interaction (1 day)

| Step | Description |
|------|-------------|
| 2.1 | Add `d3.drag()` — nodes follow mouse, position persisted via `fx`/`fy` |
| 2.2 | Add `d3.zoom()` — mouse wheel zoom, click-drag background to pan |
| 2.3 | Add click → open detail panel (Agent name, status, metrics) |
| 2.4 | Add hover → tooltip (node name, type) |
| 2.5 | Style edges by relationship type (handoff vs parent-child) + directional arrows |
| **Gate** | ✅ Users can drag nodes, zoom, pan, and click to see details |

#### Phase 3: Traces Linkage (0.5 day)

| Step | Description |
|------|-------------|
| 3.1 | Add "View Traces" button in detail panel |
| 3.2 | Route: `window.location.href = /app?trace_id=${agentTraceId}` |
| 3.3 | Or: open trace sidebar within the topology tab |
| **Gate** | ✅ Clicking a node can navigate to its Trace Timeline |

#### Phase 4: Real-time & Polish (0.5 day)

| Step | Description |
|------|-------------|
| 4.1 | Listen for project_id changes (re-fetch + re-simulate) |
| 4.2 | Optional: auto-refresh via polling or WebSocket |
| 4.3 | ResizeObserver for container resize |
| 4.4 | Follow-up: Canvas dual renderer if scale demands it |
| **Gate** | ✅ Full integration with Dashboard |

#### Total Estimate: **3 days**

---

## 4. Rejected Alternatives — Summary

| Library | Reason for Rejection |
|---------|---------------------|
| **G6 (AntV)** | Heavy (~500KB), Chinese-dominant ecosystem, awkward with vanilla JS, opinionated design |
| **ECharts** | Not designed for interactive topology; graph layout is basic, no drag support |
| **React Flow** | Requires React — architectural mismatch with the vanilla JS SPA |
| **Sigma.js** | Strong alternative but WebGL is overkill for the expected 10-1000 agent scale; adds a new library when D3 already covers the need |
| **VivaGraphJS** | Unmaintained |
| **3D (ThreeJS / 3d-force-graph)** | Unnecessary for agent topology — 3D adds cognitive load without benefit |

---

## 5. Risk & Mitigation

| Risk | Mitigation |
|------|-----------|
| D3 learning curve for team | Start with SVG (simpler). d3-force API is only ~5 function calls. Observable notebooks provide ready reference. |
| SVG performance at 800+ nodes | Monitor node count. Ready Canvas renderer in Phase 4. Can switch renderer without changing the simulation. |
| Data model mismatch | The `topology/:project_id` API returns `{nodes, links}` — matches D3's expected format. Minor mapping needed. |
| Large bundle | Use modular D3 imports (`d3-force` instead of full `d3`). Current estimated footprint: ~80KB gzipped. |

---

## 6. Decision Record

```
Date:       2026-07-15
Decision:   Use D3.js v7.9.0 for topology visualization
Rationale:  Best framework fit (vanilla JS), best-in-class force layout,
            modular imports, SVG→Canvas dual renderer path, mature ecosystem.
Alternatives evaluated: G6, ECharts, React Flow, sigma.js, VivaGraphJS
Selected:   D3.js v7.9.0
Downstream: t_4f50c141 (implement basic topology rendering component)
            t_d29b4107 (integrate backend topology API)
```
