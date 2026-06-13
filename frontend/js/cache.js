 const Cache = {
   PRELOAD_COUNT: 50,
 
   async preloadChapters(novelId, chapters, startIndex) {
     const end = Math.min(startIndex + this.PRELOAD_COUNT, chapters.length);
     for (let i = startIndex; i < end; i++) {
       const ch = chapters[i];
       const cacheKey = `${novelId}_${ch.index}`;
       const existing = await DB.getCache(cacheKey);
       if (existing) continue;
 
       // 异步预加载不阻塞
       this._fetchAndCache(cacheKey, ch.url, ch.title).catch(() => {});
     }
   },
 
   async _fetchAndCache(key, url, title) {
     const data = await API.getChapterContent(url);
     await DB.setCache(key, { title, content: data.content });
   },
 
   async getChapter(novelId, chapterIndex) {
     const cacheKey = `${novelId}_${chapterIndex}`;
     const cached = await DB.getCache(cacheKey);
     return cached || null;
   },
 
   async cleanup(novelId, currentIndex, totalChapters) {
     // LRU 清理：保留已读章节 + 当前章节前后 50 章
     const allNovelKeys = [];
     const db = await DB.open();
     const allCaches = await DB._store('reading_cache', 'readonly').getAll();
 
     const protectedStart = Math.max(1, currentIndex - 50);
     const protectedEnd = Math.min(totalChapters, currentIndex + 50);
 
     let count = 0;
     for (const item of allCaches) {
       const parts = item.key.split('_');
       if (parts[0] === String(novelId)) {
         const idx = parseInt(parts[1]);
         if (idx < protectedStart || idx > protectedEnd) {
           await DB.deleteCache(item.key);
           count++;
         }
       }
     }
     if (count > 0) console.log(`[Cache] cleaned ${count} entries`);
   }
 };
