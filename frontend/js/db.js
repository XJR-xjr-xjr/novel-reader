var DB = {
  DB_NAME: 'NovelReaderDB', DB_VERSION: 1, _db: null,

  async open() {
    if (this._db) return this._db;
    return new Promise(function(resolve, reject) {
      var req = indexedDB.open(DB.DB_NAME, DB.DB_VERSION);
      req.onupgradeneeded = function(e) {
        var db = e.target.result;
        if (!db.objectStoreNames.contains('bookshelf'))
          db.createObjectStore('bookshelf', { keyPath: 'id', autoIncrement: true });
        if (!db.objectStoreNames.contains('bookmarks'))
          db.createObjectStore('bookmarks', { keyPath: 'id', autoIncrement: true });
        if (!db.objectStoreNames.contains('reading_cache'))
          db.createObjectStore('reading_cache', { keyPath: 'key' });
      };
      req.onsuccess = function(e) { DB._db = e.target.result; resolve(DB._db); };
      req.onerror = function() { reject(req.error); };
    });
  },

  // Force fresh connection
  async reset() { this._db = null; return this.open(); },

  _store: function(name, mode) { return this._db.transaction(name, mode).objectStore(name); },

  // === Bookshelf ===
  addBook: async function(book) {
    await this.open();
    return new Promise(function(resolve, reject) {
      var tx = DB._db.transaction('bookshelf', 'readwrite');
      var req = tx.objectStore('bookshelf').add(book);
      tx.oncomplete = function() { resolve(req.result); };
      tx.onerror = function() { reject(tx.error); };
    });
  },

  updateBook: async function(book) {
    await this.reset(); // KEY FIX: always get fresh connection
    return new Promise(function(resolve, reject) {
      var tx = DB._db.transaction('bookshelf', 'readwrite');
      var req = tx.objectStore('bookshelf').put(book);
      tx.oncomplete = function() { resolve(req.result); };
      tx.onerror = function() { reject(tx.error); };
    });
  },

  deleteBook: async function(id) {
    await this.open();
    return new Promise(function(resolve, reject) {
      var tx = DB._db.transaction('bookshelf', 'readwrite');
      tx.objectStore('bookshelf').delete(id);
      tx.oncomplete = resolve; tx.onerror = function() { reject(tx.error); };
    });
  },

  getAllBooks: async function() {
    await this.reset(); // Always get fresh data
    return new Promise(function(resolve, reject) {
      var req = DB._store('bookshelf', 'readonly').getAll();
      req.onsuccess = function() { resolve(req.result); };
      req.onerror = function() { reject(req.error); };
    });
  },

  getBook: async function(id) {
    await this.open();
    return new Promise(function(resolve, reject) {
      var req = DB._store('bookshelf', 'readonly').get(id);
      req.onsuccess = function() { resolve(req.result); };
      req.onerror = function() { reject(req.error); };
    });
  },

  // === Bookmarks ===
  addBookmark: async function(bm) {
    await this.open();
    return new Promise(function(resolve, reject) {
      var tx = DB._db.transaction('bookmarks', 'readwrite');
      var req = tx.objectStore('bookmarks').add(bm);
      tx.oncomplete = function() { resolve(req.result); };
      tx.onerror = function() { reject(tx.error); };
    });
  },

  deleteBookmark: async function(id) {
    await this.open();
    return new Promise(function(resolve, reject) {
      var tx = DB._db.transaction('bookmarks', 'readwrite');
      tx.objectStore('bookmarks').delete(id);
      tx.oncomplete = resolve; tx.onerror = function() { reject(tx.error); };
    });
  },

  getBookmarksByNovel: async function(novelId) {
    await this.open();
    return new Promise(function(resolve, reject) {
      var req = DB._store('bookmarks', 'readonly').getAll();
      req.onsuccess = function() {
        var items = req.result.filter(function(b) { return b.novelId === novelId; });
        resolve(items.sort(function(a,b) { return b.createdAt - a.createdAt; }));
      };
      req.onerror = function() { reject(req.error); };
    });
  },

  // === Cache ===
  setCache: async function(key, data) {
    await this.open();
    return new Promise(function(resolve, reject) {
      var tx = DB._db.transaction('reading_cache', 'readwrite');
      tx.objectStore('reading_cache').put({ key: key, title: data.title, content: data.content, cachedAt: Date.now() });
      tx.oncomplete = resolve; tx.onerror = function() { reject(tx.error); };
    });
  },

  getCache: async function(key) {
    await this.open();
    return new Promise(function(resolve, reject) {
      var req = DB._store('reading_cache', 'readonly').get(key);
      req.onsuccess = function() { resolve(req.result || null); };
      req.onerror = function() { reject(req.error); };
    });
  },

  deleteCache: async function(key) {
    await this.open();
    return new Promise(function(resolve, reject) {
      var tx = DB._db.transaction('reading_cache', 'readwrite');
      tx.objectStore('reading_cache').delete(key);
      tx.oncomplete = resolve; tx.onerror = function() { reject(tx.error); };
    });
  }
};