from fastapi import FastAPI
from pydantic import BaseModel
from fastapi.middleware.cors import CORSMiddleware
from scanner import scan_repo, load_scan

class ScanRequest(BaseModel):
    repo_url: str

app = FastAPI(title="CodeLens API", version="0.1.0")

origins = [
    "http://localhost:3000", 
    # "https://codelens.vercel.app"
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