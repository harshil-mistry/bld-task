'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { toViewport } from '../lib/coords.mjs';

const WS_URL = 'ws://localhost:5000';
const VW = 1280;
const VH = 800;

function buttonName(b) {
  return b === 2 ? 'right' : b === 1 ? 'middle' : 'left';
}

export default function Home() {
  const wsRef = useRef(null);
  const canvasRef = useRef(null);
  const ctxRef = useRef(null);
  const stageRef = useRef(null);
  const runningRef = useRef(false);
  const lastMove = useRef(0);

  const [state, setState] = useState('stopped');
  const [statusMsg, setStatusMsg] = useState('Idle');
  const [url, setUrl] = useState('https://example.com');

  const running = state === 'running';
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
    ws.onopen = () => setStatusMsg('Connected to control server');
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

  return (
    <main style={styles.main}>
      <header style={styles.header}>
        <div style={styles.title}>🖥️ BLD Remote Browser</div>
        <span style={{ ...styles.pill, background: running ? '#1f6f43' : '#5a3a1f' }}>{state}</span>
      </header>

      <div style={styles.controls}>
        <button onClick={start} disabled={running} style={{ ...styles.btn, ...(running ? styles.btnDisabled : styles.btnPrimary) }}>
          Start Browser
        </button>
        <button onClick={stop} disabled={!running} style={{ ...styles.btn, ...(!running ? styles.btnDisabled : styles.btnDanger) }}>
          Stop
        </button>
        <form onSubmit={go} style={styles.urlForm}>
          <input
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://example.com"
            style={styles.urlInput}
          />
          <button type="submit" disabled={!running} style={{ ...styles.btn, ...(!running ? styles.btnDisabled : styles.btnPrimary) }}>
            Go
          </button>
        </form>
      </div>

      <div style={styles.statusBar}>{statusMsg}</div>

      <div ref={stageRef} tabIndex={0} onKeyDown={onKeyDown} style={styles.stage}>
        <canvas
          ref={canvasRef}
          width={VW}
          height={VH}
          onMouseDown={onMouseDown}
          onMouseUp={onMouseUp}
          onMouseMove={onMouseMove}
          onContextMenu={onContextMenu}
          style={styles.canvas}
        />
        {!running && <div style={styles.overlay}>Click “Start Browser” to begin</div>}
      </div>

      <p style={styles.hint}>
        Click the screen to focus it, then click / scroll / type — input is sent to the headless browser.
      </p>
    </main>
  );
}

const styles = {
  main: { maxWidth: 1320, margin: '0 auto', padding: 16 },
  header: { display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 },
  title: { fontSize: 20, fontWeight: 700 },
  pill: { padding: '2px 10px', borderRadius: 999, fontSize: 12, textTransform: 'uppercase', letterSpacing: 0.5 },
  controls: { display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 8 },
  urlForm: { display: 'flex', gap: 8, flex: 1, minWidth: 280 },
  urlInput: { flex: 1, padding: '8px 10px', borderRadius: 8, border: '1px solid #30363d', background: '#0d1117', color: '#e6edf3' },
  btn: { padding: '8px 14px', borderRadius: 8, border: 'none', cursor: 'pointer', fontWeight: 600, color: '#fff' },
  btnPrimary: { background: '#2563eb' },
  btnDanger: { background: '#b91c1c' },
  btnDisabled: { background: '#30363d', cursor: 'not-allowed', color: '#8b949e' },
  statusBar: { fontSize: 13, color: '#8b949e', marginBottom: 8, minHeight: 18 },
  stage: {
    position: 'relative',
    width: '100%',
    aspectRatio: `${VW} / ${VH}`,
    border: '1px solid #30363d',
    borderRadius: 10,
    overflow: 'hidden',
    background: '#000',
    outline: 'none',
  },
  canvas: { width: '100%', height: '100%', display: 'block', cursor: 'crosshair' },
  overlay: {
    position: 'absolute',
    inset: 0,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    color: '#8b949e',
    fontSize: 16,
    pointerEvents: 'none',
  },
  hint: { fontSize: 12, color: '#6e7681', marginTop: 8 },
};
