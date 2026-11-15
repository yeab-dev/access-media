# CLAUDE.md

Project: **Accessible Learning Media**, the team's entry for **Track 2** of the Digital Bridge Accessibility Hackathon 2026 (ALX Ethiopia, ALX Tech Hub Lideta, 14–15 Nov 2026).

Full proposal: `docs/architecture.html` (source) → `docs/Track2-Architecture.pdf`. Event source material: https://digitalbridge.et/, the opening presentation (slides 10, 12, 14, 15), and the **Team Technical Guide v2 (14 Nov)** — the most authoritative and detailed source (local copy: `~/Data/Downloads/Telegram Desktop/DIGITAL_BRIDGE_Accessibility_Hackathon_Team_Technical_Guide_14_Nov.pdf`; do not commit it). Order of authority: Technical Guide → slides → this file → the proposal.

## Technical Guide v2 — Track 2 specifics (authoritative)

- **Interface:** `<db-player src="lesson.mp4" captions="lesson.en.vtt,lesson.am.vtt" sign="lesson.ethsl.mp4" describe="lesson.ad.mp3" lang="am">`. Configured only by attributes (`lang`, `api`, `theme`). Events (bubbles + composed): `db-player:progress {seconds, percent}`, `db-player:complete {}`, `db-player:prefs {captionSize, captionColor, signPosition}`.
- **API:** `/api/v1/...`, JSON, 201/400 (message in words)/404. `GET /api/v1/lessons/{id}`, `GET /api/v1/lessons/{id}/transcript?lang=am`, `GET /api/v1/lessons/{id}/offline-pack`, `POST /api/v1/lessons/{id}/captions`. `openapi.yaml` at repo root, Swagger UI at `/docs`, one webhook, one curl per call in README.
- **Strings in `i18n/en.json`, `i18n/am.json`** — no sentences in code; a new language = one new JSON file. Use CSS logical properties (RTL-ready).
- **Keys:** Space and K play/pause, arrows seek, a "Keyboard help" button. Controls: Play, Pause, Back 10 s, Speed, Captions, Sign language, Transcript, Full screen.
- **Transcript** downloads as text. **Sign window**: drift corrected ~1/s; move/resize by mouse AND buttons (top left/right, bottom left/right, larger, smaller); big enough to read hands and face; handle "no sign video for this lesson yet".
- **Offline:** "Download for offline" — service worker caches low-bitrate audio + transcript + light HTML; **show size in MB before tap**; test in aeroplane mode (SW needs HTTPS/localhost).
- **Captions pipeline:** open speech model draft → **editor page to correct lines and times** → export VTT; README states measured quality honestly. Sound-off: meaningful sounds captioned ("[music]").
- **Documents:** lesson as clean HTML (headings in order, real image descriptions); PDF must be tagged.
- **Career gateway:** job card with "Listen to summary" (works at 200% zoom) + certificate page an employer can open to check; on `savanna/pages/jobs.html` with test jobs in JSON. JobPosting JSON-LD (Level 3, ~30 min); Open Badges 3.0 signed credential + verify page (Level 3).
- **Mount point in Savanna:** `concept-with-navigation.html`, inside `#curriculum_navigation_content .savanna-styles`, **under the banner image**. Bring a 1–2 min test clip (own or openly licensed) with captions.
- **Host look:** read `var(--bs-primary)`, `var(--bs-body-font-family)`, `var(--bs-body-color)` with fallbacks. No globals, no touching host files. < 500 KB first load. Amharic line-height ~1.7, no caps/letter-spacing.
- **Repo layout:** `module/` (db-player.js, i18n/), `api/`, `demo/blank.html` (no Bootstrap — what the judge tests) + `demo/data/`, `savanna/` (starter **unchanged** + our script tag), `README.md`, `docker-compose.yml` (nginx + api), `CONFORMANCE.md`, `openapi.yaml`, `.env.example`.
- **README outline** (section 11): what it does, main task sentence, run it, install L1/L2/L3, languages, offline + measured Slow 3G load time and KB, data and privacy, **monthly cost for 3,000 learners**, finished/not finished, libraries + licences.
- **Phone testing over HTTPS** (cloudflared/ngrok tunnel); plain http://IP breaks SW/mic.
- **Checkpoints:** Sat 17:00 main task end-to-end + co-designer tried on own phone over HTTPS · Sun 12:00 all must-haves, axe clean, Amharic complete · **Sun 14:00 stop features** · Sun 15:30 co-designer final test · 16:30 submit.

## Hard deadline

**Postponed to Monday 16 Nov 2026** (was Sun 15 Nov 16:30; exact time to confirm with the organisers). The project must also be **hosted** (Render, `render.yaml`). Submit: code, README, Docker Compose file, WCAG 2.2 AA conformance report. Anything not in that list is optional. Prioritise accordingly.

## Track 2 requirements (official, slide 10)

Build an **embeddable video player and a transcript pipeline** for learners who are Deaf, hard of hearing, blind, or on a slow connection.

Must have:
1. Player that works **by keyboard and by screen reader** (NVDA, TalkBack).
2. **English and Amharic captions** the viewer can **resize and recolour**.
3. A **movable, resizable Ethiopian Sign Language window**.
4. **Audio description**.
5. **Offline pack for a 3G phone: audio, text, light HTML.**
6. **Tagged PDF and HTML documents with image descriptions.**

Extras (only after the above pass the gate): Braille export (`.brf`); viewer for recorded live sessions with captions and chat log.

Career gateway (required for Track 2): **accessible job card with an audio summary that works at 200% zoom**, and **verifiable certificate links** to share with employers (we use Open Badges 3.0).

## Integration levels (slide 12)

- Level 1 (minimum): one script tag works on any page.
- Level 2: REST API with an OpenAPI spec.
- Level 3: open standard (we use WebVTT, schema.org VideoObject/JobPosting, Open Badges 3.0).
- Test: a judge installs the module **in one hour from the docs alone**. Must also run inside the Savanna starter (ALX learning platform).
- **Savanna starter = https://github.com/alx-africa/Savanna-static-pages** (3 frozen static pages). It is **only a demo host** — we do not build on it or modify its files. Per the Technical Guide, the repo carries it as `savanna/` (**unchanged**, plus our script tag) so the judge sees the Level 1 proof inside Savanna next to `demo/blank.html`. 

## Gate (pass/fail — a module that fails is not scored)

1. A co-designer completes the main task **unaided** with NVDA, TalkBack, keyboard only, 200% zoom, and sound off.
2. **axe-core: zero critical and zero serious issues.**
3. A **WCAG 2.2 AA conformance report** submitted with the code.

## Scoring (100)

| Pts | Criterion |
|---|---|
| 30 | Works for the people it is for (co-designer scores, unaided tasks, 21 Oct feedback used) |
| 25 | Can be adopted (install in 1 hour; more for all three levels) |
| 15 | Built for Ethiopia (Amharic/Ethiopic script, Ethiopian calendar, low-cost Android on 3G, offline) |
| 15 | Quality, security, privacy (tests, minimum data, **nothing leaves the host without consent**) |
| 15 | Can be kept running (low cost, **no paid-API lock-in**, README a stranger can follow) |

## Architecture decisions (agreed proposal — don't change without asking)

- **Player:** `<access-player>` web component, plain JavaScript, **no framework, no build step**, target < 30 KB. `<access-job-card>` for the career gateway.
- **Server:** Node 24, Express 5, ESM. REST API described in OpenAPI 3.1.
- **Storage:** files + JSON on a `/data` volume. **No database.**
- **Pipeline:** ffmpeg (360p MP4, 240p MP4 ~200 kbps, 32 kbps mono MP3, poster), headless Chromium for tagged PDF, liblouis for Braille.
- **Speech recognition:** optional and **local only** (Whisper container). Drafts marked "needs review". Never send lesson audio or learner data to a cloud service.
- **Content model:** WebVTT files are the single source (`captions.en.vtt`, `captions.am.vtt`, `descriptions.<lang>.vtt`, `images.json` for alt text, `sign.mp4`). All transcripts, PDFs, Braille and offline packs are generated from them.
- **Audio description:** text track, announced via live region or spoken (speechSynthesis), optional pause.
- **Captions:** rendered by the player (not native cues) so size/colour/background are adjustable.
- **Deploy:** single `docker compose up`.

Planned API:
```
GET  /api/media                  POST /api/media (admin)
GET  /api/media/{id}             POST /api/media/{id}/tracks (admin)
POST /api/media/{id}/sign (admin)
GET  /api/media/{id}/transcript?lang=en|am&format=html|pdf|brf
GET  /api/media/{id}/offline.zip GET  /embed/{id}
GET  /api/jobs                   GET  /api/jobs/{id}/audio
POST /api/badges (admin)         GET  /api/badges/{id}
```

## Accessibility rules for all UI code

- Native elements first (`button`, `select`, `input type=range`, `a`). ARIA only when no native element fits.
- Every control has an accessible name; state changes are announced (live region, `aria-pressed`, `aria-expanded`).
- Keyboard: everything reachable and operable; visible focus; no traps. Single-key shortcuts only while focus is inside the component (WCAG 2.1.4).
- Reflow at 200% zoom / 320 px width; touch targets ≥ 44 px (WCAG 2.5.8 needs 24 px minimum); no time limits.
- Respect `prefers-reduced-motion`, `prefers-contrast`, dark mode. Contrast ≥ 4.5:1 text, 3:1 UI.
- Set `lang` correctly (`am` for Amharic content). Ethiopic font stack: `"Noto Sans Ethiopic", "Nyala", "Abyssinica SIL"`.
- Every interface string available in English and Amharic. Amharic text must be reviewed by a native speaker before the demo.
- Dates: show Ethiopian calendar (`Intl.DateTimeFormat('am-ET-u-ca-ethiopic')`) alongside Gregorian.
- Run axe-core (Playwright + `@axe-core/playwright`) on every page/component; zero critical/serious before merging.

## Build order

1. Player: keyboard + screen reader, EN/AM captions with size/colour, transcript panel.
2. Sign language window (move, resize) + audio description.
3. Offline pack (MP3, 240p, VTT, light HTML).
4. Career gateway: job card with audio summary; Open Badges 3.0 certificate links.
5. Tagged PDF + HTML documents with image descriptions.
6. Docker Compose, README, OpenAPI spec, conformance report (Sunday morning).
7. Extras: Braille `.brf`, then live-session viewer.

## Current status

Repo layout follows the Technical Guide: `module/` (db-player.js + i18n/en.json, am.json), `api/` (Express: index.js, vtt.js, offline.js), `demo/` (index.html, blank.html, data/lessons/demo = seed captions/descriptions/manifest), `savanna/` (starter copied unchanged + 3 added lines in concept-with-navigation.html: script tag, and `<db-player lesson="demo" theme="light">` under the banner inside `.savanna-styles`), `scripts/make-demo.sh` → builds media into `data/lessons/demo/` (gitignored), `tests/unit`, `tests/a11y`.

Done:
- **`<db-player>`** (`module/db-player.js`): Level 1 attribute mode (`src`, `captions` — language from file name `lesson.am.vtt`, `sign`, `describe` .vtt and/or .mp3 described-audio track, `poster`, `label`) or API mode (`lesson`, `api`). `lang` loads `i18n/<lang>.json` (English fills gaps; unknown language → English). `theme` auto|light|dark; reads `--bs-primary`, `--bs-body-font-family`. Events (bubbles+composed): ready, progress (~every 5 s, on pause/end), complete, prefs (learner changes only), sign-requested.
- **One language switch** ("Language / ቋንቋ", labelled in both): changes interface + captions + audio description (if on) together; remembered on the device and wins over the host's `lang` attribute; focus stays on the switch and the change is announced. Host pages must not add their own language buttons.
- **Control layout (made simpler for learners):** three rows. Row 1: **Play** (filled, primary), Back 10 s, Forward 10 s, Full screen. Row 2, labelled group "Follow the lesson with:": one-tap on/off buttons **Captions · Sign language · Audio description · Transcript** (`aria-pressed`; ✓ shown via CSS `content: "✓ " / ""` so it is not spoken); captions/description come on in the chosen interface language; 2×2 on narrow players (container query). Row 3: Language / ቋንቋ, Download for offline (size), Settings. **Settings** holds caption language + style, sign window position/size buttons, description language/voice/pause, speed, quality, mute/volume, Keyboard help. Turning sign on shows one visible hint (also announced) on how to move it. Tests open Settings via `tests/a11y/helpers.js`.
- Keyboard: Space/K, ←/→ ±5 s (video area is focusable, role=group), J/L ±10 s, M, C, D, S, T, F, ? opens Keyboard help `<dialog>` (Escape closes, focus returns).
- Captions EN/AM drawn by the player; size/colour/background in Settings; captions move aside when the sign window overlaps them. Amharic line-height 1.7, never italic.
- Sign window: synced, default large; buttons Top left/right, Bottom left/right, Beside the video, Larger, Smaller (+ drag, arrows, +/−); defaults to "beside" on narrow screens. No sign video → visible message + `db-player:sign-requested`.
- Audio description: text tracks (screen reader live region or device voice, pause while read) or `.mp3` described-audio track synced to the video.
- Transcript panel (seek buttons, follow along) + "Download transcript (text)".
- Offline: "Download for offline (0.4 MB)" — size shown before tapping — downloads the offline pack zip.
- API v1: `GET /api/v1/health`, `/lessons`, `/lessons/{id}` (absolute URLs + links), `/lessons/{id}/transcript?lang=&format=html|txt`, `/lessons/{id}/offline-pack`. Errors 400/404 with a message in words.
- **Sign language pipeline** (`api/sign.js`, `studio/sign.html`): interpreters record in the browser (camera on HTTPS/localhost) while the lesson plays from 0 → auto-aligned; review side by side with a timing slider; save → `POST /api/v1/lessons/{id}/sign` (Bearer `ADMIN_TOKEN`, multipart `video` + `offset`) → ffmpeg trims/pads by offset, 360p H.264 ~220 kbps, **audio removed**, previous version kept as `lesson.ethsl.previous.mp4`, manifest updated. Learner requests: player in API mode POSTs anonymous `/lessons/{id}/sign-requests` when a lesson has no sign video; `GET /sign-requests` lists most-wanted first (studio sorts lessons by it); answered on upload.
- **Career gateway:** `module/db-job-card.js` defines `<db-job-card job api|src lang heading-level theme>` (title, employer, where, type, dates in both calendars, plain summary, support offered, **Listen to summary** via recorded `audio` or speechSynthesis with a "no voice" message, Apply link named "Apply: <title>"; events `db-job-card:listen`, `:apply`) and `<db-language>` (the same one remembered language switch for pages without a player). Host colours are darkened with `color-mix` for text/buttons (Savanna red #db3e3e is only 4.4:1). `api/jobs.js`: `GET /api/v1/jobs`, `/jobs/{id}` from `demo/data/jobs.json` (test data, EN+AM), each with schema.org JobPosting `jsonLd`. `savanna/pages/jobs.html`: Savanna head/styles, cards + JSON-LD + "Share your certificate".
- **Certificates (Open Badges 3.0):** `api/certificates.js`. `POST /api/v1/certificates` (staff token, JSON `{learnerName, achievement:{id,name,description}}`) → OpenBadgeCredential signed as VC-JWT (EdDSA/Ed25519, key in `data/keys/`, gitignored). `GET /api/v1/certificates/{id}` → `{valid, credential, jwt}`; `/certificates/{id}` = employer check page (EN/AM, "✓ Verified" / "✗ Not valid"); `/.well-known/jwks.json` public key; `/api/v1/issuer`. Demo certificate `demo-learner` created at start. `PUBLIC_URL` env sets the issuer URL.
- Shared `module/i18n.js`: strings loader, prefs (localStorage `db-player:prefs`), `preferredLanguage`, `setPreferredLanguage` (fires `db:language` so every component follows), `bothCalendars`.
- **Caption pipeline:** `studio/captions.html` editor (lesson + track: captions or audio description, EN/AM/new language): per line Start/End/Words with Play line, Start = now, End = now, Add after, Delete; problems in words next to the field + linked summary on save; warnings for >2 lines / >42 chars; live preview; sticky video never covers focus (scroll-padding). `api/captions.js`: `POST /api/v1/lessons/{id}/captions` (staff; JSON `{kind, lang, vtt, source}`; validates, keeps `.previous`, adds new-language tracks with `reviewed`), `POST /lessons/{id}/captions/draft` → pluggable speech model via `ASR_URL` (OpenAI-style `/v1/audio/transcriptions`, e.g. local faster-whisper; 16 kHz mono mp3; 503 in words if unset). `api/vtt.js` `toVtt`, `wordErrorRate`; `scripts/caption-quality.mjs draft.vtt corrected.vtt` prints WER + timing drift for the README's honest quality note. `/media` now revalidates (no-cache) so corrected files reach learners at once.
- **Documents:** `api/documents.js`, `GET /api/v1/lessons/{id}/document?lang=&format=html|pdf`. Sections from `images.json` (per slide: `time`, and per language `title` → h2, `alt` → real image description), else audio-description lines, else one section; slide stills grabbed from the video with ffmpeg; captions placed under the section they belong to. HTML (h1 → contents → h2 per slide → h3 "what is said") served from `/media/{id}/document/lesson.<lang>.html`; PDF printed by headless Chromium (`CHROMIUM_PATH`, else /usr/bin/chromium) → tagged, outline, Figure alt text (checked with `pdfinfo -struct`). Cached in `document/`, rebuilt when inputs change. Lesson `titles: {am: ...}` gives per-language titles. Player transcript panel links to both in the learner's language.
- Dev server: run plainly (`npm start` with `PORT=8082`); `node --watch` here left orphan servers serving old code — restart by hand after changes.
- Config: `.env` (gitignored; `ADMIN_TOKEN`, `PORT`, `DATA_DIR`), `.env.example` committed. `npm run dev`/`start` load `.env`.
- Browser tests run against a throwaway copy of the data (`.test-data/`, plus a `studio-test` lesson) with `ADMIN_TOKEN=test-code`; the studio test uses Chromium's fake camera.
- Tests: 48 unit + 76 browser (desktop + Pixel 7), axe clean incl. blank page, Savanna mount and studio.

- **Submission package:** `Dockerfile` (node:24-bookworm-slim + ffmpeg + chromium + fonts-noto-core/dejavu; builds demo media into /data on first start) and `docker-compose.yml` (`web` on 8080, volume `lessons`, `.env`; optional `asr` profile = speaches faster-whisper) — **not yet run** (no Docker in the dev session); `openapi.yaml` + Swagger UI at `/docs`; webhooks (`api/webhooks.js`, `api/events.js`: sign.recorded, sign.requested, captions.updated, certificate.issued; HMAC `X-DB-Signature`; no learner names); `compression` middleware (player 62 → 18.7 KB); `scripts/measure-3g.mjs` (Slow 3G: player usable 9.0 s, 24 KB); `README.md` (guide's outline; TODO team/co-designer names, licence); `CONFORMANCE.md` (WCAG 2.2 A/AA table; co-designer rows TODO).
- **Lesson upload + automatic captions** (`api/lessons.js`, `studio/lessons.html`): `POST /api/v1/lessons` (staff, multipart `video`, `title`, `lang`, optional `id`) → 202 at once; background: ffprobe check, ffmpeg 360p/240p/mp3/poster (same files as make-demo), then if `ASR_URL` set `transcribe()` (shared with the editor draft, in `api/captions.js`) → `lesson.<lang>.vtt` track with `auto: true, reviewed: false`. Manifest `status` processing → captioning → ready | failed, `statusMessage` in words; unfinished uploads marked failed at start. Webhook `lesson.ready`. Player labels auto tracks "{language} (automatic)" + visible note "may have mistakes"; says "still being prepared" for processing lessons. Saving in the editor clears `auto`. Editor accepts `?lesson=`.
- **Provider keys + portal** (`api/auth.js`, `portal/`): `/get-key` (organisation name only) → `POST /api/v1/keys` gives a `dbk_…` key (stored as SHA-256) + a practice lesson (copy of demo, owned by them). `requireStaff` = `requireKey` (master `ADMIN_TOKEN` or provider key); `mayChange(req, owner)`: lessons/jobs/webhooks/certificates carry `owner` (null = host). Limits via env `PROVIDER_MAX_LESSONS/UPLOAD_MB/JOBS`, 5 webhooks, 5 keys/IP/hour, `SIGNUP=open|closed`. `GET /me`, `POST /me/key` (rotate), `GET /me/lessons` (with embed). New: `PATCH/DELETE /lessons/{id}` (titles.am), `GET/PUT /lessons/{id}/slides` (images.json), `POST/PATCH/DELETE /jobs` (provider jobs in DATA_DIR/jobs.json + read-only test jobs), webhooks per owner, certificate issuer = provider name. Keys remembered per tab in sessionStorage `studio-code` → studio pages + Swagger "Try it out" (preauthorize). `/` home, `/docs` = our header + Swagger UI (tryItOut on, curl snippets, filter, tags "1. Get started" … "6. Connect your systems", guide in info.description; `/openapi.yaml` served with THIS-SERVER replaced by the real origin). Studio lists only your lessons with a key. `/debo/` serves provider-site (player via assets/learning-media.js). `api/origin.js` publicOrigin (PUBLIC_URL > RENDER_EXTERNAL_URL > request). `TRUST_PROXY=1` on hosts. ASR_URL may be host:port; model downloaded at start (`warmUpSpeechModel`).
- **Live:** https://access-media-rsi0.onrender.com (Render, set up by hand in the dashboard from the README's env list; auto-deploy may be off → Manual Deploy; `/api/v1/health` shows `version` = deployed commit). PDF needed Chromium HOME/XDG fix. No speech service on Render yet (`ASR_URL` set → drafts say unreachable).
- **Hosting:** `render.yaml` (web Docker standard + 10 GB disk at /data, private speaches pserv + model disk, ADMIN_TOKEN generated, Frankfurt). `scripts/docker-start.sh` chowns /data then drops to `node` (setpriv). `scripts/add-example-lesson.sh` uploads the Commons example lesson. YAML gotcha in openapi.yaml: quote flow values containing `, ` `?` or ` #`.
- Not done: service-worker offline, Braille, live-session viewer, LTI 1.3; real ESL recording; native Amharic review; docker compose test on another laptop.

## Commands

```
npm run demo-media   # build demo media into data/lessons/demo (needs ffmpeg) — run once
npm run dev     # server with reload on http://localhost:8080 → /demo/, /demo/blank.html, /savanna/pages/concept-with-navigation.html
npm test        # unit tests (node --test tests/unit/)
npm run a11y    # Playwright + axe-core
```

## Working notes

- Co-designer is a team member: features should be testable on their own device early and often.
- Interpreters (ESL and spoken) are on site; a real ESL clip is needed for the demo sign video.
- Code is released under an open licence named by ALX at kick-off; add it to `LICENSE` once known.
- Keep personal data to the minimum; the hackathon follows Ethiopia's Personal Data Protection Proclamation No. 1321/2024.
