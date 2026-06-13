 const Utils = {
   debounce(fn, delay) {
     let timer;
     return (...args) => {
       clearTimeout(timer);
       timer = setTimeout(() => fn(...args), delay);
     };
   },
 
   formatProgress(pct) {
     const n = Math.min(100, Math.max(0, Math.round(pct * 100)));
     const filled = Math.round(n / 5);
     return '█'.repeat(filled) + '░'.repeat(20 - filled) + ` ${n}%`;
   },
 
   escapeHtml(str) {
     const div = document.createElement('div');
     div.textContent = str;
     return div.innerHTML;
   },
 
   formatDate(date) {
     const d = new Date(date);
     return `${d.getMonth() + 1}/${d.getDate()} ${d.getHours()}:${String(d.getMinutes()).padStart(2, '0')}`;
   }
 };
