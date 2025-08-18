"use client";
type TourSection = { title: string; bullets: string[] };
type TourData = {
  header: { owner: string; repo: string; repo_url: string; files_scanned: number; total_loc: number };
  sections: TourSection[];
  note?: string;
};

export default function TourPanel({ data }: { data: TourData }) {
  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-4">
        <div className="text-sm">
          <a href={data.header.repo_url} target="_blank" className="text-blue-400 hover:underline">
            {data.header.owner}/{data.header.repo}
          </a>
          <span className="ml-2 text-slate-400">
            • {data.header.files_scanned} files • {data.header.total_loc} LOC
          </span>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        {data.sections.map((sec) => (
          <div key={sec.title} className="rounded-xl border border-slate-800 bg-slate-900/40 p-4">
            <div className="font-semibold mb-2">{sec.title}</div>
            <ul className="list-disc pl-5 space-y-1 text-sm">
              {sec.bullets.map((b, i) => (
                <li key={i} dangerouslySetInnerHTML={{ __html: b }} />
              ))}
            </ul>
          </div>
        ))}
      </div>
      {data.note && <p className="text-xs text-slate-500">Note: {data.note}</p>}
    </div>
  );
}
