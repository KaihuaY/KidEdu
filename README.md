# Practice (KidEdu)

A daily-practice PWA built for Nora: a Rubik's cube climbing wall of tiny
missions (with a camera that can read her real cube) and a piano practice
recorder with grown-up ratings, sharing one prize economy of
gold/silver/bronze tokens spent on parent-fulfilled blind boxes. Progress,
prize tokens, and stickers sync between devices through a private GitHub
Gist; piano recordings back up to the parent's Google Drive.

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
10 holds, unlocked one at a time from the bottom up. Each hold is 2-5 tiny
**missions** (3-6 minutes each) instead of one long lesson - a mission is
**Look → Do → Check**: look at what the piece should end up like, do the
animated steps (replayable, tap-along practice where it fits), then check
"does yours look like this?" against her own real cube. One "✅ Yes, I did
it!" unlocks the next mission; finishing every mission of a hold masters it.
Most holds past the first two also open with a **Ready?** checkpoint card
("your cube should look like this, held like this") so there's an explicit
hand-off from the wall below, with a one-tap way back down if her cube
doesn't match yet.

### The daily ritual

Her cube is scrambled at the start of every session, so before any hold but
Base Camp she sees a short **orientation ritual** once per day
(`src/components/OrientationRitual.tsx`): a reminder that the middle
sticker of each side never moves (it always tells you that side's true
colour), then "turn the whole cube until yellow is on top and green faces
you" - the one frame every mission's pictures assume. She confirms
("Yellow is on top, green faces me ✅") and moves straight into the mission.

### Every day

The Wall's daily card (`src/store/dailyPlan.ts`) plans exactly one warm-up
plus one new mission per local day, frozen once computed so it can't shift
under her mid-session: a one-minute **🔁 Warm-up** replay of whichever
mission she most recently finished before today (skipped entirely on day
one, or once she's replayed everything there is), then **⭐ New** - the next
mission in curriculum order. Warming up gives +5 XP and no token (she
already earned one the first time); it moves straight into today's new
mission once she confirms "Still got it? ✅". Finishing today's new mission
shows a "Tomorrow: {next mission}" teaser with a small preview of its Look
picture instead of the usual "Next mission ▶" button, and the Wall settles
into "That's today's climb, {name}! 🎉 Come back tomorrow." - with a smaller
**Climb one more ▶** underneath for a kid who wants to keep going anyway
(never locked out). Home's Cube card mirrors the same plan
(`cubeStatusText`), and every mission celebration offers **📤 Show someone**
to share (or copy) a one-line brag about what she just finished.

### How the app remembers

The warm-up isn't just "yesterday's mission" - it's a spaced-review queue
(`src/store/missions.ts`, `src/store/dailyPlan.ts`). Every mission she's
completed carries a review stage (0-4) and a due date; tapping through a
warm-up cleanly ("Still got it? ✅") pushes that mission's next review out
along 1 → 3 → 7 → 14 → 30 days, while needing "🔁 Show me again" (or any
"👀 Show me" in from-memory mode below) brings it straight back to tomorrow
instead. Each day the Wall offers whichever completed mission is due
earliest - so a trick she nailed weeks ago quietly stops showing up, and one
she fumbled reappears fast.

Before a familiar named trick's animation plays again - once she's done it
at least twice, always during a warm-up - she gets a quick **recall
question** first ("Which move comes first in The Elevator 🛗?", two big
buttons, no picture) so she has to retrieve it from memory before seeing it
shown. Either answer is fine; it always reveals the animation right after.

Follow-along practice fades the same way: after 3 reps of a named trick she
gets a choice above the move strip, **🧠 Try it from memory** vs. **👀 Show
me each move** (still defaulting to step-by-step); past 5 reps the default
flips to from-memory - a paused cube, the trick's name, and "Did the whole
trick ✅" (or "👀 Show me" to drop back to follow-along just for that step).
Her choice is remembered per mission.

### Free "get ready" help vs. mission help

Tapping **✅ Yes, I did it!** with no help at all earns the best medal. If
she's not sure, **🔁 Show me again** replays the mission's own Do steps at no
cost, and **📷 Show me my cube** (offered on missions that map to a solver
phase) scans her real cube: if it's not even ready for *this* mission yet -
say she's mid-scramble on a later hold - a **free** "Get me ready" walkthrough
first replays the steps she already mastered from earlier holds, with no
effect on her token; only walking her through *this* mission's own new step
counts as help.

**Token tiers**, one per mission (plus a bonus gold for mastering the whole
hold): 🥇 gold - no help at all; 🥈 silver - she only used the camera to
check, no walkthrough; 🥉 bronze - the app walked her through it. A replay
never earns a second token but can upgrade a mission's medal if she does
better the next time.

| # | Hold | Missions | What it teaches |
|---|------|----------|------------------|
| 0 | Base Camp | 5 | Every basic move, both directions - no solving yet |
| 1 | The Daisy Ledge | 4 | Grow a daisy: four white edges standing around the yellow centre |
| 2 | The White Cross Bridge | 3 | Tuck the daisy down into a white cross |
| 3 | Corner Lookout | 2 | Find a white corner's home and park it above home, front-right |
| 4 | Corner Crack | 3 | The Elevator rides each white corner down into place |
| 5 | Middle Traverse | 4 | Send it Right / Send it Left place the middle-layer edges |
| 6 | Yellow Cross Ridge | 2 | Dot → L → line → a full yellow cross on top |
| 7 | Edge Ledge | 2 | The Fish lines up the yellow edges with their centres |
| 8 | Corner Shuffle | 2 | Corner Swap walks the yellow corners into their own spots |
| 9 | THE SUMMIT | 2 | The Bottom Elevator twists every corner yellow-up - fully solved! |

Holds 1-2 and 3-4 used to each be a single combined hold (`cross` covered
daisy-growing *and* cross-tucking; `corners` covered corner-hunting *and*
the Elevator); they were split so each hold teaches one idea at a time. Old
saved progress migrates automatically (`src/store/progress.ts`); a hold
mastered under the old Watch/Try/Spot/Climb stages still shows every mission
done.

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
- **A take survives a crash or an accidental reload.** While recording, each
  ~1-second chunk from the microphone is saved to this device as it's
  captured, not just at the end - so if the tab is killed, the iPad reboots,
  or an app update happens to land mid-take, nothing but the last second or
  so is ever at risk. The next time the app opens, any leftover in-progress
  audio is stitched back together into a normal take automatically (see
  "Your data is safe" below).

### Notes and badges

- **Grown-up notes.** From **👀 Grown-up review**, rating a day also offers
  "💬 Add a note" (a short typed message, ≤140 characters) and "🎙️ Say it
  (15 s)" - a voice note recorded through the same take pipeline as
  practice, so it uploads to Drive and plays back anywhere just like a real
  take, but is flagged internally so it never counts toward Nora's practice
  minutes, goals, or take list. **Settings → 💌 Leave a note** offers a
  typed note not tied to any particular day. Notes show up on Nora's Home
  screen until she taps "Got it 💛".
- **Badges.** A small badge shelf ("🏅 Badges", on the Box screen's sticker
  tab) tracks milestones across both activities: cube firsts (finishing the
  daisy, the white cross, all four corners, the middle layer, the yellow
  cross, and the summit), cube and piano streaks (3/7/14/30 days), and piano
  milestones (first recording, 10 recordings, 100 minutes of playing total,
  and a first 3-star day from the parent). Earning one pops a small "🏅 New
  badge!" toast for a few seconds; the shelf itself shows earned badges in
  colour with the date, and unearned ones greyed out with a hint for how to
  get them.

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

## Your data is safe

Deploying a new build only ever replaces the app's own code - the progress
doc (`localStorage`) and recorded audio (IndexedDB) are separate, per-origin
browser storage that a deploy never touches. A few things still deserve
their own protection, and are handled automatically:

- **Updates never interrupt a mission or a take.** The app checks for a new
  build in the background, but never applies it on its own - it waits for
  an idle moment (Home, Cube, Piano home, Box, or Settings; never mid-lesson
  or mid-recording) and shows a small "✨ New version ready · ⬆ Update"
  banner. Nothing reloads until that banner is tapped.
- **An interrupted piano take is still recovered.** As covered above under
  Piano, each second of a take is saved as it's recorded, not only at the
  end. If the app never gets to finish the take cleanly (a crash, a forced
  quit, a reload), the next launch stitches the leftover audio back into a
  normal take and shows "We saved an unfinished recording from earlier 💾"
  on Piano home.
- **A migration always leaves a way back.** Whenever the app notices a saved
  progress file needs updating to a new shape - or is being opened by a
  newly-installed build for the first time - it stashes a copy of the
  pre-update file first, keeping the last 3. **Settings (grown-up PIN) →
  Backup → Automatic backups** lists them with their date and app version,
  each with a two-tap **Restore**; restoring itself takes one more backup
  first, so it's always reversible. The bottom of that section also shows
  **Version:**, the exact build a device is running - handy when confirming
  everyone updated.
- **Recordings ask to be protected from storage cleanup.** Some browsers
  quietly clear the oldest site data if a page hasn't been opened in about a
  week. The app asks the browser to exempt Practice's storage from that the
  moment it's unlocked; an **Add to Home Screen** install (see above) is the
  most reliable way to get - and keep - that protection. **Settings →
  Recordings** shows "Storage: protected ✅" once it's confirmed, or a
  reminder to install it if not, plus how much storage is in use.
- **Progress gets a second, independent backup.** Beyond the private-gist
  sync above, whenever Google Drive upload is configured the whole progress
  export is also uploaded to that same Drive folder once a day, as
  `practice-progress-<date>.json` - so a lost or revoked gist token still
  leaves a same-day copy sitting somewhere the parent can already see.
  **Settings → Google Drive upload** shows the date of the last one.

What none of this covers: deleting the home-screen icon, clearing the
browser's site data by hand, or a full device wipe still removes local
audio and any progress that never made it to a sync. Keep GitHub sync and/or
Drive upload configured on at least one device so there's always an
off-device copy.
