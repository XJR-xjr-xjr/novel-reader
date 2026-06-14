import os, pathlib, json, asyncio, re
from urllib.parse import urljoin, urlparse
from fastapi import FastAPI, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse, StreamingResponse
from routers import search, novel, chapter

app = FastAPI(title="小说浏览器 API", version="1.0.0")
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_credentials=True, allow_methods=["*"], allow_headers=["*"])
app.include_router(search.router, prefix="/api", tags=["搜索"])
app.include_router(novel.router, prefix="/api", tags=["小说"])
app.include_router(chapter.router, prefix="/api", tags=["章节"])

@app.get("/api/health")
async def health(): return {"status": "ok"}

@app.get("/api/chapter/stream")
async def stream_content(url: str = Query(...)):
    async def generate():
        from scrapling.fetchers import StealthyFetcher
        base = f"{urlparse(url).scheme}://{urlparse(url).netloc}"
        cur = url; seen = set()
        for pg in range(5):
            try:
                page = await asyncio.to_thread(StealthyFetcher.fetch, cur,
                    headless=True, solve_cloudflare=True, timeout=60000, network_idle=True)
            except Exception as e:
                yield f"data: {{\"error\": \"{e}\"}}\n\n"; break
            
            el = page.css('div#content') or page.css('div#htmlContent')
            if el:
                txt = el[0].get_all_text(strip=True) if el else ""
                if txt:
                    yield f"data: {json.dumps({'page': pg+1, 'text': txt}, ensure_ascii=False)}\n\n"
                    await asyncio.sleep(0.1)
            
            # Find next
            n = None
            for a in page.css('a'):
                if a and hasattr(a,'get_all_text') and re.search(r'下一页|下一章|继续|下一节', a.get_all_text(strip=True)):
                    h = a.attrib.get('href','') if hasattr(a,'attrib') else ''; n=urljoin(base,h) if h else None; break
            if not n:
                x = page.css('a#aKeyNextPage')
                if x and hasattr(x[0],'attrib'): h=x[0].attrib.get('href',''); n=urljoin(base,h) if h else None
            if n and n not in seen: seen.add(n); cur=n
            else: break
        yield "data: [DONE]\n\n"
    return StreamingResponse(generate(), media_type="text/event-stream", headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"})

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