import assert from 'node:assert/strict';
import test from 'node:test';
import {changeProfile,compareProfiles,relatedPages} from '../web/locales.mjs';
const labels={'en-us':{'Initial value':'initial','Computed value':'computed'},fr:{'Valeur initiale':'initial','Valeur calculée':'computed','Ancien titre':'initial'}};
function detail(locale, before, after, oldLabel) {
  const label=locale==='fr'?'Valeur initiale':'Initial value';
  const side=(value,label)=>({tables:value===null?[]:[`<table>${value}</table>`],rows:value===null?[]:[{key:`0:${label}:1`,label,text:value.replace(/<[^>]+>/g,''),html:value}]});
  return {before:side(before,oldLabel||label),after:side(after,label)};
}
const cases=[
  {name:'localized words can have the same change types',en:detail('en-us','auto','none'),fr:detail('fr','automatique','aucun'),label:'Same rows + change types'},
  {name:'unchanged translation differs from changed English',en:detail('en-us','auto','none'),fr:detail('fr','automatique','automatique'),label:'Different changes'},
  {name:'text and markup changes are distinct',en:detail('en-us','auto','none'),fr:detail('fr','auto','<code>auto</code>'),label:'Different changes'},
  {name:'table removal is compared across locales',en:detail('en-us','auto',null),fr:detail('fr','automatique',null),label:'Table removed in both'},
  {name:'absent tables are not called matching changes',en:detail('en-us',null,null),fr:detail('fr',null,null),label:'Both have no tables'},
  {name:'missing build output is not a table removal',en:detail('en-us','auto',null),fr:{before:null,after:null},label:'Build output missing'},
  {name:'localized label changes remain visible',en:detail('en-us','auto','none'),fr:detail('fr','auto','none','Ancien titre'),label:'Different changes'},
  {name:'unknown labels require manual review',en:detail('en-us','auto','none'),fr:detail('fr','auto','none','Unknown'),label:'Needs manual comparison'},
];
for(const c of cases)test(c.name,()=>assert.equal(compareProfiles(changeProfile(c.en,'en-us',labels),changeProfile(c.fr,'fr',labels)).label,c.label));
test('page matching preserves property and descriptor scope',()=>{
  const pages=[{slug:'Web/CSS/Reference/Properties/size',locale:'en-us'},{slug:'Web/CSS/Reference/Properties/size',locale:'fr'},{slug:'Web/CSS/Reference/At-rules/@page/size',locale:'fr'}];
  assert.deepEqual(relatedPages(pages[0],pages),pages.slice(0,2));
});
