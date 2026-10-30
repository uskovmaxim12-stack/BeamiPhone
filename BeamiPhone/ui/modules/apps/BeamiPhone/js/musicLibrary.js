// BeamiPhone (c) 2026 wserf. All rights reserved.
// Do not re-upload, redistribute or reuse without permission. See LICENSE.txt. [BP-wserf-A364B58F7647]
// BeamiPhone :: js/musicLibrary.js
//
// Turns the raw file list that Lua found on disk (via FS:findFiles) into real
// track objects the UI can show and the audio engine can play. Nothing here
// is hardcoded: if the music/ folder is empty, the playlist is empty.
//
// Metadata strategy (see spec #11):
//   1. Try to read real ID3v2 tags (Title/Artist/Album/embedded cover) directly
//      from the mp3 bytes, using a small built-in parser (no external
//      libraries / no internet access needed).
//   2. If tags are missing/unreadable (also normal for .ogg/.wav in this first
//      version), fall back to parsing the filename "Artist - Title.ext".
//   3. Cover art fallback order: embedded ID3 cover -> song.jpg/song.png next
//      to the file -> cover.jpg/cover.png for the whole folder -> generic
//      placeholder cover.

(function () {
  window.BeamiPhone = window.BeamiPhone || {};

  var musicDir = '/ui/modules/apps/BeamiPhone/music/';
  var folderCoverUrl = null;
  var displayPath = '';
  var lastError = null;

  // "Album/Song name.mp3" -> "Album/Song%20name.mp3" (encode each path segment)
  function encodePath(p) {
    return String(p).split('/').map(encodeURIComponent).join('/');
  }

  function baseName(p) {
    return String(p).split('/').pop();
  }

  function stripExt(fileName) {
    return fileName.replace(/\.[^/.]+$/, '');
  }

  // Fallback: "Artist - Title.mp3" -> {artist:"Artist", title:"Title"}
  function parseFromFileName(fileName) {
    var base = stripExt(fileName);
    var parts = base.split(' - ');
    if (parts.length >= 2) {
      return {
        artist: parts[0].trim() || 'Unknown Artist',
        title: parts.slice(1).join(' - ').trim() || base
      };
    }
    return { artist: 'Unknown Artist', title: base };
  }

  // ---- Minimal ID3v2.2 / v2.3 / v2.4 reader -------------------------------
  // Reads only what we need: TIT2/TT2 (title), TPE1/TP1 (artist),
  // TALB/TAL (album) and APIC/PIC (embedded cover image).
  function readSynchsafeOrRaw(bytes, offset, len, synchsafe) {
    var value = 0;
    for (var i = 0; i < len; i++) {
      value = synchsafe ? (value << 7) | (bytes[offset + i] & 0x7f)
                         : (value << 8) | bytes[offset + i];
    }
    return value;
  }

  function readTextFrame(bytes, start, size) {
    if (size <= 0) return '';
    var encoding = bytes[start];
    var textStart = start + 1;
    var textLen = size - 1;
    try {
      if (encoding === 1 || encoding === 2) {
        // UTF-16 (with or without BOM) — good enough for typical tags.
        var arr = bytes.slice(textStart, textStart + textLen);
        var str = new TextDecoder('utf-16').decode(arr);
        return str.replace(/\u0000/g, '').trim();
      }
      // 0 = Latin1, 3 = UTF-8
      var arr8 = bytes.slice(textStart, textStart + textLen);
      var decoder = new TextDecoder(encoding === 3 ? 'utf-8' : 'latin1');
      return decoder.decode(arr8).replace(/\u0000/g, '').trim();
    } catch (e) {
      return '';
    }
  }

  function readApicFrame(bytes, start, size, isV22) {
    try {
      var pos = start;
      var encoding = bytes[pos]; pos += 1;
      var mime;
      if (isV22) {
        mime = 'image/' + (String.fromCharCode(bytes[pos], bytes[pos + 1], bytes[pos + 2]) === 'PNG' ? 'png' : 'jpeg');
        pos += 3;
      } else {
        var mimeEnd = pos;
        while (bytes[mimeEnd] !== 0 && mimeEnd < start + size) mimeEnd++;
        mime = new TextDecoder('latin1').decode(bytes.slice(pos, mimeEnd)) || 'image/jpeg';
        pos = mimeEnd + 1;
      }
      pos += 1; // picture type byte
      // Skip the null-terminated description string.
      if (encoding === 1 || encoding === 2) {
        while (!(bytes[pos] === 0 && bytes[pos + 1] === 0) && pos < start + size) pos += 2;
        pos += 2;
      } else {
        while (bytes[pos] !== 0 && pos < start + size) pos++;
        pos += 1;
      }
      var imgBytes = bytes.slice(pos, start + size);
      var blob = new Blob([imgBytes], { type: mime });
      return URL.createObjectURL(blob);
    } catch (e) {
      return null;
    }
  }

  function parseId3(arrayBuffer) {
    var bytes = new Uint8Array(arrayBuffer);
    if (bytes.length < 10 || bytes[0] !== 0x49 || bytes[1] !== 0x44 || bytes[2] !== 0x33) {
      return null; // no "ID3" header -> no ID3v2 tag present
    }
    var majorVersion = bytes[3]; // 2, 3 or 4
    var tagSize = readSynchsafeOrRaw(bytes, 6, 4, true) + 10;
    var result = { title: null, artist: null, album: null, coverUrl: null };

    if (majorVersion === 2) {
      var pos2 = 10;
      while (pos2 + 6 <= tagSize && pos2 + 6 <= bytes.length) {
        var id2 = String.fromCharCode(bytes[pos2], bytes[pos2 + 1], bytes[pos2 + 2]);
        if (id2 === '\0\0\0') break;
        var size2 = readSynchsafeOrRaw(bytes, pos2 + 3, 3, false);
        var frameStart2 = pos2 + 6;
        if (size2 <= 0 || frameStart2 + size2 > bytes.length) break;
        if (id2 === 'TT2') result.title = readTextFrame(bytes, frameStart2, size2);
        else if (id2 === 'TP1') result.artist = readTextFrame(bytes, frameStart2, size2);
        else if (id2 === 'TAL') result.album = readTextFrame(bytes, frameStart2, size2);
        else if (id2 === 'PIC') result.coverUrl = readApicFrame(bytes, frameStart2, size2, true);
        pos2 = frameStart2 + size2;
      }
      return result;
    }

    // v2.3 / v2.4
    var pos = 10;
    if (bytes[5] & 0x40) { // extended header present
      var extSize = readSynchsafeOrRaw(bytes, 10, 4, majorVersion === 4);
      pos += extSize + 4;
    }
    while (pos + 10 <= tagSize && pos + 10 <= bytes.length) {
      var id = String.fromCharCode(bytes[pos], bytes[pos + 1], bytes[pos + 2], bytes[pos + 3]);
      if (id === '\0\0\0\0') break;
      var size = readSynchsafeOrRaw(bytes, pos + 4, 4, majorVersion === 4);
      var frameStart = pos + 10;
      if (size <= 0 || frameStart + size > bytes.length) break;

      if (id === 'TIT2') result.title = readTextFrame(bytes, frameStart, size);
      else if (id === 'TPE1') result.artist = readTextFrame(bytes, frameStart, size);
      else if (id === 'TALB') result.album = readTextFrame(bytes, frameStart, size);
      else if (id === 'APIC') result.coverUrl = readApicFrame(bytes, frameStart, size, false);

      pos = frameStart + size;
    }
    return result;
  }

  // Tags are read in the background, ONE file at a time, after a short delay so they never
  // compete with playback for the game's file server. Results are cached per file URL, so
  // re-opening the music app (which rescans the folder) does not read anything again.
  var tagCache = {};

  function applyTagPatch(track, patch) {
    if (patch && Object.keys(patch).length && window.BeamiPhone.audioPlayer.updateTrackMeta) {
      window.BeamiPhone.audioPlayer.updateTrackMeta(track.file, patch);
    }
  }

  function enrichTrackWithId3(track) {
    if (track.ext !== 'mp3') return Promise.resolve();
    if (tagCache[track.url]) { applyTagPatch(track, tagCache[track.url]); return Promise.resolve(); }
    return fetch(track.url)
      .then(function (resp) {
        if (!resp.ok) throw new Error('HTTP ' + resp.status);
        return resp.arrayBuffer();
      })
      .then(function (buf) {
        var tags = parseId3(buf);
        var patch = {};
        if (tags) {
          if (tags.title) patch.title = tags.title;
          if (tags.artist) patch.artist = tags.artist;
          if (tags.album) patch.album = tags.album;
          if (tags.coverUrl) patch.coverUrl = tags.coverUrl;
        }
        tagCache[track.url] = patch;
        applyTagPatch(track, patch);
      })
      .catch(function (e) {
        tagCache[track.url] = {};
        console.warn('[BeamiPhone] Could not read ID3 tags for ' + track.file, e);
      });
  }

  var enrichGeneration = 0;
  function enrichAll(tracks) {
    var gen = ++enrichGeneration; // a newer scan cancels the older queue
    var i = 0;
    function step() {
      if (gen !== enrichGeneration || i >= tracks.length) return;
      enrichTrackWithId3(tracks[i++]).then(step);
    }
    setTimeout(step, 1500);
  }

  function handleScanResult(data) {
    lastError = data && data.error ? data.error : null;
    musicDir = (data && data.musicDir) || musicDir;
    displayPath = (data && data.displayPath) || displayPath;
    folderCoverUrl = (data && data.folderCover)
      ? ((data.folderCoverDir || musicDir) + encodePath(data.folderCover)) : null;

    var rawTracks = (data && data.tracks) || [];

    var tracks = rawTracks.map(function (t) {
      var fallback = parseFromFileName(baseName(t.file));
      var dir = t.dir || musicDir;
      return {
        file: t.file,
        ext: t.ext,
        url: dir + encodePath(t.file),
        title: fallback.title,
        artist: fallback.artist,
        album: null,
        coverUrl: t.coverFile ? (dir + encodePath(t.coverFile)) : folderCoverUrl
      };
    });

    window.BeamiPhone.audioPlayer.setPlaylist(tracks);

    // Enrich asynchronously; UI already has something sensible to show meanwhile.
    enrichAll(tracks);

    if (window.BeamiPhone.ui && window.BeamiPhone.ui.onLibraryUpdated) {
      window.BeamiPhone.ui.onLibraryUpdated({ empty: tracks.length === 0, error: lastError, musicDir: musicDir, displayPath: displayPath });
    }
  }

  window.BeamiPhone.musicLibrary = {
    handleScanResult: handleScanResult,
    getMusicDir: function () { return musicDir; }
  };
})();
