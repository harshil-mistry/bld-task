'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { toViewport } from '../lib/coords.mjs';

const WS_URL = 'ws://localhost:5000';
const VW = 1280;
const VH = 800;

function buttonName(b) {
  return b === 2 ? 'right' : b === 1 ? 'middle' : 'left';
}

function CursorGlyph({ size = 18, color = '#04160d' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M8 5 L8 19 L11.4 15.8 L13.9 20.4 L15.8 19.5 L13.3 15 L17.6 15 Z" fill={color} />
    </svg>
  );
}

function Logo({ size = 46 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none" aria-hidden="true">
      <defs>
        <linearGradient id="logoGrad" x1="4" y1="3" x2="28" y2="29" gradientUnits="userSpaceOnUse">
          <stop stopColor="#4ade9f" />
          <stop offset="1" stopColor="#34d399" />
        </linearGradient>
      </defs>
      <rect x="2" y="2" width="28" height="28" rx="7" fill="url(#logoGrad)" />
      <path d="M11 7 L11 24 L15 20 L18.2 26 L20.6 24.8 L17.4 19 L22.6 19 Z" fill="#04160d" />
    </svg>
  );
}

export default function Home() {
  const wsRef = useRef(null);
  const canvasRef = useRef(null);
  const ctxRef = useRef(null);
  const stageRef = useRef(null);
  const runningRef = useRef(false);
  const lastMove = useRef(0);

  const [state, setState] = useState('stopped');
  const [statusMsg, setStatusMsg] = useState('Connecting to control server…');
  const [url, setUrl] = useState('https://example.com');

  const running = state === 'running';
  const phase = running ? 'live' : state === 'starting' ? 'connecting' : 'idle';
  useEffect(() => { runningRef.current = running; }, [running]);

  const sendMsg = useCallback((m) => {
    const ws = wsRef.current;
    if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(m));
  }, []);

  // WebSocket + canvas context setup
  useEffect(() => {
    ctxRef.current = canvasRef.current.getContext('2d');
    const ws = new WebSocket(WS_URL);
    wsRef.current = ws;
    ws.onopen = () => setStatusMsg('Connected — ready to launch');
    ws.onclose = () => setStatusMsg('Disconnected from control server');
    ws.onerror = () => setStatusMsg('Cannot reach control server (is it running on :5000?)');
    ws.onmessage = (ev) => {
      let msg;
      try { msg = JSON.parse(ev.data); } catch { return; }
      if (msg.type === 'frame') {
        const img = new Image();
        img.onload = () => ctxRef.current && ctxRef.current.drawImage(img, 0, 0, VW, VH);
        img.src = 'data:image/jpeg;base64,' + msg.data;
      } else if (msg.type === 'status') {
        setState(msg.state);
        if (msg.message) setStatusMsg(msg.message);
      } else if (msg.type === 'error') {
        setStatusMsg('Error: ' + msg.message);
      }
    };
    return () => ws.close();
  }, []);

  // Native non-passive wheel listener so we can preventDefault() the page scroll.
  useEffect(() => {
    const canvas = canvasRef.current;
    const onWheel = (e) => {
      if (!runningRef.current) return;
      e.preventDefault();
      const rect = canvas.getBoundingClientRect();
      const { x, y } = toViewport({ clientX: e.clientX, clientY: e.clientY, rect, width: VW, height: VH });
      sendMsg({ type: 'wheel', x, y, deltaX: e.deltaX, deltaY: e.deltaY });
    };
    canvas.addEventListener('wheel', onWheel, { passive: false });
    return () => canvas.removeEventListener('wheel', onWheel);
  }, [sendMsg]);

  const coords = (e) => {
    const rect = canvasRef.current.getBoundingClientRect();
    return toViewport({ clientX: e.clientX, clientY: e.clientY, rect, width: VW, height: VH });
  };

  const onMouseDown = (e) => {
    if (!running) return;
    stageRef.current && stageRef.current.focus(); // capture keyboard for the browser
    const { x, y } = coords(e);
    sendMsg({ type: 'mouse', action: 'down', x, y, button: buttonName(e.button) });
  };
  const onMouseUp = (e) => {
    if (!running) return;
    const { x, y } = coords(e);
    sendMsg({ type: 'mouse', action: 'up', x, y, button: buttonName(e.button) });
  };
  const onMouseMove = (e) => {
    if (!running) return;
    const now = performance.now();
    if (now - lastMove.current < 30) return; // throttle to ~33/s
    lastMove.current = now;
    const { x, y } = coords(e);
    sendMsg({ type: 'mouse', action: 'move', x, y });
  };
  const onContextMenu = (e) => e.preventDefault();

  const onKeyDown = (e) => {
    if (!running) return;
    e.preventDefault();
    if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
      sendMsg({ type: 'key', action: 'type', text: e.key });
    } else {
      sendMsg({ type: 'key', action: 'press', key: e.key });
    }
  };

  const start = () => { setStatusMsg('Starting…'); sendMsg({ type: 'start' }); };
  const stop = () => sendMsg({ type: 'stop' });
  const go = (e) => { e.preventDefault(); if (running) sendMsg({ type: 'navigate', url }); };

  const chipLabel = phase === 'live' ? 'Live' : phase === 'connecting' ? 'Connecting' : 'Idle';

  return (
    <main className="app">
      <div className="topbar">
        <div className="brand">
          <div className="brand-mark"><CursorGlyph size={18} /></div>
          <div>
            <div className="brand-name">Pilot</div>
            <div className="brand-sub">remote browser</div>
          </div>
        </div>
        <div className="chip" data-state={phase}>
          <span className="dot" />
          {chipLabel}
          {running && <span style={{ color: 'var(--faint)' }}>· {VW}×{VH}</span>}
        </div>
      </div>

      <div className="panel">
        {phase === 'live' ? (
          <button className="btn btn-danger" onClick={stop}>Stop</button>
        ) : phase === 'connecting' ? (
          <button className="btn btn-primary" disabled>
            <span className="spinner sm" /> Starting…
          </button>
        ) : (
          <button className="btn btn-primary" onClick={start}>Start browser</button>
        )}

        <form className={'urlbar' + (running ? '' : ' is-disabled')} onSubmit={go}>
          <span className="glyph">⌕</span>
          <input
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="example.com"
            disabled={!running}
            spellCheck={false}
            aria-label="URL to open in the remote browser"
          />
          <button type="submit" className="btn btn-ghost" disabled={!running}>Go →</button>
        </form>
      </div>

      <div className="statusline">{statusMsg}</div>

      <div
        ref={stageRef}
        tabIndex={0}
        onKeyDown={onKeyDown}
        className={'stage' + (running ? ' is-live' : '')}
      >
        <canvas
          ref={canvasRef}
          width={VW}
          height={VH}
          onMouseDown={onMouseDown}
          onMouseUp={onMouseUp}
          onMouseMove={onMouseMove}
          onContextMenu={onContextMenu}
        />

        {phase === 'connecting' && (
          <div className="overlay">
            <div className="loading">
              <div className="spinner" />
              <div className="loading-text">{statusMsg}</div>
            </div>
          </div>
        )}

        {phase === 'idle' && (
          <div className="overlay">
            <div>
              <div className="empty-mark"><Logo size={46} /></div>
              <div className="empty-title">Spin up a browser you can drive</div>
              <div className="empty-sub">
                Press Start and a headless Chrome boots inside a Docker container. Its screen streams
                here live — click, scroll, and type to drive it.
              </div>
              <div className="empty-cue"><span className="arrow">↑</span> Press Start to begin</div>
            </div>
          </div>
        )}
      </div>

      <div className="hint">
        Click the screen to focus it, then <kbd>click</kbd> <kbd>scroll</kbd> <kbd>type</kbd> — your input goes to the remote browser.
      </div>
    </main>
  );
}
