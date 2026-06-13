 const DB = {
   DB_NAME: 'NovelReaderDB',
   DB_VERSION: 1,
 
   _db: null,
 
   async open() {
     if (this._db) return this._db;
     return new Promise((resolve, reject) => {
       const req = indexedDB.open(this.DB_NAME, this.DB_VERSION);
       req.onupgradeneeded = (e) => {
         const db = e.target.result;
         if (!db.objectStoreNames.contains('bookshelf')) {
           db.createObjectStore('bookshelf', { keyPath: 'id', autoIncrement: true });
         }
         if (!db.objectStoreNames.contains('bookmarks')) {
           db.createObjectStore('bookmarks', { keyPath: 'id', autoIncrement: true });
         }
         if (!db.objectStoreNames.contains('reading_cache')) {
           db.createObjectStore('reading_cache', { keyPath: 'key' });
         }
       };
       req.onsuccess = (e) => {
         this._db = e.target.result;
         resolve(this._db);
       };
       req.onerror = () => reject(req.error);
     });
   },
 
   _store(name, mode) {
     return this._db.transaction(name, mode).objectStore(name);
   },
 
   // === 书架 ===
   async addBook(book) {
     const db = await this.open();
     return new Promise((resolve, reject) => {
       const req = this._store('bookshelf', 'readwrite').add(book);
       req.onsuccess = () => resolve(req.result);
       req.onerror = () => reject(req.error);
     });
   },
 
   async updateBook(book) {
     const db = await this.open();
     return new Promise((resolve, reject) => {
       const req = this._store('bookshelf', 'readwrite').put(book);
       req.onsuccess = () => resolve(req.result);
       req.onerror = () => reject(req.error);
     });
   },
 
   async deleteBook(id) {
     const db = await this.open();
     return new Promise((resolve, reject) => {
       const req = this._store('bookshelf', 'readwrite').delete(id);
       req.onsuccess = () => resolve();
       req.onerror = () => reject(req.error);
     });
   },
 
   async getAllBooks() {
     const db = await this.open();
     return new Promise((resolve, reject) => {
       const req = this._store('bookshelf', 'readonly').getAll();
       req.onsuccess = () => resolve(req.result);
       req.onerror = () => reject(req.error);
     });
   },
 
   async getBook(id) {
     const db = await this.open();
     return new Promise((resolve, reject) => {
       const req = this._store('bookshelf', 'readonly').get(id);
       req.onsuccess = () => resolve(req.result);
       req.onerror = () => reject(req.error);
     });
   },
 
   // === 书签 ===
   async addBookmark(bm) {
     const db = await this.open();
     return new Promise((resolve, reject) => {
       const req = this._store('bookmarks', 'readwrite').add(bm);
       req.onsuccess = () => resolve(req.result);
       req.onerror = () => reject(req.error);
     });
   },
 
   async deleteBookmark(id) {
     const db = await this.open();
     return new Promise((resolve, reject) => {
       const req = this._store('bookmarks', 'readwrite').delete(id);
       req.onsuccess = () => resolve();
       req.onerror = () => reject(req.error);
     });
   },
 
   async getBookmarksByNovel(novelId) {
     const db = await this.open();
     return new Promise((resolve, reject) => {
       const all = this._store('bookmarks', 'readonly').getAll();
       all.onsuccess = () => {
         const items = all.result.filter(b => b.novelId === novelId);
         resolve(items.sort((a, b) => b.createdAt - a.createdAt));
       };
       all.onerror = () => reject(all.error);
     });
   },
 
   // === 缓存 ===
   async setCache(key, data) {
     const db = await this.open();
     return new Promise((resolve, reject) => {
       const req = this._store('reading_cache', 'readwrite').put({
         key, ...data, cachedAt: Date.now()
       });
       req.onsuccess = () => resolve();
       req.onerror = () => reject(req.error);
     });
   },
 
   async getCache(key) {
     const db = await this.open();
     return new Promise((resolve, reject) => {
       const req = this._store('reading_cache', 'readonly').get(key);
       req.onsuccess = () => resolve(req.result || null);
       req.onerror = () => reject(req.error);
     });
   },
 
   async deleteCache(key) {
     const db = await this.open();
     return new Promise((resolve, reject) => {
       const req = this._store('reading_cache', 'readwrite').delete(key);
       req.onsuccess = () => resolve();
       req.onerror = () => reject(req.error);
     });
   }
 };
