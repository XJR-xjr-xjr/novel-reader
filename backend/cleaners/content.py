from bs4 import BeautifulSoup
import re

def clean_html(html: str) -> str:
    soup = BeautifulSoup(html, 'lxml')
    # Remove ALL non-content tags
    for tag in soup(['script','style','ins','iframe','nav','footer','header',
                      'aside','noscript','svg','form','button','meta','link',
                      'img','input','select','textarea','a','ul','ol','br','hr']):
        tag.decompose()

    # Remove common ad/nav patterns
    junk = re.compile(r'(广告|推广|推荐阅读|手机用户|手机阅读|wap\.|m\.|\.com|http|copyright|CopyRight|版权所有)', re.I)
    
    text = soup.get_text(separator='\n')
    lines = []
    for line in text.split('\n'):
        line = line.strip()
        # Skip junk lines
        if not line or len(line) < 3: continue
        if junk.search(line): continue
        # Skip lines that are just URLs, domains, or site names
        if re.match(r'^[\w\-\.]+\.[a-z]{2,}$', line): continue
        if re.match(r'^[\w]+[\u4e00-\u9fff]+$', line) and len(line) < 6: continue
        lines.append(line)
    return '\n'.join(lines)