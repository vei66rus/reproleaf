import {DatabaseSync} from 'node:sqlite';
import {mkdir} from 'node:fs/promises';
import path from 'node:path';

const allowedFindingStatuses=new Set(['open','in_progress','fixed','ignored']);

export async function openWorkspaceDb(projectDir=process.cwd()){
 const dir=path.join(path.resolve(projectDir),'.reproleaf');
 await mkdir(dir,{recursive:true});
 const dbPath=path.join(dir,'workspace.sqlite');
 const db=new DatabaseSync(dbPath);
 db.exec(`
  PRAGMA journal_mode = WAL;
  PRAGMA foreign_keys = ON;
  CREATE TABLE IF NOT EXISTS snapshots (
   id INTEGER PRIMARY KEY AUTOINCREMENT,
   origin TEXT NOT NULL,
   start_url TEXT NOT NULL,
   created_at TEXT NOT NULL,
   crawled_pages INTEGER NOT NULL,
   errors INTEGER NOT NULL,
   warnings INTEGER NOT NULL,
   summary_json TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS url_nodes (
   snapshot_id INTEGER NOT NULL REFERENCES snapshots(id) ON DELETE CASCADE,
   url TEXT NOT NULL,
   final_url TEXT NOT NULL,
   depth INTEGER NOT NULL,
   click_depth INTEGER,
   status INTEGER NOT NULL,
   ttfb_ms INTEGER NOT NULL,
   word_count INTEGER NOT NULL,
   title TEXT NOT NULL,
   h1 TEXT NOT NULL,
   canonical TEXT NOT NULL,
   pagerank REAL NOT NULL DEFAULT 0,
   cheirank REAL NOT NULL DEFAULT 0,
   incoming_count INTEGER NOT NULL DEFAULT 0,
   outgoing_count INTEGER NOT NULL DEFAULT 0,
   PRIMARY KEY (snapshot_id, url)
  );
  CREATE TABLE IF NOT EXISTS link_edges (
   snapshot_id INTEGER NOT NULL REFERENCES snapshots(id) ON DELETE CASCADE,
   source_url TEXT NOT NULL,
   target_url TEXT NOT NULL,
   anchor TEXT NOT NULL,
   rel TEXT NOT NULL,
   is_internal INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_edges_snapshot ON link_edges(snapshot_id);
  CREATE TABLE IF NOT EXISTS findings (
   id INTEGER PRIMARY KEY AUTOINCREMENT,
   snapshot_id INTEGER NOT NULL REFERENCES snapshots(id) ON DELETE CASCADE,
   code TEXT NOT NULL,
   severity TEXT NOT NULL,
   url TEXT NOT NULL,
   message TEXT NOT NULL,
   status TEXT NOT NULL DEFAULT 'open'
  );
  CREATE INDEX IF NOT EXISTS idx_findings_snapshot ON findings(snapshot_id, status);
 `);
 return {db,dbPath};
}

export function saveCrawlSnapshot(db,crawlReport,linkEquity=null,{createdAt=new Date().toISOString()}={}){
 const summary=crawlReport.summary||{};
 const origin=String(summary.origin||'');
 const startUrl=String(summary.startUrl||'');
 const pages=Array.isArray(crawlReport.pages)?crawlReport.pages:[];
 const findings=[];
 for(const f of crawlReport.profile?.findings||[])findings.push(f);
 for(const f of crawlReport.anomalies?.findings||[])findings.push(f);
 for(const f of crawlReport.renderDiff?.findings||[])findings.push(f);

 const errorCount=findings.filter(f=>f.severity==='error').length;
 const warningCount=findings.filter(f=>f.severity==='warning').length;
 const nodeEquityMap=new Map((linkEquity?.nodes||[]).map(n=>[n.url,n]));

 const insertSnap=db.prepare('INSERT INTO snapshots (origin, start_url, created_at, crawled_pages, errors, warnings, summary_json) VALUES (?, ?, ?, ?, ?, ?, ?)');
 const insertNode=db.prepare('INSERT INTO url_nodes (snapshot_id, url, final_url, depth, click_depth, status, ttfb_ms, word_count, title, h1, canonical, pagerank, cheirank, incoming_count, outgoing_count) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)');
 const insertEdge=db.prepare('INSERT INTO link_edges (snapshot_id, source_url, target_url, anchor, rel, is_internal) VALUES (?, ?, ?, ?, ?, ?)');
 const insertFinding=db.prepare('INSERT INTO findings (snapshot_id, code, severity, url, message, status) VALUES (?, ?, ?, ?, ?, ?)');

 db.exec('BEGIN');
 try{
  const snapRes=insertSnap.run(
   origin,
   startUrl,
   createdAt,
   pages.length,
   errorCount,
   warningCount,
   JSON.stringify({summary,profile:crawlReport.profile?.summary||{},anomalies:crawlReport.anomalies?.summary||{},linkEquity:linkEquity?.summary||{}})
  );
  const snapshotId=Number(snapRes.lastInsertRowid);

  for(const page of pages){
   const eq=nodeEquityMap.get(page.url);
   insertNode.run(
    snapshotId,
    String(page.url||''),
    String(page.finalUrl||page.url||''),
    Number(page.depth??0),
    eq&&eq.clickDepth!==null?Number(eq.clickDepth):null,
    Number(page.status??0),
    Number(page.ttfbMs??0),
    Number(page.wordCount??0),
    String(page.title||''),
    Array.isArray(page.h1)?String(page.h1[0]||''):String(page.h1||''),
    String(page.canonical||''),
    Number(eq?.pageRank??0),
    Number(eq?.cheiRank??0),
    Number(eq?.inDegree??0),
    Number(eq?.outDegree??(Array.isArray(page.internalLinks)?page.internalLinks.length:0))
   );

   for(const link of page.internalLinks||[]){
    insertEdge.run(snapshotId,String(page.url||''),String(link.url||''),String(link.anchor||''),String(link.rel||''),1);
   }
   for(const ext of page.externalLinks||[]){
    insertEdge.run(snapshotId,String(page.url||''),String(ext.url||''),String(ext.anchor||''),String(ext.rel||''),0);
   }
  }

  for(const f of findings){
   const targetUrl=f.url||(Array.isArray(f.urls)?String(f.urls[0]||''):startUrl);
   insertFinding.run(snapshotId,String(f.code||'UNKNOWN'),String(f.severity||'info'),String(targetUrl),String(f.message||''),'open');
  }

  db.exec('COMMIT');
  return {snapshotId,crawledPages:pages.length,findingCount:findings.length,createdAt};
 }catch(err){
  db.exec('ROLLBACK');
  throw err;
 }
}

export function listSnapshots(db){
 return db.prepare('SELECT id, origin, start_url, created_at, crawled_pages, errors, warnings FROM snapshots ORDER BY id DESC').all();
}

export function getSnapshot(db,snapshotId){
 const snap=db.prepare('SELECT * FROM snapshots WHERE id = ?').get(Number(snapshotId));
 if(!snap)return null;
 const nodes=db.prepare('SELECT * FROM url_nodes WHERE snapshot_id = ? ORDER BY depth ASC, url ASC').all(Number(snapshotId));
 const edges=db.prepare('SELECT source_url, target_url, anchor, rel, is_internal FROM link_edges WHERE snapshot_id = ?').all(Number(snapshotId));
 const findings=db.prepare('SELECT id, code, severity, url, message, status FROM findings WHERE snapshot_id = ? ORDER BY id ASC').all(Number(snapshotId));
 return {
  ...snap,
  summary:JSON.parse(snap.summary_json),
  pages:nodes.map(n=>({
   url:n.url,
   finalUrl:n.final_url,
   depth:n.depth,
   clickDepth:n.click_depth,
   status:n.status,
   ttfbMs:n.ttfb_ms,
   wordCount:n.word_count,
   title:n.title,
   h1:n.h1?[n.h1]:[],
   canonical:n.canonical,
   pageRank:n.pagerank,
   cheiRank:n.cheirank,
   incomingCount:n.incoming_count,
   outgoingCount:n.outgoing_count
  })),
  edges,
  findings
 };
}

export function updateFindingStatus(db,findingId,status){
 if(!allowedFindingStatuses.has(status)){
  throw Error(`Invalid finding status "${status}". Allowed: open, in_progress, fixed, ignored.`);
 }
 const res=db.prepare('UPDATE findings SET status = ? WHERE id = ?').run(status,Number(findingId));
 return {updated:res.changes>0,id:Number(findingId),status};
}
