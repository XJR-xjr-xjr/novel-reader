import asyncio
import httpx
from crawlers.base import CrawlerBase
from crawlers.biquge import BiqugeCrawler
from models.schemas import SearchResult, Chapter, ChapterContent

CLOUDFLARE_HEADERS = {'cf-ray', 'cf-cache-status', 'server'}
CLOUDFLARE_KEYWORDS = ['cloudflare', 'cf-browser-verify', '_cf_chl_opt', 'Just a moment']

class CrawlerManager:
    def __init__(self):
        self._crawlers = [
            BiqugeCrawler("https://www.biquge.cc"),
            BiqugeCrawler("https://www.xbiquge.net"),
            BiqugeCrawler("https://www.biquge.info"),
        ]
        self._fallback = BiqugeCrawler("https://generic")

    async def _check_cloudflare(self, url: str) -> bool:
        """Returns True if site is blocked by Cloudflare"""
        try:
            async with httpx.AsyncClient(timeout=5, follow_redirects=True) as c:
                r = await c.get(url, headers={"User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 16_6 like Mac OS X) AppleWebKit/605.1.15"})
                # Check response headers for CF indicators
                for h in CLOUDFLARE_HEADERS:
                    if h in r.headers:
                        return True
                # Check body for CF challenge page
                body = r.text[:500].lower()
                for kw in CLOUDFLARE_KEYWORDS:
                    if kw.lower() in body:
                        return True
        except Exception:
            return True  # Can't reach at all = effectively blocked
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
        
        # Filter: check each source for Cloudflare
        for novel in final:
            valid_sources = []
            for src in novel.sources:
                if not await self._check_cloudflare(src.site_url):
                    valid_sources.append(src)
                else:
                    print(f"[CF] Skipping {src.site_url}")
            novel.sources = valid_sources if valid_sources else novel.sources

        return [n for n in final if n.sources]

    def _pick_crawler(self, url):
        for c in self._crawlers:
            if c._base_url.rstrip("/") in url: return c
        return self._fallback

    async def get_chapters(self, novel_url): return await self._pick_crawler(novel_url).get_chapters(novel_url)
    async def get_content(self, chapter_url): return await self._pick_crawler(chapter_url).get_content(chapter_url)

crawler_manager = CrawlerManager()