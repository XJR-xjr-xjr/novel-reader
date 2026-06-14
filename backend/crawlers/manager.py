import asyncio, re
import httpx
from bs4 import BeautifulSoup
from crawlers.base import CrawlerBase
from crawlers.biquge import BiqugeCrawler
from models.schemas import SearchResult, Chapter, ChapterContent

CLOUDFLARE_SIGNS = [re.compile(p, re.I) for p in [
    r'cloudflare', r'cf-browser-verify', r'_cf_chl_opt',
    r'Just a moment', r'cf-ray', r'cf-cache-status'
]]

NOVEL_MARKERS = [re.compile(p) for p in [
    r'第[一二三四五六七八九十百千万\d]+章', r'目录', r'章节列表',
    r'book', r'novel', r'小说', r'免费阅读'
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
        try:
            async with httpx.AsyncClient(timeout=2.0, follow_redirects=True) as c:
                r = await c.get(url, headers={"User-Agent": "Mozilla/5.0"})
                body = r.text[:1000]
                for p in CLOUDFLARE_SIGNS:
                    if p.search(body): return True
        except Exception: return False
        return False

    async def _is_novel_page(self, url: str) -> bool:
        """Quick check if URL looks like a novel page"""
        try:
            async with httpx.AsyncClient(timeout=3.0, follow_redirects=True) as c:
                r = await c.get(url, headers={"User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 16_6 like Mac OS X) AppleWebKit/605.1.15"})
                if r.status_code != 200: return False
                soup = BeautifulSoup(r.text[:5000], 'lxml')
                text = soup.get_text()
                # Must have Chinese characters and at least one novel marker
                has_chinese = len(re.findall(r'[\u4e00-\u9fff]', text))
                if has_chinese < 50: return False
                for p in NOVEL_MARKERS:
                    if p.search(text): return True
        except Exception: return False
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
        # Filter: remove Cloudflare + non-novel pages
        clean = []
        for novel in final:
            ok = []
            for src in novel.sources:
                if await self._has_cloudflare(src.site_url):
                    continue
                if not await self._is_novel_page(src.site_url):
                    continue
                ok.append(src)
            if ok:
                novel.sources = ok
                clean.append(novel)
        return clean

    def _pick_crawler(self, url):
        for c in self._crawlers:
            if c._base_url.rstrip("/") in url: return c
        return self._fallback

    async def get_chapters(self, url): return await self._pick_crawler(url).get_chapters(url)
    async def get_content(self, url): return await self._pick_crawler(url).get_content(url)

crawler_manager = CrawlerManager()