"use client";
import { useEffect, useMemo, useRef } from "react";
import cytoscape, { Core, ElementDefinition } from "cytoscape";

export type GraphData = {
  nodes: { id: string }[];
  edges: { source: string; target: string }[];
  note?: string;
};

export default function GraphView({ data }: { data: GraphData }) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const cyRef = useRef<Core | null>(null);

  const elements = useMemo<ElementDefinition[]>(() => {
    const es: ElementDefinition[] = [];
    for (const n of data.nodes) es.push({ data: { id: n.id, label: n.id } });
    for (const e of data.edges) es.push({ data: { id: `${e.source}->${e.target}`, source: e.source, target: e.target } });
    return es;
  }, [data]);

  useEffect(() => {
    if (!containerRef.current) return;
    if (cyRef.current) { cyRef.current.destroy(); cyRef.current = null; }

    const cy = cytoscape({
      container: containerRef.current,
      elements,
      style: [
        { selector: "node", style: {
            "background-color": "#60a5fa",
            "label": "data(label)",
            "font-size": 8,
            "text-wrap": "ellipsis",
            "text-max-width": "160",
            "text-valign": "center",
            "text-halign": "center",
            "color": "#0b1220",
            "width": "10px",
            "height": "10px",
        }},
        { selector: "edge", style: {
            "curve-style": "bezier",
            "width": 1,
            "line-color": "#64748b",
            "target-arrow-color": "#64748b",
            "target-arrow-shape": "triangle",
            "arrow-scale": 0.8,
        }},
        { selector: ".highlighted", style: {
            "background-color": "#22d3ee",
            "line-color": "#22d3ee",
            "target-arrow-color": "#22d3ee",
            "transition-duration": 0.15,
            "transition-property": "background-color, line-color, target-arrow-color",
        }},
        { selector: ".dim", style: { "opacity": 0.16 } },
      ],
      layout: {
        name: "cose",
        idealEdgeLength: 80,
        nodeRepulsion: 4000,
        gravity: 1.0,
        numIter: 2500,
        animate: false,
      } as any,
      wheelSensitivity: 0.25,
    });

    cy.on("mouseover", "node", (evt) => {
      const node = evt.target;
      const neighborhood = node.closedNeighborhood();
      cy.elements().addClass("dim");
      neighborhood.removeClass("dim").addClass("highlighted");
    });
    cy.on("mouseout", "node", () => cy.elements().removeClass("dim highlighted"));
    cy.on("tap", (evt) => { if (evt.target === cy) cy.elements().removeClass("dim highlighted"); });
    cy.ready(() => cy.fit(undefined, 40));

    cyRef.current = cy;
    return () => { cy.destroy(); cyRef.current = null; };
  }, [elements]);

  return (
    <div className="w-full h-[520px] rounded-xl border border-slate-800 bg-slate-900/50">
      <div ref={containerRef} className="w-full h-full" />
    </div>
  );
}
