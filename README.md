# Accessible learning media: `<db-player>` — Track 2

Digital Bridge Accessibility Hackathon 2026 · Track 2, accessible learning media

**Team:** _TODO: names_ · **Co-designer:** _TODO: name (with their permission)_

## What it does

A lesson video player that any learning platform or job board adds with one script tag. Deaf and hard-of-hearing learners get English and Amharic captions they can resize and recolour, and a movable, resizable Ethiopian Sign Language window. Blind learners get full keyboard and screen-reader control and audio description. Learners on 3G get a small download, 240p or audio only, and an offline pack.

Around it: a recording studio for sign language interpreters, a caption editor, lesson documents (HTML and tagged PDF), accessible job cards that read themselves aloud, and certificates an employer can verify.

## The main task we tested

> A Deaf learner follows a lesson on a low-cost Android phone with the Ethiopian Sign Language window and Amharic captions; a blind learner follows the same lesson with TalkBack and audio description. Both do it alone.

_TODO: co-designer result (see the end of [CONFORMANCE.md](CONFORMANCE.md))._

## Run it

```sh
cp .env.example .env        # set ADMIN_TOKEN to a long random code: the staff access code
docker compose up --build   # first start builds the demo lesson (about a minute)
```

Open **http://localhost:8080**.

| Address | What |
|---|---|
| `/demo/blank.html` | The player on an empty page: no Bootstrap, no Savanna CSS, attributes only |
| `/savanna/pages/concept-with-navigation.html` | Inside Savanna, under the lesson banner |
| `/savanna/pages/jobs.html` | Career gateway: job cards and "share your certificate" |
| `/certificates/demo-learner` | The page an employer opens to check a certificate |
| `/studio/sign.html` | Record an interpreter for a lesson (staff) |
| `/studio/captions.html` | Correct captions and audio description (staff) |
| `/docs` | API documentation you can try in the browser |

Without Docker (Node 22+, ffmpeg; Chromium for PDFs):

```sh
npm ci && npm run demo-media && npm start     # http://localhost:8080
npm test          # unit tests
npm run a11y      # browser tests with axe-core (desktop and phone)
```

## Install, Level 1: one script tag

```html
<script type="module" src="https://YOUR-SERVER/module/db-player.js"></script>

<db-player src="lesson.mp4"
           captions="lesson.en.vtt,lesson.am.vtt"
           sign="lesson.ethsl.mp4"
           describe="lesson.ad.en.vtt"
           lang="am"></db-player>
```

Files can be on any web server. Caption language comes from the file name (`lesson.am.vtt`). Or, with our server, `<db-player lesson="demo" api="https://YOUR-SERVER">`.

| Attribute | Meaning |
|---|---|
| `src` | Lesson video (MP4) |
| `captions` | Comma-separated WebVTT files, one per language |
| `sign` | Ethiopian Sign Language video, kept in time with the lesson |
| `describe` | Audio description: WebVTT text files (`lesson.ad.en.vtt`) and/or a described-audio MP3 |
| `poster`, `label` | Still image; lesson title for screen readers |
| `lesson`, `api` | Load everything from our API instead of attributes |
| `lang` | Interface language by default (`en`, `am`, or any `i18n/<code>.json`). The learner's own choice in the player wins and is remembered |
| `theme` | `auto` (default), `light`, `dark`. Colours come from the host's `--bs-primary` and font from `--bs-body-font-family` when present, darkened if needed for contrast |
| `heading-level` | Level of the transcript heading (default 2) |

**Events** (they bubble out of the component; the host decides what to do):

```js
document.addEventListener('db-player:progress', (e) => e.detail);        // { lesson, seconds, percent } about every 5 s
document.addEventListener('db-player:complete', (e) => e.detail);        // { lesson }
document.addEventListener('db-player:prefs', (e) => e.detail);           // { language, captionSize, captionColor, signPosition, ... }
document.addEventListener('db-player:sign-requested', (e) => e.detail);  // { lesson } learner wants sign language that is not there yet
document.addEventListener('db-player:ready', (e) => e.detail);
```

**Career gateway:** `<script type="module" src=".../module/db-job-card.js">`, then `<db-job-card job="junior-frontend">` (or `src="jobs.json"` for a plain file). Events `db-job-card:listen`, `db-job-card:apply`. `<db-language>` is the same language switch for pages without a player.

**Keyboard** (when focus is in the player): Space or K play/pause · ←/→ 5 s · J/L 10 s · M mute · C captions · D audio description · S sign window · T transcript · F full screen · ? keyboard help. With the sign window selected: arrows move it, + and − resize it. Every drag has a button.

## Install, Level 2: REST API

[`openapi.yaml`](openapi.yaml), and interactive documentation at `/docs`. Reading is public; changes need `Authorization: Bearer $ADMIN_TOKEN`. Errors are `{ error, message }` with the message in words.

```sh
B=http://localhost:8080/api/v1; T="Authorization: Bearer $ADMIN_TOKEN"
curl $B/lessons
curl $B/lessons/demo
curl "$B/lessons/demo/transcript?lang=am&format=txt"
curl -L "$B/lessons/demo/document?lang=am"                          # lesson as HTML, pictures described
curl -o demo.am.pdf "$B/lessons/demo/document?lang=am&format=pdf"   # tagged PDF
curl -o demo.zip $B/lessons/demo/offline-pack
curl -X POST $B/lessons/demo/sign -H "$T" -F video=@interpreter.webm -F offset=0.4
curl -X POST $B/lessons/demo/sign-requests
curl $B/sign-requests
curl -X POST $B/lessons/demo/captions -H "$T" -H 'Content-Type: application/json' \
     -d '{"lang":"am","vtt":"WEBVTT\n\n00:00:00.500 --> 00:00:05.000\nእንኳን ደህና መጡ።"}'
curl -X POST $B/lessons/demo/captions/draft -H "$T" -H 'Content-Type: application/json' -d '{"lang":"en"}'
curl $B/jobs
curl $B/jobs/junior-frontend
curl -X POST $B/certificates -H "$T" -H 'Content-Type: application/json' \
     -d '{"learnerName":"Test Learner","achievement":{"name":"How to write a CV"}}'
curl $B/certificates/demo-learner
curl -X POST $B/webhooks -H "$T" -H 'Content-Type: application/json' -d '{"url":"https://your-host.example/hook"}'
curl $B/webhooks -H "$T"
curl -X DELETE $B/webhooks/<id> -H "$T"
```

**Webhook:** we POST `{ event, time, data }` for `sign.recorded`, `sign.requested`, `captions.updated`, `certificate.issued`, with `X-DB-Signature: sha256=<HMAC-SHA256 of the body with your secret>`. No learner names are sent. One attempt, 5-second timeout.

## Install, Level 3: open standards

- **WebVTT** captions and descriptions: play in any player (VLC, Moodle, browsers).
- **schema.org JobPosting**: every job has it (`jsonLd` in the API, embedded as JSON-LD on `jobs.html`).
- **Open Badges 3.0**: certificates are `OpenBadgeCredential`s signed as VC-JWT (EdDSA, Ed25519). Anyone can check one with the public key at `/.well-known/jwks.json`; `/certificates/{id}` shows "Verified" or "Not valid".
- **LTI 1.3**: not done. It would connect by making `/embed/{lesson}` an LTI tool launch, so Moodle or Canvas opens the player with the learner signed in.

## Languages

Interface text is in `module/i18n/en.json` and `am.json`. **Adding a language is one new file** (for example `om.json`); missing strings fall back to English. Caption, description and document languages come from the lesson's files. Add one with the caption editor or `POST /captions`. Dates are shown in the Ethiopian and Gregorian calendars. Amharic gets more line height and is never italicised.

_The Amharic in this repo is a draft and must be checked by a native speaker._

## Offline and slow connection

Measured with `node scripts/measure-3g.mjs` (Chrome DevTools' classic "Slow 3G": 400 kbit/s, 2,000 ms latency, empty cache) on `demo/blank.html`:

| | |
|---|---|
| Player usable (Play button there) | **9.0 s** |
| Downloaded before the learner presses Play | **24 KB** (player 18.7 KB compressed, English text 2.2 KB) |
| Video | Not loaded until Play. 240p chosen automatically on slow connections; audio only on request |
| Sign language video | Only loaded when the learner turns the window on |

**Offline pack** (`Download for offline`, size shown before tapping): 240p video, MP3, caption files VLC loads automatically, and a light `index.html` that plays with captions and transcripts from the phone's storage with no network. The 30-second demo is 408 KB, about 0.8 MB per minute of lesson. Downloads resume after a dropped connection. **Not done:** service-worker offline inside the browser (the guide's suggested approach). We chose the downloadable pack so it works on any phone and in VLC.

## Data and privacy

- **Learners:** no account to watch. Settings (language, caption style, sign window) are kept only in the browser (`localStorage`).
- **Sign language requests:** anonymous count and date per lesson. Nothing about the learner.
- **Interpreter recordings:** stored with the lesson. **Sound is removed** before saving.
- **Certificates:** the learner's name, the achievement and the date: what the learner chooses to share with an employer. Webhooks never include names.
- **Nothing leaves the host** unless the host sets it up: the speech model is local (`ASR_URL`, optional), and there are no analytics or third-party scripts.
- **Delete:** lessons are folders in the `lessons` volume (`/data/lessons/<id>`); certificates are files in `/data/certificates/` (delete the file to withdraw one). Previous versions of captions and sign videos sit next to them (`*.previous*`).
- **Test data only:** the jobs, employers and "Test Learner" are not real.

## Cost to run

Rough, for **3,000 learners a month**, assuming each watches 20 ten-minute lessons a month, mostly at 240p:

- **Traffic:** about 20 MB per lesson view → about 1.2 TB a month.
- **Server:** one small virtual server (2 vCPU, 4 GB RAM, about 40 GB disk) with a few TB of traffic included: **about US$10–30 a month** at common European providers. Prices in Ethiopian data centres were not checked.
- **Paid APIs:** none. Captions use an optional local open model (`docker compose --profile asr up`), on the same server's CPU.

## Caption quality

Drafts come from an open speech model (any OpenAI-style `/v1/audio/transcriptions` server; `docker compose --profile asr up` starts faster-whisper locally). A person corrects every line in `/studio/captions.html`. `node scripts/caption-quality.mjs draft.vtt corrected.vtt` reports the word error rate and timing drift.

**Honestly:** the demo lesson is silent placeholder slides, so **we have not measured draft quality on real English or Amharic speech.** Whisper's Amharic is known to be weak; plan for a person to rewrite most Amharic lines.

## Finished and not finished

**Finished:** the player with every must-have from the brief (keyboard and screen reader; EN/AM captions you can resize and recolour; movable, resizable sign window; audio description; offline pack; tagged PDF and HTML with image descriptions), the career gateway (job card with audio summary, verifiable certificate page), the sign language recording studio, the caption editor, the API with documentation and a webhook, Docker. 35 unit tests and 64 browser tests, with axe-core showing zero critical or serious issues on every page we built.

**Not finished:**
- The **sign language video is a placeholder**. A real ESL recording is needed: use `/studio/sign.html` with an interpreter.
- The **demo lesson has no speech** (placeholder slides).
- **Native-speaker review** of all Amharic.
- **Service-worker offline**, **Braille (.brf)**, the **recorded live-session viewer**, and **LTI 1.3**.
- `docker compose up` **has not yet been tested on another laptop**.
- Savanna's own page has accessibility defects we did not fix (for example, its menu button is a `<div>`, and its red `#db3e3e` is under 4.5:1 contrast on white). Our components darken host colours to stay readable.

## Libraries and their licences

| Library | Used for | Licence |
|---|---|---|
| express 5.3.0 | Web server | MIT |
| multer 2.5.0 | Uploads (sign recordings) | MIT |
| compression 1.8.2 | Smaller downloads | MIT |
| yazl 3.3.1 | Offline pack zip | MIT |
| swagger-ui-dist 5.34.1 | `/docs` | Apache-2.0 |
| @playwright/test 1.65.0 (dev) | Browser tests | Apache-2.0 |
| @axe-core/playwright 4.14.0, axe-core 4.14.0 (dev) | Accessibility tests | MPL-2.0 |
| yauzl 3.4.0 (dev) | Reading zips in tests | MIT |
| ffmpeg (Debian package) | Video, audio, sign recordings | LGPL-2.1+ / GPL-2+ |
| Chromium (Debian package) | Tagged PDF | BSD-3-Clause and others |
| Noto fonts, DejaVu fonts | Ethiopic and Latin text in PDFs and demo slides | OFL-1.1; Bitstream Vera licence |
| speaches / faster-whisper (optional) | Local caption drafts | MIT |

The module itself (`module/`) has **no runtime dependencies**.

**Code licence:** _TODO: the open licence ALX named at kick-off._ Code may be used and published by ALX and its partners; the team is credited by name.
