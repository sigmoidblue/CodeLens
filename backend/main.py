from fastapi import FastAPI
from pydantic import BaseModel
from fastapi.middleware.cors import CORSMiddleware

class ScanRequest(BaseModel):
    repo_url: str

app = FastAPI(title="CodeLens API", version="0.1.0")

origins = [
    "http://localhost:3000",
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
    # for now
    return {"scan_id": "dev-123", "repo_url": req.repo_url, "status": "queued"}
