"use client";
import { useEffect, useState } from "react";
import Treemap from "../components/Treemap";
import GraphView, { GraphData } from "../components/GraphView";
import HealthPanel from "../components/HealthPanel";

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

export default function Home() {
  const [repoUrl, setRepoUrl] = useState<string>("");
  const [loading, setLoading] = useState<boolean>(false);
  const [result, setResult] = useState<ScanResponse | null>(null);
  const [error, setError] = useState<string>("");

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

  async function handleScan() {
    setError("");
    setResult(null);
    setTreeData(null);
    setGraphData(null);
    setHealthData(null);
    setTreeError(""); setGraphError(""); setHealthError("");

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
      if (!res.ok) throw new Error(`API ${res.status}`);
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

  // reactive loaders when switching tabs
  useEffect(() => {
    if (!result?.scan_id) return;
    if (activeTab === "Tree" && !treeData && !treeLoading) loadTree(result.scan_id);
    if (activeTab === "Graph" && !graphData && !graphLoading) loadGraph(result.scan_id);
    if (activeTab === "Health" && !healthData && !healthLoading) loadHealth(result.scan_id);
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
        "px-3 py-1 rounded-full border text-sm",
        active ? "border-blue-500 text-blue-300" : "border-slate-800 text-slate-300 opacity-80",
      ].join(" ")}
    >
      {name}
    </button>
  );

  return (
    <main className="min-h-screen bg-slate-950 text-slate-100 flex items-center justify-center p-6">
      <div className="w-full max-w-6xl space-y-6">
        <h1 className="text-3xl font-semibold">CodeLens</h1>

        {/* Scan panel */}
        <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-4 space-y-4">
          <label className="block text-sm text-slate-300">GitHub Repository URL</label>
          <input
            value={repoUrl}
            onChange={(e) => setRepoUrl(e.target.value)}
            placeholder="e.g., https://github.com/vercel/next.js"
            className="w-full rounded-xl bg-slate-900 border border-slate-800 px-3 py-2 outline-none focus:ring-2 focus:ring-blue-500"
          />
          <button
            onClick={handleScan}
            disabled={loading}
            className="rounded-xl px-4 py-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-50"
          >
            {loading ? "Scanning..." : "Scan"}
          </button>

          {error && <p className="text-red-400 text-sm">Error: {error}</p>}
          {result && (
            <pre className="text-xs bg-slate-900 border border-slate-800 rounded-xl p-3 overflow-auto">
              {JSON.stringify(result, null, 2)}
            </pre>
          )}
        </div>

        {/* Tabs */}
        <div className="flex gap-2">
          <Tab name="Tree"   active={activeTab === "Tree"}   onClick={() => setActiveTab("Tree")} />
          <Tab name="Graph"  active={activeTab === "Graph"}  onClick={() => setActiveTab("Graph")} />
          <Tab name="Health" active={activeTab === "Health"} onClick={() => setActiveTab("Health")} />
          <Tab name="Tour"   active={activeTab === "Tour"}   onClick={() => setActiveTab("Tour")} />
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
        </div>
      </div>
    </main>
  );
}
