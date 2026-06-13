import asyncio
from crawlers.base import CrawlerBase
from crawlers.biquge import BiqugeCrawler
from models.schemas import SearchResult, Chapter, ChapterContent


class CrawlerManager:

    def __init__(self):
        self._crawlers: list[CrawlerBase] = [
            BiqugeCrawler("https://www.biquge.com"),
        ]

    async def search_all(self, keyword: str) -> list[SearchResult]:
        tasks = [crawler.search(keyword) for crawler in self._crawlers]
        results = await asyncio.gather(*tasks, return_exceptions=True)

        novel_map: dict[str, SearchResult] = {}
        for crawler, result in zip(self._crawlers, results):
            if isinstance(result, Exception):
                print(f"[Manager] {crawler.site_name} failed: {result}")
                continue
            for item in result:
                key = f"{item.title}|{item.author}"
                if key not in novel_map:
                    novel_map[key] = item
                else:
                    existing = {s.site_url for s in novel_map[key].sources}
                    for src in item.sources:
                        if src.site_url not in existing:
                            novel_map[key].sources.append(src)

        return list(novel_map.values())

    def _match_crawler(self, url: str) -> CrawlerBase | None:
        for crawler in self._crawlers:
            if crawler._base_url.rstrip("/") in url:
                return crawler
        return None

    async def get_chapters(self, novel_url: str) -> list[Chapter]:
        crawler = self._match_crawler(novel_url)
        if not crawler:
            return []
        return await crawler.get_chapters(novel_url)

    async def get_content(self, chapter_url: str) -> ChapterContent:
        crawler = self._match_crawler(chapter_url)
        if not crawler:
            return ChapterContent(title="", content="")
        return await crawler.get_content(chapter_url)


crawler_manager = CrawlerManager()