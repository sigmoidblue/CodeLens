"use client";
import { useEffect, useState } from "react";
import Treemap from "../components/Treemap";
import GraphView, { GraphData } from "../components/GraphView";
import HealthPanel from "../components/HealthPanel";
import TourPanel from "../components/TourPanel";

type ScanResponse = {
  scan_id: string;
  owner: string;
  repo: string;
  repo_url: string;
  created_at: number;
  files_scanned: number;
  total_loc: number;
  limits: { max_bytes: number; max_files: number };
  status?: string;
};

type TreeNode = {
  name: string;
  loc?: number;
  children?: TreeNode[];
};

type HealthData = {
  full_name: string;
  html_url: string;
  description: string | null;
  stars: number;
  forks: number;
  open_issues: number;
  license: string | null;
  pushed_at: string | null;
  default_branch: string | null;
};

type TourData = {
  header: {
    owner: string;
    repo: string;
    repo_url: string;
    files_scanned: number;
    total_loc: number;
  };
  sections: { title: string; bullets: string[] }[];
  note?: string;
};

export default function Home() {
  const [repoUrl, setRepoUrl] = useState<string>("");
  const [loading, setLoading] = useState<boolean>(false);
  const [result, setResult] = useState<ScanResponse | null>(null);
  const [error, setError] = useState<string>("");
  const [showRaw, setShowRaw] = useState(false);

  // tabs
  const [activeTab, setActiveTab] = useState<"Tree" | "Graph" | "Health" | "Tour">("Tree");

  // Tree
  const [treeLoading, setTreeLoading] = useState<boolean>(false);
  const [treeError, setTreeError] = useState<string>("");
  const [treeData, setTreeData] = useState<TreeNode | null>(null);

  // Graph
  const [graphLoading, setGraphLoading] = useState<boolean>(false);
  const [graphError, setGraphError] = useState<string>("");
  const [graphData, setGraphData] = useState<GraphData | null>(null);

  // Health
  const [healthLoading, setHealthLoading] = useState<boolean>(false);
  const [healthError, setHealthError] = useState<string>("");
  const [healthData, setHealthData] = useState<HealthData | null>(null);

  // Tour
  const [tourLoading, setTourLoading] = useState<boolean>(false);
  const [tourError, setTourError] = useState<string>("");
  const [tourData, setTourData] = useState<TourData | null>(null);

  async function handleScan() {
    setError("");
    setResult(null);
    setTreeData(null);
    setGraphData(null);
    setHealthData(null);
    setTourData(null);
    setTreeError(""); setGraphError(""); setHealthError(""); setTourError("");

    if (!repoUrl.trim()) {
      setError("Enter a GitHub repo URL");
      return;
    }

    setLoading(true);
    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_BASE}/scan`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ repo_url: repoUrl.trim() }),
      });

      if (!res.ok) {
        let msg = `API ${res.status}`;
        try {
          const body = await res.json();
          if (body?.detail) msg = body.detail;
        } catch { }
        throw new Error(msg);
      }

      const data: ScanResponse = await res.json();
      setResult(data);
      setActiveTab("Tree");
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Failed to reach API";
      setError(msg);
    } finally {
      setLoading(false);
    }
  }

  async function loadTree(scanId: string) {
    setTreeError("");
    setTreeLoading(true);
    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_BASE}/tree/${scanId}`);
      if (!res.ok) throw new Error(`Tree API ${res.status}`);
      const data: TreeNode = await res.json();
      setTreeData(data);
    } catch (e: any) {
      setTreeError(e.message || "Failed to load tree");
    } finally {
      setTreeLoading(false);
    }
  }

  async function loadGraph(scanId: string) {
    setGraphError(""); setGraphLoading(true);
    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_BASE}/graph/${scanId}`);
      if (!res.ok) throw new Error(`Graph API ${res.status}`);
      const data: GraphData = await res.json();
      setGraphData(data);
    } catch (e: any) {
      setGraphError(e.message || "Failed to load graph");
    } finally {
      setGraphLoading(false);
    }
  }

  async function loadHealth(scanId: string) {
    setHealthError(""); setHealthLoading(true);
    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_BASE}/health/${scanId}`);
      if (!res.ok) throw new Error(`Health API ${res.status}`);
      const data: HealthData = await res.json();
      setHealthData(data);
    } catch (e: any) {
      setHealthError(e.message || "Failed to load health");
    } finally {
      setHealthLoading(false);
    }
  }

  async function loadTour(scanId: string) {
    setTourError(""); setTourLoading(true);
    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_BASE}/tour/${scanId}`);
      if (!res.ok) throw new Error(`Tour API ${res.status}`);
      const data: TourData = await res.json();
      setTourData(data);
    } catch (e: any) {
      setTourError(e.message || "Failed to load tour");
    } finally {
      setTourLoading(false);
    }
  }

  // reactive loaders when switching tabs
  useEffect(() => {
    if (!result?.scan_id) return;
    if (activeTab === "Tree" && !treeData && !treeLoading) loadTree(result.scan_id);
    if (activeTab === "Graph" && !graphData && !graphLoading) loadGraph(result.scan_id);
    if (activeTab === "Health" && !healthData && !healthLoading) loadHealth(result.scan_id);
    if (activeTab === "Tour" && !tourData && !tourLoading) loadTour(result.scan_id);
  }, [activeTab, result?.scan_id]);

  const Tab = ({
    name,
    onClick,
    active,
  }: {
    name: "Tree" | "Graph" | "Health" | "Tour";
    onClick: () => void;
    active: boolean;
  }) => (
    <button
      onClick={onClick}
      className={[
        "px-3 py-1 rounded-full border text-sm transition-colors",
        active
          ? "border-cyan-500 text-cyan-300 shadow-[0_0_0.5rem_#22d3ee66]"
          : "border-slate-800 text-slate-300/80 hover:text-slate-200"
      ].join(" ")}
    >
      {name}
    </button>
  );

  return (
    <main className="min-h-screen bg-slate-950 text-slate-100 flex items-center justify-center p-6">
      <div className="w-full max-w-6xl space-y-6">
        <h1 className="text-3xl font-semibold tracking-tight">
          <span className="bg-gradient-to-r from-cyan-400 to-blue-400 bg-clip-text text-transparent">
            CodeLens
          </span>
        </h1>

        {/* Scan panel */}
        <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-4 space-y-4">
          <label className="block text-sm text-slate-300">GitHub Repository URL</label>
          <input
            value={repoUrl}
            onChange={(e) => setRepoUrl(e.target.value)}
            placeholder="e.g., https://github.com/sindresorhus/slugify"
            className="w-full rounded-xl bg-slate-900 border border-slate-800 px-3 py-2 outline-none 
                       focus:ring-2 focus:ring-cyan-400/60"
          />
          <button
            onClick={handleScan}
            disabled={loading}
            className={[
              "rounded-xl px-4 py-2 font-medium",
              "bg-cyan-500 hover:bg-cyan-400 disabled:opacity-50",
              "ring-0 focus:outline-none focus:ring-2 focus:ring-cyan-400/60",
              "shadow-[0_0_0.5rem_#22d3ee66]"
            ].join(" ")}
          >
            {loading ? "Scanning..." : "Scan"}
          </button>

          {error && <p className="text-red-400 text-sm">Error: {error}</p>}
          {result && (
            <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-3">
              <div className="flex flex-wrap items-center gap-2">
                <a
                  href={result.repo_url}
                  target="_blank"
                  className="text-blue-300 hover:text-blue-200 underline underline-offset-2"
                >
                  {result.owner}/{result.repo}
                </a>

                <span className="ml-2 text-xs px-2 py-0.5 rounded-full border border-slate-700 text-slate-300">
                  {result.files_scanned} files
                </span>
                <span className="text-xs px-2 py-0.5 rounded-full border border-slate-700 text-slate-300">
                  {result.total_loc} LOC
                </span>

                <div className="ml-auto flex items-center gap-2">
                  {/* <button
                    onClick={() => { navigator.clipboard.writeText(result.scan_id); }}
                    className="text-xs px-2 py-1 rounded border border-slate-700 hover:border-slate-500"
                    title="Copy scan id"
                  >
                    Copy Scan ID
                  </button> */}
                  <button
                    onClick={() => setShowRaw(v => !v)}
                    className="text-xs px-2 py-1 rounded border border-slate-700 hover:border-slate-500"
                  >
                    {showRaw ? "Hide raw" : "View raw"}
                  </button>
                </div>
              </div>

              {showRaw && (
                <pre className="mt-3 font-mono text-xs bg-slate-900 border border-slate-800 rounded-lg p-3 overflow-auto">
                  {JSON.stringify(result, null, 2)}
                </pre>
              )}
            </div>
          )}
        </div>

        {/* Tabs */}
        <div className="flex gap-2">
          <Tab name="Tree" active={activeTab === "Tree"} onClick={() => setActiveTab("Tree")} />
          <Tab name="Graph" active={activeTab === "Graph"} onClick={() => setActiveTab("Graph")} />
          <Tab name="Health" active={activeTab === "Health"} onClick={() => setActiveTab("Health")} />
          <Tab name="Tour" active={activeTab === "Tour"} onClick={() => setActiveTab("Tour")} />
        </div>

        <div className="bg-slate-900/40 border border-slate-800 rounded-2xl p-4">
          {activeTab === "Tree" && (
            <>
              {!result && <p className="text-slate-400 text-sm">Run a scan to view the treemap.</p>}
              {result && treeLoading && <p className="text-slate-400 text-sm">Loading tree…</p>}
              {result && treeError && <p className="text-red-400 text-sm">Error: {treeError}</p>}
              {result && treeData && (
                <div className="w-full overflow-x-auto">
                  <Treemap data={treeData} />
                </div>
              )}
            </>
          )}

          {activeTab === "Graph" && (
            <>
              {!result && <p className="text-slate-400 text-sm">Run a scan to view the graph.</p>}
              {result && graphLoading && <p className="text-slate-400 text-sm">Loading graph…</p>}
              {result && graphError && <p className="text-red-400 text-sm">Error: {graphError}</p>}
              {result && graphData && <GraphView data={graphData} />}
            </>
          )}

          {activeTab === "Health" && (
            <>
              {!result && <p className="text-slate-400 text-sm">Run a scan to view repo health.</p>}
              {result && healthLoading && <p className="text-slate-400 text-sm">Loading health…</p>}
              {result && healthError && <p className="text-red-400 text-sm">Error: {healthError}</p>}
              {result && healthData && <HealthPanel data={healthData} />}
            </>
          )}

          {activeTab === "Tour" && (
            <>
              {!result && <p className="text-slate-400 text-sm">Run a scan to view the tour.</p>}
              {result && tourLoading && <p className="text-slate-400 text-sm">Generating tour…</p>}
              {result && tourError && <p className="text-red-400 text-sm">Error: {tourError}</p>}
              {result && tourData && <TourPanel data={tourData} />}
            </>
          )}
        </div>
      </div>
    </main>
  );
}
