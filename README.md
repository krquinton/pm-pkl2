# PickleManage (Phase 2: React + Vite + obfuscated build)

## Mga page
| URL | Ano |
|---|---|
| `/login` (at `/`) | Login (username + password, o Google para sa superadmin) |
| `/app` | Queue / DUPR / Tournament engine (kailangan ng valid license) |
| `/superadmin` | Accounts at licenses |
| `/display` | TV display (public, read-only) |

## Structure
```
src/
  firebase.js, auth.js, AuthGate.jsx   # shared Firebase init, license check, login gate (React)
  pages/Login.jsx, Superadmin.jsx      # totoong React components
  pages/Engine.jsx, Display.jsx        # React shell + legacy engine module
  legacy/engine/{engine.js,markup.html,engine.css}
  legacy/display/{display.js,markup.html,display.css}
vite.config.js                         # build + obfuscation ng sariling code
vercel.json / netlify.toml             # SPA rewrites + security headers
firestore.rules                        # walang pagbabago, i-publish sa Firebase kung hindi pa
```

## Run at build
```
npm install
npm run dev          # local
npm run build        # production, obfuscated  -> dist/
npm run build:plain  # parehong build pero WALANG obfuscation (para sa debugging)
```

## I-deploy (GitHub -> Vercel o Netlify)
1. Ilagay ang `pklbox-logo.png` sa `public/`.
2. `git init`, commit, push sa GitHub. (Kasama na ang `.gitignore`; huwag i-push ang `node_modules` at `dist`.)
3. **Vercel:** Import project -> Framework: Vite -> Build `npm run build`, Output `dist`. **Netlify:** New site from Git -> ang `netlify.toml` na ang bahala.
4. Firebase Console -> Authentication -> Settings -> **Authorized domains**: idagdag ang domain mo (hal. `xxx.vercel.app` at custom domain). Kung wala ito, hindi gagana ang Google login.
5. Firestore -> Rules: i-publish ang `firestore.rules`.

## Tungkol sa obfuscation (basahin)
- Naka-obfuscate ang **sarili nating code lang** (engine, display, login, superadmin, gate): string encoding, hex names, walang source maps, hashed na file names. Hindi ginagalaw ang React/Firebase/jsPDF.
- Hindi nito mapipigilan ang "Save as page" o ang paghihila ng JS ng taong marunong; pahihirapan lang. Anumang tumatakbo sa browser ay nababasa ng browser.
- Ang tunay na proteksyon ay nasa **Firestore rules** at sa **license check**, at nasa Spark plan ito (walang server code). Ang `firebaseConfig` ay public by design.
- Kung gusto mo ng mas mabigat na obfuscation (control-flow flattening), baguhin ang options sa `vite.config.js`; babagal ang app, lalo na ang queue screen.

## Phase 2b: status
Naka-React na: **Leaderboard** at **Logs** tabs (`src/engine/components`), kasama ang pure logic (`src/engine/logic`) at ang `bridge` na nagpapasa ng live Firestore data mula sa legacy engine papunta sa React (para walang doble na reads). Ang export/DUPR-settings/edit/delete sa Logs ay tumatawag pa sa legacy engine.

```
npm test   # differential test (bagong logic vs luma), React component tests, at full-engine smoke test na may fake Firebase
```

## Susunod na hakbang

Ang engine at display ay naka-module na pero hindi pa hinahati sa React components. Ang plano: ilipat isa-isa (Participants, Match Suggestions, Queue & Courts, Leaderboard, Logs) habang tumatakbo pa rin ang app.
