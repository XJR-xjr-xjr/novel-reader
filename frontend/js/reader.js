const Reader = {
  bookId: null, book: null, chapters: [], currentChapterIndex: 1, totalChapters: 0,
  fontSize: 18, readingMode: 'scroll', hideTimer: null,

  async init() {
    this.bookId = parseInt(new URLSearchParams(location.search).get('id'));
    if (!this.bookId) return this._showError('无效的书籍');
    this.book = await DB.getBook(this.bookId);
    if (!this.book) return this._showError('书籍不存在');
    this.fontSize = parseInt(localStorage.getItem('readerFontSize') || '18');
    this.readingMode = localStorage.getItem('readerMode') || 'scroll';
    document.getElementById('reader-title').textContent = this.book.title;
    this.applyFontSize(); this.applyReadingMode(); this._updateThemeButton();
    try { this.chapters = await API.getChapters(this.book.currentSource); this.totalChapters = this.chapters.length; }
    catch (e) { return this._showError('获取目录失败，请检查网络'); }
    this.currentChapterIndex = this.book.currentChapterIndex || 1;
    if (this.currentChapterIndex > this.totalChapters) this.currentChapterIndex = this.totalChapters;
    await this.loadChapter(this.currentChapterIndex);
    this._bindEvents(); this.showBars(); this._startHideTimer();
    if (TTS.isSupported()) { TTS.init(); } else { document.getElementById('reader-tts').style.display = 'none'; }
  },

  _showError(msg) {
    document.getElementById('reader-content').innerHTML =
      '<p style="text-align:center;margin-top:40vh;color:var(--text-secondary)">' + msg + '</p>';
  },

  async loadChapter(index) {
    if (index < 1 || index > this.totalChapters) return;
    this.currentChapterIndex = index;
    var ch = this.chapters[index - 1];
    if (!ch) return;
    var content;
    var cached = await Cache.getChapter(this.bookId, index);
    if (cached) { content = cached.content; }
    else {
      try { var data = await API.getChapterContent(ch.url); content = data.content;
        await DB.setCache(this.bookId + '_' + index, { title: ch.title, content: content }); }
      catch (e) { return this._showError('加载章节失败'); }
    }
    var lines = content.split('\n').map(function(p){return p.trim()}).filter(function(p){return p});
    var html = '<h2>' + Utils.escapeHtml(ch.title) + '</h2>' +
      lines.map(function(p){return '<p>' + Utils.escapeHtml(p) + '</p>'}).join('');
    document.getElementById('reader-content').innerHTML = html;
    this._updateChapterInfo(); this._updateProgressBar(); this._updateTOC(); this._updateBookmarks();
    document.getElementById('reader-wrapper').scrollTop = 0;
    Cache.preloadChapters(this.bookId, this.chapters, index + 1);
    await this._saveProgress();
  },

  async goToChapter(idx) {
    if (idx < 1 || idx > this.totalChapters) return;
    await this.loadChapter(idx);
    this._startHideTimer();
  },

  pageUp: function() {
    var w = document.getElementById('reader-wrapper');
    if (w.scrollTop <= 5) { this.goToChapter(this.currentChapterIndex - 1); }
    else { w.scrollBy({ top: -w.clientHeight, behavior: 'smooth' }); }
  },
  pageDown: function() {
    var w = document.getElementById('reader-wrapper');
    var max = w.scrollHeight - w.clientHeight;
    if (w.scrollTop >= max - 5) { this.goToChapter(this.currentChapterIndex + 1); }
    else { w.scrollBy({ top: w.clientHeight, behavior: 'smooth' }); }
  },

  _updateChapterInfo: function() {
    document.getElementById('reader-chapter-info').textContent =
      '第' + this.currentChapterIndex + '章 / ' + this.totalChapters + '章';
  },
  _updateProgressBar: function() {
    var pct = this.totalChapters > 0 ? this.currentChapterIndex / this.totalChapters : 0;
    document.getElementById('reader-progress-fill').style.width = Math.round(pct * 100) + '%';
    document.getElementById('reader-progress-pct').textContent = Math.round(pct * 100) + '%';
    document.getElementById('reader-progress-slider').value = this.currentChapterIndex;
    document.getElementById('reader-progress-slider').max = this.totalChapters;
  },

  _updateTOC: function() {
    var cont = document.getElementById('sidebar-toc');
    var self = this;
    cont.innerHTML = this.chapters.map(function(ch,i){
      var idx = i + 1;
      var cls = idx === self.currentChapterIndex ? 'current' : '';
      return '<div class="sidebar-item ' + cls + '" data-index="' + idx + '">' + idx + '. ' + Utils.escapeHtml(ch.title) + '</div>';
    }).join('');
    cont.querySelectorAll('.sidebar-item').forEach(function(el){
      el.addEventListener('click', function(){ self.goToChapter(parseInt(el.dataset.index)); self.closeSidebar(); });
    });
  },

  async _updateBookmarks() {
    var cont = document.getElementById('sidebar-bookmarks');
    var bms = await DB.getBookmarksByNovel(this.bookId);
    var self = this;
    if (!bms || bms.length === 0) {
      cont.innerHTML = '<div style="padding:20px;text-align:center;color:var(--text-secondary)">暂无书签<br>阅读时长按文本添加</div>';
      return;
    }
    cont.innerHTML = bms.map(function(bm){
      var t = bm.textSnippet || bm.chapterTitle;
      return '<div class="sidebar-item" data-chapter="'+bm.chapterIndex+'" data-bmid="'+bm.id+'">'+
        '<span class="bm-text">'+Utils.escapeHtml(t)+'</span>'+
        '<button class="del-bm" data-bmid="'+bm.id+'">删除</button></div>';
    }).join('');
    cont.querySelectorAll('.sidebar-item').forEach(function(el){
      el.addEventListener('click', function(e){
        if (e.target.classList.contains('del-bm')) return;
        self.goToChapter(parseInt(el.dataset.chapter)); self.closeSidebar();
      });
    });
    cont.querySelectorAll('.del-bm').forEach(function(btn){
      btn.addEventListener('click', async function(e){
        e.stopPropagation();
        await DB.deleteBookmark(parseInt(btn.dataset.bmid));
        self._updateBookmarks();
      });
    });
  },

  async _saveProgress() {
    if (!this.book) return;
    this.book.currentChapterIndex = this.currentChapterIndex;
    this.book.currentChapterTitle = this.chapters[this.currentChapterIndex - 1].title || '';
    this.book.totalChapters = this.totalChapters;
    this.book.progress = this.totalChapters > 0 ? this.currentChapterIndex / this.totalChapters : 0;
    this.book.lastReadAt = Date.now();
    try { await DB.updateBook(this.book); } catch(e) {}
  },

  showBars: function() {
    document.getElementById('reader-topbar').classList.add('visible');
    document.getElementById('reader-bottombar').classList.add('visible');
  },
  hideBars: function() {
    document.getElementById('reader-topbar').classList.remove('visible');
    document.getElementById('reader-bottombar').classList.remove('visible');
  },
  _startHideTimer: function() {
    clearTimeout(this.hideTimer);
    this.hideTimer = setTimeout(this.hideBars.bind(this), 8000);
  },

  openSettings: function() {
    document.getElementById('reader-settings').classList.add('open');
    document.getElementById('reader-overlay').classList.add('show');
  },
  closeSettings: function() {
    document.getElementById('reader-settings').classList.remove('open');
    document.getElementById('reader-overlay').classList.remove('show');
  },
  openSidebar: function() {
    this._updateTOC(); this._updateBookmarks();
    document.getElementById('reader-sidebar').classList.add('open');
    document.getElementById('reader-overlay').classList.add('show');
  },
  closeSidebar: function() {
    document.getElementById('reader-sidebar').classList.remove('open');
    document.getElementById('reader-overlay').classList.remove('show');
  },

  applyFontSize: function() {
    document.getElementById('reader-content').style.fontSize = this.fontSize + 'px';
    document.getElementById('font-size-display').textContent = this.fontSize;
    localStorage.setItem('readerFontSize', this.fontSize);
  },
  applyReadingMode: function() {
    var w = document.getElementById('reader-wrapper');
    if (this.readingMode === 'page') { w.classList.add('page-mode'); }
    else { w.classList.remove('page-mode'); }
    document.getElementById('mode-page').classList.toggle('active', this.readingMode === 'page');
    document.getElementById('mode-scroll').classList.toggle('active', this.readingMode === 'scroll');
    localStorage.setItem('readerMode', this.readingMode);
  },
  _updateThemeButton: function() {
    var theme = document.documentElement.getAttribute('data-theme') || 'day';
    document.getElementById('settings-theme').textContent = theme === 'night' ? '🌙 夜间' : '☀ 日间';
  },

  _bindEvents: function() {
    var self = this;
    document.getElementById('reader-back').addEventListener('click', function(){
      self._saveProgress(); window.location.href = 'index.html';
    });
    document.getElementById('reader-menu').addEventListener('click', function(){ self.openSidebar(); });
    document.getElementById('reader-overlay').addEventListener('click', function(){
      self.closeSettings(); self.closeSidebar();
    });
    document.getElementById('reader-bottombar').addEventListener('click', function(e){
      if (e.target.tagName === 'INPUT' && e.target.type === 'range') return;
      self.openSettings();
    });
    document.getElementById('reader-wrapper').addEventListener('click', function(e){
      if (e.target.tagName === 'A' || e.target.tagName === 'BUTTON') return;
      var barsVisible = document.getElementById('reader-topbar').classList.contains('visible');
      var rect = e.currentTarget.getBoundingClientRect();
      var x = e.clientX, w = rect.width, third = w / 3;
      if (!barsVisible) {
        if (self.readingMode === 'page') {
          if (x < third) { self.pageUp(); }
          else if (x > w - third) { self.pageDown(); }
          else { self.showBars(); self._startHideTimer(); }
        } else { self.showBars(); self._startHideTimer(); }
      } else {
        if (x > third && x < w - third) { self.hideBars(); clearTimeout(self.hideTimer); }
        else { self._startHideTimer(); }
      }
    });
    document.getElementById('reader-progress-slider').addEventListener('change', function(e){
      var idx = parseInt(e.target.value);
      if (idx !== self.currentChapterIndex) { self.goToChapter(idx); }
    });
    document.getElementById('settings-theme').addEventListener('click', function(){
      var cur = document.documentElement.getAttribute('data-theme');
      var nxt = cur === 'night' ? '' : 'night';
      if (nxt) { document.documentElement.setAttribute('data-theme', nxt); localStorage.setItem('theme', nxt); }
      else { document.documentElement.removeAttribute('data-theme'); localStorage.removeItem('theme'); }
      self._updateThemeButton();
    });
    document.getElementById('font-decrease').addEventListener('click', function(){
      if (self.fontSize > 14) { self.fontSize--; self.applyFontSize(); }
    });
    document.getElementById('font-increase').addEventListener('click', function(){
      if (self.fontSize < 32) { self.fontSize++; self.applyFontSize(); }
    });
    document.getElementById('mode-page').addEventListener('click', function(){ self.readingMode='page'; self.applyReadingMode(); });
    document.getElementById('mode-scroll').addEventListener('click', function(){ self.readingMode='scroll'; self.applyReadingMode(); });
    document.getElementById('reader-tts').addEventListener('click', function(){
      TTS.speakFromStart(document.getElementById('reader-content').textContent);
      self.closeSettings();
    });
    document.querySelectorAll('.sidebar-tab').forEach(function(tab){
      tab.addEventListener('click', function(){
        document.querySelectorAll('.sidebar-tab').forEach(function(el){el.classList.remove('active')});
        document.querySelectorAll('.sidebar-list').forEach(function(el){el.style.display='none'});
        tab.classList.add('active');
        var tgt = document.getElementById('sidebar-' + tab.dataset.tab);
        if (tgt) tgt.style.display = '';
      });
    });
    window.addEventListener('beforeunload', function(){ self._saveProgress(); });
    window.addEventListener('pagehide', function(){ self._saveProgress(); });
    document.addEventListener('mouseup', function(){ self._handleTextSelect(); });
    document.addEventListener('touchend', function(){ setTimeout(function(){ self._handleTextSelect(); }, 200); });
    document.getElementById('reader-settings').addEventListener('click', function(e){ e.stopPropagation(); });
    document.getElementById('reader-sidebar').addEventListener('click', function(e){ e.stopPropagation(); });
  },

  _handleTextSelect: function() {
    var sel = window.getSelection();
    var text = sel ? sel.toString().trim() : '';
    if (text.length < 3) return;
    var ch = this.chapters[this.currentChapterIndex - 1];
    if (!ch) return;
    var self = this;
    if (confirm('添加书签？\n"' + text.slice(0, 30) + (text.length > 30 ? '...' : '') + '"')) {
      DB.addBookmark({
        novelId: this.bookId, chapterIndex: this.currentChapterIndex,
        chapterTitle: ch.title, textSnippet: text.slice(0, 60),
        positionPercent: 0, createdAt: Date.now()
      }).then(function(){
        self._updateBookmarks();
        if (TTS.isSupported() && confirm('从此处开始听书？')) { TTS.speakSelected(text); }
      });
    }
    sel.removeAllRanges();
  }
};

document.addEventListener('DOMContentLoaded', function(){ Reader.init(); });