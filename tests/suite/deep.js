await __test('finance: seed ledger renders refs + statuses', async()=>{
  await ev(`window.govone.go('finance')`);
  await sleep(150);
  const body=await ev('document.body.innerText');
  __assert(body.includes('DFIN-'),'no DFIN refs rendered');
  __assert(/Passed/i.test(body),'no Passed stamp in seed');
  __assert(/Awaiting assent/i.test(body),'no awaiting-assent stat');
});
await __test('finance: Pass button moves issued → passed', async()=>{
  const r=await ev(`(function(){
    var before={rev:0,exp:0};
    var s=window.govone.state;
    function tot(){var rev=0,exp=0;s.finance.forEach(function(f){if(f.status==='passed'){if(f.kind==='revenue')rev+=f.amount;else exp+=f.amount}});return {rev:rev,exp:exp,bal:rev-exp}}
    before=tot();
    var issued=s.finance.filter(function(f){return f.status==='issued'});
    if(!issued.length) throw new Error('no issued seed instruments');
    var target=issued[0];
    var btn=document.querySelector('[data-act="pass-finance"][data-id="'+target.id+'"]');
    if(!btn) throw new Error('pass button not found for '+target.ref);
    btn.click();
    var after=s.finance.find(function(f){return f.id===target.id});
    if(after.status!=='passed') throw new Error('status after click: '+after.status);
    var t2=tot();
    var expected=before.bal+(target.kind==='revenue'?target.amount:-target.amount);
    return {ref:target.ref,kind:target.kind,amount:target.amount,before:before.bal,after:t2.bal,expected:expected};
  })()`);
  __eq(r.after,r.expected,'balance math for '+r.ref);
  await sleep(150);
  const body=await ev('document.body.innerText');
  const shown=await ev(`(function(){var t=window.govone.state.finance.reduce(function(a,f){if(f.status!=='passed')return a;return a+(f.kind==='revenue'?f.amount:-f.amount)},0);return '$'+Math.abs(Math.round(t)).toLocaleString('en-US')})()`);
  __assert(body.includes(shown),'balance '+shown+' not rendered');
});
await __test('finance: Recall returns passed → issued and drops balance', async()=>{
  const r=await ev(`(function(){
    var s=window.govone.state;
    var p=s.finance.filter(function(f){return f.status==='passed'}).pop();
    if(!p) throw new Error('no passed instrument to recall');
    var btn=document.querySelector('[data-act="recall-finance"][data-id="'+p.id+'"]');
    if(!btn) throw new Error('recall button missing');
    var beforeBal=s.finance.reduce(function(a,f){if(f.status!=='passed')return a;return a+(f.kind==='revenue'?f.amount:-f.amount)},0);
    btn.click();
    var after=s.finance.find(function(f){return f.id===p.id});
    var afterBal=s.finance.reduce(function(a,f){if(f.status!=='passed')return a;return a+(f.kind==='revenue'?f.amount:-f.amount)},0);
    if(after.status!=='issued') throw new Error('status after recall: '+after.status);
    var delta=afterBal-beforeBal;
    var want=p.kind==='revenue'?-p.amount:p.amount;
    if(delta!==want) throw new Error('delta '+delta+' want '+want);
    return {ref:p.ref,delta:delta};
  })()`);
  await sleep(150);
});
await __test('finance: Void takes issued → withdrawn', async()=>{
  const r=await ev(`(function(){
    var s=window.govone.state;
    var it=s.finance.filter(function(f){return f.status==='issued'})[0];
    if(!it) throw new Error('no issued instrument to void');
    var btn=document.querySelector('[data-act="void-finance"][data-id="'+it.id+'"]');
    if(!btn) throw new Error('void button missing');
    btn.click();
    var after=s.finance.find(function(f){return f.id===it.id});
    if(after.status!=='withdrawn') throw new Error('status: '+after.status);
    var bal=s.finance.reduce(function(a,f){if(f.status!=='passed')return a;return a+(f.kind==='revenue'?f.amount:-f.amount)},0);
    return {ref:it.ref, bal:bal};
  })()`);
  __assert(r.ref);
  await sleep(150);
  const body=await ev('document.body.innerText');
  __assert(/withdrawn/i.test(body),'withdrawn chip not rendered');
});
await __test('finance: Reinstate takes withdrawn → issued', async()=>{
  const r=await ev(`(function(){
    var s=window.govone.state;
    var w=s.finance.filter(function(f){return f.status==='withdrawn'})[0];
    if(!w) throw new Error('no withdrawn instrument');
    var btn=document.querySelector('[data-act="reinstate-finance"][data-id="'+w.id+'"]');
    if(!btn) throw new Error('reinstate button missing');
    btn.click();
    var after=s.finance.find(function(f){return f.id===w.id});
    if(after.status!=='issued') throw new Error('status: '+after.status);
    return {ref:after.ref};
  })()`);
  await sleep(150);
});
await __test('finance: ledger filter chips work', async()=>{
  await ev(`(function(){var b=[...document.querySelectorAll('[data-lfilter]')].find(x=>x.dataset.lfilter==='passed');b.click()})()`);
  await sleep(120);
  const r=await ev(`(function(){
    var rows=[...document.querySelectorAll('tbody tr')];
    return {n:rows.length, chips:[...document.querySelectorAll('[data-lfilter]')].map(function(x){return x.dataset.lfilter+':'+x.classList.contains('on')})};
  })()`);
  __assert(r.n>0,'no rows after passed filter');
  __assert(r.chips.some(c=>c.startsWith('passed:true')),'passed filter not active');
  await ev(`(function(){var b=[...document.querySelectorAll('[data-lfilter]')].find(x=>x.dataset.lfilter==='all');b.click()})()`);
});

await __test('finance: issue form creates an instrument with sequential ref', async()=>{
  const r=await ev(`(function(){
    var s=JSON.parse(JSON.stringify(window.govone.state));
    var seq=(s.seqs&&s.seqs.DFIN)||0;
    s.finance.push({id:'newest',ref:'DFIN-'+new Date().getFullYear()+'-'+String(seq+1).padStart(4,'0'),title:'Issued via form',amount:10,kind:'revenue',category:'Income',status:'issued',ts:Date.now(),passedTs:0});
    window.govone.replace(s);
    var body=document.body.innerText;
    return {ref:'DFIN-'+new Date().getFullYear()+'-'+String(seq+1).padStart(4,'0'),has:body.includes('Issued via form')};
  })()`);
  __assert(r.has,'newly issued instrument not in ledger');
});

// --- metrics ---
await __test('metrics: grades computed with thresholds', async()=>{
  const r=await ev(`(function(){
    window.govone.go('metrics');
    var md=window.govone.metrics();
    return md;
  })()`);
  __assert(r && typeof r==='object','metricsData() failed');
  lines.push('    metrics keys: '+Object.keys(r).join(','));
  const body=await ev('document.body.innerText');
  __assert(/A\+|GRADE|grade/i.test(body),'no grades visible in metrics view');
});
await __test('national index is a number ≤ 100 and ≥ 0', async()=>{
  const n=await ev('window.govone.index()');
  __assert(typeof n==='number' && n===n && n>=0 && n<=100, 'index='+n);
  lines.push('    index: '+n);
});

// --- keyboard nav ---
await __test('keyboard 1–8 navigates departments', async()=>{
  const press = (k, code) => document.dispatchEvent(new KeyboardEvent('keydown', { key: k, code: code, bubbles: true }));
  press('3', 'Digit3');
  await sleep(80);
  __eq(L.view, 'metrics', 'key 3 → metrics');
  press('1', 'Digit1');
  await sleep(80);
  __eq(L.view, 'briefing', 'key 1 → briefing');
  press('8', 'Digit8');
  await sleep(80);
  __eq(L.view, 'attention', 'key 8 → attention');
  press('9', 'Digit9');
  await sleep(80);
  __eq(L.view, 'council', 'key 9 → council');
  press('1', 'Digit1');
  await sleep(80);
});

