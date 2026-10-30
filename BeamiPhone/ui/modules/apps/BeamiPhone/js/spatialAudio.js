// BeamiPhone (c) 2026 wserf. All rights reserved.
// Do not re-upload, redistribute or reuse without permission. See LICENSE.txt. [BP-wserf-A364B58F7647]
// BeamiPhone :: js/spatialAudio.js
//
// Makes the music sound like it comes from the car's speakers instead of from
// inside your head. The stereo signal is split into a left and a right
// "speaker", each placed at a real position in the cabin (dashboard/door height)
// and rendered with the browser's HRTF 3D panner relative to where the CAMERA
// is and where it is looking. So: look left in the cockpit and the speakers
// swing around you; use an external camera and the music sits on the car,
// gets quieter with distance and muffled by the body.
//
// The game gives us the camera + car pose (Lua pushes `beamiPhoneListener`);
// if it can't, a fixed "driver seat, speakers in front" placement is used.
// Everything here is plain Web Audio on the same <audio> element the player
// already uses; turning it off routes the sound straight to the output again.

(function () {
  window.BeamiPhone = window.BeamiPhone || {};

  // speaker offsets from the car origin: right, forward, up (metres)
  var SPEAKERS = [
    { r: -0.72, f: 0.35, u: 0.15 }, // left
    { r: 0.72, f: 0.35, u: 0.15 }   // right
  ];
  // listener-space fallback (x right, y up, z = -forward): in front, left and right
  var FALLBACK = [[-0.75, -0.05, -1.0], [0.75, -0.05, -1.0]];
  // ---- car-audio voicing (all in one place) ----
  var BASS_SHELF_DB = 3.5;     // low shelf @ 90 Hz: weight of the bass
  var BASS_SUB_DB = 1.6;       // peak @ 46 Hz: depth / "pressure" in the chest
  var CABIN_RES_DB = 0.8;     // gentle cabin resonance @ 82 Hz: the bass you feel in the seat
  var BASS_HARMONICS = 0.1;   // soft-saturated lows, so the bass reads even on small speakers
  var WIDTH = 1.18;           // side signal above 300 Hz (bass stays centred and tight)
  var MUD_DB = -2.8;          // 300 Hz: keeps the boosted bass from turning boxy
  var VOCAL_DB = 3;           // 2.6 kHz on the CENTRE signal only: vocals locked on the dash, sides stay open
  var MIDBODY_DB = 1;         // 1.2 kHz: body of voices and instruments
  var SIBIL_DB = -1.2;        // 6.5 kHz: softens harsh "s" and cymbal edge
  var AIR_DB = 1.6;           // 10 kHz shelf: soft, clean detail
  var SIDE_AIR_DB = 2;        // 8 kHz on the SIDE signal: airy, wide top end
  // adaptive loudness (like Vehicle Noise Compensation in premium cars): the quieter
  // you listen and the faster you drive (more road noise), the more bass/air/voice
  // the system adds, so the music keeps its balance
  var ADAPT_BASS_DB = 1.5, ADAPT_AIR_DB = 2, ADAPT_VOCAL_DB = 1.5, ADAPT_GAIN = 0.12;
  var INSIDE_RADIUS = 2.3; // camera closer than this to the car = "in the cabin"

  function sub(a, b) { return [a[0] - b[0], a[1] - b[1], a[2] - b[2]]; }
  function dot(a, b) { return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]; }
  function cross(a, b) { return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]; }
  function norm(a) { var l = Math.sqrt(dot(a, a)) || 1; return [a[0] / l, a[1] / l, a[2] / l]; }

  function makeSatCurve() {
    var n = 2048, c = new Float32Array(n), k = 2.4, norm = Math.tanh(k);
    for (var i = 0; i < n; i++) { var x = i * 2 / (n - 1) - 1; c[i] = Math.tanh(k * x) / norm; }
    return c;
  }

  function setParam(param, value, ctx, tau) {
    if (!param) return;
    try { param.setTargetAtTime(value, ctx.currentTime, tau || 0.04); } catch (e) { param.value = value; }
  }

  // Builds:
  //   input -> stereo up-mix -+-> direct stereo (keeps the track clean and full)  -+
  //                           +-> L/R split -> two HRTF "speakers" (the 3D layer) -+-> cabin voicing
  // -> limiter -> destination. Returns control functions.
  function createGraph(ctx, input, destination) {
    var up = ctx.createGain();
    up.channelCount = 2; up.channelCountMode = 'explicit'; up.channelInterpretation = 'speakers';
    input.connect(up);

    // 1) direct, untouched stereo: this is what keeps the sound clear
    var direct = ctx.createGain(); direct.gain.value = 0.62;
    up.connect(direct);

    // 2) spatial layer: two virtual speakers placed in the cabin
    var split = ctx.createChannelSplitter(2);
    up.connect(split);
    var spatial = ctx.createGain(); spatial.gain.value = 0.62;
    var panners = [];
    for (var i = 0; i < 2; i++) {
      var g = ctx.createGain();
      split.connect(g, i);
      var p = ctx.createPanner();
      p.panningModel = 'HRTF';
      p.distanceModel = 'inverse';
      p.refDistance = 1;
      p.maxDistance = 10000;
      p.rolloffFactor = 0.55;
      g.connect(p);
      p.connect(spatial);
      panners.push(p);
    }
    // HRTF filtering dulls the top end a little; give it back
    var air = ctx.createBiquadFilter(); air.type = 'highshelf'; air.frequency.value = 6500; air.gain.value = 3;
    spatial.connect(air);

    var mix = ctx.createGain();
    direct.connect(mix);
    air.connect(mix);

    function biq(type, f, q, gain) {
      var n = ctx.createBiquadFilter();
      n.type = type; n.frequency.value = f; if (q) n.Q.value = q; if (gain !== undefined) n.gain.value = gain;
      return n;
    }
    function gn(v) { var n = ctx.createGain(); n.gain.value = v; return n; }

    // 1) the "envelope": mid/side widening. Everything above 300 Hz gets a little
    //    wider, the bass stays centred (tight, solid). No delay, no reverb.
    var msSplit = ctx.createChannelSplitter(2);
    mix.connect(msSplit);
    var mid = gn(1), side = gn(1), sideInv = gn(-1);
    var gLm = gn(0.5), gRm = gn(0.5), gLs = gn(0.5), gRs = gn(-0.5);
    msSplit.connect(gLm, 0); msSplit.connect(gRm, 1); gLm.connect(mid); gRm.connect(mid);
    msSplit.connect(gLs, 0); msSplit.connect(gRs, 1); gLs.connect(side); gRs.connect(side);
    var sideHP = biq('highpass', 300, 0.7), sideGain = gn(WIDTH), sideAir = biq('highshelf', 8000, 0, SIDE_AIR_DB);
    side.connect(sideHP); sideHP.connect(sideGain); sideGain.connect(sideAir); sideAir.connect(sideInv);
    var vocalC = biq('peaking', 2600, 0.8, VOCAL_DB);   // centre channel presence (vocals)
    mid.connect(vocalC);
    var msMerge = ctx.createChannelMerger(2);
    vocalC.connect(msMerge, 0, 0); vocalC.connect(msMerge, 0, 1);
    sideAir.connect(msMerge, 0, 0); sideInv.connect(msMerge, 0, 1);

    // 2) Linkwitz-Riley crossover at 120 Hz: lows and the rest are shaped separately
    var lowA = biq('lowpass', 120, 0.7071), lowB = biq('lowpass', 120, 0.7071);
    var hiA = biq('highpass', 120, 0.7071), hiB = biq('highpass', 120, 0.7071);
    msMerge.connect(lowA); lowA.connect(lowB);
    msMerge.connect(hiA); hiA.connect(hiB);

    var sum = gn(1);

    // 3) bass: deep, dense, elastic. Clean sub rumble, a slow compressor for the
    //    "springy" feel, shelf + sub + cabin-resonance shaping, plus soft harmonics.
    var lowHP = biq('highpass', 32, 0.7);
    var lowComp = ctx.createDynamicsCompressor();
    lowComp.threshold.value = -24; lowComp.knee.value = 10; lowComp.ratio.value = 3; lowComp.attack.value = 0.02; lowComp.release.value = 0.16;
    var lowMakeup = gn(0.95); // bass keeps its shape, but doesn't swamp the mids
    lowB.connect(lowHP); lowHP.connect(lowComp); lowComp.connect(lowMakeup);
    var bassShelf = biq('lowshelf', 90, 0, BASS_SHELF_DB);
    var bassSub = biq('peaking', 48, 0.55, BASS_SUB_DB);
    var cabinRes = biq('peaking', 82, 0.6, CABIN_RES_DB);
    lowMakeup.connect(bassShelf); bassShelf.connect(bassSub); bassSub.connect(cabinRes); cabinRes.connect(sum);
    var shaper = ctx.createWaveShaper(); shaper.curve = makeSatCurve(); shaper.oversample = '4x';
    var enhGain = gn(BASS_HARMONICS);
    lowB.connect(shaper); shaper.connect(enhGain); enhGain.connect(sum);

    // 4) everything above: de-box, vocal presence, softened edge, clean air
    var mud = biq('peaking', 260, 0.8, MUD_DB);
    var midBody = biq('peaking', 1200, 0.9, MIDBODY_DB);
    var sibil = biq('peaking', 6500, 1.2, SIBIL_DB);
    var airShelf = biq('highshelf', 10000, 0, AIR_DB);
    hiB.connect(mud); mud.connect(midBody); midBody.connect(sibil); sibil.connect(airShelf); airShelf.connect(sum);

    // (no bus compressor on purpose: it reacted to the bass and pushed the vocals down)

    var body = ctx.createBiquadFilter();       // what the cabin / body lets through
    body.type = 'lowpass'; body.frequency.value = 20000; body.Q.value = 0.5;
    sum.connect(body);

    var MASTER = 0.84;
    var master = ctx.createGain(); master.gain.value = MASTER;
    var limiter = ctx.createDynamicsCompressor();   // transparent safety limiter, not a "loudness" compressor
    limiter.threshold.value = -1.5; limiter.knee.value = 2; limiter.ratio.value = 20; limiter.attack.value = 0.002; limiter.release.value = 0.1;
    body.connect(master);
    master.connect(limiter); limiter.connect(destination);

    // ---- adaptive loudness (noise compensation) ----
    var vol = 0.7, speedKmh = 0, lastCar = null, lastT = 0;
    function adapt() {
      var noise = Math.min(1, speedKmh / 140);          // road / wind noise grows with speed
      var quiet = Math.min(1, Math.max(0, 1 - vol));    // equal-loudness: quieter -> thinner bass/treble
      var need = Math.min(1, 0.55 * quiet + 0.9 * noise);
      setParam(bassShelf.gain, BASS_SHELF_DB + ADAPT_BASS_DB * need, ctx, 0.6);
      setParam(airShelf.gain, AIR_DB + ADAPT_AIR_DB * need, ctx, 0.6);
      setParam(vocalC.gain, VOCAL_DB + ADAPT_VOCAL_DB * need, ctx, 0.6);
      setParam(master.gain, MASTER * (1 + ADAPT_GAIN * need), ctx, 0.6);
    }
    function trackSpeed(car) {
      var now = (typeof performance !== 'undefined' ? performance.now() : Date.now());
      if (lastCar && now > lastT) {
        var dt = (now - lastT) / 1000;
        if (dt > 0.02 && dt < 1.5) {
          var dx = car[0] - lastCar[0], dy = car[1] - lastCar[1], dz = car[2] - lastCar[2];
          var v = Math.sqrt(dx * dx + dy * dy + dz * dz) / dt * 3.6;
          if (v < 400) speedKmh += (v - speedKmh) * 0.25; // smoothed
        }
      }
      lastCar = [car[0], car[1], car[2]]; lastT = now;
    }

    function place(idx, x, y, z) {
      var pn = panners[idx];
      if (pn.positionX) {
        setParam(pn.positionX, x, ctx); setParam(pn.positionY, y, ctx); setParam(pn.positionZ, z, ctx);
      } else if (pn.setPosition) {
        pn.setPosition(x, y, z);
      }
    }

    // inside: clean + a little room. Outside: only the 3D layer (it carries the
    // distance loss), muffled by the body, unless a door is open, then the music
    // leaks out clearly.
    function setInside(inside, dist, doorsOpen) {
      var far = Math.min(1, Math.max(0, (dist - INSIDE_RADIUS) / 25));
      var cutoff = inside ? 20000 : (doorsOpen ? 11000 - far * 3000 : 2600 - far * 1500);
      setParam(body.frequency, cutoff, ctx, 0.12);
      setParam(direct.gain, inside ? 0.62 : 0, ctx, 0.12);
      setParam(spatial.gain, inside ? 0.62 : (doorsOpen ? 1.15 : 0.85), ctx, 0.12);
    }

    return {
      // pose = { cam:[x,y,z], f:[..], u:[..], car:[..], cf:[..], cu:[..], doors:bool }
      setPose: function (pose) {
        var f = norm(pose.f), u = norm(pose.u), right = norm(cross(f, u));
        var cf = norm(pose.cf), cu = norm(pose.cu), cr = norm(cross(cf, cu));
        for (var i = 0; i < 2; i++) {
          var s = SPEAKERS[i];
          var world = [
            pose.car[0] + cr[0] * s.r + cf[0] * s.f + cu[0] * s.u,
            pose.car[1] + cr[1] * s.r + cf[1] * s.f + cu[1] * s.u,
            pose.car[2] + cr[2] * s.r + cf[2] * s.f + cu[2] * s.u
          ];
          var rel = sub(world, pose.cam);
          place(i, dot(rel, right), dot(rel, u), -dot(rel, f));
        }
        trackSpeed(pose.car);
        adapt();
        var dv = sub(pose.cam, pose.car);
        var d = Math.sqrt(dot(dv, dv));
        setInside(d < INSIDE_RADIUS, d, !!pose.doors);
      },
      setFallback: function () {
        place(0, FALLBACK[0][0], FALLBACK[0][1], FALLBACK[0][2]);
        place(1, FALLBACK[1][0], FALLBACK[1][1], FALLBACK[1][2]);
        setInside(true, 0, false);
      },
      setVolume: function (v) { vol = v; adapt(); },
      input: up
    };
  }

  window.BeamiPhone.createSpatialGraph = createGraph; // exposed so it can be tested offline

  // ---- live wiring to the player's <audio> element ----------------------
  var enabled = true;
  var ctx = null, srcNode = null, graph = null, failed = false;
  var analyser = null, anaBuf = null; // read-only tap for the Dynamic Island waveform
  var lastPoseAt = 0;

  function applyRouting() {
    if (!ctx || !srcNode) return;
    try { srcNode.disconnect(); } catch (e) {}
    if (enabled && graph) srcNode.connect(graph.input);
    else srcNode.connect(ctx.destination);
    if (analyser) { try { srcNode.connect(analyser); } catch (e) {} }
  }

  function ensure() {
    if (failed || ctx) return !!ctx;
    var Ctor = window.AudioContext || window.webkitAudioContext;
    var audio = window.BeamiPhone.audioPlayer && window.BeamiPhone.audioPlayer.getAudioElement
      ? window.BeamiPhone.audioPlayer.getAudioElement() : null;
    if (!Ctor || !audio) { failed = true; return false; }
    try {
      ctx = new Ctor({ latencyHint: 'playback' });
      srcNode = ctx.createMediaElementSource(audio);
      try {
        analyser = ctx.createAnalyser();
        analyser.fftSize = 512;
        analyser.smoothingTimeConstant = 0.4;
        analyser.minDecibels = -85; analyser.maxDecibels = -25;
        anaBuf = new Uint8Array(analyser.frequencyBinCount);
        var sink = ctx.createGain(); // silent: keeps the analyser pulled without adding sound
        sink.gain.value = 0;
        analyser.connect(sink); sink.connect(ctx.destination);
      } catch (e3) { analyser = null; }
      graph = createGraph(ctx, srcNode, ctx.destination);
      graph.setFallback();
      graph.setVolume(audio.volume);
      audio.addEventListener('volumechange', function () { if (graph) graph.setVolume(audio.volume); });
      applyRouting();
      console.log('[BeamiPhone] spatial audio ready');
    } catch (err) {
      console.error('[BeamiPhone] spatial audio setup failed, using plain audio:', err && err.message);
      if (ctx && srcNode) { try { srcNode.disconnect(); srcNode.connect(ctx.destination); } catch (e2) {} }
      enabled = false;
      failed = !srcNode; // if the media source already exists we keep plain routing through it
    }
    return !!ctx;
  }

  function wantListenerStream(playing) {
    var b = window.BeamiPhone.bridge;
    if (b && b.setStreamWant) b.setStreamWant('listener', enabled && !failed && playing);
  }

  window.BeamiPhone.spatial = {
    isEnabled: function () { return enabled && !failed; },
    // n band levels 0..1 of what is really playing (null if Web Audio isn't running)
    getLevels: function (n) {
      if (!analyser || !ctx || ctx.state !== 'running') return null;
      analyser.getByteFrequencyData(anaBuf);
      // log-spaced bands (fftSize 512 => ~94 Hz per bin): ~94-190, -380, -760, -1.5k, -3k, -6.8k Hz
      var edges = [1, 2, 4, 8, 16, 32, 72], out = [], i, j;
      for (i = 0; i < n; i++) {
        var a = edges[Math.min(i, edges.length - 2)], b = edges[Math.min(i + 1, edges.length - 1)], sum = 0;
        for (j = a; j < b; j++) sum += anaBuf[j];
        out.push(Math.min(1, sum / Math.max(1, b - a) / 255));
      }
      return out;
    },
    setEnabled: function (on) {
      enabled = !!on;
      if (enabled) ensure();
      applyRouting();
      var st = window.BeamiPhone.audioPlayer && window.BeamiPhone.audioPlayer.getState();
      wantListenerStream(!!(st && st.isPlaying));
    },
    // call from a user gesture (play click) so the browser lets audio start
    onUserPlay: function () {
      if (enabled) ensure();
      if (ctx && ctx.state === 'suspended') { try { ctx.resume(); } catch (e) {} }
    },
    onListener: function (d) {
      if (!graph || !enabled || !d || !d.cam || !d.f || !d.u || !d.car || !d.cf) return;
      lastPoseAt = Date.now();
      try {
        graph.setPose({ cam: d.cam, f: d.f, u: d.u, car: d.car, cf: d.cf, cu: d.cu || [0, 0, 1], doors: !!d.doors });
      } catch (e) { /* keep playing with the last placement */ }
    }
  };

  // keep the Lua stream on only while music actually plays
  if (window.BeamiPhone.audioPlayer && window.BeamiPhone.audioPlayer.onStateChange) {
    window.BeamiPhone.audioPlayer.onStateChange(function (st) {
      if (ctx && ctx.state === 'suspended' && st.isPlaying) { try { ctx.resume(); } catch (e) {} }
      wantListenerStream(!!st.isPlaying);
    });
  }
})();
