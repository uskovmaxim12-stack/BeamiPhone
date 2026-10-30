// BeamiPhone Radio — fully in-mod implementation.
// Network: BeamNG GE LuaSocket -> guihooks chunks -> MediaSource (local Blob URL).
// No iframe, external helper, Python, FFmpeg, Radio Browser API or remote CEF requests.
(function () {
  'use strict';
  var BP = window.BeamiPhone = window.BeamiPhone || {};
  if (BP.radio && BP.radio.__embeddedV6) return;

  var STATIONS = [
    { id: 'love', name: 'Love Radio', genre: 'Поп · танцевальная музыка', color: '#D83F86', mark: 'LOVE' },
    { id: 'europa', name: 'Европа Плюс', genre: 'Хиты · поп', color: '#E64B55', mark: 'EP' },
    { id: 'avto', name: 'Авторадио', genre: 'Поп · российские хиты', color: '#2588D8', mark: 'АВТО' },
    { id: 'rusradio', name: 'Русское Радио', genre: 'Русская популярная музыка', color: '#C83C47', mark: 'РУ' },
    { id: 'nashe', name: 'Наше Радио', genre: 'Русский рок', color: '#E37B35', mark: 'НАШЕ' },
    { id: 'retro', name: 'Ретро FM', genre: 'Музыка 70-х, 80-х и 90-х', color: '#8C68C7', mark: 'РЕТРО' },
    { id: 'record', name: 'Радио Рекорд', genre: 'Электронная музыка', color: '#D84D54', mark: 'REC' },
    { id: 'dorozhnoe', name: 'Дорожное Радио', genre: 'Поп · музыка в дорогу', color: '#3E9B79', mark: 'ДОР' },
    { id: 'mayak', name: 'Радио Маяк', genre: 'Разговорное · музыка', color: '#D2A33D', mark: 'МАЯК' },
    { id: 'vesti', name: 'Вести FM', genre: 'Новости и аналитика', color: '#367BBE', mark: 'ВЕСТИ' },
    { id: 'russia', name: 'Радио России', genre: 'Новости · культура', color: '#4D79B6', mark: 'РОССИЯ' },
    { id: 'chanson', name: 'Радио Шансон', genre: 'Шансон', color: '#B57B42', mark: 'ШАНСОН' }
  ];

  var selected = -1;
  var state = 'stopped';
  var statusText = 'Выберите радиостанцию';
  var volume = 0.72;
  var media = null;
  var sourceBuffer = null;
  var appendQueue = [];
  var mediaUrl = null;
  var audio = null;
  var audioContext = null;
  var mediaSourceNode = null;
  var spatialGraph = null;
  var analyser = null;
  var analyserData = null;
  var audioStarted = false;
  var streamSequence = 0;
  var activeSequence = 0;
  var rootScope = null;
  var overlay = null;
  var homeButton = null;
  var listNode = null;
  var statusNode = null;
  var titleNode = null;
  var heroNode = null;
  var mainPlayNode = null;
  var unsubscribeScope = [];
  var originals = {};
  var radioIsActive = false;
  var pendingPlay = false;
  var firstChunkSeen = false;
  var sourceOpen = false;

  function stationAt(index) { return index >= 0 && index < STATIONS.length ? STATIONS[index] : null; }
  function radioState() {
    var st = stationAt(selected);
    return {
      playlist: [], currentIndex: selected, currentTrack: st ? {
        file: 'radio:' + st.id, title: st.name, artist: 'Прямой эфир · Россия', coverUrl: ''
      } : null,
      isPlaying: state === 'playing' || state === 'buffering',
      currentTime: 0, duration: 0, volume: volume, loading: state === 'connecting' || state === 'buffering',
      shuffle: false, repeatMode: 'off', radio: true
    };
  }

  function emitLua(command) {
    try {
      if (!window.bngApi || !window.bngApi.engineLua) throw new Error('BeamNG Lua bridge is unavailable');
      window.bngApi.engineLua("extensions.load('beamiphone_radio'); " + command);
      return true;
    } catch (e) {
      console.error('[BeamiPhone Radio] Lua bridge error:', e);
      setStatus('Не удалось связаться с аудиосистемой игры');
      return false;
    }
  }

  function setStatus(message, newState) {
    statusText = String(message || '');
    if (newState) state = newState;
    render();
  }

  function makeAudioGraph() {
    if (audioContext && mediaSourceNode) return true;
    if (!audio) {
      audio = document.createElement('audio');
      audio.id = 'bp-radio-audio-v6';
      audio.preload = 'auto';
      audio.autoplay = false;
      audio.volume = volume;
      audio.style.cssText = 'position:fixed;width:1px;height:1px;left:-10px;top:-10px;opacity:0;pointer-events:none;';
      document.body.appendChild(audio);
    }
    var Ctor = window.AudioContext || window.webkitAudioContext;
    if (!Ctor || !window.MediaSource) {
      setStatus('Эта версия встроенного Chromium не поддерживает потоковое MP3', 'error');
      return false;
    }
    try {
      audioContext = new Ctor({ latencyHint: 'playback' });
      mediaSourceNode = audioContext.createMediaElementSource(audio);
      analyser = audioContext.createAnalyser();
      analyser.fftSize = 512;
      analyser.smoothingTimeConstant = 0.55;
      analyser.minDecibels = -85;
      analyser.maxDecibels = -25;
      analyserData = new Uint8Array(analyser.frequencyBinCount);
      var silent = audioContext.createGain();
      silent.gain.value = 0;
      analyser.connect(silent);
      silent.connect(audioContext.destination);
      mediaSourceNode.connect(analyser);
      if (BP.createSpatialGraph) {
        spatialGraph = BP.createSpatialGraph(audioContext, mediaSourceNode, audioContext.destination);
        spatialGraph.setFallback();
        spatialGraph.setVolume(volume);
      } else {
        mediaSourceNode.connect(audioContext.destination);
      }
      routeAudio();
      audio.addEventListener('error', function () {
        var code = audio.error ? audio.error.code : 0;
        failPlayback('Ошибка декодирования MP3 (' + code + ')');
      });
      return true;
    } catch (e) {
      console.error('[BeamiPhone Radio] Audio graph setup failed:', e);
      setStatus('Не удалось инициализировать аудиосистему', 'error');
      return false;
    }
  }

  function routeAudio() {
    if (!mediaSourceNode || !audioContext) return;
    try { mediaSourceNode.disconnect(); } catch (e) {}
    // The analyser is a silent tap for the Dynamic Island. Audible sound follows
    // the same spatial DSP graph as BeamiPhone's local player when enabled.
    try { mediaSourceNode.connect(analyser); } catch (e2) {}
    var spatialOn = !BP.spatial || !BP.spatial.isEnabled || BP.spatial.isEnabled();
    if (spatialOn && spatialGraph) mediaSourceNode.connect(spatialGraph.input);
    else mediaSourceNode.connect(audioContext.destination);
  }

  function clearMedia() {
    try { if (audio) audio.pause(); } catch (e) {}
    sourceBuffer = null;
    appendQueue = [];
    sourceOpen = false;
    audioStarted = false;
    firstChunkSeen = false;
    if (media) {
      try { if (media.readyState === 'open') media.endOfStream(); } catch (e2) {}
    }
    media = null;
    if (audio) {
      try { audio.removeAttribute('src'); audio.load(); } catch (e3) {}
    }
    if (mediaUrl) {
      try { URL.revokeObjectURL(mediaUrl); } catch (e4) {}
      mediaUrl = null;
    }
  }

  function failPlayback(message) {
    try { if (BP.bridge && BP.bridge.setStreamWant) BP.bridge.setStreamWant('listener', false); } catch (e) {}
    try { emitLua('extensions.beamiphone_radio.stop()'); } catch (e2) {}
    clearMedia();
    audioStarted = false;
    radioIsActive = true;
    state = 'error';
    statusText = String(message || 'Ошибка воспроизведения радиопотока');
    render();
  }

  function createMediaPipeline(seq) {
    clearMedia();
    if (!makeAudioGraph()) return false;
    if (!window.MediaSource.isTypeSupported('audio/mpeg')) {
      setStatus('Встроенный Chromium не поддерживает MP3 MediaSource', 'error');
      return false;
    }
    media = new MediaSource();
    mediaUrl = URL.createObjectURL(media);
    audio.src = mediaUrl;
    audio.volume = volume;
    media.addEventListener('sourceopen', function () {
      if (seq !== activeSequence || !media) return;
      try {
        sourceBuffer = media.addSourceBuffer('audio/mpeg');
        sourceBuffer.addEventListener('updateend', pumpAppendQueue);
        sourceBuffer.addEventListener('error', function () {
          failPlayback('Ошибка разбора аудиопотока MP3');
        });
        sourceOpen = true;
        pumpAppendQueue();
      } catch (e) {
        console.error('[BeamiPhone Radio] SourceBuffer error:', e);
        failPlayback('Не удалось открыть MP3-поток: ' + (e.message || e));
      }
    }, { once: true });
    media.addEventListener('error', function () { failPlayback('Ошибка MediaSource'); });
    return true;
  }

  function pumpAppendQueue() {
    if (!sourceBuffer || sourceBuffer.updating || !appendQueue.length) return;
    try {
      // Keep the live buffer bounded. Retain a small rewind cushion for smooth playback.
      if (sourceBuffer.buffered && sourceBuffer.buffered.length && audio && audio.currentTime > 25) {
        var edge = audio.currentTime - 15;
        if (edge > 1 && sourceBuffer.buffered.start(0) < edge) {
          sourceBuffer.remove(sourceBuffer.buffered.start(0), edge);
          return;
        }
      }
      sourceBuffer.appendBuffer(appendQueue.shift());
    } catch (e) {
      if (e && e.name === 'QuotaExceededError') {
        try {
          if (sourceBuffer.buffered.length) sourceBuffer.remove(sourceBuffer.buffered.start(0), Math.max(0.1, audio.currentTime - 12));
        } catch (removeErr) { setStatus('Переполнен аудиобуфер'); }
      } else {
        console.error('[BeamiPhone Radio] appendBuffer failed:', e);
        failPlayback('Ошибка буфера аудиопотока: ' + (e.message || e));
      }
    }
  }

  function decodeBase64Bytes(base64) {
    var binary = window.atob(base64);
    var bytes = new Uint8Array(binary.length);
    for (var i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return bytes;
  }

  function onRadioChunk(payload) {
    if (!payload || payload.station !== (stationAt(selected) || {}).id || !payload.data) return;
    if (!media || Number(payload.sequence) !== activeSequence) return;
    try {
      var bytes = decodeBase64Bytes(payload.data);
      appendQueue.push(bytes);
      firstChunkSeen = true;
      if (state === 'connecting') setStatus('Получаем эфир…', 'buffering');
      pumpAppendQueue();
    } catch (e) {
      console.error('[BeamiPhone Radio] chunk decode error:', e);
      setStatus('Не удалось обработать аудиоданные', 'error');
    }
  }

  function onRadioState(payload) {
    if (!payload || payload.station !== ((stationAt(selected) || {}).id)) return;
    if (payload.sequence !== undefined && Number(payload.sequence) !== activeSequence) return;
    if (payload.state === 'error') {
      try { if (audio) audio.pause(); } catch (e) {}
      audioStarted = false;
      if (BP.bridge && BP.bridge.setStreamWant) BP.bridge.setStreamWant('listener', false);
    }
    var labels = {
      connecting: 'Подключаемся к станции…',
      buffering: 'Буферизация эфира…',
      playing: 'В эфире',
      stopped: 'Эфир остановлен',
      error: payload.message || 'Не удалось подключиться'
    };
    setStatus(labels[payload.state] || payload.message || 'Состояние изменено', payload.state || state);
  }

  function renderStations() {
    if (!listNode) return;
    listNode.innerHTML = STATIONS.map(function (st, index) {
      var active = index === selected;
      return '<button class="bp-radio-station' + (active ? ' is-active' : '') + '" data-radio-index="' + index + '" type="button">' +
        '<span class="bp-radio-station-mark" style="--station-color:' + st.color + '">' + escapeText(st.mark) + '</span>' +
        '<span class="bp-radio-station-copy"><span class="bp-radio-station-name">' + escapeText(st.name) + '</span><span class="bp-radio-station-genre">' + escapeText(st.genre) + '</span></span>' +
        '<span class="bp-radio-station-end">' + (active && (state === 'playing' || state === 'buffering') ? '<span class="bp-radio-eq"><i></i><i></i><i></i></span>' : '<span class="bp-radio-chevron">›</span>') + '</span>' +
      '</button>';
    }).join('');
    Array.prototype.forEach.call(listNode.querySelectorAll('[data-radio-index]'), function (btn) {
      btn.addEventListener('click', function () { playStation(Number(btn.getAttribute('data-radio-index'))); });
    });
  }

  function render() {
    if (!overlay) return;
    var st = stationAt(selected);
    if (titleNode) titleNode.textContent = st ? st.name : 'Выберите радиостанцию';
    if (heroNode) {
      var mark = heroNode.querySelector('.bp-radio-hero-mark');
      var genre = heroNode.querySelector('.bp-radio-hero-genre');
      if (mark) { mark.textContent = st ? st.mark : 'FM'; mark.style.setProperty('--station-color', st ? st.color : '#397FCA'); }
      if (genre) genre.textContent = st ? st.genre : 'Российские радиостанции';
    }
    if (statusNode) {
      statusNode.textContent = statusText;
      statusNode.setAttribute('data-state', state);
    }
    if (mainPlayNode) {
      mainPlayNode.innerHTML = (state === 'playing' || state === 'buffering')
        ? '<svg viewBox="0 0 24 24"><path d="M7 5h4v14H7zM15 5h4v14h-4z"/></svg>'
        : '<svg viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>';
      mainPlayNode.setAttribute('aria-label', (state === 'playing' || state === 'buffering') ? 'Пауза' : 'Воспроизвести');
    }
    var badge = overlay.querySelector('.bp-radio-live-badge');
    if (badge) {
      badge.classList.toggle('is-live', state === 'playing');
      badge.textContent = state === 'playing' ? 'В ЭФИРЕ' : (state === 'connecting' || state === 'buffering' ? 'ПОДКЛЮЧЕНИЕ' : 'РАДИО');
    }
    var volumeInput = overlay.querySelector('[data-radio-volume]');
    if (volumeInput && document.activeElement !== volumeInput) volumeInput.value = String(Math.round(volume * 100));
    renderStations();
    if (BP.ui && BP.ui.renderPlayerState && radioIsActive) BP.ui.renderPlayerState(radioState());
  }

  function escapeText(value) {
    return String(value).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function playStation(index) {
    var st = stationAt(index);
    if (!st) return;
    selected = index;
    streamSequence++;
    activeSequence = streamSequence;
    pendingPlay = true;
    radioIsActive = true;
    firstChunkSeen = false;
    statusText = 'Подключаемся к ' + st.name + '…';
    state = 'connecting';
    try { originals.pause.call(BP.audioPlayer); } catch (e) {}
    if (!createMediaPipeline(activeSequence)) { radioIsActive = true; render(); return; }
    if (audioContext && audioContext.state === 'suspended') {
      try { audioContext.resume(); } catch (e2) {}
    }
    if (spatialGraph) spatialGraph.setVolume(volume);
    if (BP.bridge && BP.bridge.setStreamWant) BP.bridge.setStreamWant('listener', true);
    routeAudio();
    emitLua("extensions.beamiphone_radio.play('" + st.id + "', " + activeSequence + ")");
    // Call play() synchronously from the station button gesture. The promise
    // remains pending until MediaSource receives its first MP3 frames.
    try {
      audioStarted = true;
      var playPromise = audio.play();
      if (playPromise && playPromise.then) playPromise.then(function () {
        if (activeSequence === streamSequence) setStatus('В эфире', 'playing');
      }).catch(function (err) {
        audioStarted = false;
        console.warn('[BeamiPhone Radio] play() rejected:', err);
        failPlayback('Движок отклонил воспроизведение: ' + (err && err.message ? err.message : 'повторите запуск'));
      });
    } catch (playError) {
      audioStarted = false;
      failPlayback('Не удалось запустить аудио: ' + (playError.message || playError));
    }
    render();
  }

  function stopStream(keepSelection) {
    streamSequence++;
    activeSequence = streamSequence;
    emitLua('extensions.beamiphone_radio.stop()');
    clearMedia();
    state = keepSelection && selected >= 0 ? 'stopped' : 'stopped';
    statusText = keepSelection && selected >= 0 ? 'Эфир остановлен' : 'Выберите радиостанцию';
    radioIsActive = !!(keepSelection && selected >= 0);
    pendingPlay = false;
    if (BP.bridge && BP.bridge.setStreamWant) BP.bridge.setStreamWant('listener', false);
    if (!keepSelection) selected = -1;
    render();
  }

  function togglePlayPause() {
    if (state === 'playing' || state === 'buffering' || state === 'connecting') stopStream(true);
    else if (selected >= 0) playStation(selected);
    else playStation(0);
  }
  function nextStation() { playStation((selected + 1 + STATIONS.length) % STATIONS.length); }
  function previousStation() { playStation((selected <= 0 ? STATIONS.length - 1 : selected - 1)); }
  function setVolume(value) {
    volume = Math.max(0, Math.min(1, Number(value) || 0));
    if (audio) audio.volume = volume;
    if (spatialGraph) spatialGraph.setVolume(volume);
    try { originals.setVolume.call(BP.audioPlayer, volume); } catch (e) {}
    render();
  }

  function openRadio() {
    if (!overlay) return;
    overlay.classList.add('is-open');
    var phone = overlay.closest('.bp-phone');
    if (phone) phone.setAttribute('data-app', '1');
    if (BP.island) BP.island.setContext({ locked: false, view: 'radio' });
    render();
  }
  function closeRadio() {
    if (!overlay) return;
    overlay.classList.remove('is-open');
    var phone = overlay.closest('.bp-phone');
    if (phone) phone.setAttribute('data-app', '0');
    if (BP.island) BP.island.setContext({ locked: false, view: 'home' });
  }

  function addStyles() {
    if (document.getElementById('bp-radio-style-v6')) return;
    var style = document.createElement('style');
    style.id = 'bp-radio-style-v6';
    style.textContent = [
      '.bp-grad-radio{background:linear-gradient(145deg,#73d9ed 0%,#278edb 48%,#4658cb 100%);}',
      '.bp-radio-glyph{width:100%;height:100%;display:block;}',
      '.bp-radio-overlay{position:absolute;inset:0;z-index:8;display:none;flex-direction:column;box-sizing:border-box;padding:13% 7% 6%;background:linear-gradient(165deg,#151923 0%,#10131b 48%,#0c0e14 100%);color:#f7f8fc;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;overflow:hidden;}',
      '.bp-radio-overlay.is-open{display:flex;}',
      '.bp-radio-header{display:flex;align-items:center;gap:12px;flex:0 0 auto;margin-bottom:15px;}',
      '.bp-radio-back{width:34px;height:34px;border:1px solid rgba(255,255,255,.12);border-radius:50%;background:rgba(255,255,255,.09);color:#f7f8fc;font-size:25px;line-height:25px;display:flex;align-items:center;justify-content:center;padding:0;cursor:pointer;}',
      '.bp-radio-header-title{font-size:21px;line-height:1.1;font-weight:750;letter-spacing:-.5px;flex:1;}',
      '.bp-radio-live-badge{font-size:9px;letter-spacing:.9px;font-weight:800;color:#aeb7c7;background:rgba(255,255,255,.09);padding:6px 8px;border-radius:999px;}',
      '.bp-radio-live-badge.is-live{color:#62e3ad;background:rgba(43,190,131,.15);}',
      '.bp-radio-hero{border:1px solid rgba(255,255,255,.11);border-radius:22px;padding:14px 14px 12px;background:linear-gradient(135deg,rgba(65,94,145,.32),rgba(255,255,255,.055));box-shadow:0 12px 30px rgba(0,0,0,.19);flex:0 0 auto;}',
      '.bp-radio-hero-top{display:flex;align-items:center;gap:12px;}',
      '.bp-radio-hero-mark{width:54px;height:54px;flex:0 0 54px;border-radius:16px;display:flex;align-items:center;justify-content:center;background:linear-gradient(145deg,var(--station-color),#232b3d);box-shadow:inset 0 1px 0 rgba(255,255,255,.28),0 5px 13px rgba(0,0,0,.2);font-weight:850;font-size:12px;letter-spacing:-.3px;color:#fff;text-align:center;padding:4px;box-sizing:border-box;}',
      '.bp-radio-hero-copy{min-width:0;flex:1;}',
      '.bp-radio-hero-title{font-size:18px;font-weight:760;line-height:1.2;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}',
      '.bp-radio-hero-genre{font-size:11px;color:#aeb8c7;margin-top:5px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}',
      '.bp-radio-status{font-size:10px;color:#98a5b7;margin-top:12px;min-height:14px;}',
      '.bp-radio-status[data-state="playing"]{color:#62e3ad;}',
      '.bp-radio-status[data-state="error"]{color:#ff8888;}',
      '.bp-radio-controls{display:flex;align-items:center;justify-content:center;gap:26px;margin:11px 0 10px;}',
      '.bp-radio-control{border:0;background:transparent;color:#f5f7fc;width:32px;height:36px;display:flex;align-items:center;justify-content:center;padding:0;cursor:pointer;}',
      '.bp-radio-control svg{width:21px;height:21px;fill:currentColor;}',
      '.bp-radio-control-main{width:48px;height:48px;border-radius:50%;background:#f3f6fc;color:#121722;box-shadow:0 4px 14px rgba(0,0,0,.25);}',
      '.bp-radio-control-main svg{width:22px;height:22px;}',
      '.bp-radio-volume{display:flex;align-items:center;gap:9px;padding:0 2px 3px;color:#a5b0c0;}',
      '.bp-radio-volume svg{width:14px;height:14px;fill:currentColor;}',
      '.bp-radio-volume input{flex:1;min-width:0;height:3px;accent-color:#61b7ee;cursor:pointer;}',
      '.bp-radio-section{font-size:10px;text-transform:uppercase;letter-spacing:1px;color:#8591a3;font-weight:800;margin:17px 2px 8px;flex:0 0 auto;}',
      '.bp-radio-list{min-height:0;overflow-y:auto;overflow-x:hidden;flex:1;padding-bottom:7px;}',
      '.bp-radio-station{width:100%;display:flex;align-items:center;gap:10px;border:1px solid transparent;background:rgba(255,255,255,.045);border-radius:13px;padding:8px 9px;margin:0 0 6px;color:#f1f3f8;text-align:left;cursor:pointer;box-sizing:border-box;}',
      '.bp-radio-station.is-active{background:rgba(75,151,208,.16);border-color:rgba(102,190,246,.33);}',
      '.bp-radio-station-mark{width:34px;height:34px;flex:0 0 34px;display:flex;align-items:center;justify-content:center;border-radius:10px;background:linear-gradient(145deg,var(--station-color),#263044);font-size:8px;font-weight:850;letter-spacing:-.2px;color:white;box-shadow:inset 0 1px 0 rgba(255,255,255,.25);}',
      '.bp-radio-station-copy{display:flex;flex-direction:column;min-width:0;flex:1;gap:3px;}',
      '.bp-radio-station-name{font-size:11.5px;font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}',
      '.bp-radio-station-genre{font-size:9.5px;color:#8f9bad;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}',
      '.bp-radio-station-end{width:18px;text-align:center;color:#8997a9;font-size:22px;}',
      '.bp-radio-eq{height:17px;display:inline-flex;align-items:center;gap:2px;}',
      '.bp-radio-eq i{width:2px;border-radius:2px;background:#69c9f3;display:block;animation:bpRadioEq .7s ease-in-out infinite alternate;}',
      '.bp-radio-eq i:nth-child(1){height:7px;animation-delay:-.35s}.bp-radio-eq i:nth-child(2){height:15px}.bp-radio-eq i:nth-child(3){height:10px;animation-delay:-.18s}',
      '@keyframes bpRadioEq{from{transform:scaleY(.35)}to{transform:scaleY(1)}}',
      '.bp-radio-footnote{font-size:8.5px;color:#667386;text-align:center;padding:5px 0 0;flex:0 0 auto;}'
    ].join('\n');
    document.head.appendChild(style);
  }

  function injectUi(container) {
    if (!container) return;
    var phoneRoot = container.querySelector('.bp-root') || container;
    if (phoneRoot.querySelector('.bp-radio-overlay')) return;
    var grid = phoneRoot.querySelector('.bp-app-grid');
    var screen = phoneRoot.querySelector('.bp-screen');
    if (!grid || !screen) return;
    addStyles();

    homeButton = document.createElement('button');
    homeButton.className = 'bp-app-icon';
    homeButton.type = 'button';
    homeButton.setAttribute('data-radio-open', '1');
    homeButton.innerHTML = '<span class="bp-icon bp-grad-radio"><svg class="bp-radio-glyph" viewBox="0 0 24 24" aria-hidden="true"><g fill="none" stroke="#fff" stroke-width="1.65" stroke-linecap="round"><path d="M12 11.5V21M9.2 21h5.6M10 17.5h4"/><path d="M12 4.2a1.5 1.5 0 1 0 0 .01M7.8 7.3a6 6 0 0 0 0 8.3M16.2 7.3a6 6 0 0 1 0 8.3M5 4.8a9.5 9.5 0 0 0 0 13.2M19 4.8a9.5 9.5 0 0 1 0 13.2"/></g></svg></span><span class="bp-app-label">Радио</span>';
    grid.appendChild(homeButton);
    homeButton.addEventListener('click', openRadio);

    overlay = document.createElement('section');
    overlay.className = 'bp-radio-overlay';
    overlay.setAttribute('aria-label', 'Радио BeamiPhone');
    overlay.innerHTML =
      '<div class="bp-radio-header">' +
        '<button class="bp-radio-back" type="button" aria-label="Назад">‹</button>' +
        '<div class="bp-radio-header-title">Радио</div>' +
        '<span class="bp-radio-live-badge">РАДИО</span>' +
      '</div>' +
      '<div class="bp-radio-hero">' +
        '<div class="bp-radio-hero-top">' +
          '<div class="bp-radio-hero-mark" style="--station-color:#397FCA">FM</div>' +
          '<div class="bp-radio-hero-copy"><div class="bp-radio-hero-title">Выберите радиостанцию</div><div class="bp-radio-hero-genre">Российские радиостанции</div></div>' +
        '</div>' +
        '<div class="bp-radio-status" data-state="stopped">Выберите радиостанцию</div>' +
        '<div class="bp-radio-controls">' +
          '<button class="bp-radio-control" data-radio-prev="1" type="button" aria-label="Предыдущая станция"><svg viewBox="0 0 24 24"><path d="M6 5h2v14H6zM19 6v12L9 12z"/></svg></button>' +
          '<button class="bp-radio-control bp-radio-control-main" data-radio-play="1" type="button" aria-label="Воспроизвести"><svg viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg></button>' +
          '<button class="bp-radio-control" data-radio-next="1" type="button" aria-label="Следующая станция"><svg viewBox="0 0 24 24"><path d="M16 5h2v14h-2zM5 6v12l10-6z"/></svg></button>' +
        '</div>' +
        '<div class="bp-radio-volume"><svg viewBox="0 0 24 24"><path d="M3 9v6h4l5 4V5L7 9H3zm13.5 3a4.5 4.5 0 0 0-2.5-4.03v8.05a4.5 4.5 0 0 0 2.5-4.02zM14 3.23v2.06a7 7 0 0 1 0 13.42v2.06a9 9 0 0 0 0-17.54z"/></svg><input type="range" min="0" max="100" value="72" data-radio-volume="1"/><svg viewBox="0 0 24 24"><path d="M3 9v6h4l5 4V5L7 9H3zm13.5 3a4.5 4.5 0 0 0-2.5-4.03v8.05a4.5 4.5 0 0 0 2.5-4.02zM14 3.23v2.06a7 7 0 0 1 0 13.42v2.06a9 9 0 0 0 0-17.54z"/></svg></div>' +
      '</div>' +
      '<div class="bp-radio-section">Радиостанции</div>' +
      '<div class="bp-radio-list"></div>' +
      '<div class="bp-radio-footnote">Интернет-радио · Звук через аудиосистему BeamiPhone</div>';
    screen.appendChild(overlay);
    listNode = overlay.querySelector('.bp-radio-list');
    statusNode = overlay.querySelector('.bp-radio-status');
    titleNode = overlay.querySelector('.bp-radio-hero-title');
    heroNode = overlay.querySelector('.bp-radio-hero');
    mainPlayNode = overlay.querySelector('[data-radio-play]');
    overlay.querySelector('.bp-radio-back').addEventListener('click', closeRadio);
    mainPlayNode.addEventListener('click', togglePlayPause);
    overlay.querySelector('[data-radio-prev]').addEventListener('click', previousStation);
    overlay.querySelector('[data-radio-next]').addEventListener('click', nextStation);
    overlay.querySelector('[data-radio-volume]').addEventListener('input', function (ev) {
      setVolume(Number(ev.target.value) / 100);
    });
    render();
  }

  function attachScope(scope) {
    if (!scope || rootScope === scope) return;
    rootScope = scope;
    if (scope.$on) {
      unsubscribeScope.push(scope.$on('beamiPhoneRadioChunk', function (_, payload) { onRadioChunk(payload); }));
      unsubscribeScope.push(scope.$on('beamiPhoneRadioState', function (_, payload) { onRadioState(payload); }));
      unsubscribeScope.push(scope.$on('beamiPhoneToggle', function () { closeRadio(); }));
      unsubscribeScope.push(scope.$on('beamiPhoneListener', function (_, pose) {
        if (!spatialGraph || !radioIsActive || !pose || !pose.cam || !pose.f || !pose.u || !pose.car || !pose.cf) return;
        try { spatialGraph.setPose({ cam: pose.cam, f: pose.f, u: pose.u, car: pose.car, cf: pose.cf, cu: pose.cu || [0, 0, 1], doors: !!pose.doors }); } catch (e) {}
      }));
    }
  }

  function patchAudioPlayer() {
    var player = BP.audioPlayer;
    if (!player || player.__radioPatched) return;
    ['play', 'pause', 'togglePlayPause', 'next', 'previous', 'setVolume', 'getState'].forEach(function (key) {
      originals[key] = player[key];
    });
    player.play = function (index) {
      if (radioIsActive && typeof index !== 'number') { if (state !== 'playing') playStation(selected); return; }
      if (radioIsActive) stopStream(false);
      return originals.play.apply(player, arguments);
    };
    player.pause = function () {
      if (radioIsActive) { stopStream(true); return; }
      return originals.pause.apply(player, arguments);
    };
    player.togglePlayPause = function () {
      if (radioIsActive) return togglePlayPause();
      return originals.togglePlayPause.apply(player, arguments);
    };
    player.next = function () {
      if (radioIsActive) return nextStation();
      return originals.next.apply(player, arguments);
    };
    player.previous = function () {
      if (radioIsActive) return previousStation();
      return originals.previous.apply(player, arguments);
    };
    player.setVolume = function (v) {
      if (radioIsActive) { setVolume(v); return; }
      return originals.setVolume.apply(player, arguments);
    };
    player.getState = function () {
      if (radioIsActive) return radioState();
      return originals.getState.apply(player, arguments);
    };
    player.__radioPatched = true;

    if (BP.ui && BP.ui.renderPlayerState && !BP.ui.renderPlayerState.__radioWrapped) {
      var oldRender = BP.ui.renderPlayerState;
      BP.ui.renderPlayerState = function (incoming) {
        return oldRender.call(BP.ui, radioIsActive ? radioState() : incoming);
      };
      BP.ui.renderPlayerState.__radioWrapped = true;
    }
    if (BP.spatial && BP.spatial.setEnabled && !BP.spatial.setEnabled.__radioWrapped) {
      var oldSpatialSet = BP.spatial.setEnabled;
      BP.spatial.setEnabled = function (on) {
        var result = oldSpatialSet.apply(BP.spatial, arguments);
        routeAudio();
        return result;
      };
      BP.spatial.setEnabled.__radioWrapped = true;
    }
    if (BP.spatial && BP.spatial.getLevels && !BP.spatial.getLevels.__radioWrapped) {
      var oldLevels = BP.spatial.getLevels;
      BP.spatial.getLevels = function (n) {
        if (radioIsActive && analyser && audioContext && audioContext.state === 'running') {
          analyser.getByteFrequencyData(analyserData);
          var edges = [1, 2, 4, 8, 16, 32, 72], out = [];
          for (var i = 0; i < n; i++) {
            var a = edges[Math.min(i, edges.length - 2)], b = edges[Math.min(i + 1, edges.length - 1)], sum = 0;
            for (var j = a; j < b; j++) sum += analyserData[j];
            out.push(Math.min(1, sum / Math.max(1, b - a) / 255));
          }
          return out;
        }
        return oldLevels.apply(BP.spatial, arguments);
      };
      BP.spatial.getLevels.__radioWrapped = true;
    }
  }

  var oldMount = BP.ui && BP.ui.mount;
  if (oldMount && !BP.ui.mount.__radioWrapped) {
    BP.ui.mount = function (container) {
      var result = oldMount.apply(BP.ui, arguments);
      window.setTimeout(function () { injectUi(container); patchAudioPlayer(); }, 0);
      return result;
    };
    BP.ui.mount.__radioWrapped = true;
  }

  BP.radio = {
    __embeddedV6: true,
    stations: STATIONS,
    attachScope: attachScope,
    play: playStation,
    stop: function () { stopStream(false); },
    getState: radioState,
    isPlaying: function () { return state === 'playing' || state === 'buffering'; }
  };
})();
