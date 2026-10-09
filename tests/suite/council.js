/* City Council — composition, seating, divisions and the Mayor's powers. */
const setCouncil = (parls, wards, motions) => {
  const s = clone(L.state);
  s.council.parliamentarians = parls;
  s.council.wards = wards;
  s.council.motions = motions;
  L.replace(s);
};
const parl = (id, stance, present) => ({ id: id, name: 'Cllr ' + id, faction: 'Independent', portfolio: 'Backbench', stance: stance, present: present !== false });
const motion = (id, status, tally) => ({ id: id, ref: 'DCON-2026-000' + id.slice(1), title: 'Motion ' + id, mover: 'The Mayor', status: status || 'tabled', ts: Date.now(), decisionTs: 0, tally: tally || null });
const submit = (formId, values) => {
  const f = document.getElementById(formId);
  Object.keys(values).forEach((k) => { f.querySelector('#' + k).value = values[k]; });
  f.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
};

await __test('seed council has a mayor, chamber, wards and motions', async () => {
  const c = L.state.council;
  __assert(c && typeof c === 'object', 'no council');
  __assert(c.mayorName && c.city, 'no mayor/city');
  __assert(Array.isArray(c.parliamentarians) && c.parliamentarians.length > 0, 'no parliamentarians');
  __assert(Array.isArray(c.wards) && c.wards.length > 0, 'no ward members');
  __assert(Array.isArray(c.motions) && c.motions.length > 0, 'no motions');
  __assert(c.motions.some((m) => m.status === 'carried'), 'seed lacks a carried motion');
});

await __test('council view renders every chamber panel', async () => {
  L.go('council');
  await sleep(80);
  const txt = document.body.innerText;
  ['Presiding officer', 'Order paper', 'Register of parliamentarians', 'Register of ward members', 'Standing orders'].forEach((h) => {
    __assert(new RegExp(h, 'i').test(txt), 'missing panel: ' + h);
  });
  __eq(document.querySelectorAll('#nav .nav-btn.active').length, 1, 'exactly one active nav item');
  __assert(document.querySelector('#nav .nav-btn.active').dataset.view === 'council', 'council nav not active');
  __assert(!/NaN|undefined/.test(txt), 'council view renders NaN/undefined');
});

await __test('Mayor can set the city and their own name', async () => {
  L.go('council');
  await sleep(50);
  submit('mayorForm', { cityName: 'Aurora', mayorName: 'Mayor Prathamesh' });
  await sleep(50);
  __eq(L.state.council.city, 'Aurora', 'city not set');
  __eq(L.state.council.mayorName, 'Mayor Prathamesh', 'mayor not set');
  __assert(document.body.innerText.includes('Mayor Prathamesh'), 'mayor name not rendered');
  __assert(document.body.innerText.includes('Aurora City Council'), 'city not rendered in the department title');
});

await __test('seating a parliamentarian adds a voting member', async () => {
  L.go('council');
  await sleep(50);
  const before = L.state.council.parliamentarians.length;
  submit('parlForm', { parlName: 'Test Cllr', parlPortfolio: 'Housing' });
  await sleep(50);
  const after = L.state.council.parliamentarians;
  __eq(after.length, before + 1, 'parliamentarian not seated');
  const last = after[after.length - 1];
  __eq(last.name, 'Test Cllr', 'wrong name');
  __eq(last.stance, 'abstain', 'new member should start abstaining');
  __eq(last.present, true, 'new member should be present');
});

await __test('returning a ward member adds a non-voting representative', async () => {
  L.go('council');
  await sleep(50);
  const before = L.state.council.wards.length;
  submit('wardForm', { wardName: 'Test Ward Member', wardSeat: 'Ward 9 — Test' });
  await sleep(50);
  const after = L.state.council.wards;
  __eq(after.length, before + 1, 'ward member not returned');
  __eq(after[after.length - 1].ward, 'Ward 9 — Test', 'ward label lost');
});

await __test('giving way leaves the ward label defaulted', async () => {
  L.go('council');
  await sleep(50);
  submit('wardForm', { wardName: 'No Ward Given', wardSeat: '' });
  await sleep(50);
  const last = L.state.council.wards[L.state.council.wards.length - 1];
  __eq(last.ward, 'Ward unassigned', 'blank ward should default');
});

await __test('parliamentarians can change stance and presence', async () => {
  setCouncil([parl('p1', 'abstain', true)], L.state.council.wards, [motion('m1')]);
  L.go('council');
  await sleep(60);
  document.querySelector('[data-act="parl-stance"][data-id="p1"][data-stance="against"]').click();
  __eq(L.state.council.parliamentarians[0].stance, 'against', 'stance not recorded');
  document.querySelector('[data-act="toggle-present"][data-id="p1"]').click();
  __eq(L.state.council.parliamentarians[0].present, false, 'presence not toggled');
});

await __test('a division carries on a simple majority', async () => {
  setCouncil([parl('p1', 'for', true), parl('p2', 'for', true), parl('p3', 'against', true)], L.state.council.wards, [motion('m1')]);
  L.go('council');
  await sleep(60);
  document.querySelector('[data-act="division"][data-id="m1"]').click();
  await sleep(50);
  const m = L.state.council.motions[0];
  __eq(m.status, 'carried', 'motion not carried');
  __eq(m.tally, { "for": 2, against: 1, abstain: 0 }, 'tally wrong');
  __assert(/carried/i.test(document.body.innerText), 'carried chip not rendered');
  __assert(document.body.innerText.includes('division'), 'division record not rendered');
});

await __test('a division defeats a motion when the chamber is against', async () => {
  setCouncil([parl('p1', 'against', true), parl('p2', 'against', true), parl('p3', 'for', true)], L.state.council.wards, [motion('m1')]);
  L.go('council');
  await sleep(60);
  document.querySelector('[data-act="division"][data-id="m1"]').click();
  await sleep(50);
  __eq(L.state.council.motions[0].status, 'defeated', 'motion should be defeated');
});

await __test('a tie is carried on the Mayor\u2019s casting vote', async () => {
  setCouncil([parl('p1', 'for', true), parl('p2', 'against', true)], L.state.council.wards, [motion('m1')]);
  L.go('council');
  await sleep(60);
  document.querySelector('[data-act="division"][data-id="m1"]').click();
  await sleep(50);
  const m = L.state.council.motions[0];
  __eq(m.status, 'carried', 'tie should fall to the Mayor');
  __eq(m.tally, { "for": 1, against: 1, abstain: 0 }, 'tie tally wrong');
});

await __test('no division may proceed without a quorum', async () => {
  setCouncil([parl('p1', 'for', true), parl('p2', 'for', false), parl('p3', 'for', false), parl('p4', 'for', false)], L.state.council.wards, [motion('m1')]);
  L.go('council');
  await sleep(60);
  document.querySelector('[data-act="division"][data-id="m1"]').click();
  await sleep(50);
  const m = L.state.council.motions[0];
  __eq(m.status, 'tabled', 'motion must remain tabled without quorum');
  __eq(m.tally, null, 'no tally should be recorded without quorum');
});

await __test('the Mayor may veto a carried motion', async () => {
  setCouncil([parl('p1', 'for', true), parl('p2', 'for', true)], L.state.council.wards, [motion('m1', 'carried', { "for": 2, against: 0, abstain: 0 })]);
  L.go('council');
  await sleep(60);
  document.querySelector('[data-act="veto-motion"][data-id="m1"]').click();
  await sleep(50);
  __eq(L.state.council.motions[0].status, 'vetoed', 'motion not vetoed');
  __assert(/vetoed/i.test(document.body.innerText), 'vetoed chip not rendered');
});

await __test('a tabled motion can be withdrawn', async () => {
  setCouncil([parl('p1', 'for', true)], L.state.council.wards, [motion('m1')]);
  L.go('council');
  await sleep(60);
  document.querySelector('[data-act="withdraw-motion"][data-id="m1"]').click();
  await sleep(50);
  __eq(L.state.council.motions[0].status, 'withdrawn', 'motion not withdrawn');
});

await __test('tabling a motion mints a sequential DCON reference', async () => {
  L.go('council');
  await sleep(50);
  const seq = (L.state.seqs && L.state.seqs.DCON) || 0;
  submit('motionForm', { motionTitle: 'Test motion from the form' });
  await sleep(50);
  const m = L.state.council.motions[0];
  __eq(m.title, 'Test motion from the form', 'motion not tabled');
  __eq(m.status, 'tabled', 'new motion should be tabled');
  __eq(m.ref, 'DCON-' + new Date().getFullYear() + '-' + String(seq + 1).padStart(4, '0'), 'reference not sequential');
  __assert(document.body.innerText.includes('Test motion from the form'), 'motion not rendered');
});

await __test('the chamber can be reduced to the Mayor alone', async () => {
  setCouncil([], L.state.council.wards, [motion('m1')]);
  L.go('council');
  await sleep(60);
  __assert(document.body.innerText.includes('No parliamentarians seated'), 'empty chamber not messaged');
  document.querySelector('[data-act="division"][data-id="m1"]').click();
  await sleep(50);
  __eq(L.state.council.motions[0].status, 'carried', 'the sole Mayor should carry a motion');
  __assert(!/NaN|undefined/.test(document.body.innerText), 'empty chamber renders NaN/undefined');
});

await __test('council state survives a save round-trip', async () => {
  L.go('council');
  await sleep(40);
  L.save();
  const back = JSON.parse(localStorage.getItem(K));
  __assert(back.council && Array.isArray(back.council.motions), 'council missing after save');
  __eq(back.council.city, L.state.council.city, 'city not persisted');
});
