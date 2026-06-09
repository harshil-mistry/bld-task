'use strict';

/**
 * BLD Remote Browser — control server.
 *
 * Responsibilities:
 *   1. On "start": build (if needed) + run a Docker container with headless Chromium (CDP on :9222).
 *   2. Connect to it with puppeteer-core and stream the page via CDP Page.startScreencast.
 *   3. Relay mouse/keyboard/navigation from the web UI into the page.
 *
 * Single-user, but shaped as a session manager (a `sessions` Map that holds one entry) so going
 * multi-user later = unique container name + dynamic port + idle cleanup, not a rewrite.
 */

const http = require('http');
const path = require('path');
const { promisify } = require('util');
const { execFile } = require('child_process');
const express = require('express');
const { WebSocketServer } = require('ws');
const puppeteer = require('puppeteer-core');

const execFileAsync = promisify(execFile);

const PORT = process.env.PORT || 5000;
const CDP_PORT = 9222;
const IMAGE = 'bld-remote-chromium';
const CONTAINER = 'bld-chromium';
const DOCKER_DIR = path.resolve(__dirname, '..', 'docker');
const VIEWPORT = { width: 1280, height: 800 };

/** @type {Map<string, any>} sessionId -> { browser, page, client, clients:Set<ws>, running } */
const sessions = new Map();
const SESSION_ID = 'default'; // multi-user: one id per connected user

// ---------------------------------------------------------------------------
// WebSocket helpers
// ---------------------------------------------------------------------------
function send(ws, msg) {
  if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(msg));
}
function broadcast(session, msg) {
  const data = JSON.stringify(msg);
  for (const ws of session.clients) if (ws.readyState === ws.OPEN) ws.send(data);
}

// ---------------------------------------------------------------------------
// Docker / Chromium lifecycle
// ---------------------------------------------------------------------------
async function dockerAvailable() {
  try { await execFileAsync('docker', ['info']); return true; }
  catch { return false; }
}

async function ensureImage(onStatus) {
  try { await execFileAsync('docker', ['image', 'inspect', IMAGE]); return; }
  catch { /* not built yet */ }
  onStatus('Building Chromium image (first run only, ~1–2 min)…');
  await execFileAsync('docker', ['build', '-t', IMAGE, DOCKER_DIR], { maxBuffer: 1024 * 1024 * 256 });
}

async function dockerRemoveQuiet(name) {
  try { await execFileAsync('docker', ['rm', '-f', name]); } catch { /* already gone */ }
}

async function dockerRun() {
  await execFileAsync('docker', [
    'run', '-d', '--rm', '--name', CONTAINER, '-p', `${CDP_PORT}:9222`, IMAGE,
  ]);
}

/** Poll the CDP endpoint until Chromium answers, then return its (host-rewritten) ws endpoint. */
async function waitForChromium(timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  let lastErr;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`http://localhost:${CDP_PORT}/json/version`);
      if (res.ok) {
        const info = await res.json();
        const u = new URL(info.webSocketDebuggerUrl);
        u.host = `localhost:${CDP_PORT}`; // chromium may report 0.0.0.0; force localhost
        return u.toString();
      }
    } catch (e) { lastErr = e; }
    await new Promise((r) => setTimeout(r, 300));
  }
  throw new Error('Chromium did not become ready in time' + (lastErr ? `: ${lastErr.message}` : ''));
}

async function createSession(onStatus) {
  if (!(await dockerAvailable())) {
    throw new Error('Docker daemon not reachable — is Docker Desktop running?');
  }
  await ensureImage(onStatus);

  onStatus('Starting Chromium container…');
  await dockerRemoveQuiet(CONTAINER); // clear any stale container from a previous run
  await dockerRun();

  onStatus('Connecting to the browser…');
  const wsEndpoint = await waitForChromium(30000);
  const browser = await puppeteer.connect({ browserWSEndpoint: wsEndpoint, defaultViewport: null });

  const pages = await browser.pages();
  const page = pages[0] || (await browser.newPage());
  await page.setViewport(VIEWPORT);

  const client = await page.createCDPSession();
  const session = { id: SESSION_ID, browser, page, client, clients: new Set(), running: true };

  client.on('Page.screencastFrame', async (frame) => {
    broadcast(session, { type: 'frame', data: frame.data });
    try { await client.send('Page.screencastFrameAck', { sessionId: frame.sessionId }); } catch { /* page gone */ }
  });
  await client.send('Page.startScreencast', {
    format: 'jpeg',
    quality: 60,
    maxWidth: VIEWPORT.width,
    maxHeight: VIEWPORT.height,
    everyNthFrame: 1,
  });

  browser.on('disconnected', () => {
    if (!session.running) return;
    session.running = false;
    broadcast(session, { type: 'status', state: 'stopped', message: 'Browser disconnected' });
    sessions.delete(session.id);
  });

  sessions.set(session.id, session);
  return session;
}

async function stopSession(session) {
  session.running = false;
  try { await session.client.send('Page.stopScreencast'); } catch { /* ignore */ }
  try { await session.browser.disconnect(); } catch { /* ignore */ }
  await dockerRemoveQuiet(CONTAINER);
  sessions.delete(session.id);
}

// ---------------------------------------------------------------------------
// Input relay: UI events -> Puppeteer
// ---------------------------------------------------------------------------
async function handleInput(session, msg) {
  const { page } = session;
  switch (msg.type) {
    case 'navigate': {
      let url = (msg.url || '').trim();
      if (!url) break;
      if (!/^https?:\/\//i.test(url)) url = 'https://' + url;
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
      break;
    }
    case 'mouse': {
      const button = msg.button === 'right' ? 'right' : msg.button === 'middle' ? 'middle' : 'left';
      if (msg.action === 'move') {
        await page.mouse.move(msg.x, msg.y);
      } else if (msg.action === 'down') {
        await page.mouse.move(msg.x, msg.y);
        await page.mouse.down({ button });
      } else if (msg.action === 'up') {
        await page.mouse.move(msg.x, msg.y);
        await page.mouse.up({ button });
      }
      break;
    }
    case 'wheel': {
      await page.mouse.move(msg.x, msg.y);
      await page.mouse.wheel({ deltaX: msg.deltaX || 0, deltaY: msg.deltaY || 0 });
      break;
    }
    case 'key': {
      if (msg.action === 'type' && msg.text) {
        await page.keyboard.type(msg.text);
      } else if (msg.action === 'press' && msg.key) {
        await page.keyboard.press(msg.key); // event.key names mostly match Puppeteer KeyInput
      }
      break;
    }
    default:
      break;
  }
}

// ---------------------------------------------------------------------------
// HTTP + WebSocket server
// ---------------------------------------------------------------------------
const app = express();
app.get('/health', (_req, res) => {
  const s = sessions.get(SESSION_ID);
  res.json({ ok: true, running: !!(s && s.running) });
});

const server = http.createServer(app);
const wss = new WebSocketServer({ server });

wss.on('connection', (ws) => {
  const existing = sessions.get(SESSION_ID);
  if (existing && existing.running) {
    existing.clients.add(ws);
    send(ws, { type: 'status', state: 'running', message: 'Attached to running browser' });
  } else {
    send(ws, { type: 'status', state: 'stopped', message: 'No browser running' });
  }

  ws.on('message', async (raw) => {
    let msg;
    try { msg = JSON.parse(raw.toString()); } catch { return; }

    try {
      if (msg.type === 'start') {
        let session = sessions.get(SESSION_ID);
        if (session && session.running) {
          session.clients.add(ws);
          send(ws, { type: 'status', state: 'running', message: 'Already running' });
          return;
        }
        send(ws, { type: 'status', state: 'starting', message: 'Starting…' });
        try {
          session = await createSession((m) => send(ws, { type: 'status', state: 'starting', message: m }));
        } catch (err) {
          send(ws, { type: 'error', message: err.message });
          send(ws, { type: 'status', state: 'stopped', message: 'Failed to start: ' + err.message });
          return;
        }
        session.clients.add(ws);
        broadcast(session, { type: 'status', state: 'running', message: 'Browser running' });
        return;
      }

      const session = sessions.get(SESSION_ID);

      if (msg.type === 'stop') {
        if (session) {
          broadcast(session, { type: 'status', state: 'stopped', message: 'Stopped' });
          await stopSession(session);
        } else {
          send(ws, { type: 'status', state: 'stopped', message: 'Stopped' });
        }
        return;
      }

      if (!session || !session.running) return;
      await handleInput(session, msg);
    } catch (err) {
      send(ws, { type: 'error', message: err.message });
    }
  });

  ws.on('close', () => {
    for (const s of sessions.values()) s.clients.delete(ws);
  });
});

server.listen(PORT, () => {
  console.log(`[bld] control server on http://localhost:${PORT}`);
  console.log(`[bld] docker image: ${IMAGE}  container: ${CONTAINER}  cdp: ${CDP_PORT}`);
});

// Best-effort cleanup so we don't leak the container on Ctrl+C.
async function shutdown() {
  await dockerRemoveQuiet(CONTAINER);
  process.exit(0);
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
