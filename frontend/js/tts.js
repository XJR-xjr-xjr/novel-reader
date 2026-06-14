var TTS = {
  _utterance: null, _isPlaying: false,

  speak: function(text) {
    if (!window.speechSynthesis) return;
    window.speechSynthesis.cancel();

    var self = this;
    this._utterance = new SpeechSynthesisUtterance(text);
    this._utterance.lang = 'zh-CN';
    // Divider: slider value / 10 = rate (10 -> 1.0 normal speed)
    this._utterance.rate = parseFloat(document.getElementById('tts-rate').value) / 10;

    this._utterance.onstart = function() {
      self._isPlaying = true;
      document.getElementById('tts-play').textContent = '\u23F8';
      document.getElementById('tts-row').style.display = 'flex';
    };
    this._utterance.onend = function() {
      self._isPlaying = false;
      document.getElementById('tts-play').textContent = '\u25B6';
    };
    this._utterance.onerror = function() {
      self._isPlaying = false;
      document.getElementById('tts-play').textContent = '\u25B6';
    };
    window.speechSynthesis.speak(this._utterance);
  },

  toggle: function() {
    if (this._isPlaying) {
      window.speechSynthesis.pause(); this._isPlaying = false;
      document.getElementById('tts-play').textContent = '\u25B6';
    } else if (window.speechSynthesis.speaking) {
      window.speechSynthesis.resume(); this._isPlaying = true;
      document.getElementById('tts-play').textContent = '\u23F8';
    }
  },

  stop: function() {
    window.speechSynthesis.cancel(); this._isPlaying = false;
    document.getElementById('tts-play').textContent = '\u25B6';
    document.getElementById('tts-row').style.display = 'none';
  },

  isSupported: function() { return 'speechSynthesis' in window; }
};