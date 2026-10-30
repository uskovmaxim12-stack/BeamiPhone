// BeamiPhone (c) 2026 wserf. All rights reserved.
// Do not re-upload, redistribute or reuse without permission. See LICENSE.txt. [BP-wserf-A364B58F7647]
// BeamiPhone :: js/audioPlayer.js
//
// Real HTML5 <audio> playback engine. No fake progress bars, no fake volume:
// every piece of state exposed here (currentTime, duration, isPlaying, volume)
// comes straight from the actual <audio> element's real properties/events.
//
// This module is a singleton stored on window.BeamiPhone.audioPlayer so its
// state (and the actual Audio object, and therefore the actual sound) survives
// the phone UI being opened and closed -- closing the phone never touches this
// object, it only hides the DOM.

(function () {
  window.BeamiPhone = window.BeamiPhone || {};

  var audio = new Audio();
  audio.preload = 'metadata';
  audio.volume = 0.35; // quiet by default; the slider value is remembered

  var playlist = [];      // array of track descriptor objects, see musicLibrary.js
  var currentIndex = -1;
  var listeners = [];      // functions called with the latest state snapshot
  var brokenTracks = {};   // fileName -> true, to avoid infinite retry loops
  var blobTried = {};      // fileName -> true once we already retried through a Blob
  var blobUrl = null;
  var shuffle = false;
  var repeatMode = 'all'; // 'off' | 'all' | 'one'
  var loadToken = 0;

  var MIME = { mp3: 'audio/mpeg', ogg: 'audio/ogg', wav: 'audio/wav' };

  function revokeBlob() {
    if (blobUrl) { try { URL.revokeObjectURL(blobUrl); } catch (e) {} blobUrl = null; }
  }

  function notify() {
    var state = getState();
    listeners.forEach(function (fn) {
      try { fn(state); } catch (e) { console.error('[BeamiPhone] listener error', e); }
    });
  }

  function getState() {
    return {
      playlist: playlist,
      currentIndex: currentIndex,
      currentTrack: currentIndex >= 0 ? playlist[currentIndex] : null,
      isPlaying: !audio.paused && !audio.ended,
      currentTime: isFinite(audio.currentTime) ? audio.currentTime : 0,
      duration: isFinite(audio.duration) ? audio.duration : 0,
      volume: audio.volume,
      loading: audio.readyState < 2 && currentIndex >= 0,
      shuffle: shuffle,
      repeatMode: repeatMode
    };
  }

  function setPlaylist(tracks) {
    var previousFile = currentIndex >= 0 && playlist[currentIndex] ? playlist[currentIndex].file : null;
    playlist = tracks || [];
    // A rescan (the user may have replaced a broken file) gives every track a fresh start.
    brokenTracks = {};
    blobTried = {};
    if (previousFile) {
      var idx = playlist.findIndex(function (t) { return t.file === previousFile; });
      currentIndex = idx; // keep pointing at the same track if it's still there
    }
    notify();
  }

  var needGesture = false;
  function resumeOnGesture() {
    document.removeEventListener('pointerdown', resumeOnGesture, true);
    if (needGesture) { needGesture = false; var p = audio.play(); if (p && p.catch) p.catch(function () {}); }
  }
  function armGestureResume() {
    if (needGesture) return;
    needGesture = true;
    document.addEventListener('pointerdown', resumeOnGesture, true);
  }

  function loadTrack(index, autoplay) {
    if (index < 0 || index >= playlist.length) {
      console.warn('[BeamiPhone] loadTrack: index out of range', index, playlist.length);
      return;
    }
    var track = playlist[index];
    console.log('[BeamiPhone] loading track', index, track.file, track.url);
    if (window.BeamiPhone.spatial && window.BeamiPhone.spatial.onUserPlay) window.BeamiPhone.spatial.onUserPlay();
    currentIndex = index;
    var token = ++loadToken;
    revokeBlob();

    function startPlayback() {
      audio.load();
      if (autoplay) {
        var p = audio.play();
        if (p && p.then) {
          p.then(function () {
            console.log('[BeamiPhone] play() succeeded for', track.file);
          }).catch(function (err) {
            console.error('[BeamiPhone] play() rejected for ' + track.file + ':', err && err.name, err && err.message);
            // Autoplay blocked (no recent click): start as soon as the player clicks anything.
            if (err && err.name === 'NotAllowedError') armGestureResume();
          });
        }
      }
    }

    // WAV files (and tracks the direct URL failed on) are fetched fully and
    // played from a Blob: the game's file scheme has no range/seek support,
    // which the WAV decoder needs; a Blob is always seekable.
    if (track.ext === 'wav' || blobTried[track.file]) {
      blobTried[track.file] = true;
      audio.removeAttribute('src');
      fetch(track.url)
        .then(function (resp) {
          if (!resp.ok) throw new Error('HTTP ' + resp.status);
          return resp.arrayBuffer();
        })
        .then(function (buf) {
          if (token !== loadToken) return; // user already picked another track
          blobUrl = URL.createObjectURL(new Blob([buf], { type: MIME[track.ext] || 'audio/mpeg' }));
          audio.src = blobUrl;
          startPlayback();
          notify();
        })
        .catch(function (err) {
          if (token !== loadToken) return;
          console.error('[BeamiPhone] could not load ' + track.file + ' as Blob:', err && err.message);
          markBrokenAndSkip(track);
        });
      notify();
      return;
    }

    audio.src = track.url;
    startPlayback();
    notify();
  }

  function markBrokenAndSkip(track) {
    brokenTracks[track.file] = true;
    notify();
    var idx = findNextPlayableIndex(currentIndex, 1);
    if (idx !== -1 && idx !== currentIndex) loadTrack(idx, true);
  }

  function play(index) {
    if (typeof index === 'number' && index !== currentIndex) {
      loadTrack(index, true);
      return;
    }
    if (currentIndex === -1 && playlist.length > 0) {
      loadTrack(0, true);
      return;
    }
    var p = audio.play();
    if (p && p.catch) p.catch(function (err) { console.error('[BeamiPhone] play() failed', err); });
  }

  function pause() {
    audio.pause();
  }

  function togglePlayPause() {
    if (audio.paused) { play(); } else { pause(); }
  }

  function findNextPlayableIndex(fromIndex, direction) {
    if (playlist.length === 0) return -1;
    var tried = 0;
    var idx = fromIndex;
    while (tried < playlist.length) {
      idx = (idx + direction + playlist.length) % playlist.length;
      if (!brokenTracks[playlist[idx].file]) return idx;
      tried++;
    }
    return -1; // every track is broken
  }

  function randomPlayableIndex() {
    var pool = [];
    for (var i = 0; i < playlist.length; i++) {
      if (i !== currentIndex && !brokenTracks[playlist[i].file]) pool.push(i);
    }
    return pool.length ? pool[Math.floor(Math.random() * pool.length)] : -1;
  }

  function setShuffle(on) { shuffle = !!on; notify(); }
  function toggleShuffle() { setShuffle(!shuffle); return shuffle; }
  function setRepeat(mode) { repeatMode = (mode === 'off' || mode === 'one') ? mode : 'all'; notify(); }
  function cycleRepeat() { setRepeat(repeatMode === 'all' ? 'one' : (repeatMode === 'one' ? 'off' : 'all')); return repeatMode; }

  function next() {
    var idx = (shuffle && playlist.length > 1) ? randomPlayableIndex()
      : findNextPlayableIndex(currentIndex === -1 ? -1 : currentIndex, 1);
    if (idx === -1) return;
    loadTrack(idx, true);
  }

  function previous() {
    // If we're more than 3 seconds into the track, restart it instead of
    // jumping to the previous one (standard music-player behaviour).
    if (audio.currentTime > 3) {
      audio.currentTime = 0;
      notify();
      return;
    }
    var idx = findNextPlayableIndex(currentIndex === -1 ? 0 : currentIndex, -1);
    if (idx === -1) return;
    loadTrack(idx, true);
  }

  function seekToFraction(fraction) {
    if (!isFinite(audio.duration) || audio.duration <= 0) return;
    fraction = Math.min(1, Math.max(0, fraction));
    audio.currentTime = fraction * audio.duration;
    notify();
  }

  function setVolume(v) {
    audio.volume = Math.min(1, Math.max(0, v));
    notify();
  }

  function onStateChange(fn) {
    listeners.push(fn);
    return function unsubscribe() {
      var i = listeners.indexOf(fn);
      if (i !== -1) listeners.splice(i, 1);
    };
  }

  audio.addEventListener('play', notify);
  audio.addEventListener('pause', notify);
  audio.addEventListener('timeupdate', notify);
  audio.addEventListener('loadedmetadata', notify);
  audio.addEventListener('volumechange', notify);
  audio.addEventListener('waiting', notify);
  audio.addEventListener('canplay', notify);

  // Advance exactly once per track, whether the 'ended' event arrives or only the watchdog below sees the end.
  var advancedToken = -1;
  var watchdogToken = -1, watchdogTimer = null;
  function advanceAfterEnd(reason) {
    if (advancedToken === loadToken) return;
    advancedToken = loadToken;
    console.log('[BeamiPhone] track finished (' + reason + '), advancing');
    if (repeatMode === 'one') {
      advancedToken = -1;
      audio.currentTime = 0;
      var p = audio.play();
      if (p && p.catch) p.catch(function () {});
      return;
    }
    // Repeat off: stop after the last track (not when shuffling, which just keeps going).
    if (repeatMode === 'off' && !shuffle && currentIndex === playlist.length - 1) { notify(); return; }
    next();
  }

  audio.addEventListener('ended', function () { advanceAfterEnd('ended'); });
  // Any new start of playback (Play pressed again, repeat one, ...) re-arms the guard for that track.
  audio.addEventListener('play', function () { advancedToken = -1; watchdogToken = -1; });

  // Safety net: some streams from the game's file server never fire 'ended'. If the track is within a
  // second of its end, arm a one-shot timer that advances if nothing else did.
  audio.addEventListener('timeupdate', function () {
    var d = audio.duration;
    if (!isFinite(d) || d <= 1 || audio.paused) return;
    var remain = d - audio.currentTime;
    if (remain < 1 && watchdogToken !== loadToken) {
      watchdogToken = loadToken;
      var tk = loadToken;
      clearTimeout(watchdogTimer);
      watchdogTimer = setTimeout(function () {
        if (tk !== loadToken) return;
        var rem = audio.duration - audio.currentTime;
        if ((audio.ended || !audio.paused) && rem < 2) advanceAfterEnd('watchdog');
      }, Math.max(0, remain * 1000) + 1500);
    }
  });

  audio.addEventListener('error', function () {
    var mediaError = audio.error;
    var codeNames = { 1: 'MEDIA_ERR_ABORTED', 2: 'MEDIA_ERR_NETWORK', 3: 'MEDIA_ERR_DECODE', 4: 'MEDIA_ERR_SRC_NOT_SUPPORTED' };
    console.error(
      '[BeamiPhone] <audio> error. code=' + (mediaError ? mediaError.code : '?') +
      ' (' + (mediaError ? codeNames[mediaError.code] : 'unknown') + '), src=' + audio.currentSrc
    );
    if (!audio.getAttribute('src')) return; // we cleared it ourselves while switching to a Blob
    var cur = currentIndex >= 0 ? playlist[currentIndex] : null;
    if (cur && !blobTried[cur.file]) {
      console.warn('[BeamiPhone] direct playback failed, retrying ' + cur.file + ' through a Blob');
      blobTried[cur.file] = true;
      loadTrack(currentIndex, true);
      return;
    }
    if (cur) {
      console.error('[BeamiPhone] Unable to play track: ' + cur.file);
      markBrokenAndSkip(cur);
    }
  });

  function updateTrackMeta(fileName, patch) {
    var idx = playlist.findIndex(function (t) { return t.file === fileName; });
    if (idx === -1) return;
    playlist[idx] = Object.assign({}, playlist[idx], patch);
    notify();
  }

  window.BeamiPhone.audioPlayer = {
    setPlaylist: setPlaylist,
    updateTrackMeta: updateTrackMeta,
    play: play,
    pause: pause,
    togglePlayPause: togglePlayPause,
    next: next,
    previous: previous,
    seekToFraction: seekToFraction,
    setVolume: setVolume,
    onStateChange: onStateChange,
    getState: getState,
    setShuffle: setShuffle,
    toggleShuffle: toggleShuffle,
    setRepeat: setRepeat,
    cycleRepeat: cycleRepeat,
    getAudioElement: function () { return audio; },
    isTrackBroken: function (file) { return !!brokenTracks[file]; }
  };
})();
