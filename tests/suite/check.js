/* corruption-recovery invariant checks (scenario injected by runner as window.__scenario) */
await __test('state shape after ' + window.__scenario.name, async () => {
  const s = L.state;
  __assert(s && typeof s === 'object', 'state not object');
  __assert(Array.isArray(s.finance), 'finance not array');
  __assert(Array.isArray(s.directives), 'directives not array');
  __assert(Array.isArray(s.habits), 'habits not array');
  __assert(Array.isArray(s.plan), 'plan not array');
  __assert(Array.isArray(s.records), 'records not array');
  __assert(s.metrics && typeof s.metrics === 'object' && !Array.isArray(s.metrics.history), 'metrics.history not a map');
  __assert(s.seqs && typeof s.seqs === 'object', 'seqs missing');
  if (window.__scenario.expect === 'seed') __assert(s.finance.length > 0, 'seed should have data');
  if (window.__scenario.expect === 'empty') __eq(s.finance.length, 0, 'expected empty ledger');
  if (window.__scenario.expect === 'huge') __eq(s.finance.length, 2000, 'bulk lost: ' + s.finance.length);
  __assert(!s.finance.some((f) => f && typeof f.amount === 'number' && f.amount !== f.amount), 'NaN amounts survived normalize');
  __assert(!s.finance.some((f) => f && typeof f.amount === 'number' && f.amount < 0), 'negative amounts survived normalize');
});

await __test('renders cleanly after ' + window.__scenario.name, async () => {
  await L.go('briefing');
  await sleep(60);
  const bad = [];
  document.querySelectorAll('td, .chip, .stat, .ref, .val, .n').forEach((el) => {
    if (/NaN|undefined|\[object/.test(el.textContent)) bad.push(el.textContent.trim().slice(0, 80));
  });
  __assert(bad.length === 0, 'dirty render: ' + bad.join(' | '));
  __assert(document.body.innerText.length > 400, 'page too sparse');
});

await __test('every department view renders after ' + window.__scenario.name, async () => {
  for (const v of VIEWS) {
    await L.go(v);
    await sleep(30);
    const n = document.body.innerText.length;
    __assert(n > 400, v + ' too sparse (' + n + ')');
    const dirty = /NaN|undefined/.test(document.body.innerText);
    __assert(!dirty, v + ' view renders NaN/undefined');
  }
});

await __test('state survives a second save (' + window.__scenario.name + ')', async () => {
  L.save();
  const raw = localStorage.getItem(K);
  __assert(raw && raw.length > 2, 'nothing persisted');
  const back = JSON.parse(raw);
  __assert(back && typeof back === 'object', 'round-trip not an object');
  __eq(back.finance.length, L.state.finance.length, 'round-trip length mismatch');
});
