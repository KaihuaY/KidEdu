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

## Two kids, two secret words

Practice serves two kids, Nora and Amelia. Each has her own secret word (a
lightweight lock screen, not real security), typed once per device; the
word she types decides **whose progress that device shows**, so a device
is Nora's or Amelia's from then on. Defaults: Nora `climb`, Amelia `star`.

Everything is separate per kid: daily goals, pieces and song targets, the
PIN, prize pools, tokens, tickets, badges, the photo collection, beads and
bracelets, notes and piano takes. Nora's data keeps exactly the storage
keys, database name and gist file it always had (`cubeclimb.progress`,
`cubeclimb.recordings`, `cubeclimb-progress.json`), so the update needs no
migration on her iPad; Amelia's copies are the same names with `.amelia`
appended (see `src/store/kid.ts`).

To change a word:

```sh
node scripts/hash-password.mjs <new word>
```

Paste the printed hash into that kid's line of `KIDS` in
`src/content/access.ts`, then commit and push.

A grown-up can force a device to re-ask for the secret word (forgetting
which kid it belonged to) from **Settings (grown-up PIN) → Secret words →
Lock this device now**, or move a device to the other kid without locking
it from **Settings → This device belongs to** (the page reloads into her
document; recordings stay with the device they were made on).

### The family board

Once a device has the sync token (below), Home shows a "👭 Nora & Amelia
this week" card: piano minutes, cube missions, streaks, badges and
collection cards side by side, a 🏅 on each row's leader, and a team
total. Tapping it opens the full board (`#/family`) with when each kid
last practised and one encouraging line ("Amelia is 2 missions ahead — go
climb!"). It is deliberately cooperative: no "last place", and the numbers
come straight from each kid's own synced file.

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

Both kids share one gist and one token. Each device uploads only its own
kid's file (`cubeclimb-progress.json` for Nora,
`cubeclimb-progress.amelia.json` for Amelia) and reads the other's file
purely to draw the family board - it is never merged or uploaded back, so
the two can never overwrite each other. The fastest setup for a new device
is the one-tap link, which stores the token, picks the kid and unlocks the
gate in one go:

```
https://kaihuay.github.io/KidEdu/#/setup?token=<token>&kid=amelia
```

(`&kid=nora`, or no `kid` at all, keeps the device as Nora's.)

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
  taps one big 🎙️ button to start. By default the ring fills with the whole
  recording (wall-clock time) so a normal take always counts; a gentle chip
  still says "🎵 I hear you!" / "👂 Listening…" and, after 20 quiet seconds,
  "🤫 I can't hear the piano. Play something!" as encouragement, never a
  penalty. **Settings → Daily goals → Piano goal counts** can switch this to
  🎙️ the whole recording vs. 👂 only when playing is heard, for a family that
  wants the stricter rule. One giant ⏹ Stop ends the take; closing the tab
  or backgrounding Safari mid-take also stops it cleanly and keeps whatever
  was captured, and only a take under 3 seconds is thrown away as too short
  to be worth keeping.
- **Replay.** Every take gets a coloured waveform strip (peak loudness per
  slice, quiet blue → loud pink) instead of a plain seek bar - tap or drag
  anywhere on it to jump around, or use the arrow keys. While a take
  recorded on this device is playing, the same "aurora" visualizer from the
  Record screen dances live above the waveform, reading the actual audio
  through a Web Audio analyser (skipped for a Google Drive copy, which is
  cross-origin). The done screen also shows "Steady beat" as 1-5 dots -
  how evenly spaced her note attacks were, detected from the recording and
  hidden whenever there isn't enough playing to judge it fairly - and the
  same dots show up on each take card and in Grown-up review.
- **This week's piece goal.** In **Settings → This week's piano pieces**,
  each piece can carry a tiny goal ("Bars 1–8 three times without
  stopping"). Piano home shows it under the piece chips once she picks that
  piece ("🎯 This week: …"), and the done screen after a take asks "Did you
  do it? ✅ Yes / Not yet" - her answer shows up as 🎯 ✅ / 🎯 ⬜ on that
  take's card and in Grown-up review. Clearing the goal text in Settings
  removes it everywhere it would otherwise show.
- **Metronome.** A collapsible "🎵 Metronome" panel sits above the 🎙️ Record
  button on Piano home: a big pulsing dot, the bpm number, quick tempo chips
  (60/72/84/96/108) and ±4 buttons, a 🔔 click toggle (a short, quiet WebAudio
  tick), and a ▶/⏹ button. Starting it before recording keeps it going
  through the take as a compact strip (dot + bpm + ⏹) on the Record screen,
  and it stops itself automatically once the take is done. Tempo is
  remembered separately per piece (and for free play) for next time. When a
  take comes back steady (steadiness ≥ 0.8) and the metronome was running,
  the done screen offers "Steady! Try it a little faster next time: {bpm+4}
  ▶" - tapping it just remembers that faster tempo for the piece, ready the
  next time the metronome opens for it.
- **Rating, three layers.**
  1. **Practice seconds** count toward the daily goal per the counting-mode
     setting above (recording time by default, mic-active "heard" time as
     the stricter option); active minutes are always measured automatically
     from microphone level and always shown to the parent on the review
     screen either way, even when the goal itself counts the whole
     recording.
  2. **Nora self-rates** each take right after recording it (😕 🙂 🤩) - purely
     for her own reflection, it never affects tokens.
  3. **The parent listens later** (on any device, behind the grown-up PIN,
     under "👀 Grown-up review") and gives 1-3 stars. Two stars awards a
     silver token, three stars gold, mirroring the cube's reward economy;
     one rating per day.
- **Tokens.** Reaching the daily piano goal awards a bronze token once per
  day and bumps Nora's piano streak, same shape as the cube's streak. All
  tokens land in the same shared economy spent on blind boxes.
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

### Song repeat targets

A grown-up can ask for a piece to be played a set number of times a day:
**Settings → This week's piano pieces → Play it __ times a day** (off, or
1–10). While recording that piece the screen shows "⭐ Twinkle · 1 of 3
today" and a big **🎵 Played it! +1** button; she taps it each time she
plays the song through (the count is checkpointed on every tap, so a crash
mid-take keeps it). Reaching the target flashes "Target done! ✨" with a
little confetti, and the done screen adds **+2 beads 📿** for her bracelet
tray - once per piece per day. Piano home lists each targeted piece with
its "2 of 3 today" and shows "Songs done ✅" when every target is met; the
grown-up review shows "🎵 ×3" next to a take.

### The coach: written feedback for every take, and song journeys

After each take the app **measures the recording** and then writes two
notes about it. Both are text only; nothing is read aloud.

- **What is measured** (`src/audio/takeAnalysis.ts`, on the device, from the
  recorded audio): how long the piano was actually sounding, long pauses
  inside the music and the longest one, the loud-to-soft range, and - for a
  named piece - how the take lines up against her own best complete take of
  that piece: how far through the piece she got, how closely it matched,
  "sticky spots" where she lingered or repeated, and her speed relative to
  that best take. These are measurements of sound through a tablet
  microphone, **not a judgement of right or wrong notes**; nothing in the app
  knows the score. The method was validated on 128 of Nora's real
  recordings, where the fingerprints picked the right piece 98 % of the time.
  Absolute tempo (bpm) and the older steady-beat score proved unreliable on
  real music and are deliberately not used for feedback. A take that barely
  matches the selected piece (probably other music) is never compared.
- **Who writes the notes.** Claude (`claude-opus-5`) turns the measurements
  into the two notes. Claude cannot receive audio, so it only ever sees the
  numbers, and the prompt (`src/content/coachPrompt.ts`) forbids claiming to
  have listened, asks for praise of effort and strategy rather than talent,
  treats slow practice as a good choice, never compares the girls, and keeps
  Nora's note to two short sentences plus one "try next time". The request
  goes through **your own Apps Script** (below), which holds the API key;
  the key is never in the app, this repository or the synced file. Whenever
  Claude is unavailable (no key yet, offline, daily cap reached, an invalid
  answer) built-in phrases (`src/content/coachPhrases.ts`) fill the same
  fields from the same numbers, so the feature never blocks.
- **Where they show.** Nora sees the short "🎧 Coach" card on the done
  screen and one line on each take card. The fuller grown-up note, with the
  numbers and one practice idea, is only in **👀 Grown-up review** (behind
  the PIN) under "🎧 Coach note", with a "↻ Refresh feedback" button.
- **Song journeys.** A piece with two or more takes gets a "📈 Journey"
  button on Piano home: a written "how this song has grown" summary, ribbons
  ("First time with no long pauses 🎉", "Played it all the way through 🏁"),
  small charts over the days (long pauses, sticky spots, how far she got,
  speed versus her best take - with the reminder that speed is not a score),
  and her best take to replay. The grown-up version of each journey, with
  trend numbers, is in the review screen.
- **One-time setup for the AI text** (the app works without it, using the
  built-in phrases): paste the current `scripts/drive-uploader.gs` over your
  script, add a Script Property `ANTHROPIC_API_KEY` (Project Settings →
  Script properties) with a key from console.anthropic.com, then Deploy →
  Manage deployments → ✏️ → Version: New version → Deploy, so the URL in
  Settings stays the same. **Settings → Google Drive upload → AI coach →
  Test AI coach** confirms it. The script fixes the model, caps requests
  per day (`COACH_DAILY_CAP`, default 80) and costs about one cent per take.
- **Past recordings.** `scripts/backfill-analysis.mjs` downloads every past
  take from Drive and measures it with the same code (inside headless
  Chrome, which also decodes the audio); `scripts/backfill-apply.mjs` merges
  the results into the synced document behind a backup, a before/after
  "nothing lost" check and an automatic rollback.

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

## Rewards: the photo collection and bracelets

Tokens (gold from a first-try mission or a 3-star piano day, silver, bronze)
are spent on the **Box** screen, which now has four tabs:

- **🎁 Boxes.** Opening a box flips over a **collection card**: a real
  photo of a gem, an animal or something in space, its name, a rarity
  (★ common, ★★ uncommon, ★★★ rare, ★★★★ epic, ★★★★★ legendary), a
  one-line "Found in / Lives in / Orbits" and a two-sentence fact she can
  read or have read aloud. Rarity odds depend on the box: bronze
  60/30/9/1/0 %, silver 40/35/18/6/1 %, gold 20/30/30/15/5 %. Every box also
  drops beads (bronze 1, silver 1–2, gold 2–3), and a card she already owns
  turns into extra beads instead (1/2/3/5/8 by rarity), so no box is ever a
  dud. The prize-ticket roll is unchanged.
- **📷 Cards.** The album: three sets (💎 Gems & minerals 24, 🦊 Animals
  36, 🪐 Space 16) with a "12 / 24" count each. Cards she owns show the
  photo; the rest are dark silhouettes with a "?" and their rarity colour,
  so she can see what is still out there. Tapping an owned card opens it
  big with the fact and a Say it button. Completing a set earns a badge
  (Gem collector 💎, Animal expert 🦊, Space explorer 🪐); the first card,
  the first legendary and the first finished bracelet have badges too. Old
  emoji stickers stay visible in a collapsed "Old stickers" section.
- **📿 Bracelets.** The bead tray shows every bead she has (round, star,
  heart, flower, and letter beads that spell both girls' names). "New
  bracelet" starts an 18-slot strand; tap a bead then a slot (or drag it
  there) to place it, tap a placed bead to take it back, name it, and
  "✨ Finish" once it has at least 6 beads. Finished bracelets sit in a
  gallery, and the latest one shows on Home under "🃏 My cards".
- **🎟️ Tickets.** As before.

The 76 photos live in `public/collection/` and come from Wikimedia
Commons under free licences (public domain, CC0, CC BY, CC BY-SA);
`scripts/collection-sources.json` names the exact file for each card and
`node scripts/fetch-collection.mjs [--force] [id ...]` downloads 480 px
copies, refuses anything that is not freely licensed, and regenerates
`src/content/collectionCredits.ts`. **Settings → Photo credits** (also
`#/credits`) lists every photographer and licence. Facts and card text are
in `src/content/collection.ts`; beads in `src/content/beads.ts`.

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
- **Each kid's data is isolated.** Nora's storage keys, recordings
  database and gist file kept their original names when Amelia was added,
  and Amelia's are the same names with `.amelia` appended, so no data moved
  and a device only ever writes its own kid's gist file (see "Two kids, two
  secret words" above).
- **Every update is rehearsed against a real backup.** Before a release that
  touches saved data, both kids' files are downloaded from the sync gist
  with checksums and an inventory (`backups/MANIFEST.md`, outside the
  repository), the new build is made to restore them through the app's own
  import path, and `node scripts/verify-progress.mjs <backup> <later>` proves
  the later document still has every take, rating, Drive link, token, card,
  bead, bracelet, badge, note and setting (only additions and the documented
  size trimming are allowed). To restore by hand: Settings → Backup → Import
  the backup file on the device, or put the file back in the gist.
- **The synced file stays small.** It is stored as compact JSON, per-take
  note-onset lists are dropped once the take has been measured, waveforms of
  takes older than two weeks are dropped (they are recomputed on demand), and
  the sync code reads GitHub's raw file when a gist file is ever truncated.
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
