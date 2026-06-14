import os, pathlib, json, asyncio
from fastapi import FastAPI, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse, StreamingResponse
from routers import search, novel, chapter

app = FastAPI(title="小说浏览器 API", version="1.0.0")
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_credentials=True, allow_methods=["*"], allow_headers=["*"])
app.include_router(search.router, prefix="/api", tags=["搜索"])
app.include_router(novel.router, prefix="/api", tags=["小说"])
app.include_router(chapter.router, prefix="/api", tags=["章节"])

@app.get("/api/diag")
async def diag():
    result = {}
    try: import scrapling; result["scrapling"] = str(scrapling.__version__)
    except Exception as e: result["scrapling"] = f"FAIL: {e}"
    try:
        import scrapling_fetcher as sf
        result["fetcher_funcs"] = [x for x in dir(sf) if not x.startswith("_")]
    except Exception as e: result["fetcher_funcs"] = f"FAIL: {e}"
    result["cwd"] = os.getcwd()
    return result

@app.get("/api/health")
async def health(): return {"status": "ok"}

@app.get("/api/chapter/stream")
async def stream_content(url: str = Query(...)):
    from scrapling_fetcher import fetch_chapter_stream
    async def generate():
        try:
            for chunk in fetch_chapter_stream(url):
                yield f"data: {json.dumps(chunk, ensure_ascii=False)}\n\n"
                await asyncio.sleep(0.1)
        except Exception as e:
            yield f"data: {{\"error\": \"{str(e)}\"}}\n\n"
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