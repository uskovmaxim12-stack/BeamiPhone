-- BeamiPhone (c) 2026 wserf. All rights reserved.
-- Do not re-upload, redistribute or reuse without permission. See LICENSE.txt. [BP-wserf-A364B58F7647]
-- BeamiPhone :: lua/ge/extensions/beamiphone/musicScanner.lua
--
-- Extension name (derived from path by BeamNG: folders joined with "_"):
--   extensions.beamiphone_musicScanner
--
-- Responsibilities:
--   * toggle the phone overlay open/closed (via guihooks -> Angular)
--   * scan the mod's own music/ folder for real audio files (no fake/hardcoded tracks)
--   * detect a matching cover image per track (song.mp3 <-> song.jpg/png) and/or a
--     folder-wide cover.jpg/cover.png
--   * send the resulting JSON track list to the UI via guihooks.trigger
--
-- The music folder lives *inside* the UI app folder on purpose:
--   ui/modules/apps/BeamiPhone/music/
-- because that whole folder is already served by BeamNG's UI (CEF) at the URL
--   /ui/modules/apps/BeamiPhone/music/<file>
-- (the same way app.html / app.css are served, see BeamNG UI docs). That means the
-- browser's own <audio> element can play the file directly with a normal HTTP-style
-- URL -- no extra bridge is needed for *playback*, only for *listing* the folder,
-- which JS cannot do on its own (no Node.js / fs module inside CEF).

local M = {}
M.origin = { author = 'wserf', id = 'BP-wserf-A364B58F7647' }

-- Music lives in the game's USER folder (BeamNG.drive/beamiphone/music/), which
-- we create automatically: it survives mod updates/re-installs, works for zipped
-- and unpacked mods alike, and is served to the UI at the same URL path.
-- The old location inside the mod is still scanned, so nothing is lost.
-- These are VFS paths (BeamNG virtual filesystem root), not real OS paths.
local USER_MUSIC_DIR = '/beamiphone/music/'
local MOD_MUSIC_DIR = '/ui/modules/apps/BeamiPhone/music/'
-- Folder used by pre-1.2 releases (the mod was then called BeamPhone). Still scanned,
-- so an existing music library keeps working after the rename.
local LEGACY_USER_MUSIC_DIR = '/beamphone/music/'
local MUSIC_DIR = MOD_MUSIC_DIR -- legacy name still used by the folder-opening fallback

local AUDIO_EXT = { mp3 = true, ogg = true, wav = true }
local IMAGE_EXT = { jpg = true, jpeg = true, png = true }

local function getExt(fileName)
  local ext = fileName:match('%.([%a%d]+)$')
  return ext and ext:lower() or nil
end

local function ensureUserMusicDir()
  pcall(function()
    if not FS:directoryExists(USER_MUSIC_DIR) then FS:directoryCreate(USER_MUSIC_DIR, true) end
  end)
end

-- Lists audio files (and matching cover images) below one folder, including
-- sub-folders. Returned file names are relative to the folder ("Album/x.mp3").
local function scanOneDir(dir, out)
  local ok, allFiles = pcall(function() return FS:findFiles(dir, '*', -1, true, false) end)
  if not ok or type(allFiles) ~= 'table' then return false end

  local rels = {}
  for _, p in ipairs(allFiles) do
    local path = tostring(p):gsub('\\', '/')
    local rel
    if path:sub(1, #dir):lower() == dir:lower() then
      rel = path:sub(#dir + 1)
    else
      rel = path:match('[Mm]usic/(.+)$') or path:match('([^/]+)$')
    end
    if rel and rel ~= '' then rels[#rels + 1] = rel end
  end

  local imagesByKey = {}
  for _, rel in ipairs(rels) do
    local ext = getExt(rel)
    if ext and IMAGE_EXT[ext] then
      imagesByKey[rel:gsub('%.[^%./]+$', ''):lower()] = rel
    end
  end

  for _, rel in ipairs(rels) do
    local ext = getExt(rel)
    if ext and AUDIO_EXT[ext] then
      local key = rel:gsub('%.[^%./]+$', ''):lower()
      out.seen = out.seen or {}
      local fileKey = rel:lower()
      if not out.seen[fileKey] then
        out.seen[fileKey] = true
        out.tracks[#out.tracks + 1] = { file = rel, ext = ext, coverFile = imagesByKey[key], dir = dir }
      end
    end
  end

  if not out.folderCover then
    for _, name in ipairs({ 'cover.jpg', 'cover.jpeg', 'cover.png' }) do
      for _, rel in ipairs(rels) do
        if rel:lower() == name then out.folderCover = rel; out.folderCoverDir = dir; break end
      end
      if out.folderCover then break end
    end
  end
  return true
end

local function realUserMusicPath()
  local p = nil
  pcall(function() p = FS:getUserPath() .. USER_MUSIC_DIR:sub(2) end)
  return p or ('BeamNG.drive' .. USER_MUSIC_DIR)
end

-- The game caches directory listings; ask it to re-read our folders so files
-- copied in while playing show up without reloading the level. (pcall: if this
-- build of the game has no such call we simply scan what it already knows.)
local function refreshFsCache(dir)
  pcall(function() FS:updateDirectoryCache(dir, true) end)
end

-- Builds a clean track list. Never invents tracks that are not actually on disk.
local function scanMusic()
  ensureUserMusicDir()
  refreshFsCache(USER_MUSIC_DIR)
  refreshFsCache(MOD_MUSIC_DIR)
  refreshFsCache(LEGACY_USER_MUSIC_DIR)
  local out = { tracks = {}, folderCover = nil }
  local okUser = scanOneDir(USER_MUSIC_DIR, out)
  local okMod = scanOneDir(MOD_MUSIC_DIR, out)
  -- Old BeamPhone folder: only used while the new folder has no music yet (no mixing of two libraries).
  local okLegacy = false
  if #out.tracks == 0 then okLegacy = scanOneDir(LEGACY_USER_MUSIC_DIR, out) end

  if not okUser and not okMod and not okLegacy then
    log('E', 'beamiphone', 'Could not read any music folder')
    guihooks.trigger('beamiPhoneMusicList', { tracks = {}, musicDir = USER_MUSIC_DIR, displayPath = realUserMusicPath(), error = 'scan_failed' })
    return
  end

  -- Stable, predictable order (alphabetical by file name).
  table.sort(out.tracks, function(a, b) return a.file:lower() < b.file:lower() end)

  guihooks.trigger('beamiPhoneMusicList', {
    tracks = out.tracks,
    musicDir = USER_MUSIC_DIR,
    displayPath = realUserMusicPath(),
    folderCover = out.folderCover,
    folderCoverDir = out.folderCoverDir,
  })
end

-- Called by the JS side (bngApi.engineLua) whenever it needs a fresh scan,
-- e.g. once when the phone/music app is first opened. We deliberately do NOT
-- poll this on a timer (see performance requirement: no needless heavy loops).
M.requestMusicScan = function()
  scanMusic()
end

-- Bound to the custom keybind action (see core/input/actions/beamiphone_actions.json)
M.toggle = function()
  guihooks.trigger('beamiPhoneToggle')
end

-- Real vehicle + world data for the Maps and Clock apps. Everything here is
-- read from actual game state -- nothing is invented. If a particular piece
-- of data isn't available (e.g. no player vehicle, or this BeamNG version
-- doesn't expose time-of-day the way we expect), that field is simply omitted
-- rather than faked, and the UI shows an honest "unavailable" state for it.
-- Remembers the last vehicle we had real telemetry for, so the "Моя машина"
-- screen can keep showing its name/colour after the player steps out --
-- engine/lights controls still require an actual live vehicle, but the
-- display itself doesn't need to go blank just because you got out.
M.lastVehicleInfo = nil
M.lastVehId = nil -- id of the last real car the player drove (for remote control on foot)

-- Posted speed limit (m/s) of the road segment nearest to pos, from the map's
-- own road network data. nil when the road has no limit or we're off-road.
local function getSpeedLimit(pos)
  if not (map and map.findClosestRoad and map.getMap) then return nil end
  local ok, n1, n2, dist = pcall(map.findClosestRoad, pos)
  if not ok or not n1 or not n2 then return nil end
  local okm, md = pcall(map.getMap)
  local nodes = okm and md and md.nodes
  if not nodes or not nodes[n1] then return nil end
  if dist and dist > (nodes[n1].radius or 4) + 6 then return nil end
  local link = nodes[n1].links and nodes[n1].links[n2]
  if not link and nodes[n2] and nodes[n2].links then link = nodes[n2].links[n1] end
  if type(link) == 'table' and type(link.speedLimit) == 'number' and link.speedLimit > 0 then
    return link.speedLimit
  end
  return nil
end

local getRememberedVehicle
local function isRealVehicle(veh)
  if not veh then return false end
  local okJ, jb = pcall(function() return veh:getJBeamFilename() end)
  if okJ and type(jb) == 'string' and jb:lower():find('unicycle', 1, true) then return false end
  return true
end

-- The last real car the player drove, if it still exists in the world.
getRememberedVehicle = function()
  if not M.lastVehId then return nil end
  local ok, veh = pcall(function() return be and be:getObjectByID(M.lastVehId) end)
  if ok and veh and isRealVehicle(veh) then return veh end
  return nil
end

-- The car the phone controls: the one you're driving, or -- when you're on
-- foot (pressed F) -- the last car you drove.
local function getControlVehicle()
  local ok, veh = pcall(function() return be and be:getPlayerVehicle(0) end)
  if ok and isRealVehicle(veh) then return veh end
  return getRememberedVehicle()
end

-- Engine state of the controlled car (also when the player is on foot), used by
-- the phone to raise "car started" notifications. The engine state lives in the
-- car's own VM, so we ask it and it answers back through onVehState().
M.requestVehState = function()
  local veh = getControlVehicle()
  local okId, id = false, nil
  if veh then okId, id = pcall(function() return veh:getID() end) end
  if not (veh and okId and id) then
    guihooks.trigger('beamiPhoneVehState', { has = false })
    return
  end
  -- speed + posted limit, only while the player is actually driving this car
  M._vsExtra = {}
  pcall(function()
    local pv = be and be:getPlayerVehicle(0)
    if pv and isRealVehicle(pv) and pv:getID() == id then
      local vel = pv:getVelocity()
      M._vsExtra.speedKmh = math.sqrt(vel.x * vel.x + vel.y * vel.y + vel.z * vel.z) * 3.6
      local lim = getSpeedLimit(pv:getPosition())
      if lim then M._vsExtra.limitKmh = lim * 3.6 end
    end
  end)
  pcall(function()
    veh:queueLuaCommand([==[
      local r = ((electrics.values.engineRunning or 0) > 0.5) or ((electrics.values.rpm or 0) > 300)
      obj:queueGameEngineLua("extensions.beamiphone_musicScanner.onVehState(]==] .. id .. [==[," .. tostring(r) .. ")")
    ]==])
  end)
end

M.onVehState = function(id, running)
  local name
  pcall(function()
    local vd = core_vehicle_manager and core_vehicle_manager.getVehicleData and core_vehicle_manager.getVehicleData(id)
    if vd and vd.vdata and vd.vdata.information then name = vd.vdata.information.name end
  end)
  if not name and M.lastVehicleInfo and M.lastVehId == id then name = M.lastVehicleInfo.vehicleName end
  if not name then
    pcall(function()
      local v = be:getObjectByID(id)
      name = v and v:getJBeamFilename()
    end)
  end
  local ex = M._vsExtra or {}
  guihooks.trigger('beamiPhoneVehState', { has = true, id = id, engineOn = running and true or false, name = name,
    speedKmh = ex.speedKmh, limitKmh = ex.limitKmh })
end

M.requestTelemetry = function()
  local result = { ok = false }

  local okVeh, veh = pcall(function() return be and be:getPlayerVehicle(0) end)
  -- When the player is on foot BeamNG returns the walking-character pseudo
  -- vehicle ("unicycle"), not nil. Don't treat it as a real car.
  if okVeh and veh then
    local okJ, jb = pcall(function() return veh:getJBeamFilename() end)
    if okJ and type(jb) == 'string' and jb:lower():find('unicycle', 1, true) then
      veh = nil
    end
  end
  if okVeh and veh then
    local okPos, pos = pcall(function() return veh:getPosition() end)
    local okVel, vel = pcall(function() return veh:getVelocity() end)
    local okDir, dir = pcall(function() return veh:getDirectionVector() end)

    if okPos and pos then
      result.position = { x = pos.x, y = pos.y, z = pos.z }
      local okLim, lim = pcall(getSpeedLimit, pos)
      if okLim and lim then result.speedLimitKmh = lim * 3.6 end
    end
    if okVel and vel then
      local speedMs = math.sqrt(vel.x * vel.x + vel.y * vel.y + vel.z * vel.z)
      result.speedKmh = speedMs * 3.6
    end
    if okDir and dir then
      -- Heading in degrees, 0 = the map's "north" (Y+) axis. This is an
      -- approximation based on the vehicle's forward vector, good enough for
      -- a compass-style readout.
      result.headingDeg = (math.deg(math.atan(dir.x, dir.y)) + 360) % 360
      result.dirX = dir.x
      result.dirY = dir.y
    end

    -- Best-effort vehicle display name (e.g. "Gavril D-Series"). If this
    -- BeamNG version doesn't expose it the way we expect, we simply omit it.
    local okInfo, vdata = pcall(function()
      return core_vehicle_manager and core_vehicle_manager.getPlayerVehicleData and core_vehicle_manager.getPlayerVehicleData()
    end)
    if okInfo and vdata and vdata.vdata and vdata.vdata.information and vdata.vdata.information.name then
      result.vehicleName = vdata.vdata.information.name
    end
    if not result.vehicleName then
      local okJbeam, jbeamName = pcall(function() return veh:getJBeamFilename() end)
      if okJbeam and jbeamName then result.vehicleName = jbeamName end
    end

    -- Best-effort paint color.
    local okColor, colorVec = pcall(function() return veh:getColor() end)
    if okColor and colorVec then
      local r = colorVec.x or colorVec.r
      local g = colorVec.y or colorVec.g
      local b = colorVec.z or colorVec.b
      if r and g and b then result.color = { r = r, g = g, b = b } end
    end

    result.ok = true
    result.controllable = true
    local okId, vid = pcall(function() return veh:getID() end)
    if okId and vid then M.lastVehId = vid end
    M.lastVehicleInfo = { vehicleName = result.vehicleName, color = result.color }
  elseif M.lastVehicleInfo and M.lastVehId and not getRememberedVehicle() then
    -- the car we remembered no longer exists (deleted / level changed)
    M.lastVehicleInfo = nil
    M.lastVehId = nil
  elseif M.lastVehicleInfo then
    -- No live vehicle right now (player got out) -- still show the last
    -- known car's name/colour instead of a blank screen. result.ok stays
    -- false so the UI knows position/speed/controls aren't live.
    result.vehicleName = M.lastVehicleInfo.vehicleName
    result.color = M.lastVehicleInfo.color
    result.remembered = true
    result.controllable = true -- engine/lights/trunk still work from outside
  end

  local okLevel, levelId = pcall(function() return getCurrentLevelIdentifier and getCurrentLevelIdentifier() end)
  if okLevel and levelId then
    result.level = levelId
  end

  local okTod, tod = pcall(function()
    return core_environment and core_environment.getTimeOfDay and core_environment.getTimeOfDay()
  end)
  if okTod and tod and tod.time then
    result.timeOfDayFraction = tod.time -- 0.0-1.0, 0.5 = noon
  end

  guihooks.trigger('beamiPhoneTelemetry', result)
end

-- Called by the "Моя машина" app. Best-effort: BeamNG vehicles run their own
-- Lua VM for electrics, so we can only *ask* the vehicle to react via
-- queueLuaCommand -- exactly how mods commonly toggle fog lights/lightbars.
-- If a given vehicle doesn't implement a command (rare/custom vehicles),
-- this silently does nothing rather than erroring.
--
-- Real BeamNG ignition has 4 states: 0=Off, 1=Accessory, 2=On, 3=Starter
-- engaged (this is confirmed straight from BeamNG's own developer posts
-- about the ignition system rework). "Завести" therefore needs TWO stages:
-- first press moves to ignition-on (2), a second press while already on
-- engages the starter (3) to actually start the engine.
M.vehicleAction = function(action)
  local veh = getControlVehicle()
  if not veh then return end

  local function send(cmd) pcall(function() veh:queueLuaCommand(cmd) end) end

  if action == 'lights' then
    -- read the real state inside the car so it also works from outside
    send("local s = (electrics.values.lights_state or 0); electrics.setLightsState(s == 0 and 1 or 0)")
  elseif action == 'hazard' then
    send("electrics.toggle_warn_signal()")
  elseif action == 'engine_start' then
    -- ignition: 0 off, 1 accessory, 2 on, 3 starter. Stage 1 -> on, stage 2 -> crank,
    -- nothing if the engine already runs.
    send([==[
      local lvl = electrics.values.ignitionLevel or 0
      local running = (electrics.values.engineRunning or 0) > 0.5
      if lvl < 2 then electrics.setIgnitionLevel(2)
      elseif not running then electrics.setIgnitionLevel(3) end
    ]==])
  elseif action == 'engine_stop' then
    send("electrics.setIgnitionLevel(0)")
  elseif action == 'trunk' then
    -- Strategy inside the car's own VM (controller names differ per car):
    --  1) known coupler controller names
    --  2) any controller whose name/file/group looks like trunk/tailgate/hatch
    --  3) the car's own input actions (jbeam inputActions) that look like a trunk
    --  4) weaker match ("rear", not a door)
    send([==[
      local function report(ok, info)
        obj:queueGameEngineLua("guihooks.trigger('beamiPhoneActionResult', {action='trunk', ok=" .. tostring(ok) .. ", names=" .. dumps(info or {}) .. "})")
      end
      -- getControllerSafe never returns nil: for an unknown name it returns a dummy
      -- "nilController" whose calls do nothing. So only try names the car really has.
      local exists = {}
      do
        local okL, lst = pcall(function() return v.data.controller end)
        if okL and type(lst) == 'table' then
          for _, e in pairs(lst) do
            if type(e) == 'table' then
              if e.name then exists[e.name] = true end
              if e.fileName then exists[e.fileName] = true end
            end
          end
        end
      end
      local function try(n)
        if not exists[n] then return false end
        local ok, c = pcall(controller.getControllerSafe, n)
        if ok and c then
          if c.toggleGroup then local o = pcall(c.toggleGroup) return o end
          if c.toggle then local o = pcall(c.toggle) return o end
        end
        return false
      end
      local known = {'trunkCoupler','tailgateCoupler','hatchCoupler','liftgateCoupler','bootCoupler',
                     'trunk_coupler','tailgate_coupler','hatch_coupler','rearDoorCoupler',
                     'trunkLatchCoupler','tailgateLatchCoupler','tailgateCouplerUpper'}
      for _, n in ipairs(known) do if try(n) then report(true) return end end

      local strong = {'trunk','tailgate','hatch','liftgate','decklid'}
      local function has(str, list)
        str = (str or ''):lower()
        for _, w in ipairs(list) do if str:find(w, 1, true) then return true end end
        return false
      end
      local function bad(str)
        str = (str or ''):lower()
        return str:find('hood',1,true) or str:find('spare',1,true) or str:find('bonnet',1,true)
      end

      local seen, weak = {}, {}
      local okList, list = pcall(function() return v.data.controller end)
      if okList and type(list) == 'table' then
        for _, e in pairs(list) do
          if type(e) == 'table' then
            local n = e.name or e.fileName
            local hay = tostring(e.name or '') .. ' ' .. tostring(e.fileName or '') .. ' ' .. tostring(e.groupType or '') .. ' ' .. tostring(e.type or '')
            if type(n) == 'string' then
              seen[#seen + 1] = n
              if not bad(hay) then
                if has(hay, strong) then
                  if try(n) then report(true) return end
                elseif hay:lower():find('rear', 1, true) and not hay:lower():find('door', 1, true) then
                  weak[#weak + 1] = n
                end
              end
            end
          end
        end
      end

      local okIA, ia = pcall(function() return v.data.inputActions end)
      if okIA and type(ia) == 'table' then
        for k, a in pairs(ia) do
          seen[#seen + 1] = 'action:' .. tostring(k)
          local title = type(a) == 'table' and tostring(a.title or '') or ''
          if (has(tostring(k), strong) or has(title, strong)) and not bad(tostring(k) .. title) and type(a) == 'table' and type(a.onDown) == 'string' then
            local f = loadstring(a.onDown)
            if f then local o = pcall(f) if o then report(true) return end end
          end
        end
      end

      for _, n in ipairs(weak) do if try(n) then report(true) return end end
      report(false, seen)
    ]==])
  end
end

-- Opens the music folder in the OS file manager. We cannot know from Lua which
-- of the game's folder-opening calls works on a given system, so every press
-- uses the next method in turn (and tells the UI which one and which path):
--   1 virtual path, 2 real path with /, 3 real path with \, 4 Windows `start`
local folderTry = 0

M.openMusicFolder = function()
  ensureUserMusicDir()
  local existsUser = false
  pcall(function() existsUser = FS:directoryExists(USER_MUSIC_DIR) end)
  -- prefer the (auto-created) user folder; if it could not be made, open the
  -- folder inside the mod, which is also scanned and certainly exists
  local vfs = existsUser and USER_MUSIC_DIR or MOD_MUSIC_DIR
  local real = nil
  pcall(function()
    if existsUser then real = FS:getUserPath() .. USER_MUSIC_DIR:sub(2)
    else real = FS:getFileRealPath(MOD_MUSIC_DIR) end
  end)
  if type(real) ~= 'string' or real == '' then real = nil end
  local fwd = real and (real:gsub('\\', '/')) or nil
  local back = real and (real:gsub('/', '\\')) or nil

  folderTry = (folderTry % 4) + 1
  local ok, err = false, nil
  if folderTry == 1 then
    ok, err = pcall(function() Engine.Platform.exploreFolder(vfs) end)
  elseif folderTry == 2 and fwd then
    ok, err = pcall(function() Engine.Platform.exploreFolder(fwd) end)
  elseif folderTry == 3 and back then
    ok, err = pcall(function() Engine.Platform.exploreFolder(back) end)
  elseif folderTry == 4 and back and back:match('^%a:') and not back:find('["&|<>^%%]') and os and os.execute then
    ok, err = pcall(function() os.execute('start "" "' .. back .. '"') end)
  end
  log('I', 'beamiphone', 'openMusicFolder try=' .. folderTry .. ' exists=' .. tostring(existsUser) ..
    ' vfs=' .. tostring(vfs) .. ' real=' .. tostring(real) .. ' ok=' .. tostring(ok) .. ' err=' .. tostring(err))
  guihooks.trigger('beamiPhoneFolder', { path = back or real or vfs, method = folderTry, ok = ok })
end

-- Best-effort preparation for the game's native navigator map: the in-car
-- navigation screens are fed by the game's navigation UI extension.
M.prepareNativeMap = function()
  local ok, err = pcall(function() extensions.load('ui_uinavi') end)
  log('I', 'beamiphone', 'prepareNativeMap ui_uinavi load: ' .. tostring(ok) .. ' ' .. tostring(err or ''))
end

-- ---------------------------------------------------------------------
-- Weather & time of day (real game state through core_environment).
-- Time of day in BeamNG: 0 = noon, 0.5 = midnight. We advance time
-- ourselves while a flow speed is set, so it doesn't depend on the game's
-- internal play flag (which behaves differently between game versions).
-- ---------------------------------------------------------------------
local DAY_SECONDS = 1800 -- one in-game day at x1
local flow = { speed = 0, acc = 0 }

local function num(v) return type(v) == 'number' and v == v and v or nil end

local function getTod()
  if core_environment and core_environment.getTimeOfDay then
    local ok, tod = pcall(core_environment.getTimeOfDay)
    if ok and type(tod) == 'table' and num(tod.time) then return tod end
  end
  return nil
end

local function setTime(t, play)
  local tod = getTod()
  if not tod or not core_environment or not core_environment.setTimeOfDay then return end
  local nt = {}
  for k, v in pairs(tod) do nt[k] = v end
  nt.time = t % 1
  if play ~= nil then nt.play = play end
  pcall(core_environment.setTimeOfDay, nt)
end

local function getEnvState()
  if core_environment and core_environment.getState then
    local ok, st = pcall(core_environment.getState)
    if ok and type(st) == 'table' then return st end
  end
  return nil
end

local function setEnvStateKey(key, value)
  if not (core_environment and core_environment.getState and core_environment.setState) then return false end
  return pcall(function()
    local st = core_environment.getState()
    st[key] = value
    core_environment.setState(st)
  end)
end

local function readEnvValue(key, getter)
  if core_environment and core_environment[getter] then
    local ok, v = pcall(core_environment[getter])
    if ok and num(v) then return v end
  end
  local st = getEnvState()
  if st and num(st[key]) then return st[key] end
  return nil
end

-- Rain in BeamNG is a "Precipitation" scene object (its numDrops field = rain density);
-- core_environment has no rain setter, which is why the old code never produced rain.
local RAIN_NAME = 'beamiphone_rain'

local function findRainObjects()
  local list = {}
  local ok, names = pcall(function() return scenetree.findClassObjects('Precipitation') end)
  if ok and type(names) == 'table' then
    for _, n in ipairs(names) do
      local o = scenetree.findObject(n)
      if o then list[#list + 1] = o end
    end
  end
  return list
end

local function createRainObject()
  local ok, err = pcall(function()
    local p = createObject('Precipitation')
    p:setField('dataBlock', 0, 'rain_drop')
    p:setField('numDrops', 0, '0')
    p:registerObject(RAIN_NAME)
    if scenetree.MissionGroup then scenetree.MissionGroup:addObject(p) end
  end)
  if not ok then log('W', 'beamiphone', 'rain: could not create a Precipitation object: ' .. tostring(err)) end
  return scenetree.findObject(RAIN_NAME)
end

local function setRain(drops)
  local objs = findRainObjects()
  if #objs == 0 and drops > 0 then
    local o = createRainObject()
    if o then objs[1] = o end
  end
  if #objs == 0 then
    if drops > 0 then log('W', 'beamiphone', 'rain: this map has no Precipitation object and one could not be created') end
    return false
  end
  for _, o in ipairs(objs) do
    pcall(function()
      o:setField('numDrops', 0, tostring(drops))
      if o.postApply then o:postApply() end
    end)
  end
  return true
end

local function readRain()
  local objs = findRainObjects()
  if #objs == 0 then return nil end
  local ok, v = pcall(function() return tonumber(objs[1]:getField('numDrops', 0)) end)
  if ok and num(v) then return v end
  return nil
end

M.requestEnv = function()
  local out = { ok = false }
  local tod = getTod()
  if tod then
    out.ok = true
    out.time = tod.time
    out.flowSpeed = flow.speed
  end
  out.cloudCover = readEnvValue('cloudCover', 'getCloudCover')
  out.windSpeed = readEnvValue('windSpeed', 'getWindSpeed')
  local st = getEnvState()
  if st and num(st.fogDensity) then
    out.fogDensity = st.fogDensity
  elseif core_environment and core_environment.getFogDensity then
    local ok, v = pcall(core_environment.getFogDensity)
    if ok and num(v) then out.fogDensity = v * 1000 end
  end
  out.rain = readRain()
  guihooks.trigger('beamiPhoneEnv', out)
end

-- hour: 0-24 clock hour
M.setHour = function(hour)
  hour = tonumber(hour)
  if not hour then return end
  setTime(((hour - 12) / 24) % 1)
end

-- speed: 0 = paused, otherwise a multiplier of the default day length
M.setTimeFlow = function(speed)
  speed = tonumber(speed) or 0
  flow.speed = math.max(0, math.min(120, speed))
  flow.acc = 0
  local tod = getTod()
  if tod then setTime(tod.time, false) end -- stop the game's own flow so time isn't counted twice
end

M.setWeather = function(key, value)
  value = tonumber(value)
  if not value then return end
  if key == 'clouds' then
    value = math.max(0, math.min(3, value))
    if core_environment and core_environment.setCloudCover then pcall(core_environment.setCloudCover, value) end
    setEnvStateKey('cloudCover', value)
  elseif key == 'wind' then
    value = math.max(0, math.min(3, value))
    if core_environment and core_environment.setWindSpeed then pcall(core_environment.setWindSpeed, value) end
    setEnvStateKey('windSpeed', value)
  elseif key == 'fog' then
    value = math.max(0, math.min(60, value))
    if not setEnvStateKey('fogDensity', value) and core_environment and core_environment.setFogDensity then
      pcall(core_environment.setFogDensity, value / 1000)
    end
  elseif key == 'rain' then
    value = math.max(0, math.min(5000, math.floor(value)))
    setRain(value)
  end
end

local PRESETS = {
  clear  = { clouds = 0.05, fog = 0.2, wind = 0.3, rain = 0 },
  cloudy = { clouds = 1.8,  fog = 0.4, wind = 0.6, rain = 0 },
  rain   = { clouds = 2.6,  fog = 1.5, wind = 1.0, rain = 2000 },
  fog    = { clouds = 1.2,  fog = 25,  wind = 0.1, rain = 0 },
}

M.setWeatherPreset = function(name)
  local p = PRESETS[name]
  if not p then return end
  for k, v in pairs(p) do M.setWeather(k, v) end
end

-- Called by the game every frame for loaded extensions; cheap when idle.
-- ---------------------------------------------------------------------
-- Real-time streams, pushed to the UI ~30x per second while enabled:
--   pose     : player car position/heading/velocity (smooth navigator map)
--   listener : camera + car basis vectors (spatial audio placement)
-- ---------------------------------------------------------------------
local stream = { pose = false, listener = false, acc = 0 }

M.setStreams = function(pose, listener)
  stream.pose = (pose == true)
  stream.listener = (listener == true)
  stream.acc = 0
end

local function v3(v) return { v.x, v.y, v.z } end

-- Are any of the car's doors open? Asked inside the vehicle (electrics live
-- there); the answer comes back through setDoorsOpen. Used so music leaks out
-- of the car clearly when you look at it from outside with a door open.
local doors = { open = false, nextAsk = 0 }

M.setDoorsOpen = function(open)
  doors.open = (open == true)
end

local function askDoors(veh)
  pcall(function()
    veh:queueLuaCommand([==[
      local open = false
      local ev = electrics and electrics.values
      if ev then
        for k, v in pairs(ev) do
          if type(k) == 'string' and type(v) == 'number' and v ~= 0 then
            local l = k:lower()
            if l:find('door') and (l:find('notattached') or l:find('open') or l:find('ajar')) then open = true break end
          end
        end
      end
      obj:queueGameEngineLua('extensions.beamiphone_musicScanner.setDoorsOpen(' .. tostring(open) .. ')')
    ]==])
  end)
end

local function getCameraBasis()
  local p, f, u
  if core_camera then
    pcall(function() p = core_camera.getPosition() end)
    pcall(function() f = core_camera.getForward() end)
    pcall(function() u = core_camera.getUp() end)
    if p and not f then
      pcall(function()
        local q = core_camera.getQuat()
        f = q * vec3(0, 1, 0)
        u = q * vec3(0, 0, 1)
      end)
    end
  end
  if not p then pcall(function() p = getCameraPosition() end) end
  if p and not f then pcall(function() f = getCameraForward() end) end
  if p and f and not u then u = vec3(0, 0, 1) end
  return p, f, u
end

local function pushStreams()
  local ok, veh = pcall(function() return be and be:getPlayerVehicle(0) end)
  if not ok or not veh then return end
  local pos = veh:getPosition()
  local dir = veh:getDirectionVector()
  if stream.pose then
    local vx, vy = 0, 0
    pcall(function() local v = veh:getVelocity(); vx, vy = v.x, v.y end)
    guihooks.trigger('beamiPhonePose', { x = pos.x, y = pos.y, dx = dir.x, dy = dir.y, vx = vx, vy = vy })
  end
  if stream.listener then
    local cp, cf, cu = getCameraBasis()
    if cp and cf and cu then
      local up = nil
      pcall(function() up = veh:getDirectionVectorUp() end)
      doors.nextAsk = doors.nextAsk - 1
      if doors.nextAsk <= 0 then doors.nextAsk = 8; askDoors(veh) end -- ~4x per second
      guihooks.trigger('beamiPhoneListener', {
        cam = v3(cp), f = v3(cf), u = v3(cu),
        car = v3(pos), cf = v3(dir), cu = up and v3(up) or { 0, 0, 1 },
        doors = doors.open,
      })
    end
  end
end

M.onUpdate = function(dtReal, dtSim)
  if stream.pose or stream.listener then
    stream.acc = stream.acc + (tonumber(dtReal) or 0)
    if stream.acc >= 0.033 then
      stream.acc = 0
      pcall(pushStreams)
    end
  end
  if flow.speed <= 0 then return end
  local dt = tonumber(dtSim) or tonumber(dtReal) or 0
  if dt <= 0 then return end -- game paused: time stops too
  flow.acc = flow.acc + dt
  if flow.acc < 0.1 then return end
  local tod = getTod()
  if tod then
    setTime(tod.time + (flow.speed / DAY_SECONDS) * flow.acc, false)
  end
  flow.acc = 0
end

-- ---------------------------------------------------------------------
-- Map: the level's real road network, as flat segments [x1,y1,x2,y2,width,...]
-- (cached per level), and the route currently set in the game's own
-- navigation (set a destination with the in-game map, M).
-- ---------------------------------------------------------------------
local mapCache = nil
local lastRouteKey = nil

local function r1(v) return math.floor(v * 10 + 0.5) / 10 end

local function buildMapSegments()
  local segs = {}
  local ok = pcall(function()
    local md = map.getMap()
    local nodes = md and md.nodes
    if not nodes then return end
    for id, n in pairs(nodes) do
      local sid = tostring(id)
      for id2, link in pairs(n.links or {}) do
        local n2 = nodes[id2]
        if n2 and sid < tostring(id2) then
          local drv = (type(link) == 'table' and link.drivability) or 1
          if drv > 0.25 then
            local w = (n.radius or 3) + (n2.radius or 3)
            segs[#segs + 1] = r1(n.pos.x);  segs[#segs + 1] = r1(n.pos.y)
            segs[#segs + 1] = r1(n2.pos.x); segs[#segs + 1] = r1(n2.pos.y)
            segs[#segs + 1] = r1(w)
          end
        end
      end
    end
  end)
  return segs, ok
end

M.requestMap = function()
  if not mapCache or #mapCache.segs == 0 then
    local segs, ok = buildMapSegments()
    mapCache = { segs = segs, ok = ok }
  end
  guihooks.trigger('beamiPhoneMap', { segs = mapCache.segs, ok = mapCache.ok })
end

M.requestRoute = function()
  local ok, path = pcall(function()
    return core_groundMarkers and core_groundMarkers.routePlanner and core_groundMarkers.routePlanner.path
  end)
  if not ok or type(path) ~= 'table' or #path < 2 then
    if lastRouteKey ~= 'none' then
      lastRouteKey = 'none'
      guihooks.trigger('beamiPhoneRoute', { pts = {}, key = 'none' })
    end
    return
  end
  local n = #path
  local step = math.max(1, math.floor(n / 500))
  local pts = {}
  for i = 1, n do
    if (i - 1) % step == 0 or i == n then
      local p = path[i] and path[i].pos
      if p then pts[#pts + 1] = r1(p.x); pts[#pts + 1] = r1(p.y) end
    end
  end
  local total = path[1] and type(path[1].distToTarget) == 'number' and path[1].distToTarget or nil
  local key = #pts .. ':' .. tostring(pts[#pts - 1]) .. ':' .. tostring(pts[#pts])
  lastRouteKey = key
  guihooks.trigger('beamiPhoneRoute', { pts = pts, total = total, key = key })
end

-- Road network for the game's own navigator engine (bngNavigator.setData):
-- { nodes = { [id] = { pos = {x, y}, radius = r, links = { [id2] = { drivability = d } } } } }
-- Node ids are renamed to short strings to keep the payload small, and each
-- road is listed once (from one end) unless it only exists in one direction.
local naviCache = nil

local function r2(v) return math.floor(v * 100 + 0.5) / 100 end

local function buildNaviNodes()
  local out = {}
  local ok = pcall(function()
    local md = map.getMap()
    local nodes = md and md.nodes
    if not nodes then return end
    local short, n = {}, 0
    for id, _ in pairs(nodes) do n = n + 1; short[id] = 'n' .. n end
    for id, nd in pairs(nodes) do
      local links = {}
      for id2, link in pairs(nd.links or {}) do
        local other = nodes[id2]
        if other then
          local reverseMissing = not (other.links and other.links[id])
          if tostring(id) < tostring(id2) or reverseMissing then
            links[short[id2]] = { drivability = r2((type(link) == 'table' and link.drivability) or 1) }
          end
        end
      end
      out[short[id]] = { pos = { r1(nd.pos.x), r1(nd.pos.y) }, radius = r1(nd.radius or 3), links = links }
    end
  end)
  return out, ok
end

M.requestNaviData = function()
  if not naviCache then
    local nodes, ok = buildNaviNodes()
    naviCache = { nodes = nodes, ok = ok }
  end
  guihooks.trigger('beamiPhoneNaviData', { nodes = naviCache.nodes, ok = naviCache.ok })
end

M.onClientEndMission = function() mapCache = nil; lastRouteKey = nil; naviCache = nil end
M.onClientStartMission = function() guihooks.trigger('beamiPhoneMapDirty', {}) end

-- Wallpaper choice persistence. Stored outside ui/ on purpose: writing files
-- inside the ui/modules folder triggers a live UI reload in BeamNG, which
-- would be disruptive here (it would visibly reset the open phone).
local PREFS_PATH = "settings/beamiphone/prefs.json"
local LEGACY_PREFS_PATH = "settings/beamphone/prefs.json" -- pre-1.2 location, read once as fallback
local NOTES_PATH = "settings/beamiphone/notes.json"

local function readPrefs()
  local ok, prefs = pcall(function() return jsonReadFile(PREFS_PATH) end)
  if ok and type(prefs) == "table" then return prefs end
  ok, prefs = pcall(function() return jsonReadFile(LEGACY_PREFS_PATH) end)
  if ok and type(prefs) == "table" then return prefs end
  return {}
end

M.saveWallpaper = function(key)
  local prefs = readPrefs()
  prefs.wallpaper = key
  pcall(function() jsonWriteFile(PREFS_PATH, prefs, true) end)
end

M.saveLanguage = function(code)
  local prefs = readPrefs()
  prefs.language = code
  pcall(function() jsonWriteFile(PREFS_PATH, prefs, true) end)
end

-- Generic single-value preference (booleans / short strings).
M.savePref = function(key, value)
  if type(key) ~= 'string' then return end
  local prefs = readPrefs()
  prefs[key] = value
  pcall(function() jsonWriteFile(PREFS_PATH, prefs, true) end)
end

M.requestPrefs = function()
  local prefs = readPrefs()
  local result = {}
  if prefs then
    if prefs.wallpaper then result.wallpaper = prefs.wallpaper end
    if prefs.language then result.language = prefs.language end
    if type(prefs.spatial) == 'boolean' then result.spatial = prefs.spatial end
    if type(prefs.mapStyle) == 'string' then result.mapStyle = prefs.mapStyle end
    if tonumber(prefs.volume) then result.volume = tonumber(prefs.volume) end
    if type(prefs.shuffle) == 'boolean' then result.shuffle = prefs.shuffle end
    if type(prefs.smartNotifs) == 'boolean' then result.smartNotifs = prefs.smartNotifs end
    if prefs.repeatMode == 'off' or prefs.repeatMode == 'all' or prefs.repeatMode == 'one' then result.repeatMode = prefs.repeatMode end
  end

  -- Default language is always English (decided in the UI); only an explicitly
  -- saved choice is sent here.

  if next(result) ~= nil then
    guihooks.trigger('beamiPhonePrefs', result)
  end
end

-- Notes app: one plain-text note, stored next to the other prefs (outside ui/ on purpose).
M.saveNotes = function(text)
  if type(text) ~= 'string' then return end
  if #text > 40000 then text = text:sub(1, 40000) end
  pcall(function() jsonWriteFile(NOTES_PATH, { text = text }, true) end)
end

M.requestNotes = function()
  local ok, d = pcall(function() return jsonReadFile(NOTES_PATH) end)
  local text = (ok and type(d) == 'table' and type(d.text) == 'string') and d.text or ''
  guihooks.trigger('beamiPhoneNotes', { text = text })
end

local function onExtensionLoaded()
  log('I', 'beamiphone', 'BeamiPhone musicScanner extension loaded.')
end

M.onExtensionLoaded = onExtensionLoaded

return M
