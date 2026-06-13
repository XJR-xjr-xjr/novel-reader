import re
import httpx
from bs4 import BeautifulSoup
from crawlers.base import CrawlerBase
from models.schemas import SearchResult, SourceInfo, Chapter, ChapterContent
from cleaners.content import clean_html


class BiqugeCrawler(CrawlerBase):

    def __init__(self, base_url: str = "https://www.biquge.cc"):
        self._base_url = base_url.rstrip("/")
        # 从 URL 提取站点名
        domain = re.sub(r'https?://(www\.)?', '', base_url).split('.')[0]
        self._name = f"{domain}(笔趣阁)"

    @property
    def site_name(self) -> str:
        return self._name

    async def search(self, keyword: str) -> list[SearchResult]:
        """搜索：先直接搜站点，失败则用 DuckDuckGo 全网搜"""
        results = await self._search_site(keyword)
        if not results:
            results = await self._search_web(keyword)
        return results

    async def _search_site(self, keyword: str) -> list[SearchResult]:
        """直接搜索站点内部搜索"""
        results = []
        try:
            async with httpx.AsyncClient(timeout=10.0, follow_redirects=True) as client:
                resp = await client.get(
                    f"{self._base_url}/search.html",
                    params={"searchkey": keyword, "searchtype": "articlename"},
                    headers={"User-Agent": "Mozilla/5.0"}
                )
                if resp.status_code != 200:
                    return results
                soup = BeautifulSoup(resp.text, 'lxml')
                items = soup.select('.result-item, .result-list li, table.grid tr')
                if not items:
                    items = soup.select('a[href*="/book/"]')
                
                for item in items[:20]:
                    link = item.find('a')
                    if not link: continue
                    href = link.get('href', '')
                    title = link.get_text().strip()
                    if not title or len(title) < 2: continue
                    
                    url = href if href.startswith('http') else f"{self._base_url}{href}"
                    results.append(SearchResult(
                        title=title, author="",
                        sources=[SourceInfo(site_name=self._name, site_url=url, status="online")]
                    ))
        except Exception:
            pass
        return results

    async def _search_web(self, keyword: str) -> list[SearchResult]:
        """通过 DuckDuckGo 全网搜索小说"""
        results = []
        try:
            query = f"{keyword} 小说 免费阅读 全文"
            async with httpx.AsyncClient(timeout=15.0, follow_redirects=True) as client:
                resp = await client.get(
                    "https://html.duckduckgo.com/html/",
                    params={"q": query},
                    headers={"User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15"}
                )
                if resp.status_code != 200:
                    return results
                soup = BeautifulSoup(resp.text, 'lxml')
                
                novel_keywords = [keyword, '小说', '章', '节', '免费']
                for link in soup.select('a.result__a'):
                    href = link.get('href', '')
                    text = link.get_text().strip()
                    if not href or not text: continue

                    # 判断是否为小说相关链接
                    is_novel = all(k in (text + href) for k in novel_keywords[:1])
                    is_novel = is_novel or any(k in text for k in ['笔趣阁', '小说', '免费阅读', '全文', '章节', '目录'])
                    
                    if not is_novel: continue

                    domain = re.search(r'https?://([^/]+)', href)
                    domain_name = domain.group(1) if domain else "未知站点"
                    
                    results.append(SearchResult(
                        title=f"[{domain_name}] {text[:30]}",
                        author="",
                        sources=[SourceInfo(site_name=domain_name, site_url=href, status="online")]
                    ))
        except Exception:
            pass
        return results

    async def get_chapters(self, novel_url: str) -> list[Chapter]:
        chapters = []
        try:
            async with httpx.AsyncClient(timeout=15.0, follow_redirects=True) as client:
                resp = await client.get(novel_url, headers={
                    "User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15"
                })
                resp.raise_for_status()
                soup = BeautifulSoup(resp.text, 'lxml')
                dd_list = soup.select('dd a, .chapterlist a, div#list a, .listmain a')
                if not dd_list:
                    dd_list = soup.select('a[href*=".html"]')

                for idx, a_tag in enumerate(dd_list, start=1):
                    href = a_tag.get('href', '')
                    title = a_tag.get_text().strip()
                    if not title or not href: continue
                    if href.startswith('http'):
                        url = href
                    elif href.startswith('/'):
                        url = f"{self._base_url}{href}"
                    else:
                        base = novel_url.rsplit('/', 1)[0]
                        url = f"{base}/{href}"
                    chapters.append(Chapter(index=idx, title=title, url=url))
        except Exception:
            pass
        return chapters

    async def get_content(self, chapter_url: str) -> ChapterContent:
        try:
            async with httpx.AsyncClient(timeout=15.0, follow_redirects=True) as client:
                resp = await client.get(chapter_url, headers={
                    "User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15"
                })
                resp.raise_for_status()
                soup = BeautifulSoup(resp.text, 'lxml')
                title_tag = soup.find('h1') or soup.find('title')
                title = title_tag.get_text().strip() if title_tag else ""
                content_div = (
                    soup.find('div', id='content') or
                    soup.find('div', id='booktxt') or
                    soup.find('div', class_='content') or
                    soup.find('div', class_='showtxt') or
                    soup.find('div', id='chaptercontent') or
                    soup.find('article')
                )
                raw_html = str(content_div) if content_div else resp.text
                content = clean_html(raw_html)
                return ChapterContent(title=title, content=content)
        except Exception:
            return ChapterContent(title="", content="")
