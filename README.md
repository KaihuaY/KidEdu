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

A parent/coach can also force a device to re-ask for the secret word from
**Settings → Secret word → Lock this device now**.

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

## Piano

Piano practice, recording, and parent rating are documented in a later step.
