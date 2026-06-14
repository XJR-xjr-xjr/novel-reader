import re
import httpx
from bs4 import BeautifulSoup
from crawlers.base import CrawlerBase
from models.schemas import SearchResult, SourceInfo, Chapter, ChapterContent
from cleaners.content import clean_html


UA = ("Mozilla/5.0 (iPhone; CPU iPhone OS 16_6 like Mac OS X) "
      "AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.6 Mobile/15E148 Safari/604.1")

class BiqugeCrawler(CrawlerBase):

    def __init__(self, base_url: str = "https://www.biquge.cc"):
        self._base_url = base_url.rstrip("/")
        domain = re.sub(r'https?://(www\.)?', '', base_url).split('.')[0]
        self._name = domain

    @property
    def site_name(self) -> str:
        return self._name

    async def search(self, keyword: str) -> list[SearchResult]:
        results = await self._search_site(keyword)
        if results:
            return results
        return await self._search_ddg(keyword)

    async def _search_site(self, keyword: str) -> list[SearchResult]:
        results = []
        try_urls = [
            f"{self._base_url}/search.html?searchkey={keyword}",
            f"{self._base_url}/search?keyword={keyword}",
            f"{self._base_url}/modules/article/search.php?searchkey={keyword}",
        ]
        seen = set()
        for url in try_urls:
            try:
                async with httpx.AsyncClient(timeout=12, follow_redirects=True) as cl:
                    r = await cl.get(url, headers={"User-Agent": UA})
                    if r.status_code != 200: continue
                    soup = BeautifulSoup(r.text, 'lxml')
                    for a in soup.select('a[href*="/book/"], a[href*="/novel/"], a[href*="/info/"]'):
                        t = a.get_text().strip()
                        h = a.get('href', '')
                        if len(t) < 2: continue
                        u = h if h.startswith('http') else self._base_url + h
                        if u in seen: continue
                        seen.add(u)
                        results.append(SearchResult(
                            title=t, author="",
                            sources=[SourceInfo(site_name=self._name, site_url=u, status="online")]))
                    if results: return results
            except Exception:
                continue
        return results

    async def _search_ddg(self, keyword: str) -> list[SearchResult]:
        results = []
        try:
            q = f"{keyword} 小说 免费 在线阅读"
            async with httpx.AsyncClient(timeout=18, follow_redirects=True) as cl:
                r = await cl.get("https://html.duckduckgo.com/html/",
                    params={"q": q}, headers={"User-Agent": UA})
                if r.status_code != 200: return results
                soup = BeautifulSoup(r.text, 'lxml')
                for link in soup.select('a.result__a, a.result__url, .result a'):
                    href = link.get('href', '')
                    text = link.get_text().strip()
                    if not href or not text or len(text) < 4: continue
                    domain = re.search(r'https?://([^/]+)', href)
                    site = domain.group(1) if domain else "未知站"
                    results.append(SearchResult(
                        title=f"{site} - {text[:40]}", author="",
                        sources=[SourceInfo(site_name=site, site_url=href, status="online")]))
        except Exception:
            pass
        return results

    async def get_chapters(self, novel_url: str) -> list[Chapter]:
        """获取目录 - 多格式解析"""
        chapters = []
        try:
            async with httpx.AsyncClient(timeout=15, follow_redirects=True) as cl:
                r = await cl.get(novel_url, headers={"User-Agent": UA})
                if r.status_code != 200: return chapters
                soup = BeautifulSoup(r.text, 'lxml')

                # 尝试所有可能的章节链接选择器
                for sel in ['dd a', 'ul.chapter-list a', '.chapter a', '#list a',
                            '.listmain a', '.chapterlist a', 'div#list dt ~ dd a',
                            'a[href*=".html"]']:
                    links = soup.select(sel)
                    if links:
                        for i, a in enumerate(links, 1):
                            h = a.get('href', ''); t = a.get_text().strip()
                            if not t or not h or len(t) < 2: continue
                            if h.startswith('http'):
                                u = h
                            elif h.startswith('/'):
                                u = f"{self._base_url}{h}"
                            elif h.startswith('javascript'):
                                continue
                            else:
                                u = novel_url.rsplit('/', 1)[0] + '/' + h
                            chapters.append(Chapter(index=i, title=t, url=u))
                        if chapters: return chapters
        except Exception as e:
            print(f"[{self._name}] chapters error: {e}")
        return chapters

    async def get_content(self, chapter_url: str) -> ChapterContent:
        try:
            async with httpx.AsyncClient(timeout=15, follow_redirects=True) as cl:
                r = await cl.get(chapter_url, headers={"User-Agent": UA})
                if r.status_code != 200: return ChapterContent(title="", content="")
                soup = BeautifulSoup(r.text, 'lxml')
                tag = soup.find('h1') or soup.find('title')
                title = tag.get_text().strip() if tag else ""
                for sel in ['div#content', 'div#booktxt', 'div.content',
                            'div.showtxt', 'div#chaptercontent', 'article',
                            'div#TextContent']:
                    div = soup.select_one(sel)
                    if div:
                        content = clean_html(str(div))
                        return ChapterContent(title=title, content=content)
                content = clean_html(r.text)
                return ChapterContent(title=title, content=content)
        except Exception:
            return ChapterContent(title="", content="")