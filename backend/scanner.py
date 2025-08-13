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

# caps
MAX_BYTES = 100 * 1024 * 1024  # 100 MB
MAX_FILES = 5000

# files considering for LOC
TEXT_EXTS = {
    ".py",".js",".ts",".tsx",".jsx",".json",".md",".yml",".yaml",".toml",
    ".css",".scss",".html",".txt",".rs",".go",".java",".c",".cpp",".h",".hpp",
    ".sh",".rb",".php",".cs"
}

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

# main function to put it all together 
def scan_repo(repo_url: str) -> Dict[str, Any]:
    owner, repo = parse_repo_url(repo_url)
    zip_bytes = download_zipball(owner, repo)

    # unzip to temp
    tmpdir = tempfile.mkdtemp(prefix="codelens_")
    files_scanned = 0
    total_loc = 0
    root_tree: Dict[str, Any] = {"name": "root", "children": {}}

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

                if not looks_textual(rel, head):
                    continue

                loc = count_loc_from_bytes(content)
                total_loc += loc
                add_to_tree(root_tree, rel.split("/"), loc)

        # build tree
        tree = tree_to_list(root_tree)

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

        # persist to backend/data/scans/<scan_id>.json so future endpoints can read it
        data_dir = os.path.join(os.path.dirname(__file__), "data", "scans")
        os.makedirs(data_dir, exist_ok=True)
        with open(os.path.join(data_dir, f"{scan_id}.json"), "w", encoding="utf-8") as f:
            json.dump({"summary": summary, "tree": tree}, f)

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
