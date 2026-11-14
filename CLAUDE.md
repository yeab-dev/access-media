# CLAUDE.md

Project: **Accessible Learning Media**, the team's entry for **Track 2** of the Digital Bridge Accessibility Hackathon 2026 (ALX Ethiopia, ALX Tech Hub Lideta, 14–15 Nov 2026).

Full proposal: `docs/architecture.html` (source) → `docs/Track2-Architecture.pdf`. Event source material: https://digitalbridge.et/ and the opening presentation (slides 10, 12, 14, 15 are the requirements). If this file and the proposal disagree, the official brief wins, then this file.

## Hard deadline

**Sunday 15 Nov 2026, 16:30 (Addis Ababa time).** Submit: code, README, Docker Compose file, WCAG 2.2 AA conformance report. Anything not in that list is optional. Prioritise accordingly.

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
- **Savanna starter = https://github.com/alx-africa/Savanna-static-pages** (3 frozen static pages, no licence). It is **only a demo host** to show our player plugging in — we do **not** build on it, modify it, or copy its files into this repo. Local checkout lives at `../Savanna-static-pages`; `npm run savanna` serves it at `/savanna` with the player injected where a `::video <id> ::` directive would render.

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

- **Step 1 done (player):** `public/access-player.js` — keyboard + screen reader controls, EN/AM captions drawn by the player with size/colour/background settings, transcript panel (lines seek), speed, quality (360p/240p/audio, auto 240p on slow connections), fullscreen, shortcuts K/J/L/M/C/T/F, EN/AM interface, prefs in localStorage. Demo page `public/index.html`.
- Server (minimal so far): `server/index.js` serves `/player/*`, `/media/*`, `GET /api/media/:id` (manifest from `data/media/<id>/manifest.json`), `/api/health`. `server/vtt.js` parses VTT and renders transcript HTML (not wired to a route yet).
- Demo lesson: `data/seed/demo/` (captions, manifest) → `scripts/make-demo.sh` builds `data/media/demo/` with ffmpeg (silent placeholder slides). Amharic captions and UI strings are drafts needing native review.
- Tests: `npm test` (unit), `npm run a11y` (Playwright + axe, desktop and Pixel 7 profiles; uses system Chromium because Playwright's bundled one can't play H.264). 21 passing (sign window move/resize/sync, AD announce/pause/resume, Amharic lang, transcript descriptions included).
- Phone testing: `adb reverse tcp:8080 tcp:8080`, then http://localhost:8080 on the phone (ufw blocks 8080 on the LAN).
- **Step 2 done (sign language + audio description):** sign window is a muted second video synced to the lesson (drift > 0.3 s corrected), loaded only when turned on; move by drag, arrow keys (Shift = bigger steps) or corner presets; resize by corner handle, +/− or size menu; "Beside the video" layout; prefs saved. Audio description from `descriptions.<lang>.vtt`: default sent to an `aria-live=assertive` region with correct `lang` (screen reader), optional device voice (speechSynthesis, falls back if no voice for that language); "pause while described" on by default (resume after estimated reading time, or on speech end); visible description text below video; descriptions merged into the transcript. Shortcuts D and S. Caption style moved into one Settings panel (captions / sign window / audio description fieldsets).
- Player size: ~56 KB raw, ~16 KB gzipped.
- Demo sign video is a placeholder with a timecode (main video has one too) to check sync by eye. Replace with a real ESL recording.
- Next: step 3 (offline pack). Savanna starter not yet received.
- Update this section as work lands.

## Commands

```
./scripts/make-demo.sh   # build demo media (needs ffmpeg) — run once
npm run dev     # server with reload on http://localhost:8080
npm test        # unit tests (node --test tests/unit/)
npm run a11y    # Playwright + axe-core
```

## Working notes

- Co-designer is a team member: features should be testable on their own device early and often.
- Interpreters (ESL and spoken) are on site; a real ESL clip is needed for the demo sign video.
- Code is released under an open licence named by ALX at kick-off; add it to `LICENSE` once known.
- Keep personal data to the minimum; the hackathon follows Ethiopia's Personal Data Protection Proclamation No. 1321/2024.
