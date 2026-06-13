from abc import ABC, abstractmethod
from models.schemas import SearchResult, Chapter, ChapterContent


class CrawlerBase(ABC):

    @abstractmethod
    async def search(self, keyword: str) -> list[SearchResult]:
        pass

    @abstractmethod
    async def get_chapters(self, novel_url: str) -> list[Chapter]:
        pass

    @abstractmethod
    async def get_content(self, chapter_url: str) -> ChapterContent:
        pass

    @property
    @abstractmethod
    def site_name(self) -> str:
        pass