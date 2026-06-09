# Remote Browser Control — Design Spec

**Date:** 2026-06-09
**Goal:** A "mini-TeamViewer for a browser." Open a web UI, click **Start Browser**, a Docker
container spins up running headless Chromium, the browser screen streams back live, and you can
click / scroll / type from the web UI into that headless browser. Everything runs locally.

## Decisions
- **Frontend:** Next.js (App Router), single page — matches BLD's stack.
- **Docker model:** the **Start Browser** button spins up a fresh Chromium container.
- **Scope:** single-user, but structured as a **session manager** (a `sessions` map that holds one
  entry) so going multi-user later is additive, not a rewrite. Multi-user is the documented
  "next step", not built now.

## Architecture
Three local processes:
1. **Next.js web UI** (`localhost:3000`) — Start/Stop buttons, a URL bar, a `<canvas>` showing the
   live browser; captures mouse + keyboard.
2. **Node backend** (`localhost:5000`) — Express + `ws` + `puppeteer-core`. Spins up the Docker
   container, drives Chromium, relays frames out and input in over a single WebSocket.
3. **Chromium in Docker** (CDP on `localhost:9222`) — headless Chromium, launched by the backend.

### Data flow
```
[Canvas] --click/scroll/type (WS JSON)--> [Backend] --Puppeteer/CDP--> [Chromium/Docker]
[Canvas] <----JPEG frames (WS)---------- [Backend] <--Page.screencast-- [Chromium/Docker]
```

## How each piece works
- **Start** → backend runs `docker run -d --rm --name bld-chromium -p 9222:9222 bld-remote-chromium`,
  polls `http://localhost:9222/json/version` until ready, then `puppeteer-core` connects via the
  returned `webSocketDebuggerUrl`.
- **Streaming** → CDP `Page.startScreencast` (JPEG, ~quality 60, 1280×800). Each `screencastFrame`
  → ack → forward base64 to the UI over WS → UI paints onto canvas. Event-driven (frames only on
  visual change).
- **Input** → canvas events → WS JSON → backend maps via Puppeteer `page.mouse` / `page.keyboard`
  (`move`, `down/up`, `wheel`, `type`). Coordinates scaled from canvas-display-space to the
  1280×800 viewport on the frontend.
- **URL bar** → `page.goto(url)` so the demo can surf a real site.
- **Stop** → stop screencast, close page, `docker rm -f bld-chromium`.

### Session shape (single-user, future-proofed)
A `Session` object holds `{ id, containerName, browser, page, cdpClient, clients }`. The backend
keeps a `sessions` Map. Today it holds at most one; multi-user later = unique container name +
dynamic host port + idle-timeout cleanup + per-container resource caps.

## Files
```
docker/Dockerfile     # FROM zenika/alpine-chrome, headless chromium w/ CDP
server/index.js       # express + ws + puppeteer-core; docker via child_process
server/package.json
web/                  # Next.js single page
README.md             # run instructions + what works + known limits
```

## Tech choices
- **CDP `Page.startScreencast`** for streaming (not VNC/WebRTC) — fewest moving parts for a
  browser-only demo.
- **`puppeteer-core`** (connects to remote Chromium, no bundled download) + **`ws`** +
  **`child_process`** to drive the `docker` CLI directly (transparent, real commands).
- **Custom Dockerfile** on `zenika/alpine-chrome` — deterministic launch flags, shows Docker skill.

## Known gotchas (also in README)
- Docker Desktop must be running; backend returns a clear UI error if the daemon is down.
- First run pulls the ~200 MB Chromium image (one-time, needs internet).
- Container Chromium needs `--no-sandbox`.
- Streaming is JPEG-over-WS — smooth for a demo, not pixel-perfect 60 fps.

## Testing
Primarily manual (start Docker → click around → confirm the stream reacts), plus a small unit test
for the pure coordinate-mapping function. Coverage is intentionally light — appropriate for a
prototype.

## Out of scope (YAGNI)
Auth, multi-session, recording, right/middle mouse buttons, mobile layout.

## Next step (for the form)
Make it multi-session: session manager with per-user containers, dynamic port allocation, WS
routing by session token, idle-timeout cleanup, a max-concurrent-sessions cap, and per-container
`--memory`/`--cpus` limits. ~+0.5–1 day; the streaming/input core is unchanged.
