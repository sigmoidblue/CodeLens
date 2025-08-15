"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  hierarchy,
  treemap as d3treemap,
  HierarchyRectangularNode,
  HierarchyNode,
} from "d3-hierarchy";
import { select } from "d3-selection";
import { rgb } from "d3-color";
import { scaleOrdinal } from "d3-scale";

type TreeNode = {
  name: string;
  loc?: number;
  children?: TreeNode[];
};

export default function Treemap({ data }: { data: TreeNode }) {
  // zoom state
  const [focus, setFocus] = useState<TreeNode>(data);
  const [crumbs, setCrumbs] = useState<TreeNode[]>([]); // ancestors stack for "Up"

  // redraw when the prop data changes ie-new scan -> reset zoom
  useEffect(() => {
    setFocus(data);
    setCrumbs([]);
  }, [data]);

  return (
    <div className="space-y-2">
      {/* breadcrumbs / up button */}
      <div className="flex items-center gap-2 text-xs text-slate-300">
        <button
          className="px-2 py-1 rounded border border-slate-700 hover:border-slate-500 disabled:opacity-50"
          onClick={() => {
            if (crumbs.length === 0) return;
            const next = [...crumbs];
            const parent = next.pop()!;
            setCrumbs(next);
            setFocus(parent);
          }}
          disabled={crumbs.length === 0}
          title="Go up"
        >
          ← Up
        </button>
        <span className="opacity-70">
          {["root", ...crumbs.map((c) => c.name), focus.name].join(" / ")}
        </span>
        <Legend />
      </div>

      <TreemapCanvas
        data={focus}
        onOpenFolder={(folder) => {
          setCrumbs((prev) => [...prev, focus]);
          setFocus(folder);
        }}
      />
    </div>
  );
}

// treemap canvas with D3
function TreemapCanvas({
  data,
  onOpenFolder,
}: {
  data: TreeNode;
  onOpenFolder: (folder: TreeNode) => void;
}) {
  const svgRef = useRef<SVGSVGElement | null>(null);

  // files that should be down‑weighted (kept tiny but visible)
  const DOWNWEIGHT = useMemo(
    () => new Set(["package-lock.json", "yarn.lock", "pnpm-lock.yaml"]),
    []
  );
  const DOWNWEIGHT_FACTOR = 0.02;

  // color by file type (folders = gray)
  const typeColor = useMemo(() => {
    const map = new Map<string, string>([
      ["js", "#facc15"],
      ["jsx", "#f59e0b"],
      ["ts", "#38bdf8"],
      ["tsx", "#0ea5e9"],
      ["py", "#60a5fa"],
      ["rb", "#f43f5e"],
      ["go", "#22d3ee"],
      ["rs", "#f97316"],
      ["java", "#ef4444"],
      ["c", "#a78bfa"],
      ["cpp", "#8b5cf6"],
      ["cs", "#c084fc"],
      ["css", "#a855f7"],
      ["scss", "#d946ef"],
      ["html", "#f87171"],
      ["json", "#14b8a6"],
      ["md", "#94a3b8"],
      ["yml", "#10b981"],
      ["yaml", "#10b981"],
      ["lock", "#64748b"],
      ["txt", "#9ca3af"],
    ]);

    const get = (ext: string | null, isFolder: boolean) => {
      if (isFolder) return "#475569";
      if (!ext) return "#94a3b8";
      return map.get(ext) ?? "#94a3b8";
    };

    return { get };
  }, []);

  // tiny helper
  const extOf = (name: string): string | null => {
    const i = name.lastIndexOf(".");
    if (i < 0) return null;
    return name.slice(i + 1).toLowerCase();
  };

  useEffect(() => {
    if (!data || !svgRef.current) return;

    const width = 960;
    const height = 520;

    // build hierarchy for the current focus only ie-zoom level
    // sum uses downweighted size for lock files
    const root = hierarchy<TreeNode>(data)
      .sum((d) => {
        const base = d.loc ?? 0;
        return DOWNWEIGHT.has(d.name.toLowerCase()) ? base * DOWNWEIGHT_FACTOR : base;
      })
      .sort((a, b) => (b.value ?? 0) - (a.value ?? 0));

    // Treemap layout
    const layout = d3treemap<TreeNode>().size([width, height]).paddingInner(2);
    layout(root);

    // only immediate children at this zoom level.
    const nodes = (root.children ?? []) as HierarchyRectangularNode<TreeNode>[];

    const svg = select(svgRef.current);
    svg.selectAll("*").remove();
    svg.attr("viewBox", `0 0 ${width} ${height}`).style("font", "11px system-ui, sans-serif");

    const g = svg.append("g");

    // draw tiles
    const tile = g
      .selectAll<SVGGElement, HierarchyRectangularNode<TreeNode>>("g")
      .data(nodes, (d: any) => d.data.name)
      .enter()
      .append("g")
      .attr("transform", (d) => `translate(${d.x0},${d.y0})`)
      .style("cursor", (d) => ((d.children?.length ?? 0) > 0 ? "pointer" : "default"))
      .on("click", (e, d) => {
        if ((d.children?.length ?? 0) > 0) onOpenFolder(d.data);
      });

    tile
      .append("rect")
      .attr("width", (d) => Math.max(0, d.x1 - d.x0))
      .attr("height", (d) => Math.max(0, d.y1 - d.y0))
      .attr("rx", 4)
      .attr("ry", 4)
      .attr("fill", (d) => typeColor.get(extOf(d.data.name), !!d.children))
      .attr("fill-opacity", 0.85)
      .attr("stroke", "rgba(0,0,0,0.35)")
      .attr("stroke-width", 0.6);

    // full path + LOC (original + weighted if downweighted)
    tile
      .append("title")
      .text((d) => {
        const path = d.ancestors().map((a) => a.data.name).reverse().join("/");
        const weighted = d.value ?? 0;
        const original = d.data.loc ?? 0;
        const isDown = DOWNWEIGHT.has(d.data.name.toLowerCase());
        const tag = isDown ? ` (down-weighted x${DOWNWEIGHT_FACTOR})` : "";
        return `${path}\n${original} LOC\nsize used: ${weighted.toFixed(0)}${tag}`;
      });

    // smart labels (auto contrast + hide if too small)
    const MIN_W = 70;
    const MIN_H = 18;

    tile
      .append("text")
      .attr("x", 8)
      .attr("y", 14)
      .text((d) => {
        const w = d.x1 - d.x0;
        const h = d.y1 - d.y0;
        return w >= MIN_W && h >= MIN_H ? d.data.name : "";
      })
      .attr("font-weight", 600)
      .attr("font-size", "11px")
      .attr("fill", function (d) {
        // auto contrast against background color
        const bg = typeColor.get(extOf(d.data.name), !!d.children);
        const c = rgb(bg);
        const brightness = (c.r * 299 + c.g * 587 + c.b * 114) / 1000;
        return brightness > 140 ? "#0b1220" : "#ffffff";
      });
  }, [data, DOWNWEIGHT, typeColor]);

  return <svg ref={svgRef} className="w-full h-auto" />;
}

function Legend() {
  const items: Array<[string, string]> = [
    ["JS/TS", "#f59e0b"],
    ["TS/TSX", "#0ea5e9"],
    ["Python", "#60a5fa"],
    ["CSS/SCSS", "#a855f7"],
    ["JSON", "#14b8a6"],
    ["Markdown", "#94a3b8"],
    ["Folders", "#475569"],
  ];
  return (
    <div className="ml-auto flex flex-wrap items-center gap-2">
      {items.map(([label, color]) => (
        <span key={label} className="inline-flex items-center gap-1 text-[10px] text-slate-400">
          <span className="inline-block w-3 h-3 rounded" style={{ background: color }} />
          {label}
        </span>
      ))}
    </div>
  );
}
