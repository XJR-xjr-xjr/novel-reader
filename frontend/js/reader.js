var Reader = {
  bookId: null, book: null, chapters: [], ci: 1, tc: 0,
  fontSize: 18, mode: 'scroll', hideTimer: null, isLoadingNext: false,

  async init() {
    this.bookId = parseInt(new URLSearchParams(location.search).get('id'));
    if (!this.bookId) return this._err('无效的书籍');
    this.book = await DB.getBook(this.bookId);
    if (!this.book) return this._err('书籍不存在');
    this.fontSize = parseInt(localStorage.getItem('readerFontSize') || '18');
    this.mode = localStorage.getItem('readerMode') || 'scroll';
    document.getElementById('reader-title').textContent = this.book.title;
    this._applyFont(); this._applyMode(); this._updateThemeBtn();
    try { this.chapters = await API.getChapters(this.book.currentSource); this.tc = this.chapters.length; }
    catch (e) { return this._err('获取目录失败'); }
    this.ci = this.book.currentChapterIndex || 1;
    if (this.ci > this.tc) this.ci = this.tc;
    await this._loadChapter(this.ci);
    this._bind(); this._showBars(); this._startTimer();
  },

  _err: function(m) { document.getElementById('reader-content').innerHTML =
    '<p style="text-align:center;margin-top:40vh;color:var(--text-secondary)">' + m + '</p>'; },

  async _loadChapter(idx, append) {
    if (idx < 1 || idx > this.tc || (append && this.isLoadingNext)) return;
    if (append) this.isLoadingNext = true;
    var self = this;
    var ch = this.chapters[idx - 1]; if (!ch) return;

    var content;
    var cached = await Cache.getChapter(this.bookId, idx);
    if (cached) { content = cached.content; }
    else {
      try { var d = await API.getChapterContent(ch.url); content = d.content;
        await DB.setCache(this.bookId + '_' + idx, { title: ch.title, content: content }); }
      catch (e) { this.isLoadingNext = false; return; }
    }

    // Render
    var ps = content.split('\n').map(function(p){return p.trim()}).filter(function(p){return p});
    if (ps.length === 0) { this.isLoadingNext = false; return; }

    var html = '<h2>' + Utils.escapeHtml(ch.title) + '</h2>' +
      ps.map(function(p){return '<p>' + Utils.escapeHtml(p) + '</p>'}).join('');

    if (append) {
      document.getElementById('reader-content').insertAdjacentHTML('beforeend', html);
      this.isLoadingNext = false;
    } else {
      document.getElementById('reader-content').innerHTML = html;
      document.getElementById('reader-wrapper').scrollTop = 0;
      Cache.preloadChapters(this.bookId, this.chapters, idx + 1);
    }

    this.ci = idx;
    this._updateUI(); this._updateTOC(); this._updateBM();
    await this._save();
  },

  prev: function() { if (this.ci > 1) this._loadChapter(this.ci - 1); },
  next: function() { if (this.ci < this.tc) this._loadChapter(this.ci + 1); },

  pageUp: function() {
    var w = document.getElementById('reader-wrapper');
    if (w.scrollTop <= 5) { if (this.ci > 1) this._loadChapter(this.ci - 1); }
    else { w.scrollBy({ top: -w.clientHeight, behavior: 'smooth' }); }
  },
  pageDown: function() {
    var w = document.getElementById('reader-wrapper');
    if (w.scrollTop >= w.scrollHeight - w.clientHeight - 5) {
      if (this.ci < this.tc) this._loadChapter(this.ci + 1); }
    else { w.scrollBy({ top: w.clientHeight, behavior: 'smooth' }); }
  },

  _updateUI: function() {
    document.getElementById('reader-chapter-info').textContent = '第' + this.ci + '章 / ' + this.tc + '章';
    document.getElementById('reader-progress-pct').textContent = Math.round((this.tc>0?this.ci/this.tc:0)*100) + '%';
  },

  _updateTOC: function() {
    var cont = document.getElementById('sidebar-toc'); var self = this;
    cont.innerHTML = this.chapters.map(function(ch,i){
      var idx = i + 1; var cls = idx === self.ci ? 'current' : '';
      return '<div class="sidebar-item ' + cls + '" data-index="' + idx + '">' + idx + '. ' + Utils.escapeHtml(ch.title) + '</div>';
    }).join('');
    cont.querySelectorAll('.sidebar-item').forEach(function(el){
      el.addEventListener('click', function(){ self._loadChapter(parseInt(el.dataset.index)); self._closeSidebar(); });
    });
  },

  async _updateBM() {
    var cont = document.getElementById('sidebar-bookmarks'); var self = this;
    var bms = await DB.getBookmarksByNovel(this.bookId);
    if (!bms || bms.length === 0) { cont.innerHTML = '<div style="padding:20px;text-align:center;color:var(--text-secondary)">暂无书签<br>阅读时长按文本添加</div>'; return; }
    cont.innerHTML = bms.map(function(bm){
      var t = bm.textSnippet || bm.chapterTitle;
      return '<div class="sidebar-item" data-chapter="'+bm.chapterIndex+'" data-bmid="'+bm.id+'"><span class="bm-text">'+Utils.escapeHtml(t)+'</span><button class="del-bm" data-bmid="'+bm.id+'">删除</button></div>';
    }).join('');
    cont.querySelectorAll('.sidebar-item').forEach(function(el){
      el.addEventListener('click', function(e){ if (e.target.classList.contains('del-bm')) return; self._loadChapter(parseInt(el.dataset.chapter)); self._closeSidebar(); });
    });
    cont.querySelectorAll('.del-bm').forEach(function(btn){
      btn.addEventListener('click', async function(e){ e.stopPropagation(); await DB.deleteBookmark(parseInt(btn.dataset.bmid)); self._updateBM(); });
    });
  },

  async _save() {
    if (!this.book) return;
    var ch = this.chapters[this.ci - 1];
    this.book.currentChapterIndex = this.ci;
    this.book.currentChapterTitle = ch ? (ch.title || '') : '';
    this.book.totalChapters = this.tc;
    this.book.progress = this.tc > 0 ? this.ci / this.tc : 0;
    this.book.lastReadAt = Date.now();
    try { await DB.updateBook(this.book); } catch(e) {}
  },

  _showBars: function() {
    document.getElementById('reader-topbar').classList.add('visible');
    document.getElementById('reader-bottombar').classList.add('visible');
  },
  _hideBars: function() {
    document.getElementById('reader-topbar').classList.remove('visible');
    document.getElementById('reader-bottombar').classList.remove('visible');
  },
  _startTimer: function() {
    clearTimeout(this.hideTimer); this.hideTimer = setTimeout(this._hideBars.bind(this), 8000);
  },
  _openSidebar: function() {
    this._updateTOC(); this._updateBM();
    document.getElementById('reader-sidebar').classList.add('open');
    document.getElementById('reader-overlay').classList.add('show');
  },
  _closeSidebar: function() {
    document.getElementById('reader-sidebar').classList.remove('open');
    document.getElementById('reader-overlay').classList.remove('show');
  },

  _applyFont: function() {
    document.getElementById('reader-content').style.fontSize = this.fontSize + 'px';
    document.querySelector('.bar-label').textContent = this.fontSize;
    localStorage.setItem('readerFontSize', this.fontSize);
  },
  _applyMode: function() {
    var w = document.getElementById('reader-wrapper');
    if (this.mode === 'page') { w.classList.add('page-mode'); }
    else { w.classList.remove('page-mode'); }
    document.getElementById('btn-mode').textContent = this.mode === 'page' ? '📖' : '📜';
    localStorage.setItem('readerMode', this.mode);
    this._setupScrollWatch();
  },
  _updateThemeBtn: function() {
    var t = document.documentElement.getAttribute('data-theme') || 'day';
    document.getElementById('btn-theme').textContent = t === 'night' ? '🌙' : '☀';
  },

  // Continuous scroll: auto-load next chapter
  _setupScrollWatch: function() {
    var self = this;
    var wrapper = document.getElementById('reader-wrapper');
    // Remove old listener
    wrapper._scrollHandler && wrapper.removeEventListener('scroll', wrapper._scrollHandler);
    if (this.mode !== 'scroll') return;
    wrapper._scrollHandler = function() {
      var distFromBot = wrapper.scrollHeight - wrapper.scrollTop - wrapper.clientHeight;
      if (distFromBot < 300 && !self.isLoadingNext && self.ci < self.tc) {
        self._loadChapter(self.ci + 1, true);
      }
    };
    wrapper.addEventListener('scroll', wrapper._scrollHandler);
  },

  _bind: function() {
    var self = this;

    document.getElementById('reader-back').addEventListener('click', function(){
      self._save().then(function(){ window.location.href = 'index.html'; });
    });
    document.getElementById('reader-menu').addEventListener('click', function(){ self._openSidebar(); });
    document.getElementById('reader-overlay').addEventListener('click', function(){ self._closeSidebar(); });

    document.getElementById('btn-prev').addEventListener('click', function(){ self.prev(); self._startTimer(); });
    document.getElementById('btn-next').addEventListener('click', function(){ self.next(); self._startTimer(); });
    document.getElementById('btn-font-down').addEventListener('click', function(){
      if (self.fontSize > 14) { self.fontSize--; self._applyFont(); }
    });
    document.getElementById('btn-font-up').addEventListener('click', function(){
      if (self.fontSize < 32) { self.fontSize++; self._applyFont(); }
    });
    document.getElementById('btn-theme').addEventListener('click', function(){
      var cur = document.documentElement.getAttribute('data-theme');
      var nxt = cur === 'night' ? '' : 'night';
      if (nxt) { document.documentElement.setAttribute('data-theme', nxt); localStorage.setItem('theme', nxt); }
      else { document.documentElement.removeAttribute('data-theme'); localStorage.removeItem('theme'); }
      self._updateThemeBtn();
    });
    document.getElementById('btn-mode').addEventListener('click', function(){
      self.mode = self.mode === 'page' ? 'scroll' : 'page'; self._applyMode();
    });
    document.getElementById('btn-tts').addEventListener('click', function(){
      var txt = document.getElementById('reader-content').textContent;
      if (txt) TTS.speak(txt);
    });

    document.getElementById('tts-play').addEventListener('click', function(){ TTS.toggle(); });
    document.getElementById('tts-rate').addEventListener('input', function(e){
      if (TTS._utterance) TTS._utterance.rate = parseFloat(e.target.value) / 10;
    });
    document.getElementById('tts-stop').addEventListener('click', function(){ TTS.stop(); });

    document.getElementById('reader-wrapper').addEventListener('click', function(e){
      if (e.target.tagName === 'A' || e.target.tagName === 'BUTTON') return;
      var vis = document.getElementById('reader-topbar').classList.contains('visible');
      var rect = e.currentTarget.getBoundingClientRect();
      var x = e.clientX, w = rect.width, third = w / 3;
      if (!vis) {
        if (self.mode === 'page') {
          if (x < third) { self.pageUp(); } else if (x > w - third) { self.pageDown(); }
          else { self._showBars(); self._startTimer(); }
        } else { self._showBars(); self._startTimer(); }
      } else {
        if (x > third && x < w - third) { self._hideBars(); clearTimeout(self.hideTimer); }
        else { self._startTimer(); }
      }
    });

    this._setupScrollWatch();

    document.querySelectorAll('.sidebar-tab').forEach(function(tab){
      tab.addEventListener('click', function(){
        document.querySelectorAll('.sidebar-tab').forEach(function(el){el.classList.remove('active')});
        document.querySelectorAll('.sidebar-list').forEach(function(el){el.style.display='none'});
        tab.classList.add('active');
        var tgt = document.getElementById('sidebar-' + tab.dataset.tab);
        if (tgt) tgt.style.display = '';
      });
    });

    document.addEventListener('mouseup', function(){ self._select(); });
    document.addEventListener('touchend', function(){ setTimeout(function(){ self._select(); }, 200); });
    window.addEventListener('beforeunload', function(){ self._save(); });
    window.addEventListener('pagehide', function(){ self._save(); });
  },

  _select: function() {
    var sel = window.getSelection(); var text = sel ? sel.toString().trim() : '';
    if (text.length < 3) return;
    var ch = this.chapters[this.ci - 1]; if (!ch) return;
    var self = this;
    if (confirm('添加书签？\n"' + text.slice(0, 30) + (text.length > 30 ? '...' : '') + '"')) {
      DB.addBookmark({ novelId: this.bookId, chapterIndex: this.ci, chapterTitle: ch.title,
        textSnippet: text.slice(0, 60), positionPercent: 0, createdAt: Date.now()
      }).then(function(){ self._updateBM(); if (TTS.isSupported() && confirm('从此处开始听书？')) TTS.speak(text); });
    }
    sel.removeAllRanges();
  }
};

document.addEventListener('DOMContentLoaded', function(){ Reader.init(); });