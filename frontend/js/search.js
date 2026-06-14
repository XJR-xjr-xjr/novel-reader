 const Search = {
  // === 搜索记录 ===
  _historyKey: 'novel_search_history',

  _addHistory(keyword) {
    let hist = [];
    try { hist = JSON.parse(localStorage.getItem(this._historyKey) || '[]'); } catch(e) {}
    hist = hist.filter(h => h !== keyword);
    hist.unshift(keyword);
    hist = hist.slice(0, 10);
    localStorage.setItem(this._historyKey, JSON.stringify(hist));
    this._renderHistory();
  },

  _renderHistory() {
    let cont = document.getElementById('search-history');
    if (!cont) return;
    let hist = [];
    try { hist = JSON.parse(localStorage.getItem(this._historyKey) || '[]'); } catch(e) {}
    if (hist.length === 0) { cont.style.display = 'none'; return; }
    cont.style.display = '';
    cont.innerHTML = '<div class="history-title">最近搜索</div>' +
      hist.map(function(h){ return '<div class="history-item">' + Utils.escapeHtml(h) + '</div>'; }).join('');
    var self = this;
    cont.querySelectorAll('.history-item').forEach(function(el){
      el.addEventListener('click', function(){
        document.getElementById('search-page-input').value = el.textContent;
        self.doSearch(el.textContent);
      });
    });
  },
   async init() {
    this._renderHistory();
     const input = document.getElementById('search-page-input');
     const btn = document.getElementById('search-page-btn');
     const back = document.getElementById('search-back');
 
     back.addEventListener('click', () => window.location.href = 'index.html');
 
     // 从 URL 读取初始搜索词
     const params = new URLSearchParams(window.location.search);
     const q = params.get('q');
     if (q) { this._addHistory(q);
       input.value = q;
       this.doSearch(q);
     }
 
     const perform = () => {
       const q = input.value.trim();
       if (q) this.doSearch(q);
     };
 
     btn.addEventListener('click', perform);
     input.addEventListener('keydown', (e) => { if (e.key === 'Enter') perform(); });
   },
 
   async doSearch(keyword) {
     const container = document.getElementById('search-results');
     const empty = document.getElementById('search-empty');
     empty.style.display = 'none';
     container.innerHTML = '<div class="spinner">搜索中</div>';
 
     try {
       const results = await API.search(keyword);
       container.innerHTML = '';
 
       if (!results || results.length === 0) {
         empty.style.display = '';
         empty.innerHTML = '<p>未找到相关小说，请尝试更换关键词</p>';
         return;
       }
 
       for (const item of results) {
         const div = document.createElement('div');
         div.className = 'search-result-item';
 
         let sourcesHtml = item.sources.map(s =>
           `<span class="source-tag ${s.status}">${s.site_name}</span>`
         ).join('');
 
         const firstOnline = item.sources.find(s => s.status === 'online');
         const dataAttr = firstOnline ? `data-read-url="${firstOnline.site_url}" data-read-site="${firstOnline.site_name}"` : '';
 
         div.innerHTML = `
           <div class="result-title">${Utils.escapeHtml(item.title)}</div>
           <div class="result-author">${Utils.escapeHtml(item.author || '未知作者')}</div>
           <div class="result-sources">${sourcesHtml}</div>
           <div class="result-actions">
             <button class="btn-read" ${dataAttr}>开始阅读</button>
             <button class="btn-shelf" data-title="${Utils.escapeHtml(item.title)}" data-author="${Utils.escapeHtml(item.author)}">加入书架</button>
           </div>`;
 
         container.appendChild(div);
 
         // 绑定事件
         const readBtn = div.querySelector('.btn-read');
         readBtn.addEventListener('click', async () => {
           const url = readBtn.dataset.readUrl;
           const site = readBtn.dataset.readSite;
           if (!url || !site) return alert('该站点暂时不可用');
           // 先加入书架再跳转
           const id = await this._addToShelf(item, url, site);
           window.location.href = `reader.html?id=${id}`;
         });
 
         const shelfBtn = div.querySelector('.btn-shelf');
         shelfBtn.addEventListener('click', async () => {
           const url = firstOnline ? firstOnline.site_url : '';
           const site = firstOnline ? firstOnline.site_name : '';
           await this._addToShelf(item, url, site);
           alert('已加入书架');
         });
       }
     } catch (err) {
       container.innerHTML = `<div class="empty-state"><p>搜索失败：${err.message}</p></div>`;
     }
   },
 
   async _addToShelf(item, readUrl, readSite) {
     const books = await DB.getAllBooks();
     const existing = books.find(b => b.title === item.title && b.author === item.author);
     if (existing) return existing.id;
 
     const book = {
       title: item.title,
       author: item.author,
       currentChapterIndex: 1,
       currentChapterTitle: '',
       totalChapters: 0,
       progress: 0,
       currentSource: readUrl,
       currentSourceName: readSite,
       lastReadAt: Date.now(),
       latestChapterTitle: ''
     };
     return await DB.addBook(book);
   }
 };
 
 document.addEventListener('DOMContentLoaded', () => Search.init());
