// Statuses describe supplied evidence. They are not a ranking or traffic score.
export function articleDiagnostics(packet,{headings,links,images,query,findings,visibleText}){
 const checks=[];
 const add=(code,status,value)=>checks.push({code,status,value});
 const has=code=>findings.some(f=>f.code===code);
 add('title',packet.article.title.trim()?'good':'attention',[...packet.article.title].length);
 add('description',packet.article.description.trim()?'good':'attention',[...packet.article.description].length);
 add('h1',has('h1-count')?'problem':packet.article.h1Mode==='renderer'&&!packet.article.renderedH1?.trim()?'unchecked':'good',packet.article.h1Mode);
 add('hierarchy',!headings.length?'unchecked':has('heading-level-gap')?'attention':'good',headings.length);
 for(const [code,key]of [['query-title','title'],['query-h1','h1'],['query-body','body']])add(code,query[key]===null?'unchecked':query[key]>0?'good':'attention',query[key]);
 const internal=links.filter(h=>h.startsWith('/')&&!h.startsWith('//'));
 add('internal-links',links.length?'good':'attention',links.length);
 add('inventory',packet.sitePaths===undefined?'unchecked':has('unknown-internal-target')?'attention':internal.length?'good':'unchecked',packet.sitePaths?.length??null);
 add('link-safety',!links.length?'unchecked':has('unsafe-link-scheme')?'problem':'good',links.length);
 add('images',!images.length?'unchecked':images.some(i=>!i.text?.trim())?'attention':'good',images.filter(i=>!i.text?.trim()).length);
 add('sources',!packet.claims.length?'unchecked':findings.some(f=>['unbound-fact','unknown-source','missing-calculation-evidence','duplicate-source-id','duplicate-claim-id'].includes(f.code))?'problem':findings.some(f=>['unreviewed-source','observation-needs-review','claim-not-in-draft'].includes(f.code))?'attention':'good',packet.sources.length);
 add('terminology',!packet.glossary.length?'unchecked':has('glossary-variant')?'attention':'good',packet.glossary.length);
 add('reader-task',packet.readerTask.trim()?'good':'unchecked',packet.readerTask.trim()?1:0);
 return {checks,metrics:{words:(visibleText.match(/[\p{L}\p{N}]+/gu)||[]).length,headings:headings.length,links:links.length,images:images.length},summary:Object.fromEntries(['good','attention','problem','unchecked'].map(status=>[status,checks.filter(c=>c.status===status).length]))};
}
