"use client";
import { useState } from "react";

type ScanResponse = {
  scan_id: string;
  repo_url: string;
  status: string;
};

export default function Home() {
  const [repoUrl, setRepoUrl] = useState<string>("");
  const [loading, setLoading] = useState<boolean>(false);
  const [result, setResult] = useState<ScanResponse | null>(null);
  const [error, setError] = useState<string>("");

  async function handleScan() {
    setError("");
    setResult(null);

    if (!repoUrl.trim()){ 
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
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Failed to reach API";
      setError(msg);
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="min-h-screen bg-slate-950 text-slate-100 flex items-center justify-center p-6">
      <div className="w-full max-w-2xl space-y-6">
        <h1 className="text-3xl font-semibold">CodeLens</h1>
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

        <div className="flex gap-2 text-sm opacity-70">
          <span className="px-3 py-1 rounded-full border border-slate-800">Tree</span>
          <span className="px-3 py-1 rounded-full border border-slate-800">Graph</span>
          <span className="px-3 py-1 rounded-full border border-slate-800">Health</span>
          <span className="px-3 py-1 rounded-full border border-slate-800">Tour</span>
        </div>
      </div>
    </main>
  );
}
