// BeamiPhone quality-of-life update v2.
// Uses the phone's ORIGINAL lock screen; no second/fake lock-screen overlay.
(function () {
  'use strict';
  var BP = window.BeamiPhone = window.BeamiPhone || {};
  if (BP.enhancements && BP.enhancements.__v2) return;

  var STORE = 'beamiPhone.enhancements.v2';
  var defaults = { brightness: 100, notifications: true, volume: null };
  function readSettings() {
    try { return Object.assign({}, defaults, JSON.parse(localStorage.getItem(STORE) || '{}')); }
    catch (e) { return Object.assign({}, defaults); }
  }
  var settings = readSettings();
  function save() { try { localStorage.setItem(STORE, JSON.stringify(settings)); } catch (e) {} }
  function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, Number(v) || 0)); }
  function qs(root, selector) { return root ? root.querySelector(selector) : null; }
  function encodePath(p) { return String(p).split('/').map(encodeURIComponent).join('/'); }

  // The current music folder is UserFolder/beamiphone/music. Old cached entries
  // may still point into the old mod-local folder, so rebuild their URLs from file.
  function cachedTrack(t) {
    if (!t || !t.file) return null;
    var file = String(t.file).replace(/\\/g, '/');
    var marker = file.toLowerCase().lastIndexOf('/beamiphone/music/');
    if (marker >= 0) file = file.slice(marker + '/beamiphone/music/'.length);
    else if (file.toLowerCase().indexOf('beamiphone/music/') === 0) file = file.slice('beamiphone/music/'.length);
    file = file.replace(/^\/+/, '');
    if (!file || file.split('/').some(function (part) { return part === '..'; })) return null;
    return {
      file: file, ext: t.ext || (file.split('.').pop() || '').toLowerCase(),
      url: '/beamiphone/music/' + encodePath(file),
      title: t.title || file.split('/').pop().replace(/\.[^.]+$/, ''),
      artist: t.artist || 'Unknown Artist', album: t.album || null, coverUrl: t.coverUrl || null
    };
  }
  var cachedTracks = [];
  try {
    var saved = JSON.parse(localStorage.getItem('beamiPhone.lastPlaylist.v1') || '[]');
    if (Array.isArray(saved)) cachedTracks = saved.map(cachedTrack).filter(Boolean);
  } catch (e) { cachedTracks = []; }

  if (BP.audioPlayer) {
    var originalSetPlaylist = BP.audioPlayer.setPlaylist;
    if (originalSetPlaylist && !originalSetPlaylist.__bpCacheWrappedV2) {
      var wrappedSet = function (tracks) {
        if (Array.isArray(tracks) && tracks.length) {
          cachedTracks = tracks.map(function (t) {
            return { file: t.file, ext: t.ext, url: t.url, title: t.title, artist: t.artist,
              album: t.album || null, coverUrl: t.coverUrl || null };
          });
          try { localStorage.setItem('beamiPhone.lastPlaylist.v1', JSON.stringify(cachedTracks)); } catch (e) {}
        }
        return originalSetPlaylist.call(BP.audioPlayer, tracks);
      };
      wrappedSet.__bpCacheWrappedV2 = true;
      BP.audioPlayer.setPlaylist = wrappedSet;
    }
    if (cachedTracks.length && BP.audioPlayer.getState().playlist.length === 0) {
      try { originalSetPlaylist.call(BP.audioPlayer, cachedTracks); } catch (e) {}
      console.info('[BeamiPhone] restored cached tracks from /beamiphone/music/:', cachedTracks.length);
    }
    // The native player handles normal repeat-all. This fallback covers the
    // one-track + shuffle case where randomPlayableIndex() otherwise returns -1.
    var audio = BP.audioPlayer.getAudioElement && BP.audioPlayer.getAudioElement();
    if (audio && !audio.__bpRepeatFallbackV2) {
      audio.__bpRepeatFallbackV2 = true;
      audio.addEventListener('ended', function () {
        window.setTimeout(function () {
          var state = BP.audioPlayer.getState();
          if (!audio.ended || !state || state.radio || state.repeatMode !== 'all' || !state.playlist.length) return;
          var index = state.currentIndex >= 0 ? state.currentIndex : 0;
          console.warn('[BeamiPhone] repeat-all fallback: restart track', index);
          BP.audioPlayer.play(index);
        }, 80);
      });
      console.info('[BeamiPhone] repeat-all fallback installed');
    }
  }

  if (BP.musicLibrary && BP.musicLibrary.handleScanResult && !BP.musicLibrary.handleScanResult.__bpEmptyGuardV2) {
    var originalScan = BP.musicLibrary.handleScanResult;
    var scanGuard = function (data) {
      if ((!data || !Array.isArray(data.tracks) || data.tracks.length === 0) && cachedTracks.length) {
        console.warn('[BeamiPhone] empty music scan; restoring cached files from UserFolder/beamiphone/music');
        if (BP.audioPlayer) BP.audioPlayer.setPlaylist(cachedTracks);
        if (BP.ui && BP.ui.onLibraryUpdated) BP.ui.onLibraryUpdated({ empty: false, error: null,
          musicDir: '/beamiphone/music/', displayPath: (data && data.displayPath) || '' });
        return;
      }
      if (data && Array.isArray(data.tracks)) {
        console.info('[BeamiPhone] music scan returned', data.tracks.length, 'track(s); folder:', data.displayPath || data.musicDir || '(unknown)');
        data.tracks.slice(0, 5).forEach(function (t) {
          console.info('[BeamiPhone] music entry:', t.file, 'directory:', t.dir || data.musicDir || '(unknown)');
        });
      }
      return originalScan.apply(this, arguments);
    };
    scanGuard.__bpEmptyGuardV2 = true;
    BP.musicLibrary.handleScanResult = scanGuard;
  }

  // More responsive map telemetry without increasing the map's canvas redraw rate.
  var fastTelemetry = 0, fastRoute = 0;
  function luaCall(expression) {
    if (window.bngApi && window.bngApi.engineLua) {
      window.bngApi.engineLua("extensions.load('beamiphone_musicScanner'); extensions.beamiphone_musicScanner." + expression);
    }
  }
  if (BP.bridge) {
    BP.bridge.startTelemetryPolling = function () {
      if (fastTelemetry) return;
      luaCall('requestTelemetry()');
      fastTelemetry = window.setInterval(function () { luaCall('requestTelemetry()'); }, 250);
    };
    BP.bridge.stopTelemetryPolling = function () {
      if (fastTelemetry) { clearInterval(fastTelemetry); fastTelemetry = 0; }
    };
    BP.bridge.startRoutePolling = function () {
      if (fastRoute) return;
      luaCall('requestRoute()');
      fastRoute = window.setInterval(function () { luaCall('requestRoute()'); }, 500);
    };
    BP.bridge.stopRoutePolling = function () {
      if (fastRoute) { clearInterval(fastRoute); fastRoute = 0; }
    };
  }

  // Timer keeps counting independently of the Clock app view.
  var timerDeadline = 0, timerRunning = false, timerFinished = false;
  function timerTextMs() {
    var node = document.querySelector('[data-bp="timer-value"]');
    var parts = (node ? node.textContent : '00:00').trim().split(':');
    if (parts.length < 2) return 0;
    return Math.max(0, ((parseInt(parts[0], 10) || 0) * 60 + (parseInt(parts[1], 10) || 0)) * 1000);
  }
  function playAlarm() {
    try {
      var Ctor = window.AudioContext || window.webkitAudioContext;
      if (!Ctor) return;
      var ctx = new Ctor();
      var resumed = ctx.state === 'suspended' ? ctx.resume() : Promise.resolve();
      Promise.resolve(resumed).then(function () {
        [0, 0.24, 0.48].forEach(function (offset, i) {
          var osc = ctx.createOscillator(), gain = ctx.createGain();
          osc.type = 'sine'; osc.frequency.value = [880, 1046, 880][i];
          gain.gain.setValueAtTime(0.0001, ctx.currentTime + offset);
          gain.gain.exponentialRampToValueAtTime(0.14, ctx.currentTime + offset + 0.025);
          gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + offset + 0.19);
          osc.connect(gain); gain.connect(ctx.destination);
          osc.start(ctx.currentTime + offset); osc.stop(ctx.currentTime + offset + 0.21);
        });
        window.setTimeout(function () { try { ctx.close(); } catch (e) {} }, 1200);
      }).catch(function () { try { ctx.close(); } catch (e) {} });
    } catch (e) { console.warn('[BeamiPhone] timer alarm unavailable:', e); }
  }
  function showTimerAlert() {
    if (timerFinished) return;
    timerFinished = true; timerRunning = false; timerDeadline = 0;
    var screen = document.querySelector('.bp-screen');
    if (screen) {
      var alert = screen.querySelector('[data-bpe="timer-alert"]');
      if (!alert) {
        alert = document.createElement('div'); alert.className = 'bp-timer-alert'; alert.setAttribute('data-bpe', 'timer-alert');
        alert.innerHTML = '<div class="bp-timer-alert-icon">◷</div><div class="bp-timer-alert-title">Таймер завершён</div><div class="bp-timer-alert-sub">Время вышло</div><button type="button" data-bpe="timer-dismiss">Готово</button>';
        screen.appendChild(alert);
        alert.querySelector('[data-bpe="timer-dismiss"]').addEventListener('click', function () { alert.classList.remove('bp-show'); });
      }
      alert.classList.add('bp-show');
      var timerNode = screen.querySelector('[data-bp="timer-value"]');
      if (timerNode) timerNode.classList.add('bp-timer-pulse');
      window.setTimeout(function () { alert.classList.remove('bp-show'); if (timerNode) timerNode.classList.remove('bp-timer-pulse'); }, 9000);
    }
    playAlarm();
    if (settings.notifications && BP.notifications && BP.notifications.push) {
      BP.notifications.push({ app: 'clock', title: 'Таймер', body: 'Время вышло', iconHtml: '<span style="font-size:24px">◷</span>' });
    }
    var btn = document.querySelector('[data-bp="timer-toggle"]');
    if (btn) btn.textContent = 'Старт';
  }
  function syncTimerFromUi(action) {
    window.setTimeout(function () {
      var ms = timerTextMs();
      if (action === 'reset') { timerDeadline = 0; timerRunning = false; timerFinished = false; return; }
      if (action === 'add' && timerRunning) { timerDeadline = Date.now() + ms; timerFinished = false; return; }
      if (action === 'toggle') {
        if (timerRunning) { timerRunning = false; timerDeadline = 0; }
        else if (ms > 0) { timerRunning = true; timerDeadline = Date.now() + ms; timerFinished = false; }
      }
    }, 0);
  }
  document.addEventListener('click', function (ev) {
    var target = ev.target && ev.target.closest ? ev.target.closest('[data-bp]') : null;
    if (!target) return;
    var action = target.getAttribute('data-bp');
    if (action === 'timer-toggle') syncTimerFromUi('toggle');
    else if (action === 'timer-reset') syncTimerFromUi('reset');
    else if (action === 'timer-add1' || action === 'timer-add5') syncTimerFromUi('add');
  }, true);
  window.setInterval(function () {
    if (!timerRunning || !timerDeadline) return;
    var left = timerDeadline - Date.now();
    if (left <= 0) { showTimerAlert(); return; }
    var node = document.querySelector('[data-bp="timer-value"]');
    if (node) {
      var total = Math.ceil(left / 1000), mm = Math.floor(total / 60), ss = total % 60;
      node.textContent = String(mm).padStart(2, '0') + ':' + String(ss).padStart(2, '0');
    }
  }, 100);

  function applyVolume(value) {
    value = clamp(value, 0, 100);
    if (BP.audioPlayer && BP.audioPlayer.setVolume) BP.audioPlayer.setVolume(value / 100);
    if (BP.bridge && BP.bridge.savePref) BP.bridge.savePref('volume', value);
    var slider = document.querySelector('[data-bpe="volume"]'); if (slider) slider.value = value;
    var label = document.querySelector('[data-bpe="volume-value"]'); if (label) label.textContent = value + '%';
    settings.volume = value; save();
  }
  function applyBrightness(value) {
    settings.brightness = clamp(value, 25, 100); save();
    var dim = document.querySelector('[data-bpe="brightness-dimmer"]');
    if (dim) dim.style.opacity = String(1 - settings.brightness / 100);
    var slider = document.querySelector('[data-bpe="brightness"]'); if (slider) slider.value = settings.brightness;
    var label = document.querySelector('[data-bpe="brightness-value"]'); if (label) label.textContent = settings.brightness + '%';
  }
  function setNotificationsEnabled(on) {
    settings.notifications = !!on; save();
    var b = document.querySelector('[data-bpe="notifications"]'); if (b) {
      b.classList.toggle('bp-on', settings.notifications);
      var small = b.querySelector('small'); if (small) small.textContent = settings.notifications ? 'Включены' : 'Выключены';
    }
  }
  var originalPush = BP.notifications && BP.notifications.push;
  if (originalPush && !originalPush.__bpSettingsWrappedV2) {
    var pushWrapped = function (n) { if (!settings.notifications) return; return originalPush.call(BP.notifications, n); };
    pushWrapped.__bpSettingsWrappedV2 = true; BP.notifications.push = pushWrapped;
  }

  function attach(container) {
    var phone = container && container.querySelector('.bp-phone');
    var screen = container && container.querySelector('.bp-screen');
    if (!phone || !screen || screen.getAttribute('data-bpe-ready-v2') === '1') return;
    screen.setAttribute('data-bpe-ready-v2', '1');

    var dimmer = document.createElement('div');
    dimmer.className = 'bp-brightness-dimmer'; dimmer.setAttribute('data-bpe', 'brightness-dimmer'); screen.appendChild(dimmer);

    var shade = document.createElement('div'); shade.className = 'bp-control-shade'; shade.setAttribute('data-bpe', 'shade');
    shade.innerHTML = '<div class="bp-shade-grabber"></div><div class="bp-shade-head"><span>Центр управления</span><button type="button" data-bpe="shade-close">Готово</button></div>' +
      '<div class="bp-shade-grid"><button type="button" class="bp-shade-toggle bp-on" data-bpe="notifications"><span>◉</span><b>Уведомления</b><small>Включены</small></button><button type="button" class="bp-shade-toggle" data-bpe="lock"><span>⏻</span><b>Экран блокировки</b><small>Выключить экран</small></button></div>' +
      '<div class="bp-shade-card"><label for="bp-brightness-range"><span>☼</span> Яркость <b data-bpe="brightness-value">100%</b></label><input id="bp-brightness-range" data-bpe="brightness" type="range" min="25" max="100" value="100"></div>' +
      '<div class="bp-shade-card"><label for="bp-volume-range"><span>♫</span> Громкость <b data-bpe="volume-value">35%</b></label><input id="bp-volume-range" data-bpe="volume" type="range" min="0" max="100" value="35"></div>' +
      '<div class="bp-shade-footer">BeamiPhone · Быстрые настройки</div>';
    screen.appendChild(shade);

    function openShade() { shade.classList.add('bp-visible'); }
    function closeShade() { shade.classList.remove('bp-visible'); }

    // Use BeamiPhone's real lockscreen and its native swipe-to-unlock state.
    // Re-opening the same UI instance invokes its own relock() routine.
    var lockBusy = false;
    function lockPhone() {
      closeShade();
      if (lockBusy || !BP.ui || !BP.ui.toggleOpen) return;
      var root = container.querySelector('.bp-root');
      if (!root || !root.classList.contains('bp-open')) return;
      lockBusy = true;
      var phoneTransition = phone.style.transition;
      phone.style.transition = 'none';
      BP.ui.toggleOpen(); // close
      BP.ui.toggleOpen(); // reopen; ui.js calls its original relock() here
      window.setTimeout(function () { phone.style.transition = phoneTransition; lockBusy = false; }, 40);
      console.info('[BeamiPhone] native lockscreen activated');
    }

    var status = qs(phone, '.bp-statusbar');
    shade.querySelector('[data-bpe="shade-close"]').addEventListener('click', closeShade);
    shade.querySelector('[data-bpe="lock"]').addEventListener('click', lockPhone);
    shade.querySelector('[data-bpe="notifications"]').addEventListener('click', function () {
      setNotificationsEnabled(!settings.notifications);
    });
    shade.querySelector('[data-bpe="brightness"]').addEventListener('input', function () { applyBrightness(this.value); });
    shade.querySelector('[data-bpe="volume"]').addEventListener('input', function () { applyVolume(this.value); });

    // Swipe from the actual status bar (not the top of .bp-screen) to open.
    var shadeDownY = null, shadeStartX = null;
    function beginShadeGesture(ev) {
      if (ev.button !== 0 || (ev.target.closest && ev.target.closest('button,input'))) return;
      shadeDownY = ev.clientY; shadeStartX = ev.clientX;
    }
    if (status) status.addEventListener('mousedown', beginShadeGesture);
    shade.addEventListener('mousedown', function (ev) {
      if (ev.button !== 0 || (ev.target.closest && ev.target.closest('button,input'))) return;
      shadeDownY = ev.clientY; shadeStartX = ev.clientX;
    });
    document.addEventListener('mouseup', function (ev) {
      if (shadeDownY === null) return;
      var dy = ev.clientY - shadeDownY, dx = Math.abs(ev.clientX - shadeStartX);
      if (dx < 70 && dy > 50) openShade();
      else if (dx < 70 && dy < -50 && shade.classList.contains('bp-visible')) closeShade();
      shadeDownY = null; shadeStartX = null;
    });

    var initialVolume = settings.volume !== null
      ? settings.volume
      : Math.round((BP.audioPlayer && BP.audioPlayer.getState ? BP.audioPlayer.getState().volume : 0.35) * 100);
    applyBrightness(settings.brightness);
    applyVolume(initialVolume);
    setNotificationsEnabled(settings.notifications);
  }

  BP.enhancements = { __v2: true, attach: attach };
})();
