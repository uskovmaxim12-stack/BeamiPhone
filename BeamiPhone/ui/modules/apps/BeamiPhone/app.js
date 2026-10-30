// BeamiPhone (c) 2026 wserf. All rights reserved.
(function () {
  console.log('[BeamiPhone] app.js executing');
  var BASE = '/ui/modules/apps/BeamiPhone/';
  var CSS_FILES = [
    BASE + 'styles/phone.css', BASE + 'styles/home.css', BASE + 'styles/music.css',
    BASE + 'styles/extra.css', BASE + 'styles/notifications.css', BASE + 'styles/island.css',
    BASE + 'styles/animations.css', BASE + 'styles/enhancements.css'
  ];
  var JS_FILES = [
    BASE + 'js/audioPlayer.js', BASE + 'js/musicLibrary.js', BASE + 'js/beamngBridge.js',
    BASE + 'js/spatialAudio.js', BASE + 'js/notifications.js', BASE + 'js/island.js',
    BASE + 'js/ui.js', BASE + 'js/radio.js?v=6', BASE + 'js/enhancements.js?v=2'
  ];
  function loadCss(files) {
    files.forEach(function (href) {
      if (document.querySelector('link[data-beamiphone][href="' + href + '"]')) return;
      var link = document.createElement('link'); link.rel = 'stylesheet'; link.type = 'text/css';
      link.href = href; link.setAttribute('data-beamiphone', '1'); document.head.appendChild(link);
    });
  }
  function loadScriptsSequential(files, onDone) {
    var i = 0;
    function next() {
      if (i >= files.length) { onDone(); return; }
      var src = files[i++];
      if (window.__beamiPhoneLoaded && window.__beamiPhoneLoaded[src]) { next(); return; }
      var script = document.createElement('script'); script.src = src; script.async = false;
      script.onload = function () { window.__beamiPhoneLoaded = window.__beamiPhoneLoaded || {}; window.__beamiPhoneLoaded[src] = true; next(); };
      script.onerror = function () { console.error('[BeamiPhone] Failed to load script: ' + src); next(); };
      document.head.appendChild(script);
    }
    next();
  }
  if (!window.__beamiPhoneAssetsPromise) {
    loadCss(CSS_FILES);
    window.__beamiPhoneAssetsPromise = new Promise(function (resolve) { loadScriptsSequential(JS_FILES, resolve); });
  }
  angular.module('beamng.apps').directive('beamiPhoneApp', [function () {
    return {
      template: '<div class="beamiphone-app-container"></div>', replace: true, restrict: 'EA', scope: true,
      link: function (scope, element) {
        window.__beamiPhoneAssetsPromise.then(function () {
          if (!window.BeamiPhone || !window.BeamiPhone.ui) { console.error('[BeamiPhone] FATAL: UI assets failed to load.'); return; }
          try {
            var rootScope = scope.$root || scope;
            if (window.BeamiPhone.radio && window.BeamiPhone.radio.attachScope) window.BeamiPhone.radio.attachScope(rootScope);
            window.BeamiPhone.ui.mount(element[0]);
            window.BeamiPhone.bridge.init(scope);
            if (window.BeamiPhone.enhancements && window.BeamiPhone.enhancements.attach) window.BeamiPhone.enhancements.attach(element[0]);
            console.log('[BeamiPhone] mount + bridge init completed successfully');
          } catch (err) { console.error('[BeamiPhone] FATAL: exception during mount/init:', err); }
        }).catch(function (err) { console.error('[BeamiPhone] FATAL: asset loading promise rejected:', err); });
        scope.$on('$destroy', function () {
          if (window.BeamiPhone && window.BeamiPhone.ui && window.BeamiPhone.ui.unmount) window.BeamiPhone.ui.unmount(element[0]);
        });
      }
    };
  }]);
})();
