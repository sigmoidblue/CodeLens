from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
from fastapi.middleware.cors import CORSMiddleware
from scanner import scan_repo, load_scan, load_graph
import requests

class ScanRequest(BaseModel):
    repo_url: str

app = FastAPI(title="CodeLens API", version="0.2.0")

origins = [
    "http://localhost:3000",
    # "https://codelens.vercel.app",  # enable when deployed
]
app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/")
def health():
    return {"status": "ok"}

@app.post("/scan")
def start_scan(req: ScanRequest):
    try:
        summary = scan_repo(req.repo_url)
        return summary
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

@app.get("/tree/{scan_id}")
def get_tree(scan_id: str):
    try:
        data = load_scan(scan_id)
        return data["tree"]
    except FileNotFoundError:
        raise HTTPException(status_code=404, detail="scan not found")
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

@app.get("/graph/{scan_id}")
def get_graph(scan_id: str):
    try:
        return load_graph(scan_id)
    except FileNotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

@app.get("/health/{scan_id}")
def repo_health(scan_id: str):
    try:
        data = load_scan(scan_id)
        owner = data["summary"]["owner"]
        repo = data["summary"]["repo"]
        url = f"https://api.github.com/repos/{owner}/{repo}"
        r = requests.get(url, timeout=30)
        r.raise_for_status()
        j = r.json()
        return {
            "full_name": j.get("full_name"),
            "html_url": j.get("html_url"),
            "description": j.get("description"),
            "stars": j.get("stargazers_count"),
            "forks": j.get("forks_count"),
            "open_issues": j.get("open_issues_count"),
            "license": (j.get("license") or {}).get("spdx_id"),
            "pushed_at": j.get("pushed_at"),
            "default_branch": j.get("default_branch"),
        }
    except FileNotFoundError:
        raise HTTPException(status_code=404, detail="scan not found")
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))
