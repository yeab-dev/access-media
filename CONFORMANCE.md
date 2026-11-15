# WCAG 2.2 AA conformance report

**Product:** `<db-player>`, `<db-job-card>`, `<db-language>` (module/), the lesson documents and offline page, the certificate check page, and the staff pages `studio/sign.html` and `studio/captions.html`.
**Not covered:** the Savanna starter pages themselves (host), and `/docs` (Swagger UI, a developer tool we did not build).
**Date:** 15 November 2026 · **Standard:** WCAG 2.2, levels A and AA.

**How we checked:**
- **axe-core 4.14** in automated browser tests (`npm run a11y`): desktop Chromium and a Pixel 7 phone profile, in English and Amharic, light and dark, with panels open. **Zero critical and zero serious issues** on every page we built.
- **Automated behaviour tests** for keyboard use, focus, live announcements, 320 px reflow, and more (64 browser tests).
- **By hand** on a Samsung Galaxy A32 (Chrome) and desktop Chrome.
- **Co-designer testing:** see the end. Automated tools find about a third of real problems, so that section matters most.

"Content" below means the lesson itself (video, captions, slides), which the people who make lessons provide. The demo lesson is placeholder slides.

| WCAG 2.2 criterion | Level | Status | Notes |
|---|---|---|---|
| 1.1.1 Non-text content | A | Supports | Every icon button has a visible text label. Document images have written descriptions from `images.json`, never file names (tested). Decorative icons are hidden from screen readers. |
| 1.2.1 Audio-only and video-only (prerecorded) | A | Supports | Every lesson has a transcript, an HTML document and a PDF. The demo video is video-only and is fully described by the description track and document. |
| 1.2.2 Captions (prerecorded) | A | Supports (content) | English and Amharic captions, drawn by the player. **The Amharic is a draft until a native speaker checks it.** |
| 1.2.3 Audio description or media alternative | A | Supports | Text audio description (read by the screen reader or the phone's voice), plus the transcript and lesson document. |
| 1.2.4 Captions (live) | AA | Not applicable | No live media. |
| 1.2.5 Audio description (prerecorded) | AA | Supports (content) | Description tracks in English and Amharic. "Pause the video while a description is read" is on by default (extended description). A described-audio MP3 is also supported. Spoken output depends on the screen reader or the phone having a voice for the language; the player says so in words when it has none. |
| 1.3.1 Info and relationships | A | Supports | Native buttons, selects and sliders; visible `<label for>`; fieldsets and legends; headings; lists; `dl` on job cards. Documents: h1 → h2 → h3 in order (tested); PDF tagged with headings and figures (`pdfinfo -struct`). |
| 1.3.2 Meaningful sequence | A | Supports | DOM order matches visual order. |
| 1.3.3 Sensory characteristics | A | Supports | Instructions do not rely on shape or colour. The sign window buttons name positions ("Top left") because position is what they set. |
| 1.3.4 Orientation | AA | Supports | Works in portrait and landscape. |
| 1.3.5 Identify input purpose | AA | Supports | The only personal field is the staff access code (`autocomplete="current-password"`). Learners enter no personal data. |
| 1.4.1 Use of colour | A | Supports | Pressed buttons also change border and weight. Errors are in words. The current transcript line uses `aria-current` as well as colour. |
| 1.4.2 Audio control | A | Supports | Nothing plays by itself. |
| 1.4.3 Contrast (minimum) | AA | Supports | axe shows no contrast issues. Host colours are darkened for text and buttons, because Savanna's own red (#db3e3e) is 4.4:1 on white. Caption colours are the learner's own choice; the default is white on black. |
| 1.4.4 Resize text | AA | Supports | Tested at 200% (320 CSS px wide). Caption size up to 3× in settings. |
| 1.4.5 Images of text | AA | Partly (content) | The player uses none. The demo **lesson slides** are text in a video picture; each one is written out in the description track and the lesson document. |
| 1.4.10 Reflow | AA | Supports | No sideways scrolling at 320 px, tested on the player, job page and editor. The sign window stacks under the video on narrow screens. |
| 1.4.11 Non-text contrast | AA | Supports (by hand) | Control borders #8a90a0 on white (3.2:1) and #7c8496 on dark (4.7:1); focus outline 3 px. Checked by hand, not by a tool. |
| 1.4.12 Text spacing | AA | **Not tested** | No fixed heights on text, so it should hold; not checked with a text-spacing bookmarklet. |
| 1.4.13 Content on hover or focus | AA | Supports | No tooltips or hover pop-ups. |
| 2.1.1 Keyboard | A | Supports | Everything works by keyboard (tested): Space/K, arrows, J/L, M, C, D, S, T, F, ?; moving and resizing the sign window with arrows and +/−; the editor. |
| 2.1.2 No keyboard trap | A | Supports | Keyboard help is a `<dialog>`: Escape closes it and focus returns to the button (tested). |
| 2.1.4 Character key shortcuts | A | Supports | Single-key shortcuts work only while focus is inside the player. They are listed in Keyboard help. |
| 2.2.1 Timing adjustable | A | Supports | No time limits. Audio description pauses the video and resumes after an estimated reading time; the learner can press Play at any moment or turn the pause off. |
| 2.2.2 Pause, stop, hide | A | Supports | Video only plays when the learner starts it; Pause is always available. |
| 2.3.1 Three flashes or below | A | Supports (content) | Nothing in our interface flashes. Lesson videos must be checked by their makers. |
| 2.4.1 Bypass blocks | A | Supports | Skip links on the demo, jobs and offline pages; headings throughout. |
| 2.4.2 Page titled | A | Supports | Every page has a descriptive title; PDFs have a document title. |
| 2.4.3 Focus order | A | Supports | Focus follows reading order. After redraws (changing language, adding or deleting a caption line), focus goes to the right control (tested). |
| 2.4.4 Link purpose (in context) | A | Supports | "Apply" links are named "Apply: <job title>"; document links say what they open. |
| 2.4.5 Multiple ways | AA | Not applicable | A component, not a site. Lesson documents have a table of contents. |
| 2.4.6 Headings and labels | AA | Supports | Descriptive headings and labels in both languages. The language switch is labelled in both: "Language / ቋንቋ". |
| 2.4.7 Focus visible | AA | Supports | 3 px focus outline everywhere; yellow on the video area and sign window. |
| 2.4.11 Focus not obscured (minimum) | AA | **Partly** | Our pages: the editor's sticky video never covers the focused field (tested). **Inside Savanna**, Savanna's own fixed header can cover the top of the player while scrolling. That's a host defect we did not change. |
| 2.5.1 Pointer gestures | A | Supports | No multi-point or path gestures. |
| 2.5.2 Pointer cancellation | A | Supports | Actions happen on release (click); dragging the sign window can be undone with the position buttons. |
| 2.5.3 Label in name | A | Supports | Accessible names start with the visible label (for example "Apply: Junior Front-End Developer"). |
| 2.5.4 Motion actuation | A | Not applicable | Nothing uses device motion. |
| 2.5.7 Dragging movements | AA | Supports | The sign window can be dragged, **or** moved and resized with buttons (Top left, Top right, Bottom left, Bottom right, Beside the video, Larger, Smaller) and keys (tested). |
| 2.5.8 Target size (minimum) | AA | Supports | Controls are at least 44 × 44 px. |
| 3.1.1 Language of page | A | Supports | `lang` on every page and on the player, following the learner's language. |
| 3.1.2 Language of parts | AA | Supports | `lang` on caption text, transcript, Amharic descriptions in the live region (tested), language names in menus, and job text in a different language from the interface. |
| 3.2.1 On focus | A | Supports | Focus never changes anything. |
| 3.2.2 On input | A | Supports | Choosing a language redraws the player in that language. This was asked for by our users; focus stays on the switch and the change is announced. Other menus change only what they name (captions, speed). |
| 3.2.3 Consistent navigation | AA | Supports | Controls are in the same place in every lesson and language. |
| 3.2.4 Consistent identification | AA | Supports | The same functions have the same names across components. |
| 3.2.6 Consistent help | A | Supports | "Keyboard help" is always in the same place in the player. |
| 3.3.1 Error identification | A | Supports | Errors in words next to the field, with `aria-invalid` and a linked summary in the editor (tested). API errors come with a message in words. |
| 3.3.2 Labels or instructions | A | Supports | Every field has a visible label; time fields give an example format. |
| 3.3.3 Error suggestion | AA | Supports | Messages say how to fix the error (for example, "Use minutes:seconds, for example 0:05.500"). |
| 3.3.4 Error prevention (legal, financial, data) | AA | Supports | No legal or financial transactions. The editor asks before replacing lines with a draft; previous caption and sign versions are kept. |
| 3.3.7 Redundant entry | A | Supports | The staff access code is remembered for the session. |
| 3.3.8 Accessible authentication (minimum) | AA | Supports | The access code field allows paste and password managers; no puzzles. |
| 4.1.2 Name, role, value | A | Supports | Native elements; `aria-pressed` on toggles; `aria-expanded` on panels; `aria-current` on the current transcript line. |
| 4.1.3 Status messages | AA | Supports | `role="status"` for changes (captions on or off, sign window, language, saved); an assertive live region for audio description, in the right language. |

## Who tested, and on what

| Who | Device and assistive technology | Task | Result |
|---|---|---|---|
| Automated (axe-core 4.14, Playwright) | Chromium desktop and Pixel 7 profile | All pages we built, English and Amharic, light and dark | 0 critical, 0 serious |
| Team | Samsung Galaxy A32, Chrome | Player, offline pack, jobs page | Works. Fixed: the sign window "beside" layout hid the lesson on phones |
