"""流式章节内容获取器 - 使用 scrapling StealthyFetcher 绕过 Cloudflare"""
import re
import time
from urllib.parse import urljoin, urlparse
from scrapling.fetchers import StealthyFetcher
from cleaners.content import clean_html

# 尝试导入，如果失败则标记为不可用
STEALTHY_AVAILABLE = True

def _real_base(url: str) -> str:
    p = urlparse(url)
    return f"{p.scheme}://{p.netloc}"

def fetch_chapter_stream(chapter_url: str, max_pages: int = 8):
    """流式获取章节内容 - 生成器，逐页 yield"""
    base = _real_base(chapter_url)
    url = chapter_url
    seen = set()
    title = ""
    total = 0

    for pg in range(max_pages):
        t0 = time.time()
        try:
            page = StealthyFetcher.fetch(
                url,
                headless=True,
                solve_cloudflare=True,
                timeout=60000,
                network_idle=True,
            )
        except Exception as e:
            print(f"[Stream] Page {pg+1} FAIL: {e}")
            break

        elapsed = time.time() - t0
        content_el = page.css('div#content')
        if not content_el:
            content_el = page.css('div#htmlContent')

        text = ""
        if content_el:
            raw = content_el[0].get_all_text(strip=True)
            if raw:
                text = clean_html(raw)

        if not title and text:
            first_line = text.split('\n')[0].strip()
            if len(first_line) < 50:
                title = first_line

        chunk_len = len(text)
        total += chunk_len
        print(f"[Stream] Page {pg+1}: {chunk_len} chars in {elapsed:.1f}s (total: {total})")

        if text:
            yield {"page": pg+1, "text": text, "title": title}

        # Find next page link
        next_url = None
        for a in page.css('a'):
            if not a: continue
            a_text = a.get_all_text(strip=True) if hasattr(a, 'get_all_text') else ""
            if a_text and re.search(r'下一页|下一章|继续|下一节', a_text):
                href = a.attrib.get('href', '') if hasattr(a, 'attrib') else ""
                if href:
                    next_url = urljoin(base, href)
                    break

        if not next_url:
            next_a = page.css('a#aKeyNextPage')
            if next_a and hasattr(next_a[0], 'attrib'):
                href = next_a[0].attrib.get('href', '')
                if href:
                    next_url = urljoin(base, href)

        if next_url and next_url not in seen:
            seen.add(next_url)
            url = next_url
        else:
            break