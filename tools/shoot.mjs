// shoot.mjs — playtests Kestrel Run in headless Chrome over CDP and takes
// screenshots. Usage:
//   node tools/shoot.mjs shot <name> [out.png]   — ?shot=<name> scene
//   node tools/shoot.mjs play [out.png]          — real play: takeoff, fly, land
// Requires the dev server on http://localhost:8081 (node serve.ts 8081).
import { execFile, spawn } from 'node:child_process';
import { writeFileSync } from 'node:fs';

const CHROME = `${process.env.HOME}/.cache/ms-playwright/chromium-1255/chrome-linux64/chrome`;
const PORT = 9223;
const BASE = 'http://localhost:8081';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function launch() {
  const proc = spawn(CHROME, [
    '--headless=new', '--no-sandbox', '--use-angle=swiftshader', '--disable-gpu-sandbox',
    // Window 920 high: this headless build reserves 200 px, leaving a 1280x720 viewport.
    `--remote-debugging-port=${PORT}`, '--window-size=1280,920', 'about:blank',
  ], { stdio: 'ignore' });
  for (let i = 0; i < 40; i++) {
    try {
      const res = await fetch(`http://localhost:${PORT}/json/version`);
      if (res.ok) return proc;
    } catch { /* not up yet */ }
    await sleep(500);
  }
  throw new Error('chrome did not start');
}

async function connect() {
  const targets = await (await fetch(`http://localhost:${PORT}/json/list`)).json();
  const page = targets.find((t) => t.type === 'page');
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
  let id = 0;
  const pending = new Map();
  const events = [];
  ws.onmessage = (m) => {
    const msg = JSON.parse(m.data);
    if (msg.id && pending.has(msg.id)) { pending.get(msg.id)(msg); pending.delete(msg.id); }
    else if (msg.method) events.push(msg);
  };
  async function send(method, params = {}) {
    const mid = ++id;
    ws.send(JSON.stringify({ id: mid, method, params }));
    return new Promise((res) => pending.set(mid, res));
  }
  return { send, events, ws };
}

async function shot(name, out) {
  const proc = await launch();
  try {
    const { send } = await connect();
    await send('Page.enable');
    await send('Runtime.enable');
    await send('Page.navigate', { url: `${BASE}/?shot=${name}` });
    await sleep(9000);
    const res = await send('Page.captureScreenshot', { format: 'jpeg', quality: 80 });
    writeFileSync(out, Buffer.from(res.result.data, 'base64'));
    console.log('saved', out);
  } finally { proc.kill(); }
}

async function key(send, type, code, key, ms = 0) {
  await send('Input.dispatchKeyEvent', { type, code, key, windowsVirtualKeyCode: 0 });
  if (ms) await sleep(ms);
}
async function holdKey(send, code, key, ms) {
  await send('Input.dispatchKeyEvent', { type: 'keyDown', code, key });
  await sleep(ms);
  await send('Input.dispatchKeyEvent', { type: 'keyUp', code, key });
}

async function play(out) {
  const proc = await launch();
  try {
    const { send, events } = await connect();
    await send('Page.enable');
    await send('Runtime.enable');
    await send('Page.navigate', { url: `${BASE}/` });
    await sleep(6000);
    const evalJs = async (expr) => {
      const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true });
      return r.result?.result?.value;
    };
    const state = async () => evalJs(`JSON.stringify({alt: document.getElementById('hud-alt').textContent, spd: document.getElementById('hud-spd').textContent, hdg: document.getElementById('hud-hdg').textContent, fuel: document.getElementById('hud-fuel-num').textContent, obj: document.getElementById('hud-objective').textContent, prog: document.getElementById('hud-progress').textContent, win: !document.getElementById('screen-win').classList.contains('hidden'), over: !document.getElementById('screen-over').classList.contains('hidden'), title: !document.getElementById('screen-title').classList.contains('hidden')})`);
    // Title screen -> pick Ring Run with key 1.
    await key(send, 'keyDown', 'Digit1', '1');
    await key(send, 'keyUp', 'Digit1', '1');
    await sleep(1000);
    console.log('after mission pick:', await state());
    // Spool throttle with Shift held ~4s.
    await send('Input.dispatchKeyEvent', { type: 'keyDown', code: 'ShiftLeft', key: 'Shift' });
    await sleep(4000);
    await send('Input.dispatchKeyEvent', { type: 'keyUp', code: 'ShiftLeft', key: 'Shift' });
    console.log('after spool:', await state());
    // Rotate: hold ArrowDown (pull back) ~2.5s.
    await holdKey(send, 'ArrowDown', 'ArrowDown', 2500);
    await sleep(1500);
    console.log('after rotation:', await state());
    // Fly level ~6s, gentle right bank.
    await send('Input.dispatchKeyEvent', { type: 'keyDown', code: 'ArrowRight', key: 'ArrowRight' });
    await sleep(2500);
    await send('Input.dispatchKeyEvent', { type: 'keyUp', code: 'ArrowRight', key: 'ArrowRight' });
    await sleep(3500);
    console.log('mid-flight:', await state());
    const res = await send('Page.captureScreenshot', { format: 'jpeg', quality: 80 });
    writeFileSync(out, Buffer.from(res.result.data, 'base64'));
    console.log('saved', out);
    const errors = events.filter((e) => e.method === 'Runtime.exceptionThrown' || (e.method === 'Log.entryAdded' && e.params?.entry?.level === 'error'));
    console.log('page errors:', errors.length);
    for (const e of errors.slice(0, 5)) console.log(JSON.stringify(e.params).slice(0, 300));
  } finally { proc.kill(); }
}

async function parked(out) {
  const proc = await launch();
  try {
    const { send } = await connect();
    await send('Page.enable');
    await send('Page.navigate', { url: `${BASE}/` });
    await sleep(6000);
    await key(send, 'keyDown', 'Digit1', '1');
    await key(send, 'keyUp', 'Digit1', '1');
    await sleep(2500);
    const res = await send('Page.captureScreenshot', { format: 'jpeg', quality: 80 });
    writeFileSync(out, Buffer.from(res.result.data, 'base64'));
    console.log('saved', out);
  } finally { proc.kill(); }
}

const [,, mode, a, b] = process.argv;
if (mode === 'shot') await shot(a, b ?? `/tmp/shot-${a}.jpg`);
else if (mode === 'play') await play(a ?? '/tmp/playtest.jpg');
else if (mode === 'parked') await parked(a ?? '/tmp/parked.jpg');
else { console.log('usage: shoot.mjs shot <name> [out] | shoot.mjs play [out] | shoot.mjs parked [out]'); process.exit(1); }
