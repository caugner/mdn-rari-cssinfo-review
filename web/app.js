import {localeName, relatedPages, changeProfile, compareProfiles, fieldNames, kindNames} from './locales.mjs';
const $ = (q, root = document) => root.querySelector(q);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const defaults = {q:'', locale:'en-us', status:'review', kind:'', field:'', view:'pages', sort:'name', size:'25', page:'1', doc:'', group:'', compare:''};
const labels = {'changed':'Changed', 'unchanged':'Unchanged', 'table-added':'Table added', 'table-removed':'Table removed', 'missing-both':'No tables', 'build-error':'Missing output'};
let data, state, lastSelection = '';
const cache = new Map();
const badge = (label, kind = '') => `<span class="badge ${esc(kind)}">${esc(label)}</span>`;

function readState() {
  const params = new URLSearchParams(location.hash.slice(1));
  const next = {...defaults};
  for (const key of Object.keys(defaults)) if (params.has(key)) next[key] = params.get(key);
  for (const name of ['locale','status','kind','field','view','sort','size']) {
    if (![...$(`[name="${name}"]`).options].some(o => o.value === next[name])) next[name] = defaults[name];
  }
  next.page = String(Math.max(1, Math.min(100000, parseInt(next.page) || 1)));
  return next;
}
function navigate(patch) {
  const next = {...state, ...patch};
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(next)) if (value !== defaults[key]) params.set(key, value);
  const hash = params.toString();
  if (location.hash.slice(1) === hash) render();
  else location.hash = hash;
}
function filteredPages() {
  const query = state.q.toLowerCase();
  return data.pages.filter(p => (!query || `${p.title} ${p.slug} ${p.url}`.toLowerCase().includes(query)) &&
    (!state.locale || p.locale === state.locale) &&
    (state.status === 'all' || (state.status === 'review' ? p.status !== 'unchanged' : state.status === 'diagnostics' ? p.diagnosticCount > 0 : p.status === state.status)) &&
    (!state.kind || p.kinds.includes(state.kind)) && (!state.field || p.fields.includes(state.field)) &&
    (!state.group || p.groups.includes(state.group)));
}
function safeHTML(html) {
  const parsed = new DOMParser().parseFromString(html, 'text/html');
  const allowed = new Set(['A','CODE','EM','STRONG','B','I','SPAN','UL','OL','LI','BR','P','SUB','SUP','DFN','ABBR']);
  function sanitize(node) {
    if (node.nodeType === Node.TEXT_NODE) return esc(node.textContent);
    if (node.nodeType !== Node.ELEMENT_NODE) return '';
    if (['SCRIPT','STYLE','IFRAME','OBJECT'].includes(node.tagName)) return '';
    const inside = [...node.childNodes].map(sanitize).join('');
    if (!allowed.has(node.tagName)) return inside;
    const tag = node.tagName.toLowerCase();
    let attrs = '';
    if (tag === 'a' && node.hasAttribute('href')) {
      try {
        const url = new URL(node.getAttribute('href'), 'https://developer.mozilla.org');
        if (['http:', 'https:'].includes(url.protocol)) attrs = ` href="${esc(url.href)}" target="_blank" rel="noopener noreferrer"`;
      } catch {}
    }
    return `<${tag}${attrs}>${inside}${tag === 'br' ? '' : `</${tag}>`}`;
  }
  return [...parsed.body.childNodes].map(sanitize).join('');
}
function textDiff(a, b) {
  const x = a.split(/(\s+)/), y = b.split(/(\s+)/);
  if (x.length * y.length > 90000) return [`<del>${esc(a)}</del>`, `<ins>${esc(b)}</ins>`];
  const dp = Array.from({length:x.length + 1}, () => new Uint16Array(y.length + 1));
  for (let i=x.length-1;i>=0;i--) for(let j=y.length-1;j>=0;j--) dp[i][j] = x[i] === y[j] ? dp[i+1][j+1]+1 : Math.max(dp[i+1][j],dp[i][j+1]);
  let i=0,j=0,left='',right='';
  while(i<x.length || j<y.length) {
    if(i<x.length && j<y.length && x[i]===y[j]) {left+=esc(x[i++]);right+=esc(y[j++]);}
    else if(i<x.length && (j===y.length || dp[i+1][j]>=dp[i][j+1])) left+=`<del>${esc(x[i++])}</del>`;
    else right+=`<ins>${esc(y[j++])}</ins>`;
  }
  return [left,right];
}
async function getDetail(id) {
  if (!cache.has(id)) cache.set(id, fetch(`data/pages/${id}.json`).then(r => {if(!r.ok) throw Error(`HTTP ${r.status}`); return r.json();}).catch(e=>{cache.delete(id);throw e;}));
  return cache.get(id);
}
function comparison(detail, mode = 'rendered') {
  if (!detail.rows.length) return '<p class="empty">No formal definition rows in either build.</p>';
  return `<table class="comparison"><thead><tr><th>Definition</th><th>Main <span class="empty">/ mdn-data</span></th><th>PR #912 <span class="empty">/ WebRef</span></th></tr></thead><tbody>${detail.rows.map(row=>{
    let a = row.before ? safeHTML(row.before.html) : '<span class="empty">Absent</span>';
    let b = row.after ? safeHTML(row.after.html) : '<span class="empty">Absent</span>';
    if(mode==='text' && row.before && row.after) [a,b]=textDiff(row.before.text,row.after.text);
    return `<tr class="${row.kind}"><th scope="row">${esc(row.label)}${row.kind!=='unchanged'?'<br>'+badge(row.kind,row.kind):''}</th><td class="before ${row.kind!=='unchanged'?'changed':''}">${a}</td><td class="after ${row.kind!=='unchanged'?'changed':''}">${b}</td></tr>`;
  }).join('')}</tbody></table>`;
}
async function localeReview(page, detail, target) {
  const siblings = relatedPages(page, data.pages);
  const english = siblings.find(p => p.locale === 'en-us');
  target.innerHTML = '<h3>This page in other locales</h3><p class="locale-help">Compare affected rows and change types with en-US. Open a locale to inspect its before/after values.</p><div class="locale-options">Loading locales...</div>';
  const options = $('.locale-options', target);
  const comparisonTarget = $('.locale-comparison', target.parentElement);
  const details = new Map([[page.id, detail]]);
  const failures = new Set();
  await Promise.all(siblings.map(async p => {
    try {details.set(p.id, await getDetail(p.id));} catch {failures.add(p.id);}
  }));
  if (!target.isConnected) return;
  const reference = english && details.get(english.id);
  const profile = reference && changeProfile(reference, 'en-us', data.fieldLabels);
  options.replaceChildren();
  const locales = Object.keys(data.manifest.locales).sort((a,b) => a==='en-us'?-1:b==='en-us'?1:a.localeCompare(b));
  for (const locale of locales) {
    const sibling = siblings.find(p => p.locale === locale);
    const button = document.createElement('button');
    button.type = 'button';
    const unavailable = !sibling;
    const failed = sibling && failures.has(sibling.id);
    const active = sibling && (state.doc === page.id && state.compare ? state.compare === locale : page.locale === locale);
    const report = sibling && details.has(sibling.id) && profile
      ? compareProfiles(profile, changeProfile(details.get(sibling.id), locale, data.fieldLabels)) : null;
    const caption = unavailable ? 'Not in snapshot' : failed ? 'Could not load' : locale === 'en-us' ? 'Reference' : report?.label || 'No en-US comparison';
    button.innerHTML = `<strong>${esc(localeName(locale))}</strong><span>${esc(caption)}</span>`;
    button.disabled = unavailable || failed;
    button.setAttribute('aria-pressed', String(Boolean(active)));
    button.onclick = () => navigate({doc:page.id, compare:locale === page.locale ? '' : locale});
    options.append(button);
  }
  const chosen = state.doc === page.id && state.compare ? siblings.find(p => p.locale === state.compare) : null;
  if (!chosen || chosen.id === page.id) {
    if(state.doc === page.id && state.compare) comparisonTarget.textContent = 'This locale is not available for this page in the snapshot.';
    return;
  }
  if (failures.has(chosen.id)) {comparisonTarget.textContent='Could not load this locale. Close and reopen the page to retry.';return;}
  const other = details.get(chosen.id);
  const otherProfile = changeProfile(other, chosen.locale, data.fieldLabels);
  const report = profile && compareProfiles(profile, otherProfile);
  comparisonTarget.innerHTML = `<h3>${esc(localeName(chosen.locale))}: main → PR ${badge(labels[chosen.status],chosen.status)}</h3>${report ? `<p class="locale-verdict">${esc(report.label)} relative to en-US</p>${report.rows.length ? `<table class="change-matrix"><thead><tr><th>Definition</th><th>en-US</th><th>${esc(localeName(chosen.locale))}</th></tr></thead><tbody>${report.rows.map(row=>`<tr class="${row.same?'':'different'}"><th scope="row">${esc(fieldNames[row.field] || row.field)}</th><td>${esc(kindNames[row.reference] || row.reference)}</td><td>${esc(kindNames[row.locale] || row.locale)}</td></tr>`).join('')}</tbody></table>`:''}` : '<p>No en-US table is available for comparison.</p>'}<div class="detail-links"><a href="https://developer.mozilla.org${esc(chosen.url)}" target="_blank" rel="noopener">${esc(localeName(chosen.locale))} MDN page ↗</a><button class="locale-mode">Show text diff</button></div><div class="locale-table">${comparison(other)}</div><details class="source-diff"><summary>${esc(localeName(chosen.locale))} HTML source diff</summary><pre>${esc(other.diff || 'No HTML differences.')}</pre></details><details class="source-diff"><summary>${esc(localeName(chosen.locale))} macro diagnostics</summary><pre>${esc(JSON.stringify(other.diagnostics || {},null,2))}</pre></details>`;
  let mode = 'rendered';
  $('.locale-mode',comparisonTarget).onclick = e => {
    mode = mode === 'rendered' ? 'text' : 'rendered';
    $('.locale-table',comparisonTarget).innerHTML = comparison(other,mode);
    e.target.textContent = mode === 'rendered' ? 'Show text diff' : 'Show rendered values';
  };
}

function card(p, open = false) {
  const el = document.createElement('details');
  el.className='page'; el.dataset.id=p.id;
  el.innerHTML=`<summary><span class="page-name"><strong>${esc(p.title)}</strong><span class="slug">${esc(p.slug)}</span></span>${badge(localeName(p.locale))}${badge(labels[p.status],p.status)}</summary><div class="detail">Loading table...</div>`;
  let loaded=false;
  el.addEventListener('toggle',async()=>{
    if(!el.open || loaded) return;
    loaded=true;
    const target=$('.detail',el);
    try {
      const detail=await getDetail(p.id);
      const [repo,...path]=p.source.split('/');
      const sha=data.manifest.pins.revisions[repo];
      const source=`https://github.com/mdn/${repo}/blob/${sha}/${path.map(encodeURIComponent).join('/')}`;
      const history=`https://github.com/mdn/${repo}/commits/${sha}/${path.map(encodeURIComponent).join('/')}`;
      target.innerHTML=`<div class="detail-links"><a href="https://developer.mozilla.org${esc(p.url)}" target="_blank" rel="noopener">MDN page ↗</a><a href="${source}" target="_blank" rel="noopener">Pinned source ↗</a><a href="${history}" target="_blank" rel="noopener">Contributors / history ↗</a><button class="permalink">Link to this page</button><button class="mode">Show text diff</button></div>${['build-error','missing-both','table-removed'].includes(p.status)?`<div class="notice">${p.status==='build-error'?'A matched source page has no build output.':p.status==='missing-both'?'This source contains the macro, but neither build produced a formal definition table.':'The PR build no longer produces a formal definition table for this page.'} Inspect the diagnostics below.</div>`:''}<div class="locale-review"></div><h3>${esc(localeName(p.locale))}: main → PR</h3><div class="table-area">${comparison(detail)}</div><div class="locale-comparison"></div><details class="source-diff"><summary>HTML source diff</summary><pre>${esc(detail.diff || 'No HTML differences.')}</pre></details><details class="source-diff"><summary>Macro diagnostics (main / PR)</summary><pre>${esc(JSON.stringify(detail.diagnostics || {},null,2))}</pre></details>`;
      localeReview(p, detail, $('.locale-review',target));
      $('.permalink',target).onclick=()=>navigate({doc:p.id});
      let mode='rendered';
      $('.mode',target).onclick=e=>{mode=mode==='rendered'?'text':'rendered';$('.table-area',target).innerHTML=comparison(detail,mode);e.target.textContent=mode==='rendered'?'Show text diff':'Show rendered values';};
    } catch(e) {loaded=false;target.textContent=`Could not load comparison: ${e.message}. Close and reopen to retry.`;}
  });
  el.open=open;
  return el;
}
function render() {
  state=readState();
  const selection = `${state.doc}:${state.compare}`;
  const selectionChanged = selection !== lastSelection;
  lastSelection = selection;
  for (const key of Object.keys(defaults)) {const input=$(`[name="${key}"]`);if(input) input.value=state[key];}
  let pages=filteredPages();
  pages.sort((a,b)=>state.sort==='impact'?b.fields.length-a.fields.length || a.url.localeCompare(b.url):state.sort==='locale'?a.locale.localeCompare(b.locale)||a.slug.localeCompare(b.slug):a.title.localeCompare(b.title)||a.locale.localeCompare(b.locale));
  let items=pages;
  if(state.view==='groups') {
    const ids=new Set(pages.map(p=>p.id));
    items=data.groups.map(g=>({...g,matched:g.pages.filter(id=>ids.has(id))})).filter(g=>g.matched.length && (!state.kind||g.kind===state.kind)&&(!state.field||g.label===state.field)&&(!state.group||g.id===state.group));
    items.sort((a,b)=>state.sort==='name'?a.label.localeCompare(b.label)||b.matched.length-a.matched.length:state.sort==='locale'?a.locale.localeCompare(b.locale)||b.matched.length-a.matched.length:b.matched.length-a.matched.length);
  }
  const size=Number(state.size), total=Math.max(1,Math.ceil(items.length/size)), page=Math.min(Number(state.page),total);
  if(page!==Number(state.page)) {navigate({page:String(page)});return;}
  $('#count').textContent=`${items.length.toLocaleString()} ${state.view==='groups'?'change groups':'pages'}${state.view==='groups'?` across ${pages.length.toLocaleString()} matching pages`:''} · Page ${page} of ${total}`;
  $('#active-group').innerHTML=state.group?'<button id="clear-group">Clear selected change group</button>':'';
  if(state.group) $('#clear-group').onclick=()=>navigate({group:'',page:'1'});
  $('#selected').replaceChildren();
  if(state.doc) {
    const selected=data.pages.find(p=>p.id===state.doc || p.url.toLowerCase()===state.doc.toLowerCase());
    const heading=document.createElement('p');heading.textContent='Selected page';$('#selected').append(heading);
    if(selected) $('#selected').append(card(selected,true));else heading.textContent='The selected page does not exist in this dataset.';
    const close=document.createElement('button');close.textContent='Clear selection';close.onclick=()=>navigate({doc:'',compare:''});$('#selected').append(close);
  }
  if(state.doc && selectionChanged) requestAnimationFrame(()=>$('#selected').scrollIntoView({block:'start'}));
  const results=$('#results');results.replaceChildren();
  for(const item of items.slice((page-1)*size,page*size)) {
    if(state.view==='pages') {if(item.id!==state.doc) results.append(card(item));}
    else {
      const el=document.createElement('article');el.className='group';
      el.innerHTML=`<div class="group-head"><strong>${esc(item.label)}</strong>${badge(localeName(item.locale))}${badge(item.kind,item.kind)}${badge(`${item.matched.length} pages`)}</div><div class="pair"><div><small>MAIN</small>${esc(item.before??'Absent')}</div><div><small>PR #912</small>${esc(item.after??'Absent')}</div></div><button>Explore ${item.matched.length} affected pages</button>`;
      $('button',el).onclick=()=>navigate({group:item.id,view:'pages',page:'1',doc:''});results.append(el);
    }
  }
  if(!items.length) results.innerHTML='<div class="notice">No results match these filters. Try another locale, row, or status.</div>';
  $('#pagination').innerHTML=`<button id="prev" ${page===1?'disabled':''}>← Previous</button><span>${page} / ${total}</span><button id="next" ${page===total?'disabled':''}>Next →</button>`;
  $('#prev').onclick=()=>navigate({page:String(page-1)});$('#next').onclick=()=>navigate({page:String(page+1)});
}
async function init() {
  const response=await fetch('data/index.json');if(!response.ok) throw Error(`HTTP ${response.status}`);data=await response.json();
  const m=data.manifest, changed=m.count-(m.status.unchanged||0);
  $('#summary').innerHTML=[[m.locales['en-us'],'en-US pages'],[m.count-m.locales['en-us'],'localized pages'],[Object.keys(m.locales).length,'locales, excluding de'],[changed,'pages with review findings']].map(([n,label])=>`<div class="stat"><strong>${n.toLocaleString()}</strong><span>${label}</span></div>`).join('');
  for(const [locale,count] of Object.entries(m.locales)) $('[name="locale"]').add(new Option(`${localeName(locale)} (${count})`,locale));
  for(const field of [...new Set(data.pages.flatMap(p=>p.fields))].sort()) $('[name="field"]').add(new Option(field,field));
  $('#provenance').innerHTML=`<p>Main versus the head of PR #912, including its dependency #911. Both builds use identical content and upstream dependency snapshots. Only formal definition tables are compared; unrelated page differences are excluded. Content and translated-content were pinned from origin/main on ${esc(m.pins.snapshotDate)}.</p><ul>${Object.entries(m.pins.revisions).map(([repo,sha])=>`<li>${esc(repo)}: <a href="https://github.com/mdn/${repo.startsWith('rari-')?'rari':repo}/commit/${sha}"><code>${sha.slice(0,12)}</code></a></li>`).join('')}</ul><p>WebRef CSS ${esc(m.pins.packages['@webref/css'])}; mdn-data ${esc(m.pins.packages['mdn-data'])}. Whitespace in text is normalized; links and formatting are compared separately. Repeated changes are grouped within each locale. The HTML source diff retains the original table markup.</p><p>Coverage: main ${m.builds.main.pages} pages, PR ${m.builds.pr.pages} pages. Missing output: main ${m.builds.main.missing.length}, PR ${m.builds.pr.missing.length}.</p>`;
  $('#filters').onsubmit=e=>e.preventDefault();
  $('#filters').onchange=e=>{if(e.target.name) navigate({[e.target.name]:e.target.value,page:'1'});};
  let timer;
  $('[name="q"]').oninput=e=>{clearTimeout(timer);const value=e.target.value;timer=setTimeout(()=>navigate({q:value,page:'1'}),250);};
  $('#reset').onclick=()=>{clearTimeout(timer);navigate(defaults);};
  $('#copy').onclick=async()=>{try{await navigator.clipboard.writeText(location.href);$('#copy').textContent='Copied';setTimeout(()=>$('#copy').textContent='Copy view link',1500);}catch{$('#copy').textContent='Copy the URL from your address bar';}};
  window.addEventListener('hashchange',render);render();
}
init().catch(e=>{$('#summary').textContent=`Unable to load the comparison: ${e.message}. Serve this directory over HTTP and retry.`;$('#summary').classList.add('error');});
