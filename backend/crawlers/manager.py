import asyncio, re
import httpx
from crawlers.base import CrawlerBase
from crawlers.biquge import BiqugeCrawler
from models.schemas import SearchResult, Chapter, ChapterContent

CLOUDFLARE_SIGNS = [re.compile(p, re.I) for p in [
    r'cloudflare', r'cf-browser-verify', r'_cf_chl_opt',
    r'Just a moment', r'cf-ray', r'cf-cache-status'
]]

class CrawlerManager:
    def __init__(self):
        self._crawlers = [
            BiqugeCrawler("https://www.biquge.cc"),
            BiqugeCrawler("https://www.xbiquge.net"),
            BiqugeCrawler("https://www.biquge.info"),
        ]
        self._fallback = BiqugeCrawler("https://generic")

    async def _has_cloudflare(self, url: str) -> bool:
        """Fast 2-second check for Cloudflare"""
        try:
            async with httpx.AsyncClient(timeout=2.0, follow_redirects=True) as c:
                r = await c.get(url, headers={"User-Agent": "Mozilla/5.0"})
                body = r.text[:1000]
                for p in CLOUDFLARE_SIGNS:
                    if p.search(body): return True
        except Exception:
            return False
        return False

    async def search_all(self, keyword: str) -> list[SearchResult]:
        tasks = [c.search(keyword) for c in self._crawlers]
        results = await asyncio.gather(*tasks, return_exceptions=True)

        novel_map = {}
        for crawler, result in zip(self._crawlers, results):
            if isinstance(result, Exception): continue
            for item in result:
                key = f"{item.title}|{item.author}"
                if key not in novel_map:
                    novel_map[key] = item
                else:
                    existing = {s.site_url for s in novel_map[key].sources}
                    for src in item.sources:
                        if src.site_url not in existing:
                            novel_map[key].sources.append(src)

        final = list(novel_map.values())
        # Quick CF check: remove Cloudflare results
        clean = []
        for novel in final:
            ok_sources = []
            for src in novel.sources:
                if not await self._has_cloudflare(src.site_url):
                    ok_sources.append(src)
            if ok_sources:
                novel.sources = ok_sources
                clean.append(novel)
        return clean

    def _pick_crawler(self, url):
        for c in self._crawlers:
            if c._base_url.rstrip("/") in url: return c
        return self._fallback

    async def get_chapters(self, url): return await self._pick_crawler(url).get_chapters(url)
    async def get_content(self, url): return await self._pick_crawler(url).get_content(url)

crawler_manager = CrawlerManager()