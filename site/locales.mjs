export const localeName = locale => ({'en-us':'en-US','pt-br':'pt-BR','zh-cn':'zh-CN','zh-tw':'zh-TW'}[locale] || locale);
export const fieldNames = {initial:'Initial value',appliesTo:'Applies to',inherited:'Inherited',percentages:'Percentages',computed:'Computed value',animationType:'Animation type',stacking:'Creates stacking context',relatedAtRule:'Related at-rule'};
export const kindNames = {unchanged:'Unchanged',absent:'Absent',added:'Row added',removed:'Row removed',text:'Text changed',markup:'Markup changed',label:'Label changed','text+label':'Text + label changed','markup+label':'Markup + label changed'};

export function relatedPages(page, pages) {
  return pages.filter(other => other.slug.toLowerCase() === page.slug.toLowerCase());
}

export function changeProfile(detail, locale, labels) {
  const names = labels?.[locale] || {};
  let known = true;
  const rows = side => {
    const result = new Map(), counts = new Map();
    for (const row of side?.rows || []) {
      const field = names[row.label];
      if (!field) known = false;
      const base = `${row.key.split(':')[0]}:${field || row.label}`;
      const occurrence = (counts.get(base) || 0) + 1;
      counts.set(base, occurrence);
      result.set(`${base}:${occurrence}`, {...row,field:field || row.label});
    }
    return result;
  };
  const before = rows(detail.before), after = rows(detail.after), changes = new Map();
  for (const key of new Set([...before.keys(),...after.keys()])) {
    const a=before.get(key), b=after.get(key);
    let kind=!a?'added':!b?'removed':a.text!==b.text?'text':a.html!==b.html?'markup':'unchanged';
    if(a && b && a.label!==b.label) kind=kind==='unchanged'?'label':`${kind}+label`;
    changes.set(key,{field:(a || b).field,kind});
  }
  const a=detail.before?.tables.length || 0, b=detail.after?.tables.length || 0;
  const outcome=!detail.before || !detail.after?'missing-output':!a&&!b?'no-tables':!a?'added-table':!b?'removed-table':'tables';
  const wrapperOnly=outcome==='tables' && [...changes.values()].every(row=>row.kind==='unchanged') && JSON.stringify(detail.before.tables)!==JSON.stringify(detail.after.tables);
  return {changes,known,outcome,wrapperOnly,counts:[a,b]};
}

export function compareProfiles(reference, locale) {
  const rows=[];
  for(const key of new Set([...reference.changes.keys(),...locale.changes.keys()])) {
    const a=reference.changes.get(key), b=locale.changes.get(key);
    const left=a?.kind || 'absent', right=b?.kind || 'absent';
    if(left==='unchanged' && right==='unchanged') continue;
    rows.push({field:(a || b).field,reference:left,locale:right,same:left===right});
  }
  const same=reference.outcome===locale.outcome && JSON.stringify(reference.counts)===JSON.stringify(locale.counts) && rows.every(row=>row.same) && reference.wrapperOnly===locale.wrapperOnly;
  let label;
  if(!reference.known || !locale.known) label='Needs manual comparison';
  else if(reference.outcome==='missing-output' || locale.outcome==='missing-output') label='Build output missing';
  else if(!same) label='Different changes';
  else if(reference.outcome==='no-tables') label='Both have no tables';
  else if(reference.outcome==='added-table') label='Table added in both';
  else if(reference.outcome==='removed-table') label='Table removed in both';
  else if(reference.wrapperOnly) label='Table markup changed in both';
  else if(!rows.length) label='Both unchanged';
  else label='Same rows + change types';
  return {label,rows,same:same && reference.known && locale.known};
}
