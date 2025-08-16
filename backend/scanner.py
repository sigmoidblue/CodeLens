import io
import os
import re
import json
import time
import uuid
import shutil
import zipfile
import tempfile
from typing import Dict, Any, Tuple
import requests
from typing import List, Optional
from pathlib import PurePosixPath

# caps
MAX_BYTES = 100 * 1024 * 1024  # 100 MB
MAX_FILES = 5000

# files considering for LOC
TEXT_EXTS = {
    ".py",".js",".ts",".tsx",".jsx",".json",".md",".yml",".yaml",".toml",
    ".css",".scss",".html",".txt",".rs",".go",".java",".c",".cpp",".h",".hpp",
    ".sh",".rb",".php",".cs"
}

# language/parse hints for the dependency graph
JS_TS_EXTS = {".js",".jsx",".ts",".tsx",".mjs",".cjs",".mts",".cts",".d.ts",".json"}
PY_EXTS = {".py"}
CANDIDATE_JS_TS = [
    ".ts",".tsx",".js",".jsx",".json",
    "/index.ts","/index.tsx","/index.js","/index.jsx"
]

# regex for JS/TS + Python import parsing
IMPORT_RE_JS = re.compile(
    r"""(?x)
    import\s+(?:[^'"]+?\s+from\s+)?['"](?P<spec>[^'"]+)['"]|
    export\s+[^'"]+?\s+from\s+['"](?P<spec2>[^'"]+)['"]|
    require\(\s*['"](?P<spec3>[^'"]+)['"]\s*\)|
    import\(\s*['"](?P<spec4>[^'"]+)['"]\s*\)
    """
)
IMPORT_RE_PY = re.compile(
    r"""(?x)
    ^\s*from\s+(?P<mod_from>[\.\w]+)\s+import\s+[^\n]+|
    ^\s*import\s+(?P<mod_imp>[\w\.]+)
    """,
    re.M,
)

def parse_repo_url(repo_url: str) -> Tuple[str, str]:
    # accepts-> https://github.com/owner/repo, git@github.com:owner/repo.git, etc.
    url = repo_url.strip()
    m = re.search(r"github\.com[:/]+(?P<owner>[^/]+)/(?P<repo>[A-Za-z0-9_.\-]+)(?:\.git|/)?$", url)
    if not m:
        raise ValueError("Unsupported repo URL. Use https://github.com/<owner>/<repo>")
    return m["owner"], m["repo"]

def download_zipball(owner: str, repo: str) -> bytes:
    url = f"https://api.github.com/repos/{owner}/{repo}/zipball"
    with requests.get(url, stream=True, timeout=60) as r:
        r.raise_for_status()
        buf = io.BytesIO()
        size = 0
        for chunk in r.iter_content(chunk_size=8192):
            if not chunk:
                continue
            size += len(chunk)
            if size > MAX_BYTES:
                raise ValueError(f"Repository exceeds {MAX_BYTES//(1024*1024)} MB limit")
            buf.write(chunk)
        return buf.getvalue()

def looks_textual(path: str, head: bytes) -> bool:
    ext = os.path.splitext(path)[1].lower()
    if ext in TEXT_EXTS:
        return True
    # reject if binary
    if b"\x00" in head:
        return False
    try:
        head.decode("utf-8")
        return True
    except UnicodeDecodeError:
        return False

def count_loc_from_bytes(b: bytes) -> int:
    try:
        return len(b.decode("utf-8", errors="ignore").splitlines())
    except Exception:
        return 0

def add_to_tree(tree: Dict[str, Any], parts, loc: int):
    node = tree
    for p in parts[:-1]:
        node = node.setdefault("children", {}).setdefault(p, {"name": p, "children": {}})
    fname = parts[-1]
    files = node.setdefault("children", {})
    files[fname] = {"name": fname, "loc": loc}

def tree_to_list(node: Dict[str, Any]) -> Dict[str, Any]:
    # convert dict-of-dicts to list/array
    out = {"name": node.get("name", "root")}
    if "loc" in node:
        out["loc"] = node["loc"]
    kids = []
    for k, v in sorted(node.get("children", {}).items()):
        kids.append(tree_to_list(v))
    if kids:
        out["children"] = kids
        out["loc"] = sum(child.get("loc", 0) for child in kids)
    return out

# helpers for dependency resolution
def _is_rel(spec: str) -> bool:
    return spec.startswith(".") or spec.startswith("./") or spec.startswith("../")

def _norm_posix(path: str) -> str:
    return str(PurePosixPath(path))

def _parse_js_ts_imports(text: str) -> List[str]:
    specs: List[str] = []
    for m in IMPORT_RE_JS.finditer(text):
        spec = m.group("spec") or m.group("spec2") or m.group("spec3") or m.group("spec4")
        if spec:
            specs.append(spec.strip())
    return specs

def _parse_py_imports(text: str) -> List[str]:
    mods: List[str] = []
    for m in IMPORT_RE_PY.finditer(text):
        mod = m.group("mod_from") or m.group("mod_imp")
        if mod:
            mods.append(mod.strip())
    return mods

def _resolve_js_ts(cur_path: str, spec: str, all_files: set) -> Optional[str]:
    """Best-effort resolve of relative JS/TS imports to repo paths."""
    if not _is_rel(spec):
        return None
    base = str(PurePosixPath(cur_path).parent.joinpath(spec))
    candidates = [base] + [base + ext for ext in CANDIDATE_JS_TS]
    for c in candidates:
        p = _norm_posix(c)
        p = re.sub(r"/\./", "/", p)
        p = _norm_posix(PurePosixPath(p))
        if p in all_files:
            return p
        # if no extension, try common endings or index files
        if "." not in PurePosixPath(p).name:
            for ext in [".ts",".tsx",".js",".jsx",".json"]:
                if p + ext in all_files:
                    return p + ext
            for idx in ["/index.ts","/index.tsx","/index.js","/index.jsx"]:
                if p + idx in all_files:
                    return p + idx
    return None

def _resolve_py(cur_path: str, mod: str, all_files: set) -> Optional[str]:
    """Best-effort resolve of Python relative/absolute modules inside the repo."""
    cur_dir = PurePosixPath(cur_path).parent
    if mod.startswith("."):
        up = len(mod) - len(mod.lstrip("."))
        rest = mod.lstrip(".")
        target_dir = cur_dir
        for _ in range(up):
            target_dir = target_dir.parent
        if rest:
            target_dir = target_dir.joinpath(*rest.split("."))
        cands = [
            _norm_posix(str(target_dir) + "/__init__.py"),
            _norm_posix(str(target_dir) + ".py"),
        ]
        for c in cands:
            if c in all_files:
                return c
    else:
        p = _norm_posix("/".join(mod.split(".")) + ".py")
        if p in all_files:
            return p
        p2 = _norm_posix("/".join(mod.split(".")) + "/__init__.py")
        if p2 in all_files:
            return p2
    return None

# main function to put it all together 
def scan_repo(repo_url: str) -> Dict[str, Any]:
    owner, repo = parse_repo_url(repo_url)
    zip_bytes = download_zipball(owner, repo)

    # unzip to temp
    tmpdir = tempfile.mkdtemp(prefix="codelens_")
    files_scanned = 0
    total_loc = 0
    root_tree: Dict[str, Any] = {"name": "root", "children": {}}

    # accumulators for dependency graph
    all_files: set[str] = set()           # all repo paths (posix)
    file_bytes: Dict[str, bytes] = {}     # keep parsable sources in memory for graph
    edges: List[Tuple[str, str]] = []     # (source -> target)

    try:
        with zipfile.ZipFile(io.BytesIO(zip_bytes)) as zf:
            for zi in zf.infolist():
                if zi.is_dir():
                    continue
                files_scanned += 1
                if files_scanned > MAX_FILES:
                    raise ValueError(f"Repository exceeds {MAX_FILES} files limit")

                # extract into memory, no writing to disk
                with zf.open(zi) as f:
                    head = f.read(4096)
                    rest = f.read()
                    content = head + rest

                arcname = zi.filename
                parts = arcname.split("/", 1)
                rel = parts[1] if len(parts) > 1 else parts[0]
                rel = _norm_posix(rel)  # normalize to posix for graph

                # collect file set for resolution
                all_files.add(rel)

                if not looks_textual(rel, head):
                    continue

                loc = count_loc_from_bytes(content)
                total_loc += loc
                add_to_tree(root_tree, rel.split("/"), loc)

                # retain code files for graph parsing (size-guard: 2MB/file)
                ext = os.path.splitext(rel)[1].lower()
                if (ext in JS_TS_EXTS or ext in PY_EXTS) and len(content) <= 2_000_000:
                    file_bytes[rel] = content

        # build tree
        tree = tree_to_list(root_tree)

        # second pass to parse imports & resolve to in-repo targets
        for path, content in file_bytes.items():
            ext = os.path.splitext(path)[1].lower()
            text = content.decode("utf-8", errors="ignore")
            if ext in JS_TS_EXTS:
                for spec in _parse_js_ts_imports(text):
                    tgt = _resolve_js_ts(path, spec, all_files) if _is_rel(spec) else None
                    if tgt:
                        edges.append((path, tgt))
            elif ext in PY_EXTS:
                for mod in _parse_py_imports(text):
                    tgt = _resolve_py(path, mod, all_files)
                    if tgt:
                        edges.append((path, tgt))

        # produce a scan record
        scan_id = str(uuid.uuid4())
        created_at = int(time.time())

        summary = {
            "scan_id": scan_id,
            "owner": owner,
            "repo": repo,
            "repo_url": f"https://github.com/{owner}/{repo}",
            "created_at": created_at,
            "files_scanned": files_scanned,
            "total_loc": total_loc,
            "limits": {"max_bytes": MAX_BYTES, "max_files": MAX_FILES},
        }

        # persist a minimal dependency graph alongside tree
        nodes = sorted(all_files)
        graph = {
            "nodes": [{"id": n} for n in nodes],
            "edges": [{"source": s, "target": t} for (s, t) in edges],
            "note": "Edges include best-effort in-repo relative JS/TS imports and Python imports.",
        }

        # persist to backend/data/scans/<scan_id>.json so future endpoints can read it
        data_dir = os.path.join(os.path.dirname(__file__), "data", "scans")
        os.makedirs(data_dir, exist_ok=True)
        with open(os.path.join(data_dir, f"{scan_id}.json"), "w", encoding="utf-8") as f:
            json.dump({"summary": summary, "tree": tree, "graph": graph}, f)

        return summary

    finally:
        # cleanup temp dir
        try:
            shutil.rmtree(tmpdir)
        except Exception:
            pass

# retrieve saved scans by ID
def load_scan(scan_id: str) -> Dict[str, Any]:
    data_dir = os.path.join(os.path.dirname(__file__), "data", "scans")
    path = os.path.join(data_dir, f"{scan_id}.json")
    if not os.path.exists(path):
        raise FileNotFoundError("scan not found")
    with open(path, "r", encoding="utf-8") as f:
        return json.load(f)

# convenience loader for graph endpoint
def load_graph(scan_id: str) -> Dict[str, Any]:
    data = load_scan(scan_id)
    g = data.get("graph")
    if not g:
        raise FileNotFoundError("graph not available for this scan (re-scan with updated code)")
    return g
