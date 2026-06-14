var Bookshelf = {
  async init() {
    await this.load();
    document.getElementById('search-btn').addEventListener('click', function(){
      var q = document.getElementById('search-input').value.trim();
      window.location.href = q ? 'search.html?q=' + encodeURIComponent(q) : 'search.html';
    });
    document.getElementById('search-input').addEventListener('keydown', function(e){
      if (e.key === 'Enter') document.getElementById('search-btn').click();
    });
    // 重新可见时刷新数据
    var self = this;
    document.addEventListener('visibilitychange', function(){
      if (document.visibilityState === 'visible') self.load();
    });
  },

  async load() {
    var books = await DB.getAllBooks();
    var list = document.getElementById('bookshelf-list');
    var empty = document.getElementById('bookshelf-empty');
    if (!books || books.length === 0) {
      list.innerHTML = '<div class="add-book-btn" onclick="window.location.href=\'search.html\'">+ 添加小说</div>';
      empty.style.display = '';
      return;
    }
    empty.style.display = 'none';
    books.sort(function(a,b){ return (b.lastReadAt||0) - (a.lastReadAt||0); });

    var html = '';
    for (var i=0; i<books.length; i++) {
      var book = books[i];
      html += '<div class="book-item" data-id="' + book.id + '" onclick="Bookshelf.openBook(' + book.id + ')">' +
        '<div class="book-title">' + Utils.escapeHtml(book.title) + '</div>' +
        '<div class="book-progress-text">读到：第' + book.currentChapterIndex + '章·' + Utils.escapeHtml(book.currentChapterTitle || '') + '</div>' +
        '<div class="book-latest">最新：第' + book.totalChapters + '章·' + Utils.escapeHtml(book.latestChapterTitle || '') + '</div>' +
        '<div class="book-progress-bar"><div class="fill" style="width:' + Math.round((book.progress||0)*100) + '%"></div></div></div>';
    }
    html += '<div class="add-book-btn" onclick="window.location.href=\'search.html\'">+ 添加小说</div>';
    list.innerHTML = html;
  },

  openBook: function(id) { window.location.href = 'reader.html?id=' + id; }
};