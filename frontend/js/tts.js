const TTS = {
  _utterance: null,
  _isPlaying: false,

  init() {
    var self = this;
    document.getElementById('tts-play').addEventListener('click', function(){ self.toggle(); });
    document.getElementById('tts-rate').addEventListener('input', function(e){
      if (self._utterance) { self._utterance.rate = parseFloat(e.target.value); }
    });
    if (!window.speechSynthesis) { document.getElementById('reader-tts').style.display = 'none'; }
  },

  speak(text) {
    if (!window.speechSynthesis) return;
    window.speechSynthesis.cancel();
    var self = this;

    this._utterance = new SpeechSynthesisUtterance(text);
    this._utterance.lang = 'zh-CN';
    this._utterance.rate = parseFloat(document.getElementById('tts-rate').value);

    this._utterance.onstart = function() {
      self._isPlaying = true;
      var btn = document.getElementById('tts-play');
      btn.textContent = '⏸';
      document.getElementById('tts-status').textContent = '朗读中...';
      document.getElementById('tts-controls').style.display = 'flex';
    };

    this._utterance.onend = function() {
      self._isPlaying = false;
      document.getElementById('tts-play').textContent = '▶';
      document.getElementById('tts-status').textContent = '已结束';
    };

    this._utterance.onerror = function() {
      self._isPlaying = false;
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
    var btn = document.getElementById('tts-play');
    if (btn) btn.textContent = '▶';
    document.getElementById('tts-status').textContent = '';
    document.getElementById('tts-controls').style.display = 'none';
  },

  speakSelected(selectedText) {
    if (!selectedText) return;
    this.speak(selectedText);
  },

  speakFromStart(text) {
    this.speak(text);
  },

  isSupported() { return 'speechSynthesis' in window; }
};