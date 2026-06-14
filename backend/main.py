import os, pathlib
from fastapi import FastAPI, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse, PlainTextResponse
from routers import search, novel, chapter

app = FastAPI(title="小说浏览器 API", version="1.0.0")

app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_credentials=True, allow_methods=["*"], allow_headers=["*"])
app.include_router(search.router, prefix="/api", tags=["搜索"])
app.include_router(novel.router, prefix="/api", tags=["小说"])
app.include_router(chapter.router, prefix="/api", tags=["章节"])

@app.get("/api/health")
async def health(): return {"status": "ok"}

@app.get("/api/debug-html")
async def debug_html(url: str = Query(...)):
    """调试：返回目标 URL 的原始 HTML"""
    import httpx
    try:
        async with httpx.AsyncClient(timeout=15, follow_redirects=True) as c:
            r = await c.get(url, headers={"User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 16_6 like Mac OS X) AppleWebKit/605.1.15"})
            return PlainTextResponse(r.text[:50000], media_type="text/plain; charset=utf-8")
    except Exception as e:
        return {"error": str(e)}

FRONTEND_DIR = pathlib.Path(__file__).parent / "frontend"
if FRONTEND_DIR.is_dir():
    @app.get("/{path:path}")
    async def serve_frontend(path: str):
        if path.startswith("api/"): return JSONResponse({"detail": "Not Found"}, status_code=404)
        fp = FRONTEND_DIR / path
        if fp.is_file(): return FileResponse(str(fp))
        idx = FRONTEND_DIR / "index.html"
        if idx.is_file(): return FileResponse(str(idx))
        return JSONResponse({"detail": "Not Found"}, status_code=404)
else:
    @app.get("/{path:path}")
    async def catch_all(path: str): return JSONResponse({"detail": "Not Found"}, status_code=404)