// Practice (KidEdu) - Google Drive uploader
// ---------------------------------------------------------------------------
// A tiny Google Apps Script web app. The Practice app posts each piano
// recording here; the script saves it into a folder in YOUR Google Drive.
// It runs as you, so the iPad never needs to sign in to Google.
//
// Setup (once, ~3 minutes):
//   1. Open https://script.google.com and click "New project".
//   2. Delete the sample code, paste this whole file, change SECRET below
//      to any long word of your own (letters/digits, no spaces).
//   3. Click Deploy > New deployment > type: Web app.
//        Execute as: Me            Who has access: Anyone
//      Click Deploy, authorize when asked, and copy the Web app URL
//      (it ends in /exec).
//   4. In Practice: Settings (PIN) > Recordings > Google Drive:
//      paste the URL and the same SECRET, then press Test.
//   Redeploying after editing: Deploy > Manage deployments > pencil >
//   Version: New version > Deploy (the URL stays the same).
//
// Smoke test from a terminal:
//   curl -sL -X POST "<url>" -H "Content-Type: text/plain" \
//        -d '{"secret":"<SECRET>","ping":true}'
//   -> {"ok":true,"pong":true}
// ---------------------------------------------------------------------------

var SECRET = 'change-me-please'
var DEFAULT_FOLDER = 'Nora Piano'
// When true, saved files are viewable by anyone who has the link, so the
// Practice app on another device can play them without a Google sign-in.
// Set to false if you prefer to open them only from Drive yourself.
var SHARE_WITH_LINK = true

function doPost(e) {
  try {
    var body = JSON.parse((e && e.postData && e.postData.contents) || '{}')
    if (!body || body.secret !== SECRET) return json({ ok: false, error: 'bad secret' })
    if (body.ping) return json({ ok: true, pong: true })
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
