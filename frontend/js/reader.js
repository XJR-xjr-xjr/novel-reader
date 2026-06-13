 const Reader = {
   bookId: null,
   book: null,
   chapters: [],
   currentChapterIndex: 1,
   totalChapters: 0,
   fontSize: 18,
   readingMode: 'page',
   hideTimer: null,
 
   async init() {
     this.bookId = parseInt(new URLSearchParams(location.search).get('id'));
     if (!this.bookId) return this._showError('无效的书籍');
 
     this.book = await DB.getBook(this.bookId);
     if (!this.book) return this._showError('书籍不存在');
 
     this.fontSize = parseInt(localStorage.getItem('readerFontSize') || '18');
     this.readingMode = localStorage.getItem('readerMode') || 'page';
 
     document.getElementById('reader-title').textContent = this.book.title;
     this.applyFontSize();
     this.applyReadingMode();
     this._updateThemeButton();
 
     try {
       this.chapters = await API.getChapters(this.book.currentSource);
       this.totalChapters = this.chapters.length;
     } catch (e) {
       return this._showError('获取目录失败，请检查网络');
     }
 
     this.currentChapterIndex = this.book.currentChapterIndex || 1;
     if (this.currentChapterIndex > this.totalChapters) this.currentChapterIndex = this.totalChapters;
 
     await this.loadChapter(this.currentChapterIndex);
     this._bindEvents();
     this.showBars();
     this._startHideTimer();
 
     // 如果支持 TTS，初始化
     if (TTS.isSupported()) {
       TTS.init();
     } else {
       document.getElementById('reader-tts').style.display = 'none';
     }
   },
 
   _showError(msg) {
     document.getElementById('reader-content').innerHTML = `<p style="text-align:center;margin-top:40vh;color:var(--text-secondary)">${msg}</p>`;
   },
 
   // ========== 章节加载 ==========
 
   async loadChapter(index) {
     if (index < 1 || index > this.totalChapters) return;
     this.currentChapterIndex = index;
 
     const ch = this.chapters[index - 1];
     if (!ch) return;
 
     let content;
     const cached = await Cache.getChapter(this.bookId, index);
     if (cached) {
       content = cached.content;
     } else {
       try {
         const data = await API.getChapterContent(ch.url);
         content = data.content;
         await DB.setCache(`${this.bookId}_${index}`, { title: ch.title, content });
       } catch (e) {
         return this._showError('加载章节失败');
       }
     }
 
     // 渲染内容
     const paragraphs = content.split('\n').map(p => p.trim()).filter(p => p);
     const html = `<h2>${Utils.escapeHtml(ch.title)}</h2>` +
       paragraphs.map(p => `<p>${Utils.escapeHtml(p)}</p>`).join('');
     document.getElementById('reader-content').innerHTML = html;
 
     // 更新 UI
     this._updateChapterInfo();
     this._updateProgressBar();
     this._updateTOC();
     this._updateBookmarks();
 
     // 滚动到顶部
     document.getElementById('reader-wrapper').scrollTop = 0;
 
     // 预加载后续章节
     Cache.preloadChapters(this.bookId, this.chapters, index + 1);
 
     // 保存进度
     await this._saveProgress();
   },
 
   async goToChapter(index) {
     if (index < 1 || index > this.totalChapters) return;
     await this.loadChapter(index);
     this._startHideTimer();
   },
 
   // ========== 翻页 (Page Mode) ==========
 
   pageUp() {
     const w = document.getElementById('reader-wrapper');
     if (w.scrollTop <= 5) {
       this.goToChapter(this.currentChapterIndex - 1);
     } else {
       w.scrollBy({ top: -w.clientHeight, behavior: 'smooth' });
     }
   },
 
   pageDown() {
     const w = document.getElementById('reader-wrapper');
     const maxScroll = w.scrollHeight - w.clientHeight;
     if (w.scrollTop >= maxScroll - 5) {
       this.goToChapter(this.currentChapterIndex + 1);
     } else {
       w.scrollBy({ top: w.clientHeight, behavior: 'smooth' });
     }
   },
 
   // ========== UI 更新 ==========
 
   _updateChapterInfo() {
     document.getElementById('reader-chapter-info').textContent =
       `第${this.currentChapterIndex}章 / ${this.totalChapters}章`;
   },
 
   _updateProgressBar() {
     const pct = this.totalChapters > 0 ? this.currentChapterIndex / this.totalChapters : 0;
     document.getElementById('reader-progress-fill').style.width = `${Math.round(pct * 100)}%`;
     document.getElementById('reader-progress-pct').textContent = `${Math.round(pct * 100)}%`;
     document.getElementById('reader-progress-slider').value = this.currentChapterIndex;
   },
 
   _updateTOC() {
     const container = document.getElementById('sidebar-toc');
     container.innerHTML = this.chapters.map((ch, i) => {
       const idx = i + 1;
       let cls = '';
       if (idx === this.currentChapterIndex) cls = 'current';
       else if (this.book.currentChapterIndex >= idx) cls = 'read';
       return `<div class="sidebar-item ${cls}" data-index="${idx}">${idx}. ${Utils.escapeHtml(ch.title)}</div>`;
     }).join('');
 
     // 绑定跳转
     container.querySelectorAll('.sidebar-item').forEach(el => {
       el.addEventListener('click', () => {
         this.goToChapter(parseInt(el.dataset.index));
         this.closeSidebar();
       });
     });
   },
 
   async _updateBookmarks() {
     const container = document.getElementById('sidebar-bookmarks');
     const bms = await DB.getBookmarksByNovel(this.bookId);
     if (!bms || bms.length === 0) {
       container.innerHTML = '<div style="padding:20px;text-align:center;color:var(--text-secondary)">暂无书签<br>阅读时长按文本添加</div>';
       return;
     }
 
     container.innerHTML = bms.map(bm => {
       const text = bm.textSnippet || bm.chapterTitle;
       return `<div class="sidebar-item" data-chapter="${bm.chapterIndex}" data-bmid="${bm.id}">
         <span class="bm-text">📑 ${Utils.escapeHtml(text)}</span>
         <button class="del-bm" data-bmid="${bm.id}">✕</button>
       </div>`;
     }).join('');
 
     container.querySelectorAll('.sidebar-item').forEach(el => {
       el.addEventListener('click', (e) => {
         if (e.target.classList.contains('del-bm')) return;
         this.goToChapter(parseInt(el.dataset.chapter));
         this.closeSidebar();
       });
     });
 
     container.querySelectorAll('.del-bm').forEach(btn => {
       btn.addEventListener('click', async (e) => {
         e.stopPropagation();
         await DB.deleteBookmark(parseInt(btn.dataset.bmid));
         this._updateBookmarks();
       });
     });
   },
 
   // ========== 进度保存 ==========
 
   async _saveProgress() {
     if (!this.book) return;
     this.book.currentChapterIndex = this.currentChapterIndex;
     this.book.currentChapterTitle = this.chapters[this.currentChapterIndex - 1]?.title || '';
     this.book.totalChapters = this.totalChapters;
     this.book.progress = this.totalChapters > 0 ? this.currentChapterIndex / this.totalChapters : 0;
     this.book.lastReadAt = Date.now();
     await DB.updateBook(this.book);
   },
 
   // ========== 沉浸式显隐 ==========
 
   showBars() {
     document.getElementById('reader-topbar').classList.add('visible');
     document.getElementById('reader-bottombar').classList.add('visible');
   },
 
   hideBars() {
     document.getElementById('reader-topbar').classList.remove('visible');
     document.getElementById('reader-bottombar').classList.remove('visible');
   },
 
   _startHideTimer() {
     clearTimeout(this.hideTimer);
     this.hideTimer = setTimeout(() => this.hideBars(), 4000);
   },
 
   // ========== 设置 ==========
 
   openSettings() {
     document.getElementById('reader-settings').classList.add('open');
     document.getElementById('reader-overlay').classList.add('show');
   },
 
   closeSettings() {
     document.getElementById('reader-settings').classList.remove('open');
     document.getElementById('reader-overlay').classList.remove('show');
   },
 
   openSidebar() {
     document.getElementById('reader-sidebar').classList.add('open');
     document.getElementById('reader-overlay').classList.add('show');
   },
 
   closeSidebar() {
     document.getElementById('reader-sidebar').classList.remove('open');
     document.getElementById('reader-overlay').classList.remove('show');
   },
 
   applyFontSize() {
     document.getElementById('reader-content').style.fontSize = this.fontSize + 'px';
     document.getElementById('font-size-display').textContent = this.fontSize;
     localStorage.setItem('readerFontSize', this.fontSize);
   },
 
   applyReadingMode() {
     const wrapper = document.getElementById('reader-wrapper');
     if (this.readingMode === 'page') {
       wrapper.classList.add('page-mode');
     } else {
       wrapper.classList.remove('page-mode');
     }
     document.getElementById('mode-page').classList.toggle('active', this.readingMode === 'page');
     document.getElementById('mode-scroll').classList.toggle('active', this.readingMode === 'scroll');
     localStorage.setItem('readerMode', this.readingMode);
   },
 
   _updateThemeButton() {
     const theme = document.documentElement.getAttribute('data-theme') || 'day';
     document.getElementById('settings-theme').textContent = theme === 'night' ? '🌙 夜间' : '☀ 日间';
   },
 
   // ========== 事件绑定 ==========
 
   _bindEvents() {
     // 返回
     document.getElementById('reader-back').addEventListener('click', () => {
       window.location.href = 'index.html';
     });
 
     // 侧边栏菜单
     document.getElementById('reader-menu').addEventListener('click', () => this.openSidebar());
 
     // 遮罩关闭
     document.getElementById('reader-overlay').addEventListener('click', () => {
       this.closeSettings();
       this.closeSidebar();
     });
 
     // 阅读区域点击
     document.getElementById('reader-wrapper').addEventListener('click', (e) => {
       // 点到了内容中的链接等元素，不处理
       if (e.target.tagName === 'A' || e.target.tagName === 'BUTTON') return;
 
       const barsVisible = document.getElementById('reader-topbar').classList.contains('visible');
       const rect = e.currentTarget.getBoundingClientRect();
       const x = e.clientX;
       const w = rect.width;
       const third = w / 3;
 
       if (!barsVisible) {
         if (this.readingMode === 'page') {
           if (x < third) {
             this.pageUp();
           } else if (x > w - third) {
             this.pageDown();
           } else {
             this.showBars();
             this._startHideTimer();
           }
         } else {
           // 滚动模式：点击切换顶底栏
           this.showBars();
           this._startHideTimer();
         }
       } else {
         this._startHideTimer();
       }
     });
 
     // 进度条拖动
     document.getElementById('reader-progress-slider').addEventListener('input', (e) => {
       const idx = parseInt(e.target.value);
       if (idx !== this.currentChapterIndex) {
         this.goToChapter(idx);
       }
     });
 
     // 设置 - 主题
     document.getElementById('settings-theme').addEventListener('click', () => {
       const current = document.documentElement.getAttribute('data-theme');
       const next = current === 'night' ? '' : 'night';
       if (next) {
         document.documentElement.setAttribute('data-theme', next);
         localStorage.setItem('theme', next);
       } else {
         document.documentElement.removeAttribute('data-theme');
         localStorage.removeItem('theme');
       }
       this._updateThemeButton();
     });
 
     // 设置 - 字体大小
     document.getElementById('font-decrease').addEventListener('click', () => {
       if (this.fontSize > 14) { this.fontSize--; this.applyFontSize(); }
     });
     document.getElementById('font-increase').addEventListener('click', () => {
       if (this.fontSize < 32) { this.fontSize++; this.applyFontSize(); }
     });
 
     // 设置 - 阅读模式
     document.getElementById('mode-page').addEventListener('click', () => {
       this.readingMode = 'page';
       this.applyReadingMode();
     });
     document.getElementById('mode-scroll').addEventListener('click', () => {
       this.readingMode = 'scroll';
       this.applyReadingMode();
     });
 
     // 设置 - 听书
     document.getElementById('reader-tts').addEventListener('click', () => {
       const contentText = document.getElementById('reader-content').textContent;
       TTS.speakFromStart(contentText);
       this.closeSettings();
     });
 
     // 侧边栏 - 标签切换
     document.querySelectorAll('.sidebar-tab').forEach(tab => {
       tab.addEventListener('click', () => {
         document.querySelectorAll('.sidebar-tab, .sidebar-list').forEach(el => el.classList.remove('active'));
         document.querySelectorAll('.sidebar-list').forEach(el => el.style.display = 'none');
         tab.classList.add('active');
         const target = document.getElementById('sidebar-' + tab.dataset.tab);
         if (target) { target.style.display = ''; target.classList.add('active'); }
       });
     });
 
     // 文字选中 → 添加书签
     document.addEventListener('mouseup', () => this._handleTextSelect());
     document.addEventListener('touchend', () => {
       setTimeout(() => this._handleTextSelect(), 200);
     });
 
     // 进度条上的章节跳转（点击底栏区域）
     document.getElementById('reader-settings').addEventListener('click', (e) => e.stopPropagation());
     document.getElementById('reader-sidebar').addEventListener('click', (e) => e.stopPropagation());
   },
 
   _handleTextSelect() {
     const sel = window.getSelection();
     const text = sel ? sel.toString().trim() : '';
     if (text.length < 3) return;
 
     const ch = this.chapters[this.currentChapterIndex - 1];
     if (!ch) return;
 
     if (confirm('添加书签？\n"' + text.slice(0, 30) + (text.length > 30 ? '...' : '') + '"')) {
       DB.addBookmark({
         novelId: this.bookId,
         chapterIndex: this.currentChapterIndex,
         chapterTitle: ch.title,
         textSnippet: text.slice(0, 60),
         positionPercent: 0,
         createdAt: Date.now()
       }).then(() => {
         this._updateBookmarks();
         // 同时询问是否听书
         if (TTS.isSupported() && confirm('从此处开始听书？')) {
           TTS.speakSelected(text);
         }
       });
     }
     sel.removeAllRanges();
   }
 };
 
 document.addEventListener('DOMContentLoaded', () => Reader.init());
