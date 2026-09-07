# CubeClimb

A Rubik's cube teaching PWA built for Nora (age 6) and her coach/parent.
Lessons are organized like a climbing wall: watch a move, try it, get
spotted, then climb it solo. Progress, prize tokens, and stickers sync
between devices through a private GitHub Gist.

## Development

```sh
npm install
npm run dev
```

The dev server listens on all network interfaces (`server.host: true`), so
you can open it from a phone on the same Wi-Fi at
`http://<your-computer's-local-IP>:5173`.

```sh
npm test        # unit tests (vitest)
npm run build   # type-check + production build
```

## Deploy

Pushing to `main` runs `.github/workflows/deploy.yml`, which installs
dependencies, runs tests, builds, and publishes `dist/` to GitHub Pages via
`actions/upload-pages-artifact` + `actions/deploy-pages`. In the repo's
**Settings → Pages**, set the source to "GitHub Actions" once.

The production build is served from `/Rubik-Self-study/` (see `base` in
`vite.config.ts`) to match this repo's GitHub Pages URL.

## Secret word

Before using CubeClimb, everyone must type a shared secret word once per
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

CubeClimb keeps all progress in the browser (`localStorage`) by default. To
sync it across devices (e.g. Nora's tablet and a parent's phone), connect a
private GitHub Gist from **Settings**:

1. Go to <https://github.com/settings/personal-access-tokens/new> (GitHub's
   *fine-grained* personal access tokens).
2. Give it a name like "CubeClimb sync" and set **Expiration** to 1 year.
3. Under **Permissions → Account permissions**, set **Gists** to
   **Read and write**. Leave every other permission at "No access."
4. Generate the token, copy it, and paste it into CubeClimb's Settings
   screen.
5. Repeat on the second device with the *same* token so both devices sync to
   the same gist.

CubeClimb only ever touches gists - it can't read your repositories, issues,
or anything else on your account. If you ever want to revoke access, delete
the token from GitHub's settings page and tap "sign out of sync" in
CubeClimb's Settings.
