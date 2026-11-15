import {auditHtmlDocument} from '../../src/html-audit.mjs';
import {auditJsonLd} from '../../src/schema-audit.mjs';
import {auditSocialMeta} from '../../src/social-audit.mjs';
import {auditDomPerfHints} from '../../src/dom-perf-audit.mjs';
import {auditEeatSignals} from '../../src/eeat-audit.mjs';
import {auditClaimGrounding} from '../../src/grounding-audit.mjs';
import {auditAnswerFirst} from '../../src/answer-first-audit.mjs';
import {auditRagChunks} from '../../src/rag-chunk-audit.mjs';
import {auditEditorialClarity} from '../../src/editorial-clarity-audit.mjs';
import {auditPromptInjectionAndHiddenText} from '../../src/prompt-injection-audit.mjs';
import {auditLlmsTxt} from '../../src/llms-txt.mjs';

function isLlmsFile(fileName=''){
 return /(?:^|[\\/])llms(?:-full)?\.txt$/i.test(String(fileName||''));
}

export function lintDocumentText({languageId,text,fileName=''}){
 if(!text||!text.trim())return [];
 if(languageId==='llms-txt'||isLlmsFile(fileName)){
  const clipped=text.slice(0,500000);
  return auditLlmsTxt({content:clipped}).findings||[];
 }
 if(languageId==='html'){
  const html=text.slice(0,1000000);
  return [
   ...(auditHtmlDocument({html}).findings||[]),
   ...(auditJsonLd({html}).findings||[]),
   ...(auditSocialMeta({html}).findings||[]),
   ...(auditDomPerfHints({html}).findings||[]),
   ...(auditEeatSignals({html}).findings||[]),
   ...(auditPromptInjectionAndHiddenText({html}).findings||[])
  ];
 }
 if(languageId==='markdown'){
  const markdown=text.slice(0,200000);
  return [
   ...(auditClaimGrounding({markdown}).findings||[]),
   ...(auditAnswerFirst({markdown}).findings||[]),
   ...(auditRagChunks({text:markdown}).findings||[]),
   ...(auditEditorialClarity({markdown}).findings||[]),
   ...(auditPromptInjectionAndHiddenText({markdown}).findings||[])
  ];
 }
 return [];
}

export function locateFindingLine(text,finding){
 const lines=String(text||'').split(/\r?\n/);
 const code=String(finding?.code||'');
 const needles=[];
 if(/h1/i.test(code))needles.push(/<h1\b|^#\s/i);
 if(/title/i.test(code))needles.push(/<title\b|<head\b/i);
 if(/description/i.test(code))needles.push(/<meta\s[^>]*description|<head\b/i);
 if(/canonical/i.test(code))needles.push(/<link\s[^>]*canonical|<head\b/i);
 if(/DOM_IMAGE|ALT/i.test(code))needles.push(/<img\b/i);
 if(/SCRIPT|JSONLD|SCHEMA/i.test(code))needles.push(/application\/ld\+json|<head\b/i);
 if(finding?.heading)needles.push(new RegExp(String(finding.heading).replace(/[.*+?^${}()|[\]\\]/g,'\\$&'),'i'));
 if(finding?.excerpt)needles.push(new RegExp(String(finding.excerpt).slice(0,24).replace(/[.*+?^${}()|[\]\\]/g,'\\$&'),'i'));

 for(const rx of needles){
  for(let i=0;i<lines.length;i+=1){
   if(rx.test(lines[i]))return i;
  }
 }
 return 0;
}

export function buildQuickFixSuggestions({languageId,text,findings}){
 if(languageId!=='html'||!text)return [];
 const codes=new Set((findings||[]).map(f=>f.code));
 const lines=text.split(/\r?\n/);
 const headCloseLine=lines.findIndex(l=>/<\/head>/i.test(l));
 const insertLine=headCloseLine>=0?headCloseLine:0;
 const insertChar=headCloseLine>=0?Math.max(0,lines[headCloseLine].search(/<\/head>/i)):0;
 const actions=[];

 const needsTitle=codes.has('HTML_MISSING_TITLE')||codes.has('title-not-provided');
 const needsDesc=codes.has('HTML_MISSING_META_DESCRIPTION')||codes.has('description-not-provided');
 const needsCanonical=codes.has('HTML_MISSING_CANONICAL')||codes.has('canonical-missing');

 if(needsTitle||needsDesc||needsCanonical){
  const tags=[];
  if(needsTitle)tags.push('  <title>[REPLACE_PAGE_TITLE]</title>');
  if(needsDesc)tags.push('  <meta name="description" content="[REPLACE_CONCISE_META_DESCRIPTION]">');
  if(needsCanonical)tags.push('  <link rel="canonical" href="https://example.com/canonical-path/">');
  actions.push({
   id:'reproleaf-insert-head-meta',
   title:'Reproleaf: Insert missing SEO <head> scaffold',
   line:insertLine,
   character:insertChar,
   replacement:`${tags.join('\n')}\n`
  });
 }

 const needsJsonLd=codes.has('SCHEMA_MISSING_JSONLD')||codes.has('EEAT_INCOMPLETE_ENTITY_SCHEMA');
 if(needsJsonLd){
  const schemaBlock=[
   '  <script type="application/ld+json">',
   '  {',
   '    "@context": "https://schema.org",',
   '    "@type": "Article",',
   '    "headline": "[REPLACE_HEADLINE]",',
   '    "author": { "@type": "Person", "name": "[REPLACE_AUTHOR_NAME]" },',
   '    "publisher": { "@type": "Organization", "name": "[REPLACE_ORG_NAME]" }',
   '  }',
   '  </script>',
   ''
  ].join('\n');
  actions.push({
   id:'reproleaf-insert-jsonld',
   title:'Reproleaf: Insert Schema.org Article + Person JSON-LD template',
   line:insertLine,
   character:insertChar,
   replacement:schemaBlock
  });
 }

 return actions;
}

export async function activate(context){
 const vscode=await import('vscode');
 const collection=vscode.languages.createDiagnosticCollection('reproleaf');
 context.subscriptions.push(collection);
 const latestFindingsByUri=new Map();

 const refresh=doc=>{
  if(!doc)return;
  const supported=['html','markdown','llms-txt'].includes(doc.languageId)||isLlmsFile(doc.fileName);
  if(!supported){
   collection.delete(doc.uri);
   latestFindingsByUri.delete(doc.uri.toString());
   return;
  }
  const text=doc.getText();
  const findings=lintDocumentText({languageId:doc.languageId,text,fileName:doc.fileName});
  latestFindingsByUri.set(doc.uri.toString(),findings);
  const diagnostics=findings.map(f=>{
   const line=locateFindingLine(text,f);
   return new vscode.Diagnostic(
    new vscode.Range(line,0,line,80),
    `[${f.code}] ${f.message||f.observation||f.code}`,
    f.severity==='error'?vscode.DiagnosticSeverity.Error:vscode.DiagnosticSeverity.Warning
   );
  });
  collection.set(doc.uri,diagnostics);
 };

 const codeActionProvider={
  provideCodeActions(document){
   const findings=latestFindingsByUri.get(document.uri.toString())||lintDocumentText({languageId:document.languageId,text:document.getText(),fileName:document.fileName});
   const suggestions=buildQuickFixSuggestions({languageId:document.languageId,text:document.getText(),findings});
   return suggestions.map(s=>{
    const action=new vscode.CodeAction(s.title,vscode.CodeActionKind.QuickFix);
    const edit=new vscode.WorkspaceEdit();
    edit.insert(document.uri,new vscode.Position(s.line,s.character),s.replacement);
    action.edit=edit;
    return action;
   });
  }
 };

 context.subscriptions.push(
  vscode.languages.registerCodeActionsProvider([{language:'html'}],codeActionProvider,{providedCodeActionKinds:[vscode.CodeActionKind.QuickFix]}),
  vscode.workspace.onDidOpenTextDocument(refresh),
  vscode.workspace.onDidChangeTextDocument(e=>refresh(e.document)),
  vscode.workspace.onDidSaveTextDocument(refresh),
  vscode.commands.registerCommand('reproleaf.auditActiveFile',()=>{
   if(vscode.window.activeTextEditor)refresh(vscode.window.activeTextEditor.document);
  })
 );
}
