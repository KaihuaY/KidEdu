// Practice (KidEdu) - Google Drive uploader + AI coach relay
// ---------------------------------------------------------------------------
// A tiny Google Apps Script web app. The Practice app posts each piano
// recording here; the script saves it into a folder in YOUR Google Drive.
// It runs as you, so the iPad never needs to sign in to Google. It also
// relays the AI coach's requests to Claude, so the API key lives only here
// (in Script Properties), never in the app, the repo, or the synced gist.
//
// Setup (once, ~3 minutes):
//   1. Open https://script.google.com and click "New project".
//      Delete the sample code and paste this whole file. Then Project
//      Settings (gear icon) > Script Properties > Add script property:
//      name UPLOAD_SECRET, value any long word of your own (letters/digits,
//      no spaces). The secret lives in a property, NOT in this file, so
//      pasting a newer version of this file later can never reset it.
//   2. For the AI coach: Project Settings (gear icon) > Script Properties >
//      Add script property. Name it ANTHROPIC_API_KEY, value your Claude
//      API key from console.anthropic.com. (Optional: add COACH_DAILY_CAP
//      to change the default 80-requests-a-day limit. If the Test button says
//      the key "is not scoped to a workspace", either create the key inside a
//      workspace in the Console (simplest), or add one more property,
//      ANTHROPIC_WORKSPACE_ID, with the workspace id.) Skip this step and
//      the coach quietly uses its built-in phrases instead of Claude.
//   3. Click Deploy > New deployment > type: Web app.
//        Execute as: Me            Who has access: Anyone
//      Click Deploy, authorize when asked, and copy the Web app URL
//      (it ends in /exec).
//   4. In Practice: Settings (PIN) > Recordings > Google Drive:
//      paste the URL and the same SECRET, then press Test.
//   After pasting a NEWER version of this file:
//     a. Run the function "authorizeOnce" once (pick it in the toolbar's
//        function list > Run > Review permissions > Allow). Newer versions
//        may need a permission the old one did not (the AI coach needs
//        "connect to an external service").
//     b. Deploy > Manage deployments > pick your EXISTING deployment >
//        pencil icon > Version: New version > Deploy. The URL stays the
//        same. Do not use "New deployment": that makes a second URL the app
//        does not know about.
//
// Smoke test from a terminal:
//   curl -sL -X POST "<url>" -H "Content-Type: text/plain" \
//        -d '{"secret":"<SECRET>","ping":true}'
//   -> {"ok":true,"pong":true}
// ---------------------------------------------------------------------------

// Legacy fallback only. Prefer the UPLOAD_SECRET script property (see setup step 1): while this
// still says 'change-me-please' and no property is set, every request is refused.
var SECRET = 'change-me-please'

/** The shared secret: the UPLOAD_SECRET script property, else the constant above if it was changed. */
function secret_() {
  var fromProps = PropertiesService.getScriptProperties().getProperty('UPLOAD_SECRET')
  if (fromProps) return fromProps
  return SECRET === 'change-me-please' ? null : SECRET
}

/**
 * Run this once from the editor after pasting a new version. It touches every service the script
 * uses, so Google shows its permission prompt for all of them in one go.
 */
function authorizeOnce() {
  DriveApp.getRootFolder()
  PropertiesService.getScriptProperties().getKeys()
  UrlFetchApp.fetch('https://api.anthropic.com/', { muteHttpExceptions: true })
  Logger.log('Authorized. Now: Deploy > Manage deployments > your existing deployment > New version.')
}
var DEFAULT_FOLDER = 'Nora Piano'
// When true, saved files are viewable by anyone who has the link, so the
// Practice app on another device can play them without a Google sign-in.
// Set to false if you prefer to open them only from Drive yourself.
var SHARE_WITH_LINK = true

function doPost(e) {
  try {
    var body = JSON.parse((e && e.postData && e.postData.contents) || '{}')
    var expected = secret_()
    if (!expected) return json({ ok: false, error: 'no secret set: add the UPLOAD_SECRET script property' })
    if (!body || body.secret !== expected) return json({ ok: false, error: 'bad secret' })
    if (body.ping) return json({ ok: true, pong: true })
    if (body.action === 'coach') return doCoach(body)
    if (body.action === 'coach-status') return doCoachStatus()
    if (!body.dataBase64) return json({ ok: false, error: 'no audio data' })

    var folder = getOrCreateFolder(body.folderName || DEFAULT_FOLDER)
    var bytes = Utilities.base64Decode(body.dataBase64)
    var blob = Utilities.newBlob(bytes, body.mimeType || 'audio/mp4', body.fileName || 'take.m4a')
    var file = folder.createFile(blob)
    if (body.description) file.setDescription(String(body.description))
    if (SHARE_WITH_LINK) {
      file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW)
    }
    return json({
      ok: true,
      fileId: file.getId(),
      url: file.getUrl(),
      downloadUrl: 'https://drive.google.com/uc?export=download&id=' + file.getId(),
      sizeBytes: file.getSize(),
    })
  } catch (err) {
    return json({ ok: false, error: String(err) })
  }
}

function doGet() {
  return json({ ok: true, service: 'practice-drive-uploader' })
}

function getOrCreateFolder(name) {
  var it = DriveApp.getFoldersByName(name)
  return it.hasNext() ? it.next() : DriveApp.createFolder(name)
}

function json(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON)
}

// --- AI coach: relays one prompt to Claude, key never leaves this script ---

/** Local (script time zone) YYYY-MM-DD, used to key the daily request cap. */
function todayKey_() {
  return Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd')
}

/**
 * { secret, action: 'coach', system, user, schema } -> asks Claude to fill
 * `schema` from `system` + `user`, under a per-day request cap. Model and
 * max_tokens are fixed here (never sent by the client) so a compromised or
 * buggy client build can't run up an unexpected bill.
 */
/** Request headers for the Claude API; adds the workspace header only when the parent configured one. */
function anthropicHeaders_(props, apiKey) {
  var headers = {
    'x-api-key': apiKey,
    'anthropic-version': '2023-06-01',
    'anthropic-beta': 'server-side-fallback-2026-07-01',
  }
  var workspace = props.getProperty('ANTHROPIC_WORKSPACE_ID')
  if (workspace) headers['anthropic-workspace-id'] = workspace
  return headers
}

/** The API's own error message out of an error response body, for showing to the parent. */
function apiErrorMessage_(text) {
  try {
    var parsed = JSON.parse(text)
    return (parsed && parsed.error && parsed.error.message) || text
  } catch (err) {
    return text
  }
}

function doCoach(body) {
  var props = PropertiesService.getScriptProperties()
  var apiKey = props.getProperty('ANTHROPIC_API_KEY')
  if (!apiKey) return json({ ok: false, reason: 'no-key' })

  var cap = Number(props.getProperty('COACH_DAILY_CAP')) || 80
  var countKey = 'coach-count-' + todayKey_()
  var usedToday

  // A short lock around the read-check-write of the daily counter so two
  // takes finishing at nearly the same moment can't both slip past the cap.
  var lock = LockService.getScriptLock()
  lock.waitLock(10000)
  try {
    var used = Number(props.getProperty(countKey)) || 0
    if (used >= cap) return json({ ok: false, reason: 'cap' })
    usedToday = used + 1
    props.setProperty(countKey, String(usedToday))
  } finally {
    lock.releaseLock()
  }

  var resp = UrlFetchApp.fetch('https://api.anthropic.com/v1/messages', {
    method: 'post',
    contentType: 'application/json',
    muteHttpExceptions: true,
    headers: anthropicHeaders_(props, apiKey),
    payload: JSON.stringify({
      model: 'claude-opus-5',
      max_tokens: 16000,
      fallbacks: 'default',
      output_config: { effort: 'low', format: { type: 'json_schema', schema: body.schema } },
      system: body.system,
      messages: [{ role: 'user', content: body.user }],
    }),
  })

  var status = resp.getResponseCode()
  if (status !== 200) {
    return json({ ok: false, reason: 'http-' + status, detail: apiErrorMessage_(resp.getContentText()) })
  }

  var data = JSON.parse(resp.getContentText())
  if (data.stop_reason === 'refusal' || data.stop_reason === 'max_tokens') {
    return json({ ok: false, reason: data.stop_reason })
  }

  var text = ''
  var content = data.content || []
  for (var i = 0; i < content.length; i++) {
    if (content[i] && content[i].type === 'text') text += content[i].text
  }

  var result
  try {
    result = JSON.parse(text)
  } catch (err) {
    return json({ ok: false, reason: 'bad-json', detail: String(err) })
  }

  return json({ ok: true, result: result, model: data.model, usage: data.usage, usedToday: usedToday })
}

/** { secret, action: 'coach-status' } -> for Settings' "Test AI coach" button. */
function doCoachStatus() {
  var props = PropertiesService.getScriptProperties()
  var hasKey = !!props.getProperty('ANTHROPIC_API_KEY')
  var cap = Number(props.getProperty('COACH_DAILY_CAP')) || 80
  var usedToday = Number(props.getProperty('coach-count-' + todayKey_())) || 0
  if (!hasKey) return json({ ok: true, hasKey: false, usedToday: usedToday, cap: cap })

  // A real, tiny request, so the Test button catches what a key check cannot: a key without
  // credits, a key that is not scoped to a workspace, a model the account cannot use...
  var apiOk = false
  var apiError = ''
  try {
    var resp = UrlFetchApp.fetch('https://api.anthropic.com/v1/messages', {
      method: 'post',
      contentType: 'application/json',
      muteHttpExceptions: true,
      headers: anthropicHeaders_(props, props.getProperty('ANTHROPIC_API_KEY')),
      payload: JSON.stringify({
        model: 'claude-opus-5',
        max_tokens: 64,
        output_config: { effort: 'low' },
        messages: [{ role: 'user', content: 'Reply with the single word OK.' }],
      }),
    })
    apiOk = resp.getResponseCode() === 200
    if (!apiOk) apiError = 'HTTP ' + resp.getResponseCode() + ': ' + apiErrorMessage_(resp.getContentText())
  } catch (err) {
    apiError = String(err)
  }
  return json({ ok: true, hasKey: true, apiOk: apiOk, apiError: apiError, usedToday: usedToday, cap: cap })
}
