import {auditHtmlDocument} from '../../src/html-audit.mjs';
import {auditJsonLd} from '../../src/schema-audit.mjs';
import {auditSocialMeta} from '../../src/social-audit.mjs';
import {auditClaimGrounding} from '../../src/grounding-audit.mjs';
import {auditPromptInjectionAndHiddenText} from '../../src/prompt-injection-audit.mjs';

export function lintDocumentText({languageId,text}){
 if(!text||!text.trim())return [];
 if(languageId==='html'){
  const html=text.slice(0,1000000);
  const findings=[
   ...(auditHtmlDocument({html}).findings||[]),
   ...(auditJsonLd({html}).findings||[]),
   ...(auditSocialMeta({html}).findings||[]),
   ...(auditPromptInjectionAndHiddenText({html}).findings||[])
  ];
  return findings;
 }
 if(languageId==='markdown'){
  const markdown=text.slice(0,200000);
  return [
   ...(auditClaimGrounding({markdown}).findings||[]),
   ...(auditPromptInjectionAndHiddenText({markdown}).findings||[])
  ];
 }
 return [];
}

export async function activate(context){
 const vscode=await import('vscode');
 const collection=vscode.languages.createDiagnosticCollection('reproleaf');
 context.subscriptions.push(collection);

 const refresh=doc=>{
  if(!doc||!['html','markdown'].includes(doc.languageId))return;
  const findings=lintDocumentText({languageId:doc.languageId,text:doc.getText()});
  const diagnostics=findings.map(f=>new vscode.Diagnostic(
   new vscode.Range(0,0,0,1),
   `[${f.code}] ${f.message||f.observation||f.code}`,
   f.severity==='error'?vscode.DiagnosticSeverity.Error:vscode.DiagnosticSeverity.Warning
  ));
  collection.set(doc.uri,diagnostics);
 };

 context.subscriptions.push(
  vscode.workspace.onDidOpenTextDocument(refresh),
  vscode.workspace.onDidSaveTextDocument(refresh),
  vscode.commands.registerCommand('reproleaf.auditActiveFile',()=>{
   if(vscode.window.activeTextEditor)refresh(vscode.window.activeTextEditor.document);
  })
 );
}
