import re
import httpx
from bs4 import BeautifulSoup
from crawlers.base import CrawlerBase
from models.schemas import SearchResult, SourceInfo, Chapter, ChapterContent
from cleaners.content import clean_html


class BiqugeCrawler(CrawlerBase):

    def __init__(self, base_url: str = "https://www.biquge.com"):
        self._base_url = base_url.rstrip("/")
        self._headers = {
            "User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) "
                          "AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1"
        }

    @property
    def site_name(self) -> str:
        return "笔趣阁"

    async def search(self, keyword: str) -> list[SearchResult]:
        results = []
        try:
            async with httpx.AsyncClient(headers=self._headers, timeout=15.0) as client:
                resp = await client.get(
                    f"{self._base_url}/search.html",
                    params={"searchkey": keyword}
                )
                resp.raise_for_status()
                soup = BeautifulSoup(resp.text, 'lxml')

                items = soup.select('.result-item, .search-result li, .novelslist li, table tr')
                if not items:
                    items = soup.select('a[href*="/book/"]')

                seen = set()
                for item in items:
                    link = item.find('a')
                    if not link:
                        continue
                    href = link.get('href', '')
                    if not href or '/book/' not in href:
                        continue

                    title = link.get_text().strip()
                    author_tag = item.find('p', class_=re.compile(r'author'))
                    if not author_tag:
                        author_tag = item.find('span', class_=re.compile(r'author'))
                    author = author_tag.get_text().strip() if author_tag else ""

                    if title in seen:
                        continue
                    seen.add(title)

                    full_url = href if href.startswith('http') else f"{self._base_url}{href}"
                    results.append(SearchResult(
                        title=title,
                        author=author,
                        sources=[SourceInfo(
                            site_name=self.site_name,
                            site_url=full_url,
                            status="online"
                        )]
                    ))
        except Exception as e:
            print(f"[Biquge] search error: {e}")
        return results

    async def get_chapters(self, novel_url: str) -> list[Chapter]:
        chapters = []
        try:
            async with httpx.AsyncClient(headers=self._headers, timeout=15.0) as client:
                resp = await client.get(novel_url)
                resp.raise_for_status()
                soup = BeautifulSoup(resp.text, 'lxml')

                dd_list = soup.select('dd a, .chapter-list a, ul.chapter li a, .listmain a')
                if not dd_list:
                    dd_list = soup.select('a[href*="/book/"][href*=".html"]')

                for idx, a_tag in enumerate(dd_list, start=1):
                    href = a_tag.get('href', '')
                    title = a_tag.get_text().strip()
                    if not title or not href:
                        continue
                    url = href if href.startswith('http') else f"{self._base_url}{href}"
                    chapters.append(Chapter(index=idx, title=title, url=url))
        except Exception as e:
            print(f"[Biquge] get_chapters error: {e}")
        return chapters

    async def get_content(self, chapter_url: str) -> ChapterContent:
        try:
            async with httpx.AsyncClient(headers=self._headers, timeout=15.0) as client:
                resp = await client.get(chapter_url)
                resp.raise_for_status()
                soup = BeautifulSoup(resp.text, 'lxml')

                title_tag = soup.find('h1') or soup.find('title')
                title = title_tag.get_text().strip() if title_tag else ""

                content_div = (
                    soup.find('div', id='content') or
                    soup.find('div', class_='content') or
                    soup.find('div', id='booktxt') or
                    soup.find('div', class_='showtxt') or
                    soup.find('article')
                )

                if content_div:
                    raw_html = str(content_div)
                else:
                    raw_html = resp.text

                content = clean_html(raw_html)
                return ChapterContent(title=title, content=content)
        except Exception as e:
            print(f"[Biquge] get_content error: {e}")
            return ChapterContent(title="", content="")