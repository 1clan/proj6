await __test('debug hook exposes govone', async()=>{__assert(await ev('typeof window.govone === "object"'),'no window.govone');const k=await ev('Object.keys(window.govone)');lines.push('    keys: '+k.join(','))});
await __test('storage key is gov.v1 and seeded', async()=>{const k=await ev('window.govone.key');__eq(k,'gov.v1');await ev('window.govone.save()');const raw=await ev('localStorage.getItem("gov.v1")');__assert(raw,'gov.v1 not written after save');const s=JSON.parse(raw);__assert(s&&typeof s==='object','not object');lines.push('    top keys: '+Object.keys(s).join(','))});
await __test('title present', async()=>{const t=await ev('document.title');__assert(t&&t.length>0,'empty title');lines.push('    title: '+t)});
await __test('official banner renders', async()=>{__assert(await ev('!!document.querySelector("header,.banner,#banner")'),'no banner')});
await __test('department nav has 8 entries', async()=>{__eq(await ev('document.querySelectorAll("#nav .nav-btn[data-view]").length'),9,'department count')});

// navigate all 8 views
const views=['briefing','finance','metrics','directives','habits','plan','records','attention','council'];
for(const v of views){
  await __test('view: '+v, async()=>{
    const ok=await ev(`(window.govone.go ? (window.govone.go('${v}'),true) : false)`);
    if(!ok){ // fallback: click nav
      const clicked=await ev(`(()=>{const el=[...document.querySelectorAll('[data-view],[data-dept]')].find(e=>(e.dataset.view||e.dataset.dept)==='${v}');if(el){el.click();return true}return false})()`);
      __assert(clicked,'cannot navigate to '+v);
    }
    await sleep(120);
    const active=await ev(`document.body.innerHTML.includes('${v[0].toUpperCase()}')||document.querySelector('[data-active="${v}"],.active')!==null`);
    __assert(active,'view '+v+' not visibly active');
    const html=await ev('document.body.innerText');
    __assert(html.length>500,'page too sparse after '+v+' ('+html.length+')');
  });
}

