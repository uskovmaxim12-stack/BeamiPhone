// BeamiPhone (c) 2026 wserf. All rights reserved.
// Do not re-upload, redistribute or reuse without permission. See LICENSE.txt. [BP-wserf-A364B58F7647]
// BeamiPhone :: js/beamngBridge.js
//
// This is the only file that talks to Angular/BeamNG directly. It exists so
// the rest of the mod (audioPlayer.js, musicLibrary.js, ui.js) stays plain,
// framework-agnostic JS.
//
//   Lua -> UI:  guihooks.trigger('beamiPhoneToggle')       (see musicScanner.lua)
//               guihooks.trigger('beamiPhoneMusicList', {...})
//   UI  -> Lua: bngApi.engineLua("extensions.beamiphone_musicScanner.requestMusicScan()")
//
// guihooks events are delivered as normal Angular broadcasts, so any scope's
// $on() picks them up -- that's why app.js hands us its directive `scope`.

(function () {
  window.BeamiPhone = window.BeamiPhone || {};

  var hasScannedOnce = false;
  var scanTimeoutHandle = null;
  var SCAN_TIMEOUT_MS = 4000;
  var telemetryPollHandle = null;
  var TELEMETRY_POLL_MS = 1000;

  function requestTelemetry() {
    if (window.bngApi && window.bngApi.engineLua) {
      window.bngApi.engineLua(
        "extensions.load('beamiphone_musicScanner'); extensions.beamiphone_musicScanner.requestTelemetry()"
      );
    }
  }

  // Only ever polls while the Maps or Clock screen is actually visible --
  // never in the background, per the "no needless heavy loops" requirement.
  function startTelemetryPolling() {
    if (telemetryPollHandle) return;
    requestTelemetry();
    telemetryPollHandle = setInterval(requestTelemetry, TELEMETRY_POLL_MS);
  }

  function stopTelemetryPolling() {
    if (telemetryPollHandle) { clearInterval(telemetryPollHandle); telemetryPollHandle = null; }
  }

  // Lightweight watcher used for notifications: runs whenever the phone is open
  // (not only inside the Maps/Clock/Car apps) and only asks for the engine state.
  var vehWatchHandle = null;
  function requestVehState() {
    if (window.bngApi && window.bngApi.engineLua) {
      window.bngApi.engineLua(
        "extensions.load('beamiphone_musicScanner'); extensions.beamiphone_musicScanner.requestVehState()"
      );
    }
  }
  function startVehWatch() {
    if (vehWatchHandle) return;
    requestVehState();
    vehWatchHandle = setInterval(requestVehState, 1000);
  }
  function stopVehWatch() {
    if (vehWatchHandle) { clearInterval(vehWatchHandle); vehWatchHandle = null; }
  }

  var ACTIONS = { engine_start: 1, engine_stop: 1, lights: 1, hazard: 1, trunk: 1 };
  function vehicleAction(action) {
    if (!ACTIONS[action]) return;
    // remember when the phone itself started the engine, so it doesn't notify about it
    if (action === 'engine_start' || action === 'engine_stop') window.BeamiPhone.ownEngineActionAt = Date.now();
    if (window.bngApi && window.bngApi.engineLua) {
      window.bngApi.engineLua(
        "extensions.load('beamiphone_musicScanner'); extensions.beamiphone_musicScanner.vehicleAction('" + action + "')"
      );
    }
  }

  function lua(cmd) {
    if (window.bngApi && window.bngApi.engineLua) window.bngApi.engineLua(cmd);
  }

  function openMusicFolder() { lua("extensions.load('beamiphone_musicScanner'); extensions.beamiphone_musicScanner.openMusicFolder()"); }
  function requestEnv() { lua("extensions.load('beamiphone_musicScanner'); extensions.beamiphone_musicScanner.requestEnv()"); }
  function setHour(h) { lua("extensions.load('beamiphone_musicScanner'); extensions.beamiphone_musicScanner.setHour(" + (+h) + ")"); }
  function setTimeFlow(f) { lua("extensions.load('beamiphone_musicScanner'); extensions.beamiphone_musicScanner.setTimeFlow(" + (+f) + ")"); }
  function setWeather(key, v) { lua("extensions.load('beamiphone_musicScanner'); extensions.beamiphone_musicScanner.setWeather('" + String(key).replace(/[^a-z]/g, '') + "'," + (+v) + ")"); }
  function setWeatherPreset(name) { lua("extensions.load('beamiphone_musicScanner'); extensions.beamiphone_musicScanner.setWeatherPreset('" + String(name).replace(/[^a-z]/g, '') + "')"); }

  function prepareNativeMap() { lua("extensions.load('beamiphone_musicScanner'); extensions.beamiphone_musicScanner.prepareNativeMap()"); }
  // Real-time streams from Lua (car pose for the map, camera pose for spatial
  // audio). Only switched on while something actually needs them.
  var streamWant = { pose: false, listener: false };
  var streamSent = '';
  function setStreamWant(kind, on) {
    streamWant[kind] = !!on;
    var sig = streamWant.pose + ',' + streamWant.listener;
    if (sig === streamSent) return;
    streamSent = sig;
    lua("extensions.load('beamiphone_musicScanner'); extensions.beamiphone_musicScanner.setStreams(" + streamWant.pose + "," + streamWant.listener + ")");
  }

  function savePref(key, value) {
    var k = String(key).replace(/[^A-Za-z]/g, '');
    var v = typeof value === 'boolean' ? String(value) : "'" + String(value).replace(/[^A-Za-z0-9_-]/g, '') + "'";
    lua("extensions.load('beamiphone_musicScanner'); extensions.beamiphone_musicScanner.savePref('" + k + "'," + v + ")");
  }

  // Notes: the text goes to Lua inside a long-bracket string, so no escaping is needed;
  // the closing bracket sequence is defused, and a leading newline keeps the first line intact.
  function saveNotes(text) {
    var safe = String(text).slice(0, 8000).split(']==]').join('] ==]');
    lua("extensions.load('beamiphone_musicScanner'); extensions.beamiphone_musicScanner.saveNotes([==[\n" + safe + "]==])");
  }
  function requestNotes() { lua("extensions.load('beamiphone_musicScanner'); extensions.beamiphone_musicScanner.requestNotes()"); }
  // While a text field has focus the game must not treat key presses as driving input.
  function setTyping(on) { lua('if setCEFTyping then setCEFTyping(' + (on ? 'true' : 'false') + ') end'); }

  function requestNaviData() { lua("extensions.load('beamiphone_musicScanner'); extensions.beamiphone_musicScanner.requestNaviData()"); }
  function requestMap() { lua("extensions.load('beamiphone_musicScanner'); extensions.beamiphone_musicScanner.requestMap()"); }
  function requestRoute() { lua("extensions.load('beamiphone_musicScanner'); extensions.beamiphone_musicScanner.requestRoute()"); }
  var routePollHandle = null;
  function startRoutePolling() {
    if (routePollHandle) return;
    requestRoute();
    routePollHandle = setInterval(requestRoute, 1000);
  }
  function stopRoutePolling() {
    if (routePollHandle) { clearInterval(routePollHandle); routePollHandle = null; }
  }

  var envPollHandle = null;
  function startEnvPolling() {
    if (envPollHandle) return;
    requestEnv();
    envPollHandle = setInterval(requestEnv, 1000);
  }
  function stopEnvPolling() {
    if (envPollHandle) { clearInterval(envPollHandle); envPollHandle = null; }
  }

  function saveWallpaper(key) {
    if (window.bngApi && window.bngApi.engineLua) {
      window.bngApi.engineLua(
        "extensions.load('beamiphone_musicScanner'); extensions.beamiphone_musicScanner.saveWallpaper('" + String(key).replace(/[^A-Za-z0-9_-]/g, '') + "')"
      );
    }
  }

  function saveLanguage(code) {
    if (window.bngApi && window.bngApi.engineLua) {
      window.bngApi.engineLua(
        "extensions.load('beamiphone_musicScanner'); extensions.beamiphone_musicScanner.saveLanguage('" + String(code).replace(/[^A-Za-z-]/g, '') + "')"
      );
    }
  }

  function requestPrefs() {
    if (window.bngApi && window.bngApi.engineLua) {
      window.bngApi.engineLua(
        "extensions.load('beamiphone_musicScanner'); extensions.beamiphone_musicScanner.requestPrefs()"
      );
    }
  }

  function requestMusicScan() {
    console.log('[BeamiPhone] requesting music scan from Lua...');
    if (window.bngApi && window.bngApi.engineLua) {
      // extensions.load(...) is idempotent and defends against the
      // beamiphone_musicScanner extension having been unloaded on a level
      // change (garage <-> freeroam <-> career) since it was last used.
      window.bngApi.engineLua(
        "extensions.load('beamiphone_musicScanner'); extensions.beamiphone_musicScanner.requestMusicScan()"
      );
    } else {
      console.error('[BeamiPhone] bngApi.engineLua is not available!');
    }

    // Safety net: if Lua never answers (e.g. extension failed to load, typo
    // in the mod path, etc.) don't leave the screen silently blank forever --
    // show a helpful message instead after a short timeout.
    if (scanTimeoutHandle) clearTimeout(scanTimeoutHandle);
    scanTimeoutHandle = setTimeout(function () {
      console.warn('[BeamiPhone] No response from Lua after ' + SCAN_TIMEOUT_MS + 'ms.');
      if (window.BeamiPhone.ui && window.BeamiPhone.ui.onLibraryUpdated) {
        window.BeamiPhone.ui.onLibraryUpdated({ empty: true, error: 'no_response', musicDir: '' });
      }
    }, SCAN_TIMEOUT_MS);
  }

  var bridgeWired = false;

  function init(scope) {
    // BeamNG appears to re-link this directive periodically during normal
    // play (e.g. on camera view changes) without a clean scope teardown
    // first. Registering on the local `scope` every time would accumulate
    // duplicate listeners across those re-links (each real key press then
    // fires the toggle handler multiple times, and old listeners can end up
    // bound to an already-detached widget). $rootScope persists for the
    // whole game session, so registering everything there ONCE avoids all
    // of that -- guihooks events are broadcast from $rootScope anyway, so
    // any descendant scope (including $rootScope itself) receives them.
    if (bridgeWired) {
      console.log('[BeamiPhone] bridge.init(): already wired this session, skipping re-registration');
      return;
    }
    bridgeWired = true;
    var rootScope = scope.$root || scope;

    // Lua tells us to open/close the phone.
    var lastToggleAt = 0;
    rootScope.$on('beamiPhoneToggle', function () {
      console.log('[BeamiPhone] beamiPhoneToggle event received');
      var now = Date.now();
      if (now - lastToggleAt < 250) {
        console.warn('[BeamiPhone] Ignoring a duplicate beamiPhoneToggle event fired ' + (now - lastToggleAt) +
          'ms after the last one.');
        return;
      }
      lastToggleAt = now;

      try {
        var willOpen = window.BeamiPhone.ui.toggleOpen();
        console.log('[BeamiPhone] toggleOpen() -> willOpen=' + willOpen);
        // Only auto-scan the folder the first time the phone is actually opened
        // (spec #19: load at open/init, never poll every frame/second). The
        // user can still force a rescan later via the "Обновить" button.
        if (willOpen && !hasScannedOnce) {
          hasScannedOnce = true;
          requestMusicScan();
        }
      } catch (err) {
        console.error('[BeamiPhone] FATAL: exception inside toggleOpen():', err);
      }
    });

    // Lua sends us the real track list after scanning the music/ folder.
    rootScope.$on('beamiPhoneMusicList', function (event, data) {
      console.log('[BeamiPhone] received music list from Lua:', data);
      if (scanTimeoutHandle) { clearTimeout(scanTimeoutHandle); scanTimeoutHandle = null; }
      window.BeamiPhone.musicLibrary.handleScanResult(data);
    });

    // Lua sends us real vehicle/world telemetry (position, speed, heading,
    // level, in-game time of day) for the Maps and Clock apps.
    rootScope.$on('beamiPhoneTelemetry', function (event, data) {
      if (window.BeamiPhone.ui && window.BeamiPhone.ui.onTelemetry) {
        window.BeamiPhone.ui.onTelemetry(data);
      }
    });

    rootScope.$on('beamiPhoneVehState', function (event, data) {
      if (window.BeamiPhone.ui && window.BeamiPhone.ui.onVehState) window.BeamiPhone.ui.onVehState(data);
    });

    rootScope.$on('beamiPhoneEnv', function (event, data) {
      if (window.BeamiPhone.ui && window.BeamiPhone.ui.onEnv) window.BeamiPhone.ui.onEnv(data);
    });
    rootScope.$on('beamiPhoneMap', function (event, data) {
      if (window.BeamiPhone.ui && window.BeamiPhone.ui.onMapData) window.BeamiPhone.ui.onMapData(data);
    });
    rootScope.$on('beamiPhoneFolder', function (event, data) {
      if (window.BeamiPhone.ui && window.BeamiPhone.ui.onFolder) window.BeamiPhone.ui.onFolder(data);
    });
    rootScope.$on('beamiPhoneNotes', function (event, data) {
      if (window.BeamiPhone.ui && window.BeamiPhone.ui.onNotes) window.BeamiPhone.ui.onNotes(data);
    });
    rootScope.$on('beamiPhonePose', function (event, data) {
      if (window.BeamiPhone.ui && window.BeamiPhone.ui.onPose) window.BeamiPhone.ui.onPose(data);
    });
    rootScope.$on('beamiPhoneListener', function (event, data) {
      if (window.BeamiPhone.spatial && window.BeamiPhone.spatial.onListener) window.BeamiPhone.spatial.onListener(data);
    });
    rootScope.$on('beamiPhoneNaviData', function (event, data) {
      if (window.BeamiPhone.ui && window.BeamiPhone.ui.onNaviData) window.BeamiPhone.ui.onNaviData(data);
    });
    rootScope.$on('beamiPhoneRoute', function (event, data) {
      if (window.BeamiPhone.ui && window.BeamiPhone.ui.onRouteData) window.BeamiPhone.ui.onRouteData(data);
    });
    rootScope.$on('beamiPhoneMapDirty', function () {
      if (window.BeamiPhone.ui && window.BeamiPhone.ui.onMapDirty) window.BeamiPhone.ui.onMapDirty();
    });
    rootScope.$on('beamiPhoneActionResult', function (event, data) {
      if (window.BeamiPhone.ui && window.BeamiPhone.ui.onActionResult) window.BeamiPhone.ui.onActionResult(data);
    });

    // Real engine performance curve, broadcast by the game itself whenever
    // the current vehicle's engine data is (re)computed. Confirmed working
    // via the same event used by the well-known "Dragy" BeamNG mod.
    rootScope.$on('TorqueCurveChanged', function (event, data) {
      if (window.BeamiPhone.ui && window.BeamiPhone.ui.onTorqueCurve) {
        window.BeamiPhone.ui.onTorqueCurve(data);
      }
    });

    // Real-time vehicle electrics/sensor stream (throttle, airspeed,
    // odometer, ...), broadcast continuously by the game's own UI streams
    // system -- same channel the "Dragy" mod uses for 0-100/quarter-mile
    // timing. Only meaningful while a vehicle is active.
    rootScope.$on('streamsUpdate', function (event, streams) {
      if (window.BeamiPhone.ui && window.BeamiPhone.ui.onStreamsUpdate) {
        window.BeamiPhone.ui.onStreamsUpdate(streams);
      }
    });

    // Lua sends us the previously saved wallpaper choice (if any) on request.
    rootScope.$on('beamiPhonePrefs', function (event, data) {
      if (window.BeamiPhone.ui && window.BeamiPhone.ui.onPrefs) {
        window.BeamiPhone.ui.onPrefs(data);
      }
    });
    requestPrefs();

    // Keep the UI in sync with the real <audio> element at all times, even
    // while the phone is closed, so re-opening it shows the true state.
    window.BeamiPhone.audioPlayer.onStateChange(function (state) {
      window.BeamiPhone.ui.renderPlayerState(state);
    });
  }

  window.BeamiPhone.bridge = {
    init: init,
    requestMusicScan: requestMusicScan,
    startTelemetryPolling: startTelemetryPolling,
    stopTelemetryPolling: stopTelemetryPolling,
    vehicleAction: vehicleAction,
    startVehWatch: startVehWatch,
    stopVehWatch: stopVehWatch,
    openMusicFolder: openMusicFolder,
    requestMap: requestMap,
    requestNaviData: requestNaviData,
    setStreamWant: setStreamWant,
    savePref: savePref,
    saveNotes: saveNotes,
    requestNotes: requestNotes,
    setTyping: setTyping,
    prepareNativeMap: prepareNativeMap,
    requestRoute: requestRoute,
    startRoutePolling: startRoutePolling,
    stopRoutePolling: stopRoutePolling,
    requestEnv: requestEnv,
    startEnvPolling: startEnvPolling,
    stopEnvPolling: stopEnvPolling,
    setHour: setHour,
    setTimeFlow: setTimeFlow,
    setWeather: setWeather,
    setWeatherPreset: setWeatherPreset,
    saveWallpaper: saveWallpaper,
    saveLanguage: saveLanguage,
    requestPrefs: requestPrefs
  };
})();
