 document.addEventListener('DOMContentLoaded', () => {
   // 检查主题保存
   const savedTheme = localStorage.getItem('theme');
   if (savedTheme) {
     document.documentElement.setAttribute('data-theme', savedTheme);
   }
 
   // 初始化书架
   if (document.getElementById('page-bookshelf')) {
     Bookshelf.init();
   }
 });
 
 // 注册 Service Worker
 if ('serviceWorker' in navigator) {
   window.addEventListener('load', () => {
     navigator.serviceWorker.register('sw.js').catch(() => {});
   });
 }
