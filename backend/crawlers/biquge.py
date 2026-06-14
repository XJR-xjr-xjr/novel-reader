import re
import httpx
from urllib.parse import urlparse, urljoin
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

    def _real_base(self, url: str) -> str:
        p = urlparse(url)
        return f"{p.scheme}://{p.netloc}"

    async def search(self, keyword: str) -> list[SearchResult]:
        results = await self._search_site(keyword)
        if results: return results
        return await self._search_ddg(keyword)

    async def _search_site(self, keyword: str) -> list[SearchResult]:
        results = []
        seen = set()
        try:
            async with httpx.AsyncClient(timeout=12, follow_redirects=True) as cl:
                r = await cl.get(f"{self._base_url}/search.html?searchkey={keyword}", headers={"User-Agent": UA})
                if r.status_code != 200: return results
                soup = BeautifulSoup(r.text, 'lxml')
                for a in soup.select('a[href*="/book/"], a[href*="/novel/"], a[href*="/info/"]'):
                    t = a.get_text().strip()
                    h = a.get('href', '')
                    if len(t) < 2: continue
                    u = urljoin(self._base_url, h)
                    if u in seen: continue
                    seen.add(u)
                    results.append(SearchResult(title=t, author="",
                        sources=[SourceInfo(site_name=self._name, site_url=u, status="online")]))
                if results: return results
        except Exception: pass
        return results

    async def _search_ddg(self, keyword: str) -> list[SearchResult]:
        results = []
        try:
            q = f"{keyword} 小说 免费 在线阅读"
            async with httpx.AsyncClient(timeout=18, follow_redirects=True) as cl:
                r = await cl.get("https://html.duckduckgo.com/html/", params={"q": q}, headers={"User-Agent": UA})
                if r.status_code != 200: return results
                soup = BeautifulSoup(r.text, 'lxml')
                for link in soup.select('a.result__a, a.result__url, .result a'):
                    href = link.get('href', '')
                    text = link.get_text().strip()
                    if not href or not text or len(text) < 4: continue
                    domain = re.search(r'https?://([^/]+)', href)
                    site = domain.group(1) if domain else "未知站"
                    results.append(SearchResult(title=f"{site} {text[:40]}", author="",
                        sources=[SourceInfo(site_name=site, site_url=href, status="online")]))
        except Exception: pass
        return results

    async def get_chapters(self, novel_url: str) -> list[Chapter]:
        """获取目录 - 过滤非章节链接（标签页、作者页等）"""
        chapters = []
        real_base = self._real_base(novel_url)
        # 从 novel_url 提取 book id 用于过滤
        book_id_match = re.search(r'/book/(\d+)/', novel_url)
        book_id = book_id_match.group(1) if book_id_match else ""

        try:
            async with httpx.AsyncClient(timeout=15, follow_redirects=True) as cl:
                r = await cl.get(novel_url, headers={"User-Agent": UA})
                if r.status_code != 200: return chapters
                soup = BeautifulSoup(r.text, 'lxml')

                for sel in ['dd a', '.chapter a', '#list a', '.listmain a', '.chapterlist a', 'div#list dt ~ dd a']:
                    links = soup.select(sel)
                    if links:
                        for a in links:
                            h = a.get('href', ''); t = a.get_text().strip()
                            if not t or not h or len(t) < 2: continue
                            # Skip non-chapter links
                            if '/tag/' in h or '/author/' in h or '/sort/' in h: continue
                            if h.startswith('javascript') or h == '#': continue
                            # URL must have numbers to be a chapter
                            if book_id and f'/book/{book_id}/' in h and re.search(r'\d+\.html', h):
                                pass
                            elif not re.search(r'/\d+\.html', h) and not re.search(r'/\d+/', h):
                                continue

                            u = urljoin(real_base, h)
                            chapters.append(Chapter(index=len(chapters)+1, title=t, url=u))
                        if chapters: return chapters

                # Fallback: broader search for any .html links
                for a in soup.select('a[href*=".html"]'):
                    h = a.get('href', ''); t = a.get_text().strip()
                    if not t or not h or len(t) < 2: continue
                    if '/tag/' in h or '/author/' in h or '/sort/' in h: continue
                    if h.startswith('javascript') or h == '#': continue
                    u = urljoin(real_base, h)
                    chapters.append(Chapter(index=len(chapters)+1, title=t, url=u))
        except Exception as e:
            print(f"[{self._name}] chapters error: {e}")
        return chapters

    async def get_content(self, chapter_url: str) -> ChapterContent:
        """获取章节内容 - 支持多页自动拼接"""
        try:
            full_content = ""
            title = ""
            next_url = chapter_url

            for page in range(10):  # Max 10 pages per chapter
                async with httpx.AsyncClient(timeout=15, follow_redirects=True) as cl:
                    r = await cl.get(next_url, headers={"User-Agent": UA})
                    if r.status_code != 200: break
                    soup = BeautifulSoup(r.text, 'lxml')

                    if not title:
                        tag = soup.find('h1') or soup.find('title')
                        title = tag.get_text().strip() if tag else ""

                    # Extract content
                    for sel in ['div#content', 'div#booktxt', 'div.content',
                                'div.showtxt', 'div#chaptercontent', 'article',
                                'div#TextContent', 'div#htmlContent',
                                '.chapter-content', '#chapter-content']:
                        div = soup.select_one(sel)
                        if div:
                            full_content += clean_html(str(div)) + "\n"
                            break
                    else:
                        full_content += clean_html(r.text) + "\n"

                    # Check for next page
                    next_link = soup.find('a', string=re.compile(r'下一页|下一章|下一节|继续'))
                    if not next_link:
                        next_link = soup.find('a', href=re.compile(r'_\d+\.html'))
                    if next_link and next_link.get('href'):
                        n = next_link.get('href')
                        next_url = urljoin(self._real_base(chapter_url), n)
                        if next_url == chapter_url: break
                    else:
                        break

            return ChapterContent(title=title, content=full_content.strip())
        except Exception:
            return ChapterContent(title="", content="")