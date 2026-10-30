// BeamiPhone (c) 2026 wserf. All rights reserved.
// Do not re-upload, redistribute or reuse without permission. See LICENSE.txt. [BP-wserf-A364B58F7647]
// BeamiPhone :: js/ui.js
//
// Builds and updates the actual phone DOM. Appended directly to <body> (see
// app.js for why) so it behaves like a true full-screen overlay regardless of
// the (invisible) BeamNG "app" tile's position/size.

(function () {
  window.BeamiPhone = window.BeamiPhone || {};
  window.BeamiPhone.origin = { author: 'wserf', id: 'BP-wserf-A364B58F7647' };

  var root = null;
  var currentContainer = null;
  var isOpen = false;
  var isLocked = true;
  var currentView = 'home'; // 'home' | 'music' | 'calculator' | 'clock' | 'settings' | 'maps' | 'stub'
  var isSeeking = false;
  var isDragging = false;
  var dragStartY = 0;
  var dragTarget = null;
  var clockTimer = null;
  var lastLibraryStatus = { empty: true, error: null, musicDir: '' };
  var lastTelemetry = { ok: false };

  // ---- Small, original/generic SVG glyphs -----------------------------
  // Deliberately simple geometric shapes (not traced from any real app's
  // icon artwork) so the phone looks "iOS-inspired" without reproducing
  // anyone's copyrighted iconography or trademarks.
  var ICONS = {
    musicNote:
      '<svg viewBox="0 0 24 24"><path fill="white" d="M9 17.5a2.5 2.5 0 1 1-2-2.45V5.7a1 1 0 0 1 .8-.98l9-1.8A1 1 0 0 1 18 3.9V14.5a2.5 2.5 0 1 1-2-2.45V6.42l-7 1.4v9.68z"/></svg>',
    gear:
      '<svg viewBox="0 0 24 24"><g fill="none" stroke="white" stroke-width="1.6"><circle cx="12" cy="12" r="3.4"/>' +
      '<path stroke-linecap="round" d="M12 3.2v2.3M12 18.5v2.3M20.8 12h-2.3M5.5 12H3.2M18 6l-1.6 1.6M7.6 16.4L6 18M18 18l-1.6-1.6M7.6 7.6L6 6"/></g></svg>',
    handset:
      '<svg viewBox="0 0 24 24"><path fill="white" d="M7.3 3.6c.6-.2 1.3 0 1.7.6l1.7 2.6c.4.6.3 1.4-.2 1.9L9 10.2c1 2.3 2.8 4.1 5.1 5.1l1.5-1.5c.5-.5 1.3-.6 1.9-.2l2.6 1.7c.6.4.8 1.1.6 1.7l-.7 2c-.3.8-1.1 1.3-1.9 1.1-6.6-1.4-11.8-6.6-13.2-13.2-.2-.8.3-1.6 1.1-1.9l2-.4z"/></svg>',
    compass:
      '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9" fill="none" stroke="#555" stroke-width="1.6"/>' +
      '<path fill="#d9433f" d="M15.5 8.5 13 13l-4.5 2.5L11 11z"/></svg>',
    calculator:
      '<svg viewBox="0 0 24 24"><rect x="5" y="3" width="14" height="18" rx="2.5" fill="none" stroke="white" stroke-width="1.6"/>' +
      '<rect x="7.3" y="5.3" width="9.4" height="4" rx="1" fill="white"/>' +
      '<circle cx="8.3" cy="13" r="1.15" fill="white"/><circle cx="12" cy="13" r="1.15" fill="white"/><circle cx="15.7" cy="13" r="1.15" fill="white"/>' +
      '<circle cx="8.3" cy="17" r="1.15" fill="white"/><circle cx="12" cy="17" r="1.15" fill="white"/><circle cx="15.7" cy="17" r="1.15" fill="white"/></svg>',
    clockFace:
      '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9" fill="none" stroke="white" stroke-width="1.6"/>' +
      '<path stroke="white" stroke-width="1.6" stroke-linecap="round" d="M12 7v5l3.2 2"/></svg>',
    notes:
      '<svg viewBox="0 0 24 24"><rect x="4" y="3" width="16" height="18" rx="2" fill="white"/>' +
      '<rect x="6.5" y="7" width="11" height="1.6" fill="#ddb84a"/><rect x="6.5" y="11" width="11" height="1.6" fill="#ddb84a"/><rect x="6.5" y="15" width="7" height="1.6" fill="#ddb84a"/></svg>',
    message:
      '<svg viewBox="0 0 24 24"><path fill="white" d="M4 5.5A2.5 2.5 0 0 1 6.5 3h11A2.5 2.5 0 0 1 20 5.5v8A2.5 2.5 0 0 1 17.5 16H9l-4.2 3.6a.6.6 0 0 1-1-.46V5.5z"/></svg>',
    globe:
      '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9" fill="none" stroke="white" stroke-width="1.6"/>' +
      '<ellipse cx="12" cy="12" rx="3.6" ry="9" fill="none" stroke="white" stroke-width="1.3"/>' +
      '<path stroke="white" stroke-width="1.3" d="M3 12h18M4.3 7.5h15.4M4.3 16.5h15.4"/></svg>',
    signal:
      '<svg viewBox="0 0 20 14" class="bp-signal"><rect x="0" y="9" width="3" height="5" rx="0.8" fill="white"/>' +
      '<rect x="5.5" y="6.5" width="3" height="7.5" rx="0.8" fill="white"/>' +
      '<rect x="11" y="3.5" width="3" height="10.5" rx="0.8" fill="white"/>' +
      '<rect x="16.5" y="0.5" width="3" height="13.5" rx="0.8" fill="white" opacity="0.9"/></svg>',
    wifi:
      '<svg viewBox="0 0 20 16" class="bp-wifi"><g fill="none" stroke="white" stroke-width="1.7" stroke-linecap="round">' +
      '<path d="M2 6.2a11 11 0 0 1 16 0"/><path d="M4.8 9.4a7 7 0 0 1 10.4 0"/><path d="M7.6 12.5a3 3 0 0 1 4.8 0"/></g>' +
      '<circle cx="10" cy="14.5" r="1.1" fill="white"/></svg>',
    battery:
      '<svg viewBox="0 0 26 13" class="bp-battery"><rect x="0.75" y="0.75" width="21.5" height="11.5" rx="3" fill="none" stroke="white" stroke-width="1.2" opacity="0.7"/>' +
      '<rect x="2.5" y="2.5" width="15" height="8" rx="1.6" fill="white"/>' +
      '<rect x="23" y="4" width="2" height="5" rx="1" fill="white" opacity="0.7"/></svg>',
    compassNeedle:
      '<svg viewBox="0 0 24 24" data-bp="compass-needle"><path fill="#ff453a" d="M12 2 L14.4 11.2 12 12 z"/><path fill="#c9c9d6" d="M12 22 L9.6 12.8 12 12 z"/></svg>',
    flashlight:
      '<svg viewBox="0 0 24 24"><path fill="white" d="M13 2 4 14h6l-1 8 10-13h-6z"/></svg>',
    cameraDot:
      '<svg viewBox="0 0 24 24"><rect x="3" y="7" width="18" height="13" rx="2.5" fill="white"/><circle cx="12" cy="13.5" r="3.4" fill="#222"/><rect x="9" y="4" width="6" height="3" rx="1" fill="white"/></svg>',
    car:
      '<svg viewBox="0 0 24 24"><path fill="white" d="M5 13l1.5-4.5A2 2 0 0 1 8.4 7h7.2a2 2 0 0 1 1.9 1.5L19 13v5a1 1 0 0 1-1 1h-1a1 1 0 0 1-1-1v-1H8v1a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1z"/>' +
      '<circle cx="7.5" cy="15.5" r="1.3" fill="#222"/><circle cx="16.5" cy="15.5" r="1.3" fill="#222"/></svg>',
    headlight:
      '<svg viewBox="0 0 24 24"><path fill="white" d="M3 9h8l4 3-4 3H3z"/><path fill="white" opacity="0.6" d="M15 9.5 21 8v8l-6-1.5z"/></svg>',
    hazard:
      '<svg viewBox="0 0 24 24"><path fill="white" d="M12 2 L22 20 H2 Z"/><rect x="10.7" y="9" width="2.6" height="6" fill="#222"/><rect x="10.7" y="16" width="2.6" height="2" fill="#222"/></svg>',
    trunk:
      '<svg viewBox="0 0 24 24"><path fill="white" d="M3 15l1.3-3.9A2 2 0 0 1 6.2 10H13v7H4a1 1 0 0 1-1-1z"/>' +
      '<path fill="none" stroke="white" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" d="M13 10 17.5 5.5H21v3.5L16.5 13"/>' +
      '<circle cx="7.5" cy="17" r="1.6" fill="white"/><circle cx="15" cy="17" r="1.6" fill="white"/></svg>',
    weather:
      '<svg viewBox="0 0 24 24"><circle cx="9" cy="9" r="3.4" fill="#ffd54a"/>' +
      '<path stroke="#ffd54a" stroke-width="1.6" stroke-linecap="round" d="M9 2.6v1.6M9 13.8v1.6M2.6 9h1.6M13.8 9h1.6M4.5 4.5l1.1 1.1M12.4 12.4l1.1 1.1M4.5 13.5l1.1-1.1M12.4 5.6l1.1-1.1"/>' +
      '<path fill="white" d="M9.5 20a4 4 0 0 1-.3-8 5 5 0 0 1 9.6 1.3 3.4 3.4 0 0 1-.6 6.7z"/></svg>',
    key:
      '<svg viewBox="0 0 24 24"><circle cx="8" cy="12" r="4.5" fill="none" stroke="white" stroke-width="1.8"/>' +
      '<path stroke="white" stroke-width="1.8" stroke-linecap="round" d="M12 12h9M17 12v3M20 12v3"/></svg>',
    dragy:
      '<svg viewBox="0 0 24 24"><path fill="none" stroke="white" stroke-width="1.6" d="M4 16 A8 8 0 0 1 20 16"/>' +
      '<path fill="white" d="M12 16 L17 9 L13 15 Z"/><circle cx="12" cy="16" r="1.4" fill="white"/></svg>',
    camera:
      '<svg viewBox="0 0 24 24"><path fill="white" d="M4 8a2 2 0 0 1 2-2h1.2l.9-1.4A1.5 1.5 0 0 1 9.4 4h5.2c.5 0 1 .25 1.3.7L16.8 6H18a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2z"/>' +
      '<circle cx="12" cy="13" r="3.4" fill="#222"/></svg>',
  };

  var DEFAULT_COVER_SVG =
    'data:image/svg+xml;utf8,' + encodeURIComponent(
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200">' +
      '<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">' +
      '<stop offset="0" stop-color="%23434355"/><stop offset="1" stop-color="%231c1c26"/>' +
      '</linearGradient></defs>' +
      '<rect width="200" height="200" rx="18" fill="url(%23g)"/>' +
      '<path d="M70 130 L70 60 L140 45 L140 115" stroke="%237d7d92" stroke-width="6" fill="none"/>' +
      '<circle cx="62" cy="132" r="16" fill="%237d7d92"/>' +
      '<circle cx="132" cy="117" r="16" fill="%237d7d92"/>' +
      '</svg>'
    ).replace(/#/g, '%23');

  function formatTime(sec) {
    if (!isFinite(sec) || sec < 0) sec = 0;
    var m = Math.floor(sec / 60);
    var s = Math.floor(sec % 60);
    return m + ':' + (s < 10 ? '0' : '') + s;
  }

  function pad2(n) { return (n < 10 ? '0' : '') + n; }

  function el(selector) {
    return root ? root.querySelector(selector) : null;
  }

  function appIcon(gradientClass, glyph, label, dataAttr, iconKey, i18nKey) {
    return '' +
      '<button class="bp-app-icon" data-bp="' + dataAttr + '">' +
      '  <span class="bp-icon ' + gradientClass + '" data-icon-key="' + iconKey + '">' + glyph + '</span>' +
      '  <span class="bp-app-label"' + (i18nKey ? ' data-i18n="' + i18nKey + '"' : '') + '>' + label + '</span>' +
      '</button>';
  }

  function stubIcon(gradientClass, glyph, label, iconKey, i18nKey) {
    return '' +
      '<button class="bp-app-icon" data-bp="open-stub" data-label="' + label + '" data-i18n-label="' + (i18nKey || '') + '">' +
      '  <span class="bp-icon ' + gradientClass + '" data-icon-key="' + iconKey + '">' + glyph + '</span>' +
      '  <span class="bp-app-label"' + (i18nKey ? ' data-i18n="' + i18nKey + '"' : '') + '>' + label + '</span>' +
      '</button>';
  }

  // ------------------------------------------------------------------
  // DOM construction
  // ------------------------------------------------------------------

  function buildDom(container) {
    var wrapper = document.createElement('div');
    wrapper.className = 'bp-root';
    wrapper.innerHTML =
      '<div class="bp-scaler" data-bp="scaler">' +
      '<div class="bp-phone" data-bp="phone" data-wallpaper="sunset">' +
      '  <div class="bp-side-btn bp-side-btn-mute"></div>' +
      '  <div class="bp-side-btn bp-side-btn-vol-up"></div>' +
      '  <div class="bp-side-btn bp-side-btn-vol-down"></div>' +
      '  <div class="bp-side-btn bp-side-btn-power"></div>' +
      '  <div class="bp-island" data-bp="island"></div>' +
      '  <div class="bp-statusbar">' +
      '    <span class="bp-clock" data-bp="clock">--:--</span>' +
      '    <span class="bp-status-icons">' + ICONS.signal + '<span class="bp-status-5g">5G</span>' + ICONS.battery + '</span>' +
      '  </div>' +

      '  <div class="bp-screen">' +

      '    <div class="bp-lockscreen" data-bp="lockscreen">' +
      '      <div class="bp-wallpaper bp-wallpaper-lock"></div>' +
      '      <div class="bp-lock-date" data-bp="lock-date">—</div>' +
      '      <div class="bp-lock-time" data-bp="lock-time">--:--</div>' +
      '      <div class="bp-lock-bottom">' +
      '      <div class="bp-mini-player bp-lock-music" data-bp="lock-music" style="display:none">' + widgetMarkup('lock') + '</div>' +
      '        <div class="bp-lock-notifs-wrap" data-bp="lock-notifs-wrap">' +
      '          <div class="bp-lock-notifs" data-bp="lock-notifs"></div>' +
      '          <div class="bp-lock-fade"></div>' +
      '        </div>' +
      '      <div class="bp-lock-shortcuts">' +
      '        <span class="bp-lock-shortcut">' + ICONS.flashlight + '</span>' +
      '        <span class="bp-lock-shortcut">' + ICONS.cameraDot + '</span>' +
      '      </div>' +
      '      </div>' +
      '    </div>' +

      '    <div class="bp-view bp-view-home" data-bp="view-home">' +
      '      <div class="bp-wallpaper"></div>' +
      '      <div class="bp-app-grid">' +
      appIcon('bp-grad-music', ICONS.musicNote, 'Музыка', 'open-music', 'music', 'appMusic') +
      appIcon('bp-grad-dark', ICONS.calculator, 'Калькулятор', 'open-calculator', 'calculator', 'appCalculator') +
      appIcon('bp-grad-clock', ICONS.clockFace, 'Часы', 'open-clock', 'clock', 'appClock') +
      appIcon('bp-grad-gray', ICONS.gear, 'Настройки', 'open-settings', 'settings', 'appSettings') +
      appIcon('bp-grad-light', ICONS.compass, 'Карты', 'open-maps', 'maps', 'appMaps') +
      appIcon('bp-grad-red', ICONS.car, 'Моя машина', 'open-car', 'car', 'appCar') +
      appIcon('bp-grad-orange', ICONS.dragy, 'Dragy', 'open-dragy', 'dragy') +
      appIcon('bp-grad-blue', ICONS.weather, 'Weather', 'open-weather', 'weather', 'appWeather') +
      appIcon('bp-grad-yellow', ICONS.notes, 'Заметки', 'open-notes', 'notes', 'appNotes') +
      '      </div>' +
      '      <div class="bp-mini-player" data-bp="mini-player" style="display:none">' + widgetMarkup('mini') + '</div>' +
      '      <div class="bp-dock">' +
      stubIcon('bp-grad-green', ICONS.handset, 'Телефон', 'phone', 'appPhone') +
      appIcon('bp-grad-blue', ICONS.globe, 'Safari', 'open-safari', 'safari', 'appSafari') +
      stubIcon('bp-grad-green2', ICONS.message, 'Сообщения', 'messages', 'appMessages') +
      appIcon('bp-grad-music', ICONS.musicNote, '', 'open-music-dock', 'music', null) +
      '      </div>' +
      '    </div>' +

      '    <div class="bp-view bp-view-music" data-bp="view-music">' +
      '      <div class="bp-app-header">' +
      '        <button class="bp-back" data-bp="back-home">‹</button>' +
      '        <span data-i18n="musicHeader">Music</span>' +
      '        <span style="width:28px"></span>' +
      '      </div>' +
      '      <div class="bp-music-scroll">' +
      '        <div class="bp-section-row">' +
      '          <div class="bp-section-title" data-i18n="musicRecent">Недавно добавленные</div>' +
      '          <div class="bp-section-btns">' +
      '            <button class="bp-folder-btn" data-bp="refresh-top" data-i18n="musicRefreshShort">Refresh</button>' +
      '            <button class="bp-folder-btn" data-bp="open-folder" data-i18n="musicFolder">Folder</button>' +
      '          </div>' +
      '        </div>' +
      '        <div class="bp-music-path" data-bp="music-path"></div>' +
      '        <div class="bp-music-toast" data-bp="music-toast"></div>' +
      '        <div class="bp-track-list" data-bp="track-list"></div>' +
      '        <div class="bp-empty-state" data-bp="empty-state" style="display:none">' +
      '          <div class="bp-empty-title" data-bp="empty-title" data-i18n="musicEmptyTitle">No music yet</div>' +
      '          <div class="bp-empty-text" data-bp="empty-text" data-i18n="musicEmptyText">Add .mp3 / .ogg / .wav files to the folder:</div>' +
      '          <code class="bp-empty-path" data-bp="empty-path"></code>' +
      '          <button class="bp-refresh-btn" data-bp="refresh" data-i18n="musicRefresh">🔄 Обновить список</button>' +
      '        </div>' +
      '      </div>' +

      '      <div class="bp-now-playing" data-bp="now-playing" style="display:none">' +
      '        <img class="bp-np-cover" data-bp="np-cover" src="" alt="" />' +
      '        <div class="bp-np-title" data-bp="np-title">—</div>' +
      '        <div class="bp-np-artist" data-bp="np-artist">—</div>' +

      '        <div class="bp-progress" data-bp="progress">' +
      '          <div class="bp-progress-track">' +
      '            <div class="bp-progress-fill" data-bp="progress-fill"></div>' +
      '            <div class="bp-progress-handle" data-bp="progress-handle"></div>' +
      '          </div>' +
      '          <div class="bp-progress-times">' +
      '            <span data-bp="time-current">0:00</span>' +
      '            <span data-bp="time-duration">0:00</span>' +
      '          </div>' +
      '        </div>' +

      '        <div class="bp-controls">' +
      '          <button class="bp-ctrl-btn bp-ctrl-mini" data-bp="shuffle" title="Shuffle">🔀</button>' +
      '          <button class="bp-ctrl-btn" data-bp="prev">⏮</button>' +
      '          <button class="bp-ctrl-btn bp-ctrl-play" data-bp="playpause">▶</button>' +
      '          <button class="bp-ctrl-btn" data-bp="next">⏭</button>' +
      '          <button class="bp-ctrl-btn bp-ctrl-mini" data-bp="repeat" title="Repeat">🔁</button>' +
      '        </div>' +

      '        <div class="bp-volume">' +
      '          <span>🔊</span>' +
      '          <input type="range" min="0" max="100" value="35" data-bp="volume" />' +
      '        </div>' +
      '      </div>' +
      '    </div>' +

      '    <div class="bp-view bp-view-calculator" data-bp="view-calculator">' +
      '      <div class="bp-app-header"><button class="bp-back" data-bp="back-home">‹</button><span data-i18n="appCalculator">Calculator</span><span style="width:28px"></span></div>' +
      '      <div class="bp-calc-display" data-bp="calc-display">0</div>' +
      '      <div class="bp-calc-grid" data-bp="calc-grid">' +
      buildCalcButtons() +
      '      </div>' +
      '    </div>' +

      '    <div class="bp-view bp-view-clock" data-bp="view-clock">' +
      '      <div class="bp-app-header"><button class="bp-back" data-bp="back-home">‹</button><span data-i18n="appClock">Clock</span><span style="width:28px"></span></div>' +
      '      <div class="bp-clock-tabs">' +
      '        <button class="bp-clock-tab bp-clock-tab-active" data-bp="clock-tab" data-tab="world" data-i18n="clockTabTime">Time</button>' +
      '        <button class="bp-clock-tab" data-bp="clock-tab" data-tab="stopwatch" data-i18n="clockTabStopwatch">Stopwatch</button>' +
      '        <button class="bp-clock-tab" data-bp="clock-tab" data-tab="timer" data-i18n="clockTabTimer">Timer</button>' +
      '      </div>' +
      '      <div class="bp-clock-panel bp-clock-panel-active" data-bp="clock-panel-world">' +
      '        <div class="bp-time-card">' +
      '          <div class="bp-time-card-label" data-i18n="clockRealTime">Real time (your PC)</div>' +
      '          <div class="bp-time-card-value" data-bp="real-time">--:--:--</div>' +
      '          <div class="bp-time-card-sub" data-bp="real-date">—</div>' +
      '        </div>' +
      '        <div class="bp-time-card">' +
      '          <div class="bp-time-card-label" data-i18n="clockGameTime">Time in BeamNG</div>' +
      '          <div class="bp-time-card-value" data-bp="game-time">--:--</div>' +
      '          <div class="bp-time-card-sub" data-bp="game-time-sub">No data</div>' +
      '        </div>' +
      '      </div>' +
      '      <div class="bp-clock-panel" data-bp="clock-panel-stopwatch">' +
      '        <div class="bp-stopwatch-value" data-bp="stopwatch-value">00:00.0</div>' +
      '        <div class="bp-clock-btn-row">' +
      '          <button class="bp-clock-btn" data-bp="stopwatch-toggle" data-i18n="btnStart">Start</button>' +
      '          <button class="bp-clock-btn bp-clock-btn-secondary" data-bp="stopwatch-reset" data-i18n="btnReset">Reset</button>' +
      '        </div>' +
      '      </div>' +
      '      <div class="bp-clock-panel" data-bp="clock-panel-timer">' +
      '        <div class="bp-stopwatch-value" data-bp="timer-value">00:00</div>' +
      '        <div class="bp-clock-btn-row">' +
      '          <button class="bp-clock-btn bp-clock-btn-secondary" data-bp="timer-add1" data-i18n="timerAdd1">+1 min</button>' +
      '          <button class="bp-clock-btn bp-clock-btn-secondary" data-bp="timer-add5" data-i18n="timerAdd5">+5 min</button>' +
      '        </div>' +
      '        <div class="bp-clock-btn-row">' +
      '          <button class="bp-clock-btn" data-bp="timer-toggle" data-i18n="btnStart">Start</button>' +
      '          <button class="bp-clock-btn bp-clock-btn-secondary" data-bp="timer-reset" data-i18n="btnReset">Reset</button>' +
      '        </div>' +
      '      </div>' +
      '    </div>' +

      '    <div class="bp-view bp-view-settings" data-bp="view-settings">' +
      '      <div class="bp-app-header"><button class="bp-back" data-bp="back-home">‹</button><span data-i18n="appSettings">Settings</span><span style="width:28px"></span></div>' +
      '      <div class="bp-settings-scroll">' +
      '        <div class="bp-settings-section-title" data-i18n="settingsWallpaper">Обои</div>' +
      '        <div class="bp-wallpaper-swatches" data-bp="wallpaper-swatches">' +
      '          <button class="bp-swatch bp-swatch-sunset" data-bp="wallpaper" data-wp="sunset"></button>' +
      '          <button class="bp-swatch bp-swatch-orbs" data-bp="wallpaper" data-wp="orbs"></button>' +
      '          <button class="bp-swatch bp-swatch-ocean" data-bp="wallpaper" data-wp="ocean"></button>' +
      '          <button class="bp-swatch bp-swatch-forest" data-bp="wallpaper" data-wp="forest"></button>' +
      '        </div>' +
      '        <div class="bp-settings-section-title" data-i18n="settingsTheme">Тема приложений</div>' +
      '        <div class="bp-settings-row">' +
      '          <span data-i18n="settingsThemeDark">Тёмная тема</span>' +
      '          <button class="bp-theme-toggle" data-bp="theme-toggle" data-on="1"><span class="bp-theme-toggle-knob"></span></button>' +
      '        </div>' +
      '        <div class="bp-settings-section-title" data-i18n="settingsSpatial">Spatial audio</div>' +
      '        <div class="bp-settings-row">' +
      '          <span data-i18n="settingsSpatialHint">Music plays from the car speakers</span>' +
      '          <button class="bp-theme-toggle" data-bp="spatial-toggle" data-on="1"><span class="bp-theme-toggle-knob"></span></button>' +
      '        </div>' +
      '        <div class="bp-settings-section-title" data-i18n="settingsSmart">Smart notifications</div>' +
      '        <div class="bp-settings-row">' +
      '          <span data-i18n="settingsSmartHint">Speeding and low fuel alerts</span>' +
      '          <button class="bp-theme-toggle" data-bp="smart-toggle" data-on="1"><span class="bp-theme-toggle-knob"></span></button>' +
      '        </div>' +
      '        <div class="bp-settings-section-title" data-i18n="settingsLanguage">Язык</div>' +
      '        <div class="bp-settings-row bp-lang-row" data-bp="lang-open" role="button" tabindex="0">' +
      '          <span data-bp="lang-current-name">English</span><span class="bp-lang-chevron">⌄</span>' +
      '        </div>' +
      '        <div class="bp-settings-section-title" data-i18n="settingsAbout">Об этом BeamiPhone</div>' +
      '        <div class="bp-about-card">' +
      '          <div class="bp-about-row"><span data-i18n="aboutVersion">Версия</span><span>1.1</span></div>' +
      '          <div class="bp-about-row"><span data-i18n="aboutModel">Модель</span><span>BeamiPhone</span></div>' +
      '          <div class="bp-about-row"><span data-i18n="aboutKey">Клавиша</span><span>F3</span></div>' +
      '          <div class="bp-about-row"><span data-i18n="aboutAuthor">Author</span><span>wserf</span></div>' +
      '          <div class="bp-about-text" data-i18n="aboutText">Made for BeamNG.drive. Real audio player, real car telemetry, zero fake data.</div>' +
      '        </div>' +
      '      </div>' +
      '      <div class="bp-lang-sheet" data-bp="lang-sheet">' +
      '        <div class="bp-lang-menu">' +
      '          <div class="bp-lang-option" data-lang="ru" role="button" tabindex="0"><span>Русский</span><span class="bp-lang-check">✓</span></div>' +
      '          <div class="bp-lang-option" data-lang="en" role="button" tabindex="0"><span>English</span><span class="bp-lang-check">✓</span></div>' +
      '          <div class="bp-lang-option" data-lang="pl" role="button" tabindex="0"><span>Polski</span><span class="bp-lang-check">✓</span></div>' +
      '          <div class="bp-lang-option" data-lang="de" role="button" tabindex="0"><span>Deutsch</span><span class="bp-lang-check">✓</span></div>' +
      '          <div class="bp-lang-option" data-lang="cs" role="button" tabindex="0"><span>Čeština</span><span class="bp-lang-check">✓</span></div>' +
      '          <div class="bp-lang-option" data-lang="pt" role="button" tabindex="0"><span>Português</span><span class="bp-lang-check">✓</span></div>' +
      '          <div class="bp-lang-option" data-lang="fr" role="button" tabindex="0"><span>Français</span><span class="bp-lang-check">✓</span></div>' +
      '          <div class="bp-lang-option" data-lang="it" role="button" tabindex="0"><span>Italiano</span><span class="bp-lang-check">✓</span></div>' +
      '        </div>' +
      '      </div>' +
      '    </div>' +

      '    <div class="bp-view bp-view-maps" data-bp="view-maps">' +
      '      <div class="bp-app-header"><button class="bp-back" data-bp="back-home">‹</button><span data-i18n="appMaps">Maps</span><span style="width:28px"></span></div>' +
      '      <div class="bp-map-wrap" data-bp="map-wrap">' +
      '        <div class="bp-navi" data-bp="navi" style="display:none">' +
      '          <div id="bpNaviWrap" class="bp-navi-wrap"><div id="bpMapContainer"><svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink"></svg></div></div>' +
      '          <div id="bpBootscreen" style="display:none"></div><span id="bpNaviClock" style="display:none"></span>' +
      '          <div class="bp-navi-marker" data-bp="navi-marker"><svg viewBox="0 0 33.867 33.867" width="30" height="30"><g transform="translate(0 -263.133)"><g transform="matrix(4.53704 0 0 4.53704 -7.075 -1044.026)"><path d="M5.292 288.798l-2.646 6.614 2.646-1.322 2.646 1.322z" fill="rgba(0,0,0,0.4)"/><path d="M5.292 288.269l-2.646 6.614 2.646-1.323 2.645 1.323z" class="bp-mk-top"/></g></g></svg></div>' +
      '        </div>' +
      '        <canvas class="bp-map-canvas" data-bp="map-canvas"></canvas>' +
      '        <div class="bp-map-msg" data-bp="map-msg"></div>' +
      '        <div class="bp-map-tools">' +
      '          <button class="bp-map-btn" data-bp="map-zin">+</button>' +
      '          <button class="bp-map-btn" data-bp="map-zout">−</button>' +
      '          <button class="bp-map-btn" data-bp="map-north">N</button>' +
      '          <button class="bp-map-btn" data-bp="map-follow">◎</button>' +
      '          <button class="bp-map-btn" data-bp="map-style">◐</button>' +
      '          <button class="bp-map-btn" data-bp="map-engine">⇄</button>' +
      '        </div>' +
      '        <div class="bp-map-bar">' +
      '          <div class="bp-map-cell"><span data-i18n="mapsSpeed">Speed</span><b data-bp="maps-speed">—</b></div>' +
      '          <div class="bp-map-cell"><span data-i18n="mapsLimit">Speed limit</span><b data-bp="maps-limit">—</b></div>' +
      '          <div class="bp-map-cell"><span data-i18n="mapsRoute">Route</span><b data-bp="maps-route">—</b></div>' +
      '        </div>' +
      '      </div>' +
      '    </div>' +

      '    <div class="bp-view bp-view-car" data-bp="view-car">' +
      '      <div class="bp-app-header"><button class="bp-back" data-bp="back-home">‹</button><span data-i18n="appCar">My Car</span><span style="width:28px"></span></div>' +
      '      <div class="bp-car-body" data-bp="car-body">' +
      '        <div class="bp-car-hero">' +
      '          <div class="bp-car-swatch" data-bp="car-swatch"></div>' +
      '          <img class="bp-car-photo" src="/ui/modules/apps/BeamiPhone/car/hero.png" alt="" />' +
      '        </div>' +
      '        <div class="bp-car-name" data-bp="car-name">No vehicle data</div>' +
      '        <div class="bp-car-status" data-bp="car-status" data-i18n="carOutside" style="display:none">Out of the car</div>' +
      '        <div class="bp-car-stats">' +
      '          <div class="bp-car-stat"><span data-i18n="carPower">Power</span><b data-bp="car-power">—</b></div>' +
      '          <div class="bp-car-stat"><span data-i18n="carTorque">Torque</span><b data-bp="car-torque">—</b></div>' +
      '          <div class="bp-car-stat bp-car-stat-wide"><span data-i18n="carFuel">Fuel / charge</span><b data-bp="car-fuel">—</b></div>' +
      '        </div>' +
      '        <div class="bp-car-actions">' +
      '          <button class="bp-car-btn" data-bp="car-engine-start">' + ICONS.key + '<span data-i18n="carEngine">Зажигание / Завести</span></button>' +
      '          <button class="bp-car-btn" data-bp="car-engine-stop">' + ICONS.key + '<span data-i18n="carEngineStop">Заглушить</span></button>' +
      '          <button class="bp-car-btn" data-bp="car-lights">' + ICONS.headlight + '<span data-i18n="carLights">Свет</span></button>' +
      '          <button class="bp-car-btn" data-bp="car-hazard">' + ICONS.hazard + '<span data-i18n="carHazard">Аварийка</span></button>' +
      '          <button class="bp-car-btn bp-car-btn-wide" data-bp="car-trunk">' + ICONS.trunk + '<span data-i18n="carTrunk">Trunk</span></button>' +
      '        </div>' +
      '        <div class="bp-car-toast" data-bp="car-toast"></div>' +
      '      </div>' +
      '    </div>' +

      '    <div class="bp-view bp-view-weather" data-bp="view-weather">' +
      '      <div class="bp-app-header"><button class="bp-back" data-bp="back-home">‹</button><span data-i18n="appWeather">Weather</span><span style="width:28px"></span></div>' +
      '      <div class="bp-weather-body">' +
      '        <div class="bp-w-hero" data-bp="w-hero">' +
      '          <div class="bp-w-sky bp-w-sky-night" data-bp="w-sky-night"></div>' +
      '          <div class="bp-w-sky bp-w-sky-dawn" data-bp="w-sky-dawn"></div>' +
      '          <div class="bp-w-sky bp-w-sky-day" data-bp="w-sky-day"></div>' +
      '          <div class="bp-w-sky bp-w-sky-dusk" data-bp="w-sky-dusk"></div>' +
      '          <div class="bp-w-orb" data-bp="w-orb"></div>' +
      '          <div class="bp-w-cloudlayer" data-bp="w-cloudlayer"><i></i><i></i><i></i></div>' +
      '          <div class="bp-w-grey" data-bp="w-grey"></div>' +
      '          <div class="bp-w-rainlayer" data-bp="w-rainlayer"><div></div></div>' +
      '          <div class="bp-w-foglayer" data-bp="w-foglayer"></div>' +
      '          <div class="bp-w-heroinfo">' +
      '            <div class="bp-w-herolabel" data-i18n="wNow">Now</div>' +
      '            <div class="bp-w-big" data-bp="w-time-val">12:00</div>' +
      '            <div class="bp-w-cond" data-bp="w-cond">Clear</div>' +
      '          </div>' +
      '        </div>' +
      '        <div class="bp-w-card">' +
      '          <div class="bp-w-label"><span data-i18n="wTimeTitle">Time of day</span></div>' +
      '          <input type="range" class="bp-w-range bp-w-range-time" data-bp="w-hour" min="0" max="1435" step="5" value="720" />' +
      '          <div class="bp-w-label bp-w-sub"><span data-i18n="wFlow">Time flow</span></div>' +
      '          <div class="bp-w-seg" data-bp="w-flow">' +
      '            <button class="bp-w-segbtn" data-flow="0" data-i18n="btnPause">Pause</button>' +
      '            <button class="bp-w-segbtn" data-flow="1">x1</button>' +
      '            <button class="bp-w-segbtn" data-flow="5">x5</button>' +
      '            <button class="bp-w-segbtn" data-flow="20">x20</button>' +
      '            <button class="bp-w-segbtn" data-flow="60">x60</button>' +
      '          </div>' +
      '        </div>' +
      '        <div class="bp-w-card">' +
      '          <div class="bp-w-label"><span data-i18n="wPresets">Presets</span></div>' +
      '          <div class="bp-w-presets">' +
      '            <button class="bp-w-preset" data-wpreset="clear"><svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="4.2" fill="currentColor"/><path stroke="currentColor" stroke-width="1.8" stroke-linecap="round" d="M12 2.8v2.4M12 18.8v2.4M2.8 12h2.4M18.8 12h2.4M5.5 5.5l1.7 1.7M16.8 16.8l1.7 1.7M5.5 18.5l1.7-1.7M16.8 7.2l1.7-1.7"/></svg><span data-i18n="wClear">clear</span></button>' +
      '            <button class="bp-w-preset" data-wpreset="cloudy"><svg viewBox="0 0 24 24"><path fill="currentColor" d="M7.5 19a4.5 4.5 0 0 1-.4-9 6 6 0 0 1 11.5 1.5A3.8 3.8 0 0 1 18 19z"/></svg><span data-i18n="wCloudy">cloudy</span></button>' +
      '            <button class="bp-w-preset" data-wpreset="rain"><svg viewBox="0 0 24 24"><path fill="currentColor" d="M7.5 15a4.2 4.2 0 0 1-.3-8.4 5.6 5.6 0 0 1 10.7 1.4A3.5 3.5 0 0 1 17.5 15z"/><path stroke="currentColor" stroke-width="1.8" stroke-linecap="round" d="M8 18l-1 3M12.5 18l-1 3M17 18l-1 3"/></svg><span data-i18n="wRain">rain</span></button>' +
      '            <button class="bp-w-preset" data-wpreset="fog"><svg viewBox="0 0 24 24"><path stroke="currentColor" stroke-width="2" stroke-linecap="round" d="M4 8h13M7 12.5h13M4 17h11"/></svg><span data-i18n="wFog">fog</span></button>' +
      '          </div>' +
      '        </div>' +
      '        <div class="bp-w-card bp-w-sliders">' +
      '          <div class="bp-w-row"><div class="bp-w-label"><span data-i18n="wClouds">Clouds</span><b data-bp="w-clouds-val">—</b></div>' +
      '          <input type="range" class="bp-w-range" data-bp="w-clouds" data-wkey="clouds" min="0" max="3" step="0.05" value="0" /></div>' +
      '          <div class="bp-w-row"><div class="bp-w-label"><span data-i18n="wFog">Fog</span><b data-bp="w-fog-val">—</b></div>' +
      '          <input type="range" class="bp-w-range" data-bp="w-fog" data-wkey="fog" min="0" max="60" step="1" value="0" /></div>' +
      '          <div class="bp-w-row"><div class="bp-w-label"><span data-i18n="wRain">Rain</span><b data-bp="w-rain-val">—</b></div>' +
      '          <input type="range" class="bp-w-range" data-bp="w-rain" data-wkey="rain" min="0" max="100" step="1" value="0" /></div>' +
      '          <div class="bp-w-row"><div class="bp-w-label"><span data-i18n="wWind">Wind</span><b data-bp="w-wind-val">—</b></div>' +
      '          <input type="range" class="bp-w-range" data-bp="w-wind" data-wkey="wind" min="0" max="3" step="0.05" value="0" /></div>' +
      '        </div>' +
      '        <div class="bp-w-note" data-bp="w-note"></div>' +
      '      </div>' +
      '    </div>' +

      '    <div class="bp-view bp-view-safari" data-bp="view-safari">' +
      '      <div class="bp-app-header">' +
      '        <button class="bp-back" data-bp="back-home">‹</button>' +
      '        <span data-i18n="appAbout">О BeamiPhone</span>' +
      '        <span style="width:28px"></span>' +
      '      </div>' +
      '      <div class="bp-about-body">' +
      '        <div class="bp-about-hero" style="display:flex !important; flex-direction:column !important; align-items:center !important; justify-content:center !important; position:relative !important; width:100% !important; height:205px !important; min-height:205px !important; max-height:none !important; flex:0 0 205px !important; overflow:visible !important; box-sizing:border-box !important; padding:18px 14px !important; margin:0 !important; gap:6px !important;">' +
'          <div class="bp-about-mark">TEST</div>' +
      '          <div class="bp-about-title">BeamiPhone</div>' +
      '          <div class="bp-about-subtitle" data-i18n="aboutSubtitle">Смартфон-интерфейс для BeamNG.drive</div>' +
      '          <div class="bp-about-meta">' +
      '            <div class="bp-about-meta-item">' +
      '              <span data-i18n="aboutVersion">Версия</span>' +
      '              <b>1.1</b>' +
      '            </div>' +
      '            <div class="bp-about-meta-item">' +
      '              <span data-i18n="aboutKey">Клавиша</span>' +
      '              <b>F3</b>' +
      '            </div>' +
      '          </div>' +
      '        </div>' +
      '        <div class="bp-about-card">' +
      '          <div class="bp-about-section-title" data-i18n="aboutFeatures">Возможности</div>' +
      '          <div class="bp-about-feature">' +
      '            <span class="bp-about-feature-icon bp-about-feature-music">' + ICONS.musicNote + '</span>' +
      '            <div class="bp-about-feature-copy">' +
      '              <b data-i18n="appMusic">Музыка</b>' +
      '              <small data-i18n="aboutMusicText">Локальная музыка, обложки и управление воспроизведением</small>' +
      '            </div>' +
      '          </div>' +
      '          <div class="bp-about-feature">' +
      '            <span class="bp-about-feature-icon bp-about-feature-car">' + ICONS.car + '</span>' +
      '            <div class="bp-about-feature-copy">' +
      '              <b data-i18n="appCar">Моя машина</b>' +
      '              <small data-i18n="aboutCarText">Состояние автомобиля и быстрые команды управления</small>' +
      '            </div>' +
      '          </div>' +
      '          <div class="bp-about-feature">' +
      '            <span class="bp-about-feature-icon bp-about-feature-maps">' + ICONS.compass + '</span>' +
      '            <div class="bp-about-feature-copy">' +
      '              <b data-i18n="appMaps">Карты</b>' +
      '              <small data-i18n="aboutMapsText">Карта мира, скорость, курс и маршрут</small>' +
      '            </div>' +
      '          </div>' +
      '        </div>' +
      '        <div class="bp-about-card">' +
      '          <div class="bp-about-section-title" data-i18n="safariNews">Что нового</div>' +
      '          <div data-bp="safari-news"></div>' +
      '        </div>' +
      '        <div class="bp-about-footer" data-i18n="aboutText">Создано для BeamNG.drive</div>' +
      '      </div>' +
      '    </div>' +

      '    <div class="bp-view bp-view-dragy" data-bp="view-dragy">' +
      '      <div class="bp-app-header"><button class="bp-back" data-bp="back-home">‹</button><span>Dragy</span><button class="bp-dragy-clear" data-bp="dragy-clear" data-i18n="dragyClear">Очистить</button></div>' +
      '      <div class="bp-dragy-body" data-bp="dragy-body">' +
      '        <div class="bp-dragy-speed" data-bp="dragy-speed">0</div>' +
      '        <div class="bp-dragy-speed-unit" data-i18n="unitKmh">km/h</div>' +
      '        <div class="bp-dragy-presets">' +
      '          <button class="bp-dragy-preset" data-bp="dragy-preset" data-preset="z100">0-100</button>' +
      '          <button class="bp-dragy-preset" data-bp="dragy-preset" data-preset="z200">0-200</button>' +
      '          <button class="bp-dragy-preset" data-bp="dragy-preset" data-preset="r80_120">80-120</button>' +
      '          <button class="bp-dragy-preset" data-bp="dragy-preset" data-preset="quarter" data-i18n="quarterMile">1/4 mile</button>' +
      '        </div>' +
      '        <div class="bp-dragy-results" data-bp="dragy-results">' +
      '          <div class="bp-dragy-empty" data-i18n="dragyEmpty">Launch from a standstill</div>' +
      '        </div>' +
      '      </div>' +
      '    </div>' +

      '    <div class="bp-view bp-view-dragy-detail" data-bp="view-dragy-detail">' +
      '      <div class="bp-app-header"><button class="bp-back" data-bp="dragy-detail-back">‹</button><span data-bp="dragy-detail-title">0-100 km/h</span><button class="bp-dragy-clear" data-bp="dragy-detail-reset" data-i18n="dragyReset">Сбросить</button></div>' +
      '      <div class="bp-dragy-detail-body">' +
      '        <div class="bp-dragy-detail-status" data-bp="dragy-detail-status">Come to a stop</div>' +
      '        <div class="bp-dragy-detail-timer" data-bp="dragy-detail-timer">0.0</div>' +
      '        <div class="bp-dragy-detail-unit" data-i18n="dragySeconds">seconds</div>' +
      '      </div>' +
      '    </div>' +

      '    <div class="bp-view bp-view-notes" data-bp="view-notes">' +
      '      <div class="bp-app-header"><button class="bp-back" data-bp="back-home">‹</button><span data-i18n="appNotes">Notes</span><span class="bp-notes-saved" data-bp="notes-saved"></span></div>' +
      '      <textarea class="bp-notes-text" data-bp="notes-text" maxlength="8000" spellcheck="false"></textarea>' +
      '    </div>' +

      '    <div class="bp-view bp-view-stub" data-bp="view-stub">' +
      '      <div class="bp-app-header"><button class="bp-back" data-bp="back-home">‹</button><span data-bp="stub-title">App</span><span style="width:28px"></span></div>' +
      '      <div class="bp-stub-body">' +
      '        <div class="bp-stub-icon">🚧</div>' +
      '        <div class="bp-stub-text" data-i18n="comingSoon">Coming soon</div>' +
      '      </div>' +
      '    </div>' +

      '    <div class="bp-home-indicator-zone" data-bp="home-indicator-zone">' +
      '      <div class="bp-home-indicator" data-bp="home-indicator"></div>' +
      '    </div>' +

      '  </div>' +
      '</div></div>';

    container.appendChild(wrapper);
    root = wrapper;
    fitUi();
    startFitWatcher();
    wireEvents();
    startClock();
  }

  // ------------------------------------------------------------------
  // Fixed internal layout: the phone is always laid out at one design size and
  // the whole thing is scaled to fit the widget, so resizing the app makes it
  // bigger/smaller as one piece instead of re-flowing (and breaking) its content.
  // ------------------------------------------------------------------
  var DESIGN_W = 330, DESIGN_H = 715;
  var fitTimer = null, fitObserver = null;

  function fitUi() {
    if (!root) return;
    var sc = root.querySelector('[data-bp="scaler"]');
    var w = root.clientWidth, h = root.clientHeight;
    if (!sc || !w || !h) return;
    var k = Math.max(0.2, Math.min(w / DESIGN_W, h / DESIGN_H));
    // CSS zoom lays the phone out at its final size (always crisp, also with
    // glass/blur effects); a plain transform is only the fallback. transform:
    // scale() made every backdrop-filter element visibly blurry.
    if (typeof sc.style.zoom === 'string') {
      var z = k.toFixed(4);
      if (sc.style.zoom !== z) sc.style.zoom = z;
      if (sc.style.transform) sc.style.transform = '';
    } else {
      var txt = 'scale(' + k.toFixed(4) + ')';
      if (sc.style.transform !== txt) sc.style.transform = txt;
    }
  }

  function startFitWatcher() {
    stopFitWatcher();
    if (typeof ResizeObserver === 'function') {
      try { fitObserver = new ResizeObserver(fitUi); fitObserver.observe(root); } catch (e) { fitObserver = null; }
    }
    fitTimer = setInterval(fitUi, 600); // safety net for widgets that resize without an observer event
  }

  function stopFitWatcher() {
    if (fitObserver) { try { fitObserver.disconnect(); } catch (e) {} fitObserver = null; }
    if (fitTimer) { clearInterval(fitTimer); fitTimer = null; }
  }

  // visual pixels per layout pixel (includes the fit scale and any scaling of the app itself)
  function uiScale() {
    var sc = root && root.querySelector('[data-bp="scaler"]');
    if (!sc || !sc.offsetWidth) return 1;
    var r = sc.getBoundingClientRect();
    return (r.width / sc.offsetWidth) || 1;
  }

  function buildCalcButtons() {
    var rows = [
      ['AC', '±', '%', '÷'],
      ['7', '8', '9', '×'],
      ['4', '5', '6', '−'],
      ['1', '2', '3', '+'],
      ['0', '.', '=']
    ];
    var html = '';
    rows.forEach(function (row) {
      row.forEach(function (label) {
        var cls = 'bp-calc-btn';
        if (['÷', '×', '−', '+', '='].indexOf(label) !== -1) cls += ' bp-calc-op';
        if (['AC', '±', '%'].indexOf(label) !== -1) cls += ' bp-calc-fn';
        if (label === '0') cls += ' bp-calc-wide';
        html += '<button class="' + cls + '" data-bp="calc-key" data-key="' + label + '">' + label + '</button>';
      });
    });
    return html;
  }

  // ------------------------------------------------------------------
  // Navigation / view switching
  // ------------------------------------------------------------------

  var VIEW_NAMES = ['home', 'music', 'calculator', 'clock', 'settings', 'maps', 'car', 'weather', 'safari', 'dragy', 'dragy-detail', 'notes', 'stub'];

  function showView(name) {
    var previous = currentView;
    currentView = name;
    if (window.BeamiPhone.island) window.BeamiPhone.island.setContext({ locked: isLocked, view: name });
    var phoneNode = el('[data-bp="phone"]');
    if (phoneNode) phoneNode.setAttribute('data-app', name === 'home' ? '0' : '1');
    VIEW_NAMES.forEach(function (v) {
      var node = el('[data-bp="view-' + v + '"]');
      if (node) node.classList.toggle('bp-view-active', v === name);
    });

    if (name === 'maps' || name === 'clock' || name === 'car') {
      if (window.BeamiPhone.bridge) window.BeamiPhone.bridge.startTelemetryPolling();
      if (name === 'clock') startClockAppTicker();
    }
    if (previous === 'maps' || previous === 'clock' || previous === 'car') {
      if (name !== 'maps' && name !== 'clock' && name !== 'car' && window.BeamiPhone.bridge) {
        window.BeamiPhone.bridge.stopTelemetryPolling();
      }
    }
    if (previous === 'clock' && name !== 'clock') stopClockAppTicker();
    if (name === 'music') requestMusicRescan();
    if (name === 'safari') loadSafariNews();
    if (name === 'notes' && !notesLoaded && window.BeamiPhone.bridge) window.BeamiPhone.bridge.requestNotes();
    if (previous === 'notes' && name !== 'notes') flushNotes();
    if (window.BeamiPhone.bridge && window.BeamiPhone.bridge.setStreamWant) window.BeamiPhone.bridge.setStreamWant('pose', name === 'maps');
    if (name === 'maps') startMapLoop();
    if (previous === 'maps' && name !== 'maps') stopMapLoop();
    if (name === 'weather' && window.BeamiPhone.bridge) window.BeamiPhone.bridge.startEnvPolling();
    if (previous === 'weather' && name !== 'weather' && window.BeamiPhone.bridge) window.BeamiPhone.bridge.stopEnvPolling();

    var langSheetEl = el('[data-bp="lang-sheet"]');
    if (langSheetEl && name !== 'settings') langSheetEl.classList.remove('bp-open');

    var indicatorEl = el('[data-bp="home-indicator-zone"]');
    if (indicatorEl) {
      indicatorEl.classList.toggle('bp-indicator-on-home', name === 'home' && !isLocked);
    }
  }

  function showStub(label) {
    var titleEl = el('[data-bp="stub-title"]');
    if (titleEl) titleEl.textContent = label || t('appGeneric');
    showView('stub');
  }

  function unlock() {
    isLocked = false;
    var lockEl = el('[data-bp="lockscreen"]');
    if (lockEl) lockEl.classList.add('bp-lockscreen-hidden');
    var indicatorEl = el('[data-bp="home-indicator-zone"]');
    if (indicatorEl) indicatorEl.classList.remove('bp-indicator-breathing');
    showView('home');
  }

  function relock() {
    isLocked = true;
    var lockEl = el('[data-bp="lockscreen"]');
    if (lockEl) {
      lockEl.classList.remove('bp-lockscreen-hidden');
      lockEl.style.transform = '';
      lockEl.style.opacity = '';
    }
    var indicatorEl = el('[data-bp="home-indicator-zone"]');
    if (indicatorEl) indicatorEl.classList.add('bp-indicator-breathing');
    showView('home');
  }

  // ------------------------------------------------------------------
  // Event wiring
  // ------------------------------------------------------------------

  function wireEvents() {
    try {
      wireEventsInner();
    } catch (err) {
      console.error(
        '[BeamiPhone] FATAL: exception while wiring up event listeners (some buttons may not work). ' +
        'This usually means a data-bp selector in ui.js points at an element that no longer exists ' +
        'in the HTML. Error:', err
      );
    }
  }

    function wireSafari() {
    // The Safari screen is read-only (about card + news), so there is nothing to wire.
  }

  function wireEventsInner() {
    el('[data-bp="open-music"]').addEventListener('click', function () { showView('music'); });
    el('[data-bp="open-music-dock"]').addEventListener('click', function () { showView('music'); });
    el('[data-bp="open-calculator"]').addEventListener('click', function () { showView('calculator'); });
    el('[data-bp="open-clock"]').addEventListener('click', function () { showView('clock'); });
    el('[data-bp="open-settings"]').addEventListener('click', function () { showView('settings'); });
    el('[data-bp="open-maps"]').addEventListener('click', function () { showView('maps'); });
    el('[data-bp="open-car"]').addEventListener('click', function () { showView('car'); });
    el('[data-bp="open-dragy"]').addEventListener('click', function () { showView('dragy'); });
    el('[data-bp="open-weather"]').addEventListener('click', function () { showView('weather'); });
    el('[data-bp="open-safari"]').addEventListener('click', function () { showView('safari'); });
    el('[data-bp="open-notes"]').addEventListener('click', function () { showView('notes'); });
    wireSafari();
    wireNotes();
    wireWeather();
    wireMap();
    el('[data-bp="dragy-clear"]').addEventListener('click', function (ev) {
      ev.stopPropagation();
      dragyClear();
    });
    Array.prototype.forEach.call(root.querySelectorAll('[data-bp="dragy-preset"]'), function (btn) {
      btn.addEventListener('click', function () {
        dragyOpenPreset(btn.getAttribute('data-preset'));
      });
    });
    el('[data-bp="dragy-detail-back"]').addEventListener('click', function () {
      dragyCloseDetail();
    });
    el('[data-bp="dragy-detail-reset"]').addEventListener('click', function () {
      if (dragyArmedPreset) dragyOpenPreset(dragyArmedPreset);
    });

    el('[data-bp="car-engine-start"]').addEventListener('click', function () {
      if (window.BeamiPhone.bridge) window.BeamiPhone.bridge.vehicleAction('engine_start');
    });
    el('[data-bp="car-engine-stop"]').addEventListener('click', function () {
      if (window.BeamiPhone.bridge) window.BeamiPhone.bridge.vehicleAction('engine_stop');
    });
    el('[data-bp="car-lights"]').addEventListener('click', function () {
      if (window.BeamiPhone.bridge) window.BeamiPhone.bridge.vehicleAction('lights');
    });
    el('[data-bp="car-hazard"]').addEventListener('click', function () {
      if (window.BeamiPhone.bridge) window.BeamiPhone.bridge.vehicleAction('hazard');
    });
    el('[data-bp="car-trunk"]').addEventListener('click', function () {
      if (window.BeamiPhone.bridge) window.BeamiPhone.bridge.vehicleAction('trunk');
    });

    Array.prototype.forEach.call(root.querySelectorAll('[data-bp="open-stub"]'), function (btn) {
      btn.addEventListener('click', function () {
        var i18nKey = btn.getAttribute('data-i18n-label');
        showStub(i18nKey ? t(i18nKey) : btn.getAttribute('data-label'));
      });
    });

    Array.prototype.forEach.call(root.querySelectorAll('[data-bp="back-home"]'), function (btn) {
      btn.addEventListener('click', function () { showView('home'); });
    });

    el('[data-bp="playpause"]').addEventListener('click', function () {
      window.BeamiPhone.audioPlayer.togglePlayPause();
    });
    wireWidget('mini');
    wireWidget('lock');
    el('[data-bp="mini-player"]').addEventListener('click', function (ev) {
      // Don't hijack clicks on the widget's own buttons -- only taps on the
      // card background open the full Music app.
      if (ev.target.closest('.bp-mini-ctrl, .bp-mini-progress-hit')) return;
      if (Date.now() - (window.BeamiPhone.scrubEndedAt || 0) < 400) return; // drag that ended outside the bar
      showView('music');
    });

    el('[data-bp="open-folder"]').addEventListener('click', function (ev) {
      ev.stopPropagation();
      // always put the path on the clipboard too, so the folder is reachable even
      // if this system's "open folder" call does nothing
      var shown = el('[data-bp="music-path"]');
      if (shown && shown.textContent) copyText(shown.textContent);
      showMusicToast(t('musicFolderHint'));
      if (window.BeamiPhone.bridge) window.BeamiPhone.bridge.openMusicFolder();
    });

    el('[data-bp="refresh-top"]').addEventListener('click', function (ev) {
      ev.stopPropagation();
      if (window.BeamiPhone.bridge && window.BeamiPhone.bridge.requestMusicScan) window.BeamiPhone.bridge.requestMusicScan();
    });

    el('[data-bp="refresh"]').addEventListener('click', function () {
      if (window.BeamiPhone.bridge && window.BeamiPhone.bridge.requestMusicScan) {
        window.BeamiPhone.bridge.requestMusicScan();
      }
    });

    el('[data-bp="prev"]').addEventListener('click', function () { window.BeamiPhone.audioPlayer.previous(); });
    el('[data-bp="shuffle"]').addEventListener('click', function () {
      var on = window.BeamiPhone.audioPlayer.toggleShuffle();
      if (window.BeamiPhone.bridge) window.BeamiPhone.bridge.savePref('shuffle', on);
    });
    el('[data-bp="repeat"]').addEventListener('click', function () {
      var mode = window.BeamiPhone.audioPlayer.cycleRepeat();
      if (window.BeamiPhone.bridge) window.BeamiPhone.bridge.savePref('repeatMode', mode);
    });
    el('[data-bp="next"]').addEventListener('click', function () { window.BeamiPhone.audioPlayer.next(); });

    el('[data-bp="volume"]').addEventListener('change', function (ev) {
      if (window.BeamiPhone.bridge) window.BeamiPhone.bridge.savePref('volume', Math.round(ev.target.value));
    });
    el('[data-bp="volume"]').addEventListener('input', function (ev) {
      window.BeamiPhone.audioPlayer.setVolume(ev.target.value / 100);
    });

    var progressTrack = el('[data-bp="progress"] .bp-progress-track');
    function seekFromEvent(ev) {
      var rect = progressTrack.getBoundingClientRect();
      var fraction = (ev.clientX - rect.left) / rect.width;
      window.BeamiPhone.audioPlayer.seekToFraction(fraction);
    }
    progressTrack.addEventListener('mousedown', function (ev) {
      isSeeking = true;
      seekFromEvent(ev);
    });

    wireCalculator();
    wireClockApp();
    wireSettings();

    // ---- Real, working swipe-UP-only gesture -----------------------
    // Locked: swipe up unlocks into the home screen.
    // Swipe-up-to-unlock on the lock screen, swipe-up-to-go-home from
    // within any app. Not shown/active on the home screen itself.
    var indicatorZone = el('[data-bp="home-indicator-zone"]');

    function currentDragTarget() {
      if (isLocked) return el('[data-bp="lockscreen"]');
      if (currentView !== 'home') return el('[data-bp="view-' + currentView + '"]');
      return null;
    }

    var releasing = false;

    function homeEl() { return el('[data-bp="view-home"]'); }

    function endAppDrag(target, home) {
      target.classList.remove('bp-dragging', 'bp-view-releasing');
      target.style.transform = '';
      target.style.opacity = '';
      if (home) {
        home.classList.remove('bp-peek-home');
        home.style.transform = '';
        home.style.transition = '';
      }
      releasing = false;
    }

    indicatorZone.addEventListener('mousedown', function (ev) {
      if (releasing) return;
      dragTarget = currentDragTarget();
      if (!dragTarget) return; // not locked and already home: nothing to drag
      isDragging = true;
      dragStartY = ev.clientY;
      dragLastY = ev.clientY;
      dragTarget.classList.add('bp-dragging');
      if (!isLocked) {
        // Reveal the home screen underneath the app, like iOS does.
        var h = homeEl();
        if (h) { h.classList.add('bp-peek-home'); h.style.transition = 'none'; h.style.transform = 'scale(0.94)'; }
      }
      indicatorZone.classList.add('bp-indicator-paused');
      ev.preventDefault();
    });

    // The drag is applied once per animation frame (not once per mouse event)
    // and only touches transform/opacity, which the GPU animates without
    // re-painting the page. Corner radius is static (set in CSS), never animated.
    var dragLastY = 0;
    var dragRaf = 0;
    function applyDrag() {
      dragRaf = 0;
      if (!isDragging || !dragTarget) return;
      var delta = Math.max(0, dragStartY - dragLastY) / uiScale(); // only allow dragging UP
      if (isLocked) {
        var clamped = Math.min(delta, 380);
        dragTarget.style.transform = 'translate3d(0,-' + clamped + 'px,0)';
        dragTarget.style.opacity = String(Math.max(0.15, 1 - clamped / 300));
      } else {
        var d = Math.min(delta, 420);
        var p = Math.min(d / 300, 1);
        dragTarget.style.transform = 'translate3d(0,' + (-d * 0.55) + 'px,0) scale(' + (1 - 0.3 * p) + ')';
        var h2 = homeEl();
        if (h2) h2.style.transform = 'scale(' + (0.94 + 0.06 * p) + ')';
      }
    }

    document.addEventListener('mousemove', function (ev) {
      if (isSeeking) seekFromEvent(ev);
      if (isDragging && dragTarget) {
        dragLastY = ev.clientY;
        if (!dragRaf) dragRaf = requestAnimationFrame(applyDrag);
      }
    });

    document.addEventListener('mouseup', function (ev) {
      isSeeking = false;
      indicatorZone.classList.remove('bp-indicator-paused');
      if (!isDragging) return;
      isDragging = false;
      if (dragRaf) { cancelAnimationFrame(dragRaf); dragRaf = 0; }
      var target = dragTarget;
      dragTarget = null;
      var delta = target ? Math.max(0, dragStartY - ev.clientY) / uiScale() : 0;
      if (!target) return;

      if (isLocked) {
        target.classList.remove('bp-dragging');
        target.style.transform = '';
        target.style.opacity = '';
        if (delta > 70) unlock();
        return;
      }

      // App -> home: animate out instead of an instant cut.
      var home = homeEl();
      releasing = true;
      target.classList.remove('bp-dragging');
      target.classList.add('bp-view-releasing');
      if (home) home.style.transition = 'transform 0.26s cubic-bezier(0.2, 0.8, 0.2, 1)';
      if (delta > 70) {
        target.style.transform = 'translate3d(0,-30%,0) scale(0.2)';
        target.style.opacity = '0';
        if (home) home.style.transform = 'scale(1)';
        setTimeout(function () {
          showView('home');
          endAppDrag(target, home);
        }, 270);
      } else {
        target.style.transform = '';
        if (home) home.style.transform = 'scale(0.94)';
        setTimeout(function () { endAppDrag(target, home); }, 270);
      }
    });

    // Never let clicks/hover on the phone leak through to the game underneath.
    root.addEventListener('mousedown', function (ev) {
      ev.stopPropagation();
      // Diagnostic for click-offset reports: what element is really under the pointer?
      try {
        var hit = document.elementFromPoint(ev.clientX, ev.clientY);
        console.log('[BeamiPhone] mousedown target=' + (ev.target && (ev.target.getAttribute('data-bp') || ev.target.className)) +
          ' | elementFromPoint=' + (hit && (hit.getAttribute('data-bp') || hit.className)) +
          ' @' + Math.round(ev.clientX) + ',' + Math.round(ev.clientY));
      } catch (e) {}
    });
    root.addEventListener('wheel', function (ev) { ev.stopPropagation(); });
  }

  var lastMusicScanAt = 0;
  function requestMusicRescan() {
    var now = Date.now();
    if (now - lastMusicScanAt < 1500) return;
    lastMusicScanAt = now;
    if (window.BeamiPhone.bridge && window.BeamiPhone.bridge.requestMusicScan) window.BeamiPhone.bridge.requestMusicScan();
  }
  if (typeof window.addEventListener === 'function' && !window.__bpFocusWired) {
    window.__bpFocusWired = true;
    window.addEventListener('focus', function () {
      if (currentView === 'music') requestMusicRescan();
    });
  }

  function updateLockDate() {
    var lockDateEl = el('[data-bp="lock-date"]');
    if (lockDateEl) {
      lockDateEl.textContent = new Date().toLocaleDateString(dateLocale(), { weekday: 'long', day: 'numeric', month: 'long' });
    }
  }

  function startClock() {
    function tick() {
      var now = new Date();
      var h = pad2(now.getHours());
      var m = pad2(now.getMinutes());
      var clockEl = el('[data-bp="clock"]');
      if (clockEl) clockEl.textContent = h + ':' + m;
      var lockTimeEl = el('[data-bp="lock-time"]');
      if (lockTimeEl) lockTimeEl.textContent = h + ':' + m;
      updateLockDate();
    }
    tick();
    clockTimer = setInterval(tick, 15000);
  }

  // ------------------------------------------------------------------
  // Music (track list / now playing) -- unchanged logic, restyled via CSS
  // ------------------------------------------------------------------

  // Called by the inline onclick of every track row (the delegated listener below is the backup).
  window.__bpPlayTrack = function (idx) {
    window.__bpLastRowPlay = Date.now();
    console.log('[BeamiPhone] track row clicked, index=' + idx);
    window.BeamiPhone.audioPlayer.play(idx);
  };

  function renderTrackList(tracks, status) {
    var pathCaption = el('[data-bp="music-path"]');
    if (pathCaption && status && status.displayPath) pathCaption.textContent = status.displayPath;
    var list = el('[data-bp="track-list"]');
    var empty = el('[data-bp="empty-state"]');
    var emptyTitle = el('[data-bp="empty-title"]');
    var emptyText = el('[data-bp="empty-text"]');
    var emptyPath = el('[data-bp="empty-path"]');
    if (!list) return;

    if (!tracks || tracks.length === 0) {
      list.innerHTML = '';
      empty.style.display = 'flex';

      if (status && status.error === 'no_response') {
        emptyTitle.textContent = t('musicNoReply');
        emptyText.textContent = t('musicNoReplyText');
        if (emptyPath) emptyPath.textContent = '';
      } else if (status && status.error === 'scan_failed') {
        emptyTitle.textContent = t('musicReadFail');
        emptyText.textContent = t('musicReadFailText');
        if (emptyPath) emptyPath.textContent = (status.displayPath || status.musicDir || '') || 'BeamNG.drive/beamiphone/music/';
      } else {
        emptyTitle.textContent = t('musicEmptyTitle');
        emptyText.textContent = t('musicEmptyText');
        if (emptyPath) {
          emptyPath.textContent = (status && status.displayPath) || 'BeamNG.drive/beamiphone/music/';
        }
      }
      return;
    }
    empty.style.display = 'none';

    list.innerHTML = tracks.map(function (t, i) {
      return '' +
        '<div class="bp-track-row" data-bp-index="' + i + '" role="button" tabindex="0" onclick="window.__bpPlayTrack(' + i + ')">' +
        '  <img class="bp-track-cover" src="' + (t.coverUrl || DEFAULT_COVER_SVG) + '" ' +
        '       onerror="this.onerror=null;this.src=\'' + DEFAULT_COVER_SVG + '\';" />' +
        '  <span class="bp-track-meta">' +
        '    <span class="bp-track-title">' + escapeHtml(t.title) + '</span>' +
        '    <span class="bp-track-artist">' + escapeHtml(t.artist) + '</span>' +
        '  </span>' +
        '</div>';
    }).join('');

    console.log('[BeamiPhone] renderTrackList: rendered ' + tracks.length + ' row(s)');
    // Kept as a backup in case inline handlers ever get stripped/ignored --
    // harmless to have both.
    wireTrackListDelegation();
  }

  var trackListDelegationWired = false;
  function walkUpToRow(node) {
    while (node && node !== document.body) {
      if (node.classList && node.classList.contains('bp-track-row')) return node;
      node = node.parentNode;
    }
    return null;
  }

  function wireTrackListDelegation() {
    if (trackListDelegationWired) return;
    trackListDelegationWired = true;
    var list = el('[data-bp="track-list"]');
    if (!list) return;
    function playRow(row) {
      if (Date.now() - (window.__bpLastRowPlay || 0) < 400) return; // inline handler already did it
      var idx = parseInt(row.getAttribute('data-bp-index'), 10);
      console.log('[BeamiPhone] track row clicked (delegated), index=' + idx);
      if (!isNaN(idx)) window.BeamiPhone.audioPlayer.play(idx);
    }
    list.addEventListener('click', function (ev) {
      var row = walkUpToRow(ev.target);
      if (row) playRow(row);
    });
    list.addEventListener('keydown', function (ev) {
      if (ev.key !== 'Enter' && ev.key !== ' ') return;
      var row = walkUpToRow(ev.target);
      if (row) { ev.preventDefault(); playRow(row); }
    });
  }

  function escapeHtml(str) {
    if (!str) return '';
    return str.replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  var lastRenderedTrackListSignature = null;

  function onLibraryUpdated(status) {
    lastLibraryStatus = status || {};
    var state = window.BeamiPhone.audioPlayer.getState();
    var signature = state.playlist.map(function (t) { return t.file; }).join('|');
    var forceRerender = !!(status && status.error);
    if (forceRerender || signature !== lastRenderedTrackListSignature) {
      lastRenderedTrackListSignature = signature;
      renderTrackList(state.playlist, lastLibraryStatus);
    }
  }

  function renderPlayerState(state) {
    if (!root) return;
    if (window.BeamiPhone.island) window.BeamiPhone.island.update(state);

    var hasTrack = !!state.currentTrack;
    var playIcon = state.isPlaying ? '❚❚' : '▶';
    var shufBtn = el('[data-bp="shuffle"]');
    if (shufBtn) shufBtn.classList.toggle('bp-ctrl-on', !!state.shuffle);
    var repBtn = el('[data-bp="repeat"]');
    if (repBtn) {
      repBtn.classList.toggle('bp-ctrl-on', state.repeatMode !== 'off');
      repBtn.textContent = state.repeatMode === 'one' ? '🔂' : '🔁';
    }

    renderWidget('mini', state);
    renderWidget('lock', state);
    var homeV = el('[data-bp="view-home"]');
    if (homeV) homeV.classList.toggle('bp-has-music', hasTrack);
    var lockV = el('[data-bp="lockscreen"]');
    if (lockV) lockV.classList.toggle('bp-has-music', hasTrack);

    var now = el('[data-bp="now-playing"]');
    if (now) {
      now.style.display = hasTrack ? 'flex' : 'none';
      if (hasTrack) {
        el('[data-bp="np-cover"]').src = state.currentTrack.coverUrl || DEFAULT_COVER_SVG;
        el('[data-bp="np-title"]').textContent = state.currentTrack.title;
        el('[data-bp="np-artist"]').textContent = state.currentTrack.artist;
        el('[data-bp="playpause"]').textContent = playIcon;

        var fraction = state.duration > 0 ? (state.currentTime / state.duration) : 0;
        el('[data-bp="progress-fill"]').style.width = (fraction * 100) + '%';
        el('[data-bp="progress-handle"]').style.left = (fraction * 100) + '%';
        el('[data-bp="time-current"]').textContent = formatTime(state.currentTime);
        el('[data-bp="time-duration"]').textContent = formatTime(state.duration);
      }
    }

    var volumeInput = el('[data-bp="volume"]');
    if (volumeInput && document.activeElement !== volumeInput) {
      volumeInput.value = Math.round(state.volume * 100);
    }
  }

  // ------------------------------------------------------------------
  // Now-playing widget (home screen + lock screen), iOS lock-screen style
  // ------------------------------------------------------------------
  var W_ICON_PLAY = '<svg viewBox="0 0 24 24"><path fill="currentColor" d="M8 5.2v13.6a1 1 0 0 0 1.5.86l11-6.8a1 1 0 0 0 0-1.72l-11-6.8A1 1 0 0 0 8 5.2z"/></svg>';
  var W_ICON_PAUSE = '<svg viewBox="0 0 24 24"><rect x="5.5" y="4.5" width="4.6" height="15" rx="1.4" fill="currentColor"/><rect x="13.9" y="4.5" width="4.6" height="15" rx="1.4" fill="currentColor"/></svg>';
  var W_ICON_PREV = '<svg viewBox="0 0 24 24"><path fill="currentColor" d="M11.2 6.6v10.8a.8.8 0 0 1-1.25.66L2.9 12.66a.8.8 0 0 1 0-1.32l7.05-5.4a.8.8 0 0 1 1.25.66zM21 6.6v10.8a.8.8 0 0 1-1.25.66l-7.05-5.4a.8.8 0 0 1 0-1.32l7.05-5.4A.8.8 0 0 1 21 6.6z"/></svg>';
  var W_ICON_NEXT = '<svg viewBox="0 0 24 24"><path fill="currentColor" d="M12.8 6.6v10.8a.8.8 0 0 0 1.25.66l7.05-5.4a.8.8 0 0 0 0-1.32l-7.05-5.4a.8.8 0 0 0-1.25.66zM3 6.6v10.8a.8.8 0 0 0 1.25.66l7.05-5.4a.8.8 0 0 0 0-1.32l-7.05-5.4A.8.8 0 0 0 3 6.6z"/></svg>';

  function widgetMarkup(prefix) {
    return '' +
      '<div class="bp-mini-top">' +
      '  <img class="bp-mini-cover" data-bp="' + prefix + '-cover" src="" alt="" />' +
      '  <div class="bp-mini-meta">' +
      '    <div class="bp-mini-title" data-bp="' + prefix + '-title">—</div>' +
      '    <div class="bp-mini-artist" data-bp="' + prefix + '-artist">—</div>' +
      '  </div>' +
      '  <div class="bp-eq"><i></i><i></i><i></i><i></i></div>' +
      '</div>' +
      '<div class="bp-mini-progress-hit"><div class="bp-mini-progress-track"><div class="bp-mini-progress-fill" data-bp="' + prefix + '-progress-fill"></div></div></div>' +
      '<div class="bp-mini-times"><span data-bp="' + prefix + '-time-current">0:00</span><span data-bp="' + prefix + '-time-remaining">-0:00</span></div>' +
      '<div class="bp-mini-controls">' +
      '  <button class="bp-mini-ctrl" data-bp="' + prefix + '-prev">' + W_ICON_PREV + '</button>' +
      '  <button class="bp-mini-ctrl bp-mini-ctrl-play" data-bp="' + prefix + '-toggle">' + W_ICON_PLAY + '</button>' +
      '  <button class="bp-mini-ctrl" data-bp="' + prefix + '-next">' + W_ICON_NEXT + '</button>' +
      '</div>';
  }

  function renderWidget(prefix, state) {
    var box = el('[data-bp="' + (prefix === 'mini' ? 'mini-player' : 'lock-music') + '"]');
    if (!box) return;
    var hasTrack = !!state.currentTrack;
    box.style.display = hasTrack ? 'flex' : 'none';
    box.classList.toggle('bp-playing', hasTrack && !!state.isPlaying);
    if (!hasTrack) return;
    var cover = el('[data-bp="' + prefix + '-cover"]');
    var coverUrl = state.currentTrack.coverUrl || DEFAULT_COVER_SVG;
    if (cover && cover.getAttribute('data-src') !== coverUrl) { cover.src = coverUrl; cover.setAttribute('data-src', coverUrl); }
    el('[data-bp="' + prefix + '-title"]').textContent = state.currentTrack.title;
    el('[data-bp="' + prefix + '-artist"]').textContent = state.currentTrack.artist;
    var btn = el('[data-bp="' + prefix + '-toggle"]');
    var playingNow = state.isPlaying ? '1' : '0';
    if (btn && btn.getAttribute('data-playing') !== playingNow) {
      btn.innerHTML = state.isPlaying ? W_ICON_PAUSE : W_ICON_PLAY;
      btn.setAttribute('data-playing', playingNow);
    }
    var fraction = state.duration > 0 ? (state.currentTime / state.duration) : 0;
    var fill = el('[data-bp="' + prefix + '-progress-fill"]');
    if (fill) fill.style.transform = 'scaleX(' + Math.min(1, Math.max(0, fraction)) + ')';
    var cur = el('[data-bp="' + prefix + '-time-current"]');
    if (cur) cur.textContent = formatTime(state.currentTime);
    var rem = el('[data-bp="' + prefix + '-time-remaining"]');
    if (rem) rem.textContent = '-' + formatTime(Math.max(0, state.duration - state.currentTime));
  }

  function wireWidget(prefix) {
    var A = function () { return window.BeamiPhone.audioPlayer; };
    el('[data-bp="' + prefix + '-prev"]').addEventListener('click', function (ev) { ev.stopPropagation(); A().previous(); });
    el('[data-bp="' + prefix + '-toggle"]').addEventListener('click', function (ev) { ev.stopPropagation(); A().togglePlayPause(); });
    el('[data-bp="' + prefix + '-next"]').addEventListener('click', function (ev) { ev.stopPropagation(); A().next(); });

    // scrub: click or drag on the progress bar
    var fill = el('[data-bp="' + prefix + '-progress-fill"]');
    var hit = fill && fill.parentNode && fill.parentNode.parentNode;
    if (hit) {
      hit.addEventListener('mousedown', function (ev) {
        if (ev.button !== 0) return;
        ev.preventDefault();
        ev.stopPropagation();
        var track = fill.parentNode;
        hit.classList.add('bp-scrubbing');
        function seek(e) {
          var r = track.getBoundingClientRect();
          if (!r.width) return;
          A().seekToFraction(Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)));
        }
        function up() {
          window.BeamiPhone.scrubEndedAt = Date.now();
          hit.classList.remove('bp-scrubbing');
          document.removeEventListener('mousemove', seek);
          document.removeEventListener('mouseup', up);
        }
        seek(ev);
        document.addEventListener('mousemove', seek);
        document.addEventListener('mouseup', up);
      });
      hit.addEventListener('click', function (ev) { ev.stopPropagation(); });
    }
  }

  // ------------------------------------------------------------------
  // Calculator -- real, classic single-pending-operation logic
  // ------------------------------------------------------------------

  var calc = { display: '0', pending: null, operand: null, justEvaluated: false, awaitingOperand: false };

  function calcRender() {
    var d = el('[data-bp="calc-display"]');
    if (d) {
      d.textContent = calc.display;
      var n = String(calc.display).length;
      d.style.fontSize = (n > 11 ? 34 : n > 8 ? 44 : n > 6 ? 56 : 68) + 'px';
    }
  }

  function calcApplyOp(a, op, b) {
    switch (op) {
      case '+': return a + b;
      case '−': return a - b;
      case '×': return a * b;
      case '÷': return b === 0 ? NaN : a / b;
      default: return b;
    }
  }

  function calcFormat(n) {
    if (isNaN(n)) return t('calcError');
    if (!isFinite(n)) return t('calcError');
    var s = String(Math.round(n * 1e10) / 1e10);
    if (s.length > 12) s = n.toPrecision(10).replace(/\.?0+$/, '');
    return s;
  }

  function calcPressKey(key) {
    if (key === 'AC') {
      calc = { display: '0', pending: null, operand: null, justEvaluated: false, awaitingOperand: false };
    } else if (key === '±') {
      calc.display = String(parseFloat(calc.display) * -1);
    } else if (key === '%') {
      calc.display = calcFormat(parseFloat(calc.display) / 100);
    } else if (key === '.') {
      if (calc.awaitingOperand || calc.justEvaluated) {
        calc.display = '0.'; calc.justEvaluated = false; calc.awaitingOperand = false;
      } else if (calc.display.indexOf('.') === -1) {
        calc.display += '.';
      }
    } else if (/[0-9]/.test(key)) {
      if (calc.display === '0' || calc.justEvaluated || calc.awaitingOperand) {
        calc.display = key;
        calc.justEvaluated = false;
        calc.awaitingOperand = false;
      } else {
        calc.display += key;
      }
    } else if (['+', '−', '×', '÷'].indexOf(key) !== -1) {
      if (calc.operand !== null && calc.pending && !calc.awaitingOperand) {
        calc.operand = calcApplyOp(calc.operand, calc.pending, parseFloat(calc.display));
        calc.display = calcFormat(calc.operand);
      } else if (calc.operand === null) {
        calc.operand = parseFloat(calc.display);
      }
      calc.pending = key;
      calc.justEvaluated = false;
      calc.awaitingOperand = true;
    } else if (key === '=') {
      if (calc.pending && calc.operand !== null) {
        var result = calcApplyOp(calc.operand, calc.pending, parseFloat(calc.display));
        calc.display = calcFormat(result);
        calc.operand = result;
        calc.pending = null;
        calc.justEvaluated = true;
        calc.awaitingOperand = false;
      }
    }
    calcRender();
  }

  function wireCalculator() {
    Array.prototype.forEach.call(root.querySelectorAll('[data-bp="calc-key"]'), function (btn) {
      btn.addEventListener('click', function () { calcPressKey(btn.getAttribute('data-key')); });
    });
  }

  // ------------------------------------------------------------------
  // Clock app: real-life time + in-game time-of-day, plus a real
  // stopwatch and countdown timer (timestamp-based, so accurate even
  // when the panel isn't visible / updating).
  // ------------------------------------------------------------------

  var clockAppTickHandle = null;
  var stopwatch = { running: false, startedAt: 0, accumulatedMs: 0 };
  var timer = { running: false, endsAt: 0, remainingMs: 0, totalMs: 0 };

  function startClockAppTicker() {
    if (clockAppTickHandle) return;
    clockAppTick();
    clockAppTickHandle = setInterval(clockAppTick, 100);
  }
  function stopClockAppTicker() {
    if (clockAppTickHandle) { clearInterval(clockAppTickHandle); clockAppTickHandle = null; }
  }

  function clockAppTick() {
    var now = new Date();
    var realTimeEl = el('[data-bp="real-time"]');
    if (realTimeEl) realTimeEl.textContent = pad2(now.getHours()) + ':' + pad2(now.getMinutes()) + ':' + pad2(now.getSeconds());
    var realDateEl = el('[data-bp="real-date"]');
    if (realDateEl) realDateEl.textContent = now.toLocaleDateString(dateLocale(), { day: 'numeric', month: 'long', year: 'numeric' });

    if (stopwatch.running) {
      var elapsedMs = stopwatch.accumulatedMs + (Date.now() - stopwatch.startedAt);
      renderStopwatch(elapsedMs);
    }
    if (timer.running) {
      var remaining = Math.max(0, timer.endsAt - Date.now());
      renderTimer(remaining);
      if (remaining <= 0) { timer.running = false; setTimerButtonLabel(); }
    }
  }

  function renderStopwatch(ms) {
    var el2 = el('[data-bp="stopwatch-value"]');
    if (!el2) return;
    var totalTenths = Math.floor(ms / 100);
    var tenths = totalTenths % 10;
    var totalSeconds = Math.floor(ms / 1000);
    var s = totalSeconds % 60;
    var m = Math.floor(totalSeconds / 60);
    el2.textContent = pad2(m) + ':' + pad2(s) + '.' + tenths;
  }

  function renderTimer(ms) {
    var el2 = el('[data-bp="timer-value"]');
    if (!el2) return;
    var totalSeconds = Math.ceil(ms / 1000);
    var s = totalSeconds % 60;
    var m = Math.floor(totalSeconds / 60);
    el2.textContent = pad2(m) + ':' + pad2(s);
  }

  function setTimerButtonLabel() {
    var btn = el('[data-bp="timer-toggle"]');
    if (btn) btn.textContent = timer.running ? t('btnPause') : t('btnStart');
  }

  function wireClockApp() {
    Array.prototype.forEach.call(root.querySelectorAll('[data-bp="clock-tab"]'), function (tab) {
      tab.addEventListener('click', function () {
        Array.prototype.forEach.call(root.querySelectorAll('[data-bp="clock-tab"]'), function (t) {
          t.classList.toggle('bp-clock-tab-active', t === tab);
        });
        var target = tab.getAttribute('data-tab');
        ['world', 'stopwatch', 'timer'].forEach(function (name) {
          var panel = el('[data-bp="clock-panel-' + name + '"]');
          if (panel) panel.classList.toggle('bp-clock-panel-active', name === target);
        });
      });
    });

    el('[data-bp="stopwatch-toggle"]').addEventListener('click', function (ev) {
      if (stopwatch.running) {
        stopwatch.accumulatedMs += Date.now() - stopwatch.startedAt;
        stopwatch.running = false;
        ev.target.textContent = t('btnStart');
      } else {
        stopwatch.startedAt = Date.now();
        stopwatch.running = true;
        ev.target.textContent = t('btnPause');
      }
    });
    el('[data-bp="stopwatch-reset"]').addEventListener('click', function () {
      stopwatch = { running: false, startedAt: 0, accumulatedMs: 0 };
      renderStopwatch(0);
      el('[data-bp="stopwatch-toggle"]').textContent = t('btnStart');
    });

    el('[data-bp="timer-add1"]').addEventListener('click', function () { timerAddMinutes(1); });
    el('[data-bp="timer-add5"]').addEventListener('click', function () { timerAddMinutes(5); });
    el('[data-bp="timer-toggle"]').addEventListener('click', function () {
      if (timer.totalMs <= 0) return;
      if (timer.running) {
        timer.remainingMs = Math.max(0, timer.endsAt - Date.now());
        timer.running = false;
      } else {
        timer.endsAt = Date.now() + (timer.remainingMs || timer.totalMs);
        timer.running = true;
      }
      setTimerButtonLabel();
    });
    el('[data-bp="timer-reset"]').addEventListener('click', function () {
      timer = { running: false, endsAt: 0, remainingMs: 0, totalMs: 0 };
      renderTimer(0);
      setTimerButtonLabel();
    });
  }

  function timerAddMinutes(mins) {
    timer.totalMs += mins * 60000;
    timer.remainingMs = timer.running ? Math.max(0, timer.endsAt - Date.now()) + mins * 60000 : timer.totalMs;
    if (timer.running) timer.endsAt += mins * 60000;
    renderTimer(timer.remainingMs);
  }

  // ------------------------------------------------------------------
  // Settings: wallpaper picker, theme toggle, about
  // ------------------------------------------------------------------

  function applyWallpaper(key) {
    var phoneEl = el('[data-bp="phone"]');
    if (phoneEl) phoneEl.setAttribute('data-wallpaper', key);
    applyTone();
    if (root) {
      Array.prototype.forEach.call(root.querySelectorAll('[data-bp="wallpaper"]'), function (b) {
        b.classList.toggle('bp-swatch-active', b.getAttribute('data-wp') === key);
      });
    }
  }

  var smartNotifs = true;

  function onPrefs(data) {
    if (data && data.wallpaper) applyWallpaper(data.wallpaper);
    if (data && typeof data.smartNotifs === 'boolean') {
      smartNotifs = data.smartNotifs;
      var smartBtn = el('[data-bp="smart-toggle"]');
      if (smartBtn) smartBtn.setAttribute('data-on', smartNotifs ? '1' : '0');
    }
    if (smartNotifs && window.BeamiPhone.bridge) window.BeamiPhone.bridge.startVehWatch(); // alerts also work while the phone is closed
    if (data && typeof data.volume === 'number') window.BeamiPhone.audioPlayer.setVolume(Math.min(1, Math.max(0, data.volume / 100)));
    if (data && typeof data.shuffle === 'boolean') window.BeamiPhone.audioPlayer.setShuffle(data.shuffle);
    if (data && data.repeatMode) window.BeamiPhone.audioPlayer.setRepeat(data.repeatMode);
    if (data && typeof data.spatial === 'boolean') {
      var sbtn = el('[data-bp="spatial-toggle"]');
      if (sbtn) sbtn.setAttribute('data-on', data.spatial ? '1' : '0');
      if (window.BeamiPhone.spatial) window.BeamiPhone.spatial.setEnabled(data.spatial);
    }
    if (data && data.mapStyle && NAVI_STYLES[data.mapStyle]) naviStyle = data.mapStyle;
    // Default is always English; only a language the user picked themselves
    // (saved in prefs) overrides it.
    if (data && data.language) {
      setLanguage(data.language, false);
    }
  }

  // ------------------------------------------------------------------
  // Notes: a single text note, saved on the Lua side (settings/beamiphone/notes.json)
  // ------------------------------------------------------------------
  var notesLoaded = false;
  var notesTimer = null;
  var notesDirty = false;

  function flushNotes() {
    clearTimeout(notesTimer);
    var ta = el('[data-bp="notes-text"]');
    if (!ta || !notesDirty || !window.BeamiPhone.bridge) return;
    notesDirty = false;
    window.BeamiPhone.bridge.saveNotes(ta.value);
    var st = el('[data-bp="notes-saved"]');
    if (st) st.textContent = '✓';
  }

  function onNotes(d) {
    notesLoaded = true;
    var ta = el('[data-bp="notes-text"]');
    if (ta && !notesDirty && d && typeof d.text === 'string') ta.value = d.text;
  }

  function wireNotes() {
    var ta = el('[data-bp="notes-text"]');
    if (!ta) return;
    var br = window.BeamiPhone.bridge;
    ta.placeholder = t('notesPlaceholder');
    ta.addEventListener('focus', function () { if (br && br.setTyping) br.setTyping(true); });
    ta.addEventListener('blur', function () { if (br && br.setTyping) br.setTyping(false); flushNotes(); });
    ta.addEventListener('input', function () {
      notesDirty = true;
      var st = el('[data-bp="notes-saved"]');
      if (st) st.textContent = '…';
      clearTimeout(notesTimer);
      notesTimer = setTimeout(flushNotes, 700);
    });
  }

  function wireSettings() {
    Array.prototype.forEach.call(root.querySelectorAll('[data-bp="wallpaper"]'), function (btn) {
      btn.addEventListener('click', function () {
        var wp = btn.getAttribute('data-wp');
        applyWallpaper(wp);
        if (window.BeamiPhone.bridge) window.BeamiPhone.bridge.saveWallpaper(wp);
      });
    });

    el('[data-bp="spatial-toggle"]').addEventListener('click', function (ev) {
      var nowOn = ev.currentTarget.getAttribute('data-on') !== '1';
      ev.currentTarget.setAttribute('data-on', nowOn ? '1' : '0');
      if (window.BeamiPhone.spatial) window.BeamiPhone.spatial.setEnabled(nowOn);
      if (window.BeamiPhone.bridge) window.BeamiPhone.bridge.savePref('spatial', nowOn);
    });

    el('[data-bp="smart-toggle"]').addEventListener('click', function (ev) {
      smartNotifs = ev.currentTarget.getAttribute('data-on') !== '1';
      ev.currentTarget.setAttribute('data-on', smartNotifs ? '1' : '0');
      if (window.BeamiPhone.bridge) {
        window.BeamiPhone.bridge.savePref('smartNotifs', smartNotifs);
        if (smartNotifs) window.BeamiPhone.bridge.startVehWatch();
        else if (!isOpen) window.BeamiPhone.bridge.stopVehWatch();
      }
    });

    el('[data-bp="theme-toggle"]').addEventListener('click', function (ev) {
      var phoneEl = el('[data-bp="phone"]');
      var isOn = ev.currentTarget.getAttribute('data-on') === '1';
      var nowOn = !isOn;
      ev.currentTarget.setAttribute('data-on', nowOn ? '1' : '0');
      if (phoneEl) phoneEl.classList.toggle('bp-theme-light', !nowOn);
    });

    var langSheet = el('[data-bp="lang-sheet"]');
    el('[data-bp="lang-open"]').addEventListener('click', function (ev) {
      ev.stopPropagation();
      updateLangSelection();
      langSheet.classList.add('bp-open');
    });
    langSheet.addEventListener('click', function (ev) {
      if (ev.target === langSheet) langSheet.classList.remove('bp-open');
    });
    Array.prototype.forEach.call(root.querySelectorAll('.bp-lang-option'), function (btn) {
      btn.addEventListener('click', function (ev) {
        ev.stopPropagation();
        setLanguage(btn.getAttribute('data-lang'), true);
        langSheet.classList.remove('bp-open');
      });
    });
  }

  // ------------------------------------------------------------------
  // Maps: real vehicle telemetry (position/speed/heading/level)
  // ------------------------------------------------------------------


  // ------------------------------------------------------------------
  // Weather & time: real game time-of-day and weather via the game's own
  // environment API (Lua side). Sliders only ever show what the game reports.
  // ------------------------------------------------------------------

  var wBusy = {};            // slider keys the user is dragging right now
  var wSendTimers = {};

  function fmtHour(minutes) {
    var m = Math.round(minutes) % 1440;
    return pad2(Math.floor(m / 60)) + ':' + pad2(m % 60);
  }

  function wSend(kind, key, value) {
    var b = window.BeamiPhone.bridge;
    if (!b) return;
    clearTimeout(wSendTimers[key]);
    wSendTimers[key] = setTimeout(function () {
      if (kind === 'hour') b.setHour(value / 60);
      else b.setWeather(key, value);
    }, 90);
  }

  // Colour the filled part of a slider (CSS reads --p).
  function wFill(inp) {
    if (!inp) return;
    var mn = +inp.min, mx = +inp.max;
    inp.style.setProperty('--p', (((+inp.value - mn) / (mx - mn)) * 100).toFixed(1) + '%');
  }

  // Hero card: sky colour, sun/moon position, clouds, rain and fog all follow
  // the real slider values (which follow the game).
  var SKY_KEYS = [['night', 0], ['dawn', 6.5], ['day', 12], ['dusk', 18.5], ['night', 24]];
  function updateWeatherHero() {
    var hourInp = el('[data-bp="w-hour"]');
    if (!hourInp) return;
    var h = (+hourInp.value) / 60;
    var weights = { night: 0, dawn: 0, day: 0, dusk: 0 };
    for (var i = 0; i < SKY_KEYS.length - 1; i++) {
      var a0 = SKY_KEYS[i], b0 = SKY_KEYS[i + 1];
      if (h >= a0[1] && h <= b0[1]) {
        var f = (h - a0[1]) / (b0[1] - a0[1]);
        weights[a0[0]] += 1 - f;
        weights[b0[0]] += f;
        break;
      }
    }
    Object.keys(weights).forEach(function (k) {
      var node = el('[data-bp="w-sky-' + k + '"]');
      if (node) node.style.opacity = String(Math.min(1, weights[k]));
    });
    var clouds = +(el('[data-bp="w-clouds"]') || {}).value || 0;
    var fog = +(el('[data-bp="w-fog"]') || {}).value || 0;
    var rain = +(el('[data-bp="w-rain"]') || {}).value || 0;
    var cl = el('[data-bp="w-cloudlayer"]'); if (cl) cl.style.opacity = String(Math.min(1, 0.12 + clouds / 2.4));
    var gr = el('[data-bp="w-grey"]'); if (gr) gr.style.opacity = String(Math.min(0.7, clouds / 3 * 0.55 + rain / 100 * 0.25));
    var rl = el('[data-bp="w-rainlayer"]'); if (rl) rl.style.opacity = String(Math.min(1, rain / 100 * 1.4));
    var fl = el('[data-bp="w-foglayer"]'); if (fl) fl.style.opacity = String(Math.min(0.85, fog / 60 * 1.1));
    // sun by day, moon by night, riding an arc across the card
    var orb = el('[data-bp="w-orb"]');
    if (orb) {
      var day = h >= 6 && h < 18;
      var x = day ? (h - 6) / 12 : (((h + 6) % 24) / 12);
      var y = 1 - Math.sin(Math.PI * Math.min(1, Math.max(0, x)));
      orb.classList.toggle('bp-w-moon', !day);
      orb.style.left = 'calc(' + (x * 100).toFixed(1) + '% - 22px)';
      orb.style.transform = 'translate3d(0,' + (y * 64).toFixed(1) + 'px,0)';
      orb.style.opacity = String(1 - Math.min(0.8, clouds / 3 * 0.7 + rain / 100 * 0.3));
    }
    var cond = el('[data-bp="w-cond"]');
    if (cond) {
      var key = rain > 20 ? 'wRain' : fog > 15 ? 'wFog' : clouds > 1.4 ? 'wCloudy' : 'wClear';
      var txt = t(key);
      if (cond.textContent !== txt) cond.textContent = txt;
    }
  }

  function wShowValue(key, v) {
    var out = el('[data-bp="w-' + key + '-val"]');
    if (!out) return;
    if (key === 'clouds' || key === 'wind') out.textContent = Number(v).toFixed(1);
    else if (key === 'rain') out.textContent = Math.round(v) + '%';
    else out.textContent = String(Math.round(v));
  }

  function wireWeather() {
    var hour = el('[data-bp="w-hour"]');
    hour.addEventListener('input', function () {
      wBusy.hour = Date.now();
      el('[data-bp="w-time-val"]').textContent = fmtHour(+hour.value);
      wFill(hour);
      updateWeatherHero();
      wSend('hour', 'hour', +hour.value);
    });
    Array.prototype.forEach.call(root.querySelectorAll('[data-wkey]'), function (inp) {
      var key = inp.getAttribute('data-wkey');
      inp.addEventListener('input', function () {
        wBusy[key] = Date.now();
        wShowValue(key, +inp.value);
        wFill(inp);
        updateWeatherHero();
        // rain slider is a percentage; Lua expects drops (0-5000)
        wSend('weather', key, key === 'rain' ? Math.round(+inp.value * 50) : +inp.value);
      });
    });
    Array.prototype.forEach.call(root.querySelectorAll('[data-flow]'), function (btn) {
      btn.addEventListener('click', function () {
        var f = +btn.getAttribute('data-flow');
        if (window.BeamiPhone.bridge) window.BeamiPhone.bridge.setTimeFlow(f);
        Array.prototype.forEach.call(root.querySelectorAll('[data-flow]'), function (o) {
          o.classList.toggle('bp-w-seg-on', o === btn);
        });
      });
    });
    Array.prototype.forEach.call(root.querySelectorAll('[data-wpreset]'), function (btn) {
      btn.addEventListener('click', function () {
        if (window.BeamiPhone.bridge) window.BeamiPhone.bridge.setWeatherPreset(btn.getAttribute('data-wpreset'));
        // Lua answers with the real resulting state; refresh shortly after.
        setTimeout(function () { if (window.BeamiPhone.bridge) window.BeamiPhone.bridge.requestEnv(); }, 350);
      });
    });
  }

  function onEnv(data) {
    if (!root) return;
    var note = el('[data-bp="w-note"]');
    if (!data || !data.ok) {
      if (note) note.textContent = t('clockUnavailable');
      return;
    }
    if (note) note.textContent = '';
    function idle(key) { return !wBusy[key] || (Date.now() - wBusy[key]) > 1500; }
    if (typeof data.time === 'number' && idle('hour')) {
      var minutes = (((data.time * 24) + 12) % 24) * 60;
      el('[data-bp="w-hour"]').value = String(Math.round(minutes / 5) * 5 % 1440);
      el('[data-bp="w-time-val"]').textContent = fmtHour(minutes);
      wFill(el('[data-bp="w-hour"]'));
    }
    var map = { clouds: data.cloudCover, fog: data.fogDensity, wind: data.windSpeed,
                rain: typeof data.rain === 'number' ? data.rain / 50 : undefined };
    Object.keys(map).forEach(function (key) {
      var v = map[key];
      var inp = el('[data-bp="w-' + key + '"]');
      if (inp && typeof v === 'number' && idle(key)) {
        inp.value = String(v);
        wShowValue(key, v);
        wFill(inp);
      }
    });
    updateWeatherHero();
    var flow = typeof data.flowSpeed === 'number' ? data.flowSpeed : 0;
    Array.prototype.forEach.call(root.querySelectorAll('[data-flow]'), function (o) {
      o.classList.toggle('bp-w-seg-on', +o.getAttribute('data-flow') === flow);
    });
  }

  var carToastTimer = null;
  function onActionResult(data) {
    if (!data || data.action !== 'trunk' || data.ok) return;
    try {
      var found = [];
      var src = data.names || {};
      Object.keys(src).forEach(function (k) { found.push(src[k]); });
      console.log('[BeamiPhone] trunk: no matching controller. This car declares: ' + (found.join(', ') || '(none)'));
    } catch (e) {}
    var toast = el('[data-bp="car-toast"]');
    if (!toast) return;
    toast.textContent = t('carTrunkNone');
    toast.classList.add('bp-show');
    clearTimeout(carToastTimer);
    carToastTimer = setTimeout(function () { toast.classList.remove('bp-show'); }, 3000);
  }


  // ------------------------------------------------------------------
  // Maps: the level's real road network drawn on a canvas, your car, the
  // route set in the game's own navigation, drag to pan, zoom, north-up.
  // Road drawing approach ported from the author's Navi Drive mod.
  // ------------------------------------------------------------------

  var MAP_CELL = 250;
  var mapRoads = null;               // bucketed road segments
  var mapRoute = [];                 // [[x,y],...]
  var mapRouteTotal = null;
  var mapLoadState = 'idle';         // idle | loading | ok
  var mapRetry = null;
  var mapView = { x: 0, y: 0, ang: 0, z: 1, init: false, follow: true, northUp: false, zoom: 1 };
  var mapLive = { veh: false, x: 0, y: 0, hx: 0, hy: 1, spd: 0 };
  var mapCanvas = null, mapCtx = null, mapW = 0, mapH = 0, mapDpr = 1;
  var mapRaf = 0, mapLastTs = 0, mapLastSig = '', mapDirty = true, mapRouteVer = 0;
  var mapDrag = null;
  var mapDocWired = false;

  function clampNum(v, a, b) { return Math.max(a, Math.min(b, v)); }

  function buildRoads(segs) {
    var cells = {}, wsum = [0, 0, 0], cnt = [0, 0, 0];
    for (var i = 0; i + 4 < segs.length; i += 5) {
      var w = segs[i + 4] || 6, bi = w < 7 ? 0 : w < 12 ? 1 : 2;
      var x1 = segs[i], y1 = segs[i + 1], x2 = segs[i + 2], y2 = segs[i + 3];
      // Long road links are cut into pieces so they are drawn even when only
      // their middle crosses the screen.
      var n = Math.max(1, Math.ceil(Math.sqrt((x2 - x1) * (x2 - x1) + (y2 - y1) * (y2 - y1)) / (MAP_CELL / 2)));
      for (var q = 0; q < n; q++) {
        var ax = x1 + (x2 - x1) * q / n, ay = y1 + (y2 - y1) * q / n;
        var bx = x1 + (x2 - x1) * (q + 1) / n, by = y1 + (y2 - y1) * (q + 1) / n;
        var key = Math.floor((ax + bx) / 2 / MAP_CELL) + ',' + Math.floor((ay + by) / 2 / MAP_CELL);
        var c = cells[key] || (cells[key] = [[], [], []]);
        c[bi].push(ax, ay, bx, by);
      }
      wsum[bi] += w; cnt[bi]++;
    }
    Object.keys(cells).forEach(function (k) {
      cells[k] = cells[k].map(function (b) { return new Float32Array(b); });
    });
    return { cells: cells, w: wsum.map(function (sum, i) { return cnt[i] ? sum / cnt[i] : 6; }) };
  }

  function toPlainArray(x) {
    if (!x) return [];
    if (Array.isArray(x)) return x;
    var a = [];
    Object.keys(x).forEach(function (k) { a.push(x[k]); });
    return a;
  }

  function onMapData(d) {
    var segs = toPlainArray(d && d.segs);
    if (segs.length) {
      mapRoads = buildRoads(segs);
      mapLoadState = 'ok';
      clearTimeout(mapRetry);
      mapDirty = true;
    }
  }

  function onRouteData(d) {
    var pts = toPlainArray(d && d.pts);
    var out = [];
    for (var i = 0; i + 1 < pts.length; i += 2) out.push([pts[i], pts[i + 1]]);
    mapRoute = out;
    naviRouteFlat = pts.length > 3 ? pts : [];
    naviPushRoute();
    mapRouteTotal = (d && typeof d.total === 'number') ? d.total : null;
    mapRouteVer++;
    mapDirty = true;
    var routeEl = el('[data-bp="maps-route"]');
    if (routeEl) {
      if (out.length > 1 && mapRouteTotal !== null) {
        routeEl.textContent = mapRouteTotal >= 1000
          ? (mapRouteTotal / 1000).toFixed(1) + ' ' + t('unitKm')
          : Math.round(mapRouteTotal) + ' ' + t('unitM');
      } else {
        routeEl.textContent = out.length > 1 ? '…' : '—';
      }
    }
  }

  function requestMapData() {
    if (!window.BeamiPhone.bridge || mapLoadState === 'ok') return;
    mapLoadState = 'loading';
    window.BeamiPhone.bridge.requestMap();
    clearTimeout(mapRetry);
    mapRetry = setTimeout(function () {
      if (mapLoadState !== 'ok') { mapLoadState = 'idle'; requestMapData(); }
    }, 4000);
  }

  function onMapDirty() {
    naviData = null;
    naviDataFed = false;
    if (currentView === 'maps' && naviMode === 'native' && naviState !== 'fail') requestNaviDataOnce();
    mapRoads = null;
    mapLoadState = 'idle';
    mapRoute = [];
    mapRouteVer++;
    mapDirty = true;
    if (currentView === 'maps') requestMapData();
  }

  function onPose(d) {
    if (!d) return;
    mapLive.veh = true;
    mapLive.x = d.x; mapLive.y = d.y;
    mapLive.hx = d.dx; mapLive.hy = d.dy;
    mapLive.vx = d.vx; mapLive.vy = d.vy;
    mapLive.spd = Math.sqrt(d.vx * d.vx + d.vy * d.vy);
    mapLive.stamp = Date.now();
    mapLive.poseStamp = mapLive.stamp;
  }

  function mapUpdateLive(data) {
    // the 30 Hz pose stream is authoritative while it is flowing
    if (Date.now() - (mapLive.poseStamp || 0) < 800) { mapLive.veh = true; return; }
    if (data && data.ok && data.position && typeof data.dirX === 'number') {
      mapLive.veh = true;
      mapLive.x = data.position.x; mapLive.y = data.position.y;
      mapLive.hx = data.dirX; mapLive.hy = data.dirY;
      mapLive.stamp = Date.now();
      mapLive.spd = (typeof data.speedKmh === 'number' ? data.speedKmh : 0) / 3.6;
    } else {
      mapLive.veh = false;
    }
  }

  function mapColors() {
    var phone = el('[data-bp="phone"]');
    var light = phone && phone.classList.contains('bp-theme-light');
    return light
      ? { bg: '#e9ebef', cas: '#c4c8d0', road: '#ffffff', major: '#ffe29a', route: '#0a84ff', routeCas: '#ffffff', car: '#1c1c1e' }
      : { bg: '#15171c', cas: '#0c0e11', road: '#3b3f4a', major: '#5d6575', route: '#0a84ff', routeCas: '#06306b', car: '#ffffff' };
  }

  function bindMapCanvas() {
    var cv = el('[data-bp="map-canvas"]');
    if (!cv) return false;
    if (cv !== mapCanvas || !mapCtx) {
      mapCanvas = cv;
      mapCtx = cv.getContext('2d', { alpha: false });
      mapW = 0; mapH = 0; mapDirty = true; mapLastSig = '';
    }
    return !!mapCtx;
  }

  function mapResize() {
    var wrap = el('[data-bp="map-wrap"]');
    if (!wrap || !mapCanvas) return;
    var w = wrap.clientWidth, h = wrap.clientHeight;
    var dpr = window.devicePixelRatio || 1;
    if (!w || !h) return;
    if (w !== mapW || h !== mapH || dpr !== mapDpr) {
      mapW = w; mapH = h; mapDpr = dpr;
      mapCanvas.width = Math.round(w * dpr);
      mapCanvas.height = Math.round(h * dpr);
      mapCanvas.style.width = w + 'px';
      mapCanvas.style.height = h + 'px';
      mapDirty = true;
    }
  }

  function mapDraw() {
    var c = mapCtx, z = mapView.z, col = mapColors();
    var hx = Math.sin(mapView.ang), hy = Math.cos(mapView.ang);
    var ox = mapW / 2, oy = mapH * ((mapView.northUp || !mapView.follow) ? 0.5 : 0.64);
    c.setTransform(mapDpr, 0, 0, mapDpr, 0, 0);
    c.fillStyle = col.bg; c.fillRect(0, 0, mapW, mapH);
    var a = z * hy, b = -z * hx, cc = -z * hx, d = -z * hy;
    var e = ox - (a * mapView.x + cc * mapView.y), f = oy - (b * mapView.x + d * mapView.y);
    c.setTransform(a * mapDpr, b * mapDpr, cc * mapDpr, d * mapDpr, e * mapDpr, f * mapDpr);
    c.lineCap = 'round'; c.lineJoin = 'round';

    if (mapRoads) {
      var R = Math.sqrt(mapW * mapW + mapH * mapH) / z;
      var c0x = Math.floor((mapView.x - R) / MAP_CELL), c1x = Math.floor((mapView.x + R) / MAP_CELL);
      var c0y = Math.floor((mapView.y - R) / MAP_CELL), c1y = Math.floor((mapView.y + R) / MAP_CELL);
      var vis = [];
      for (var gx = c0x; gx <= c1x; gx++) {
        for (var gy = c0y; gy <= c1y; gy++) {
          var cell = mapRoads.cells[gx + ',' + gy];
          if (cell) vis.push(cell);
        }
      }
      var fills = [col.road, col.road, col.major];
      for (var pass = 0; pass < 2; pass++) {
        for (var bi = 0; bi < 3; bi++) {
          c.beginPath();
          var any = false;
          for (var ci = 0; ci < vis.length; ci++) {
            var arr = vis[ci][bi];
            for (var i = 0; i < arr.length; i += 4) { c.moveTo(arr[i], arr[i + 1]); c.lineTo(arr[i + 2], arr[i + 3]); any = true; }
          }
          if (!any) continue;
          var lw = Math.max(mapRoads.w[bi], (bi === 2 ? 3.2 : 2.2) / z);
          c.lineWidth = pass === 0 ? lw + 2.6 / z : lw;
          c.strokeStyle = pass === 0 ? col.cas : fills[bi];
          c.stroke();
        }
      }
    }

    if (mapRoute.length > 1) {
      c.beginPath(); c.moveTo(mapRoute[0][0], mapRoute[0][1]);
      for (var r = 1; r < mapRoute.length; r++) c.lineTo(mapRoute[r][0], mapRoute[r][1]);
      var rw = Math.max(7 / z, 4);
      c.lineWidth = rw + 3 / z; c.strokeStyle = col.routeCas; c.stroke();
      c.lineWidth = rw; c.strokeStyle = col.route; c.stroke();
    }

    c.setTransform(mapDpr, 0, 0, mapDpr, 0, 0);

    if (mapRoute.length > 1) { // destination pin (fixed size)
      var endp = mapRoute[mapRoute.length - 1];
      var sx = a * endp[0] + cc * endp[1] + e, sy = b * endp[0] + d * endp[1] + f;
      if (sx > -20 && sx < mapW + 20 && sy > -20 && sy < mapH + 20) {
        var ps = Math.max(8, Math.min(mapW, mapH) / 26);
        c.beginPath(); c.arc(sx, sy - ps * 1.3, ps * 0.75, Math.PI * 0.8, Math.PI * 0.2); c.lineTo(sx, sy); c.closePath();
        c.fillStyle = col.route; c.fill(); c.lineWidth = 2; c.strokeStyle = col.routeCas; c.stroke();
        c.beginPath(); c.arc(sx, sy - ps * 1.3, ps * 0.3, 0, Math.PI * 2); c.fillStyle = col.bg; c.fill();
      }
    }

    if (mapLive.veh) { // your car
      var carx = a * mapLive.x + cc * mapLive.y + e, cary = b * mapLive.x + d * mapLive.y + f;
      var s2 = Math.max(8, Math.min(mapW, mapH) / 22);
      var rot = Math.atan2(mapLive.hx, mapLive.hy) - mapView.ang;
      c.save(); c.translate(carx, cary); c.rotate(rot);
      c.beginPath(); c.arc(0, 0, s2 * 1.7, 0, Math.PI * 2); c.fillStyle = col.route; c.globalAlpha = 0.18; c.fill(); c.globalAlpha = 1;
      c.shadowColor = 'rgba(0,0,0,.5)'; c.shadowBlur = 6; c.shadowOffsetY = 2;
      c.beginPath(); c.moveTo(0, -s2); c.lineTo(s2 * 0.74, s2 * 0.82); c.lineTo(0, s2 * 0.42); c.lineTo(-s2 * 0.74, s2 * 0.82); c.closePath();
      c.fillStyle = col.car; c.fill();
      c.shadowColor = 'transparent'; c.lineWidth = 2; c.strokeStyle = col.routeCas; c.stroke();
      c.restore();
    }

    var msg = el('[data-bp="map-msg"]');
    if (msg) {
      var text = !mapLive.veh ? t('mapsNoCar') : (mapLoadState !== 'ok' ? t('mapsLoading') : '');
      if (naviState === 'fail' && naviErr) text = 'Game map unavailable (' + naviErr + ') — basic map shown';
      if (msg.textContent !== text) msg.textContent = text;
      msg.style.display = text ? 'block' : 'none';
    }
    var nb = el('[data-bp="map-north"]');
    if (nb) nb.style.transform = 'rotate(' + (-mapView.ang * 180 / Math.PI).toFixed(1) + 'deg)';
  }

  function mapFrame(ts) {
    mapRaf = requestAnimationFrame(mapFrame);
    if (ts - mapLastTs < 30) return;
    var dt = Math.min(0.1, (ts - mapLastTs) / 1000 || 0.03);
    mapLastTs = ts;
    if (!bindMapCanvas()) return;
    mapResize();
    if (!mapW || !mapH) return;

    var carAng = Math.atan2(mapLive.hx, mapLive.hy);
    var tAng = mapView.northUp ? 0 : (mapView.follow ? carAng : mapView.ang);
    if (!mapView.init && mapLive.veh) {
      mapView.x = mapLive.x; mapView.y = mapLive.y; mapView.ang = tAng; mapView.init = true;
    }
    if (mapView.follow && mapLive.veh) {
      var k = Math.min(1, dt * 10);
      mapView.x += (mapLive.x - mapView.x) * k;
      mapView.y += (mapLive.y - mapView.y) * k;
    }
    var da = tAng - mapView.ang;
    while (da > Math.PI) da -= 2 * Math.PI;
    while (da < -Math.PI) da += 2 * Math.PI;
    mapView.ang += da * Math.min(1, dt * 6);

    var sf = mapView.follow ? clampNum(1.3 - mapLive.spd / 40, 0.55, 1.3) : 1;
    var tz = (Math.min(mapW, mapH) / 230) * mapView.zoom * sf;
    mapView.z += (tz - mapView.z) * Math.min(1, dt * 2.5);

    var sig = [Math.round(mapView.x * 4), Math.round(mapView.y * 4), Math.round(mapView.ang * 400),
               Math.round(mapView.z * 200), mapRouteVer, mapW, mapH, mapLive.veh, mapLoadState,
               Math.round(Math.atan2(mapLive.hx, mapLive.hy) * 100), Math.round(mapLive.x), Math.round(mapLive.y),
               mapView.follow, mapView.northUp].join('|');
    if (sig === mapLastSig && !mapDirty) return;
    mapLastSig = sig; mapDirty = false;
    try { mapDraw(); } catch (err) {
      console.warn('[BeamiPhone] map draw error', err);
      var em = el('[data-bp="map-msg"]');
      if (em) { em.textContent = 'Map error: ' + (err && err.message ? err.message : err); em.style.display = 'block'; }
    }
  }


  // ------------------------------------------------------------------
  // Native map: the game's own in-car navigator engine (bngNavigator).
  // The engine only draws: whoever hosts it must feed it. Same as the car's
  // navigation screen, we (1) give it the road network once per level with
  // setData(), (2) move the map every frame with updateData({x, y, rotation,
  // speed}) and (3) hand it the active route with setRoute().
  // If it can't start, the basic canvas map is used (the switch button flips by hand).
  // ------------------------------------------------------------------
  var NAVI_STYLES = {
    // look of the game's own navigator (white roads on grey) with its orange arrow
    classic: { bg: [50, 50, 50], roads: ['#FFFFFFFF', '#A6A678FF', '#A67854FF'], marker: '#FD6A00', pitch: 62 },
    dark:    { bg: [18, 22, 28], roads: ['#4a505f', '#656c7e', '#2a2e37'], marker: '#0a84ff', pitch: 58 },
    light:   { bg: [233, 235, 239], roads: ['#ffffff', '#ffe29a', '#c4c8d0'], marker: '#0a84ff', pitch: 58 }
  };
  var naviStyle = 'classic';
  var naviMode = 'native';            // 'native' | 'canvas'
  var naviState = 'idle';             // idle | loading | ok | fail
  var naviEl = null;                  // container the current instance belongs to
  var naviInstance = null;
  var naviErr = '';
  var naviData = null;                // road network for this level (cached)
  var naviDataFed = false;            // has the current instance received it?
  var naviRaf = 0;
  var naviRot = null;
  var naviLastFrame = 0;
  var naviRouteFlat = [];
  var naviDataTimer = null;

  function loadNaviScript() {
    return new Promise(function (resolve, reject) {
      if (window.bngNavigator) { resolve(); return; }
      var sc = document.createElement('script');
      sc.src = '/ui/ui-vue/src/services/navigator-class.js';
      sc.onload = function () { window.bngNavigator ? resolve() : reject(new Error('bngNavigator missing after load')); };
      sc.onerror = function () { reject(new Error('navigator-class.js not found')); };
      document.head.appendChild(sc);
    });
  }

  function naviApplyMode() {
    var navi = el('[data-bp="navi"]');
    var cv = el('[data-bp="map-canvas"]');
    var useNative = naviMode === 'native' && naviState !== 'fail';
    if (navi) navi.style.display = useNative ? 'block' : 'none';
    if (cv) cv.style.display = useNative ? 'none' : 'block';
    ['map-north', 'map-zin', 'map-zout', 'map-follow'].forEach(function (k) {
      var b = el('[data-bp="' + k + '"]');
      if (b) b.style.display = useNative ? 'none' : 'flex';
    });
    mapDirty = true;
  }

  function naviFail(err) {
    naviState = 'fail';
    naviErr = String(err && err.message || err);
    console.warn('[BeamiPhone] native map unavailable, using the basic map:', naviErr);
    naviStopLoop();
    naviApplyMode();
    if (!mapRaf) mapRaf = requestAnimationFrame(mapFrame);
    requestMapData();
  }

  function feedNavi() {
    if (!naviInstance || !naviData || naviDataFed) return;
    try {
      naviInstance.setData(naviData);
      naviDataFed = true;
      naviPushRoute();
      mapDirty = true;
    } catch (err) {
      naviFail(err);
    }
  }

  function naviPushRoute() {
    if (!naviInstance || !naviDataFed) return;
    try {
      naviInstance.setRoute(naviRouteFlat.length > 3 ? { markers: naviRouteFlat, color: '#0a84ff' } : null);
    } catch (err) { console.warn('[BeamiPhone] setRoute failed', err); }
  }

  function onNaviData(d) {
    clearTimeout(naviDataTimer);
    if (!d || !d.nodes) return;
    naviData = { nodes: d.nodes, terrainTiles: [] };
    naviDataFed = false;
    feedNavi();
  }

  function requestNaviDataOnce() {
    if (naviData || !window.BeamiPhone.bridge) return;
    window.BeamiPhone.bridge.requestNaviData();
    clearTimeout(naviDataTimer);
    naviDataTimer = setTimeout(function () {
      if (!naviData) naviFail(new Error('no road data received'));
    }, 15000);
  }

  // Per-frame feed. The car pose arrives ~30x/s from Lua; between samples we
  // dead-reckon with the real velocity and ease the shown position toward it,
  // so the map glides instead of stepping.
  var naviDisp = null;
  function naviFrame(ts) {
    naviRaf = requestAnimationFrame(naviFrame);
    if (!naviInstance || !naviDataFed || !mapLive.veh) return;
    var dt = Math.min(0.1, Math.max(0.001, (ts - (naviLastFrame || ts)) / 1000));
    naviLastFrame = ts;
    var age = Math.min(0.25, (Date.now() - (mapLive.stamp || Date.now())) / 1000);
    var vx = mapLive.vx, vy = mapLive.vy;
    if (typeof vx !== 'number') { vx = mapLive.hx * mapLive.spd; vy = mapLive.hy * mapLive.spd; }
    var tx = mapLive.x + vx * age, ty = mapLive.y + vy * age;
    var trot = -(Math.atan2(mapLive.hx, mapLive.hy) * 180 / Math.PI); // map turns against the car
    if (!naviDisp || Math.abs(tx - naviDisp.x) + Math.abs(ty - naviDisp.y) > 60) {
      naviDisp = { x: tx, y: ty, rot: trot };
    } else {
      var k = 1 - Math.exp(-dt / 0.05);
      naviDisp.x += (tx - naviDisp.x) * k;
      naviDisp.y += (ty - naviDisp.y) * k;
      naviDisp.rot += (((trot - naviDisp.rot + 540) % 360) - 180) * (1 - Math.exp(-dt / 0.07));
    }
    try {
      naviInstance.updateData({ x: naviDisp.x, y: naviDisp.y, rotation: naviDisp.rot, speed: mapLive.spd });
    } catch (err) {
      naviFail(err);
    }
  }

  function naviStartLoop() { if (!naviRaf) naviRaf = requestAnimationFrame(naviFrame); }
  function naviStopLoop() { if (naviRaf) { cancelAnimationFrame(naviRaf); naviRaf = 0; } }

  // New colours need a fresh engine instance (it pre-renders the roads once).
  function naviRecreate() {
    var container = el('#bpMapContainer');
    if (!container || naviMode !== 'native') return;
    naviStopLoop();
    container.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink"></svg>';
    container.style.cssText = '';
    naviInstance = null; naviEl = null; naviDataFed = false; naviDisp = null;
    if (naviState !== 'loading') naviState = 'idle';
    startNativeMap();
  }

  function startNativeMap() {
    var box = el('[data-bp="navi"]');
    var wrap = el('[data-bp="map-wrap"]');
    var container = el('#bpMapContainer');
    if (!box || !wrap || !container) return;
    if (naviState === 'loading') return;
    if (naviEl === container && naviInstance) { naviStartLoop(); requestNaviDataOnce(); return; }
    naviState = 'loading';
    naviErr = '';
    box.style.display = 'block'; // must be laid out to be measured
    loadNaviScript().then(function () {
      setTimeout(function () {
        var W = wrap.clientWidth || 300, H = wrap.clientHeight || 500;
        try {
          naviInstance = new window.bngNavigator({
            container: '#bpMapContainer',
            bootscreen: '#bpBootscreen',
            clock: '#bpNaviClock',
            backgroundRgb: NAVI_STYLES[naviStyle].bg,
            roadColors: NAVI_STYLES[naviStyle].roads,
            routes: true,
            resolution: 3072,
            scale: 1.7,
            offsetX: Math.round(W / 2),
            offsetY: Math.round(H * 0.62),
            pitch: NAVI_STYLES[naviStyle].pitch,
            speedPitch: 3,
            hideBootscreen: true
          });
          naviEl = container;
          naviDataFed = false;
          naviRot = null;
          naviDisp = null;
          naviState = 'ok';
          var marker = el('[data-bp="navi-marker"]');
          if (marker) {
            marker.style.left = (Math.round(W / 2) - 15) + 'px';
            marker.style.top = (Math.round(H * 0.62) - 15) + 'px';
            marker.style.setProperty('--mk', NAVI_STYLES[naviStyle].marker);
          }
        } catch (err) {
          naviFail(err);
          return;
        }
        naviApplyMode();
        if (naviData) feedNavi(); else requestNaviDataOnce();
        naviStartLoop();
      }, 60);
    }).catch(naviFail);
  }

  function startMapLoop() {
    var native = naviMode === 'native' && naviState !== 'fail';
    if (native) startNativeMap();
    naviApplyMode();
    if (!bindMapCanvas()) return;
    mapDirty = true;
    if (!native) {
      if (!mapRaf) mapRaf = requestAnimationFrame(mapFrame);
      requestMapData();
    }
    if (window.BeamiPhone.bridge) window.BeamiPhone.bridge.startRoutePolling();
  }

  function stopMapLoop() {
    if (mapRaf) { cancelAnimationFrame(mapRaf); mapRaf = 0; }
    naviStopLoop();
    if (window.BeamiPhone.bridge) window.BeamiPhone.bridge.stopRoutePolling();
  }

  function wireMap() {
    var cv = el('[data-bp="map-canvas"]');
    el('[data-bp="map-zin"]').addEventListener('click', function () { mapView.zoom = clampNum(mapView.zoom * 1.35, 0.3, 6); mapDirty = true; });
    el('[data-bp="map-zout"]').addEventListener('click', function () { mapView.zoom = clampNum(mapView.zoom / 1.35, 0.3, 6); mapDirty = true; });
    el('[data-bp="map-north"]').addEventListener('click', function () { mapView.northUp = !mapView.northUp; mapDirty = true; });
    el('[data-bp="map-follow"]').addEventListener('click', function () { mapView.follow = true; mapDirty = true; });
    el('[data-bp="map-style"]').addEventListener('click', function () {
      var order = ['classic', 'dark', 'light'];
      naviStyle = order[(order.indexOf(naviStyle) + 1) % order.length];
      if (window.BeamiPhone.bridge) window.BeamiPhone.bridge.savePref('mapStyle', naviStyle);
      naviRecreate();
    });
    el('[data-bp="map-engine"]').addEventListener('click', function () {
      naviMode = naviMode === 'native' ? 'canvas' : 'native';
      if (naviMode === 'canvas') { naviState = naviState === 'fail' ? 'fail' : naviState; }
      naviApplyMode();
      if (naviMode === 'canvas') {
        if (!mapRaf) mapRaf = requestAnimationFrame(mapFrame);
        requestMapData();
      } else {
        if (mapRaf) { cancelAnimationFrame(mapRaf); mapRaf = 0; }
        if (naviState === 'fail') { naviState = 'idle'; naviErr = ''; }
        startNativeMap();
      }
    });
    cv.addEventListener('mousedown', function (ev) {
      mapDrag = { x: ev.clientX, y: ev.clientY };
      ev.preventDefault();
    });
    cv.addEventListener('wheel', function (ev) {
      ev.preventDefault();
      mapView.zoom = clampNum(mapView.zoom * (ev.deltaY < 0 ? 1.15 : 1 / 1.15), 0.3, 6);
      mapDirty = true;
    });
    if (mapDocWired) return; // document-level listeners only once, even if the UI is rebuilt
    mapDocWired = true;
    document.addEventListener('mousemove', function (ev) {
      if (!mapDrag) return;
      var us = uiScale();
      var dx = (ev.clientX - mapDrag.x) / us, dy = (ev.clientY - mapDrag.y) / us;
      mapDrag.x = ev.clientX; mapDrag.y = ev.clientY;
      if (Math.abs(dx) + Math.abs(dy) < 1) return;
      mapView.follow = false;
      var z = mapView.z, hx = Math.sin(mapView.ang), hy = Math.cos(mapView.ang);
      var a = z * hy, b = -z * hx, cc = -z * hx, d = -z * hy;
      var det = a * d - b * cc;
      mapView.x -= (d * dx - cc * dy) / det;
      mapView.y -= (-b * dx + a * dy) / det;
      mapDirty = true;
    });
    document.addEventListener('mouseup', function () { mapDrag = null; });
  }

  // ------------------------------------------------------------------
  // Safari: the "About" screen (what the mod does + news). The game can't host a
  // real browser. News live in safari/news.json so they can be edited without
  // touching code.
  // ------------------------------------------------------------------
  var safariToastTimer = null;
  var safariNewsLoaded = false;

  function safariToast(text) {
    var toast = el('[data-bp="safari-toast"]');
    if (!toast) return;
    toast.textContent = text;
    toast.classList.add('bp-show');
    clearTimeout(safariToastTimer);
    safariToastTimer = setTimeout(function () { toast.classList.remove('bp-show'); }, 4200);
  }

  function copyText(text) {
    var done = false;
    try {
      var ta = document.createElement('textarea');
      ta.value = text; ta.setAttribute('readonly', '');
      ta.style.cssText = 'position:fixed;left:-1000px;top:0;opacity:0';
      document.body.appendChild(ta);
      ta.select();
      done = document.execCommand('copy');
      document.body.removeChild(ta);
    } catch (e) { done = false; }
    if (!done && navigator.clipboard && navigator.clipboard.writeText) {
      try { navigator.clipboard.writeText(text); done = true; } catch (e2) {}
    }
    return done;
  }

  function pickText(v) {
    if (!v) return '';
    if (typeof v === 'string') return v;
    return v[currentLang] || v.en || v.ru || '';
  }

  function renderSafariNews(list) {
    var box = el('[data-bp="safari-news"]');
    if (!box) return;
    if (!list || !list.length) { box.innerHTML = '<div class="bp-safari-p">' + escapeHtml(t('safariNoNews')) + '</div>'; return; }
    box.innerHTML = list.slice(0, 8).map(function (n) {
      return '<div class="bp-safari-news">' +
        (n.date ? '<div class="bp-safari-date">' + escapeHtml(String(n.date)) + '</div>' : '') +
        '<div class="bp-safari-ntitle">' + escapeHtml(pickText(n.title)) + '</div>' +
        '<div class="bp-safari-p">' + escapeHtml(pickText(n.text)) + '</div></div>';
    }).join('');
  }

  var safariNewsData = null;
  function loadSafariNews() {
    if (safariNewsData) { renderSafariNews(safariNewsData); return; }
    fetch('/ui/modules/apps/BeamiPhone/safari/news.json')
      .then(function (r) { if (!r.ok) throw new Error('news ' + r.status); return r.json(); })
      .then(function (data) { safariNewsData = (data && data.news) || []; renderSafariNews(safariNewsData); })
      .catch(function () { renderSafariNews([]); });
  }


  var musicToastTimer = null;
  function showMusicToast(text) {
    var toast = el('[data-bp="music-toast"]');
    if (!toast) return;
    toast.textContent = text;
    toast.classList.add('bp-show');
    clearTimeout(musicToastTimer);
    musicToastTimer = setTimeout(function () { toast.classList.remove('bp-show'); }, 9000);
  }

  // Lua reports which method it used and the exact folder it tried to open
  function onFolder(data) {
    if (!data || !data.path) return;
    var shown = el('[data-bp="music-path"]');
    if (shown) shown.textContent = data.path;
    copyText(data.path);
    console.log('[BeamiPhone] folder method ' + data.method + ' path=' + data.path + ' ok=' + data.ok);
  }

  // ------------------------------------------------------------------
  // Notifications from the "My car" app: the engine was started by something
  // other than this phone (key, in-game controls, another mod, ...).
  // ------------------------------------------------------------------
  var vsPrev = null;
  var OWN_ACTION_WINDOW_MS = 9000;

  // ------------------------------------------------------------------
  // Car alerts: engine started by someone else, speeding, low fuel / charge.
  // Everything you may want to tune is in ALERT.
  // ------------------------------------------------------------------
  var ALERT = {
    settleMs: 8000,        // ignore all alerts this long after a car (re)appears: its values are garbage while it loads
    maxPlausibleKmh: 400,  // anything faster is a glitch, not driving
    jumpKmh: 120,          // a speed change this big within one second = teleport / reset / spawn
    speedOverKmh: 15,      // alert when this far above the posted limit...
    speedReadings: 2,      // ...for this many consecutive readings (one per second)
    speedRepeatMs: 30000,  // minimum gap between two speeding alerts
    fuelWarn: 0.15,        // first low-fuel alert (15%)
    fuelCritical: 0.05,    // second, urgent alert (5%)
    fuelStableMs: 4000     // the level must stay low this long before alerting
  };

  var vehSeen = { id: null, since: 0 };
  var pendingAlerts = [];   // raised while the phone was closed; shown on the lock screen when it opens

  function vehicleSettled() {
    return vehSeen.id !== null && Date.now() - vehSeen.since >= ALERT.settleMs;
  }

  function deliverCarNotification(body) {
    if (!window.BeamiPhone.notifications) return;
    var ic = el('[data-bp="view-home"] [data-icon-key="car"]');
    window.BeamiPhone.notifications.push({
      app: 'car',
      iconHtml: ic ? ic.outerHTML : '<span class="bp-icon bp-grad-red">' + ICONS.car + '</span>',
      title: t('appCar'),
      body: body
    });
  }

  function pushCarNotification(body) {
    if (!isOpen) {
      pendingAlerts.push(body);
      if (pendingAlerts.length > 5) pendingAlerts.shift();
      return;
    }
    deliverCarNotification(body);
  }

  function flushPendingAlerts() {
    var q = pendingAlerts.splice(0, pendingAlerts.length);
    q.forEach(deliverCarNotification);
  }

  var speedOverCount = 0;
  var lastSpeedingAt = 0;
  var prevSpeedKmh = null;

  function checkSpeeding(d) {
    var s = d.speedKmh, l = d.limitKmh;
    var sane = isFinite(s) && s >= 0 && s <= ALERT.maxPlausibleKmh && isFinite(l) && l >= 20 && l <= 200;
    var jumped = sane && prevSpeedKmh !== null && Math.abs(s - prevSpeedKmh) > ALERT.jumpKmh;
    prevSpeedKmh = sane ? s : null;
    if (!sane || jumped || !vehicleSettled()) { speedOverCount = 0; return; }
    speedOverCount = (s > l + ALERT.speedOverKmh) ? speedOverCount + 1 : 0;
    if (speedOverCount >= ALERT.speedReadings && Date.now() - lastSpeedingAt > ALERT.speedRepeatMs) {
      lastSpeedingAt = Date.now();
      speedOverCount = 0;
      pushCarNotification(t('notifSpeeding').replace('{s}', Math.round(s)).replace('{l}', Math.round(l)));
    }
  }

  var fuelState = 0;      // 0 = nothing sent yet, 1 = warning sent, 2 = critical sent
  var fuelLowSince = 0;

  // Fuel (or battery charge on electric cars): readout in "My car" + alerts at 15% and 5%.
  function updateFuel(f) {
    var settled = vehicleSettled();
    var fe = el('[data-bp="car-fuel"]');
    if (fe) fe.textContent = settled ? Math.round(f * 100) + '%' : '—';
    if (!settled || !smartNotifs) { fuelLowSince = 0; return; }
    if (f > ALERT.fuelWarn + 0.03) { fuelState = 0; fuelLowSince = 0; return; } // refuelled: re-arm
    var level = f < ALERT.fuelCritical ? 2 : (f < ALERT.fuelWarn ? 1 : 0);
    if (level === 0) { fuelLowSince = 0; return; }
    if (!fuelLowSince) fuelLowSince = Date.now();
    if (Date.now() - fuelLowSince < ALERT.fuelStableMs) return;
    if (level > fuelState) {
      fuelState = level;
      pushCarNotification(t('notifLowFuel').replace('{p}', Math.round(f * 100)));
    }
  }

  function onVehState(d) {
    if (!d || !d.has) {
      vsPrev = null; vehSeen = { id: null, since: 0 };
      speedOverCount = 0; prevSpeedKmh = null; fuelState = 0; fuelLowSince = 0;
      return;
    }
    if (d.id !== vehSeen.id) { // a new car (spawn, switch, reset): start the warm-up again
      vehSeen = { id: d.id, since: Date.now() };
      speedOverCount = 0; prevSpeedKmh = null; fuelState = 0; fuelLowSince = 0;
    }
    if (smartNotifs && typeof d.speedKmh === 'number' && typeof d.limitKmh === 'number') checkSpeeding(d);
    if (vsPrev && vsPrev.id === d.id && !vsPrev.engineOn && d.engineOn) {
      var own = window.BeamiPhone.ownEngineActionAt || 0;
      if (smartNotifs && vehicleSettled() && Date.now() - own > OWN_ACTION_WINDOW_MS) {
        pushCarNotification(t('notifEngineOn') + (d.name ? ': ' + d.name : ''));
      }
    }
    vsPrev = { id: d.id, engineOn: !!d.engineOn };
  }

  // BeamNG time of day: 0 = noon, 0.5 = midnight (same convention as the weather slider).
  // If the clock ever shows exactly 12 hours off, remove the "+ 12" here -- it is the only place.
  function todToMinutes(f) { return Math.round(((f * 24 + 12) % 24) * 60) % 1440; }

  function onTelemetry(data) {
    lastTelemetry = data || { ok: false };

    var gameTimeEl = el('[data-bp="game-time"]');
    var gameTimeSubEl = el('[data-bp="game-time-sub"]');
    if (gameTimeEl) {
      if (data && typeof data.timeOfDayFraction === 'number') {
        var totalMinutes = todToMinutes(data.timeOfDayFraction);
        var hh = Math.floor(totalMinutes / 60);
        var mm = totalMinutes % 60;
        gameTimeEl.textContent = pad2(hh) + ':' + pad2(mm);
        if (gameTimeSubEl) gameTimeSubEl.textContent = (hh >= 6 && hh < 20) ? t('clockDay') : t('clockNight');
      } else {
        gameTimeEl.textContent = '--:--';
        if (gameTimeSubEl) gameTimeSubEl.textContent = t('clockUnavailable');
      }
    }

    var speedEl = el('[data-bp="maps-speed"]');

    var carNameEl = el('[data-bp="car-name"]');
    var carSwatchEl = el('[data-bp="car-swatch"]');
    var carStatusEl = el('[data-bp="car-status"]');
    if (carNameEl) {
      if (data && data.vehicleName) {
        carNameEl.textContent = data.vehicleName;
      } else {
        carNameEl.textContent = t('carNoData');
      }
    }
    if (carStatusEl) {
      carStatusEl.style.display = (data && data.remembered) ? 'block' : 'none';
    }
    if (carSwatchEl) {
      if (data && data.color) {
        var r = Math.round(data.color.r * 255);
        var g = Math.round(data.color.g * 255);
        var b = Math.round(data.color.b * 255);
        carSwatchEl.style.background = 'rgb(' + r + ',' + g + ',' + b + ')';
      } else {
        carSwatchEl.style.background = '#3a3a3f';
      }
    }

    if (!speedEl) return; // maps view DOM not built yet
    mapUpdateLive(data);

    var limEl = el('[data-bp="maps-limit"]');
    if (data && data.ok) {
      speedEl.textContent = (data.speedKmh !== undefined ? Math.round(data.speedKmh) : '—') + ' ' + t('unitKmh');
      var hasLimit = typeof data.speedLimitKmh === 'number';
      if (limEl) limEl.textContent = hasLimit ? (Math.round(data.speedLimitKmh) + ' ' + t('unitKmh')) : '—';
      speedEl.classList.toggle('bp-over-limit', hasLimit && typeof data.speedKmh === 'number' && data.speedKmh > data.speedLimitKmh + 3);
    } else {
      speedEl.textContent = '— ' + t('unitKmh');
      speedEl.classList.remove('bp-over-limit');
      if (limEl) limEl.textContent = '—';
    }
  }

  // ------------------------------------------------------------------
  // Dragy: real 0-100/0-200/quarter-mile timing, driven by the game's own
  // 'streamsUpdate' broadcast (electrics.airspeed / throttle_input /
  // odometer) -- the same real data channel the user's own "Dragy" BeamNG
  // mod uses. Nothing here is simulated; every split only appears once the
  // real odometer/airspeed values actually cross that threshold.
  // ------------------------------------------------------------------

  var dragyState = null;
  var dragyAttempt = 0;
  var dragyArmedPreset = null; // 'z100' | 'z200' | 'r80_120' | 'quarter' | null -- only set on the detail page
  var dragyDetailRunning = false;
  var dragyDetailStart = 0;
  var dragyRollingWatch = null; // {waiting80:true} for the 80-120 rolling preset

  function presetTitle(preset) {
    var kmh = t('unitKmh');
    if (preset === 'z100') return '0-100 ' + kmh;
    if (preset === 'z200') return '0-200 ' + kmh;
    if (preset === 'r80_120') return '80-120 ' + kmh;
    if (preset === 'quarter') return t('quarterMile') + ' (0-400 ' + t('unitM') + ')';
    return '';
  }

  function dragyResetPending() {
    dragyState = dragyState || {};
    dragyState.pending = {
      s100: true, s200: true, s300: true, s400: true,
      m200: true, m400: true, m800: true, m1000: true, m1500: true
    };
  }

  function dragyFlashGreen() {
    var screenEl = el('.bp-screen') || (root ? root.querySelector('.bp-screen') : null);
    if (!screenEl) return;
    screenEl.classList.add('bp-dragy-flash');
    setTimeout(function () { screenEl.classList.remove('bp-dragy-flash'); }, 700);
  }

  var dragyAttempts = []; // [{label, speed:[{text,highlight}], dist:[...]}]
  var dragyPendingLabel = null;

  function dragyArmNewAttempt() {
    dragyAttempt++;
    dragyPendingLabel = t('attempt') + ' ' + dragyAttempt; // only shown once a real result lands
  }

  function dragyEnsureAttempt() {
    if (dragyPendingLabel) {
      dragyAttempts.push({ label: dragyPendingLabel, speed: [], dist: [] });
      dragyPendingLabel = null;
    }
    if (dragyAttempts.length === 0) {
      dragyAttempts.push({ label: t('attempt'), speed: [], dist: [] });
    }
    return dragyAttempts[dragyAttempts.length - 1];
  }

  function dragyAddResult(text, highlight, kind) {
    var attempt = dragyEnsureAttempt();
    var entry = { text: text, highlight: !!highlight };
    if (kind === 'dist') attempt.dist.push(entry);
    else attempt.speed.push(entry);
    renderDragyResults();
  }

  function renderDragyResults() {
    var list = el('[data-bp="dragy-results"]');
    if (!list) return;
    if (dragyAttempts.length === 0) {
      list.innerHTML = '<div class="bp-dragy-empty">' + escapeHtml(t('dragyEmpty')) + '</div>';
      return;
    }
    function col(entries) {
      return entries.map(function (e) {
        return '<div class="bp-dragy-row' + (e.highlight ? ' bp-dragy-row-hi' : '') + '">' + escapeHtml(e.text) + '</div>';
      }).join('');
    }
    list.innerHTML = dragyAttempts.map(function (a) {
      return '' +
        '<div class="bp-dragy-group">' + escapeHtml(a.label) + '</div>' +
        '<div class="bp-dragy-columns">' +
        '  <div class="bp-dragy-col">' + col(a.speed) + '</div>' +
        '  <div class="bp-dragy-col bp-dragy-col-dist">' + col(a.dist) + '</div>' +
        '</div>';
    }).join('');
  }

  function dragyClear() {
    dragyAttempts = [];
    dragyAttempt = 0;
    dragyPendingLabel = null;
    renderDragyResults();
  }

  function dragyOpenPreset(preset) {
    dragyArmedPreset = preset;
    dragyDetailRunning = false;
    dragyRollingWatch = null;
    var titleEl = el('[data-bp="dragy-detail-title"]');
    if (titleEl) titleEl.textContent = presetTitle(preset);
    var statusEl = el('[data-bp="dragy-detail-status"]');
    if (statusEl) statusEl.textContent = t(preset === 'r80_120' ? 'dragyRolling' : 'dragyReady');
    var timerEl = el('[data-bp="dragy-detail-timer"]');
    if (timerEl) timerEl.textContent = '0.0';
    showView('dragy-detail');
  }

  function dragyCloseDetail() {
    dragyArmedPreset = null;
    dragyDetailRunning = false;
    dragyRollingWatch = null;
    showView('dragy');
  }

  function dragyRenderDetailTimer(now) {
    if (!dragyDetailRunning) return;
    var timerEl = el('[data-bp="dragy-detail-timer"]');
    if (timerEl) timerEl.textContent = ((now - dragyDetailStart) / 1000).toFixed(1);
  }

  function dragyFinishDetail(seconds) {
    dragyDetailRunning = false;
    var timerEl = el('[data-bp="dragy-detail-timer"]');
    if (timerEl) timerEl.textContent = seconds.toFixed(2);
    var statusEl = el('[data-bp="dragy-detail-status"]');
    if (statusEl) statusEl.textContent = t('dragyResult');
    dragyFlashGreen();
  }

  function onStreamsUpdate(streams) {
    if (!streams || !streams.electrics) return;
    var e = streams.electrics;
    if (typeof e.fuel === 'number' && isFinite(e.fuel)) updateFuel(e.fuel);
    if (e.throttle_input === undefined || e.airspeed === undefined || e.odometer === undefined) return;
    if (!dragyState) dragyResetPending();

    var airspeedKmh = e.airspeed * 3.6;
    var speedEl = el('[data-bp="dragy-speed"]');
    if (speedEl) speedEl.textContent = Math.max(0, Math.round(airspeedKmh));

    var now = performance.now();
    var s = dragyState;
    // Only treat the brake as "released" if this vehicle even reports it;
    // otherwise don't block the start on a field that doesn't exist.
    var brakeReleased = (e.brake_input === undefined) || (e.brake_input < 0.1);

    // Stationary, gas down, brake released: (re)arm a fresh run. Requiring
    // the brake to be off (not just "moving") fixes two-foot/launch-control
    // starts where the driver revs against the brake -- the timer used to
    // start the instant the throttle went down, before the car actually
    // moved, making every time look slower than it really was.
    if (airspeedKmh <= 1 && e.throttle_input > 0.5 && brakeReleased) {
      if (!s.armedThisStop) {
        s.armedThisStop = true;
        dragyArmNewAttempt();
        s.odometerStart = e.odometer;
        s.startTime = now;
        s.startTimeDist = now;
        s.splitTime = now;
        dragyResetPending();
        if (dragyArmedPreset && dragyArmedPreset !== 'r80_120') {
          dragyDetailRunning = true;
          dragyDetailStart = now;
        }
      }
    } else if (airspeedKmh > 1 || e.throttle_input <= 0.5) {
      s.armedThisStop = false;
    }

    // Rolling 80-120 km/h preset: independent of the from-a-stop runs above.
    if (dragyArmedPreset === 'r80_120') {
      if (!dragyRollingWatch) dragyRollingWatch = { state: 'waiting' };
      if (dragyRollingWatch.state === 'waiting' && airspeedKmh >= 80 && e.throttle_input > 0) {
        dragyRollingWatch.state = 'running';
        dragyRollingWatch.startTime = now;
        dragyDetailRunning = true;
        dragyDetailStart = now;
      } else if (dragyRollingWatch.state === 'running' && airspeedKmh >= 120) {
        var rollSeconds = (now - dragyRollingWatch.startTime) / 1000;
        dragyAddResult('80-120 ' + t('unitKmh') + ': ' + rollSeconds.toFixed(2) + ' ' + t('unitSec'), true, 'speed');
        dragyFinishDetail(rollSeconds);
        // Finished, but the car may well still be doing >80 km/h with the
        // throttle down -- stay in 'done' until the driver actually backs
        // off, instead of instantly re-arming and overwriting the result
        // every frame while still accelerating.
        dragyRollingWatch = { state: 'done' };
      } else if (dragyRollingWatch.state !== 'waiting' && airspeedKmh < 70 && e.throttle_input < 0.3) {
        dragyRollingWatch = { state: 'waiting' }; // genuinely backed off, ready for a new attempt
        dragyDetailRunning = false;
      }
    }

    dragyRenderDetailTimer(now);
    if (s.startTime === undefined) return; // no from-a-stop run armed yet this session

    if (airspeedKmh >= 100 && s.pending.s100) {
      s.pending.s100 = false;
      s.splitTime = now;
      var t100 = (now - s.startTime) / 1000;
      dragyAddResult('0-100 ' + t('unitKmh') + ': ' + t100.toFixed(2) + ' ' + t('unitSec'), true, 'speed');
      if (dragyArmedPreset === 'z100') dragyFinishDetail(t100);
    }
    if (airspeedKmh >= 200 && s.pending.s200) {
      s.pending.s200 = false;
      var split200 = (now - s.splitTime) / 1000;
      s.splitTime = now;
      var t200 = (now - s.startTime) / 1000;
      dragyAddResult('0-200 ' + t('unitKmh') + ': ' + t200.toFixed(2) + ' ' + t('unitSec'), true, 'speed');
      dragyAddResult('100-200 ' + t('unitKmh') + ': ' + split200.toFixed(2) + ' ' + t('unitSec'), false, 'speed');
      if (dragyArmedPreset === 'z200') dragyFinishDetail(t200);
    }
    if (airspeedKmh >= 300 && s.pending.s300) {
      s.pending.s300 = false;
      dragyAddResult('0-300 ' + t('unitKmh') + ': ' + ((now - s.startTime) / 1000).toFixed(2) + ' ' + t('unitSec'), false, 'speed');
    }
    if (airspeedKmh >= 400 && s.pending.s400) {
      s.pending.s400 = false;
      dragyAddResult('0-400 ' + t('unitKmh') + ': ' + ((now - s.startTime) / 1000).toFixed(2) + ' ' + t('unitSec'), false, 'speed');
    }

    var dist = e.odometer - s.odometerStart;
    if (dist >= 200 && s.pending.m200) {
      s.pending.m200 = false;
      dragyAddResult('0-200 ' + t('unitM') + ': ' + ((now - s.startTimeDist) / 1000).toFixed(2) + ' ' + t('unitSec'), false, 'dist');
    }
    if (dist >= 400 && s.pending.m400) {
      s.pending.m400 = false;
      var tQuarter = (now - s.startTimeDist) / 1000;
      dragyAddResult('0-400 ' + t('unitM') + ' (≈ ' + t('quarterMile') + '): ' + tQuarter.toFixed(2) + ' ' + t('unitSec'), true, 'dist');
      if (dragyArmedPreset === 'quarter') dragyFinishDetail(tQuarter);
    }
    if (dist >= 800 && s.pending.m800) {
      s.pending.m800 = false;
      dragyAddResult('0-800 ' + t('unitM') + ': ' + ((now - s.startTimeDist) / 1000).toFixed(2) + ' ' + t('unitSec'), false, 'dist');
    }
    if (dist >= 1000 && s.pending.m1000) {
      s.pending.m1000 = false;
      dragyAddResult('0-1000 ' + t('unitM') + ': ' + ((now - s.startTimeDist) / 1000).toFixed(2) + ' ' + t('unitSec'), false, 'dist');
    }
    if (dist >= 1500 && s.pending.m1500) {
      s.pending.m1500 = false;
      dragyAddResult('0-1500 ' + t('unitM') + ': ' + ((now - s.startTimeDist) / 1000).toFixed(2) + ' ' + t('unitSec'), false, 'dist');
    }
  }

  // Real max power/torque, broadcast by the game whenever the current
  // vehicle's engine curve is (re)computed -- exact same event the user's
  // own Dragy mod listens to.
  function onTorqueCurve(data) {
    if (!data || !data.curves) return;
    var maxPower = 0, maxTorque = 0;
    for (var key in data.curves) {
      var curve = data.curves[key];
      if (!curve || !curve.power || !curve.torque) continue;
      var mp = Math.max.apply(Math, curve.power);
      var mt = Math.max.apply(Math, curve.torque);
      if (mp > maxPower) maxPower = mp;
      if (mt > maxTorque) maxTorque = mt;
    }

    var powerText, torqueText;
    try {
      powerText = window.UiUnits.power(maxPower).val.toFixed(0) + ' ' + window.UiUnits.power(maxPower).unit;
      torqueText = window.UiUnits.torque(maxTorque).val.toFixed(0) + ' ' + window.UiUnits.torque(maxTorque).unit;
    } catch (e) {
      // Fallback if UiUnits isn't reachable from this context: raw BeamNG
      // engine units are watts and newton-metres.
      powerText = Math.round(maxPower / 1000) + ' ' + t('unitKw');
      torqueText = Math.round(maxTorque) + ' ' + t('unitNm');
    }

    var powerEl = el('[data-bp="car-power"]');
    var torqueEl = el('[data-bp="car-torque"]');
    if (powerEl) powerEl.textContent = powerText;
    if (torqueEl) torqueEl.textContent = torqueText;
  }

  // ------------------------------------------------------------------
  // i18n: translation dictionary + apply/persist helpers.
  // ------------------------------------------------------------------

  var SUPPORTED_LANGS = ['ru', 'en', 'pl', 'de', 'cs', 'pt', 'fr', 'it'];
  var DATE_LOCALES = { ru: 'ru-RU', en: 'en-US', pl: 'pl-PL', de: 'de-DE', cs: 'cs-CZ', pt: 'pt-PT', fr: 'fr-FR', it: 'it-IT' };
  function dateLocale() { return DATE_LOCALES[currentLang] || 'en-US'; }
  var currentLang = 'en';

  var I18N = {
    appMusic: { ru: 'Музыка', en: 'Music', pl: 'Muzyka', de: 'Musik', cs: 'Hudba', pt: 'Música', fr: 'Musique', it: 'Musica' },
    appCalculator: { ru: 'Калькулятор', en: 'Calculator', pl: 'Kalkulator', de: 'Rechner', cs: 'Kalkulačka', pt: 'Calculadora', fr: 'Calculatrice', it: 'Calcolatrice' },
    appClock: { ru: 'Часы', en: 'Clock', pl: 'Zegar', de: 'Uhr', cs: 'Hodiny', pt: 'Relógio', fr: 'Horloge', it: 'Orologio' },
    appSettings: { ru: 'Настройки', en: 'Settings', pl: 'Ustawienia', de: 'Einstellungen', cs: 'Nastavení', pt: 'Definições', fr: 'Réglages', it: 'Impostazioni' },
    appMaps: { ru: 'Карты', en: 'Maps', pl: 'Mapy', de: 'Karten', cs: 'Mapy', pt: 'Mapas', fr: 'Plans', it: 'Mappe' },
    notifShowLess: { ru: 'Свернуть', en: 'Show less', pl: 'Pokaż mniej', de: 'Weniger anzeigen', cs: 'Zobrazit méně', pt: 'Mostrar menos', fr: 'Afficher moins', it: 'Mostra meno' },
    notifNow: { ru: 'сейчас', en: 'now', pl: 'teraz', de: 'Jetzt', cs: 'nyní', pt: 'agora', fr: 'maintenant', it: 'ora' },
    notifEngineOn: { ru: 'Машина заведена', en: 'Car started', pl: 'Samochód uruchomiony', de: 'Auto gestartet', cs: 'Auto nastartováno', pt: 'Carro ligado', fr: 'Voiture démarrée', it: 'Auto avviata' },
    appCar: { ru: 'Моя машина', en: 'My Car', pl: 'Mój samochód', de: 'Mein Auto', cs: 'Moje auto', pt: 'Meu carro', fr: 'Ma voiture', it: 'La mia auto' },
    appNotes: { ru: 'Заметки', en: 'Notes', pl: 'Notatki', de: 'Notizen', cs: 'Poznámky', pt: 'Notas', fr: 'Notes', it: 'Note' },
    appMessages: { ru: 'Сообщения', en: 'Messages', pl: 'Wiadomości', de: 'Nachrichten', cs: 'Zprávy', pt: 'Mensagens', fr: 'Messages', it: 'Messaggi' },
    appSafari: { ru: 'Safari', en: 'Safari', pl: 'Safari', de: 'Safari', cs: 'Safari', pt: 'Safari', fr: 'Safari', it: 'Safari' },
        appAbout: { ru: 'О BeamiPhone', en: 'About BeamiPhone', pl: 'O BeamiPhone', de: 'Über BeamiPhone', cs: 'O BeamiPhone', pt: 'Sobre o BeamiPhone', fr: 'À propos de BeamiPhone', it: 'Informazioni su BeamiPhone' },
    appPhone: { ru: 'Телефон', en: 'Phone', pl: 'Telefon', de: 'Telefon', cs: 'Telefon', pt: 'Telefone', fr: 'Téléphone', it: 'Telefono' },
    musicHeader: { ru: 'Музыка', en: 'Music', pl: 'Muzyka', de: 'Musik', cs: 'Hudba', pt: 'Música', fr: 'Musique', it: 'Musica' },
    musicRecent: { ru: 'Недавно добавленные', en: 'Recently added', pl: 'Ostatnio dodane', de: 'Kürzlich hinzugefügt', cs: 'Nedávno přidané', pt: 'Adicionadas recentemente', fr: 'Ajoutés récemment', it: 'Aggiunti di recente' },
    musicRefresh: { ru: '🔄 Обновить список', en: '🔄 Refresh list', pl: '🔄 Odśwież listę', de: '🔄 Liste aktualisieren', cs: '🔄 Obnovit seznam', pt: '🔄 Atualizar lista', fr: '🔄 Actualiser la liste', it: '🔄 Aggiorna elenco' },
    settingsWallpaper: { ru: 'Обои', en: 'Wallpaper', pl: 'Tapeta', de: 'Hintergrundbild', cs: 'Tapeta', pt: 'Papel de parede', fr: 'Fond d\u2019écran', it: 'Sfondo' },
    settingsTheme: { ru: 'Тема приложений', en: 'App theme', pl: 'Motyw aplikacji', de: 'App-Design', cs: 'Motiv aplikací', pt: 'Tema das apps', fr: 'Thème des applis', it: 'Tema delle app' },
    settingsThemeDark: { ru: 'Тёмная тема', en: 'Dark theme', pl: 'Ciemny motyw', de: 'Dunkles Design', cs: 'Tmavý motiv', pt: 'Tema escuro', fr: 'Thème sombre', it: 'Tema scuro' },
    settingsLanguage: { ru: 'Язык', en: 'Language', pl: 'Język', de: 'Sprache', cs: 'Jazyk', pt: 'Idioma', fr: 'Langue', it: 'Lingua' },
    settingsAbout: { ru: 'Об этом BeamiPhone', en: 'About BeamiPhone', pl: 'O BeamiPhone', de: 'Über BeamiPhone', cs: 'O aplikaci BeamiPhone', pt: 'Sobre o BeamiPhone', fr: 'À propos de BeamiPhone', it: 'Informazioni su BeamiPhone' },
    aboutVersion: { ru: 'Версия', en: 'Version', pl: 'Wersja', de: 'Version', cs: 'Verze', pt: 'Versão', fr: 'Version', it: 'Versione' },
    aboutModel: { ru: 'Модель', en: 'Model', pl: 'Model', de: 'Modell', cs: 'Model', pt: 'Modelo', fr: 'Modèle', it: 'Modello' },
    aboutKey: { ru: 'Клавиша', en: 'Key', pl: 'Klawisz', de: 'Taste', cs: 'Klávesa', pt: 'Tecla', fr: 'Touche', it: 'Tasto' },
        aboutSubtitle: {
      ru: 'Смартфон-интерфейс для BeamNG.drive',
      en: 'A smartphone-style companion for BeamNG.drive',
      pl: 'Interfejs smartfona do BeamNG.drive',
      de: 'Smartphone-Oberfläche für BeamNG.drive',
      cs: 'Rozhraní smartphonu pro BeamNG.drive',
      pt: 'Interface de smartphone para BeamNG.drive',
      fr: 'Interface de smartphone pour BeamNG.drive',
      it: 'Interfaccia smartphone per BeamNG.drive'
    },
    aboutFeatures: {
      ru: 'Возможности',
      en: 'Features',
      pl: 'Funkcje',
      de: 'Funktionen',
      cs: 'Funkce',
      pt: 'Recursos',
      fr: 'Fonctionnalités',
      it: 'Funzioni'
    },
    aboutMusicText: {
      ru: 'Локальная музыка, обложки и управление воспроизведением',
      en: 'Local music, cover art and playback controls',
      pl: 'Muzyka lokalna, okładki i sterowanie odtwarzaniem',
      de: 'Lokale Musik, Cover und Wiedergabesteuerung',
      cs: 'Místní hudba, obaly a ovládání přehrávání',
      pt: 'Música local, capas e controlos de reprodução',
      fr: 'Musique locale, pochettes et commandes de lecture',
      it: 'Musica locale, copertine e controlli di riproduzione'
    },
    aboutCarText: {
      ru: 'Состояние автомобиля и быстрые команды управления',
      en: 'Vehicle status and quick control commands',
      pl: 'Stan pojazdu i szybkie polecenia sterowania',
      de: 'Fahrzeugstatus und schnelle Steuerbefehle',
      cs: 'Stav vozidla a rychlé ovládací příkazy',
      pt: 'Estado do veículo e comandos rápidos',
      fr: 'État du véhicule et commandes rapides',
      it: 'Stato del veicolo e comandi rapidi'
    },
    aboutMapsText: {
      ru: 'Карта мира, скорость, курс и маршрут',
      en: 'World map, speed, heading and route',
      pl: 'Mapa świata, prędkość, kierunek i trasa',
      de: 'Weltkarte, Geschwindigkeit, Richtung und Route',
      cs: 'Mapa světa, rychlost, směr a trasa',
      pt: 'Mapa do mundo, velocidade, direção e rota',
      fr: 'Carte du monde, vitesse, cap et itinéraire',
      it: 'Mappa del mondo, velocità e percorso'
    },
    dragyClear: { ru: 'Очистить', en: 'Clear', pl: 'Wyczyść', de: 'Löschen', cs: 'Vymazat', pt: 'Limpar', fr: 'Effacer', it: 'Cancella' },
    dragyReset: { ru: 'Сбросить', en: 'Reset', pl: 'Resetuj', de: 'Zurücksetzen', cs: 'Resetovat', pt: 'Reiniciar', fr: 'Réinitialiser', it: 'Reimposta' },
    dragyResult: { ru: 'Результат:', en: 'Result:', pl: 'Wynik:', de: 'Ergebnis:', cs: 'Výsledek:', pt: 'Resultado:', fr: 'Résultat :', it: 'Risultato:' },
    dragySeconds: { ru: 'секунд', en: 'seconds', pl: 'sekund', de: 'Sekunden', cs: 'sekund', pt: 'segundos', fr: 'secondes', it: 'secondi' },
    carEngine: { ru: 'Зажигание / Завести', en: 'Ignition / Start', pl: 'Zapłon / Start', de: 'Zündung / Starten', cs: 'Zapalování / Start', pt: 'Ignição / Ligar', fr: 'Contact / Démarrer', it: 'Accensione / Avvia' },
    carEngineStop: { ru: 'Заглушить', en: 'Stop engine', pl: 'Zgaś silnik', de: 'Motor abstellen', cs: 'Vypnout motor', pt: 'Desligar motor', fr: 'Couper le moteur', it: 'Spegni motore' },
    carLights: { ru: 'Свет', en: 'Lights', pl: 'Światła', de: 'Licht', cs: 'Světla', pt: 'Luzes', fr: 'Phares', it: 'Luci' },
    carHazard: { ru: 'Аварийка', en: 'Hazards', pl: 'Awaryjne', de: 'Warnblinker', cs: 'Výstražky', pt: 'Pisca-alerta', fr: 'Feux de détresse', it: 'Frecce di emergenza' },
    mapsLevel: { ru: 'Карта', en: 'Map', pl: 'Mapa', de: 'Karte', cs: 'Mapa', pt: 'Mapa', fr: 'Carte', it: 'Mappa' },
    mapsSpeed: { ru: 'Скорость', en: 'Speed', pl: 'Prędkość', de: 'Geschwindigkeit', cs: 'Rychlost', pt: 'Velocidade', fr: 'Vitesse', it: 'Velocità' },
    mapsCoords: { ru: 'Координаты', en: 'Coordinates', pl: 'Współrzędne', de: 'Koordinaten', cs: 'Souřadnice', pt: 'Coordenadas', fr: 'Coordonnées', it: 'Coordinate' },
    mapsHeading: { ru: 'Курс', en: 'Heading', pl: 'Kurs', de: 'Kurs', cs: 'Kurz', pt: 'Rumo', fr: 'Cap', it: 'Rotta' },
    btnStart: { ru: "Старт", en: "Start", pl: "Start", de: "Start", cs: "Start", pt: "Iniciar", fr: "Démarrer", it: "Avvia" },
    btnPause: { ru: "Пауза", en: "Pause", pl: "Pauza", de: "Pause", cs: "Pauza", pt: "Pausar", fr: "Pause", it: "Pausa" },
    btnReset: { ru: "Сброс", en: "Reset", pl: "Resetuj", de: "Zurücksetzen", cs: "Resetovat", pt: "Repor", fr: "Réinitialiser", it: "Azzera" },
    clockTabTime: { ru: "Время", en: "Time", pl: "Czas", de: "Zeit", cs: "Čas", pt: "Hora", fr: "Heure", it: "Ora" },
    clockTabStopwatch: { ru: "Секундомер", en: "Stopwatch", pl: "Stoper", de: "Stoppuhr", cs: "Stopky", pt: "Cronómetro", fr: "Chronomètre", it: "Cronometro" },
    clockTabTimer: { ru: "Таймер", en: "Timer", pl: "Minutnik", de: "Timer", cs: "Časovač", pt: "Temporizador", fr: "Minuteur", it: "Timer" },
    clockRealTime: { ru: "Реальное время (ваш ПК)", en: "Real time (your PC)", pl: "Czas rzeczywisty (twój komputer)", de: "Echtzeit (dein PC)", cs: "Skutečný čas (váš počítač)", pt: "Hora real (o teu PC)", fr: "Heure réelle (votre PC)", it: "Ora reale (il tuo PC)" },
    clockGameTime: { ru: "Время в BeamNG", en: "Time in BeamNG", pl: "Czas w BeamNG", de: "Zeit in BeamNG", cs: "Čas v BeamNG", pt: "Hora no BeamNG", fr: "Heure dans BeamNG", it: "Ora in BeamNG" },
    clockNoData: { ru: "Нет данных", en: "No data", pl: "Brak danych", de: "Keine Daten", cs: "Žádná data", pt: "Sem dados", fr: "Aucune donnée", it: "Nessun dato" },
    clockDay: { ru: "День", en: "Day", pl: "Dzień", de: "Tag", cs: "Den", pt: "Dia", fr: "Jour", it: "Giorno" },
    clockNight: { ru: "Ночь", en: "Night", pl: "Noc", de: "Nacht", cs: "Noc", pt: "Noite", fr: "Nuit", it: "Notte" },
    clockUnavailable: { ru: "Недоступно в этой версии BeamNG", en: "Unavailable in this BeamNG version", pl: "Niedostępne w tej wersji BeamNG", de: "In dieser BeamNG-Version nicht verfügbar", cs: "Není dostupné v této verzi BeamNG", pt: "Indisponível nesta versão do BeamNG", fr: "Indisponible dans cette version de BeamNG", it: "Non disponibile in questa versione di BeamNG" },
    timerAdd1: { ru: "+1 мин", en: "+1 min", pl: "+1 min", de: "+1 Min.", cs: "+1 min", pt: "+1 min", fr: "+1 min", it: "+1 min" },
    timerAdd5: { ru: "+5 мин", en: "+5 min", pl: "+5 min", de: "+5 Min.", cs: "+5 min", pt: "+5 min", fr: "+5 min", it: "+5 min" },
    calcError: { ru: "Ошибка", en: "Error", pl: "Błąd", de: "Fehler", cs: "Chyba", pt: "Erro", fr: "Erreur", it: "Errore" },
    musicEmptyTitle: { ru: "Музыки пока нет", en: "No music yet", pl: "Brak muzyki", de: "Noch keine Musik", cs: "Zatím žádná hudba", pt: "Ainda sem música", fr: "Pas encore de musique", it: "Ancora nessuna musica" },
    musicEmptyText: { ru: "Добавьте .mp3 / .ogg / .wav файлы в папку:", en: "Add .mp3 / .ogg / .wav files to the folder:", pl: "Dodaj pliki .mp3 / .ogg / .wav do folderu:", de: "Füge .mp3-/.ogg-/.wav-Dateien in diesen Ordner ein:", cs: "Přidejte soubory .mp3 / .ogg / .wav do složky:", pt: "Adiciona ficheiros .mp3 / .ogg / .wav à pasta:", fr: "Ajoutez des fichiers .mp3 / .ogg / .wav dans le dossier :", it: "Aggiungi file .mp3 / .ogg / .wav nella cartella:" },
    musicNoReply: { ru: "Нет ответа от игры", en: "No response from the game", pl: "Brak odpowiedzi od gry", de: "Keine Antwort vom Spiel", cs: "Hra neodpovídá", pt: "Sem resposta do jogo", fr: "Aucune réponse du jeu", it: "Nessuna risposta dal gioco" },
    musicNoReplyText: { ru: "Lua-часть мода не ответила. Похоже, расширение BeamiPhone не загрузилось. Проверьте, что мод включён, и посмотрите консоль (~ или F11) на ошибки \"beamiphone\".", en: "The mod's Lua part did not respond. The BeamiPhone extension probably failed to load. Make sure the mod is enabled and check the console (~ or F11) for \"beamiphone\" errors.", pl: "Część Lua moda nie odpowiedziała. Wygląda na to, że rozszerzenie BeamiPhone się nie załadowało. Upewnij się, że mod jest włączony, i sprawdź konsolę (~ lub F11) pod kątem błędów „beamiphone”.", de: "Der Lua-Teil des Mods hat nicht geantwortet. Wahrscheinlich wurde die BeamiPhone-Erweiterung nicht geladen. Prüfe, ob der Mod aktiviert ist, und sieh in der Konsole (~ oder F11) nach „beamiphone“-Fehlern.", cs: "Lua část modu neodpověděla. Rozšíření BeamiPhone se pravděpodobně nenačetlo. Zkontrolujte, že je mod zapnutý, a v konzoli (~ nebo F11) hledejte chyby „beamiphone“.", pt: "A parte Lua do mod não respondeu. Parece que a extensão BeamiPhone não carregou. Verifica se o mod está ativado e consulta a consola (~ ou F11) por erros de \"beamiphone\".", fr: "La partie Lua du mod n'a pas répondu. L'extension BeamiPhone ne s'est probablement pas chargée. Vérifiez que le mod est activé et consultez la console (~ ou F11) pour des erreurs « beamiphone ».", it: "La parte Lua della mod non ha risposto. Probabilmente l'estensione BeamiPhone non si è caricata. Verifica che la mod sia attiva e controlla la console (~ o F11) per errori \"beamiphone\"." },
    musicReadFail: { ru: "Не удалось прочитать папку", en: "Could not read the folder", pl: "Nie udało się odczytać folderu", de: "Ordner konnte nicht gelesen werden", cs: "Složku se nepodařilo přečíst", pt: "Não foi possível ler a pasta", fr: "Impossible de lire le dossier", it: "Impossibile leggere la cartella" },
    musicReadFailText: { ru: "Проверьте путь к папке music/ внутри мода:", en: "Check the path to the music/ folder inside the mod:", pl: "Sprawdź ścieżkę do folderu music/ w modzie:", de: "Prüfe den Pfad zum Ordner music/ im Mod:", cs: "Zkontrolujte cestu ke složce music/ v modu:", pt: "Verifica o caminho da pasta music/ dentro do mod:", fr: "Vérifiez le chemin du dossier music/ dans le mod :", it: "Controlla il percorso della cartella music/ nella mod:" },
    mapsNote: { ru: "Точная спутниковая карта недоступна через открытые API BeamNG — здесь честные координаты и курс вашей машины в реальном времени.", en: "Exact satellite maps aren't available through BeamNG's public APIs — here are your car's real coordinates and heading in real time.", pl: "Dokładna mapa satelitarna nie jest dostępna przez publiczne API BeamNG — tutaj widać rzeczywiste współrzędne i kurs twojego auta na żywo.", de: "Eine genaue Satellitenkarte ist über die öffentlichen BeamNG-APIs nicht verfügbar – hier siehst du die echten Koordinaten und den Kurs deines Autos in Echtzeit.", cs: "Přesná satelitní mapa není přes veřejná API BeamNG dostupná – zde vidíte skutečné souřadnice a kurz svého auta v reálném čase.", pt: "Um mapa de satélite exato não está disponível através das APIs públicas do BeamNG — aqui estão as coordenadas e o rumo reais do teu carro em tempo real.", fr: "Une carte satellite précise n'est pas disponible via les API publiques de BeamNG — voici les coordonnées et le cap réels de votre voiture en temps réel.", it: "Una mappa satellitare precisa non è disponibile tramite le API pubbliche di BeamNG — qui vedi le coordinate e la rotta reali della tua auto in tempo reale." },
    mapsNoCar: { ru: "Нет активного автомобиля игрока — сядьте за руль, чтобы увидеть телеметрию.", en: "No active player vehicle — get behind the wheel to see telemetry.", pl: "Brak aktywnego pojazdu gracza — wsiądź do auta, aby zobaczyć telemetrię.", de: "Kein aktives Spielerfahrzeug – steig ein, um die Telemetrie zu sehen.", cs: "Žádné aktivní vozidlo hráče – nasedněte do auta, abyste viděli telemetrii.", pt: "Sem veículo ativo do jogador — entra num carro para ver a telemetria.", fr: "Aucun véhicule actif du joueur — montez dans une voiture pour voir la télémétrie.", it: "Nessun veicolo attivo del giocatore — sali in auto per vedere la telemetria." },
    carNoData: { ru: "Нет данных об автомобиле", en: "No vehicle data", pl: "Brak danych o pojeździe", de: "Keine Fahrzeugdaten", cs: "Žádná data o vozidle", pt: "Sem dados do veículo", fr: "Aucune donnée du véhicule", it: "Nessun dato sul veicolo" },
    carOutside: { ru: "Вы вне машины — управление последней машиной доступно", en: "You're out of the car — you can still control your last car", pl: "Jesteś poza autem — nadal możesz sterować ostatnim samochodem", de: "Du bist nicht im Auto – du kannst das letzte Auto weiter steuern", cs: "Jste mimo auto – posledním autem můžete dál ovládat", pt: "Está fora do carro — ainda pode controlar o último carro", fr: "Vous êtes hors de la voiture — vous pouvez toujours contrôler la dernière", it: "Sei fuori dall'auto — puoi ancora controllare l'ultima auto" },
    carPower: { ru: "Мощность", en: "Power", pl: "Moc", de: "Leistung", cs: "Výkon", pt: "Potência", fr: "Puissance", it: "Potenza" },
    carTorque: { ru: "Крутящий момент", en: "Torque", pl: "Moment obrotowy", de: "Drehmoment", cs: "Točivý moment", pt: "Binário", fr: "Couple", it: "Coppia" },
    carNote: { ru: "Мощность/крутящий момент — реальная кривая двигателя текущей машины из самой игры. «Зажигание/Завести»: 1-е нажатие — зажигание, 2-е — стартер. Свет/аварийка — стандартные команды BeamNG (проверены), но на редких модифицированных авто может не сработать. Если что-то не срабатывает на конкретной машине — откройте консоль вашей машины и введите dump(electrics), чтобы увидеть точные названия её электрики.", en: "Power/torque come from the real engine curve of the current car, straight from the game. “Ignition / Start”: 1st press — ignition, 2nd — starter. Lights/hazards use standard BeamNG commands (verified), but may not work on rare modded cars. If something doesn't work on a specific car, open your car's console and enter dump(electrics) to see the exact names of its electrics.", pl: "Moc/moment obrotowy pochodzą z rzeczywistej krzywej silnika aktualnego auta, prosto z gry. „Zapłon / Start”: 1. naciśnięcie — zapłon, 2. — rozrusznik. Światła/awaryjne korzystają ze standardowych poleceń BeamNG (sprawdzonych), ale w rzadkich modyfikowanych autach mogą nie działać. Jeśli coś nie działa w konkretnym aucie, otwórz konsolę pojazdu i wpisz dump(electrics), aby zobaczyć dokładne nazwy jego elektryki.", de: "Leistung/Drehmoment stammen aus der echten Motorkurve des aktuellen Autos, direkt aus dem Spiel. „Zündung / Starten“: 1. Druck – Zündung, 2. – Anlasser. Licht/Warnblinker nutzen Standardbefehle von BeamNG (geprüft), funktionieren aber bei seltenen modifizierten Autos eventuell nicht. Wenn bei einem bestimmten Auto etwas nicht klappt, öffne die Fahrzeugkonsole und gib dump(electrics) ein, um die genauen Namen der Elektrik zu sehen.", cs: "Výkon/točivý moment pocházejí ze skutečné křivky motoru aktuálního auta přímo ze hry. „Zapalování / Start“: 1. stisk – zapalování, 2. – startér. Světla/výstražná světla používají standardní příkazy BeamNG (ověřené), ale u vzácných modifikovaných aut nemusí fungovat. Pokud něco u konkrétního auta nefunguje, otevřete konzoli vozidla a zadejte dump(electrics), abyste viděli přesné názvy jeho elektriky.", pt: "A potência/binário vêm da curva real do motor do carro atual, diretamente do jogo. «Ignição / Ligar»: 1.º toque — ignição, 2.º — motor de arranque. As luzes/pisca-alerta usam comandos padrão do BeamNG (verificados), mas podem não funcionar em carros modificados raros. Se algo não funcionar num carro específico, abre a consola do veículo e escreve dump(electrics) para ver os nomes exatos da sua eletrónica.", fr: "La puissance/le couple proviennent de la vraie courbe moteur de la voiture actuelle, directement du jeu. « Contact / Démarrer » : 1re pression — contact, 2e — démarreur. Les phares/feux de détresse utilisent les commandes standard de BeamNG (vérifiées), mais peuvent ne pas fonctionner sur de rares voitures modifiées. Si quelque chose ne marche pas sur une voiture précise, ouvrez la console du véhicule et saisissez dump(electrics) pour voir les noms exacts de son électrique.", it: "Potenza/coppia provengono dalla curva motore reale dell'auto attuale, direttamente dal gioco. «Accensione / Avvia»: 1ª pressione — accensione, 2ª — motorino. Luci/frecce di emergenza usano i comandi standard di BeamNG (verificati), ma su rare auto modificate potrebbero non funzionare. Se qualcosa non va su un'auto specifica, apri la console del veicolo e digita dump(electrics) per vedere i nomi esatti della sua elettrica." },
    aboutText: { ru: "Сделано специально для BeamNG.drive. Реальный аудиоплеер, реальная телеметрия автомобиля, ноль фейковых данных.", en: "Made for BeamNG.drive. Real audio player, real car telemetry, zero fake data.", pl: "Stworzone specjalnie dla BeamNG.drive. Prawdziwy odtwarzacz audio, prawdziwa telemetria auta, zero fałszywych danych.", de: "Speziell für BeamNG.drive gemacht. Echter Audioplayer, echte Fahrzeugtelemetrie, keine Fake-Daten.", cs: "Vytvořeno speciálně pro BeamNG.drive. Skutečný audio přehrávač, skutečná telemetrie auta, žádná falešná data.", pt: "Feito de propósito para o BeamNG.drive. Leitor de áudio real, telemetria real do carro, zero dados falsos.", fr: "Conçu spécialement pour BeamNG.drive. Vrai lecteur audio, vraie télémétrie de la voiture, zéro fausse donnée.", it: "Creato appositamente per BeamNG.drive. Lettore audio reale, telemetria reale dell'auto, zero dati falsi." },
    dragyEmpty: { ru: "Разгонитесь с места (отпустите тормоз с зажатым газом), чтобы увидеть реальные замеры", en: "Launch from a standstill (release the brake with the throttle held down) to see real measurements", pl: "Ruszaj z miejsca (puść hamulec przy wciśniętym gazie), aby zobaczyć prawdziwe pomiary", de: "Fahre aus dem Stand los (Bremse lösen bei durchgedrücktem Gas), um echte Messwerte zu sehen", cs: "Rozjeďte se z místa (uvolněte brzdu při sešlápnutém plynu), abyste viděli skutečná měření", pt: "Arranca da imobilidade (solta o travão com o acelerador pressionado) para ver medições reais", fr: "Démarrez à l'arrêt (relâchez le frein en gardant l'accélérateur enfoncé) pour voir de vraies mesures", it: "Parti da fermo (rilascia il freno tenendo premuto l'acceleratore) per vedere misurazioni reali" },
    dragyReady: { ru: "Остановитесь и отпустите тормоз с зажатым газом", en: "Come to a stop, then release the brake with the throttle held down", pl: "Zatrzymaj się, a potem puść hamulec przy wciśniętym gazie", de: "Komm zum Stehen und löse die Bremse bei durchgedrücktem Gas", cs: "Zastavte a poté uvolněte brzdu při sešlápnutém plynu", pt: "Pára e depois solta o travão com o acelerador pressionado", fr: "Arrêtez-vous, puis relâchez le frein en gardant l'accélérateur enfoncé", it: "Fermati, poi rilascia il freno tenendo premuto l'acceleratore" },
    dragyRolling: { ru: "Разгонитесь до 80 км/ч и продолжайте газовать", en: "Accelerate to 80 km/h and keep the throttle down", pl: "Rozpędź się do 80 km/h i trzymaj gaz", de: "Beschleunige auf 80 km/h und bleib auf dem Gas", cs: "Zrychlete na 80 km/h a držte plyn", pt: "Acelera até 80 km/h e mantém o acelerador pressionado", fr: "Accélérez jusqu'à 80 km/h et gardez l'accélérateur enfoncé", it: "Accelera fino a 80 km/h e continua ad accelerare" },
    unitKmh: { ru: "км/ч", en: "km/h", pl: "km/h", de: "km/h", cs: "km/h", pt: "km/h", fr: "km/h", it: "km/h" },
    unitSec: { ru: "с", en: "s", pl: "s", de: "s", cs: "s", pt: "s", fr: "s", it: "s" },
    unitM: { ru: "м", en: "m", pl: "m", de: "m", cs: "m", pt: "m", fr: "m", it: "m" },
    unitKw: { ru: "кВт", en: "kW", pl: "kW", de: "kW", cs: "kW", pt: "kW", fr: "kW", it: "kW" },
    unitNm: { ru: "Нм", en: "Nm", pl: "Nm", de: "Nm", cs: "Nm", pt: "Nm", fr: "Nm", it: "Nm" },
    quarterMile: { ru: "1/4 мили", en: "1/4 mile", pl: "1/4 mili", de: "1/4 Meile", cs: "1/4 míle", pt: "1/4 de milha", fr: "1/4 de mile", it: "1/4 di miglio" },
    attempt: { ru: "Испытание", en: "Attempt", pl: "Próba", de: "Versuch", cs: "Pokus", pt: "Tentativa", fr: "Essai", it: "Tentativo" },
    appGeneric: { ru: "Приложение", en: "App", pl: "Aplikacja", de: "App", cs: "Aplikace", pt: "Aplicação", fr: "Application", it: "App" },
    comingSoon: { ru: "Скоро появится", en: "Coming soon", pl: "Wkrótce", de: "Demnächst", cs: "Již brzy", pt: "Em breve", fr: "Bientôt disponible", it: "In arrivo" },
    carTrunk: { ru: "Багажник", en: "Trunk", pl: "Bagażnik", de: "Kofferraum", cs: "Kufr", pt: "Porta-bagagens", fr: "Coffre", it: "Bagagliaio" },
    carTrunkNone: { ru: "У этой машины нет багажника, который можно открыть", en: "This car has no trunk that can be opened", pl: "Ten samochód nie ma bagażnika, który można otworzyć", de: "Dieses Auto hat keinen Kofferraum, der sich öffnen lässt", cs: "Toto auto nemá kufr, který lze otevřít", pt: "Este carro não tem porta-bagagens que possa ser aberto", fr: "Cette voiture n'a pas de coffre ouvrable", it: "Questa auto non ha un bagagliaio apribile" },
    mapsLimit: { ru: "Ограничение скорости", en: "Speed limit", pl: "Ograniczenie prędkości", de: "Tempolimit", cs: "Rychlostní limit", pt: "Limite de velocidade", fr: "Limitation de vitesse", it: "Limite di velocità" },
    musicFolder: { ru: "Папка", en: "Folder", pl: "Folder", de: "Ordner", cs: "Složka", pt: "Pasta", fr: "Dossier", it: "Cartella" },
    appWeather: { ru: "Погода", en: "Weather", pl: "Pogoda", de: "Wetter", cs: "Počasí", pt: "Meteorologia", fr: "Météo", it: "Meteo" },
    wTimeTitle: { ru: "Время суток", en: "Time of day", pl: "Pora dnia", de: "Tageszeit", cs: "Denní doba", pt: "Hora do dia", fr: "Heure du jour", it: "Ora del giorno" },
    wFlow: { ru: "Ход времени", en: "Time flow", pl: "Upływ czasu", de: "Zeitablauf", cs: "Plynutí času", pt: "Passagem do tempo", fr: "Écoulement du temps", it: "Scorrere del tempo" },
    wPresets: { ru: "Пресеты", en: "Presets", pl: "Presety", de: "Voreinstellungen", cs: "Předvolby", pt: "Predefinições", fr: "Préréglages", it: "Preset" },
    wClear: { ru: "Ясно", en: "Clear", pl: "Pogodnie", de: "Klar", cs: "Jasno", pt: "Limpo", fr: "Dégagé", it: "Sereno" },
    wCloudy: { ru: "Облачно", en: "Cloudy", pl: "Pochmurno", de: "Bewölkt", cs: "Zataženo", pt: "Nublado", fr: "Nuageux", it: "Nuvoloso" },
    wRain: { ru: "Дождь", en: "Rain", pl: "Deszcz", de: "Regen", cs: "Déšť", pt: "Chuva", fr: "Pluie", it: "Pioggia" },
    wFog: { ru: "Туман", en: "Fog", pl: "Mgła", de: "Nebel", cs: "Mlha", pt: "Nevoeiro", fr: "Brouillard", it: "Nebbia" },
    wClouds: { ru: "Облака", en: "Clouds", pl: "Chmury", de: "Wolken", cs: "Mraky", pt: "Nuvens", fr: "Nuages", it: "Nuvole" },
    wWind: { ru: "Ветер", en: "Wind", pl: "Wiatr", de: "Wind", cs: "Vítr", pt: "Vento", fr: "Vent", it: "Vento" },
    unitKm: { ru: "км", en: "km", pl: "km", de: "km", cs: "km", pt: "km", fr: "km", it: "km" },
    mapsRoute: { ru: "Маршрут", en: "Route", pl: "Trasa", de: "Route", cs: "Trasa", pt: "Rota", fr: "Itinéraire", it: "Percorso" },
    mapsLoading: { ru: "Загрузка карты…", en: "Loading map…", pl: "Ładowanie mapy…", de: "Karte wird geladen…", cs: "Načítání mapy…", pt: "A carregar o mapa…", fr: "Chargement de la carte…", it: "Caricamento mappa…" },
    wNow: { ru: "Сейчас", en: "Now", pl: "Teraz", de: "Jetzt", cs: "Nyní", pt: "Agora", fr: "Maintenant", it: "Adesso" },
    musicRefreshShort: { ru: "Обновить", en: "Refresh", pl: "Odśwież", de: "Aktualisieren", cs: "Obnovit", pt: "Atualizar", fr: "Actualiser", it: "Aggiorna" },
    settingsSpatial: { ru: "Пространственный звук", en: "Spatial audio", pl: "Dźwięk przestrzenny", de: "Räumlicher Klang", cs: "Prostorový zvuk", pt: "Áudio espacial", fr: "Audio spatial", it: "Audio spaziale" },
    settingsSpatialHint: { ru: "Музыка играет из динамиков машины", en: "Music plays from the car speakers", pl: "Muzyka gra z głośników auta", de: "Musik kommt aus den Lautsprechern des Autos", cs: "Hudba hraje z reproduktorů auta", pt: "A música toca dos altifalantes do carro", fr: "La musique sort des haut-parleurs de la voiture", it: "La musica esce dagli altoparlanti dell'auto" },
    notesPlaceholder: { ru: "Напишите заметку…", en: "Write a note…" },
    settingsSmart: { ru: "Умные уведомления", en: "Smart notifications" },
    settingsSmartHint: { ru: "Превышение скорости и мало топлива", en: "Speeding and low fuel alerts" },
    notifSpeeding: { ru: "Превышение скорости: {s} км/ч при ограничении {l}", en: "Speeding: {s} km/h in a {l} zone" },
    notifLowFuel: { ru: "Топливо или заряд на исходе: {p}%", en: "Fuel or charge is low: {p}%" },
    carFuel: { ru: "Топливо / заряд", en: "Fuel / charge" },
    safariNews: { ru: "Новости", en: "News", pl: "Nowości", de: "Neuigkeiten", cs: "Novinky", pt: "Novidades", fr: "Nouveautés", it: "Novità" },
    safariNoNews: { ru: "Пока пусто", en: "Nothing here yet", pl: "Na razie pusto", de: "Noch nichts", cs: "Zatím nic", pt: "Ainda nada", fr: "Rien pour l'instant", it: "Ancora niente" },
    aboutAuthor: { ru: "Автор", en: "Author", pl: "Autor", de: "Autor", cs: "Autor", pt: "Autor", fr: "Auteur", it: "Autore" },
    musicFolderHint: { ru: "Путь скопирован: вставьте его в адресную строку Проводника. Если окно не открылось, нажмите «Папка» ещё раз (я пробую другой способ).", en: "Path copied: paste it into the Explorer address bar. If no window opened, press “Folder” again (it tries another method).", pl: "Ścieżka skopiowana: wklej ją w pasku adresu Eksploratora. Jeśli okno się nie otworzyło, naciśnij „Folder” jeszcze raz (próbuję innej metody).", de: "Pfad kopiert: füge ihn in die Adressleiste des Explorers ein. Falls kein Fenster aufging, tippe nochmal auf „Ordner“ (andere Methode).", cs: "Cesta zkopírována: vložte ji do adresního řádku Průzkumníka. Pokud se okno neotevřelo, klepněte na „Složka“ znovu (zkusím jiný způsob).", pt: "Caminho copiado: cola-o na barra de endereços do Explorador. Se nenhuma janela abriu, carrega em “Pasta” outra vez (tenta outro método).", fr: "Chemin copié : collez-le dans la barre d'adresse de l'Explorateur. Si aucune fenêtre ne s'est ouverte, appuyez encore sur « Dossier » (autre méthode).", it: "Percorso copiato: incollalo nella barra degli indirizzi di Esplora file. Se non si è aperta nessuna finestra, premi di nuovo «Cartella» (provo un altro metodo)." }
  };

  function t(key) {
    var entry = I18N[key];
    if (!entry) return key;
    return entry[currentLang] || entry.en || entry.ru || key;
  }

  function applyTranslations() {
    if (!root) return;
    Array.prototype.forEach.call(root.querySelectorAll('[data-i18n]'), function (elx) {
      elx.textContent = t(elx.getAttribute('data-i18n'));
    });
  }

  var LANG_NAMES = { ru: 'Русский', en: 'English', pl: 'Polski', de: 'Deutsch', cs: 'Čeština', pt: 'Português', fr: 'Français', it: 'Italiano' };

  function setLanguage(code, persist) {
    if (SUPPORTED_LANGS.indexOf(code) === -1) code = 'en';
    currentLang = code;
    applyTranslations();
    refreshDynamicTexts();
    if (persist && window.BeamiPhone.bridge) window.BeamiPhone.bridge.saveLanguage(code);
    updateLangSelection();
  }

  function refreshDynamicTexts() {
    if (!root) return;
    var notesTa = el('[data-bp="notes-text"]');
    if (notesTa) notesTa.placeholder = t('notesPlaceholder');
    var sw = el('[data-bp="stopwatch-toggle"]');
    if (sw) sw.textContent = stopwatch.running ? t('btnPause') : t('btnStart');
    setTimerButtonLabel();
    updateLockDate();
    onTelemetry(lastTelemetry);
    if (lastLibraryStatus) renderTrackList(window.BeamiPhone.audioPlayer.getState().playlist, lastLibraryStatus);
    renderDragyResults();
    if (dragyArmedPreset) {
      var titleEl = el('[data-bp="dragy-detail-title"]');
      if (titleEl) titleEl.textContent = presetTitle(dragyArmedPreset);
      var statusEl = el('[data-bp="dragy-detail-status"]');
      var timerEl = el('[data-bp="dragy-detail-timer"]');
      if (statusEl && timerEl && !dragyDetailRunning && timerEl.textContent === '0.0') {
        statusEl.textContent = t(dragyArmedPreset === 'r80_120' ? 'dragyRolling' : 'dragyReady');
      }
    }
  }

  function updateLangSelection() {
    if (!root) return;
    var nameEl = el('[data-bp="lang-current-name"]');
    if (nameEl) nameEl.textContent = LANG_NAMES[currentLang] || currentLang;
    Array.prototype.forEach.call(root.querySelectorAll('.bp-lang-option'), function (btn) {
      btn.classList.toggle('bp-lang-selected', btn.getAttribute('data-lang') === currentLang);
    });
  }

  // ------------------------------------------------------------------
  // Custom wallpaper/icon assets: if the mod creator drops files with the
  // documented names into wallpapers/ or icons/, we use them instead of the
  // built-in gradients/SVGs. Nothing breaks if the files are absent -- each
  // check just silently falls back to the default look.
  // ------------------------------------------------------------------

  var WALLPAPER_BASE = '/ui/modules/apps/BeamiPhone/wallpapers/';
  var ICON_BASE = '/ui/modules/apps/BeamiPhone/icons/';
  var WALLPAPER_KEYS = ['sunset', 'orbs', 'ocean', 'forest'];
  var ICON_KEYS = ['music', 'calculator', 'clock', 'settings', 'maps', 'notes', 'messages', 'safari', 'car', 'dragy', 'weather', 'phone', 'camera'];
  var customStyleEl = null;
  var appliedWallpaperRules = [];

  function checkImage(url) {
    return new Promise(function (resolve) {
      var img = new Image();
      img.onload = function () { resolve(url); };
      img.onerror = function () { resolve(null); };
      img.src = url;
    });
  }

  // Is this picture bright? (looked at where the icon labels and clock sit)
  var wallpaperTone = {};
  function applyTone() {
    var phoneEl = el('[data-bp="phone"]');
    if (!phoneEl) return;
    var key = phoneEl.getAttribute('data-wallpaper');
    phoneEl.setAttribute('data-tone', wallpaperTone[key] || 'dark');
  }
  function measureTone(key, url) {
    var img = new Image();
    img.onload = function () {
      var tone = 'dark';
      try {
        var cv = document.createElement('canvas'); cv.width = 24; cv.height = 48;
        var cx = cv.getContext('2d'); cx.drawImage(img, 0, 0, 24, 48);
        var px = cx.getImageData(0, 0, 24, 34).data, sum = 0, n = 0;
        for (var i = 0; i < px.length; i += 4) { sum += (0.2126 * px[i] + 0.7152 * px[i + 1] + 0.0722 * px[i + 2]) / 255; n++; }
        tone = (sum / n) > 0.6 ? 'light' : 'dark';
      } catch (e) { tone = 'dark'; }
      wallpaperTone[key] = tone;
      applyTone();
    };
    img.src = url;
  }

  function applyCustomWallpaper(key, url) {
    measureTone(key, url);
    appliedWallpaperRules.push(
      '.bp-phone[data-wallpaper="' + key + '"] .bp-wallpaper,' +
      '.bp-phone[data-wallpaper="' + key + '"] .bp-wallpaper-lock {' +
      'background-image:url(\'' + url + '\'); background-size:cover; background-position:center; }'
    );
    if (!customStyleEl) {
      customStyleEl = document.createElement('style');
      document.head.appendChild(customStyleEl);
    }
    customStyleEl.textContent = appliedWallpaperRules.join('\n');
  }

  function applyCustomIcon(key, url) {
    if (!root) return;
    Array.prototype.forEach.call(root.querySelectorAll('[data-icon-key="' + key + '"]'), function (span) {
      span.style.padding = '0';
      span.innerHTML = '<img src="' + url + '" style="width:100%;height:100%;object-fit:cover;border-radius:inherit;display:block;" />';
    });
  }

  function loadCustomAssets() {
    WALLPAPER_KEYS.forEach(function (key, idx) {
      var n = idx + 1;
      checkImage(WALLPAPER_BASE + 'wallpaper' + n + '.jpg').then(function (url) {
        if (url) { applyCustomWallpaper(key, url); return; }
        checkImage(WALLPAPER_BASE + 'wallpaper' + n + '.png').then(function (url2) {
          if (url2) applyCustomWallpaper(key, url2);
        });
      });
    });
    ICON_KEYS.forEach(function (key) {
      checkImage(ICON_BASE + key + '.png').then(function (url) {
        if (url) applyCustomIcon(key, url);
      });
    });
  }

  // ------------------------------------------------------------------
  // Open/close + mount/unmount
  // ------------------------------------------------------------------

  function setOpen(open) {
    if (!root) return isOpen;
    isOpen = open;
    root.classList.toggle('bp-open', isOpen);
    if (isOpen) {
      relock(); // always opens from the lock screen, per spec
      // F3 off/on wipes every notification, like turning a real phone off and on
      if (window.BeamiPhone.notifications) window.BeamiPhone.notifications.clearAll();
      flushPendingAlerts(); // alerts that came while the phone was closed appear on the lock screen
      vsPrev = null;
      if (window.BeamiPhone.bridge && window.BeamiPhone.bridge.startVehWatch) window.BeamiPhone.bridge.startVehWatch();
    } else {
      if (window.BeamiPhone.notifications) window.BeamiPhone.notifications.clearAll();
      if (!smartNotifs && window.BeamiPhone.bridge && window.BeamiPhone.bridge.stopVehWatch) window.BeamiPhone.bridge.stopVehWatch();
      if (window.BeamiPhone.bridge) window.BeamiPhone.bridge.stopTelemetryPolling();
      stopClockAppTicker();
    }
    return isOpen;
  }

  function toggleOpen() {
    return setOpen(!isOpen);
  }

  function forceTeardown() {
    stopFitWatcher();
    if (clockTimer) clearInterval(clockTimer);
    stopClockAppTicker();
    if (window.BeamiPhone.bridge) window.BeamiPhone.bridge.stopTelemetryPolling();
    if (window.BeamiPhone.bridge && window.BeamiPhone.bridge.stopVehWatch) window.BeamiPhone.bridge.stopVehWatch();
    if (window.BeamiPhone.island) window.BeamiPhone.island.detach();
    if (root && root.parentNode) root.parentNode.removeChild(root);
    root = null;
    currentContainer = null;
    trackListDelegationWired = false;
    lastRenderedTrackListSignature = null;
    flushNotes();
    notesLoaded = false;
  }

  function mount(container) {
    if (root) {
      // A phone DOM already exists from an earlier mount. BeamNG appears to
      // re-link this directive periodically during normal play (e.g. on
      // camera view changes) without a clean destroy first -- trying to
      // preserve/relocate the old DOM risks it ending up parented inside an
      // already-detached container (invisible, unclickable, but still
      // "working" internally, which is exactly the kind of silent failure
      // that's impossible to diagnose from the outside). Tearing down and
      // rebuilding fresh here is simpler and always correct.
      console.log('[BeamiPhone] mount(): a previous instance existed, rebuilding fresh');
      forceTeardown();
    }
    currentContainer = container;
    buildDom(container);
    if (window.BeamiPhone.notifications) {
      window.BeamiPhone.notifications.attach(el('.bp-screen'), el('[data-bp="lock-notifs"]'), {
        getScale: uiScale,
        isLocked: function () { return isLocked; },
        t: t,
        onOpen: function (app) {
          if (isLocked) unlock();
          if (app === 'car') showView('car');
        }
      });
    }
    vsPrev = null;
    if (window.BeamiPhone.island) {
      window.BeamiPhone.island.attach(el('[data-bp="island"]'), {
        A: function () { return window.BeamiPhone.audioPlayer; },
        getScale: uiScale,
        defaultCover: DEFAULT_COVER_SVG,
        icons: { prev: W_ICON_PREV, play: W_ICON_PLAY, pause: W_ICON_PAUSE, next: W_ICON_NEXT }
      });
      window.BeamiPhone.island.setContext({ locked: isLocked, view: currentView });
      if (window.BeamiPhone.audioPlayer) window.BeamiPhone.island.update(window.BeamiPhone.audioPlayer.getState());
    }
    loadCustomAssets();
    applyTranslations();
    updateLangSelection();
    refreshDynamicTexts();
    showView('home'); // underlying view, hidden behind the lock screen until unlocked
    renderPlayerState(window.BeamiPhone.audioPlayer.getState());
    if (lastLibraryStatus) renderTrackList(window.BeamiPhone.audioPlayer.getState().playlist, lastLibraryStatus);
    onTelemetry(lastTelemetry);
  }

  function unmount(container) {
    // Only tear the phone down if the widget being removed is the one that
    // actually hosts it right now. Removing an inert leftover/duplicate
    // widget must NOT kill the phone for everyone else.
    if (container && currentContainer && container !== currentContainer) {
      console.log('[BeamiPhone] unmount(): an inactive duplicate widget was removed, phone stays put');
      return;
    }
    forceTeardown();
  }

  window.BeamiPhone.ui = {
    mount: mount,
    unmount: unmount,
    toggleOpen: toggleOpen,
    renderPlayerState: renderPlayerState,
    onLibraryUpdated: onLibraryUpdated,
    onTelemetry: onTelemetry,
    onVehState: onVehState,
    onEnv: onEnv,
    onMapData: onMapData,
    onNaviData: onNaviData,
    onPose: onPose,
    onFolder: onFolder,
    onMapDirty: onMapDirty,
    onRouteData: onRouteData,
    onActionResult: onActionResult,
    onStreamsUpdate: onStreamsUpdate,
    onTorqueCurve: onTorqueCurve,
    onPrefs: onPrefs,
    onNotes: onNotes
  };
})();