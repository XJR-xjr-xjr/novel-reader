const Reader = {
  bookId: null,
  book: null,
  chapters: [],
  currentChapterIndex: 1,
  totalChapters: 0,
  fontSize: 18,
  readingMode: 'scroll',
  hideTimer: null,

  async init() {
    this.bookId = parseInt(new URLSearchParams(location.search).get('id'));
    if (!this.bookId) return this._showError('无效的书籍');

    this.book = await DB.getBook(this.bookId);
    if (!this.book) return this._showError('书籍不存在');

    this.fontSize = parseInt(localStorage.getItem('readerFontSize') || '18');
    this.readingMode = localStorage.getItem('readerMode') || 'scroll';

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

    if (TTS.isSupported()) {
      TTS.init();
    } else {
      document.getElementById('reader-tts').style.display = 'none';
    }
  },

  _showError(msg) {
    document.getElementById('reader-content').innerHTML = `<p style="text-align:center;margin-top:40vh;color:var(--text-secondary)">${msg}</p>`;
  },

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

    const paragraphs = content.split('\n').map(p => p.trim()).filter(p => p);
    const html = `<h2>${Utils.escapeHtml(ch.title)}</h2>` +
      paragraphs.map(p => `<p>${Utils.escapeHtml(p)}</p>`).join('');
    document.getElementById('reader-content').innerHTML = html;

    this._updateChapterInfo();
    this._updateProgressBar();
    this._updateTOC();
    this._updateBookmarks();

    document.getElementById('reader-wrapper').scrollTop = 0;
    Cache.preloadChapters(this.bookId, this.chapters, index + 1);
    await this._saveProgress();
  },

  async goToChapter(index) {
    if (index < 1 || index > this.totalChapters) return;
    await this.loadChapter(index);
    this._startHideTimer();
  },

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
      let cls = idx === this.currentChapterIndex ? 'current' : '';
      return `<div class="sidebar-item ${cls}" data-index="${idx}">${idx}. ${Utils.escapeHtml(ch.title)}</div>`;
    }).join('');

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
        <span class="bm-text">${Utils.escapeHtml(text)}</span>
        <button class="del-bm" data-bmid="${bm.id}">删除</button>
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

  async _saveProgress() {
    if (!this.book) return;
    this.book.currentChapterIndex = this.currentChapterIndex;
    this.book.currentChapterTitle = this.chapters[this.currentChapterIndex - 1]?.title || '';
    this.book.totalChapters = this.totalChapters;
    this.book.progress = this.totalChapters > 0 ? this.currentChapterIndex / this.totalChapters : 0;
    this.book.lastReadAt = Date.now();
    await DB.updateBook(this.book);
  },

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
    this.hideTimer = setTimeout(() => this.hideBars(), 8000);
  },

  openSettings() {
    document.getElementById('reader-settings').classList.add('open');
    document.getElementById('reader-overlay').classList.add('show');
  },

  closeSettings() {
    document.getElementById('reader-settings').classList.remove('open');
    document.getElementById('reader-overlay').classList.remove('show');
  },

  openSidebar() {
    this._updateTOC();
    this._updateBookmarks();
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

  _bindEvents() {
    document.getElementById('reader-back').addEventListener('click', () => {
      window.location.href = 'index.html';
    });

    document.getElementById('reader-menu').addEventListener('click', () => this.openSidebar());

    document.getElementById('reader-overlay').addEventListener('click', () => {
      this.closeSettings();
      this.closeSidebar();
    });

    // 底栏点击 → 打开设置
    document.getElementById('reader-bottombar').addEventListener('click', (e) => {
      if (e.target.tagName === 'INPUT' && e.target.type === 'range') return;
      this.openSettings();
    });

    // 阅读区域点击
    document.getElementById('reader-wrapper').addEventListener('click', (e) => {
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
          this.showBars();
          this._startHideTimer();
        }
      } else {
        this._startHideTimer();
      }
    });

    document.getElementById('reader-progress-slider').addEventListener('input', (e) => {
      const idx = parseInt(e.target.value);
      if (idx !== this.currentChapterIndex) {
        this.goToChapter(idx);
      }
    });

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

    document.getElementById('font-decrease').addEventListener('click', () => {
      if (this.fontSize > 14) { this.fontSize--; this.applyFontSize(); }
    });
    document.getElementById('font-increase').addEventListener('click', () => {
      if (this.fontSize < 32) { this.fontSize++; this.applyFontSize(); }
    });

    document.getElementById('mode-page').addEventListener('click', () => {
      this.readingMode = 'page';
      this.applyReadingMode();
    });
    document.getElementById('mode-scroll').addEventListener('click', () => {
      this.readingMode = 'scroll';
      this.applyReadingMode();
    });

    document.getElementById('reader-tts').addEventListener('click', () => {
      const contentText = document.getElementById('reader-content').textContent;
      TTS.speakFromStart(contentText);
      this.closeSettings();
    });

    document.querySelectorAll('.sidebar-tab').forEach(tab => {
      tab.addEventListener('click', () => {
        document.querySelectorAll('.sidebar-tab').forEach(el => el.classList.remove('active'));
        document.querySelectorAll('.sidebar-list').forEach(el => el.style.display = 'none');
        tab.classList.add('active');
        const target = document.getElementById('sidebar-' + tab.dataset.tab);
        if (target) { target.style.display = ''; target.classList.add('active'); }
      });
    });

    document.addEventListener('mouseup', () => this._handleTextSelect());
    document.addEventListener('touchend', () => {
      setTimeout(() => this._handleTextSelect(), 200);
    });

    document.getElementById('reader-settings').addEventListener('click', (e) => e.stopPropagation());
    document.getElementById('reader-sidebar').addEventListener('click', (e) => e.stopPropagation());
  },

  _handleTextSelect() {
    const sel = window.getSelection();
    const text = sel ? sel.toString().trim() : '';
    if (text.length < 3) return;

    const ch = this.chapters[this.currentChapterIndex - 1];
    if (!ch) return;

    if (confirm('添加书签？\n' + text.slice(0, 30) + (text.length > 30 ? '...' : ''))) {
      DB.addBookmark({
        novelId: this.bookId,
        chapterIndex: this.currentChapterIndex,
        chapterTitle: ch.title,
        textSnippet: text.slice(0, 60),
        positionPercent: 0,
        createdAt: Date.now()
      }).then(() => {
        this._updateBookmarks();
        if (TTS.isSupported() && confirm('从此处开始听书？')) {
          TTS.speakSelected(text);
        }
      });
    }
    sel.removeAllRanges();
  }
};

document.addEventListener('DOMContentLoaded', () => Reader.init());