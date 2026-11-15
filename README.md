# Accessible learning media: `<db-player>` — Track 2

Digital Bridge Accessibility Hackathon 2026 · Track 2, accessible learning media

**Team:** _TODO: names_ · **Co-designer:** _TODO: name (with their permission)_

## What it does

A lesson video player that any learning platform or job board adds with one script tag. Deaf and hard-of-hearing learners get English and Amharic captions they can resize and recolour, and a movable, resizable Ethiopian Sign Language window. Blind learners get full keyboard and screen-reader control and audio description. Learners on 3G get a small download, 240p or audio only, and an offline pack.

Around it: a recording studio for sign language interpreters, a caption editor, lesson documents (HTML and tagged PDF), accessible job cards that read themselves aloud, and certificates an employer can verify.

## Try it live

**https://access-media-rsi0.onrender.com** (hosted on Render; `GET /api/v1/health` shows the deployed commit)

| | |
|---|---|
| [Home for lesson providers](https://access-media-rsi0.onrender.com/) | what you can do, in three steps |
| [Get your key](https://access-media-rsi0.onrender.com/get-key) | an API key and a practice lesson in ten seconds |
| [Documentation](https://access-media-rsi0.onrender.com/docs) | step-by-step guide and every call with "Try it out" |
| [Debo Learning](https://access-media-rsi0.onrender.com/debo/) | a made-up lesson provider's site using the player |
| [Player on a blank page](https://access-media-rsi0.onrender.com/demo/blank.html) · [inside Savanna](https://access-media-rsi0.onrender.com/savanna/pages/concept-with-navigation.html) | Level 1 install |

## For lesson providers: start here

1. **Get your key** at `/get-key`: type your organisation's name, copy the key. It comes with a practice lesson that is yours.
2. **Add a lesson** at `/studio/lessons.html` (or `POST /api/v1/lessons`): upload a video; captions are written from the speech.
3. **Paste two lines** where the lesson should play:
   ```html
   <script type="module" src="https://YOUR-SERVER/module/db-player.js"></script>
   <db-player lesson="your-lesson-id"></db-player>
   ```

Everything else (captions in other languages, audio description, sign language, slides, jobs, certificates, webhooks) is in the documentation at **`/docs`**. Every call has an example and a "Try it out" button that already uses your key.

## The main task we tested

> A Deaf learner follows a lesson on a low-cost Android phone with the Ethiopian Sign Language window and Amharic captions; a blind learner follows the same lesson with TalkBack and audio description. Both do it alone.

_TODO: co-designer result (see the end of [CONFORMANCE.md](CONFORMANCE.md))._

## Run it

```sh
cp .env.example .env        # set ADMIN_TOKEN to a long random code: the host's master key
docker compose up --build   # first start builds the demo lesson (about a minute)
```

Open **http://localhost:8080**.

| Address | What |
|---|---|
| `/` | For lesson providers: what you can do, in three steps |
| `/get-key` | Get your API key (organisation name only) |
| `/docs` | Documentation: a step-by-step guide and every call with "Try it out" |
| `/debo/` | Debo Learning, a made-up lesson provider's website that uses the player |
| `/demo/blank.html` | The player on an empty page: no Bootstrap, no Savanna CSS, attributes only |
| `/savanna/pages/concept-with-navigation.html` | Inside Savanna, under the lesson banner |
| `/savanna/pages/jobs.html` | Career gateway: job cards and "share your certificate" |
| `/certificates/demo-learner` | The page an employer opens to check a certificate |
| `/studio/lessons.html` | Add a lesson: upload a video, get automatic captions and the code for your page (staff) |
| `/studio/sign.html` | Record an interpreter for a lesson (staff) |
| `/studio/captions.html` | Correct captions and audio description (staff) |

**Automatic captions are built in:** the image includes whisper.cpp, and the speech model (`WHISPER_MODEL`, default `base`, 150 MB) downloads into the data volume on first start. No extra service, and lesson audio never leaves the server. (A separate faster-whisper server also works: `docker compose --profile asr up` and `ASR_URL`.)

**Free hosting (Oracle Cloud "Always Free"):** create an Always Free **Ampere A1** server (Ubuntu 24.04, 2 OCPUs, 12 GB) with a public IP, allow TCP 80 and 443 in its subnet's Security List, then on the server:
```sh
curl -fsSL https://raw.githubusercontent.com/yeab-dev/access-media/main/scripts/server-setup.sh | bash
```
[`scripts/server-setup.sh`](scripts/server-setup.sh) installs Docker, opens the firewall, makes `.env` with a new master key, and starts the app behind Caddy with a free Let's Encrypt certificate at `https://<ip-with-dashes>.sslip.io` (no domain to buy). Uses the better `small` speech model.

**Render free plan (what the live demo uses):** a Docker web service with these environment variables: `ADMIN_TOKEN`, `TRUST_PROXY=1`, `SIGNUP=open`, and `WHISPER_MODEL=tiny` (512 MB of memory fits only the tiny speech model; captions take a few minutes per lesson). The free plan has **no disk and sleeps after 15 minutes idle**: each restart starts again from the demo lesson, so keys and uploaded lessons do not last. Fine for trying it; use a paid plan with a disk, or a free server with `scripts/server-setup.sh`, to keep data.

**Hosted on Render (paid):** Dashboard → New → **Blueprint** → choose this repository → Apply. [`render.yaml`](render.yaml) creates the app with a 10 GB disk; the master key is generated for you (Environment → `ADMIN_TOKEN`). Then add the example lesson used by the Debo site: `SERVER=https://<your-app>.onrender.com KEY=<master key> ./scripts/add-example-lesson.sh`.

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

[`openapi.yaml`](openapi.yaml), and interactive documentation at `/docs` with a step-by-step guide. Reading is public; changes need a key: `Authorization: Bearer <key>`.

- **Provider keys** come from `/get-key` (or `POST /api/v1/keys`). A key changes only that provider's own lessons, jobs, certificates and webhooks, within limits (`PROVIDER_MAX_LESSONS`, `PROVIDER_MAX_UPLOAD_MB`, `PROVIDER_MAX_JOBS`). Keys are stored as SHA-256 hashes. `SIGNUP=closed` turns the page off.
- **The master key** (`ADMIN_TOKEN`) can change everything.
- Errors are `{ error, message }` with the message in words.

```sh
B=http://localhost:8080/api/v1
curl -X POST $B/keys -H 'Content-Type: application/json' -d '{"organisation":"Debo Learning"}'   # → "key"
T="Authorization: Bearer <your key>"
curl $B/me -H "$T"
curl $B/me/lessons -H "$T"                                          # your lessons, with the code for each page
curl -X PATCH $B/lessons/<id> -H "$T" -H 'Content-Type: application/json' -d '{"titles":{"am":"ሲቪ እንዴት እንደሚጻፍ"}}'
curl -X PUT $B/lessons/<id>/slides -H "$T" -H 'Content-Type: application/json' \
     -d '{"slides":[{"time":0.5,"en":{"title":"Introduction","alt":"Title slide: How to write a CV."}}]}'
curl -X DELETE $B/lessons/<id> -H "$T"
curl -X POST $B/jobs -H "$T" -H 'Content-Type: application/json' -d @job.json   # see /docs for the fields
curl -X POST $B/me/key -H "$T"                                       # a new key; the old one stops working
curl $B/lessons
curl -X POST $B/lessons -H "$T" -F video=@lesson.mp4 -F "title=How to write a CV" -F lang=en   # 202; follow status below
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

**Webhook:** we POST `{ event, time, data }` for `lesson.ready`, `sign.recorded`, `sign.requested`, `captions.updated`, `certificate.issued`, with `X-DB-Signature: sha256=<HMAC-SHA256 of the body with your secret>`. No learner names are sent. One attempt, 5-second timeout.

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
- **Lesson providers:** only the organisation name they type. Their key is stored as a hash; no email or password.
- **Certificates:** the learner's name, the achievement and the date: what the learner chooses to share with an employer. Webhooks never include names.
- **Nothing leaves the host** unless the host sets it up: the speech model is local (`ASR_URL`, optional), and there are no analytics or third-party scripts.
- **Delete:** lessons are folders in the `lessons` volume (`/data/lessons/<id>`); certificates are files in `/data/certificates/` (delete the file to withdraw one). Previous versions of captions and sign videos sit next to them (`*.previous*`).
- **Test data only:** the jobs, employers and "Test Learner" are not real.

## Cost to run

Rough, for **3,000 learners a month**, assuming each watches 20 ten-minute lessons a month, mostly at 240p:

- **Traffic:** about 20 MB per lesson view → about 1.2 TB a month.
- **Server:** one small virtual server (2 vCPU, 4 GB RAM, about 40 GB disk) with a few TB of traffic included: **about US$10–30 a month** at common European providers. Prices in Ethiopian data centres were not checked.
- **Free:** Oracle Cloud "Always Free" (2 Arm CPUs, 12 GB memory, 200 GB disk, as reported in mid-2026) runs everything, speech model included: **US$0**. Check Oracle's current Always Free terms for the monthly traffic allowance against the ~1.2 TB estimated above, and watch the CPU when many lessons are converted at once.
- **On Render** (as in `render.yaml`): one "Standard" instance (2 GB) with the speech model inside, plus 10 GB of disk: **about US$27.50 a month** at Render's list prices when we wrote this (check render.com/pricing).
- **Paid APIs:** none. Captions come from an open model (whisper.cpp) on the same server's CPU.

## Caption quality

**Automatic captions for new lessons:** when a provider adds a lesson (`/studio/lessons.html` or `POST /api/v1/lessons`) and a speech model is set up, captions in the spoken language are made without any caption file from the provider. Learners see them at once, labelled "English (automatic)" with a visible note that they may have mistakes, until a person checks and saves them in the caption editor. Without a speech model the lesson is still converted and ready; captions are then added by hand.

Drafts come from an open speech model running inside the server (whisper.cpp with a Whisper model: `WHISPER_MODEL=base` by default, `small` for better quality), or from any OpenAI-style `/v1/audio/transcriptions` server (`ASR_URL`). A person corrects every line in `/studio/captions.html`. `node scripts/caption-quality.mjs draft.vtt corrected.vtt` reports the word error rate and timing drift.

**Honestly:** the demo lesson is silent placeholder slides, so **we have not measured draft quality on real English or Amharic speech.** Whisper's Amharic is known to be weak; plan for a person to rewrite most Amharic lines.

## Finished and not finished

**Finished:** the player with every must-have from the brief (keyboard and screen reader; EN/AM captions you can resize and recolour; movable, resizable sign window; audio description; offline pack; tagged PDF and HTML with image descriptions), the career gateway (job card with audio summary, verifiable certificate page), the sign language recording studio, the caption editor, lesson upload with automatic captions, provider keys from a web page (each provider changes only its own things), API documentation with a guide and "Try it out", Render hosting, the API with documentation and a webhook, Docker. 48 unit tests and 76 browser tests, with axe-core showing zero critical or serious issues on every page we built.

**Not finished:**
- The **sign language video is a placeholder**. A real ESL recording is needed: use `/studio/sign.html` with an interpreter.
- The **demo lesson has no speech** (placeholder slides).
- **Native-speaker review** of all Amharic.
- **Service-worker offline**, **Braille (.brf)**, the **recorded live-session viewer**, and **LTI 1.3**.
- `docker compose up` **has not yet been tested on another laptop**.
- **Large uploads on slow connections:** on the hosted demo, an upload is cut after about 75 seconds (we measured about 7 MB at 90 KB/s from Addis Ababa). Upload a smaller file (for example 360p) or from a faster connection. Resumable uploads are not built.
- **One key per organisation**, not per person: no separate staff logins or roles inside a provider. A lost key cannot be recovered (get a new one; ask the host to move lessons).
- Swagger UI (the reference part of `/docs`) is a third-party page; axe-core is run on our header and pages, not on Swagger's own markup.
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
| whisper.cpp 1.9.5 | Automatic captions (built into the image) | MIT |
| Whisper models (ggml conversions) | Speech recognition model | MIT |
| Caddy 2.8.4 (optional, `https` profile) | HTTPS with Let's Encrypt | Apache-2.0 |
| speaches / faster-whisper (optional) | Separate caption server | MIT |

The module itself (`module/`) has **no runtime dependencies**.

**Code licence:** _TODO: the open licence ALX named at kick-off._ Code may be used and published by ALX and its partners; the team is credited by name.
