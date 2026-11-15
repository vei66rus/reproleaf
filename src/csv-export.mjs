export function csvCell(value){
 let text=typeof value==='object'&&value!==null?JSON.stringify(value):String(value??'');
 if(/^(?:\s*[=+\-@]|\s*[\u0000-\u001f\u007f])/.test(text))text="'"+text;
 return '"'+text.replaceAll('"','""')+'"';
}

export function exportReportCsv({report,kind='findings',projectName='reproleaf',origin=''}){
 if(!report||typeof report!=='object')throw Error('Report object is required for CSV export');
 if(!['findings','pages','headings'].includes(kind))throw Error('Invalid CSV export kind');
 const exportedAt=new Date().toISOString();
 let columns;
 let rows;
 if(kind==='findings'){
  columns=['project','origin','exported_at','report_kind','code','severity','record','observation','why','suggestion','verify_hint','message'];
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
   f.message||''
  ]);
 }else if(kind==='pages'){
  columns=['project','origin','exported_at','url','title','incoming_pages','outgoing_internal_targets','cluster'];
  rows=(report.pages||[]).map(p=>[
   projectName,
   origin,
   exportedAt,
   p.url||'',
   p.title||'',
   p.incomingPages??'',
   p.outgoingInternalTargets??'',
   p.cluster||''
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
