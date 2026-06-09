# BLD Remote Browser — a mini "TeamViewer for a browser"

Open a web UI, hit **Start Browser**, and a Docker container spins up running **headless Chromium**.
The browser screen streams back to the web UI in real time, and you can **click, scroll, and type**
from the UI straight into that headless browser. Everything runs locally.

```
[Next.js UI :3000]  ⇄ WebSocket ⇄  [Node control server :5000]  ⇄ CDP ⇄  [Chromium in Docker :9222]
   canvas + input                     spins up container,                  headless, screencast
                                      streams frames, relays input
```

## How it works
- **Streaming:** the server drives Chromium over the **Chrome DevTools Protocol** and uses
  `Page.startScreencast` to receive live JPEG frames, which it forwards over a WebSocket. The UI
  paints them onto a `<canvas>`.
- **Input:** canvas mouse/keyboard events are sent over the same WebSocket and replayed into the
  page with Puppeteer's `page.mouse` / `page.keyboard`. Coordinates are scaled from the displayed
  canvas to Chromium's 1280×800 viewport (`web/lib/coords.mjs`).
- **Docker:** clicking **Start Browser** makes the server `docker run` a fresh container from the
  `bld-remote-chromium` image (built automatically on first run from `docker/Dockerfile`).

## Prerequisites
- **Docker Desktop** installed **and running** (the daemon must be reachable).
- **Node.js 18+** (developed on Node 22).

## Run it
Open two terminals.

**1) Control server**
```bash
cd server
npm install
npm start            # -> http://localhost:5000
```

**2) Web UI**
```bash
cd web
npm install
npm run dev          # -> http://localhost:3000
```

Then open **http://localhost:3000** and click **Start Browser**.
(First start builds the Chromium image — ~1–2 min, one time only.)

> Optional: pre-build the image so the first click is instant:
> ```bash
> docker build -t bld-remote-chromium ./docker
> ```

## Using it
1. **Start Browser** — waits for the container, then the live screen appears.
2. Type a URL in the bar and hit **Go** (e.g. `https://example.com`, `https://news.ycombinator.com`).
3. Click the screen to focus it, then **click / scroll / type** — it all happens in the headless browser.
4. **Stop** tears the container down.

## Tests
```bash
cd web
npm test             # unit tests for the coordinate-mapping function
```

## What works
- One-click spin-up of a Dockerized headless Chromium.
- Real-time screen streaming to the browser canvas.
- Mouse (move/click/drag), scroll wheel, keyboard typing, and URL navigation into the headless browser.

## Known limitations
- **Single browser session / single user.** The code is structured as a session manager
  (a `sessions` map holding one entry) so multi-user is an additive change, not a rewrite — see below.
- Streaming is **JPEG-over-WebSocket** — smooth enough for a demo, not pixel-perfect 60 fps.
- No audio, no file downloads, left-mouse-button focus only.
- Local only — no auth (fine for `localhost`, not for exposing on a network).

## Next step: multi-user
The streaming/input core is unchanged. To support concurrent users you'd add:
- a **session per user** (unique container name + a dynamic host port via `-p 0:9222`),
- **WebSocket routing by session token** so streams/input never cross users,
- **idle-timeout cleanup** + a **max-concurrent-sessions cap** (each Chromium is ~150–400 MB),
- per-container **`--memory` / `--cpus`** limits.

Estimated ~+0.5–1 day on top of this prototype.

## Project layout
```
docker/Dockerfile      # headless Chromium image (CDP on :9222)
server/index.js        # express + ws + puppeteer-core; spins up Docker, streams, relays input
web/app/page.js        # Next.js UI: Start/Stop, URL bar, canvas, input capture
web/lib/coords.mjs     # pure canvas->viewport coordinate mapping (unit-tested)
```
