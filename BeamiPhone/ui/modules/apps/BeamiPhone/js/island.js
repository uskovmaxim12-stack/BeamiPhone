// BeamiPhone (c) 2026 wserf. All rights reserved.
// Do not re-upload, redistribute or reuse without permission. See LICENSE.txt. [BP-wserf-A364B58F7647]
// BeamiPhone :: js/island.js -- the Dynamic Island, now playing.
//
// Behaviour copied from the real thing:
//  * Music playing and you are NOT inside the Music app (and the phone is
//    unlocked) -> the island widens into its COMPACT form: a small album-art
//    thumbnail on the left, a pulsing waveform on the right, black in between
//    (that part is the camera).  The waveform is tinted with colours taken from
//    the album art.
//  * Click it -> it springs open into the EXPANDED form: big art, title,
//    artist, waveform, scrubber with times, previous / play-pause / next.
//    Click anywhere else and it folds back.
//  * Swipe the compact island left/right -> it hides until the next song.
//  * Opening the Music app, locking the phone, or stopping the music (paused
//    for a while) sends it back to the plain black pill.
//  * Motion: real damped springs on width and height.  Opening, WIDTH leads
//    and height follows a beat later; closing, HEIGHT leads.  Contents are only
//    revealed once the shape can hold them (blur + scale cross-fade), the
//    corner radius stays constant and the shell clips everything.
//  * The indicator is a real EQUALIZER: each bar is one frequency band of the
//    audio that is actually playing (an AnalyserNode tapped in spatialAudio.js),
//    auto-scaled per band. Without Web Audio it falls back to synthetic motion.
//  * While the island is wide, the status bar makes room like on iOS: the
//    network label ("5G") fades away and the signal bars slide into its place.
(function () {
  window.BeamiPhone = window.BeamiPhone || {};

  var PAUSE_IDLE_MS = 12000;   // paused this long -> island goes back to idle
  var BARS = 6;
  var DEFAULT_PAL = ['#ff5f8f', '#ffa24a'];
  var palCache = {};
  var I = null; // the live instance

  // ------------------------------------------------------------ helpers
  function fmt(t) {
    if (!isFinite(t) || t < 0) t = 0;
    var m = Math.floor(t / 60), s = Math.floor(t % 60);
    return m + ':' + (s < 10 ? '0' : '') + s;
  }

  function rgb2hsl(r, g, b) {
    r /= 255; g /= 255; b /= 255;
    var mx = Math.max(r, g, b), mn = Math.min(r, g, b), h = 0, s = 0, l = (mx + mn) / 2;
    if (mx !== mn) {
      var d = mx - mn;
      s = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn);
      if (mx === r) h = (g - b) / d + (g < b ? 6 : 0);
      else if (mx === g) h = (b - r) / d + 2;
      else h = (r - g) / d + 4;
      h *= 60;
    }
    return [h, s, l];
  }

  // two bright, saturated colours from the cover (cached per url)
  function palette(url, cb) {
    if (palCache[url]) { cb(palCache[url]); return; }
    var img = new Image();
    img.onload = function () {
      var pal = DEFAULT_PAL;
      try {
        var c = document.createElement('canvas');
        c.width = c.height = 24;
        var g = c.getContext('2d');
        g.drawImage(img, 0, 0, 24, 24);
        var d = g.getImageData(0, 0, 24, 24).data;
        var bins = [], i;
        for (i = 0; i < 12; i++) bins.push({ w: 0, r: 0, g: 0, b: 0 });
        var avg = [0, 0, 0], n = 0;
        for (i = 0; i < d.length; i += 4) {
          if (d[i + 3] < 128) continue;
          var hsl = rgb2hsl(d[i], d[i + 1], d[i + 2]);
          avg[0] += d[i]; avg[1] += d[i + 1]; avg[2] += d[i + 2]; n++;
          var w = hsl[1] * (1 - Math.abs(hsl[2] * 2 - 1)); // vivid, not too dark/light
          var bi = Math.min(11, Math.floor(hsl[0] / 30));
          var bn = bins[bi];
          bn.w += w; bn.r += d[i] * w; bn.g += d[i + 1] * w; bn.b += d[i + 2] * w;
        }
        var order = bins.map(function (b, idx) { return idx; }).sort(function (a, b) { return bins[b].w - bins[a].w; });
        var first = bins[order[0]];
        if (first.w > 0.6) {
          var pick = [order[0]];
          for (i = 1; i < order.length; i++) {
            var dist = Math.min(Math.abs(order[i] - order[0]), 12 - Math.abs(order[i] - order[0]));
            if (dist >= 2 && bins[order[i]].w > first.w * 0.25) { pick.push(order[i]); break; }
          }
          pal = pick.map(function (idx) {
            var b = bins[idx];
            var hs = rgb2hsl(b.r / b.w, b.g / b.w, b.b / b.w);
            return 'hsl(' + Math.round(hs[0]) + ',' + Math.round(Math.max(hs[1], 0.65) * 100) + '%,' + Math.round(Math.min(Math.max(hs[2], 0.58), 0.72) * 100) + '%)';
          });
          if (pal.length === 1) {
            var hh = rgb2hsl(first.r / first.w, first.g / first.w, first.b / first.w)[0];
            pal.push('hsl(' + Math.round((hh + 28) % 360) + ',80%,70%)');
          }
        } else if (n) {
          // grey / muted cover: soft white-ish gradient
          var l = Math.min(0.86, Math.max(0.6, rgb2hsl(avg[0] / n, avg[1] / n, avg[2] / n)[2] + 0.25));
          pal = ['hsl(0,0%,' + Math.round(l * 100) + '%)', 'hsl(0,0%,' + Math.round(Math.max(0.5, l - 0.18) * 100) + '%)'];
        }
      } catch (e) { pal = DEFAULT_PAL; }
      palCache[url] = pal;
      cb(pal);
    };
    img.onerror = function () { cb(DEFAULT_PAL); };
    img.src = url;
  }

  function barsHtml(cls) {
    var s = '<div class="bp-isl-bars ' + cls + '">';
    for (var i = 0; i < BARS; i++) s += '<i></i>';
    return s + '</div>';
  }

  // ------------------------------------------------------------- attach
  function attach(el, opts) {
    detach();
    if (!el) return;
    opts = opts || {};
    var icons = opts.icons || {};
    var cover0 = opts.defaultCover || '';

    el.innerHTML =
      '<div class="bp-isl-cmp">' +
      '  <img class="bp-isl-art" alt="" src="' + cover0 + '" />' +
      barsHtml('bp-isl-bars-cmp') +
      '</div>' +
      '<div class="bp-isl-exp">' +
      '  <div class="bp-isl-row">' +
      '    <img class="bp-isl-cover" alt="" src="' + cover0 + '" />' +
      '    <div class="bp-isl-meta"><div class="bp-isl-title">—</div><div class="bp-isl-artist">—</div></div>' +
      barsHtml('bp-isl-bars-exp') +
      '  </div>' +
      '  <div class="bp-isl-prog">' +
      '    <div class="bp-isl-track"><div class="bp-isl-fill"></div></div>' +
      '    <div class="bp-isl-times"><span class="bp-isl-cur">0:00</span><span class="bp-isl-rem">-0:00</span></div>' +
      '  </div>' +
      '  <div class="bp-isl-ctrls">' +
      '    <button class="bp-isl-btn bp-isl-prev">' + (icons.prev || '') + '</button>' +
      '    <button class="bp-isl-btn bp-isl-play">' + (icons.play || '') + '</button>' +
      '    <button class="bp-isl-btn bp-isl-next">' + (icons.next || '') + '</button>' +
      '  </div>' +
      '</div>';

    var idleW = el.offsetWidth || 89, idleH = el.offsetHeight || 27;
    var screenW = (el.parentNode && el.parentNode.offsetWidth) || 330;
    var T = {
      idle: { w: idleW, h: idleH },
      compact: { w: Math.round(idleW * 1.8), h: idleH },
      expanded: { w: Math.round(screenW - 40), h: 142 }
    };

    I = {
      el: el, opts: opts, icons: icons, T: T,
      shown: 'idle',
      expanded: false, hidden: false,
      track: null, playing: false, cur: 0, dur: 0, trackKey: '', pausedSince: 0,
      ctx: { locked: false, view: 'home' },
      sw: { x: idleW, v: 0, t: idleW, k: 380, c: 30, at: 0 },
      sh: { x: idleH, v: 0, t: idleH, k: 380, c: 30, at: 0 },
      levels: [0, 0, 0, 0, 0, 0], peak: [0.3, 0.3, 0.3, 0.3, 0.3, 0.3], floor: [0, 0, 0, 0, 0, 0],
      raf: 0, last: 0, idleTimer: 0,
      cmpBars: el.querySelectorAll('.bp-isl-bars-cmp i'),
      expBars: el.querySelectorAll('.bp-isl-bars-exp i'),
      q: function (s) { return el.querySelector(s); }
    };
    el.style.width = idleW + 'px';
    el.style.height = idleH + 'px';
    el.setAttribute('data-mode', 'idle');
    el.style.setProperty('--isl-c1', DEFAULT_PAL[0]);
    el.style.setProperty('--isl-c2', DEFAULT_PAL[1]);
    el.style.setProperty('--isl-ew', T.expanded.w + 'px');
    el.style.setProperty('--isl-cw', T.compact.w + 'px');

    measureClock();
    wire();
  }

  // In idle the clock is centred between the left screen edge and the island;
  // while the island is wide it glides back to its normal (flush-left) place.
  function measureClock() {
    if (!I) return;
    var phone = I.el.parentNode;
    var sb = phone && phone.querySelector('.bp-statusbar');
    var clk = sb && sb.querySelector('.bp-clock');
    var scr = phone && phone.querySelector('.bp-screen');
    if (!clk || !scr || !clk.offsetWidth) return;
    var islandLeft = (phone.offsetWidth - I.T.idle.w) / 2;
    var mid = (scr.offsetLeft + islandLeft) / 2;
    var dx = mid - clk.offsetWidth / 2 - clk.offsetLeft;
    sb.style.setProperty('--clock-idle-dx', Math.round(dx * 10) / 10 + 'px');
  }

  function detach() {
    if (!I) return;
    if (I.raf) cancelAnimationFrame(I.raf);
    if (I.idleTimer) clearTimeout(I.idleTimer);
    document.removeEventListener('mousedown', I.onOutside, true);
    var sb0 = I.el.parentNode && I.el.parentNode.querySelector('.bp-statusbar');
    if (sb0) sb0.setAttribute('data-island', 'off');
    I = null;
  }

  // -------------------------------------------------------------- wiring
  function wire() {
    var el = I.el;
    var A = function () { return I.opts.A && I.opts.A(); };

    // press on the island: click -> expand, horizontal swipe -> hide
    el.addEventListener('mousedown', function (ev) {
      if (ev.button !== 0) return;
      if (I.shown === 'expanded') return; // controls handle themselves
      if (I.shown !== 'compact') return;
      ev.preventDefault(); ev.stopPropagation();
      var sx = ev.clientX, dx = 0, moved = false;
      var sc = (I.opts.getScale && I.opts.getScale()) || 1;
      function move(e) {
        dx = (e.clientX - sx) / sc;
        if (Math.abs(dx) > 5) moved = true;
        if (moved) el.style.transform = 'translateX(calc(-50% + ' + (dx * 0.5) + 'px))';
      }
      function up() {
        document.removeEventListener('mousemove', move);
        document.removeEventListener('mouseup', up);
        el.style.transform = '';
        if (Math.abs(dx) > 28) { I.hidden = true; I.expanded = false; evaluate(); }
        else if (!moved) { I.expanded = true; evaluate(); }
      }
      document.addEventListener('mousemove', move);
      document.addEventListener('mouseup', up);
    });

    I.onOutside = function (ev) {
      if (!I || I.shown !== 'expanded') return;
      if (I.el.contains(ev.target)) return;
      I.expanded = false;
      evaluate();
    };
    document.addEventListener('mousedown', I.onOutside, true);

    // transport buttons
    function stop(ev) { ev.stopPropagation(); }
    I.q('.bp-isl-prev').addEventListener('click', function (ev) { stop(ev); if (A()) A().previous(); });
    I.q('.bp-isl-next').addEventListener('click', function (ev) { stop(ev); if (A()) A().next(); });
    I.q('.bp-isl-play').addEventListener('click', function (ev) {
      stop(ev);
      if (window.BeamiPhone.spatial && window.BeamiPhone.spatial.onUserPlay) window.BeamiPhone.spatial.onUserPlay();
      if (A()) A().togglePlayPause();
    });

    // scrubber (click + drag)
    var track = I.q('.bp-isl-track');
    track.addEventListener('mousedown', function (ev) {
      if (ev.button !== 0) return;
      ev.preventDefault(); ev.stopPropagation();
      function seek(e) {
        var r = track.getBoundingClientRect();
        var f = Math.min(1, Math.max(0, (e.clientX - r.left) / r.width));
        if (A()) A().seekToFraction(f);
      }
      seek(ev);
      function up() { document.removeEventListener('mousemove', seek); document.removeEventListener('mouseup', up); }
      document.addEventListener('mousemove', seek);
      document.addEventListener('mouseup', up);
    });
  }

  // ------------------------------------------------------------ state in
  function update(state) {
    if (!I || !state) return;
    var tr = state.currentTrack || null;
    var wasPlaying = I.playing;
    I.playing = !!(tr && state.isPlaying);
    I.cur = state.currentTime || 0;
    I.dur = state.duration || 0;

    var key = tr ? (tr.file || '') + '|' + (tr.title || '') : '';
    var changed = key !== I.trackKey;
    if (changed) {
      I.trackKey = key;
      I.track = tr;
      I.hidden = false; // a new song brings the island back
      if (tr) {
        var url = tr.coverUrl || I.opts.defaultCover || '';
        I.q('.bp-isl-art').src = url;
        I.q('.bp-isl-cover').src = url;
        I.q('.bp-isl-title').textContent = tr.title || '';
        I.q('.bp-isl-artist').textContent = tr.artist || '';
        palette(url, function (pal) {
          if (!I) return;
          I.el.style.setProperty('--isl-c1', pal[0]);
          I.el.style.setProperty('--isl-c2', pal[1] || pal[0]);
        });
        if (I.shown === 'compact') kick();
      }
    }
    if (!tr) { I.expanded = false; I.track = null; }
    if (I.playing && !wasPlaying) { I.pausedSince = 0; I.hidden = false; }
    if (!I.playing && wasPlaying) I.pausedSince = Date.now();

    // progress + play icon
    var f = I.dur > 0 ? Math.min(1, Math.max(0, I.cur / I.dur)) : 0;
    I.q('.bp-isl-fill').style.transform = 'scaleX(' + f + ')';
    I.q('.bp-isl-cur').textContent = fmt(I.cur);
    I.q('.bp-isl-rem').textContent = '-' + fmt(Math.max(0, I.dur - I.cur));
    var pb = I.q('.bp-isl-play');
    var flag = I.playing ? '1' : '0';
    if (pb.getAttribute('data-p') !== flag) {
      pb.innerHTML = I.playing ? (I.icons.pause || '') : (I.icons.play || '');
      pb.setAttribute('data-p', flag);
    }
    evaluate();
    ensureLoop();
  }

  function setContext(c) {
    if (!I) return;
    I.ctx = { locked: !!c.locked, view: c.view || 'home' };
    if (I.ctx.locked || I.ctx.view === 'music') I.expanded = false;
    evaluate();
  }

  // ------------------------------------------------------- mode + springs
  function wanted() {
    if (!I.track || I.ctx.locked || I.ctx.view === 'music' || I.hidden) return 'idle';
    if (I.expanded) return 'expanded';
    if (!I.playing && I.pausedSince && Date.now() - I.pausedSince > PAUSE_IDLE_MS) return 'idle';
    return 'compact';
  }

  function aim(s, target, k, zeta, delayMs) {
    s.t = target; s.k = k; s.c = 2 * Math.sqrt(k) * zeta;
    s.at = performance.now() + (delayMs || 0);
  }

  function evaluate() {
    if (!I) return;
    var w = wanted();
    if (I.idleTimer) { clearTimeout(I.idleTimer); I.idleTimer = 0; }
    if (!I.playing && I.pausedSince && w === 'compact') {
      var left = PAUSE_IDLE_MS - (Date.now() - I.pausedSince);
      I.idleTimer = setTimeout(evaluate, Math.max(50, left + 30));
    }
    if (w === I.shown) return;
    if (w === 'idle') measureClock();
    var prev = I.shown, T = I.T[w];
    I.shown = w;
    I.el.setAttribute('data-mode', w);
    var sb = I.el.parentNode && I.el.parentNode.querySelector('.bp-statusbar');
    if (sb) sb.setAttribute('data-island', w === 'idle' ? 'off' : 'on');

    if (w === 'expanded') {
      aim(I.sw, T.w, 420, 0.64, 0);     // width leads ...
      aim(I.sh, T.h, 300, 0.68, 55);    // ... height follows a beat later
    } else if (prev === 'expanded') {
      aim(I.sh, T.h, 400, 0.86, 0);     // closing: height leads
      aim(I.sw, T.w, 300, 0.78, 70);
    } else if (w === 'compact') {
      aim(I.sw, T.w, 360, 0.6, 0);      // pops open with a little bounce
      aim(I.sh, T.h, 360, 0.7, 0);
    } else {
      aim(I.sw, T.w, 330, 0.8, 0);      // back to the plain pill
      aim(I.sh, T.h, 330, 0.8, 0);
    }
    ensureLoop();
  }

  function kick() { if (I) { I.sw.v += 130; ensureLoop(); } } // little bounce on a new song

  // --------------------------------------------------------------- loop
  function springStep(s, dt, now) {
    if (now < s.at) return;
    var a = -s.k * (s.x - s.t) - s.c * s.v;
    s.v += a * dt;
    s.x += s.v * dt;
  }
  function springRest(s) { return Math.abs(s.x - s.t) < 0.08 && Math.abs(s.v) < 0.4; }

  function realLevels() {
    var sp = window.BeamiPhone.spatial;
    return sp && sp.getLevels ? sp.getLevels(BARS) : null;
  }

  function ensureLoop() {
    if (I && !I.raf) { I.last = 0; I.raf = requestAnimationFrame(frame); }
  }

  function frame(ts) {
    if (!I) return;
    I.raf = 0;
    var now = performance.now();
    var dt = I.last ? Math.min((ts - I.last) / 1000, 1 / 20) : 1 / 60;
    I.last = ts;

    // springs, sub-stepped for stability
    var steps = Math.max(1, Math.ceil(dt / (1 / 240))), h = dt / steps, i;
    for (i = 0; i < steps; i++) { springStep(I.sw, h, now); springStep(I.sh, h, now); }
    var minW = I.T.idle.w * 0.92, minH = I.T.idle.h * 0.92;
    I.el.style.width = Math.max(minW, I.sw.x).toFixed(2) + 'px';
    I.el.style.height = Math.max(minH, I.sh.x).toFixed(2) + 'px';
    var moving = !(springRest(I.sw) && springRest(I.sh)) || now < Math.max(I.sw.at, I.sh.at);
    if (!moving) { I.sw.x = I.sw.t; I.sh.x = I.sh.t; I.sw.v = I.sh.v = 0; }

    // equalizer: every bar is its own frequency band of the REAL audio
    // (low -> high). Each band is auto-scaled to its own recent peak, so quiet
    // and loud tracks both use the full bar height; quick attack, soft release.
    var live = I.shown !== 'idle';
    var target = [0, 0, 0, 0, 0, 0];
    if (live && I.playing) {
      var real = window.BeamiPhone.spatial && window.BeamiPhone.spatial.getLevels ? window.BeamiPhone.spatial.getLevels(BARS) : null;
      if (real) {
        for (i = 0; i < BARS; i++) {
          var r = real[i] || 0;
          // per-band dynamic range: the floor follows the quiet moments between hits,
          // the ceiling follows the recent peaks; only what rises above the floor
          // lights the bar, so the bars really move with the beat
          I.peak[i] = Math.max(r, I.peak[i] - dt * 0.35);
          I.floor[i] = Math.min(r, I.floor[i] + dt * 0.12);
          var x = (r - I.floor[i]) / Math.max(0.12, I.peak[i] - I.floor[i]);
          x = Math.min(1, Math.max(0, (x - 0.1) / 0.9));
          target[i] = Math.pow(x, 1.5);
        }
      } else {
        // no Web Audio: independent lively motion per bar
        var t = ts / 1000, f = [3.1, 4.3, 2.7, 5.2, 3.8, 4.7], g = [0.7, 1.1, 0.5, 0.9, 1.3, 0.6];
        for (i = 0; i < BARS; i++) target[i] = 0.12 + 0.88 * Math.abs(Math.sin(t * f[i] + Math.sin(t * g[i]) * 2.2));
      }
    }
    var barsBusy = false;
    var ka = 1 - Math.exp(-dt * 38), kr = 1 - Math.exp(-dt * 9);
    for (i = 0; i < BARS; i++) {
      var cur = I.levels[i], tg = target[i];
      cur += (tg - cur) * (tg > cur ? ka : kr);
      if (Math.abs(cur - tg) < 0.004) cur = tg;
      if (cur > 0.004 || tg > 0) barsBusy = true;
      I.levels[i] = cur;
      var sy = (0.2 + 0.8 * Math.min(1, cur)).toFixed(3);
      if (I.cmpBars[i]) I.cmpBars[i].style.transform = 'scaleY(' + sy + ')';
      if (I.expBars[i]) I.expBars[i].style.transform = 'scaleY(' + sy + ')';
    }

    if (moving || (live && (I.playing || barsBusy))) I.raf = requestAnimationFrame(frame);
  }

  window.BeamiPhone.island = { attach: attach, detach: detach, update: update, setContext: setContext };
})();
