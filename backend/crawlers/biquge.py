import re, httpx
from urllib.parse import urlparse, urljoin
from bs4 import BeautifulSoup
from crawlers.base import CrawlerBase
from models.schemas import SearchResult, SourceInfo, Chapter, ChapterContent
from cleaners.content import clean_html

UA = ("Mozilla/5.0 (iPhone; CPU iPhone OS 16_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.6 Mobile/15E148 Safari/604.1")

class BiqugeCrawler(CrawlerBase):
    def __init__(self, base_url="https://www.biquge.cc"):
        self._base_url = base_url.rstrip("/")
        self._name = re.sub(r"https?://(www\.)?","",base_url).split(".")[0]

    @property
    def site_name(self): return self._name
    def _real_base(self, u): p=urlparse(u); return f"{p.scheme}://{p.netloc}"

    async def search(self, kw):
        r=await self._search_site(kw)
        if r: return r
        r=await self._search_ddg(kw)
        if r: return r
        return await self._search_baidu(kw)

    async def _search_site(self, kw):
        res=[]; seen=set()
        try:
            async with httpx.AsyncClient(timeout=8,follow_redirects=True) as c:
                r=await c.get(f"{self._base_url}/search.html?searchkey={kw}", headers={"User-Agent":UA})
                if r.status_code!=200: return res
                soup=BeautifulSoup(r.text,"lxml")
                for a in soup.select('a[href*="/book/"],a[href*="/novel/"],a[href*="/info/"]'):
                    t=a.get_text().strip(); h=a.get("href","")
                    if len(t)<2: continue
                    u=urljoin(self._base_url,h)
                    if u in seen: continue; seen.add(u)
                    res.append(SearchResult(title=t,author="",sources=[SourceInfo(site_name=self._name,site_url=u,status="online")]))
        except: pass
        return res

    async def _search_ddg(self, kw):
        res=[]
        try:
            async with httpx.AsyncClient(timeout=12,follow_redirects=True) as c:
                r=await c.get("https://html.duckduckgo.com/html/",params={"q":kw+" 小说 免费 全文 在线阅读"},headers={"User-Agent":UA})
                if r.status_code!=200: return res
                soup=BeautifulSoup(r.text,"lxml")
                for a in soup.select("a.result__a,a.result__url,.result a"):
                    h=a.get("href",""); t=a.get_text().strip()
                    if not h or len(t)<4: continue
                    d=re.search(r"https?://([^/]+)",h)
                    site=d.group(1) if d else "unknown"
                    res.append(SearchResult(title=site+" "+t[:40],author="",sources=[SourceInfo(site_name=site,site_url=h,status="online")]))
        except: pass
        return res

    async def _search_baidu(self, kw):
        """Baidu search - alternative engine"""
        res=[]
        try:
            async with httpx.AsyncClient(timeout=12,follow_redirects=True) as c:
                r=await c.get("https://www.baidu.com/s",params={"wd":kw+" 小说 免费阅读","rn":"20"},headers={"User-Agent":UA})
                if r.status_code!=200: return res
                soup=BeautifulSoup(r.text,"lxml")
                for a in soup.select("a[href]"):
                    h=a.get("href",""); t=a.get_text().strip()
                    if not h or len(t)<4 or "baidu.com" in h: continue
                    d=re.search(r"https?://([^/]+)",h)
                    site=d.group(1) if d else "unknown"
                    res.append(SearchResult(title=site+" "+t[:40],author="",sources=[SourceInfo(site_name=site,site_url=h,status="online")]))
        except: pass
        return res

    async def get_chapters(self, novel_url):
        chs=[]; rb=self._real_base(novel_url)
        try:
            async with httpx.AsyncClient(timeout=15,follow_redirects=True) as c:
                r=await c.get(novel_url,headers={"User-Agent":UA})
                if r.status_code!=200: return chs
                soup=BeautifulSoup(r.text,"lxml")
                for sel in ["dd a",".chapter a","#list a",".listmain a","div#list dt ~ dd a"]:
                    links=soup.select(sel)
                    if links:
                        for a in links:
                            h=a.get("href",""); t=a.get_text().strip()
                            if not t or len(t)<2: continue
                            if "/tag/" in h or "/author/" in h: continue
                            if h.startswith("javascript"): continue
                            u=urljoin(rb,h)
                            chs.append(Chapter(index=len(chs)+1,title=t,url=u))
                        if chs: return chs
                for a in soup.select('a[href*=".html"]'):
                    h=a.get("href",""); t=a.get_text().strip()
                    if not t or len(t)<2: continue
                    if "/tag/" in h or "/author/" in h: continue
                    chs.append(Chapter(index=len(chs)+1,title=t,url=urljoin(rb,h)))
        except: pass
        return chs

    async def get_content(self, chapter_url):
        try:
            full=""; title=""; next_url=chapter_url; seen=set()
            for page in range(5):
                async with httpx.AsyncClient(timeout=15,follow_redirects=True) as c:
                    r=await c.get(next_url,headers={"User-Agent":UA})
                    if r.status_code!=200: break
                    soup=BeautifulSoup(r.text,"lxml")
                    if not title:
                        t=soup.find("h1") or soup.find("title")
                        title=t.get_text().strip() if t else ""
                    for sel in ["div#content","div#booktxt","div.content","div.showtxt","article","div#TextContent"]:
                        div=soup.select_one(sel)
                        if div:
                            full+=clean_html(str(div))+"\n"; break
                    else: full+=clean_html(r.text)+"\n"
                    # Multi-page
                    nxt=None
                    nxt=soup.find(id="aKeyNextPage")
                    if not nxt:
                        for a in soup.find_all("a"):
                            if a.get_text() and re.search(r"下一页|下一章|继续阅读|下一节",a.get_text()):
                                nxt=a; break
                    if nxt and nxt.get("href"):
                        nu=urljoin(self._real_base(chapter_url),nxt.get("href"))
                        if nu in seen: break; seen.add(nu); next_url=nu
                    else: break
            return ChapterContent(title=title,content=full.strip())
        except: return ChapterContent(title="",content="")