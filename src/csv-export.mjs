export function csvCell(value){
 let text=typeof value==='object'&&value!==null?JSON.stringify(value):String(value??'');
 if(/^(?:\s*[=+\-@]|\s*[\u0000-\u001f\u007f])/.test(text))text="'"+text;
 return '"'+text.replaceAll('"','""')+'"';
}

export function exportReportCsv({report,kind='findings',projectName='reproleaf',origin=''}){
 if(!report||typeof report!=='object')throw Error('Report object is required for CSV export');
 if(!['findings','pages','headings'].includes(kind))throw Error('Invalid CSV export kind');
 const exportedAt=new Date().toISOString();
 const inventoryMetadata=Boolean(report.inventoryObservations);
 const inventoryHtmlFacts=Boolean(report.inventoryObservations?.coverage?.htmlFactsProvidedPages);
 let columns;
 let rows;
 if(kind==='findings'){
  columns=['project','origin','exported_at','report_kind','code','severity','record','observation','why','suggestion','verify_hint','message',...(inventoryMetadata?['related_records','affected_count']:[])];
  rows=(report.findings||[]).map(f=>[
   projectName,
   origin,
   exportedAt,
   report.kind||'editorial-review',
   f.code||'',
   f.severity||'',
   f.record||'',
   f.observation||'',
   f.why||'',
   f.suggestion||'',
   f.verifyHint||'',
   f.message||'',
   ...(inventoryMetadata?[f.relatedRecords||'',f.affectedCount??'']:[])
  ]);
 }else if(kind==='pages'){
  columns=['project','origin','exported_at','url','title','incoming_pages','outgoing_internal_targets','cluster',...(inventoryMetadata?['issue_codes','metadata_source_url','canonical_state','canonical_url','observed_http_status','observed_meta_noindex','metadata_observed_at']:[]),...(inventoryHtmlFacts?['html_facts_status','html_facts_unknown_reason','observed_title_present','observed_description','observed_h1_count','observed_canonical_count']:[])];
  rows=(report.pages||[]).map(p=>[
   projectName,
   origin,
   exportedAt,
   p.url||'',
   p.title||'',
   p.incomingPages??'',
   p.outgoingInternalTargets??'',
   p.cluster||'',
   ...(inventoryMetadata?[p.issueCodes||'',
   p.metadataObservations?.sourceUrl??'',
   p.metadataObservations?.canonicalState??'',
   p.metadataObservations?.canonicalUrl??'',
   p.metadataObservations?.httpStatus??'',
   p.metadataObservations?.robotsNoindex??'',
   p.metadataObservations?.observedAt??'']:[]),
   ...(inventoryHtmlFacts?[p.metadataObservations?.htmlFacts?.status??'not-provided',p.metadataObservations?.htmlFacts?.reason??'',p.metadataObservations?.htmlFacts?.titlePresent??'',p.metadataObservations?.htmlFacts?.description??'',p.metadataObservations?.htmlFacts?.h1Count??'',p.metadataObservations?.htmlFacts?.canonicalCount??'']:[])
  ]);
 }else{
  columns=['project','origin','exported_at','url','level','text','ordinal'];
  const list=report.headings||report.observations?.headings||[];
  rows=list.map((h,idx)=>[
   projectName,
   origin,
   exportedAt,
   report.url||'',
   h.level??'',
   h.text||'',
   idx+1
  ]);
 }
 const csv='\uFEFF'+[columns,...rows].map(row=>row.map(csvCell).join(';')).join('\r\n')+'\r\n';
 return {
  filename:`${String(projectName||'reproleaf').replace(/[^a-z0-9_-]+/gi,'-')}-${kind}.csv`,
  csv,
  rowCount:rows.length,
  kind,
  encoding:'utf-8',
  delimiter:';'
 };
}
