# Slow Reveal

A local web app for the ELT "slow reveal" technique: cover a photo with an
adjustable frosted blur, then reveal parts of it with finger-controlled
spotlight windows during a live 1-on-1 lesson.

## Start (on the Mac)

```sh
./run.sh
```

It prints two URLs. On the Chromebook (same Wi-Fi), open the second one:

```
http://<mac-lan-ip>:8000     e.g. http://192.168.1.23:8000
```

Different port: `./run.sh 9000`. Requires only Python 3 (built into macOS).

## Before class

Drop the lesson's photos into the `images/` folder. (The folder ships empty
in this repo — add your own photos.) The app lists the folder automatically —
tap **Images → ↻ Refresh** if you add one mid-session. No code or manifest
edits, ever.

## In class

- **Images** — pick a photo (thumbnails; tray closes after choosing)
- **Blur slider** — frosted-glass strength, live, 0 = sharp
- **Tap the blurred image** — drop a spotlight (sharp window) there
- **Drag a spotlight** to move it; **drag its corner dot** (or pinch) to resize
- **× or double-tap** a spotlight to close it — the area re-frosts (no trail)
- **Clear** — remove all spotlights
- **Cover ON/OFF** — the "reveal the answer" switch, independent of spotlights
- **Zoom:** pinch with two fingers, or point and scroll the mouse wheel;
  the **zoom button** shows the current level and resets to 1× when pressed
- **Pan while zoomed:** hold a finger still for half a second, then move
  (a short buzz confirms, where supported) — or drag with the mouse wheel
  held down

The last blur level is remembered between sessions.

## No Mac available? (Plan B)

Open `index.html` served from anywhere (or the app on the Chromebook itself),
tap **Images → Choose folder…**, and pick a local folder of photos. This uses
the browser's folder picker instead of the server listing; everything else
works the same.

## Files

- `index.html`, `style.css`, `app.js` — the app (no build step, no CDNs, fully offline)
- `server.py` — static server + `/api/images` JSON folder listing
- `run.sh` — starts the server and prints the Chromebook URL
- `images/` — put lesson photos here (a sample is included)

---

## Lesson plan ideas

See [LESSON-IDEAS.md](LESSON-IDEAS.md) for activity ideas, CEFR/Eiken
placement, SLA grounding, design best practices, and parent/adult-learner
framing — all grounded in NotebookLM notebooks.
