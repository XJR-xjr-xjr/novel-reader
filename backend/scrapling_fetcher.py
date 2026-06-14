import re, time
from urllib.parse import urljoin, urlparse
from scrapling.fetchers import StealthyFetcher

def _real_base(url): p=urlparse(url); return f"{p.scheme}://{p.netloc}"

def fetch_chapter_stream(chapter_url, max_pages=5):
    base = _real_base(chapter_url)
    url = chapter_url
    seen = set()

    for pg in range(max_pages):
        t0 = time.time()
        try:
            page = StealthyFetcher.fetch(url, headless=True, solve_cloudflare=True, timeout=60000, network_idle=True)
        except Exception as e:
            yield {"error": f"StealthyFetcher fail page {pg+1}: {e}"}
            break

        elapsed = time.time() - t0
        content_el = page.css('div#content')
        if not content_el:
            content_el = page.css('div#htmlContent')

        text = ""
        if content_el:
            text = content_el[0].get_all_text(strip=True) if content_el else ""

        if not text:
            yield {"error": f"Page {pg+1}: no content found in div (status {page.status})"}
            break

        yield {"page": pg+1, "text": text, "elapsed": f"{elapsed:.1f}s"}

        # Find next page
        next_url = None
        for a in page.css('a'):
            if not a: continue
            at = a.get_all_text(strip=True) if hasattr(a, 'get_all_text') else ""
            if at and re.search(r'下一页|下一章|继续|下一节|next', at):
                h = a.attrib.get('href', '') if hasattr(a, 'attrib') else ""
                if h:
                    next_url = urljoin(base, h)
                    break

        if not next_url:
            for selector in ['a#aKeyNextPage', 'a.next', 'a.nextPage']:
                nxt = page.css(selector)
                if nxt and hasattr(nxt[0], 'attrib'):
                    h = nxt[0].attrib.get('href', '')
                    if h:
                        next_url = urljoin(base, h)
                        break

        if next_url and next_url not in seen:
            seen.add(next_url)
            url = next_url
        else:
            break