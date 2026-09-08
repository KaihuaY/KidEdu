# Practice (KidEdu)

A daily-practice PWA built for Nora: a Rubik's cube teaching hub and (coming
soon) a piano practice hub, sharing one prize economy of gold/silver/bronze
tokens spent on parent-fulfilled blind boxes. Cube lessons are organized like
a climbing wall: watch a move, try it, get spotted, then climb it solo.
Progress, prize tokens, and stickers sync between devices through a private
GitHub Gist.

## Development

```sh
npm install
npm run dev
```

The dev server listens on all network interfaces (`server.host: true`), so
you can open it from a phone or iPad on the same Wi-Fi at
`http://<your-computer's-local-IP>:5173`.

```sh
npm test        # unit tests (vitest)
npm run build   # type-check + production build
npm run dev:https  # dev server over HTTPS, for iPad testing (see below)
```

### Testing on an iPad over the local network

Safari only grants microphone access (needed for the piano recording
feature, added in a later step) on a secure origin. `npm run dev:https`
starts the dev server with a self-signed certificate
(`@vitejs/plugin-basic-ssl`) so it can be reached as
`https://<your-computer's-local-IP>:5173` from an iPad on the same Wi-Fi.
Safari will warn about the certificate the first time - accept it once per
device. Nothing is deployed for this; it's purely a local testing loop.

The iPad should **Add to Home Screen** from Safari's share sheet so it runs
as a standalone PWA (no browser chrome, its own storage). A home-screen web
app's storage is isolated from regular Safari tabs, so progress made in a
tab and progress made in the installed app are separate until gist sync
connects them.

## Deploy

Pushing to `main` runs `.github/workflows/deploy.yml`, which installs
dependencies, runs tests, builds, and publishes `dist/` to GitHub Pages via
`actions/upload-pages-artifact` + `actions/deploy-pages`. In the repo's
**Settings → Pages**, set the source to "GitHub Actions" once.

The production build is served from `/KidEdu/` (see `base` in
`vite.config.ts`) to match this repo's GitHub Pages URL:
<https://kaihuay.github.io/KidEdu/>.

> **Note:** this app was renamed from CubeClimb. If you have the old
> CubeClimb icon installed on a phone or iPad, **delete it and re-add the
> app** from the new URL above - an old cached install will keep pointing at
> the old (now retired) URL and manifest.

## Secret word

Before using Practice, everyone must type a shared secret word once per
device (a lightweight lock screen, not real security). The default word is
`climb`.

To change it:

```sh
node scripts/hash-password.mjs <new word>
```

Paste the printed hash into `FAMILY_PASSWORD_SHA256` in
`src/content/access.ts`, then commit and push.

A grown-up can also force a device to re-ask for the secret word from
**Settings (grown-up PIN) → Secret word → Lock this device now**.

## Syncing progress across devices (parent setup)

Practice keeps all progress in the browser (`localStorage`) by default. To
sync it across devices (e.g. Nora's tablet and a parent's phone), connect a
private GitHub Gist from **Settings**:

1. Go to <https://github.com/settings/personal-access-tokens/new> (GitHub's
   *fine-grained* personal access tokens).
2. Give it a name like "Practice sync" and set **Expiration** to 1 year.
3. Under **Permissions → Account permissions**, set **Gists** to
   **Read and write**. Leave every other permission at "No access."
4. Generate the token, copy it, and paste it into Practice's Settings
   screen.
5. Repeat on the second device with the *same* token so both devices sync to
   the same gist.

Practice only ever touches gists - it can't read your repositories, issues,
or anything else on your account. If you ever want to revoke access, delete
the token from GitHub's settings page and tap "Disconnect" in Practice's
Settings.

## Cube

The Rubik's cube curriculum (`src/content/lessons.ts`) is a climbing wall of
10 holds, unlocked one at a time from the bottom up. Each hold is a 5-stage
lesson - **Learn → Watch → Try → Spot it → Climb** - and every hold past the
first two also opens with a **Ready?** checkpoint card ("your cube should
look like this, held like this") so there's always an explicit hand-off from
the wall below, with a one-tap way back down if her cube doesn't match yet.

| # | Hold | What it teaches |
|---|------|------------------|
| 0 | Base Camp | Every basic move, both directions - no solving yet |
| 1 | The Daisy Ledge | Grow a daisy: four white edges standing around the yellow centre |
| 2 | The White Cross Bridge | Tuck the daisy down into a white cross, then flip white to the bottom |
| 3 | Corner Lookout | Find a white corner's home and park it above home, front-right |
| 4 | Corner Crack | The Elevator rides each white corner down into place |
| 5 | Middle Traverse | Send it Right / Send it Left place the middle-layer edges |
| 6 | Yellow Cross Ridge | Dot → L → line → a full yellow cross on top |
| 7 | Edge Ledge | The Fish lines up the yellow edges with their centres |
| 8 | Corner Shuffle | Corner Swap walks the yellow corners into their own spots |
| 9 | THE SUMMIT | The Bottom Elevator twists every corner yellow-up - fully solved! |

Holds 1-2 and 3-4 used to each be a single combined hold (`cross` covered
daisy-growing *and* cross-tucking; `corners` covered corner-hunting *and*
the Elevator); they were split so each hold teaches one idea at a time. Old
saved progress migrates automatically (`src/store/progress.ts`).

### Scanning a real cube with the camera

**Help my cube** (Cube → Help) can read a scrambled cube through the camera
instead of tapping all 54 stickers:

1. Tap **📷 Scan my cube**, then **Open camera** (allow the camera when asked).
2. The card at the top shows how to hold the cube for each of the six faces,
   starting with yellow on top and green facing the camera. Fill the square
   with the face, keep the centre sticker in the middle cell, and tap
   **Capture**. Check the nine colours it read, then **Looks right** or
   **Retake**.
3. After the sixth face the colours land on the net. Anything the camera was
   unsure about is left blank - tap those stickers to fix them by hand, then
   **Solve it!**
4. While following the steps, **Scan again to check** re-reads the cube and
   restarts the walkthrough from what it sees. That is how the app keeps up
   with her real cube: scan, do the steps, scan again.

Tips: use normal indoor light and avoid a window or lamp glaring off the
stickers; hold the cube still while capturing; if one colour keeps coming out
wrong (white/yellow and red/orange are the hard pairs), just tap it on the
net. Colours are classified against the six centre stickers the camera saw
(`src/engine/cubeScan.ts`), so it adapts to the cube and the lighting.

## Piano

Piano practice lives at the 🎹 Piano tab. It's built for acoustic piano at
an iPad propped on the music stand, microphone only - no MIDI, no teaching.

- **Record.** From Piano home, Nora picks a piece (or "🎵 Free play") and
  taps one big 🎙️ button to start. A ring fills only while the app hears
  real playing, not just wall-clock time - "silence doesn't count" is shown,
  not explained. If it goes quiet for 20 seconds she gets a gentle "I can't
  hear the piano" nudge, never a buzzer. One giant ⏹ Stop ends the take;
  closing the tab or backgrounding Safari mid-take also stops it cleanly and
  keeps whatever was captured.
- **Rating, three layers.**
  1. **Active minutes** are measured automatically from microphone level -
     only real playing counts toward the daily goal, not idle time with the
     recorder running.
  2. **Nora self-rates** each take right after recording it (😕 🙂 🤩) - purely
     for her own reflection, it never affects tokens.
  3. **The parent listens later** (on any device, behind the grown-up PIN,
     under "👀 Grown-up review") and gives 1-3 stars. Two stars awards a
     silver token, three stars gold, mirroring the cube's reward economy;
     one rating per day.
- **Tokens.** Reaching the daily active-minutes goal awards a bronze token
  once per day and bumps Nora's piano streak, same shape as the cube's
  streak. All tokens land in the same shared economy spent on blind boxes.
- **Microphone permission on iPad.** Safari only grants microphone access on
  a secure origin (see `npm run dev:https` above) or the deployed HTTPS
  site. The first time Record is tapped, Safari asks to allow the
  microphone - allow it. If it was denied by mistake: **Settings app →
  Safari → [or, for the installed PWA, Settings app → Practice] →
  Microphone → Allow**, then reopen the app. The Record screen shows this
  same guidance and a Back button if it detects a denial, so it's never a
  dead end.
- **Add to Home Screen.** Open the site in Safari, tap the Share icon, then
  **Add to Home Screen**. Running as an installed PWA keeps the browser
  chrome out of the way during recording and keeps the screen awake where
  supported. A home-screen app's storage is separate from Safari tabs (see
  "Testing on an iPad over the local network" above) - install once and
  keep using that icon.
- **Recordings are local, and pruned.** Audio lives only in this device's
  IndexedDB (never in the synced gist, which carries only take metadata:
  times, active minutes, ratings, and the Drive link once uploaded).
  Recordings older than the **Settings → Recordings → Keep local audio
  for** setting (7 / 14 / 30 days, default 14) are deleted automatically the
  next time Piano home opens; a take recorded on another device always
  shows as "recorded on another device" once its local copy is gone. Use
  **Settings → Recordings → 🗑️ Delete all recordings on this device** to
  clear them immediately (a two-tap confirm).

### Google Drive upload

So the parent can listen and rate from a phone or laptop, not just on
Nora's iPad, every take is automatically uploaded to a Google Drive folder
of the parent's choosing. It's a small Google Apps Script web app the
parent deploys once - the iPad never signs in to Google, it just posts to a
URL the script owns.

**Setup (once, about 3 minutes):**

1. Open <https://script.google.com> and click **New project**.
2. Delete the sample code, paste in the whole contents of
   [`scripts/drive-uploader.gs`](scripts/drive-uploader.gs) from this repo,
   and change the `SECRET` constant near the top to any long word of your
   own (letters/digits, no spaces).
3. Click **Deploy → New deployment**, type **Web app**. Set **Execute as**
   to **Me** and **Who has access** to **Anyone**. Click **Deploy**,
   authorize when Google asks, and copy the **Web app URL** (it ends in
   `/exec`).
4. In Practice: **Settings (grown-up PIN) → Google Drive upload**, paste the
   URL and the same secret, optionally change the folder name (default
   "Nora Piano"), then press **Test**. Enter it once on the laptop - the
   iPad picks it up through gist sync within a minute.

Redeploying after editing the script: **Deploy → Manage deployments →
pencil icon → Version: New version → Deploy** (the URL stays the same).

Recordings upload in the background after every take, on Piano home
opening, every 30 seconds, and whenever the device comes back online - this
also picks up any take recorded before Drive was configured at all, not
just ones recorded since. A small chip under each take shows "☁️ Saved to
Drive", "☁️ Uploading…", "☁️ Uploading soon" (with an inline "Upload now"),
or "☁️ Upload failed" (with "Try again") - both buttons skip straight past
the wait. A stuck upload never blocks Nora - the take is saved locally and
any token already awarded before an upload is even attempted; it just
quietly retries with backoff (10s, then 60s, then 5 min, then 30 min) up to
8 attempts before giving up, and can always be retried by hand.

**Smoke test**, from a terminal, once deployed:

```sh
curl -sL -X POST "<your web app URL>" -H "Content-Type: text/plain" \
     -d '{"secret":"<your SECRET>","ping":true}'
# -> {"ok":true,"pong":true}
```
