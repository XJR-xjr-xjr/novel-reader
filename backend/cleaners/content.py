from bs4 import BeautifulSoup
import re


def clean_html(html: str) -> str:
    soup = BeautifulSoup(html, 'lxml')

    for tag in soup(['script', 'style', 'ins', 'iframe', 'nav',
                      'footer', 'header', 'aside', 'noscript',
                      'svg', 'form', 'button']):
        tag.decompose()

    ad_patterns = re.compile(
        r'(广告|推广|推荐阅读|本章未完|点击下一页|手机用户请访问)',
        re.IGNORECASE
    )

    text = soup.get_text(separator='\n')
    lines = []
    for line in text.split('\n'):
        line = line.strip()
        if line and not ad_patterns.search(line) and len(line) > 2:
            lines.append(line)

    return '\n'.join(lines)