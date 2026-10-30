// BeamiPhone (c) 2026 wserf. All rights reserved.
// Do not re-upload, redistribute or reuse without permission. See LICENSE.txt. [BP-wserf-A364B58F7647]
// BeamiPhone :: js/notifications.js
//
// iOS-style notifications.
//  * Unlocked phone -> a banner drops in under the Dynamic Island with a soft
//    spring, stays ~5 s, then flies away by itself. It moves in exactly three
//    directions: left, right, up (axis-locked, no free dragging) and never
//    leaves the phone SCREEN (it is clipped by the screen, not the bezel).
//    Tap opens the app; holding it pauses the timer.
//  * Locked phone -> no banner; notifications sit at the BOTTOM of the lock
//    screen (below the music widget, above the shortcut buttons), exactly like
//    iOS "Stack" mode: newest on top, older ones of the SAME app peek out
//    underneath as a stack. Tap the stack to spread it out, swipe a card left or
//    right to clear it (swiping a collapsed stack clears the whole stack).
//    Long lists scroll (wheel or drag) and fade out softly under a blur.
//    Stacks are per app. Everything is wiped when the phone is closed (F3).
// Only transform/opacity are animated while things move (GPU friendly).
(function () {
  window.BeamiPhone = window.BeamiPhone || {};

  // iOS up to 26 drops banners from the top; reports on iOS 27 say they slide in
  // from the left edge. Switch to 'left' for that.
  var ENTER_FROM = 'top'; // 'top' | 'left'
  var BANNER_MS = 5000;
  var MAX_PER_APP = 30;   // remembered per app, only the newest few are drawn collapsed

  var st = { screen: null, list: null, banner: null, bannerTimer: 0, groups: [], opts: {} };

  function scale() { return (st.opts.getScale && st.opts.getScale()) || 1; }

  function fillCard(node, n) {
    node.innerHTML =
      '<span class="bp-notif-icon">' + (n.iconHtml || '') + '</span>' +
      '<span class="bp-notif-main">' +
      '  <span class="bp-notif-row"><span class="bp-notif-title"></span><span class="bp-notif-time"></span></span>' +
      '  <span class="bp-notif-text"></span>' +
      '</span>';
    node.querySelector('.bp-notif-title').textContent = n.title || '';
    node.querySelector('.bp-notif-text').textContent = n.body || '';
    node.querySelector('.bp-notif-time').textContent = st.opts.t ? st.opts.t('notifNow') : '';
  }

  // Swipe with the axis locked after the first few pixels:
  //   horizontal -> left/right only; vertical -> UP only (cb.allowUp). Never diagonal.
  // cb: { allowUp, onPress(bool), onDismiss(dir), onTap() }
  function makeSwipeable(node, cb) {
    node.addEventListener('mousedown', function (ev) {
      if (ev.button !== 0) return;
      var sx = ev.clientX, sy = ev.clientY, dx = 0, dy = 0, t0 = Date.now(), axis = null, raf = 0, done = false, scroll0 = 0;
      node.style.transition = 'none';
      if (cb.onPress) cb.onPress(true);
      ev.preventDefault();
      ev.stopPropagation();

      function apply() {
        raf = 0;
        if (done || !axis || axis === 'none' || axis === 'v') return;
        if (axis === 'x') {
          node.style.transform = 'translate3d(' + dx + 'px,0,0)';
          node.style.opacity = String(Math.max(0.3, 1 - Math.abs(dx) / 260));
        } else {
          var y = Math.min(dy, 0);
          node.style.transform = 'translate3d(0,' + y + 'px,0)';
          node.style.opacity = String(Math.max(0.3, 1 + y / 160));
        }
      }
      function move(e) {
        var sc = scale();
        dx = (e.clientX - sx) / sc;
        dy = (e.clientY - sy) / sc;
        if (!axis && Math.max(Math.abs(dx), Math.abs(dy)) > 6) {
          if (Math.abs(dx) >= Math.abs(dy)) axis = 'x';
          else if (cb.allowUp && dy < 0) axis = 'y';
          else if (cb.scrollEl) { axis = 'v'; scroll0 = cb.scrollEl.scrollTop; }
          else axis = 'none';
        }
        if (axis === 'v') cb.scrollEl.scrollTop = scroll0 - dy;
        if (!raf) raf = requestAnimationFrame(apply);
      }
      function up() {
        done = true;
        document.removeEventListener('mousemove', move);
        document.removeEventListener('mouseup', up);
        if (raf) { cancelAnimationFrame(raf); raf = 0; }
        var dt = Date.now() - t0;
        var dir = null;
        if (axis === 'x' && (Math.abs(dx) > 70 || (dt < 260 && Math.abs(dx) > 28))) dir = dx < 0 ? 'left' : 'right';
        else if (axis === 'y' && (dy < -40 || (dt < 260 && dy < -18))) dir = 'up';
        if (cb.onPress) cb.onPress(false);
        if (dir) { cb.onDismiss(dir); return; }
        node.style.transition = '';
        node.style.transform = '';
        node.style.opacity = '';
        if (!axis && cb.onTap) cb.onTap();
        if (axis === 'v') return;
      }
      document.addEventListener('mousemove', move);
      document.addEventListener('mouseup', up);
    });
  }

  function flyOff(node, dir, ms, cb) {
    node.style.transition = 'transform ' + ms + 'ms cubic-bezier(0.5, 0, 0.9, 0.4), opacity ' + ms + 'ms ease-in';
    node.style.transform = dir === 'up' ? 'translate3d(0,-160%,0)' : 'translate3d(' + (dir === 'left' ? '-' : '') + '125%,0,0)';
    node.style.opacity = '0';
    setTimeout(cb, ms + 30);
  }

  // ---------------------------------------------------------------- banner
  function hideBanner(dir, instant) {
    var b = st.banner;
    if (!b) return;
    st.banner = null;
    if (st.bannerTimer) { clearTimeout(st.bannerTimer); st.bannerTimer = 0; }
    var gone = function () { if (b.parentNode) b.parentNode.removeChild(b); };
    if (instant) { gone(); return; }
    flyOff(b, dir || (ENTER_FROM === 'left' ? 'left' : 'up'), 340, gone);
  }

  function armBannerTimer(ms) {
    if (st.bannerTimer) clearTimeout(st.bannerTimer);
    st.bannerTimer = setTimeout(function () { hideBanner(); }, ms);
  }

  function showBanner(n) {
    if (st.banner) hideBanner(null, false); // a new one replaces the old one
    var b = document.createElement('div');
    b.className = 'bp-notif-card bp-notif-banner';
    b.setAttribute('data-from', ENTER_FROM);
    fillCard(b, n);
    st.screen.appendChild(b); // inside the screen => clipped by the screen edges
    st.banner = b;
    void b.offsetWidth;
    b.classList.add('bp-in');

    makeSwipeable(b, {
      allowUp: true,
      onPress: function (down) {
        if (down) { if (st.bannerTimer) { clearTimeout(st.bannerTimer); st.bannerTimer = 0; } }
        else if (st.banner === b) armBannerTimer(BANNER_MS / 2);
      },
      onDismiss: function (dir) { if (st.banner === b) hideBanner(dir); },
      onTap: function () {
        if (st.banner === b) hideBanner('up');
        if (st.opts.onOpen) st.opts.onOpen(n.app);
      }
    });
    armBannerTimer(BANNER_MS);
  }

  // ----------------------------------------------------- lock screen stacks
  // FLIP: remember where things are, change the DOM, then glide everything that
  // moved from its old place to its new one (music widget included).
  function scaleOf(node) {
    var m = /matrix\(([^)]+)\)/.exec(getComputedStyle(node).transform || '');
    return m ? (parseFloat(m[1].split(',')[0]) || 1) : 1;
  }

  function listRoot() { return st.list && st.list.closest ? st.list.closest('.bp-lock-bottom') : null; }

  function flip(mutate) {
    var root = listRoot(), nodes = [], i;
    var list = st.list, oldH = list ? list.offsetHeight : 0;
    if (root) {
      var q = root.querySelectorAll('.bp-notif-lock:not(.bp-enter), .bp-lock-music');
      for (i = 0; i < q.length; i++) {
        if (q[i].offsetParent === null) continue;
        nodes.push({ n: q[i], bottom: q[i].getBoundingClientRect().bottom, s: scaleOf(q[i]), op: parseFloat(getComputedStyle(q[i]).opacity) });
      }
    }
    mutate();
    // When the list gets shorter (stack collapses / a card leaves), keep its old
    // height for a moment and shrink it together with the cards -- otherwise the
    // cards that are still travelling are clipped away and seem to teleport.
    var newH = list ? list.offsetHeight : 0, holdH = false;
    if (list && oldH > newH + 2 && list.parentNode.classList.contains('bp-has')) {
      list.style.transition = 'none';
      list.style.height = oldH + 'px';
      holdH = true;
    }
    var sc = scale(), moved = [];
    // pass 1: read the new layout position with transforms off
    nodes.forEach(function (o) {
      if (!o.n.parentNode || o.n.offsetParent === null) return;
      o.n.style.transition = 'none';
      var tf = o.n.style.transform;
      o.n.style.transform = 'none';
      o.nb = o.n.getBoundingClientRect().bottom;
      o.n.style.transform = tf;
      o.ok = true;
    });
    // pass 2: put every card back where it visually was (position AND size)
    nodes.forEach(function (o) {
      if (!o.ok) return;
      var d = (o.bottom - o.nb) / sc;
      if (Math.abs(d) < 1 && Math.abs(o.s - 1) < 0.01) { o.n.style.transition = ''; return; }
      o.n.style.transform = 'translate3d(0,' + d + 'px,0) scale(' + o.s + ')';
      moved.push(o.n);
    });
    updateFade();
    if (!moved.length && !holdH) return;
    void document.body.offsetWidth;
    moved.forEach(function (n) {
      n.style.transition = 'transform 0.55s cubic-bezier(0.32, 0.72, 0, 1), opacity 0.3s ease, background-color 0.3s ease';
      n.style.transform = '';
    });
    if (holdH) {
      list.style.transition = 'height 0.55s cubic-bezier(0.32, 0.72, 0, 1), --bp-fade-top 0.35s ease, --bp-fade-bot 0.35s ease';
      list.style.height = newH + 'px';
    }
    setTimeout(function () {
      moved.forEach(function (n) { n.style.transition = ''; });
      if (holdH) { list.style.transition = ''; list.style.height = ''; }
      updateFade();
    }, 600);
  }

  // soft fade/blur where the list continues past its top/bottom edge
  function updateFade() {
    var list = st.list;
    if (!list) return;
    var wrap = list.parentNode;
    wrap.classList.toggle('bp-has', list.children.length > 0);
    var more = list.scrollHeight - list.scrollTop - list.clientHeight > 4;
    var scrolled = list.scrollTop > 4;
    wrap.classList.toggle('bp-more', more);
    wrap.classList.toggle('bp-scrolled', scrolled);
  }

  function renderGroup(g) {
    g.el.classList.toggle('bp-expanded', g.expanded);
    g.el.classList.toggle('bp-collapsed', !g.expanded);
    g.el.classList.toggle('bp-multi', g.items.length > 1);
    g.el.classList.toggle('bp-stacked', !g.expanded && g.items.length > 1);
    g.items.forEach(function (it, i) {
      it.card.setAttribute('data-depth', g.expanded ? '0' : String(Math.min(i, 3)));
      it.card.setAttribute('data-count', String(g.items.length));
    });
  }

  function findGroup(app) {
    for (var i = 0; i < st.groups.length; i++) if (st.groups[i].app === app) return st.groups[i];
    return null;
  }

  function removeGroupIfEmpty(g) {
    if (g.items.length) return;
    if (g.el.parentNode) g.el.parentNode.removeChild(g.el);
    var i = st.groups.indexOf(g);
    if (i >= 0) st.groups.splice(i, 1);
  }

  function setExpanded(g, on) {
    if (g.expanded === on) return;
    flip(function () { g.expanded = on; renderGroup(g); if (on) st.list.scrollTop = 0; });
  }

  function dismissItem(g, item, dir) {
    flyOff(item.card, dir, 280, function () {
      flip(function () {
        var i = g.items.indexOf(item);
        if (i >= 0) g.items.splice(i, 1);
        if (item.card.parentNode) item.card.parentNode.removeChild(item.card);
        if (g.items.length < 2) g.expanded = false;
        renderGroup(g);
        removeGroupIfEmpty(g);
      });
    });
  }

  function dismissGroup(g, dir) {
    var front = g.items[0];
    g.items.forEach(function (it) { if (it !== front) it.card.classList.add('bp-gone'); });
    flyOff(front.card, dir, 280, function () {
      flip(function () {
        g.items = [];
        removeGroupIfEmpty(g);
      });
    });
  }

  function addLockNotif(n) {
    var app = n.app || 'app';
    var g = findGroup(app);
    if (!g) {
      var gel = document.createElement('div');
      gel.className = 'bp-notif-group bp-collapsed';
      var less = document.createElement('div');
      less.className = 'bp-notif-less';
      less.textContent = st.opts.t ? st.opts.t('notifShowLess') : 'Show less';
      g = { app: app, el: gel, items: [], expanded: false, less: less };
      gel.appendChild(less); // first child: stays at the top of an expanded stack
      less.addEventListener('mousedown', function (ev) { ev.preventDefault(); ev.stopPropagation(); });
      (function (grp) {
        less.addEventListener('click', function (ev) { ev.stopPropagation(); setExpanded(grp, false); });
      })(g);
      st.groups.unshift(g);
    }

    var card = document.createElement('div');
    card.className = 'bp-notif-card bp-notif-lock bp-enter';
    fillCard(card, n);
    var item = { n: n, card: card };

    flip(function () {
      g.items.unshift(item);
      g.el.insertBefore(card, g.less.nextSibling);
      while (g.items.length > MAX_PER_APP) {
        var old = g.items.pop();
        if (old.card.parentNode) old.card.parentNode.removeChild(old.card);
      }
      // newest-updated stack goes to the top of the list
      st.list.insertBefore(g.el, st.list.firstChild);
      st.list.scrollTop = 0;
      renderGroup(g);
    });

    void card.offsetWidth;
    card.classList.remove('bp-enter'); // transitions into its resting place

    makeSwipeable(card, {
      allowUp: false,
      scrollEl: st.list,
      onDismiss: function (dir) {
        if (!g.expanded && g.items.length > 1) dismissGroup(g, dir);
        else dismissItem(g, item, dir);
      },
      onTap: function () {
        if (!g.expanded && g.items.length > 1) setExpanded(g, true);
        else if (st.opts.onOpen) st.opts.onOpen(n.app);
      }
    });
  }

  // -------------------------------------------------------------------- API
  function attach(screenEl, listEl, opts) {
    if (st.bannerTimer) clearTimeout(st.bannerTimer);
    st = { screen: screenEl, list: listEl, banner: null, bannerTimer: 0, groups: [], opts: opts || {} };
    if (listEl) {
      listEl.addEventListener('wheel', function (e) {
        listEl.scrollTop += e.deltaY;
        e.preventDefault();
        e.stopPropagation();
        updateFade();
      }, { passive: false });
      listEl.addEventListener('scroll', updateFade);
      updateFade();
    }
  }

  function push(n) {
    if (!st.screen) return;
    if (st.opts.isLocked && st.opts.isLocked()) addLockNotif(n);
    else showBanner(n);
  }

  function clearAll() {
    hideBanner(null, true);
    if (st.list) st.list.innerHTML = '';
    st.groups = [];
    updateFade();
  }

  window.BeamiPhone.notifications = { attach: attach, push: push, clearAll: clearAll };
})();
