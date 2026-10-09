#!/usr/bin/env node
/**
 * GovOne test runner
 * Drives headless Chrome over the DevTools protocol. No npm dependencies.
 *
 *   node tests/run.mjs
 *
 * Phases:
 *   1. smoke   — debug hook, seed, all 8 departments render, keyboard nav
 *   2. deep    — finance lifecycle, metrics grades, persistence round-trip
 *   3. recovery— corrupted localStorage scenarios
 *   4. final   — reload smoke after scenarios
 */
import { spawn } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const HTTP_PORT = 8178;
const CDP_PORT = 9378;
const BASE = `http://127.0.0.1:${HTTP_PORT}/?debug=1`;
const CHROME = process.env.CHROME || '/usr/bin/google-chrome';
const KEY = 'gov.v1';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript', '.css': 'text/css', '.md': 'text/plain' };

const server = createServer(async (req, res) => {
  try {
    const p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    const rel = p === '/' ? 'index.html' : p.slice(1);
    const file = path.resolve(ROOT, rel);
    if (file !== ROOT && !file.startsWith(ROOT + path.sep)) { res.writeHead(403); return res.end(); }
    const data = await readFile(file);
    res.writeHead(200, { 'content-type': MIME[path.extname(file)] || 'application/octet-stream' });
    res.end(data);
  } catch {
    res.writeHead(404); res.end('404');
  }
});

/* ---------------- CDP client ---------------- */
let ws, msgId = 0;
const pending = new Map();
const pageErrors = [];
let loadResolver = null;

function send(method, params = {}) {
  const id = ++msgId;
  return new Promise((res, rej) => {
    const to = setTimeout(() => { pending.delete(id); rej(new Error('CDP timeout: ' + method)); }, 60000);
    pending.set(id, { res: (v) => { clearTimeout(to); res(v); }, rej: (e) => { clearTimeout(to); rej(e); } });
    ws.send(JSON.stringify({ id, method, params }));
  });
}

async function evaluate(expr, awaitPromise = true) {
  const r = await send('Runtime.evaluate', { expression: expr, awaitPromise, returnByValue: true });
  if (r.exceptionDetails) {
    const d = r.exceptionDetails.exception?.description || r.exceptionDetails.text;
    throw new Error('page error: ' + d);
  }
  return r.result.value;
}

async function goto(url) {
  const loaded = new Promise((res) => { loadResolver = res; });
  await send('Page.navigate', { url });
  await Promise.race([loaded, sleep(10000).then(() => { throw new Error('navigation timeout'); })]);
  await sleep(250);
  for (let i = 0; i < 50; i++) {
    try { if ((await evaluate('1+1', false)) === 2) return; } catch { /* context not ready */ }
    await sleep(100);
  }
  throw new Error('execution context never became ready');
}

/* ---------------- page-side test harness ---------------- */
const HDR = `
window.__T = {pass:0, fail:0, lines:[]};
window.__assert = (c, m) => { if (!c) throw new Error(m || 'assertion failed'); };
window.__eq = (a, b, m) => {
  const A = JSON.stringify(a), B = JSON.stringify(b);
  if (A !== B) throw new Error((m || 'not equal') + '\\n   got:  ' + A + '\\n   want: ' + B);
};
window.__test = async (name, fn) => {
  try { await fn(); window.__T.pass++; window.__T.lines.push('  PASS  ' + name); }
  catch (e) { window.__T.fail++; window.__T.lines.push('  FAIL  ' + name + '\\n        ' + String(e && e.message).split('\\n').join('\\n        ')); }
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const L = window.govone;
const K = window.govone.key;
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => Array.from((r || document).querySelectorAll(s));
const clone = (o) => JSON.parse(JSON.stringify(o));
const money = (n) => (n < 0 ? '\\u2212' : '') + '$' + Math.abs(Math.round(n)).toLocaleString('en-US');
const bal = () => L.state.finance.reduce((a, f) => a + (f.status === 'passed' ? (f.kind === 'revenue' ? f.amount : -f.amount) : 0), 0);
const VIEWS = ['briefing', 'finance', 'metrics', 'directives', 'habits', 'plan', 'records', 'attention'];
const ev = (x) => eval(x);
const lines = window.__T.lines;
`;

async function runSuite(src, scenario) {
  const scenarioLine = scenario ? `window.__scenario = ${JSON.stringify(scenario)};\n` : '';
  const expr = `(async () => {\n${HDR}${scenarioLine}${src}\n; return { t: window.__T }; })()`;
  return evaluate(expr);
}

const SMOKE = await readFile(path.join(import.meta.dirname, 'suite', 'smoke.js'), 'utf8');
const DEEP = await readFile(path.join(import.meta.dirname, 'suite', 'deep.js'), 'utf8');
const CHECK = await readFile(path.join(import.meta.dirname, 'suite', 'check.js'), 'utf8');

/* ---------------- corruption scenarios ---------------- */
const SCENARIOS = [
  { name: 'garbage-text', expect: 'seed', raw: '@@@ this is not json {{{' },
  { name: 'truncated-json', expect: 'seed', raw: '{"finance":[{"id":"a"' },
  { name: 'json-array', expect: 'seed', raw: '[1,2,3]' },
  { name: 'json-string', expect: 'seed', raw: '"just a string"' },
  { name: 'json-number', expect: 'seed', raw: '42' },
  { name: 'json-null', expect: 'seed', raw: 'null' },
  { name: 'missing-keys', expect: 'seed', raw: '{"foo":1,"bar":true}' },
  { name: 'mega-garbage', expect: 'seed', raw: '{"x":"' + 'y'.repeat(1000000) },
  {
    name: 'empty-valid',
    expect: 'empty',
    raw: JSON.stringify({ finance: [], directives: [], habits: [], plan: [], records: [], metrics: { history: {} }, seqs: {} })
  },
  {
    name: 'malformed-entities',
    expect: 'kept',
    raw: JSON.stringify({
      finance: [null, { amount: 'x' }, { ref: 42, status: 'weird' }, { title: 'ok', amount: 50, kind: 'revenue', status: 'passed' }],
      directives: [{}, { title: 42 }, { title: 'fine', status: 'pending' }],
      habits: [{}, { name: 2 }, { name: 'good', days: 'nope' }],
      plan: [null, { target: 'x' }, { title: 'ok', target: 10, current: 5 }],
      records: [null, { text: 42 }, { text: 'fine' }],
      metrics: { history: [null, { x: 1 }, 'bad'] },
      seqs: { DFIN: 'NaN', DMTR: -3 }
    })
  },
  {
    name: 'huge-valid',
    expect: 'huge',
    raw: JSON.stringify({
      finance: Array.from({ length: 2000 }, (_, i) => ({ id: 'f' + i, ref: 'DFIN-2026-' + String(i).padStart(4, '0'), title: 'Bulk ' + i, amount: i, kind: i % 2 ? 'revenue' : 'appropriation', category: 'Other', status: ['issued', 'passed', 'withdrawn'][i % 3], ts: 1700000000000 + i })),
      directives: Array.from({ length: 200 }, (_, i) => ({ id: 'd' + i, title: 'Directive ' + i, status: 'pending' })),
      habits: Array.from({ length: 60 }, (_, i) => ({ id: 'h' + i, name: 'Habit ' + i, days: { '2026-01-05': true } })),
      metrics: { history: Object.fromEntries(Array.from({ length: 400 }, (_, i) => ['2026-01-' + String((i % 28) + 1).padStart(2, '0'), i % 101])) },
      seqs: { DFIN: 2000 }
    })
  }
];

/* ---------------- main ---------------- */
let cleanup = () => {};

async function main() {
  await new Promise((r) => server.listen(HTTP_PORT, '127.0.0.1', r));
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'govone-profile-'));
  const chrome = spawn(CHROME, [
    '--headless=new', '--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage',
    '--mute-audio', '--hide-scrollbars', '--window-size=1440,1000',
    `--remote-debugging-port=${CDP_PORT}`, `--user-data-dir=${profile}`,
    '--force-device-scale-factor=1', BASE
  ], { stdio: 'ignore' });

  cleanup = () => {
    try { chrome.kill('SIGKILL'); } catch {}
    try { fs.rmSync(profile, { recursive: true, force: true }); } catch {}
    try { server.close(); } catch {}
  };
  process.on('exit', cleanup);
  process.on('SIGINT', () => { cleanup(); process.exit(130); });

  let target = null;
  for (let i = 0; i < 80 && !target; i++) {
    await sleep(250);
    try {
      const list = await (await fetch(`http://127.0.0.1:${CDP_PORT}/json/list`)).json();
      target = list.find((t) => t.type === 'page');
    } catch { /* not up yet */ }
  }
  if (!target) throw new Error('Chrome DevTools endpoint never came up');

  ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = () => rej(new Error('ws connect failed')); });
  ws.onmessage = (ev) => {
    const m = JSON.parse(ev.data);
    if (m.id) {
      const p = pending.get(m.id);
      if (!p) return;
      pending.delete(m.id);
      m.error ? p.rej(new Error(m.error.message)) : p.res(m.result);
      return;
    }
    if (m.method === 'Page.loadEventFired' && loadResolver) { const r = loadResolver; loadResolver = null; r(); }
    if (m.method === 'Runtime.exceptionThrown') {
      const d = m.params.exceptionDetails;
      pageErrors.push('uncaught: ' + (d.exception?.description || d.text));
    }
    if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') {
      pageErrors.push('console.error: ' + m.params.args.map((a) => a.value ?? a.description ?? '').join(' '));
    }
  };

  await send('Page.enable');
  await send('Runtime.enable');

  const report = [];
  const collect = (phase, res) => { report.push({ phase, ...res }); };

  console.log('\n── phase 1: smoke ─────────────────────────────────────────');
  await goto(BASE);
  collect('smoke', await runSuite(SMOKE));

  console.log('── phase 2: deep functional ──────────────────────────────');
  await goto(BASE);
  collect('deep', await runSuite(DEEP));

  console.log('── phase 2b: persistence round-trip ──────────────────────');
  await goto(BASE);
  await evaluate(`(() => {
    const s = JSON.parse(JSON.stringify(window.govone.state));
    s.finance.push({ id: 'p1', ref: 'DFIN-2026-0999', kind: 'revenue', category: 'Income',
      title: 'PERSIST-CANARY', amount: 42, status: 'passed', ts: Date.now(), passedTs: Date.now() });
    window.govone.replace(s);
    return 'ok';
  })()`, false);
  await goto(BASE);
  collect('persistence', await runSuite(`await __test('canary survives reload', async () => {
    __assert(L.state.finance.some((f) => f.title === 'PERSIST-CANARY'), 'canary lost after reload');
    __assert(L.state.finance.some((f) => f.ref === 'DFIN-2026-0999'), 'ref lost after reload');
    await L.go('finance');
    await sleep(80);
    __assert(document.body.innerText.includes('PERSIST-CANARY'), 'canary not rendered after reload');
  });`));

  console.log('── phase 3: corrupted localStorage recovery ──────────────');
  for (const sc of SCENARIOS) {
    await evaluate(`localStorage.setItem(${JSON.stringify(KEY)}, ${JSON.stringify(sc.raw)}); 'ok'`, false);
    await goto(BASE);
    collect('scenario:' + sc.name, await runSuite(CHECK, sc));
  }

  console.log('── phase 4: cleared storage reseeds, then final smoke ────');
  await evaluate('localStorage.removeItem("gov.v1"); "ok"', false);
  await goto(BASE);
  collect('reseed', await runSuite(CHECK, { name: 'reseed', expect: 'seed' }));
  await goto(BASE);
  collect('final', await runSuite(SMOKE));

  /* ---------------- results ---------------- */
  let pass = 0, fail = 0;
  console.log('\n══════════════════ RESULTS ══════════════════');
  for (const r of report) {
    const t = r.t;
    pass += t.pass; fail += t.fail;
    console.log(`\n▸ ${r.phase}  (${t.pass} passed, ${t.fail} failed)`);
    for (const line of t.lines) if (line.includes('FAIL')) console.log(line);
    if (t.fail === 0) console.log('  all green');
  }

  console.log('\n══════════════════ SUMMARY ══════════════════');
  console.log(`tests passed : ${pass}`);
  console.log(`tests failed : ${fail}`);
  console.log(`page errors  : ${pageErrors.length}`);
  for (const e of [...new Set(pageErrors)]) console.log('   ! ' + e);
  console.log(fail === 0 && pageErrors.length === 0 ? '\n✓ ALL TESTS PASSED\n' : '\n✗ TESTS FAILED\n');

  cleanup();
  process.exit(fail === 0 && pageErrors.length === 0 ? 0 : 1);
}

main().catch((e) => { console.error('\nRUNNER ERROR:', e.message); try { cleanup(); } catch {} process.exit(2); });
