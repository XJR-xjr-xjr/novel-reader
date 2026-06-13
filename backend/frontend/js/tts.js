 const TTS = {
   _utterance: null,
   _isPlaying: false,
   _text: '',
   _startOffset: 0,
 
   init() {
     document.getElementById('tts-play').addEventListener('click', () => this.toggle());
     document.getElementById('tts-rate').addEventListener('input', (e) => {
       if (this._utterance) {
         this._utterance.rate = e.target.value / 10;
       }
     });
 
     if (!window.speechSynthesis) {
       document.getElementById('reader-tts').style.display = 'none';
     }
   },
 
   speak(text, offset = 0) {
     if (!window.speechSynthesis) return;
 
     window.speechSynthesis.cancel();
 
     this._text = text;
     this._startOffset = offset;
 
     this._utterance = new SpeechSynthesisUtterance(text.slice(offset));
     this._utterance.lang = 'zh-CN';
     this._utterance.rate = parseInt(document.getElementById('tts-rate').value) / 10 || 1;
 
     this._utterance.onstart = () => {
       this._isPlaying = true;
       document.getElementById('tts-play').textContent = '⏸';
       document.getElementById('tts-status').textContent = '朗读中...';
       document.getElementById('tts-controls').style.display = 'flex';
     };
 
     this._utterance.onend = () => {
       this._isPlaying = false;
       document.getElementById('tts-play').textContent = '▶';
       document.getElementById('tts-status').textContent = '已结束';
     };
 
     this._utterance.onerror = () => {
       this._isPlaying = false;
       document.getElementById('tts-play').textContent = '▶';
       document.getElementById('tts-status').textContent = '出错';
     };
 
     window.speechSynthesis.speak(this._utterance);
   },
 
   toggle() {
     if (this._isPlaying) {
       window.speechSynthesis.pause();
       this._isPlaying = false;
       document.getElementById('tts-play').textContent = '▶';
       document.getElementById('tts-status').textContent = '已暂停';
     } else if (window.speechSynthesis.speaking) {
       window.speechSynthesis.resume();
       this._isPlaying = true;
       document.getElementById('tts-play').textContent = '⏸';
       document.getElementById('tts-status').textContent = '朗读中...';
     }
   },
 
   stop() {
     window.speechSynthesis.cancel();
     this._isPlaying = false;
     document.getElementById('tts-play').textContent = '▶';
     document.getElementById('tts-status').textContent = '';
     document.getElementById('tts-controls').style.display = 'none';
   },
 
   speakSelected(selectedText) {
     if (!selectedText) return;
     this.speak(selectedText, 0);
   },
 
   speakFromStart(text) {
     this.speak(text, 0);
   },
 
   isSupported() {
     return 'speechSynthesis' in window;
   }
 };
