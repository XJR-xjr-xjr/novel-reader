 const API = {
   get baseUrl() {
     // 生产环境（同源部署）：空字符串，请求发到当前域名
     // 本地开发时请修改为 'http://127.0.0.1:8282'
     return '';
   },
 
   async search(keyword) {
     const url = `${this.baseUrl}/api/search?q=${encodeURIComponent(keyword)}`;
     const res = await fetch(url);
     if (!res.ok) throw new Error('搜索失败');
     return res.json();
   },
 
   async getChapters(novelUrl) {
     const url = `${this.baseUrl}/api/chapters?url=${encodeURIComponent(novelUrl)}`;
     const res = await fetch(url);
     if (!res.ok) throw new Error('获取目录失败');
     return res.json();
   },
 
   async getChapterContent(chapterUrl) {
     const url = `${this.baseUrl}/api/chapter/content?url=${encodeURIComponent(chapterUrl)}`;
     const res = await fetch(url);
     if (!res.ok) throw new Error('获取章节内容失败');
     return res.json();
   }
 };
