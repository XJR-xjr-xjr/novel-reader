import os
import pathlib
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse
from routers import search, novel, chapter

app = FastAPI(
    title="小说浏览器 API",
    description="盗版小说搜索与阅读后端服务",
    version="1.0.0"
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(search.router, prefix="/api", tags=["搜索"])
app.include_router(novel.router, prefix="/api", tags=["小说"])
app.include_router(chapter.router, prefix="/api", tags=["章节"])


@app.get("/api/health")
async def health_check():
    return {"status": "ok"}


@app.get("/api/debug")
async def debug_search():
    """诊断每个站点的连通性"""
    import httpx
    results = {}
    sites = [
        "https://www.biquge.cc",
        "https://www.xbiquge.net",
        "https://www.biquge.info",
    ]
    for site in sites:
        try:
            async with httpx.AsyncClient(timeout=10) as c:
                r = await c.get(site, headers={
                    "User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 16_6 like Mac OS X) AppleWebKit/605.1.15"
                })
                results[site] = f"HTTP {r.status_code} ({len(r.text)} bytes)"
        except Exception as e:
            results[site] = f"FAIL: {str(e)[:120]}"
    return results


FRONTEND_DIR = pathlib.Path(__file__).parent / "frontend"
if FRONTEND_DIR.is_dir():
    @app.get("/{path:path}")
    async def serve_frontend(path: str):
        if path.startswith("api/"):
            return JSONResponse({"detail": "Not Found"}, status_code=404)
        file_path = FRONTEND_DIR / path
        if file_path.is_file():
            return FileResponse(str(file_path))
        index = FRONTEND_DIR / "index.html"
        if index.is_file():
            return FileResponse(str(index))
        return JSONResponse({"detail": "Not Found"}, status_code=404)
else:
    @app.get("/{path:path}")
    async def catch_all(path: str):
        return JSONResponse({"detail": "Not Found"}, status_code=404)