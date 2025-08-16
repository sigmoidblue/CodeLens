"use client";
type HealthData = {
  full_name: string;
  html_url: string;
  description: string | null;
  stars: number;
  forks: number;
  open_issues: number;
  license: string | null;
  pushed_at: string | null; // ISO
  default_branch: string | null;
};

export default function HealthPanel({ data }: { data: HealthData }) {
  const lastPush = data.pushed_at ? new Date(data.pushed_at).toLocaleString() : "—";
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <Card label="Repository">
        <a href={data.html_url} target="_blank" className="text-blue-400 hover:underline">
          {data.full_name}
        </a>
        <p className="text-slate-400 text-sm mt-1">{data.description || "—"}</p>
      </Card>
      <Card label="Stars">{data.stars?.toLocaleString() ?? "—"}</Card>
      <Card label="Forks">{data.forks?.toLocaleString() ?? "—"}</Card>
      <Card label="Open Issues">{data.open_issues?.toLocaleString() ?? "—"}</Card>
      <Card label="License">{data.license || "—"}</Card>
      <Card label="Last Push">{lastPush}</Card>
      <Card label="Default Branch">{data.default_branch || "—"}</Card>
    </div>
  );
}

function Card({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-4">
      <div className="text-xs uppercase tracking-wide text-slate-400 mb-1">{label}</div>
      <div className="text-slate-100">{children}</div>
    </div>
  );
}
