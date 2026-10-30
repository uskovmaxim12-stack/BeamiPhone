-- BeamiPhone Radio: in-game MP3 stream receiver.
-- Runs inside BeamNG GE Lua; no external exe, Python, FFmpeg or local HTTP server.
-- Remote MP3 bytes are fetched with the LuaSocket library shipped with BeamNG,
-- then sent to the UI as small base64 guihooks messages for MediaSource playback.

local M = {}
local LOG_TAG = 'beamiPhone.radio'
local beamLog = log
local socketLib = nil
local socketTried = false
local active = false
local sock = nil
local stage = 'stopped'
local selectedId = nil
local requestSequence = 0
local sourceIndex = 0
local redirects = 0
local currentUrl = nil
local connectTarget = nil
local sendBuffer = nil
local sendPos = 1
local headerBuffer = ''
local chunkBuffer = ''
local chunkSize = nil
local transferChunked = false
local icyMetaInt = 0
local icyAudioLeft = 0
local icyMetaLeft = 0
local outputBuffer = ''
local flushTimer = 0
local lastDataAt = 0
local connectionStartedAt = 0
local bytesReceived = 0
local stateSent = nil

local STATIONS = {
  love = {
    name = 'Love Radio',
    urls = {
      'http://ice.radiokoms.ru:8000/LOVE',
      'http://194.186.209.2:8000/LOVE'
    }
  },
  europa = {
    name = 'Европа Плюс',
    urls = {
      'http://ep256.hostingradio.ru:8052/europaplus256.mp3',
      'http://emgregion.hostingradio.ru:8064/moscow.europaplus.mp3',
      'http://ep128server.streamr.ru:8030/ep128'
    }
  },
  avto = {
    name = 'Авторадио',
    urls = {
      'http://ic7.101.ru:8000/s2'
    }
  },
  rusradio = {
    name = 'Русское Радио',
    urls = {
      'http://icecast.rmgcdnvideo.ru/rr.mp3',
      'http://dfm.hostingradio.ru/rusradio128.mp3'
    }
  },
  nashe = {
    name = 'Наше Радио',
    urls = {
      'http://nashe1.hostingradio.ru/nashe-128.mp3',
      'http://nashe.streamr.ru/nashe-128.mp3'
    }
  },
  retro = {
    name = 'Ретро FM',
    urls = {
      'http://retroserver.streamr.ru:8043/retro256.mp3',
      'http://retroserver.streamr.ru:8043/retro128.mp3'
    }
  },
  record = {
    name = 'Радио Рекорд',
    urls = {
      'http://air.radiorecord.ru:8101/rr_320',
      'http://air.radiorecord.ru:8102/rr_320'
    }
  },
  dorozhnoe = {
    name = 'Дорожное Радио',
    urls = {
      'http://dorognoe.hostingradio.ru:8000/radio'
    }
  },
  mayak = {
    name = 'Радио Маяк',
    urls = {
      'http://icecast.vgtrk.cdnvideo.ru/mayakfm_mp3_192kbps'
    }
  },
  vesti = {
    name = 'Вести FM',
    urls = {
      'http://icecast.vgtrk.cdnvideo.ru/vestifm',
      'http://icecast.vgtrk.cdnvideo.ru/vestifm_mp3_192kbps'
    }
  },
  russia = {
    name = 'Радио России',
    urls = {
      'http://icecast-vgtrk.cdnvideo.ru/rrzonam_mp3_192kbps'
    }
  },
  chanson = {
    name = 'Радио Шансон',
    urls = {
      'http://chanson.hostingradio.ru:8041/chanson128.mp3'
    }
  }
}

local function log(level, message)
  if beamLog then
    pcall(function() beamLog(level or 'I', LOG_TAG, tostring(message)) end)
  end
end

local function triggerState(state, message)
  stateSent = state
  if guihooks and guihooks.trigger then
    guihooks.trigger('beamiPhoneRadioState', {
      station = selectedId,
      state = state,
      message = message or '',
      sequence = requestSequence
    })
  end
end

local function closeSocket()
  if sock then
    pcall(function() sock:shutdown() end)
    pcall(function() sock:close() end)
  end
  sock = nil
  stage = 'stopped'
  sendBuffer = nil
  sendPos = 1
  headerBuffer = ''
  chunkBuffer = ''
  chunkSize = nil
  transferChunked = false
  icyMetaInt = 0
  icyAudioLeft = 0
  icyMetaLeft = 0
  outputBuffer = ''
  flushTimer = 0
end

local function ensureSocket()
  if socketTried then return socketLib ~= nil end
  socketTried = true
  local ok, lib = pcall(require, 'libs/luasocket/socket.socket')
  if not ok then
    ok, lib = pcall(require, 'socket')
  end
  if ok and type(lib) == 'table' and lib.tcp and lib.select then
    socketLib = lib
    log('I', 'LuaSocket loaded')
    return true
  end
  log('E', 'LuaSocket is unavailable: ' .. tostring(lib))
  return false
end

local function parseHttpUrl(url)
  local rest = tostring(url or ''):match('^http://(.+)$')
  if not rest then return nil end -- HTTPS requires LuaSec and is deliberately not attempted.
  local authority, path = rest:match('^([^/]+)(/.*)$')
  if not authority then authority, path = rest, '/' end
  local host, port = authority:match('^([^:]+):(%d+)$')
  if not host then host, port = authority, '80' end
  if not host or host == '' then return nil end
  return host, tonumber(port) or 80, path
end

local function resolveRedirect(location, baseUrl)
  if not location or location == '' then return nil end
  if location:match('^http://') then return location end
  local host, port = baseUrl:match('^http://([^/:]+):?(%d*)')
  if not host then return nil end
  local prefix = 'http://' .. host
  if port and port ~= '' and port ~= '80' then prefix = prefix .. ':' .. port end
  if location:sub(1, 1) == '/' then return prefix .. location end
  local dir = baseUrl:match('^(http://.*/)') or (prefix .. '/')
  return dir .. location
end

local function startConnection(url, redirectDepth)
  closeSocket()
  if not ensureSocket() then
    triggerState('error', 'В BeamNG недоступна библиотека LuaSocket')
    active = false
    return false
  end
  local host, port, path = parseHttpUrl(url)
  if not host then return false end

  local newSock, err = socketLib.tcp()
  if not newSock then return false end
  sock = newSock
  pcall(function() sock:setoption('tcp-nodelay', true) end)
  sock:settimeout(0)
  local ok, connectErr = sock:connect(host, port)
  currentUrl = url
  connectTarget = { host = host, port = port, path = path }
  redirects = redirectDepth or 0
  connectionStartedAt = os.clock()
  lastDataAt = os.clock()
  bytesReceived = 0

  if ok then
    stage = 'send'
  elseif connectErr == 'timeout' or connectErr == 'Operation already in progress' or connectErr == 'already connected' then
    stage = 'connecting'
  else
    log('W', 'Connect failed for ' .. host .. ':' .. tostring(port) .. ': ' .. tostring(connectErr or err))
    closeSocket()
    return false
  end
  return true
end

local function base64Encode(data)
  local alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'
  local out = {}
  local i = 1
  while i <= #data do
    local a = data:byte(i) or 0
    local b = data:byte(i + 1)
    local c = data:byte(i + 2)
    local n = a * 65536 + (b or 0) * 256 + (c or 0)
    local x1 = math.floor(n / 262144) % 64 + 1
    local x2 = math.floor(n / 4096) % 64 + 1
    local x3 = math.floor(n / 64) % 64 + 1
    local x4 = n % 64 + 1
    out[#out + 1] = alphabet:sub(x1, x1)
    out[#out + 1] = alphabet:sub(x2, x2)
    out[#out + 1] = b and alphabet:sub(x3, x3) or '='
    out[#out + 1] = c and alphabet:sub(x4, x4) or '='
    i = i + 3
  end
  return table.concat(out)
end

local function flushAudio(force)
  if #outputBuffer == 0 then return end
  if not force and #outputBuffer < 4096 and flushTimer < 0.22 then return end
  local chunk = outputBuffer
  outputBuffer = ''
  if guihooks and guihooks.trigger then
    guihooks.trigger('beamiPhoneRadioChunk', {
      station = selectedId,
      sequence = requestSequence,
      data = base64Encode(chunk)
    })
  end
end

local function appendAudio(data)
  if not data or #data == 0 then return end
  outputBuffer = outputBuffer .. data
  bytesReceived = bytesReceived + #data
  lastDataAt = os.clock()
  flushTimer = 0
  if #outputBuffer >= 8192 then flushAudio(true) end
end

local function stripIcyMetadata(data)
  if icyMetaInt <= 0 then return data end
  local out = {}
  local pos = 1
  while pos <= #data do
    if icyMetaLeft > 0 then
      local skip = math.min(icyMetaLeft, #data - pos + 1)
      pos = pos + skip
      icyMetaLeft = icyMetaLeft - skip
    elseif icyAudioLeft <= 0 then
      if pos > #data then break end
      local metadataLength = (data:byte(pos) or 0) * 16
      pos = pos + 1
      icyMetaLeft = metadataLength
      icyAudioLeft = icyMetaInt
    else
      local take = math.min(icyAudioLeft, #data - pos + 1)
      out[#out + 1] = data:sub(pos, pos + take - 1)
      pos = pos + take
      icyAudioLeft = icyAudioLeft - take
    end
  end
  return table.concat(out)
end

local function decodeChunked(data)
  chunkBuffer = chunkBuffer .. data
  local out = {}
  while true do
    if not chunkSize then
      local eol = chunkBuffer:find('\r\n', 1, true)
      if not eol then break end
      local sizeLine = chunkBuffer:sub(1, eol - 1)
      local hex = sizeLine:match('^%s*([%da-fA-F]+)')
      if not hex then return nil, 'Некорректный HTTP chunk' end
      chunkSize = tonumber(hex, 16)
      chunkBuffer = chunkBuffer:sub(eol + 2)
      if not chunkSize or chunkSize < 0 then return nil, 'Некорректный размер HTTP chunk' end
      if chunkSize == 0 then return table.concat(out), 'eof' end
    end
    if #chunkBuffer < chunkSize + 2 then break end
    out[#out + 1] = chunkBuffer:sub(1, chunkSize)
    chunkBuffer = chunkBuffer:sub(chunkSize + 3)
    chunkSize = nil
  end
  return table.concat(out)
end

local function handleBody(data)
  if transferChunked then
    local decoded, err = decodeChunked(data)
    if not decoded then
      log('W', err)
      return
    end
    data = decoded
  end
  data = stripIcyMetadata(data)
  appendAudio(data)
  if bytesReceived > 0 and stateSent ~= 'playing' and stateSent ~= 'buffering' then
    triggerState('buffering', 'Получаем аудиопоток…')
  end
end

local function tryNextSource(reason)
  closeSocket()
  if not active then return end
  local station = STATIONS[selectedId]
  if not station then active = false; triggerState('error', 'Неизвестная радиостанция'); return end
  sourceIndex = sourceIndex + 1
  if sourceIndex > #station.urls then
    flushAudio(true)
    active = false
    triggerState('error', reason or 'Все резервные потоки недоступны')
    return
  end
  local url = station.urls[sourceIndex]
  if not startConnection(url, 0) then
    tryNextSource('Не удалось подключиться к резервному потоку')
    return
  end
  triggerState('connecting', 'Подключение к ' .. station.name .. ' (' .. tostring(sourceIndex) .. '/' .. tostring(#station.urls) .. ')')
end

local function startCurrentSource(url, redirectDepth)
  if not startConnection(url, redirectDepth or 0) then
    tryNextSource('Не удалось установить соединение')
  end
end

local function parseHeaders(raw)
  local lines = {}
  for line in raw:gmatch('[^\r\n]+') do lines[#lines + 1] = line end
  local statusLine = lines[1] or ''
  local code = tonumber(statusLine:match('HTTP/%d%.%d%s+(%d+)') or statusLine:match('ICY%s+(%d+)'))
  local headers = {}
  for i = 2, #lines do
    local key, value = lines[i]:match('^%s*([^:]+):%s*(.-)%s*$')
    if key then headers[key:lower()] = value end
  end
  return code, headers
end

local function buildRequest()
  local target = connectTarget
  return 'GET ' .. target.path .. ' HTTP/1.1\r\n' ..
    'Host: ' .. target.host .. (target.port ~= 80 and (':' .. tostring(target.port)) or '') .. '\r\n' ..
    'User-Agent: BeamiPhone/1.4 (BeamNG.drive)\r\n' ..
    'Accept: audio/mpeg, */*;q=0.8\r\n' ..
    'Icy-MetaData: 0\r\n' ..
    'Connection: keep-alive\r\n\r\n'
end

local function handleHeaders(headerText, rest)
  local code, headers = parseHeaders(headerText)
  if code == 301 or code == 302 or code == 303 or code == 307 or code == 308 then
    if redirects >= 4 then tryNextSource('Слишком много перенаправлений'); return end
    local location = headers.location
    local nextUrl = resolveRedirect(location, currentUrl)
    if not nextUrl then tryNextSource('Сервер перенаправил на неподдерживаемый HTTPS-поток'); return end
    startCurrentSource(nextUrl, redirects + 1)
    return
  end
  if code ~= 200 then
    tryNextSource('Сервер вернул HTTP ' .. tostring(code or 'неизвестный ответ'))
    return
  end
  local contentType = (headers['content-type'] or ''):lower()
  if contentType ~= '' and not contentType:find('audio', 1, true) and not contentType:find('mpeg', 1, true) and not contentType:find('octet-stream', 1, true) then
    log('W', 'Unexpected content-type: ' .. contentType)
  end
  icyMetaInt = tonumber(headers['icy-metaint'] or headers['icymetaint'] or '0') or 0
  icyAudioLeft = icyMetaInt
  icyMetaLeft = 0
  transferChunked = (headers['transfer-encoding'] or ''):lower():find('chunked', 1, true) ~= nil
  chunkBuffer = ''
  chunkSize = nil
  stage = 'body'
  triggerState('buffering', 'Станция подключена, загружаем звук…')
  if rest and #rest > 0 then handleBody(rest) end
end

local function receiveData()
  if not sock then return end
  local data, err, partial = sock:receive(16384)
  local received = data or partial
  if received and #received > 0 then
    lastDataAt = os.clock()
    if stage == 'headers' then
      headerBuffer = headerBuffer .. received
      local split = headerBuffer:find('\r\n\r\n', 1, true)
      if split then
        local headerText = headerBuffer:sub(1, split - 1)
        local rest = headerBuffer:sub(split + 4)
        headerBuffer = ''
        handleHeaders(headerText, rest)
      elseif #headerBuffer > 32768 then
        tryNextSource('Слишком большой HTTP-заголовок')
      end
    elseif stage == 'body' then
      handleBody(received)
    end
  end
  if err == 'closed' then
    flushAudio(true)
    tryNextSource('Соединение с радиостанцией закрыто')
  elseif err and err ~= 'timeout' and err ~= 'wantread' then
    tryNextSource('Ошибка чтения потока: ' .. tostring(err))
  end
end

local function updateSocket()
  if not sock then return end
  if stage == 'connecting' then
    local _, writable = socketLib.select({}, { sock }, 0)
    if writable and #writable > 0 then
      local peer = sock:getpeername()
      if peer then
        stage = 'send'
      else
        tryNextSource('Сервер отклонил соединение')
        return
      end
    else
      if os.clock() - connectionStartedAt > 12 then tryNextSource('Тайм-аут подключения') end
      return
    end
  end
  if stage == 'send' then
    if not sendBuffer then sendBuffer = buildRequest(); sendPos = 1 end
    local sent, err, last = sock:send(sendBuffer, sendPos)
    if sent then sendPos = sent + 1
    elseif last and last >= sendPos then sendPos = last + 1 end
    if sendPos > #sendBuffer then
      stage = 'headers'
      sendBuffer = nil
      lastDataAt = os.clock()
    elseif err and err ~= 'timeout' and err ~= 'wantwrite' then
      tryNextSource('Ошибка отправки HTTP-запроса: ' .. tostring(err))
      return
    end
  end
  if stage == 'headers' or stage == 'body' then
    local readable = socketLib.select({ sock }, {}, 0)
    if readable and #readable > 0 then receiveData() end
    if active and os.clock() - lastDataAt > 18 then
      tryNextSource('Радиостанция не передаёт данные')
    end
  end
end

function M.play(stationId, sequence)
  local station = STATIONS[tostring(stationId or '')]
  if not station then
    selectedId = tostring(stationId or '')
    active = false
    triggerState('error', 'Неизвестная станция: ' .. selectedId)
    return false
  end
  closeSocket()
  active = true
  selectedId = stationId
  requestSequence = tonumber(sequence) or (requestSequence + 1)
  sourceIndex = 0
  redirects = 0
  stateSent = nil
  outputBuffer = ''
  bytesReceived = 0
  triggerState('connecting', 'Подключаемся к ' .. station.name .. '…')
  tryNextSource('Не удалось подключиться к ' .. station.name)
  return true
end

function M.stop()
  active = false
  closeSocket()
  triggerState('stopped', 'Эфир остановлен')
end

function M.onUpdate(dtReal, dtSim, dtRaw)
  if not active then return end
  local dt = tonumber(dtReal) or 0.016
  flushTimer = flushTimer + dt
  updateSocket()
  flushAudio(false)
end

function M.onExtensionUnloaded()
  active = false
  closeSocket()
end

return M
