"use client";
import { useEffect, useMemo, useRef } from "react";
import cytoscape, { Core, ElementDefinition } from "cytoscape";

export type GraphData = {
  nodes: { id: string }[];
  edges: { source: string; target: string }[];
  note?: string;
};

/** helpers */
function basename(p: string) {
  const b = p.split("/").pop() || p;
  return b.length ? b : p;
}
function extOf(p: string) {
  const b = basename(p);
  const i = b.lastIndexOf(".");
  return i >= 0 ? b.slice(i + 1).toLowerCase() : "";
}
function extClass(ext: string) {
  if (ext === "ts" || ext === "tsx") return "ext-ts";
  if (ext === "js" || ext === "jsx" || ext === "mjs" || ext === "cjs") return "ext-js";
  if (ext === "py") return "ext-py";
  if (ext === "json") return "ext-json";
  if (ext === "md") return "ext-md";
  if (ext === "css" || ext === "scss") return "ext-css";
  return "ext-other";
}

export default function GraphView({ data }: { data: GraphData }) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const cyRef = useRef<Core | null>(null);

  // precompute degree to size nodes
  const degree = useMemo(() => {
    const out: Record<string, number> = {};
    const inc = (k: string) => (out[k] = (out[k] || 0) + 1);
    for (const e of data.edges) {
      inc(e.source);
      inc(e.target);
    }
    return out;
  }, [data]);

  const elements = useMemo<ElementDefinition[]>(() => {
    const es: ElementDefinition[] = [];

    for (const n of data.nodes) {
      const short = basename(n.id);
      const ext = extOf(n.id);
      const klass = extClass(ext);
      const deg = degree[n.id] || 0;

      // size: 10..28 px based on degree (log‑ish)
      const size = Math.min(28, 10 + Math.round(Math.sqrt(deg) * 5));
      es.push({
        data: {
          id: n.id,
          label: short,      // short label for readability
          full: n.id,        // keep full path for future tooltip/etc.
          size,
        },
        classes: klass,
      });
    }

    for (const e of data.edges) {
      es.push({
        data: { id: `${e.source}->${e.target}`, source: e.source, target: e.target },
      });
    }
    return es;
  }, [data, degree]);

  useEffect(() => {
    if (!containerRef.current) return;
    if (cyRef.current) {
      cyRef.current.destroy();
      cyRef.current = null;
    }

    // highlighted style as any (TS doesn't know shadow-*)
    const highlightedStyle: any = {
      "background-color": "#22d3ee",
      "line-color": "#22d3ee",
      "target-arrow-color": "#22d3ee",
      "text-outline-color": "#06121a",
      "shadow-blur": 18,
      "shadow-color": "#22d3ee",
      "shadow-opacity": 0.6,
      "transition-duration": 0.15,
      "transition-property":
        "background-color, line-color, target-arrow-color, shadow-blur, shadow-opacity",
    };

    const cy = cytoscape({
      container: containerRef.current,
      elements,
      style: [
        // base nodes
        {
          selector: "node",
          style: {
            "background-color": "#60a5fa", // default sky-400
            label: "data(label)",
            "font-size": 9,
            "min-zoomed-font-size": 8,         // labels appear when zoomed in a bit
            "text-wrap": "wrap",
            "text-max-width": 120,
            "text-valign": "center",
            "text-halign": "center",
            color: "#e5f2ff",
            "text-outline-width": 2,
            "text-outline-color": "#0b1220",   // contrast outline on dark
            width: "data(size)",
            height: "data(size)",
            "overlay-padding": 2,
            "overlay-opacity": 0,
          },
        },
        // filetype colors
        { selector: ".ext-ts",   style: { "background-color": "#22d3ee" } }, // cyan
        { selector: ".ext-js",   style: { "background-color": "#f59e0b" } }, // amber
        { selector: ".ext-py",   style: { "background-color": "#34d399" } }, // emerald
        { selector: ".ext-json", style: { "background-color": "#a78bfa" } }, // violet
        { selector: ".ext-md",   style: { "background-color": "#94a3b8" } }, // slate-400
        { selector: ".ext-css",  style: { "background-color": "#38bdf8" } }, // sky-400
        { selector: ".ext-other",style: { "background-color": "#64748b" } }, // slate-500

        // edges
        {
          selector: "edge",
          style: {
            "curve-style": "bezier",
            width: 1,
            "line-color": "#64748b",
            "target-arrow-color": "#64748b",
            "target-arrow-shape": "triangle",
            "arrow-scale": 0.8,
            "opacity": 0.9,
          },
        },

        // neon highlight neighborhood
        { selector: ".highlighted", style: highlightedStyle },
        // dim others on hover
        { selector: ".dim", style: { opacity: 0.16 } },
      ],

      layout: {
        name: "cose",
        idealEdgeLength: 90,
        nodeRepulsion: 5000,
        gravity: 1.0,
        numIter: 2500,
        componentSpacing: 120,
        nodeOverlap: 10,
        padding: 30,
        animate: false,
      } as any,

      minZoom: 0.1,
      maxZoom: 3,
      wheelSensitivity: 0.25,
      pixelRatio: 1,
    });

    // hover → highlight local neighborhood
    cy.on("mouseover", "node", (evt) => {
      const node = evt.target;
      const neighborhood = node.closedNeighborhood();
      cy.elements().addClass("dim");
      neighborhood.removeClass("dim").addClass("highlighted");
    });

    // leave → clear
    cy.on("mouseout", "node", () => cy.elements().removeClass("dim highlighted"));

    // tap background → clear
    cy.on("tap", (evt) => {
      if (evt.target === cy) cy.elements().removeClass("dim highlighted");
    });

    // tap node → center & zoom a bit
    cy.on("tap", "node", (evt) => {
      const n = evt.target;
      cy.animate({ center: { eles: n }, zoom: Math.min(1.5, Math.max(0.9, cy.zoom() * 1.15)) }, { duration: 150 });
    });

    // initial fit + keep fitting on container resize
    cy.ready(() => cy.fit(undefined, 50));
    const ro = new ResizeObserver(() => {
      cy.resize();
      cy.fit(undefined, 50);
    });
    if (containerRef.current) ro.observe(containerRef.current);

    cyRef.current = cy;
    return () => {
      ro.disconnect();
      cy.destroy();
      cyRef.current = null;
    };
  }, [elements]);

  return (
    <div className="w-full">
      {/* tiny legend */}
      <div className="mb-2 flex flex-wrap items-center gap-2 text-xs text-slate-300/80">
        <span className="inline-flex items-center gap-1">
          <span className="inline-block h-2 w-2 rounded-full bg-[#22d3ee]" /> TS/TSX
        </span>
        <span className="inline-flex items-center gap-1">
          <span className="inline-block h-2 w-2 rounded-full bg-[#f59e0b]" /> JS/JSX
        </span>
        <span className="inline-flex items-center gap-1">
          <span className="inline-block h-2 w-2 rounded-full bg-[#34d399]" /> Python
        </span>
        <span className="inline-flex items-center gap-1">
          <span className="inline-block h-2 w-2 rounded-full bg-[#a78bfa]" /> JSON
        </span>
        <span className="inline-flex items-center gap-1">
          <span className="inline-block h-2 w-2 rounded-full bg-[#94a3b8]" /> Markdown
        </span>
      </div>

      <div className="h-[520px] rounded-xl border border-slate-800 bg-slate-900/50">
        <div ref={containerRef} className="w-full h-full" />
      </div>
    </div>
  );
}
