 const Bookshelf = {
   async init() {
     await this.load();
     document.getElementById('search-btn').addEventListener('click', () => {
       const q = document.getElementById('search-input').value.trim();
       if (q) window.location.href = `search.html?q=${encodeURIComponent(q)}`;
       else window.location.href = 'search.html';
     });
     document.getElementById('search-input').addEventListener('keydown', (e) => {
       if (e.key === 'Enter') document.getElementById('search-btn').click();
     });
   },
 
   async load() {
     const books = await DB.getAllBooks();
     const list = document.getElementById('bookshelf-list');
     const empty = document.getElementById('bookshelf-empty');
 
     if (!books || books.length === 0) {
       list.innerHTML = '<div class="add-book-btn" onclick="window.location.href=\'search.html\'">+ 添加小说</div>';
       empty.style.display = '';
       return;
     }
 
     empty.style.display = 'none';
     books.sort((a, b) => (b.lastReadAt || 0) - (a.lastReadAt || 0));
 
     let html = '';
     for (const book of books) {
       const progress = book.progress || 0;
       const bar = Utils.formatProgress(progress);
       html += `
         <div class="book-item" data-id="${book.id}" onclick="Bookshelf.openBook(${book.id})">
           <div class="book-title">${Utils.escapeHtml(book.title)}</div>
           <div class="book-progress-text">读到：第${book.currentChapterIndex}章·${Utils.escapeHtml(book.currentChapterTitle || '')}</div>
           <div class="book-latest">最新：第${book.totalChapters}章·${Utils.escapeHtml(book.latestChapterTitle || '')}</div>
           <div class="book-progress-bar"><div class="fill" style="width:${Math.round(progress * 100)}%"></div></div>
         </div>`;
     }
 
     html += '<div class="add-book-btn" onclick="window.location.href=\'search.html\'">+ 添加小说</div>';
     list.innerHTML = html;
 
     this._initSwipeDelete(books);
   },
 
   _initSwipeDelete(books) {
     let startX = 0, currentX = 0, isSwiping = false, currentEl = null;
 
     document.addEventListener('touchstart', (e) => {
       const item = e.target.closest('.book-item');
       if (!item) return;
       startX = e.touches[0].clientX;
       currentEl = item;
       isSwiping = false;
     }, { passive: true });
 
     document.addEventListener('touchmove', (e) => {
       if (!currentEl) return;
       currentX = e.touches[0].clientX;
       const diff = startX - currentX;
       if (diff > 20) {
         isSwiping = true;
         currentEl.classList.add('swiping');
       } else if (diff < 10) {
         currentEl.classList.remove('swiping');
       }
     }, { passive: true });
 
     document.addEventListener('touchend', async (e) => {
       if (!currentEl || !isSwiping) { currentEl = null; return; }
       const diff = startX - currentX;
       if (diff > 50) {
         const id = parseInt(currentEl.dataset.id);
         if (confirm('删除该书？')) {
           await DB.deleteBook(id);
           await this.load();
         }
       }
       currentEl.classList.remove('swiping');
       currentEl = null;
       isSwiping = false;
     }, { passive: true });
   },
 
   openBook(id) {
     window.location.href = `reader.html?id=${id}`;
   }
 };
